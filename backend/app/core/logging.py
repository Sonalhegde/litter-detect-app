from __future__ import annotations

import logging
import time
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


def configure_logging() -> logging.Logger:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    return logging.getLogger("bluesentinel.api")


class RequestAuditMiddleware(BaseHTTPMiddleware):
    """Attach a generated request ID and log only route-level, non-sensitive metadata."""

    def __init__(self, app):  # type: ignore[no-untyped-def]
        super().__init__(app)
        self.logger = configure_logging()

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = uuid.uuid4().hex
        request.state.request_id = request_id
        started_at = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception as exc:
            self.logger.error(
                "request_id=%s method=%s path=%s status=500 error_category=%s",
                request_id,
                request.method,
                request.url.path,
                type(exc).__name__,
            )
            raise
        elapsed_ms = round((time.perf_counter() - started_at) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        self.logger.info(
            "request_id=%s method=%s path=%s status=%s latency_ms=%s",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            elapsed_ms,
        )
        return response
