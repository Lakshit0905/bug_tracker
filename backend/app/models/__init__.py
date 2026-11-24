"""Import all models so Base.metadata is complete (used by Alembic autogenerate and tests)."""

from app.models.bug import Bug, BugAttachment, BugComment, BugHistory, Notification
from app.models.user import RefreshToken, Role, User

__all__ = [
    "Bug",
    "BugAttachment",
    "BugComment",
    "BugHistory",
    "Notification",
    "RefreshToken",
    "Role",
    "User",
]
