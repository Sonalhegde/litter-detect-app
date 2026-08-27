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
