"""Sentinel public inference API with safe uploads and trusted local-model loading."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import detection, feedback, health, model, relevance
from app.config import Settings, load_settings
from app.core.logging import RequestAuditMiddleware
from app.services.bandit import BanditRegistry
from app.services.errors import ApiProblem
from app.services.inference import InferenceService, ModelRegistry
from app.services.rate_limit import SlidingWindowRateLimiter
from app.services.scene_check import SceneChecker


def error_payload(request: Request, code: str, message: str) -> dict[str, object]:
    return {"success": False, "error": {"code": code, "message": message}, "request_id": getattr(request.state, "request_id", None)}


def create_app(settings: Settings | None = None) -> FastAPI:
    configured_settings = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = configured_settings
        registry = ModelRegistry(configured_settings)
        app.state.model_registry = registry
        app.state.inference_service = InferenceService(configured_settings, registry)
        app.state.rate_limiter = SlidingWindowRateLimiter(configured_settings.rate_limit_requests, configured_settings.rate_limit_window_seconds)
        # Bandit registry: loads persisted weights from SQLite on startup
        app.state.bandit_registry = BanditRegistry()
        # Scene checker: loads CLIP ViT-B/32 weights once; degrades gracefully if not installed
        app.state.scene_checker = SceneChecker()
        yield

    application = FastAPI(
        title="Sentinal Inference API",
        description="Trusted YOLO26s marine-litter inference with defensive upload validation and adaptive confidence thresholding.",
        version="4.0.0",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        max_age=600,
    )
    application.add_middleware(RequestAuditMiddleware)

    @application.middleware("http")
    async def reject_excessive_content_length(request: Request, call_next):  # type: ignore[no-untyped-def]
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > configured_settings.max_request_bytes:
                    return JSONResponse(status_code=413, content=error_payload(request, "request_too_large", f"Request bodies may be at most {configured_settings.max_upload_mb} MB."))
            except ValueError:
                return JSONResponse(status_code=400, content=error_payload(request, "invalid_content_length", "The request Content-Length is invalid."))
        return await call_next(request)

    @application.exception_handler(ApiProblem)
    async def api_problem_handler(request: Request, exc: ApiProblem) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_payload(request, exc.code, exc.message), headers=exc.headers)

    @application.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        return JSONResponse(status_code=exc.status_code, content=error_payload(request, str(detail.get("code", "request_failed")), str(detail.get("message", "The request could not be completed."))), headers=exc.headers)

    @application.exception_handler(RequestValidationError)
    async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content=error_payload(request, "invalid_request", "The request format or required fields are invalid."))

    @application.exception_handler(Exception)
    async def unexpected_error_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content=error_payload(request, "internal_error", "The inference service could not complete this request."))

    application.include_router(health.router)
    application.include_router(model.router)
    application.include_router(relevance.router)
    application.include_router(detection.router)
    application.include_router(feedback.router)
    return application


app = create_app()
