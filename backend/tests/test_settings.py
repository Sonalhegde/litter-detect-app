import pytest

from app.config import DEFAULT_ALLOWED_ORIGINS, get_float_env, get_int_env, parse_origins


def test_parse_origins_cleans_and_filters_values() -> None:
    assert parse_origins(" https://app.example.com/ , ,https://preview.example.com ") == ("https://app.example.com", "https://preview.example.com")
    assert parse_origins("") == DEFAULT_ALLOWED_ORIGINS


def test_environment_number_guards_reject_invalid_values(monkeypatch) -> None:  # type: ignore[no-untyped-def]
    assert get_int_env("TEST_MISSING_INT", 4, 1, 10) == 4
    assert get_float_env("TEST_MISSING_FLOAT", 0.25, 0.01, 0.99) == 0.25
    monkeypatch.setenv("TEST_BAD_INT", "not-an-int")
    monkeypatch.setenv("TEST_BAD_FLOAT", "1.2")
    with pytest.raises(ValueError):
        get_int_env("TEST_BAD_INT", 4, 1, 10)
    with pytest.raises(ValueError):
        get_float_env("TEST_BAD_FLOAT", 0.25, 0.01, 0.99)
