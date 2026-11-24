"""Shared fixtures.

Strategy:
- Tests always run against the dedicated test database (APP_ENV=test → POSTGRES_TEST_DB), never the dev DB.
- At session start the schema is rebuilt *by running the Alembic migrations* (upgrade → downgrade → upgrade),
  so the migrations themselves are exercised on every run.
- Each test runs inside an outer transaction that is rolled back afterwards; application code that calls
  commit() only releases a SAVEPOINT, so tests are isolated and leave no data behind.
"""

import os

os.environ["APP_ENV"] = "test"  # must happen before the app/settings are imported

from collections.abc import Generator, Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[1]


def alembic_config(connection: Connection) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.attributes["connection"] = connection
    cfg.attributes["configure_logger"] = False
    return cfg


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    settings = get_settings()
    assert settings.database_url.endswith(f"/{settings.postgres_test_db}"), "Refusing to run tests on a non-test DB"
    eng = create_engine(settings.database_url, future=True)

    with eng.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    with eng.begin() as conn:
        cfg = alembic_config(conn)
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")

    yield eng
    eng.dispose()


@pytest.fixture
def db_session(engine: Engine) -> Iterator[Session]:
    connection = engine.connect()
    outer = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        outer.rollback()
        connection.close()


@pytest.fixture
def app(db_session: Session):
    application = create_app()

    def _override_get_db() -> Generator[Session]:
        yield db_session

    application.dependency_overrides[get_db] = _override_get_db
    return application


@pytest.fixture
def client(app) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
