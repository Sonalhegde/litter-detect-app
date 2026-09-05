from __future__ import annotations

import io
from dataclasses import replace
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app.config import load_settings
from app.services.scene_check import (
    ALL_PROMPTS,
    BLOCK_THRESHOLD,
    N_POSITIVE,
    WARN_THRESHOLD,
    SceneCheckResult,
    SceneChecker,
    _preprocess_image,
    score_relevance,
)

from conftest import image_bytes


def _orthonormal_prompts() -> np.ndarray:
    """11 orthonormal 512-dim rows — one basis vector per prompt."""
    basis = np.eye(512, dtype=np.float32)
    return basis[: len(ALL_PROMPTS)]


def test_preprocess_output_shape_and_range() -> None:
    image = Image.open(io.BytesIO(image_bytes())).convert("RGB")
    pixels = _preprocess_image(image)
    assert pixels.shape == (1, 3, 224, 224)
    assert pixels.dtype == np.float32
    # Normalized pixel values stay in a sane range (no wild outliers)
    assert -5.0 <= float(pixels.min()) <= float(pixels.max()) <= 5.0


def test_score_relevance_pass_on_positive_prompt_match() -> None:
    text_features = _orthonormal_prompts()
    image_features = text_features[0].copy()  # exactly the first positive prompt
    score, verdict = score_relevance(image_features, text_features)
    assert verdict == "pass"
    assert score > 0.99


def test_score_relevance_block_on_negative_prompt_match() -> None:
    text_features = _orthonormal_prompts()
    image_features = text_features[N_POSITIVE].copy()  # first negative prompt
    score, verdict = score_relevance(image_features, text_features)
    assert verdict == "block"
    assert score < 0.01


def test_score_relevance_warn_between_thresholds() -> None:
    """A mixture tilted slightly toward the negative prompt lands in the warn
    band: rel = 1/(1+e^(100*(beta-alpha))) with the chosen (alpha, beta) gives
    relevance ≈ 0.25 ∈ [BLOCK_THRESHOLD, WARN_THRESHOLD)."""
    text_features = _orthonormal_prompts()
    alpha, beta = 0.70168, 0.71267
    mixed = alpha * text_features[0] + beta * text_features[N_POSITIVE]
    mixed = mixed / np.linalg.norm(mixed)
    score, verdict = score_relevance(mixed, text_features)
    assert BLOCK_THRESHOLD <= score < WARN_THRESHOLD
    assert verdict == "warn"


def test_score_relevance_zero_vector_blocks() -> None:
    score, verdict = score_relevance(np.zeros(512, dtype=np.float32), _orthonormal_prompts())
    assert verdict == "block"
    assert score == 0.0


def test_pass_through_when_artifacts_missing(tmp_path) -> None:  # type: ignore[no-untyped-def]
    settings = replace(
        load_settings(),
        relevance_vision_model_path=tmp_path / "missing-vision.onnx",
        relevance_embeddings_path=tmp_path / "missing-embeddings.npz",
    )
    checker = SceneChecker(settings)
    image = Image.open(io.BytesIO(image_bytes())).convert("RGB")

    result = checker.check(image)
    assert isinstance(result, SceneCheckResult)
    assert result.available is False
    assert result.verdict == "pass"
    assert result.relevance_score == 1.0
    assert checker.available is False


def test_integrity_rejects_tampered_vision_model(tmp_path) -> None:  # type: ignore[no-untyped-def]
    """A corrupted/mismatched model file must disable the checker, never silently run."""
    settings = load_settings()
    tampered = tmp_path / "tampered-vision.onnx"
    tampered.write_bytes(settings.relevance_vision_model_path.read_bytes() + b"\x00")
    broken_settings = replace(settings, relevance_vision_model_path=tampered)

    checker = SceneChecker(broken_settings)
    image = Image.open(io.BytesIO(image_bytes())).convert("RGB")
    result = checker.check(image)
    assert result.available is False
    assert result.verdict == "pass"


def test_bundled_embeddings_match_configured_prompts() -> None:
    """Guards against the prompt set drifting away from the pre-encoded embeddings."""
    settings = load_settings()
    with np.load(settings.relevance_embeddings_path, allow_pickle=False) as bundle:
        assert [str(p) for p in bundle["prompts"].tolist()] == ALL_PROMPTS
        assert int(bundle["n_positive"]) == N_POSITIVE
        assert bundle["features"].shape == (len(ALL_PROMPTS), 512)


@pytest.fixture(scope="module")
def real_checker() -> SceneChecker:  # type: ignore[misc]
    """Single shared checker against the real bundled artifacts (one 89 MB load)."""
    return SceneChecker(load_settings())


def test_real_model_loads_and_scores_in_range(real_checker: SceneChecker) -> None:
    image = Image.open(io.BytesIO(image_bytes())).convert("RGB")
    result = real_checker.check(image)
    assert result.available is True
    assert real_checker.available is True
    assert 0.0 <= result.relevance_score <= 1.0
    assert result.verdict in ("pass", "warn", "block")
    # Second call reuses the loaded session (no reload) and stays consistent
    again = real_checker.check(image)
    assert again.relevance_score == result.relevance_score


def test_real_model_discriminates_coastal_from_unrelated(real_checker: SceneChecker) -> None:
    """End-to-end check with real photographs (Pexels-licensed fixtures):
    a beach must pass and a portrait must be blocked."""
    fixtures = Path(__file__).parent / "fixtures"
    beach = real_checker.check(Image.open(fixtures / "beach_test.jpg").convert("RGB"))
    portrait = real_checker.check(Image.open(fixtures / "portrait_test.jpg").convert("RGB"))

    assert beach.available is True
    assert beach.relevance_score >= WARN_THRESHOLD
    assert beach.verdict == "pass"

    assert portrait.available is True
    assert portrait.relevance_score < BLOCK_THRESHOLD
    assert portrait.verdict == "block"
    assert portrait.relevance_score < beach.relevance_score
