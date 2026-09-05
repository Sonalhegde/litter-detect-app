"""
CLIP-based zero-shot scene-relevance checker (ONNX Runtime backend).

Runs before the litter detector and decides whether the uploaded image
plausibly shows a coastal/shoreline scene.

Decision logic
--------------
- Compute softmax probabilities over a small fixed prompt set.
- Sum the positive-prompt probabilities → relevance_score ∈ [0, 1].
- score ≥ WARN_THRESHOLD  → pass (run detection normally)
- score ∈ [BLOCK_THRESHOLD, WARN_THRESHOLD) → soft warning (run detection but flag)
- score < BLOCK_THRESHOLD → hard block (do not run detection)

Thresholds were calibrated empirically on a small test set (see tests/test_scene_check.py).
They are intentionally conservative: we would rather show a soft warning on a valid
edge case (night photo, close-up litter with no visible horizon) than hard-block real
coastal images.

Model loading
-------------
The vision tower of CLIP ViT-B/32 runs as an int8-quantized ONNX export
(``clip_vision_quantized.onnx``) on the onnxruntime already required by the
detector — no torch/open_clip dependency, so the checker fits Render Free's
memory budget. The text tower is not needed at runtime: the prompt embeddings
for the fixed prompt set are pre-encoded once at build time and shipped as
``scene_text_embeddings.npz``.

Both artifacts are SHA-256 pinned (see app.config) and verified at load time.
Loading is lazy: the session is created on the first relevance request so the
idle service stays light. If either artifact is missing, fails its integrity
check, or does not match the prompt set, the checker falls back to a
pass-through that always returns score=1.0 so the rest of the pipeline is
unaffected.
"""

from __future__ import annotations

import hashlib
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from app.config import (
    DEFAULT_RELEVANCE_EMBEDDINGS_NAME,
    DEFAULT_RELEVANCE_EMBEDDINGS_SHA256,
    DEFAULT_RELEVANCE_VISION_MODEL_NAME,
    DEFAULT_RELEVANCE_VISION_SHA256,
    MODEL_DIR,
    Settings,
    load_settings,
)

logger = logging.getLogger("bluesentinel.api")

# ── Decision thresholds (calibrated on test set) ──────────────────────────────
WARN_THRESHOLD  = 0.35   # below this → show soft warning but still run
BLOCK_THRESHOLD = 0.15   # below this → hard block, don't run detection

# ── Prompt sets ───────────────────────────────────────────────────────────────
POSITIVE_PROMPTS = [
    "a photo of a beach or coastline",
    "a photo of a shoreline with sand and water",
    "an aerial or ground-level photo of a coastal area",
    "a photo of a sandy beach with ocean waves",
]

NEGATIVE_PROMPTS = [
    "a photo of a person or selfie",
    "a screenshot of a phone or computer screen",
    "a photo of an indoor room or interior",
    "a photo of food or a meal",
    "a photo of a document or text",
    "a close-up photo of an unrelated object",
    "a photo of a city street or urban environment",
]

ALL_PROMPTS = POSITIVE_PROMPTS + NEGATIVE_PROMPTS
N_POSITIVE = len(POSITIVE_PROMPTS)

# ── CLIP ViT-B/32 preprocessing (matches the model's training transform) ──────
_CLIP_SIZE = 224
_CLIP_MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
_CLIP_STD = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)


@dataclass
class SceneCheckResult:
    relevance_score: float          # 0–1; higher = more coastal
    verdict: str                    # "pass" | "warn" | "block"
    available: bool                 # False when the relevance model is not loadable


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max()
    exp = np.exp(shifted)
    return exp / exp.sum()


def _sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as checkpoint:
        for block in iter(lambda: checkpoint.read(1024 * 1024), b""):
            hasher.update(block)
    return hasher.hexdigest()


def _preprocess_image(image: Image.Image) -> np.ndarray:
    """CLIP ViT-B/32 transform: resize shortest side to 224 (BICUBIC),
    center-crop 224×224, normalize with the CLIP mean/std, NCHW float32."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    scale = _CLIP_SIZE / min(width, height)
    resized_w, resized_h = round(width * scale), round(height * scale)
    resized = rgb.resize((resized_w, resized_h), Image.BICUBIC)
    left = (resized_w - _CLIP_SIZE) // 2
    top = (resized_h - _CLIP_SIZE) // 2
    cropped = resized.crop((left, top, left + _CLIP_SIZE, top + _CLIP_SIZE))

    pixels = np.asarray(cropped, dtype=np.float32) * (1.0 / 255.0)
    pixels = (pixels - _CLIP_MEAN) / _CLIP_STD
    return pixels.transpose(2, 0, 1)[None].astype(np.float32)


def score_relevance(image_features: np.ndarray, text_features: np.ndarray) -> tuple[float, str]:
    """Pure scoring step: cosine similarity against the prompt embeddings,
    softmax over the prompt set, sum of positive-prompt probabilities."""
    norm = float(np.linalg.norm(image_features))
    if norm <= 0:
        return 0.0, "block"
    img = image_features.astype(np.float64) / norm
    # Standard CLIP temperature of 100 before softmax
    logits = (img @ text_features.astype(np.float64).T) * 100.0
    probs = _softmax(logits)
    relevance_score = float(probs[:N_POSITIVE].sum())

    if relevance_score >= WARN_THRESHOLD:
        verdict = "pass"
    elif relevance_score >= BLOCK_THRESHOLD:
        verdict = "warn"
    else:
        verdict = "block"
    return relevance_score, verdict


class SceneChecker:
    """
    Zero-shot scene relevance scoring with an ONNX-quantized CLIP vision tower.
    Gracefully degrades to a pass-through if the model artifacts are missing,
    fail their SHA-256 integrity check, or do not match the prompt set.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or load_settings()
        self._session: Any = None
        self._input_name: str = ""
        self._text_features: np.ndarray | None = None
        self._available = False
        self._load_attempted = False
        self._lock = threading.Lock()

    def _load(self) -> bool:
        """Lazy, one-shot, thread-safe model load. Returns availability."""
        with self._lock:
            if self._load_attempted:
                return self._available
            self._load_attempted = True
            try:
                vision_path = self._settings.relevance_vision_model_path
                embeddings_path = self._settings.relevance_embeddings_path
                if not vision_path.is_file() or not embeddings_path.is_file():
                    logger.warning(
                        "Scene-relevance artifacts missing (%s, %s) — scene-relevance "
                        "check disabled; all images will pass through to detection.",
                        vision_path.name, embeddings_path.name,
                    )
                    return False
                if _sha256_file(vision_path) != self._settings.relevance_vision_sha256:
                    logger.error("Scene-relevance vision model failed its SHA-256 integrity check.")
                    return False
                if _sha256_file(embeddings_path) != self._settings.relevance_embeddings_sha256:
                    logger.error("Scene-relevance prompt embeddings failed their SHA-256 integrity check.")
                    return False

                with np.load(embeddings_path, allow_pickle=False) as bundle:
                    stored_prompts = [str(p) for p in bundle["prompts"].tolist()]
                    if stored_prompts != ALL_PROMPTS:
                        logger.error("Prompt embeddings do not match the configured prompt set.")
                        return False
                    n_positive = int(bundle["n_positive"])
                    if n_positive != N_POSITIVE:
                        logger.error("Prompt embeddings have an inconsistent positive count.")
                        return False
                    features = bundle["features"].astype(np.float32)
                if features.shape != (len(ALL_PROMPTS), 512):
                    logger.error("Unexpected prompt embedding shape: %s", features.shape)
                    return False

                import onnxruntime as ort

                session_options = ort.SessionOptions()
                session_options.intra_op_num_threads = 1
                session_options.inter_op_num_threads = 1
                session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                session = ort.InferenceSession(
                    str(vision_path), sess_options=session_options, providers=["CPUExecutionProvider"]
                )
                self._input_name = session.get_inputs()[0].name
                self._session = session
                self._text_features = features
                self._available = True
                logger.info(
                    "CLIP scene checker loaded (ONNX ViT-B/32 int8, %d prompts)", len(ALL_PROMPTS)
                )
            except Exception as exc:
                logger.error("CLIP scene checker failed to load: %s", exc)
                self._available = False
            return self._available

    @property
    def available(self) -> bool:
        return self._available

    def check(self, image: Image.Image) -> SceneCheckResult:
        """Score the image and return a SceneCheckResult."""
        if not self._available and not self._load_attempted:
            self._load()
        if not self._available:
            return SceneCheckResult(relevance_score=1.0, verdict="pass", available=False)

        try:
            pixels = _preprocess_image(image)
            embeds = self._session.run(None, {self._input_name: pixels})[0]
            image_features = np.asarray(embeds, dtype=np.float32).squeeze(0)
            relevance_score, verdict = score_relevance(image_features, self._text_features)
            return SceneCheckResult(
                relevance_score=round(relevance_score, 4),
                verdict=verdict,
                available=True,
            )
        except Exception as exc:
            logger.error("Scene check inference error: %s", exc)
            # On error, fail open — pass the image through to detection
            return SceneCheckResult(relevance_score=1.0, verdict="pass", available=True)
