from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT_DIR / "models"
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
)


def parse_origins(raw_value: str | None) -> list[str]:
    """Parse a comma-separated public frontend origin allowlist."""
    if not raw_value:
        return list(DEFAULT_ALLOWED_ORIGINS)
    origins = [origin.strip().rstrip("/") for origin in raw_value.split(",") if origin.strip()]
    return origins or list(DEFAULT_ALLOWED_ORIGINS)


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
    allowed_origins: list[str]
    yolo26s_model_path: Path
    yolo26n_model_path: Path
    yolo26m_model_path: Path
    yolo26l_model_path: Path
    yolo26x_model_path: Path
    image_size: int
    confidence_threshold: float
    iou_threshold: float
    max_upload_mb: int

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


def load_settings() -> Settings:
    return Settings(
        allowed_origins=parse_origins(os.getenv("CORS_ALLOWED_ORIGINS")),
        yolo26s_model_path=Path(os.getenv("YOLO26S_MODEL_PATH", MODEL_DIR / "yolo26s.pt")),
        yolo26n_model_path=Path(os.getenv("YOLO26N_MODEL_PATH", MODEL_DIR / "yolo26n.pt")),
        yolo26m_model_path=Path(os.getenv("YOLO26M_MODEL_PATH", MODEL_DIR / "yolo26m.pt")),
        yolo26l_model_path=Path(os.getenv("YOLO26L_MODEL_PATH", MODEL_DIR / "yolo26l.pt")),
        yolo26x_model_path=Path(os.getenv("YOLO26X_MODEL_PATH", MODEL_DIR / "yolo26x.pt")),
        image_size=get_int_env("INFERENCE_IMAGE_SIZE", 1280, 320, 2048),
        confidence_threshold=get_float_env("INFERENCE_CONFIDENCE_THRESHOLD", 0.25, 0.01, 0.99),
        iou_threshold=get_float_env("INFERENCE_IOU_THRESHOLD", 0.45, 0.01, 0.99),
        max_upload_mb=get_int_env("MAX_UPLOAD_MB", 10, 1, 25),
    )
