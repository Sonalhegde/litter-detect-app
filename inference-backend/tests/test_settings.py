import unittest

from app.settings import DEFAULT_ALLOWED_ORIGINS, get_float_env, get_int_env, parse_origins


class SettingsTests(unittest.TestCase):
    def test_parse_origins_cleans_and_filters_values(self) -> None:
        self.assertEqual(parse_origins(" https://app.example.com/ , ,https://preview.example.com "), ["https://app.example.com", "https://preview.example.com"])
        self.assertEqual(parse_origins(""), list(DEFAULT_ALLOWED_ORIGINS))

    def test_environment_number_guards_reject_invalid_values(self) -> None:
        self.assertEqual(get_int_env("TEST_MISSING_INT", 4, 1, 10), 4)
        self.assertEqual(get_float_env("TEST_MISSING_FLOAT", 0.25, 0.01, 0.99), 0.25)
