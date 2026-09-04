"""Anti-Analyzer / input relevance gate.

Scores whether an uploaded image belongs to the supported marine/coastal
domain BEFORE the debris detector runs. This endpoint answers
"is this image in-domain?" — it never answers "does this image contain
debris?". A zero-detection result on a relevant beach is not an unrelated
image, and a relevance-service failure is never reported as unrelated.
"""

from __future__ import annotations

import logging
import time

from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, UploadFile

from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_rate_limiter, get_scene_checker, get_settings
from app.config import Settings
from app.schemas.relevance import (
    InputInfo,
    RelevanceInfo,
    RelevanceResponse,
    RelevanceStatus,
    VERDICT_TO_STATUS,
)
from app.services.errors import ApiProblem
from app.services.image_processing import read_and_validate_image
from app.services.rate_limit import SlidingWindowRateLimiter, client_identifier
from app.services.scene_check import SceneChecker


router = APIRouter(tags=["relevance"])
logger = logging.getLogger("bluesentinel.api")


@router.post("/v1/relevance", response_model=RelevanceResponse)
async def check_relevance(
    request: Request,
    file: Annotated[UploadFile, File(description="JPEG, PNG, or WebP image up to the configured limit")],
    settings: Settings = Depends(get_settings),
    rate_limiter: SlidingWindowRateLimiter = Depends(get_rate_limiter),
    scene_checker: SceneChecker = Depends(get_scene_checker),
) -> RelevanceResponse:
    retry_after = rate_limiter.retry_after(client_identifier(request))
    if retry_after is not None:
        raise ApiProblem(
            429,
            "rate_limited",
            "Too many requests. Please wait before trying again.",
            {"Retry-After": str(retry_after)},
        )

    started = time.perf_counter()
    # File validation / decoding / preprocessing — same defensive path as detection.
    image = await read_and_validate_image(file, settings)

    # The CLIP model is a blocking CPU workload: keep it off the event loop.
    scene_result = await run_in_threadpool(scene_checker.check, image.image)

    if scene_result.available:
        status = VERDICT_TO_STATUS[scene_result.verdict]
        score: float | None = scene_result.relevance_score
    else:
        # Relevance service unavailable ≠ unrelated. Fail explicitly, never silently.
        status = RelevanceStatus.UNAVAILABLE
        score = None

    elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
    logger.info(
        "request_id=%s relevance_status=%s checker_available=%s score=%s image=%dx%d duration_ms=%s",
        getattr(request.state, "request_id", None),
        status.value,
        scene_result.available,
        score,
        image.width,
        image.height,
        elapsed_ms,
    )

    return RelevanceResponse(
        input=InputInfo(valid=True, width=image.width, height=image.height),
        relevance=RelevanceInfo(status=status, score=score, checker_available=scene_result.available),
    )
