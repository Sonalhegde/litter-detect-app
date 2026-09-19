from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT_DIR / "models"
DEFAULT_TRUSTED_YOLO26S_SHA256 = "b72f5cdef5451af4abb2d0051d9c95d0092e8a85f3cdf2fdb3d7644d6a56d6d7"
# Scene-relevance checker artifacts: int8-quantized ONNX export of CLIP ViT-B/32
# (Xenova/clip-vit-base-patch32 conversion of openai/clip-vit-base-patch32) plus
# the pre-encoded prompt embeddings for the fixed prompt set. Runs on the
# onnxruntime already in requirements.txt — no torch dependency.
DEFAULT_RELEVANCE_VISION_MODEL_NAME = "clip_vision_quantized.onnx"
DEFAULT_RELEVANCE_EMBEDDINGS_NAME = "scene_text_embeddings.npz"
DEFAULT_RELEVANCE_VISION_SHA256 = "583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299"
DEFAULT_RELEVANCE_EMBEDDINGS_SHA256 = "a770421670028ce9d29ac3ba09b9376e18ed7144e59d6636c1ddfe416827a615"
# Local dev origins only (Express+Vite on :3000, standalone Vite on :5173).
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def _cpu_count() -> int:
    return os.cpu_count() or 4


def _default_inference_concurrency() -> int:
    # One in-flight ONNX run per logical core on the local machine.
    return max(1, _cpu_count())


def parse_origins(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return DEFAULT_ALLOWED_ORIGINS
    origins = tuple(origin.strip().rstrip("/") for origin in raw_value.split(",") if origin.strip())
    return origins or DEFAULT_ALLOWED_ORIGINS


def get_bool_env(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def get_int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        parsed = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if not minimum <= parsed <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return parsed


def get_float_env(name: str, default: float, minimum: float, maximum: float) -> float:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        parsed = float(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc
    if not minimum <= parsed <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return parsed


@dataclass(frozen=True)
class Settings:
    allowed_origins: tuple[str, ...]
    yolo26s_model_path: Path
    yolo26n_model_path: Path
    yolo26m_model_path: Path
    yolo26l_model_path: Path
    yolo26x_model_path: Path
    trusted_yolo26s_sha256: str
    relevance_vision_model_path: Path
    relevance_embeddings_path: Path
    relevance_vision_sha256: str
    relevance_embeddings_sha256: str
    image_size: int
    confidence_threshold: float
    iou_threshold: float
    max_upload_mb: int
    max_image_width: int
    max_image_height: int
    max_image_pixels: int
    inference_concurrency: int
    onnx_intra_op_threads: int
    onnx_inter_op_threads: int
    rate_limit_enabled: bool
    rate_limit_requests: int
    rate_limit_window_seconds: int
    trust_proxy_headers: bool

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def max_request_bytes(self) -> int:
        """Allow multipart headers while enforcing the documented upload ceiling."""
        return self.max_upload_bytes + 128 * 1024


def load_settings() -> Settings:
    trust_proxy_raw = os.getenv("TRUST_PROXY_HEADERS")
    trust_proxy = (
        trust_proxy_raw.lower() in ("true", "1", "yes")
        if trust_proxy_raw is not None
        else False
    )
    inference_concurrency = get_int_env("INFERENCE_CONCURRENCY", _default_inference_concurrency(), 1, 64)
    # Split CPU threads across concurrent ONNX sessions (Dockerfile OMP_NUM_THREADS=1 does not apply outside containers).
    default_intra = max(1, _cpu_count() // inference_concurrency)
    return Settings(
        allowed_origins=parse_origins(os.getenv("CORS_ALLOWED_ORIGINS")),
        yolo26s_model_path=Path(os.getenv("YOLO26S_MODEL_PATH", MODEL_DIR / "yolo26s.onnx")),
        yolo26n_model_path=Path(os.getenv("YOLO26N_MODEL_PATH", MODEL_DIR / "yolo26n.onnx")),
        yolo26m_model_path=Path(os.getenv("YOLO26M_MODEL_PATH", MODEL_DIR / "yolo26m.onnx")),
        yolo26l_model_path=Path(os.getenv("YOLO26L_MODEL_PATH", MODEL_DIR / "yolo26l.onnx")),
        yolo26x_model_path=Path(os.getenv("YOLO26X_MODEL_PATH", MODEL_DIR / "yolo26x.onnx")),
        trusted_yolo26s_sha256=os.getenv("YOLO26S_MODEL_SHA256", DEFAULT_TRUSTED_YOLO26S_SHA256).lower(),
        relevance_vision_model_path=Path(os.getenv("RELEVANCE_VISION_MODEL_PATH", MODEL_DIR / DEFAULT_RELEVANCE_VISION_MODEL_NAME)),
        relevance_embeddings_path=Path(os.getenv("RELEVANCE_EMBEDDINGS_PATH", MODEL_DIR / DEFAULT_RELEVANCE_EMBEDDINGS_NAME)),
        relevance_vision_sha256=os.getenv("RELEVANCE_VISION_SHA256", DEFAULT_RELEVANCE_VISION_SHA256).lower(),
        relevance_embeddings_sha256=os.getenv("RELEVANCE_EMBEDDINGS_SHA256", DEFAULT_RELEVANCE_EMBEDDINGS_SHA256).lower(),
        # Target side length when (re)exporting YOLO ONNX; runtime uses the graph's fixed input until re-exported.
        # Bundled yolo26s.onnx is 320×320 — raising this alone does not upscale inference until a new artifact is installed.
        image_size=get_int_env("INFERENCE_IMAGE_SIZE", 1280, 320, 1280),
        confidence_threshold=get_float_env("INFERENCE_CONFIDENCE_THRESHOLD", 0.25, 0.01, 0.99),
        iou_threshold=get_float_env("INFERENCE_IOU_THRESHOLD", 0.45, 0.01, 0.99),
        # 50 MB file cap: blocks accidental multi-GB uploads while allowing high-res JPEGs from modern cameras.
        max_upload_mb=get_int_env("MAX_UPLOAD_MB", 50, 1, 512),
        # 12k px per side fits ~100 MP panoramas before pixel-count cap; still below Pillow decompression bomb defaults.
        max_image_width=get_int_env("MAX_IMAGE_WIDTH", 12_000, 32, 20_000),
        max_image_height=get_int_env("MAX_IMAGE_HEIGHT", 12_000, 32, 20_000),
        max_image_pixels=get_int_env("MAX_IMAGE_PIXELS", 120_000_000, 1024, 200_000_000),
        inference_concurrency=inference_concurrency,
        onnx_intra_op_threads=get_int_env("ONNX_INTRA_OP_THREADS", default_intra, 1, 64),
        onnx_inter_op_threads=get_int_env("ONNX_INTER_OP_THREADS", 1, 1, 64),
        # Optional rate limit for shared/multi-user setups; off by default on localhost.
        rate_limit_enabled=get_bool_env("RATE_LIMIT_ENABLED", False),
        rate_limit_requests=get_int_env("RATE_LIMIT_REQUESTS", 120, 1, 10_000),
        rate_limit_window_seconds=get_int_env("RATE_LIMIT_WINDOW_SECONDS", 60, 10, 3600),
        trust_proxy_headers=trust_proxy,
    )
