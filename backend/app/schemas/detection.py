from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class Detection(BaseModel):
    id: int
    class_name: str
    confidence: float = Field(ge=0, le=1)
    bbox: BoundingBox


class DetectionSummary(BaseModel):
    class_name: str
    count: int = Field(ge=0)


class ImageSize(BaseModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class RuntimeConfiguration(BaseModel):
    confidence_threshold: float
    iou_threshold: float
    input_size: int
    device: Literal["cpu", "cuda", "mps", "unknown"]
    engine: Literal["onnxruntime", "pytorch"]


class SceneRelevance(BaseModel):
    score: float = Field(
        ge=0, le=1,
        description="CLIP-based coastal scene relevance score (0=unrelated, 1=clearly coastal). "
                    "Always 1.0 when the scene checker is not installed.",
    )
    verdict: Literal["pass", "warn", "block"] = Field(
        description="pass=run detection normally; warn=borderline scene, results may not be "
                    "meaningful; block=image is clearly not coastal, detection was skipped.",
    )
    checker_available: bool = Field(
        description="False when open_clip is not installed; score is 1.0 and verdict is 'pass'.",
    )


class DetectionResponse(BaseModel):
    success: Literal[True] = True
    model: Literal["yolo26n", "yolo26s", "yolo26m", "yolo26l", "yolo26x"]
    model_label: str
    detections: list[Detection]
    summary: list[DetectionSummary]
    count: int = Field(ge=0)
    inference_time_sec: float = Field(ge=0)
    image_size: ImageSize
    runtime: RuntimeConfiguration
    scene_relevance: SceneRelevance = Field(
        description="Result of the pre-detection coastal scene relevance check.",
    )
