from __future__ import annotations

from conftest import image_bytes


def test_cors_only_allows_the_configured_frontend_origin(client) -> None:  # type: ignore[no-untyped-def]
    allowed = client.options("/v1/detections", headers={"Origin": "https://allowed.example", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    rejected = client.options("/v1/detections", headers={"Origin": "https://untrusted.example", "Access-Control-Request-Method": "POST"})
    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == "https://allowed.example"
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_rate_limit_returns_retry_after_without_starting_inference(client) -> None:  # type: ignore[no-untyped-def]
    for _ in range(4):
        response = client.post("/v1/detections", files={"file": ("test.png", image_bytes(), "image/png")}, data={"model": "yolo26s"})
        assert response.status_code == 200
    limited = client.post("/v1/detections", files={"file": ("test.png", image_bytes(), "image/png")}, data={"model": "yolo26s"})
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) > 0


def test_no_arbitrary_model_path_or_cross_origin_credentials_are_accepted(client) -> None:  # type: ignore[no-untyped-def]
    response = client.post("/v1/detections", files={"file": ("test.png", image_bytes(), "image/png")}, data={"model": "/etc/passwd"})
    assert response.status_code == 422
    preflight = client.options("/v1/detections", headers={"Origin": "https://allowed.example", "Access-Control-Request-Method": "POST"})
    assert preflight.headers.get("access-control-allow-credentials") is None
