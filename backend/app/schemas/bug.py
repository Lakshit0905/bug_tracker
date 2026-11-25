from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, computed_field, model_validator

from app.core.enums import BugStatus, Category, HistoryAction, NotificationType, Priority, Severity
from app.schemas.common import ORMModel
from app.schemas.user import UserSummary

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=10, max_length=10_000)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5_000)]
Environment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]
CommentBody = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5_000)]

BUG_SORT_FIELDS = ("created_at", "updated_at", "priority", "severity", "status", "title", "id")
BugSortField = Literal["created_at", "updated_at", "priority", "severity", "status", "title", "id"]
SortOrder = Literal["asc", "desc"]


# ------------------------------------------------------------------ bugs


class BugCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description
    severity: Severity
    category: Category
    priority: Priority | None = Field(default=None, description="Project managers only; defaults to MEDIUM")
    environment: Environment = ""
    steps_to_reproduce: LongText
    expected_result: LongText
    actual_result: LongText


class BugUpdate(BaseModel):
    """Partial update of descriptive fields. Priority, assignee and status have dedicated endpoints."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    description: Description | None = None
    severity: Severity | None = None
    category: Category | None = None
    environment: Environment | None = None
    steps_to_reproduce: LongText | None = None
    expected_result: LongText | None = None
    actual_result: LongText | None = None

    @model_validator(mode="after")
    def _no_explicit_nulls_and_not_empty(self) -> "BugUpdate":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        nulls = [f for f in self.model_fields_set if getattr(self, f) is None]
        if nulls:
            raise ValueError(f"Fields cannot be null: {', '.join(sorted(nulls))}")
        return self

    def changes(self) -> dict[str, object]:
        return {f: getattr(self, f) for f in self.model_fields_set}


class BugListItem(ORMModel):
    id: int
    key: str
    title: str
    severity: Severity
    priority: Priority
    category: Category
    status: BugStatus
    reporter: UserSummary
    assignee: UserSummary | None
    created_at: datetime
    updated_at: datetime


class BugOut(BugListItem):
    description: str
    environment: str
    steps_to_reproduce: str
    expected_result: str
    actual_result: str
    resolution_notes: str | None
    resolved_at: datetime | None
    closed_at: datetime | None


class PriorityUpdate(BaseModel):
    priority: Priority


class AssigneeUpdate(BaseModel):
    assignee_id: int | None = Field(description="Developer user id, or null to unassign")


class TransitionRequest(BaseModel):
    to_status: BugStatus
    resolution_notes: Annotated[str, StringConstraints(strip_whitespace=True, max_length=5_000)] | None = None
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=2_000)] | None = None


class AllowedTransition(BaseModel):
    to_status: BugStatus
    label: str
    requires_resolution_notes: bool
    requires_reason: bool


# ------------------------------------------------------------------ comments, history, attachments


class CommentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    body: CommentBody


class CommentOut(ORMModel):
    id: int
    bug_id: int
    body: str
    author: UserSummary
    created_at: datetime


class HistoryOut(ORMModel):
    id: int
    bug_id: int
    action: HistoryAction
    field_name: str | None
    old_value: str | None
    new_value: str | None
    actor: UserSummary | None
    created_at: datetime


class AttachmentOut(ORMModel):
    id: int
    bug_id: int
    original_filename: str
    content_type: str
    size_bytes: int
    uploaded_by: UserSummary
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def download_url(self) -> str:
        return f"/api/v1/attachments/{self.id}/download"


# ------------------------------------------------------------------ notifications


class NotificationOut(ORMModel):
    id: int
    type: NotificationType
    message: str
    bug_id: int | None
    bug_key: str | None = None
    is_read: bool
    created_at: datetime
    read_at: datetime | None


class UnreadCount(BaseModel):
    unread: int


class MarkedRead(BaseModel):
    updated: int
