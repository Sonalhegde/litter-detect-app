"""Pydantic schemas for the feedback and bandit-status API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DetectionFeedback(BaseModel):
    """A user's judgement on a single detection the model showed them."""
    detection_id: int = Field(description="The detection id from the DetectionResponse")
    class_name: str = Field(description="Class name of the detection")
    confidence: float = Field(ge=0, le=1, description="Raw model confidence score")
    verdict: Literal["correct", "wrong"] = Field(
        description="'correct' = true positive confirmed; 'wrong' = false positive"
    )
    image_hash: str | None = Field(
        default=None,
        description="Optional SHA-256 hex of the image (client-computed) for correlation"
    )


class MissedDetectionReport(BaseModel):
    """A user reports a litter item the model missed entirely."""
    class_name: str = Field(description="Litter class the user identified")
    image_hash: str | None = Field(
        default=None,
        description="Optional SHA-256 hex of the image"
    )


class FeedbackRequest(BaseModel):
    """Batch of feedback events for one inference result."""
    detections: list[DetectionFeedback] = Field(default_factory=list)
    missed: list[MissedDetectionReport] = Field(default_factory=list)


class BanditClassStatus(BaseModel):
    class_name: str
    effective_threshold: float
    feedback_count: int
    trusted: bool
    last_updated: float


class BanditStatusResponse(BaseModel):
    classes: list[BanditClassStatus]


class OfflineEvalResponse(BaseModel):
    results: dict
