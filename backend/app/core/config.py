"""Application configuration loaded from environment variables (and optional .env files)."""

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_ROOT = BACKEND_DIR.parent

DEV_JWT_SECRET = "insecure-dev-only-change-me"  # noqa: S105 - development default, rejected in production
MIN_PRODUCTION_SECRET_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Application
    app_name: str = "BugTrackr API"
    app_version: str = "0.2.0"
    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"

    # Database
    postgres_user: str = "bugtracker"
    postgres_password: str = ""
    postgres_db: str = "bugtracker"
    postgres_test_db: str = "bugtracker_test"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url_override: str | None = Field(default=None, alias="DATABASE_URL")

    # Auth
    jwt_secret_key: str = DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_access_token_minutes: int = 30
    jwt_refresh_token_days: int = 7

    # Attachments
    upload_dir: str = "./uploads"
    max_upload_mb: int = 10

    @model_validator(mode="after")
    def _require_strong_secret_in_production(self) -> "Settings":
        if self.app_env == "production" and (
            self.jwt_secret_key == DEV_JWT_SECRET or len(self.jwt_secret_key) < MIN_PRODUCTION_SECRET_LENGTH
        ):
            raise ValueError(
                f"JWT_SECRET_KEY must be set to a random value of at least {MIN_PRODUCTION_SECRET_LENGTH} "
                "characters in production"
            )
        return self

    @field_validator("log_level")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        return value.upper()

    def _build_url(self, db_name: str) -> str:
        return (
            f"postgresql+psycopg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{db_name}"
        )

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        db = self.postgres_test_db if self.app_env == "test" else self.postgres_db
        return self._build_url(db)

    @property
    def test_database_url(self) -> str:
        return self._build_url(self.postgres_test_db)

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
