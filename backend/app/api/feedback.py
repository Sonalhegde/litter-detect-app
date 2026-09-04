"""
Feedback endpoint — receives user verdicts on detections and feeds them
to the per-class contextual bandit.

Privacy note: this endpoint records class name, confidence score, image hash
(if provided by the client), and the user's verdict.  It does NOT receive or
store the image itself.  Image hashes are optional and client-computed; they
are used only to correlate feedback events from the same image session.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from starlette.concurrency import run_in_threadpool

from app.api.dependencies import get_bandit_registry
from app.schemas.feedback import (
    BanditStatusResponse,
    BanditClassStatus,
    FeedbackRequest,
    OfflineEvalResponse,
)
from app.services.bandit import BanditRegistry


router = APIRouter(tags=["feedback"])


@router.post("/v1/feedback", status_code=204)
async def submit_feedback(
    request: Request,
    body: FeedbackRequest,
    bandit: BanditRegistry = Depends(get_bandit_registry),
) -> None:
    """
    Accept user feedback for one or more detections from a single inference call.

    Each detection verdict drives a bandit update:
    - "correct"  → reward +1 (keep showing detections at this confidence)
    - "wrong"    → reward -1 (raise threshold or discard at this confidence)

    Each missed detection drives a separate update:
    - missed     → reward -1 on the "reject" decision at STATIC_FALLBACK confidence,
                   nudging the threshold down for that class.
    """
    def _record_all() -> None:
        for item in body.detections:
            reward = 1.0 if item.verdict == "correct" else -1.0
            accepted = item.verdict == "correct"
            bandit.record_feedback(
                class_name=item.class_name,
                confidence=item.confidence,
                accepted=accepted,
                reward=reward,
                image_hash=item.image_hash,
                detection_id=item.detection_id,
            )

        for missed in body.missed:
            # A missed detection: the system rejected (or never surfaced) a real object.
            # We record this as a reject decision with negative reward to push threshold down.
            bandit.record_feedback(
                class_name=missed.class_name,
                confidence=0.25,   # proxy: static fallback confidence
                accepted=False,
                reward=-1.0,
                image_hash=missed.image_hash,
                detection_id=None,
            )

    # SQLite writes are blocking; keep them off the asyncio event loop.
    await run_in_threadpool(_record_all)


@router.get("/v1/bandit/status", response_model=BanditStatusResponse)
async def bandit_status(
    bandit: BanditRegistry = Depends(get_bandit_registry),
) -> BanditStatusResponse:
    """
    Admin/debug view of the current effective threshold for every class.
    Useful for sanity-checking that the bandit hasn't drifted to 0 or 100%.
    """
    entries = await run_in_threadpool(bandit.status)
    return BanditStatusResponse(classes=[BanditClassStatus(**entry) for entry in entries])


@router.get("/v1/bandit/eval", response_model=OfflineEvalResponse)
async def offline_eval(
    bandit: BanditRegistry = Depends(get_bandit_registry),
) -> OfflineEvalResponse:
    """
    Offline evaluation: replay the full feedback log and compare
    bandit accept/reject decisions vs the static 25% threshold.
    Returns per-class precision and recall estimates.
    """
    return OfflineEvalResponse(results=await run_in_threadpool(bandit.offline_eval))
