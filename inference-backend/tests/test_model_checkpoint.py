import unittest

from app.model_registry import ModelRegistry
from app.settings import load_settings


class ModelCheckpointTests(unittest.TestCase):
    def test_bundled_yolo26s_checkpoint_is_registered_and_loadable(self) -> None:
        registry = ModelRegistry(load_settings())
        spec, model = registry.get_model("yolo26s")

        self.assertEqual(spec.id, "yolo26s")
        self.assertTrue(spec.path.is_file())
        self.assertIsNotNone(model)

    def test_uninstalled_model_variants_are_reported_as_unavailable(self) -> None:
        registry = ModelRegistry(load_settings())
        status = {entry["id"]: entry for entry in registry.status()}

        self.assertEqual(set(status), {"yolo26n", "yolo26s", "yolo26m", "yolo26l", "yolo26x"})
        for model_id in ("yolo26n", "yolo26m", "yolo26l", "yolo26x"):
            self.assertFalse(status[model_id]["available"])
