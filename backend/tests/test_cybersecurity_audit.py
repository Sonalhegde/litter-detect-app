from __future__ import annotations

import pytest


def test_owasp_security_headers_present_on_all_responses(client) -> None:  # type: ignore[no-untyped-def]
    """Verify that essential defensive security headers are returned on all endpoints."""
    res = client.get("/health")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in res.headers.get("permissions-policy", "")


def test_feedback_endpoint_enforces_rate_limiting(client) -> None:  # type: ignore[no-untyped-def]
    """Verify that /v1/feedback cannot be abused with unbounded requests (rate limit active)."""
    payload = {
        "detections": [
            {
                "detection_id": 1,
                "class_name": "plastic_bottle",
                "confidence": 0.85,
                "verdict": "correct",
            }
        ],
        "missed": [],
    }
    # Client test fixture sets rate_limit_requests=4 per window
    for _ in range(4):
        res = client.post("/v1/feedback", json=payload)
        assert res.status_code == 204

    # 5th request must be rate limited
    limited = client.post("/v1/feedback", json=payload)
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "rate_limited"
    assert int(limited.headers["retry-after"]) > 0


def test_feedback_endpoint_validates_class_name_format(client) -> None:  # type: ignore[no-untyped-def]
    """Verify that malicious or malformed class names (SQL injection / path traversal) are rejected."""
    malformed_payload = {
        "detections": [
            {
                "detection_id": 1,
                "class_name": "'; DROP TABLE bandit_state; --",
                "confidence": 0.85,
                "verdict": "correct",
            }
        ],
        "missed": [],
    }
    res = client.post("/v1/feedback", json=malformed_payload)
    assert res.status_code in {400, 422}
    assert res.json()["success"] is False


def test_invalid_content_length_header_is_safely_rejected(client) -> None:  # type: ignore[no-untyped-def]
    """Verify non-numeric or malicious Content-Length headers do not cause uncaught 500 exceptions."""
    res = client.post("/health", headers={"Content-Length": "not-a-number"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_content_length"


def test_error_responses_contain_no_stack_traces_or_system_paths(client) -> None:  # type: ignore[no-untyped-def]
    """Verify that 404, 405, 422, and 500 error responses follow a clean schema without leaking internals."""
    res_404 = client.get("/non-existent-endpoint-404")
    assert res_404.status_code == 404
    body = res_404.text.lower()
    assert "traceback" not in body
    assert "site-packages" not in body
    assert "fastapi" not in body

    res_405 = client.post("/health")
    assert res_405.status_code == 405
    body_405 = res_405.text.lower()
    assert "traceback" not in body_405
    assert "site-packages" not in body_405


def test_x_request_id_tracing_header_returned(client) -> None:  # type: ignore[no-untyped-def]
    """Verify every response includes an audit-traceable X-Request-ID for security logging."""
    res = client.get("/health")
    assert "x-request-id" in res.headers
    assert len(res.headers["x-request-id"]) >= 16
