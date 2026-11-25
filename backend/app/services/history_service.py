"""Append-only audit trail writer (FR-HIST-1). Every bug mutation goes through here."""

from enum import Enum

from sqlalchemy.orm import Session

from app.core.enums import HistoryAction
from app.models import Bug, BugHistory, User


def _fmt(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, Enum):
        return str(value.value)
    if isinstance(value, User):
        return value.full_name
    return str(value)


class HistoryRecorder:
    def __init__(self, db: Session) -> None:
        self.db = db

    def record(
        self,
        bug: Bug,
        actor: User | None,
        action: HistoryAction,
        *,
        field: str | None = None,
        old: object = None,
        new: object = None,
    ) -> BugHistory:
        entry = BugHistory(
            bug_id=bug.id,
            actor_id=actor.id if actor else None,
            action=action,
            field_name=field,
            old_value=_fmt(old),
            new_value=_fmt(new),
        )
        self.db.add(entry)
        return entry
