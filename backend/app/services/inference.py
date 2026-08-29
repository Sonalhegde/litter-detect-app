from __future__ import annotations

import asyncio
import ast
import hashlib
import threading
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import cv2
import numpy as np
from PIL import Image

from starlette.concurrency import run_in_threadpool

from app.config import Settings
from app.schemas.detection import BoundingBox, Detection, DetectionResponse, DetectionSummary, ImageSize, RuntimeConfiguration, SceneRelevance
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
    """Loads only configured, integrity-checked local model artifacts; user input selects an allowlisted ID."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.specs: dict[ModelId, ModelSpec] = {
            "yolo26n": ModelSpec("yolo26n", "YOLO26n", settings.yolo26n_model_path, "Lightweight edge baseline; checkpoint not yet installed"),
            "yolo26s": ModelSpec("yolo26s", "YOLO26s", settings.yolo26s_model_path, "Primary trusted marine-litter artifact"),
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
                detail = "Trusted deployment artifact could not be loaded."
            elif spec.id == "yolo26s" and spec.path.suffix.lower() == ".onnx":
                detail = "Trusted derived ONNX artifact from the supplied YOLO26s checkpoint; checksum verified."
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
                    if spec.path.suffix.lower() != ".onnx":
                        raise ValueError("The lightweight deployment runtime only accepts the verified ONNX artifact.")
                    import onnxruntime as ort

                    session_options = ort.SessionOptions()
                    session_options.intra_op_num_threads = 1
                    session_options.inter_op_num_threads = 1
                    session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
                    self._models[model_id] = ort.InferenceSession(str(spec.path), sess_options=session_options, providers=["CPUExecutionProvider"])
                except Exception as exc:
                    self._load_errors[model_id] = type(exc).__name__
                    raise ModelUnavailable("The selected trusted model could not be loaded.") from exc
        return spec, self._models[model_id]


def _class_names_from_metadata(model: Any) -> dict[int, str]:
    """Read Ultralytics ONNX metadata defensively and retain the confirmed fallback class label."""
    try:
        raw_names = model.get_modelmeta().custom_metadata_map.get("names", "")
        parsed = ast.literal_eval(raw_names) if raw_names else {}
        if isinstance(parsed, dict):
            names = {int(key): str(value) for key, value in parsed.items() if isinstance(value, str)}
            if names:
                return names
    except (AttributeError, SyntaxError, ValueError, TypeError):
        pass
    return {0: "litter"}


def _prepare_image_tensor(image: Image.Image, image_size: int) -> np.ndarray:
    """Apply the fixed square OpenCV letterbox transform used by the original predictor."""
    source = np.asarray(image.convert("RGB"), dtype=np.uint8)
    height, width = source.shape[:2]
    gain = min(image_size / height, image_size / width)
    resized_width, resized_height = round(width * gain), round(height * gain)
    source_bgr = cv2.cvtColor(source, cv2.COLOR_RGB2BGR)
    resized = cv2.resize(source_bgr, (resized_width, resized_height), interpolation=cv2.INTER_LINEAR)
    left = round((image_size - resized_width) / 2 - 0.1)
    top = round((image_size - resized_height) / 2 - 0.1)
    canvas = np.full((image_size, image_size, 3), 114, dtype=np.uint8)
    canvas[top : top + resized_height, left : left + resized_width] = resized
    model_rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB)
    return np.ascontiguousarray(model_rgb.transpose((2, 0, 1))[None], dtype=np.float32) / 255.0


def _xywh_to_xyxy(boxes: np.ndarray) -> np.ndarray:
    converted = np.empty_like(boxes)
    converted[:, 0] = boxes[:, 0] - boxes[:, 2] / 2
    converted[:, 1] = boxes[:, 1] - boxes[:, 3] / 2
    converted[:, 2] = boxes[:, 0] + boxes[:, 2] / 2
    converted[:, 3] = boxes[:, 1] + boxes[:, 3] / 2
    return converted


def _nms_indices(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float, max_detections: int = 300) -> np.ndarray:
    """Perform deterministic class-aware NMS for the single-class YOLO26s model without importing PyTorch."""
    order = np.argsort(-scores, kind="stable")
    selected: list[int] = []
    areas = np.maximum(0.0, boxes[:, 2] - boxes[:, 0]) * np.maximum(0.0, boxes[:, 3] - boxes[:, 1])
    while order.size and len(selected) < max_detections:
        current = int(order[0])
        selected.append(current)
        remaining = order[1:]
        if not remaining.size:
            break
        left = np.maximum(boxes[current, 0], boxes[remaining, 0])
        top = np.maximum(boxes[current, 1], boxes[remaining, 1])
        right = np.minimum(boxes[current, 2], boxes[remaining, 2])
        bottom = np.minimum(boxes[current, 3], boxes[remaining, 3])
        intersection = np.maximum(0.0, right - left) * np.maximum(0.0, bottom - top)
        union = areas[current] + areas[remaining] - intersection
        iou = np.divide(intersection, union, out=np.zeros_like(intersection), where=union > 0)
        order = remaining[iou <= iou_threshold]
    return np.asarray(selected, dtype=np.int64)


def _postprocess_yolo26_output(raw_output: np.ndarray, image_width: int, image_height: int, image_size: int, confidence_threshold: float, iou_threshold: float) -> list[tuple[int, float, np.ndarray]]:
    """Convert the verified YOLO26s ONNX output tensor into original-image detections."""
    if raw_output.ndim != 3 or raw_output.shape[0] != 1 or raw_output.shape[1] < 5:
        raise ValueError("Unexpected trusted ONNX output shape.")
    candidates = raw_output[0].transpose(1, 0)
    class_scores = candidates[:, 4:]
    class_ids = class_scores.argmax(axis=1)
    confidence = class_scores[np.arange(class_scores.shape[0]), class_ids]
    keep = confidence > confidence_threshold
    if not np.any(keep):
        return []
    boxes = _xywh_to_xyxy(candidates[keep, :4])
    confidence = confidence[keep]
    class_ids = class_ids[keep]
    selected = _nms_indices(boxes, confidence, iou_threshold)
    gain = min(image_size / image_height, image_size / image_width)
    pad_x = round((image_size - image_width * gain) / 2 - 0.1)
    pad_y = round((image_size - image_height * gain) / 2 - 0.1)
    detections: list[tuple[int, float, np.ndarray]] = []
    for index in selected:
        box = boxes[index].copy()
        box[[0, 2]] = (box[[0, 2]] - pad_x) / gain
        box[[1, 3]] = (box[[1, 3]] - pad_y) / gain
        box[[0, 2]] = np.clip(box[[0, 2]], 0, image_width)
        box[[1, 3]] = np.clip(box[[1, 3]], 0, image_height)
        detections.append((int(class_ids[index]), float(confidence[index]), box))
    return detections


class InferenceService:
    def __init__(self, settings: Settings, registry: ModelRegistry) -> None:
        self.settings = settings
        self.registry = registry
        self._semaphore = asyncio.Semaphore(settings.inference_concurrency)
        # Bandit registry is set by the app lifespan after construction;
        # accessed via property to avoid a circular import at module load time.
        self._bandit_registry: Any = None

    def set_bandit_registry(self, bandit_registry: Any) -> None:
        self._bandit_registry = bandit_registry

    async def detect(self, image: DecodedImage, model_id: ModelId) -> DetectionResponse:
        try:
            await asyncio.wait_for(self._semaphore.acquire(), timeout=0.05)
        except TimeoutError as exc:
            raise ApiProblem(429, "inference_busy", "Inference is busy. Please wait briefly and try again.", {"Retry-After": "2"}) from exc
        try:
            return await run_in_threadpool(self._detect_sync, image, model_id)
        finally:
            self._semaphore.release()

    def _effective_threshold(self, class_name: str) -> float:
        """Return the bandit's learned threshold for this class, or static fallback."""
        if self._bandit_registry is None:
            return self.settings.confidence_threshold
        try:
            return self._bandit_registry.effective_threshold(class_name)
        except Exception:
            return self.settings.confidence_threshold

    def _detect_sync(self, image: DecodedImage, model_id: ModelId) -> DetectionResponse:
        model_spec, onnx_session = self.registry.get_model(model_id)
        started_at = time.perf_counter()
        model_input_info = onnx_session.get_inputs()[0]
        input_shape = model_input_info.shape
        if len(input_shape) != 4 or input_shape[2] != input_shape[3] or not isinstance(input_shape[2], int):
            raise ValueError("The trusted ONNX model must declare a fixed square image input.")
        model_input_size = input_shape[2]
        model_input = _prepare_image_tensor(image.image, model_input_size)
        input_name = model_input_info.name
        raw_output = onnx_session.run(None, {input_name: model_input})[0]
        elapsed = time.perf_counter() - started_at
        class_names = _class_names_from_metadata(onnx_session)

        # ── Step 1: get all raw candidates above a low floor (10%) ──────────
        # We need candidates for ALL classes first so we can apply per-class
        # adaptive thresholds, then NMS within each class separately.
        raw_detections_all = _postprocess_yolo26_output(
            raw_output,
            image.width,
            image.height,
            model_input_size,
            confidence_threshold=0.10,   # low floor — bandit applies per-class gate below
            iou_threshold=self.settings.iou_threshold,
        )

        # ── Step 2: apply per-class adaptive threshold ───────────────────────
        detections: list[Detection] = []
        for index, (class_id, confidence, box) in enumerate(raw_detections_all, start=1):
            cn = class_names.get(class_id, f"class_{class_id}")
            threshold = self._effective_threshold(cn)
            if confidence < threshold:
                continue
            detections.append(Detection(
                id=len(detections) + 1,
                class_name=cn,
                confidence=round(confidence, 4),
                bbox=BoundingBox(
                    x1=round(float(box[0]), 1),
                    y1=round(float(box[1]), 1),
                    x2=round(float(box[2]), 1),
                    y2=round(float(box[3]), 1),
                ),
            ))

        counts = Counter(item.class_name for item in detections)

        # Report the effective threshold actually used (use "litter" as the
        # representative class for the single-class model; for multi-class the
        # per-class thresholds are available via /v1/bandit/status).
        representative_class = class_names.get(0, "litter")
        effective_conf_threshold = self._effective_threshold(representative_class)

        return DetectionResponse(
            model=model_spec.id,
            model_label=model_spec.label,
            detections=detections,
            summary=[DetectionSummary(class_name=class_name, count=count) for class_name, count in sorted(counts.items())],
            count=len(detections),
            inference_time_sec=round(elapsed, 3),
            image_size=ImageSize(width=image.width, height=image.height),
            runtime=RuntimeConfiguration(
                confidence_threshold=round(effective_conf_threshold, 4),
                iou_threshold=self.settings.iou_threshold,
                input_size=model_input_size,
                device="cpu",
                engine="onnxruntime",
            ),
            # Placeholder — the detection route patches this with the real value
            # from the scene checker before returning to the client.
            scene_relevance=SceneRelevance(score=1.0, verdict="pass", checker_available=False),
        )
