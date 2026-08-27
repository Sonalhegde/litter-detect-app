from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT_DIR / "models"
DEFAULT_TRUSTED_YOLO26S_SHA256 = "969bbf4733dd1486478e55cbb511569dc0bb7a75cf889597274b02b336b3ceb2"
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://litter-detect-app.vercel.app",
)


def parse_origins(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return DEFAULT_ALLOWED_ORIGINS
    origins = tuple(origin.strip().rstrip("/") for origin in raw_value.split(",") if origin.strip())
    return origins or DEFAULT_ALLOWED_ORIGINS


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
    image_size: int
    confidence_threshold: float
    iou_threshold: float
    max_upload_mb: int
    max_image_width: int
    max_image_height: int
    max_image_pixels: int
    inference_concurrency: int
    rate_limit_requests: int
    rate_limit_window_seconds: int

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def max_request_bytes(self) -> int:
        """Allow multipart headers while enforcing the documented upload ceiling."""
        return self.max_upload_bytes + 128 * 1024


def load_settings() -> Settings:
    return Settings(
        allowed_origins=parse_origins(os.getenv("CORS_ALLOWED_ORIGINS")),
        yolo26s_model_path=Path(os.getenv("YOLO26S_MODEL_PATH", MODEL_DIR / "yolo26s.onnx")),
        yolo26n_model_path=Path(os.getenv("YOLO26N_MODEL_PATH", MODEL_DIR / "yolo26n.pt")),
        yolo26m_model_path=Path(os.getenv("YOLO26M_MODEL_PATH", MODEL_DIR / "yolo26m.pt")),
        yolo26l_model_path=Path(os.getenv("YOLO26L_MODEL_PATH", MODEL_DIR / "yolo26l.pt")),
        yolo26x_model_path=Path(os.getenv("YOLO26X_MODEL_PATH", MODEL_DIR / "yolo26x.pt")),
        trusted_yolo26s_sha256=os.getenv("YOLO26S_MODEL_SHA256", DEFAULT_TRUSTED_YOLO26S_SHA256).lower(),
        image_size=get_int_env("INFERENCE_IMAGE_SIZE", 960, 320, 1280),
        confidence_threshold=get_float_env("INFERENCE_CONFIDENCE_THRESHOLD", 0.25, 0.01, 0.99),
        iou_threshold=get_float_env("INFERENCE_IOU_THRESHOLD", 0.45, 0.01, 0.99),
        max_upload_mb=get_int_env("MAX_UPLOAD_MB", 10, 1, 25),
        max_image_width=get_int_env("MAX_IMAGE_WIDTH", 6000, 32, 10000),
        max_image_height=get_int_env("MAX_IMAGE_HEIGHT", 6000, 32, 10000),
        max_image_pixels=get_int_env("MAX_IMAGE_PIXELS", 20_000_000, 1024, 50_000_000),
        inference_concurrency=get_int_env("INFERENCE_CONCURRENCY", 1, 1, 2),
        rate_limit_requests=get_int_env("RATE_LIMIT_REQUESTS", 6, 1, 60),
        rate_limit_window_seconds=get_int_env("RATE_LIMIT_WINDOW_SECONDS", 60, 10, 3600),
    )
