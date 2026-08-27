from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from fastapi import HTTPException
from ultralytics import YOLO

from .settings import Settings

ModelId = Literal["yolo26s", "yolo26n"]


@dataclass(frozen=True)
class ModelSpec:
    id: ModelId
    label: str
    path: Path
    description: str


class ModelRegistry:
    """Lazy model registry that keeps compatible YOLO weights resident after first use."""

    def __init__(self, settings: Settings) -> None:
        self.specs: dict[ModelId, ModelSpec] = {
            "yolo26s": ModelSpec(
                id="yolo26s",
                label="YOLO26s",
                path=settings.yolo26s_model_path,
                description="Bundled trained litter detector",
            ),
            "yolo26n": ModelSpec(
                id="yolo26n",
                label="YOLO26n",
                path=settings.yolo26n_model_path,
                description="Optional nano litter detector",
            ),
        }
        self._models: dict[ModelId, Any] = {}
        self._load_errors: dict[ModelId, str] = {}
        self._lock = threading.Lock()

    def get_spec(self, model_id: str) -> ModelSpec:
        if model_id not in self.specs:
            raise HTTPException(status_code=422, detail={"code": "invalid_model", "message": "Select YOLO26s or YOLO26n."})
        return self.specs[model_id]  # type: ignore[index]

    def status(self) -> list[dict[str, str | bool]]:
        entries: list[dict[str, str | bool]] = []
        for spec in self.specs.values():
            present = spec.path.is_file()
            load_error = self._load_errors.get(spec.id)
            detail = spec.description
            if not present:
                detail = f"Checkpoint is not installed. Add {spec.path.name} or set its model-path environment variable."
            elif load_error:
                detail = f"Checkpoint could not load: {load_error}"
            entries.append({"id": spec.id, "label": spec.label, "available": present and not load_error, "detail": detail})
        return entries

    def get_model(self, model_id: str) -> tuple[ModelSpec, Any]:
        spec = self.get_spec(model_id)
        if not spec.path.is_file():
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "model_unavailable",
                    "message": f"{spec.label} is not available. Add {spec.path.name} to the inference service or configure its model path.",
                },
            )
        with self._lock:
            if model_id not in self._models:
                try:
                    self._models[model_id] = YOLO(str(spec.path))
                except Exception as exc:
                    self._load_errors[model_id] = str(exc)
                    raise HTTPException(
                        status_code=503,
                        detail={"code": "model_load_failed", "message": f"{spec.label} could not be loaded. Verify a compatible Ultralytics checkpoint is installed."},
                    ) from exc
        return spec, self._models[model_id]
