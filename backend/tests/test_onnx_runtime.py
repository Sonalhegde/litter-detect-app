from __future__ import annotations

import numpy as np
from PIL import Image

from app.services.inference import _nms_indices, _postprocess_yolo26_output, _prepare_image_tensor


def test_letterbox_tensor_uses_expected_shape_padding_and_range() -> None:
    tensor = _prepare_image_tensor(Image.new("RGB", (1500, 1000), color=(12, 80, 93)), 320)
    assert tensor.shape == (1, 3, 320, 320)
    assert tensor.dtype == np.float32
    assert tensor.min() >= 0
    assert tensor.max() <= 1
    assert np.isclose(tensor[0, 0, 0, 0], 114 / 255)


def test_nms_is_stable_and_suppresses_overlapping_candidates() -> None:
    boxes = np.asarray([[10, 10, 50, 50], [12, 12, 48, 48], [70, 70, 90, 90]], dtype=np.float32)
    scores = np.asarray([0.9, 0.8, 0.7], dtype=np.float32)
    assert _nms_indices(boxes, scores, iou_threshold=0.45).tolist() == [0, 2]


def test_postprocessing_restores_letterboxed_coordinates_and_confidence() -> None:
    raw = np.zeros((1, 5, 3), dtype=np.float32)
    raw[0, :, 0] = [160, 160, 64, 64, 0.9]
    raw[0, :, 1] = [162, 162, 64, 64, 0.8]
    raw[0, :, 2] = [20, 20, 20, 20, 0.2]
    detections = _postprocess_yolo26_output(raw, image_width=1000, image_height=500, image_size=320, confidence_threshold=0.25, iou_threshold=0.45)
    assert len(detections) == 1
    class_id, confidence, box = detections[0]
    assert class_id == 0
    assert round(confidence, 4) == 0.9
    assert np.allclose(box, [400, 150, 600, 350], atol=0.1)
