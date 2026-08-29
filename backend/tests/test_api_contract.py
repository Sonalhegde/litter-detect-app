from __future__ import annotations

from conftest import image_bytes


def test_root_health_and_model_alias_contract(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/").json() == {"status": "ok", "service": "shoreline-litter-detector-inference"}
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "starting"
    assert len(health.json()["models"]) == 5
    assert client.get("/models").json() == client.get("/api/model").json()


def test_detection_aliases_return_the_same_typed_safe_contract(client) -> None:  # type: ignore[no-untyped-def]
    files = {"file": ("shoreline.png", image_bytes(), "image/png")}
    payload = {"model": "yolo26s"}
    first = client.post("/v1/detections", files=files, data=payload)
    second = client.post("/api/detect/image", files=files, data=payload)
    for response in (first, second):
        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["model"] == "yolo26s"
        assert body["count"] == 0
        assert body["runtime"]["device"] == "cpu"
        assert response.headers["x-request-id"]


def test_invalid_model_and_missing_upload_are_safe_structured_errors(client) -> None:  # type: ignore[no-untyped-def]
    invalid = client.post("/v1/detections", files={"file": ("x.png", image_bytes(), "image/png")}, data={"model": "../../unsafe.pt"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "invalid_model"
    missing = client.post("/v1/detections", data={"model": "yolo26s"})
    assert missing.status_code == 422
    assert missing.json()["error"]["code"] == "invalid_request"


def test_missing_variant_checkpoint_returns_safe_model_unavailable_response(tmp_path) -> None:  # type: ignore[no-untyped-def]
    from dataclasses import replace

    from fastapi.testclient import TestClient

    from app.config import load_settings
    from app.main import create_app

    settings = replace(
        load_settings(),
        yolo26s_model_path=tmp_path / "missing-yolo26s.pt",
        yolo26n_model_path=tmp_path / "missing-yolo26n.pt",
        yolo26m_model_path=tmp_path / "missing-yolo26m.pt",
        yolo26l_model_path=tmp_path / "missing-yolo26l.pt",
        yolo26x_model_path=tmp_path / "missing-yolo26x.pt",
    )
    with TestClient(create_app(settings)) as unavailable_client:
        response = unavailable_client.post("/v1/detections", files={"file": ("sample.png", image_bytes(), "image/png")}, data={"model": "yolo26n"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "model_unavailable"


def test_method_abuse_and_unexpected_json_do_not_leak_internal_details(client) -> None:  # type: ignore[no-untyped-def]
    get_response = client.get("/v1/detections")
    assert get_response.status_code == 405
    unexpected_json = client.post("/v1/detections", json={"file": "not-a-multipart-upload"})
    assert unexpected_json.status_code == 422
    assert unexpected_json.json()["error"]["code"] == "invalid_request"
