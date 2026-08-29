from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Request, UploadFile

from app.api.dependencies import (
    get_inference_service,
    get_rate_limiter,
    get_scene_checker,
    get_settings,
)
from app.config import Settings
from app.schemas.detection import DetectionResponse, ImageSize, RuntimeConfiguration, SceneRelevance
from app.services.errors import ApiProblem
from app.services.image_processing import read_and_validate_image
from app.services.inference import InferenceService, normalize_model_id
from app.services.rate_limit import SlidingWindowRateLimiter, client_identifier
from app.services.scene_check import BLOCK_THRESHOLD, SceneChecker


router = APIRouter(tags=["detection"])


@router.post("/v1/detections", response_model=DetectionResponse)
@router.post("/api/detect/image", response_model=DetectionResponse)
async def detect_litter(
    request: Request,
    file: Annotated[UploadFile, File(description="JPEG, PNG, or WebP image up to the configured limit")],
    model: Annotated[str, Form(description="One of: yolo26n, yolo26s, yolo26m, yolo26l, yolo26x")] = "yolo26s",
    force: Annotated[bool, Form(description="Set to true to skip the scene block gate and run detection anyway")] = False,
    settings: Settings = Depends(get_settings),
    inference_service: InferenceService = Depends(get_inference_service),
    rate_limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
    scene_checker: SceneChecker = Depends(get_scene_checker),
) -> DetectionResponse:
    retry_after = rate_limiter.retry_after(client_identifier(request))
    if retry_after is not None:
        raise ApiProblem(429, "rate_limited", "Too many inference requests. Please wait before trying again.", {"Retry-After": str(retry_after)})

    model_id = normalize_model_id(model)
    image = await read_and_validate_image(file, settings)

    # ── Scene-relevance check ────────────────────────────────────────────────
    scene_result = scene_checker.check(image.image)
    scene_relevance = SceneRelevance(
        score=scene_result.relevance_score,
        verdict=scene_result.verdict,
        checker_available=scene_result.available,
    )

    # Hard block: only skip detection if score is clearly non-coastal AND
    # the client has not explicitly opted to run anyway.
    if scene_result.verdict == "block" and not force:
        # Return an empty detection response with the scene flag — do NOT raise
        # an error, since the response structure is valid (just 0 detections).
        # The frontend distinguishes this by inspecting scene_relevance.verdict.
        return DetectionResponse(
            model=model_id,
            model_label=model_id.upper(),
            detections=[],
            summary=[],
            count=0,
            inference_time_sec=0.0,
            image_size=ImageSize(width=image.width, height=image.height),
            runtime=RuntimeConfiguration(
                confidence_threshold=settings.confidence_threshold,
                iou_threshold=settings.iou_threshold,
                input_size=0,
                device="cpu",
                engine="onnxruntime",
            ),
            scene_relevance=scene_relevance,
        )

    # ── Run detection ────────────────────────────────────────────────────────
    result = await inference_service.detect(image, model_id)

    # Attach scene relevance to the result (soft-warn case included)
    return result.model_copy(update={"scene_relevance": scene_relevance})
