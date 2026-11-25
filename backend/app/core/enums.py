"""Domain enumerations shared by models, schemas and services.

Values are stored as VARCHAR with CHECK constraints (not native PostgreSQL enums)
so new values can be added with a simple migration.
"""

from enum import StrEnum


class RoleName(StrEnum):
    TESTER = "TESTER"
    DEVELOPER = "DEVELOPER"
    PROJECT_MANAGER = "PROJECT_MANAGER"
    ADMIN = "ADMIN"


class BugStatus(StrEnum):
    NEW = "NEW"
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    REOPENED = "REOPENED"
    CLOSED = "CLOSED"


class Severity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Priority(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Category(StrEnum):
    UI = "UI"
    BACKEND = "BACKEND"
    DATABASE = "DATABASE"
    AUTHENTICATION = "AUTHENTICATION"
    PERFORMANCE = "PERFORMANCE"
    SECURITY = "SECURITY"
    API = "API"
    INFRASTRUCTURE = "INFRASTRUCTURE"
    OTHER = "OTHER"


class HistoryAction(StrEnum):
    CREATED = "CREATED"
    FIELD_UPDATED = "FIELD_UPDATED"
    STATUS_CHANGED = "STATUS_CHANGED"
    ASSIGNED = "ASSIGNED"
    PRIORITY_CHANGED = "PRIORITY_CHANGED"
    COMMENT_ADDED = "COMMENT_ADDED"
    ATTACHMENT_ADDED = "ATTACHMENT_ADDED"


class NotificationType(StrEnum):
    BUG_ASSIGNED = "BUG_ASSIGNED"
    STATUS_CHANGED = "STATUS_CHANGED"
    COMMENT_ADDED = "COMMENT_ADDED"
    BUG_REOPENED = "BUG_REOPENED"
