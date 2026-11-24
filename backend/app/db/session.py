"""Engine, session factory and the FastAPI DB-session dependency."""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session]:
    """One session per request. Services commit; anything uncommitted is rolled back here."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.rollback()
        db.close()
