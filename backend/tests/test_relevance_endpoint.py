from __future__ import annotations

import io

import pytest
from PIL import Image

from conftest import image_bytes


def test_relevance_reports_unavailable_when_checker_not_installed(client) -> None:  # type: ignore[no-untyped-def]
    """Spec §13: a missing relevance model is UNAVAILABLE, never UNRELATED."""
    response = client.post("/v1/relevance", files={"file": ("beach.png", image_bytes(), "image/png")})
    assert response.status_code == 200
    body = response.json()
    assert body["input"]["valid"] is True
    assert body["input"]["width"] == 64
    assert body["input"]["height"] == 48
    assert body["relevance"]["status"] == "unavailable"
    assert body["relevance"]["score"] is None
    assert body["relevance"]["checker_available"] is False


def test_relevance_rejects_empty_file(client) -> None:  # type: ignore[no-untyped-def]
    response = client.post("/v1/relevance", files={"file": ("empty.png", b"", "image/png")})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "empty_file"


def test_relevance_rejects_unsupported_format(client) -> None:  # type: ignore[no-untyped-def]
    response = client.post("/v1/relevance", files={"file": ("notes.txt", b"not an image", "text/plain")})
    assert response.status_code == 415


def test_relevance_rejects_corrupted_image(client) -> None:  # type: ignore[no-untyped-def]
    response = client.post("/v1/relevance", files={"file": ("broken.png", b"\x89PNG\r\n\x1a\nJUNKJUNK", "image/png")})
    assert response.status_code == 415
    assert response.json()["error"]["code"] == "invalid_image"


def test_relevance_rejects_oversized_dimensions(client) -> None:  # type: ignore[no-untyped-def]
    output = io.BytesIO()
    Image.new("RGB", (400, 400)).save(output, format="PNG")
    response = client.post("/v1/relevance", files={"file": ("big.png", output.getvalue(), "image/png")})
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "image_dimensions_exceeded"


def test_relevance_is_rate_limited(client) -> None:  # type: ignore[no-untyped-def]
    """The gate shares the limiter with detection so it can't be used to bypass it."""
    for _ in range(4):
        response = client.post("/v1/relevance", files={"file": ("beach.png", image_bytes(), "image/png")})
        assert response.status_code == 200
    limited = client.post("/v1/relevance", files={"file": ("beach.png", image_bytes(), "image/png")})
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"


@pytest.mark.parametrize("verdict,status", [("pass", "relevant"), ("warn", "uncertain"), ("block", "unrelated")])
def test_relevance_maps_checker_verdicts(client, monkeypatch, verdict: str, status: str) -> None:  # type: ignore[no-untyped-def]
    """Verdict mapping: pass→relevant, warn→uncertain, block→unrelated."""
    from app.services.scene_check import SceneCheckResult

    def fake_check(self, image):  # type: ignore[no-untyped-def]
        return SceneCheckResult(relevance_score=0.8, verdict=verdict, available=True)

    monkeypatch.setattr("app.services.scene_check.SceneChecker.check", fake_check)
    response = client.post("/v1/relevance", files={"file": ("beach.png", image_bytes(), "image/png")})
    assert response.status_code == 200
    body = response.json()
    assert body["relevance"]["status"] == status
    assert body["relevance"]["score"] == 0.8
    assert body["relevance"]["checker_available"] is True
