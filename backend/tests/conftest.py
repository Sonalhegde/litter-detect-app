from __future__ import annotations

import io
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import load_settings
from app.main import create_app
from app.schemas.detection import DetectionResponse, ImageSize, RuntimeConfiguration


def image_bytes(image_format: str = "PNG", size: tuple[int, int] = (64, 48)) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", size, color=(12, 80, 93)).save(output, format=image_format)
    return output.getvalue()


class FakeInferenceService:
    async def detect(self, image, model_id):  # type: ignore[no-untyped-def]
        return DetectionResponse(
            model=model_id,
            model_label="YOLO26s",
            detections=[],
            summary=[],
            count=0,
            inference_time_sec=0.01,
            image_size=ImageSize(width=image.width, height=image.height),
            runtime=RuntimeConfiguration(confidence_threshold=0.25, iou_threshold=0.45, input_size=640, device="cpu"),
        )


@pytest.fixture
def client(tmp_path):  # type: ignore[no-untyped-def]
    settings = replace(
        load_settings(),
        allowed_origins=("https://allowed.example",),
        yolo26s_model_path=tmp_path / "missing-yolo26s.pt",
        yolo26n_model_path=tmp_path / "missing-yolo26n.pt",
        yolo26m_model_path=tmp_path / "missing-yolo26m.pt",
        yolo26l_model_path=tmp_path / "missing-yolo26l.pt",
        yolo26x_model_path=tmp_path / "missing-yolo26x.pt",
        max_upload_mb=1,
        max_image_width=200,
        max_image_height=200,
        max_image_pixels=20_000,
        rate_limit_requests=4,
        rate_limit_window_seconds=60,
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        app.state.inference_service = FakeInferenceService()
        yield test_client
