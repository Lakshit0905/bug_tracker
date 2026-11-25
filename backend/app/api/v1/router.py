"""Aggregates all v1 routers. Feature routers are added here as each phase lands."""

from fastapi import APIRouter

from app.api.v1.routes import attachments, auth, bugs, dashboard, notifications, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(bugs.router)
api_router.include_router(attachments.router)
api_router.include_router(notifications.router)
api_router.include_router(dashboard.router)
