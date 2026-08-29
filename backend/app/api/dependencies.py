from __future__ import annotations

from fastapi import Request

from app.config import Settings
from app.services.inference import InferenceService, ModelRegistry
from app.services.rate_limit import SlidingWindowRateLimiter
from app.services.bandit import BanditRegistry
from app.services.scene_check import SceneChecker


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_registry(request: Request) -> ModelRegistry:
    return request.app.state.model_registry


def get_inference_service(request: Request) -> InferenceService:
    return request.app.state.inference_service


def get_rate_limiter(request: Request) -> SlidingWindowRateLimiter:
    return request.app.state.rate_limiter


def get_bandit_registry(request: Request) -> BanditRegistry:
    return request.app.state.bandit_registry


def get_scene_checker(request: Request) -> SceneChecker:
    return request.app.state.scene_checker
