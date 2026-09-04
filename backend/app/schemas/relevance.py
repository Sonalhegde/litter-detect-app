from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel


class RelevanceStatus(str, Enum):
    """Anti-Analyzer outcome. Service failure maps to UNAVAILABLE, never UNRELATED."""
    RELEVANT = "relevant"
    UNCERTAIN = "uncertain"
    UNRELATED = "unrelated"
    UNAVAILABLE = "unavailable"


class InputInfo(BaseModel):
    valid: bool
    width: int
    height: int


class RelevanceInfo(BaseModel):
    status: RelevanceStatus
    # Score is only present when the relevance model actually produced one.
    score: float | None = None
    checker_available: bool


class RelevanceResponse(BaseModel):
    input: InputInfo
    relevance: RelevanceInfo


VERDICT_TO_STATUS: dict[str, RelevanceStatus] = {
    "pass": RelevanceStatus.RELEVANT,
    "warn": RelevanceStatus.UNCERTAIN,
    "block": RelevanceStatus.UNRELATED,
}
