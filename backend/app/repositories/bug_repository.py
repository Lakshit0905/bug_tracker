"""Data access for bugs and their child records. Query building only — no permission or workflow logic."""

import re
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import ColumnElement, Select, case, func, or_, select, update
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, Category, Priority, Severity
from app.models import Bug, BugAttachment, BugComment, BugHistory, Notification

_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
_STATUS_ORDER = {s.value: i for i, s in enumerate(BugStatus)}
_BUG_ID_PATTERN = re.compile(r"^(?:bug-)?(\d{1,9})$", re.IGNORECASE)


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")


@dataclass
class BugFilters:
    statuses: list[BugStatus] = field(default_factory=list)
    severities: list[Severity] = field(default_factory=list)
    priorities: list[Priority] = field(default_factory=list)
    categories: list[Category] = field(default_factory=list)
    assignee_id: int | None = None
    unassigned: bool = False
    reporter_id: int | None = None
    created_from: date | None = None
    created_to: date | None = None
    keyword: str | None = None


class BugRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, bug_id: int, *, for_update: bool = False) -> Bug | None:
        stmt = select(Bug).where(Bug.id == bug_id)
        if for_update:
            # "OF bugs" — eager-joined users sit on the nullable side of an outer join and cannot be locked.
            stmt = stmt.with_for_update(of=Bug)
        return self.db.execute(stmt).unique().scalar_one_or_none()

    def add(self, bug: Bug) -> Bug:
        self.db.add(bug)
        self.db.flush()
        self.db.refresh(bug)  # load server-generated key / defaults
        return bug

    # -------------------------------------------------------------- search

    def _apply_filters(self, stmt: Select, f: BugFilters) -> Select:
        if f.statuses:
            stmt = stmt.where(Bug.status.in_(f.statuses))
        if f.severities:
            stmt = stmt.where(Bug.severity.in_(f.severities))
        if f.priorities:
            stmt = stmt.where(Bug.priority.in_(f.priorities))
        if f.categories:
            stmt = stmt.where(Bug.category.in_(f.categories))
        if f.unassigned:
            stmt = stmt.where(Bug.assignee_id.is_(None))
        elif f.assignee_id is not None:
            stmt = stmt.where(Bug.assignee_id == f.assignee_id)
        if f.reporter_id is not None:
            stmt = stmt.where(Bug.reporter_id == f.reporter_id)
        if f.created_from:
            stmt = stmt.where(Bug.created_at >= datetime.combine(f.created_from, time.min, UTC))
        if f.created_to:  # inclusive of the whole "to" day
            stmt = stmt.where(Bug.created_at < datetime.combine(f.created_to + timedelta(days=1), time.min, UTC))
        if f.keyword:
            term = f.keyword.strip()
            like = f"%{_escape_like(term)}%"
            conditions: list[ColumnElement[bool]] = [
                Bug.title.ilike(like, escape="\\"),
                Bug.description.ilike(like, escape="\\"),
            ]
            if m := _BUG_ID_PATTERN.match(term):
                conditions.append(Bug.id == int(m.group(1)))
            stmt = stmt.where(or_(*conditions))
        return stmt

    @staticmethod
    def _sort_column(sort: str) -> ColumnElement:
        if sort == "priority":
            return case(_RANK, value=Bug.priority)
        if sort == "severity":
            return case(_RANK, value=Bug.severity)
        if sort == "status":
            return case(_STATUS_ORDER, value=Bug.status)
        return getattr(Bug, sort)

    def search(self, f: BugFilters, *, sort: str, order: str, offset: int, limit: int) -> tuple[list[Bug], int]:
        base = self._apply_filters(select(Bug.id), f)
        total = self.db.execute(select(func.count()).select_from(base.subquery())).scalar_one()

        col = self._sort_column(sort)
        ordering = [col.desc() if order == "desc" else col.asc(), Bug.id.desc() if order == "desc" else Bug.id.asc()]
        stmt = self._apply_filters(select(Bug), f).order_by(*ordering).offset(offset).limit(limit)
        return list(self.db.execute(stmt).unique().scalars().all()), total

    # -------------------------------------------------------------- children

    def list_comments(self, bug_id: int) -> list[BugComment]:
        stmt = select(BugComment).where(BugComment.bug_id == bug_id).order_by(BugComment.created_at, BugComment.id)
        return list(self.db.execute(stmt).unique().scalars().all())

    def list_history(self, bug_id: int) -> list[BugHistory]:
        stmt = select(BugHistory).where(BugHistory.bug_id == bug_id).order_by(BugHistory.created_at, BugHistory.id)
        return list(self.db.execute(stmt).unique().scalars().all())

    def list_attachments(self, bug_id: int) -> list[BugAttachment]:
        stmt = (
            select(BugAttachment)
            .where(BugAttachment.bug_id == bug_id)
            .order_by(BugAttachment.created_at, BugAttachment.id)
        )
        return list(self.db.execute(stmt).unique().scalars().all())

    def get_attachment(self, attachment_id: int) -> BugAttachment | None:
        return self.db.get(BugAttachment, attachment_id)


class NotificationRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add_many(self, items: list[Notification]) -> None:
        self.db.add_all(items)
        self.db.flush()

    def list_for(self, user_id: int, *, unread_only: bool, offset: int, limit: int) -> tuple[list[Notification], int]:
        cond = [Notification.recipient_id == user_id]
        if unread_only:
            cond.append(Notification.is_read.is_(False))
        total = self.db.execute(select(func.count()).select_from(Notification).where(*cond)).scalar_one()
        stmt = (
            select(Notification)
            .where(*cond)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset(offset)
            .limit(limit)
        )
        return list(self.db.execute(stmt).unique().scalars().all()), total

    def unread_count(self, user_id: int) -> int:
        stmt = select(func.count()).where(Notification.recipient_id == user_id, Notification.is_read.is_(False))
        return self.db.execute(stmt).scalar_one()

    def get_for(self, notification_id: int, user_id: int) -> Notification | None:
        stmt = select(Notification).where(Notification.id == notification_id, Notification.recipient_id == user_id)
        return self.db.execute(stmt).unique().scalar_one_or_none()

    def mark_all_read(self, user_id: int, now: datetime) -> int:
        result = self.db.execute(
            update(Notification)
            .where(Notification.recipient_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True, read_at=now)
        )
        return result.rowcount or 0
