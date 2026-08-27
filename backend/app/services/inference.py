from __future__ import annotations

import asyncio
import hashlib
import threading
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from starlette.concurrency import run_in_threadpool

from app.config import Settings
from app.schemas.detection import BoundingBox, Detection, DetectionResponse, DetectionSummary, ImageSize, RuntimeConfiguration
from app.schemas.health import ModelStatus
from app.services.errors import ApiProblem, ModelUnavailable
from app.services.image_processing import DecodedImage


ModelId = Literal["yolo26n", "yolo26s", "yolo26m", "yolo26l", "yolo26x"]
SUPPORTED_MODEL_IDS: frozenset[str] = frozenset({"yolo26n", "yolo26s", "yolo26m", "yolo26l", "yolo26x"})


@dataclass(frozen=True)
class ModelSpec:
    id: ModelId
    label: str
    path: Path
    description: str


def normalize_model_id(model_id: str) -> ModelId:
    if model_id not in SUPPORTED_MODEL_IDS:
        raise ApiProblem(422, "invalid_model", "Select one of: YOLO26n, YOLO26s, YOLO26m, YOLO26l, or YOLO26x.")
    return model_id  # type: ignore[return-value]


class ModelRegistry:
    """Loads only configured, integrity-checked local checkpoints; user input selects an allowlisted ID."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.specs: dict[ModelId, ModelSpec] = {
            "yolo26n": ModelSpec("yolo26n", "YOLO26n", settings.yolo26n_model_path, "Lightweight edge baseline; checkpoint not yet installed"),
            "yolo26s": ModelSpec("yolo26s", "YOLO26s", settings.yolo26s_model_path, "Primary trusted marine-litter checkpoint"),
            "yolo26m": ModelSpec("yolo26m", "YOLO26m", settings.yolo26m_model_path, "Medium higher-capacity experiment; checkpoint not yet installed"),
            "yolo26l": ModelSpec("yolo26l", "YOLO26l", settings.yolo26l_model_path, "Large high-accuracy experiment; checkpoint not yet installed"),
            "yolo26x": ModelSpec("yolo26x", "YOLO26x", settings.yolo26x_model_path, "Maximum-capacity experiment; checkpoint not yet installed"),
        }
        self._models: dict[ModelId, Any] = {}
        self._load_errors: dict[ModelId, str] = {}
        self._integrity_cache: tuple[int, int, str] | None = None
        self._lock = threading.Lock()

    def _trusted_yolo26s_present(self) -> bool:
        path = self.specs["yolo26s"].path
        try:
            stat = path.stat()
        except OSError:
            return False
        cache_key = (stat.st_mtime_ns, stat.st_size)
        if self._integrity_cache and self._integrity_cache[:2] == cache_key:
            digest = self._integrity_cache[2]
        else:
            hasher = hashlib.sha256()
            with path.open("rb") as checkpoint:
                for block in iter(lambda: checkpoint.read(1024 * 1024), b""):
                    hasher.update(block)
            digest = hasher.hexdigest()
            self._integrity_cache = (*cache_key, digest)
        return digest == self.settings.trusted_yolo26s_sha256

    def status(self) -> list[ModelStatus]:
        entries: list[ModelStatus] = []
        for spec in self.specs.values():
            present = spec.path.is_file()
            detail = spec.description
            if spec.id == "yolo26s" and present and not self._trusted_yolo26s_present():
                entries.append(ModelStatus(id=spec.id, label=spec.label, available=False, detail="Trusted checkpoint integrity verification failed."))
                continue
            if not present:
                detail = f"Checkpoint is not installed. Add {spec.path.name} through the deployment configuration."
            elif spec.id in self._load_errors:
                detail = "Checkpoint could not be loaded. Verify the trusted deployment artifact."
            entries.append(ModelStatus(id=spec.id, label=spec.label, available=present and spec.id not in self._load_errors, detail=detail))
        return entries

    def get_model(self, model_id: ModelId) -> tuple[ModelSpec, Any]:
        spec = self.specs[model_id]
        if not spec.path.is_file():
            raise ModelUnavailable()
        if model_id == "yolo26s" and not self._trusted_yolo26s_present():
            raise ModelUnavailable("The configured trusted model integrity check did not pass.")
        with self._lock:
            if model_id not in self._models:
                try:
                    from ultralytics import YOLO

                    self._models[model_id] = YOLO(str(spec.path))
                except Exception as exc:
                    self._load_errors[model_id] = type(exc).__name__
                    raise ModelUnavailable("The selected trusted model could not be loaded.") from exc
        return spec, self._models[model_id]


class InferenceService:
    def __init__(self, settings: Settings, registry: ModelRegistry) -> None:
        self.settings = settings
        self.registry = registry
        self._semaphore = asyncio.Semaphore(settings.inference_concurrency)

    async def detect(self, image: DecodedImage, model_id: ModelId) -> DetectionResponse:
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=0.05)
        except TimeoutError as exc:
            raise ApiProblem(429, "inference_busy", "Inference is busy. Please wait briefly and try again.", {"Retry-After": "2"}) from exc
        try:
            return await run_in_threadpool(self._detect_sync, image, model_id)
        finally:
            self._semaphore.release()

    def _detect_sync(self, image: DecodedImage, model_id: ModelId) -> DetectionResponse:
        model_spec, yolo_model = self.registry.get_model(model_id)
        started_at = time.perf_counter()
        results = yolo_model.predict(source=image.image, imgsz=self.settings.image_size, conf=self.settings.confidence_threshold, iou=self.settings.iou_threshold, verbose=False)
        elapsed = time.perf_counter() - started_at
        result = results[0]
        detections: list[Detection] = []
        if result.boxes is not None:
            for index, box in enumerate(result.boxes, start=1):
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                class_id = int(box.cls[0])
                detections.append(Detection(id=index, class_name=str(yolo_model.names[class_id]), confidence=round(float(box.conf[0]), 4), bbox=BoundingBox(x1=round(x1, 1), y1=round(y1, 1), x2=round(x2, 1), y2=round(y2, 1))))
        counts = Counter(item.class_name for item in detections)
        device = "unknown"
        try:
            device_text = str(next(yolo_model.model.parameters()).device)
            device = "cuda" if device_text.startswith("cuda") else "mps" if device_text.startswith("mps") else "cpu"
        except (AttributeError, StopIteration, TypeError):
            pass
        return DetectionResponse(
            model=model_spec.id,
            model_label=model_spec.label,
            detections=detections,
            summary=[DetectionSummary(class_name=class_name, count=count) for class_name, count in sorted(counts.items())],
            count=len(detections),
            inference_time_sec=round(elapsed, 3),
            image_size=ImageSize(width=image.width, height=image.height),
            runtime=RuntimeConfiguration(confidence_threshold=self.settings.confidence_threshold, iou_threshold=self.settings.iou_threshold, input_size=self.settings.image_size, device=device),
        )
