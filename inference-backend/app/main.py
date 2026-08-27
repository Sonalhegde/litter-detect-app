"""Production-ready litter detection API preserving the supplied YOLO workflow."""

from __future__ import annotations

import io
import time
from collections import Counter
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError

from .model_registry import ModelId, ModelRegistry
from .settings import load_settings

settings = load_settings()
registry = ModelRegistry(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Keep startup light and load the selected model on its first request."""
    yield


app = FastAPI(
    title="BlueSentinel AI Inference API",
    description="Upload a coastal image and receive YOLO litter detections with labels, confidence, and coordinates.",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    max_age=600,
)


def validation_error(message: str, code: str) -> HTTPException:
    return HTTPException(status_code=400, detail={"code": code, "message": message})


def normalize_model_id(model: str) -> ModelId:
    supported_models = {"yolo26n", "yolo26s", "yolo26m", "yolo26l", "yolo26x"}
    if model not in supported_models:
        raise validation_error("Select one of: YOLO26n, YOLO26s, YOLO26m, YOLO26l, or YOLO26x.", "invalid_model")
    return model  # type: ignore[return-value]


async def read_image(upload: UploadFile) -> Image.Image:
    if upload.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise validation_error("Upload a JPEG, PNG, or WebP image.", "unsupported_media_type")

    raw_image = await upload.read(settings.max_upload_bytes + 1)
    if not raw_image:
        raise validation_error("The selected image is empty.", "empty_file")
    if len(raw_image) > settings.max_upload_bytes:
        raise validation_error(f"Images must be {settings.max_upload_mb} MB or smaller.", "file_too_large")

    try:
        image = Image.open(io.BytesIO(raw_image))
        image.verify()
        return Image.open(io.BytesIO(raw_image)).convert("RGB")
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise validation_error("The selected file could not be read as an image.", "invalid_image") from exc


@app.get("/", tags=["service"])
def root() -> dict[str, str]:
    return {"status": "ok", "service": "litter-detection-inference"}


@app.get("/health", tags=["service"])
def health() -> dict[str, object]:
    models = registry.status()
    available_count = sum(1 for model in models if model["available"])
    status = "healthy" if available_count else "starting"
    return {"status": status, "models": models}


@app.get("/models", tags=["service"])
def models() -> dict[str, object]:
    """Return model availability without loading missing checkpoints."""
    return {"models": registry.status()}


@app.post("/v1/detections", tags=["detection"])
async def detect_litter(
    file: Annotated[UploadFile, File(description="JPEG, PNG, or WebP image up to 10 MB")],
    model: Annotated[str, Form(description="One of: yolo26n, yolo26s, yolo26m, yolo26l, yolo26x")] = "yolo26s",
) -> dict[str, object]:
    """Run the chosen model and return box-level data for client-side image annotation."""
    model_id = normalize_model_id(model)
    image = await read_image(file)
    model_spec, yolo_model = registry.get_model(model_id)

    started_at = time.perf_counter()
    results = yolo_model.predict(
        source=image,
        imgsz=settings.image_size,
        conf=settings.confidence_threshold,
        iou=settings.iou_threshold,
        verbose=False,
    )
    elapsed = time.perf_counter() - started_at
    result = results[0]
    detections: list[dict[str, object]] = []

    if result.boxes is not None:
        for index, box in enumerate(result.boxes, start=1):
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            class_id = int(box.cls[0])
            class_name = str(yolo_model.names[class_id])
            detections.append(
                {
                    "id": index,
                    "class_name": class_name,
                    "confidence": round(float(box.conf[0]), 4),
                    "bbox": {"x1": round(x1, 1), "y1": round(y1, 1), "x2": round(x2, 1), "y2": round(y2, 1)},
                }
            )

    counts = Counter(str(item["class_name"]) for item in detections)
    return {
        "model": model_spec.id,
        "model_label": model_spec.label,
        "detections": detections,
        "summary": [{"class_name": class_name, "count": count} for class_name, count in sorted(counts.items())],
        "count": len(detections),
        "inference_time_sec": round(elapsed, 3),
        "image_size": {"width": image.width, "height": image.height},
    }
