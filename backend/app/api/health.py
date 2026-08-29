from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_registry
from app.schemas.health import HealthResponse, RootResponse
from app.services.inference import ModelRegistry


router = APIRouter(tags=["service"])


@router.get("/", response_model=RootResponse)
def root() -> RootResponse:
    return RootResponse(status="ok", service="shoreline-litter-detector-inference")


@router.get("/health", response_model=HealthResponse)
def health(registry: ModelRegistry = Depends(get_registry)) -> HealthResponse:
    models = registry.status()
    available_count = sum(1 for model in models if model.available)
    return HealthResponse(status="healthy" if available_count else "starting", models=models)
