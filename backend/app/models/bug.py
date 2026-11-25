from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import (
    BugStatus,
    Category,
    HistoryAction,
    NotificationType,
    Priority,
    Severity,
)
from app.db.base import Base, CreatedAtMixin, TimestampMixin, str_enum
from app.models.user import User


class Bug(TimestampMixin, Base):
    __tablename__ = "bugs"
    __table_args__ = (
        CheckConstraint("char_length(title) BETWEEN 5 AND 200", name="title_length"),
        CheckConstraint("char_length(description) >= 10", name="description_min_length"),
        # Defence in depth for workflow rules (the service layer is the primary enforcement point).
        CheckConstraint(
            "status NOT IN ('IN_PROGRESS', 'RESOLVED') OR assignee_id IS NOT NULL",
            name="active_work_requires_assignee",
        ),
        CheckConstraint(
            "status NOT IN ('RESOLVED', 'CLOSED') OR resolution_notes IS NOT NULL",
            name="resolution_requires_notes",
        ),
        CheckConstraint("status <> 'CLOSED' OR closed_at IS NOT NULL", name="closed_requires_closed_at"),
        Index("ix_bugs_assignee_id_status", "assignee_id", "status"),
        Index("ix_bugs_status_created_at", "status", "created_at"),
        # Trigram indexes make keyword search (ILIKE '%term%') index-assisted.
        Index("ix_bugs_title_trgm", "title", postgresql_using="gin", postgresql_ops={"title": "gin_trgm_ops"}),
        Index(
            "ix_bugs_description_trgm",
            "description",
            postgresql_using="gin",
            postgresql_ops={"description": "gin_trgm_ops"},
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    key: Mapped[str] = mapped_column(String(20), Computed("'BUG-' || id::text", persisted=True), unique=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[Severity] = mapped_column(str_enum(Severity, "severity"), nullable=False, index=True)
    priority: Mapped[Priority] = mapped_column(
        str_enum(Priority, "priority"), nullable=False, default=Priority.MEDIUM, server_default="MEDIUM", index=True
    )
    category: Mapped[Category] = mapped_column(str_enum(Category, "category"), nullable=False, index=True)
    status: Mapped[BugStatus] = mapped_column(
        str_enum(BugStatus, "bug_status"), nullable=False, default=BugStatus.NEW, server_default="NEW", index=True
    )
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    environment: Mapped[str] = mapped_column(String(255), nullable=False, default="", server_default="")
    steps_to_reproduce: Mapped[str] = mapped_column(Text, nullable=False)
    expected_result: Mapped[str] = mapped_column(Text, nullable=False)
    actual_result: Mapped[str] = mapped_column(Text, nullable=False)
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    reporter: Mapped[User] = relationship(back_populates="reported_bugs", foreign_keys=[reporter_id], lazy="joined")
    assignee: Mapped[User | None] = relationship(
        back_populates="assigned_bugs", foreign_keys=[assignee_id], lazy="joined"
    )
    comments: Mapped[list["BugComment"]] = relationship(
        back_populates="bug", cascade="all, delete-orphan", order_by="BugComment.created_at"
    )
    history: Mapped[list["BugHistory"]] = relationship(
        back_populates="bug", cascade="all, delete-orphan", order_by="BugHistory.created_at"
    )
    attachments: Mapped[list["BugAttachment"]] = relationship(
        back_populates="bug", cascade="all, delete-orphan", order_by="BugAttachment.created_at"
    )

    def __repr__(self) -> str:
        return f"<Bug {self.key} {self.status}>"


class BugComment(CreatedAtMixin, Base):
    """Comments are immutable once written (they form part of the audit trail)."""

    __tablename__ = "bug_comments"
    __table_args__ = (
        CheckConstraint("char_length(body) BETWEEN 1 AND 5000", name="body_length"),
        Index("ix_bug_comments_bug_id_created_at", "bug_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bug_id: Mapped[int] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)

    bug: Mapped[Bug] = relationship(back_populates="comments")
    author: Mapped[User] = relationship(lazy="joined")


class BugHistory(CreatedAtMixin, Base):
    """Append-only audit log: who changed which field from what to what, and when."""

    __tablename__ = "bug_history"
    __table_args__ = (
        Index("ix_bug_history_bug_id_created_at", "bug_id", "created_at"),
        Index("ix_bug_history_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    bug_id: Mapped[int] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    action: Mapped[HistoryAction] = mapped_column(str_enum(HistoryAction, "history_action"), nullable=False)
    field_name: Mapped[str | None] = mapped_column(String(64))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)

    bug: Mapped[Bug] = relationship(back_populates="history")
    actor: Mapped[User | None] = relationship(lazy="joined")


class BugAttachment(CreatedAtMixin, Base):
    __tablename__ = "bug_attachments"
    __table_args__ = (CheckConstraint("size_bytes > 0", name="size_positive"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bug_id: Mapped[int] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    bug: Mapped[Bug] = relationship(back_populates="attachments")
    uploaded_by: Mapped[User] = relationship(lazy="joined")


class Notification(CreatedAtMixin, Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_recipient_id_is_read_created_at", "recipient_id", "is_read", "created_at"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    recipient_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    bug_id: Mapped[int | None] = mapped_column(ForeignKey("bugs.id", ondelete="CASCADE"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    type: Mapped[NotificationType] = mapped_column(str_enum(NotificationType, "notification_type"), nullable=False)
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    is_read: Mapped[bool] = mapped_column(nullable=False, default=False, server_default="false")
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    bug: Mapped[Bug | None] = relationship(lazy="joined")

    @property
    def bug_key(self) -> str | None:
        return self.bug.key if self.bug is not None else None
