import json
import logging

import pytest
from pydantic import ValidationError

from app.core.config import DEV_JWT_SECRET, Settings
from app.core.logging import JsonFormatter, request_id_ctx

pytestmark = pytest.mark.unit


def test_database_url_built_from_parts():
    s = Settings(
        _env_file=None,
        app_env="development",
        postgres_user="u",
        postgres_password="p",
        postgres_host="h",
        postgres_port=1,
        postgres_db="d",
    )
    assert s.database_url == "postgresql+psycopg://u:p@h:1/d"


def test_test_env_selects_test_database():
    s = Settings(_env_file=None, app_env="test", postgres_db="main", postgres_test_db="main_test")
    assert s.database_url.endswith("/main_test")


def test_database_url_override_wins():
    s = Settings(_env_file=None, DATABASE_URL="postgresql+psycopg://x:y@z/w")
    assert s.database_url == "postgresql+psycopg://x:y@z/w"


def test_cors_origins_parsed_into_list():
    s = Settings(_env_file=None, cors_origins=" http://a.com , http://b.com,, ")
    assert s.cors_origin_list == ["http://a.com", "http://b.com"]


def test_log_level_normalised_to_upper_case():
    assert Settings(_env_file=None, log_level="debug").log_level == "DEBUG"


@pytest.mark.parametrize("secret", [DEV_JWT_SECRET, "too-short"])
def test_production_rejects_default_or_weak_jwt_secret(secret: str):
    with pytest.raises(ValidationError, match="JWT_SECRET_KEY"):
        Settings(_env_file=None, app_env="production", jwt_secret_key=secret)


def test_production_accepts_strong_jwt_secret():
    assert Settings(_env_file=None, app_env="production", jwt_secret_key="x" * 64).app_env == "production"


def test_development_allows_default_secret():
    assert Settings(_env_file=None, app_env="development").jwt_secret_key == DEV_JWT_SECRET


def _format(record_extra: dict) -> dict:
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "hello %s", ("world",), None)
    for k, v in record_extra.items():
        setattr(record, k, v)
    return json.loads(JsonFormatter().format(record))


def test_json_formatter_emits_structured_fields():
    out = _format({"user_id": 7})
    assert out["message"] == "hello world"
    assert out["level"] == "INFO"
    assert out["user_id"] == 7
    assert "timestamp" in out


def test_json_formatter_redacts_sensitive_keys_including_nested():
    out = _format({"password": "secret", "payload": {"token": "abc", "ok": 1}})
    assert out["password"] == "***"
    assert out["payload"] == {"token": "***", "ok": 1}


def test_json_formatter_includes_request_id_from_context():
    token = request_id_ctx.set("req-123")
    try:
        assert _format({})["request_id"] == "req-123"
    finally:
        request_id_ctx.reset(token)
