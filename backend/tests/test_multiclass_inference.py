from __future__ import annotations

from unittest.mock import MagicMock
import numpy as np

from app.services.inference import _class_names_from_metadata, _postprocess_yolo26_output


def test_class_names_from_metadata_parses_multiclass_dict() -> None:
    mock_model = MagicMock()
    mock_model.get_modelmeta.return_value.custom_metadata_map = {
        "names": "{0: 'plastic_bottle', 1: 'fishing_net', 2: 'styrofoam'}"
    }
    names = _class_names_from_metadata(mock_model)
    assert names == {0: "plastic_bottle", 1: "fishing_net", 2: "styrofoam"}


def test_class_aware_nms_does_not_cross_suppress_different_classes() -> None:
    # Construct a raw YOLO26 output array shape: (1, 6, N_candidates) -> [x_center, y_center, w, h, class_0, class_1]
    # Two boxes at the exact same location (100% IoU), but predicting different classes
    candidates = np.array([
        # Box 1: x_center=160, y_center=160, w=100, h=100, class_0_score=0.90, class_1_score=0.10
        [160.0, 160.0, 100.0, 100.0, 0.90, 0.10],
        # Box 2: x_center=160, y_center=160, w=100, h=100, class_0_score=0.10, class_1_score=0.85
        [160.0, 160.0, 100.0, 100.0, 0.10, 0.85],
    ], dtype=np.float32).T

    raw_output = np.expand_dims(candidates, axis=0)  # Shape (1, 6, 2)

    detections = _postprocess_yolo26_output(
        raw_output,
        image_width=640,
        image_height=480,
        image_size=320,
        confidence_threshold=0.25,
        iou_threshold=0.45,
    )

    # Both boxes MUST survive NMS because their class_ids are 0 and 1
    assert len(detections) == 2
    class_ids = {d[0] for d in detections}
    assert class_ids == {0, 1}


def test_multiclass_feedback_updates_independent_bandit_thresholds(client) -> None:  # type: ignore[no-untyped-def]
    feedback_payload = {
        "detections": [
            {"detection_id": 1, "class_name": "plastic_bottle", "confidence": 0.30, "verdict": "wrong"},
            {"detection_id": 2, "class_name": "fishing_net", "confidence": 0.80, "verdict": "correct"},
        ],
        "missed": [
            {"class_name": "fishing_net", "confidence": 0.25},
        ],
    }

    for _ in range(10):
        res = client.post("/v1/feedback", json=feedback_payload)
        assert res.status_code == 204

    status_res = client.get("/v1/bandit/status")
    assert status_res.status_code == 200
    statuses = {item["class_name"]: item for item in status_res.json()["classes"]}

    assert "plastic_bottle" in statuses
    assert "fishing_net" in statuses
    assert statuses["plastic_bottle"]["feedback_count"] == 10
    assert statuses["fishing_net"]["feedback_count"] == 20
