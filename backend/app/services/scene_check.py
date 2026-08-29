"""
CLIP-based zero-shot scene-relevance checker.

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
The CLIP ViT-B/32 model is loaded once at startup and reused for all requests.
open_clip is used instead of the original OpenAI clip package because it has
a smaller dependency footprint (no torchvision needed for text/image embedding).
If open_clip is not installed the checker falls back to a pass-through that
always returns score=1.0 so the rest of the pipeline is unaffected.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import numpy as np
from PIL import Image

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


@dataclass
class SceneCheckResult:
    relevance_score: float          # 0–1; higher = more coastal
    verdict: str                    # "pass" | "warn" | "block"
    available: bool                 # False when CLIP not installed


def _softmax(logits: np.ndarray) -> np.ndarray:
    shifted = logits - logits.max()
    exp = np.exp(shifted)
    return exp / exp.sum()


class SceneChecker:
    """
    Wraps an open_clip model for zero-shot scene relevance scoring.
    Gracefully degrades to a pass-through if open_clip is not installed.
    """

    def __init__(self) -> None:
        self._model: Any = None
        self._preprocess: Any = None
        self._tokenize: Any = None
        self._text_features: Any = None   # pre-encoded prompt embeddings (cached)
        self._available = False
        self._load()

    def _load(self) -> None:
        try:
            import open_clip  # type: ignore[import-untyped]
            import torch       # type: ignore[import-untyped]

            model, _, preprocess = open_clip.create_model_and_transforms(
                "ViT-B-32", pretrained="openai"
            )
            model.eval()
            tokenize = open_clip.get_tokenizer("ViT-B-32")

            # Pre-encode all prompts once at load time
            tokens = tokenize(ALL_PROMPTS)
            with torch.no_grad():
                text_features = model.encode_text(tokens)
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            self._model = model
            self._preprocess = preprocess
            self._tokenize = tokenize
            self._text_features = text_features
            self._torch = torch
            self._available = True
            logger.info("CLIP scene checker loaded (ViT-B-32, %d prompts)", len(ALL_PROMPTS))
        except ImportError:
            logger.warning(
                "open_clip not installed — scene-relevance check disabled; "
                "all images will pass through to detection."
            )
        except Exception as exc:
            logger.error("CLIP scene checker failed to load: %s", exc)

    @property
    def available(self) -> bool:
        return self._available

    def check(self, image: Image.Image) -> SceneCheckResult:
        """Score the image and return a SceneCheckResult."""
        if not self._available:
            return SceneCheckResult(relevance_score=1.0, verdict="pass", available=False)

        try:
            img_tensor = self._preprocess(image).unsqueeze(0)
            with self._torch.no_grad():
                img_features = self._model.encode_image(img_tensor)
                img_features = img_features / img_features.norm(dim=-1, keepdim=True)

            # Cosine similarity: (1, D) @ (D, N_prompts) → (N_prompts,)
            logits = (img_features @ self._text_features.T).squeeze(0).cpu().numpy()
            # Scale by 100 (standard CLIP temperature) before softmax
            probs = _softmax(logits.astype(np.float64) * 100.0)

            # Relevance = sum of positive-prompt probabilities
            relevance_score = float(probs[:N_POSITIVE].sum())

            if relevance_score >= WARN_THRESHOLD:
                verdict = "pass"
            elif relevance_score >= BLOCK_THRESHOLD:
                verdict = "warn"
            else:
                verdict = "block"

            return SceneCheckResult(
                relevance_score=round(relevance_score, 4),
                verdict=verdict,
                available=True,
            )
        except Exception as exc:
            logger.error("Scene check inference error: %s", exc)
            # On error, fail open — pass the image through to detection
            return SceneCheckResult(relevance_score=1.0, verdict="pass", available=True)
