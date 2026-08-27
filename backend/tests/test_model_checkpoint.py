from dataclasses import replace

import pytest

from app.config import load_settings
from app.services.errors import ApiProblem
from app.services.inference import ModelRegistry, normalize_model_id


def test_bundled_yolo26s_checkpoint_passes_integrity_status() -> None:
    registry = ModelRegistry(load_settings())
    status = {entry.id: entry for entry in registry.status()}
    assert status["yolo26s"].available
    assert "trusted" in status["yolo26s"].detail.lower()


def test_all_model_ids_are_allowlisted() -> None:
    for model_id in ("yolo26n", "yolo26s", "yolo26m", "yolo26l", "yolo26x"):
        assert normalize_model_id(model_id) == model_id
    with pytest.raises(ApiProblem) as error:
        normalize_model_id("../../untrusted.pt")
    assert error.value.code == "invalid_model"


def test_untrusted_checksum_keeps_checkpoint_unavailable(tmp_path) -> None:  # type: ignore[no-untyped-def]
    copied = tmp_path / "candidate.pt"
    copied.write_bytes(b"untrusted model bytes")
    settings = replace(load_settings(), yolo26s_model_path=copied, trusted_yolo26s_sha256="0" * 64)
    status = {entry.id: entry for entry in ModelRegistry(settings).status()}
    assert not status["yolo26s"].available
    assert "integrity" in status["yolo26s"].detail.lower()
