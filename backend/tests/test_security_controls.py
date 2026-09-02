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


def test_rate_limiter_proxy_ip_resolution_and_spoof_protection() -> None:
    from unittest.mock import MagicMock
    from app.services.rate_limit import client_identifier

    # 1. Trusted reverse proxy request: X-Forwarded-For extracted
    trusted_req = MagicMock()
    trusted_req.client.host = "127.0.0.1"
    trusted_req.headers = {"x-forwarded-for": "203.0.113.50, 10.0.0.1"}
    assert client_identifier(trusted_req, trust_proxy_headers=True) == "203.0.113.50"

    # 2. Untrusted direct connection: X-Forwarded-For ignored, connection peer host returned
    untrusted_req = MagicMock()
    untrusted_req.client.host = "198.51.100.99"
    untrusted_req.headers = {"x-forwarded-for": "203.0.113.50"}
    assert client_identifier(untrusted_req, trust_proxy_headers=False) == "198.51.100.99"

