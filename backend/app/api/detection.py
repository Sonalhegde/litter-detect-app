from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.api.dependencies import get_inference_service, get_rate_limiter, get_settings
from app.config import Settings
from app.schemas.detection import DetectionResponse
from app.services.errors import ApiProblem
from app.services.image_processing import read_and_validate_image
from app.services.inference import InferenceService, normalize_model_id
from app.services.rate_limit import SlidingWindowRateLimiter, client_identifier


router = APIRouter(tags=["detection"])


@router.post("/v1/detections", response_model=DetectionResponse)
@router.post("/api/detect/image", response_model=DetectionResponse)
async def detect_litter(
    request: Request,
    file: Annotated[UploadFile, File(description="JPEG, PNG, or WebP image up to the configured limit")],
    model: Annotated[str, Form(description="One of: yolo26n, yolo26s, yolo26m, yolo26l, yolo26x")] = "yolo26s",
    settings: Settings = Depends(get_settings),
    inference_service: InferenceService = Depends(get_inference_service),
    rate_limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
) -> DetectionResponse:
    retry_after = rate_limiter.retry_after(client_identifier(request))
    if retry_after is not None:
        raise ApiProblem(429, "rate_limited", "Too many inference requests. Please wait before trying again.", {"Retry-After": str(retry_after)})
    model_id = normalize_model_id(model)
    image = await read_and_validate_image(file, settings)
    return await inference_service.detect(image, model_id)
