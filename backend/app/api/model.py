from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.dependencies import get_registry
from app.schemas.health import ModelListResponse
from app.services.inference import ModelRegistry


router = APIRouter(tags=["service"])


@router.get("/models", response_model=ModelListResponse)
@router.get("/api/model", response_model=ModelListResponse)
def models(registry: ModelRegistry = Depends(get_registry)) -> ModelListResponse:
    return ModelListResponse(models=registry.status())
