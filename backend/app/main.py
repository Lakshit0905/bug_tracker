"""FastAPI application factory."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.api.v1.routes import health
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import REQUEST_ID_HEADER, RequestContextMiddleware, configure_logging
from app.core.rate_limit import SlidingWindowRateLimiter

API_PREFIX = "/api/v1"


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description=(
            "REST API for BugTrackr — a role-based software bug tracking system with "
            "AI-assisted decision support. All endpoints except auth and health require a Bearer JWT."
        ),
        openapi_tags=[
            {"name": "auth", "description": "Registration, login, token refresh and logout"},
            {"name": "users", "description": "Own profile, and user administration (Admin)"},
            {"name": "bugs", "description": "Bugs, lifecycle, assignment, comments, history, attachments"},
            {"name": "notifications", "description": "In-app notifications"},
            {"name": "dashboard", "description": "Statistics, trends, workload, activity and reports"},
            {"name": "health", "description": "Liveness and readiness probes"},
        ],
    )
    app.state.auth_rate_limiter = SlidingWindowRateLimiter(settings.auth_rate_limit_per_minute, 60.0)
    app.state.refresh_rate_limiter = SlidingWindowRateLimiter(settings.refresh_rate_limit_per_minute, 60.0)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER],
    )
    app.add_middleware(RequestContextMiddleware)
    register_exception_handlers(app)

    app.include_router(health.router)
    app.include_router(api_router, prefix=API_PREFIX)
    return app


app = create_app()
