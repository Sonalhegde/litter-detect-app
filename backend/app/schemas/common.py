from __future__ import annotations

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    code: str = Field(description="Stable machine-readable error category.")
    message: str = Field(description="Safe, user-facing explanation that contains no internal state.")


class ErrorEnvelope(BaseModel):
    success: bool = False
    error: ErrorDetail
    request_id: str | None = None
