"""Liveness and readiness probes (used by Docker health checks and load balancers)."""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.schemas.health import HealthResponse, ReadinessResponse

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get("/health", response_model=HealthResponse, summary="Liveness probe")
def health() -> HealthResponse:
    settings = get_settings()
    return HealthResponse(status="ok", version=settings.app_version, environment=settings.app_env)


@router.get(
    "/health/ready",
    response_model=ReadinessResponse,
    summary="Readiness probe (checks database connectivity and schema)",
    responses={503: {"model": ReadinessResponse}},
)
def ready(db: Session = Depends(get_db)) -> ReadinessResponse | JSONResponse:
    try:
        db.execute(text("SELECT 1"))
        revision = db.execute(text("SELECT version_num FROM alembic_version")).scalar_one_or_none()
    except SQLAlchemyError as exc:
        logger.warning("readiness check failed", extra={"error": exc.__class__.__name__})
        body = ReadinessResponse(status="unavailable", database="unreachable", migration_revision=None)
        return JSONResponse(status_code=503, content=body.model_dump())
    return ReadinessResponse(status="ok", database="ok", migration_revision=revision)
