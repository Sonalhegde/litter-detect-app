from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ModelStatus(BaseModel):
    id: Literal["yolo26n", "yolo26s", "yolo26m", "yolo26l", "yolo26x"]
    label: str
    available: bool
    detail: str
    classes: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: Literal["healthy", "degraded", "starting"]
    models: list[ModelStatus]


class ModelListResponse(BaseModel):
    models: list[ModelStatus]


class RootResponse(BaseModel):
    status: Literal["ok"]
    service: str
