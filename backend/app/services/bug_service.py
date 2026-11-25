"""Bug management business logic (FR-BUG-1..3, FR-CMT-1, FR-HIST-1, FR-SRCH-1, FR-NOTIF-1).

Every mutating method:
  1. loads the bug with a row lock (SELECT ... FOR UPDATE OF bugs),
  2. checks role capability, then resource ownership, then workflow rules,
  3. applies the change, writes history rows and notifications,
  4. commits once — the change, its audit trail and its notifications are atomic.
"""

import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.enums import BugStatus, HistoryAction, NotificationType, RoleName
from app.core.exceptions import ConflictError, DomainValidationError, NotFoundError, PermissionDeniedError
from app.models import Bug, BugComment, BugHistory, User
from app.repositories.bug_repository import BugFilters, BugRepository
from app.repositories.user_repository import UserRepository
from app.schemas.bug import AllowedTransition, BugCreate, BugListItem, BugUpdate
from app.schemas.common import Page, PageParams
from app.services import workflow
from app.services.history_service import HistoryRecorder
from app.services.notification_service import NotificationService
from app.services.permissions import Capability, has_capability

logger = logging.getLogger(__name__)

# A reporter (tester) may edit their own bug only while it hasn't been worked on.
REPORTER_EDITABLE = {BugStatus.NEW, BugStatus.OPEN, BugStatus.REOPENED}
# Statuses where the DB requires an assignee.
ASSIGNEE_LOCKED = {BugStatus.IN_PROGRESS, BugStatus.RESOLVED}
COMMENT_PREVIEW = 200


def _require(user: User, capability: Capability, message: str = "You do not have permission to perform this action"):
    if not has_capability(user.role_name, capability):
        raise PermissionDeniedError(message, details={"required": capability.value})


class BugService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.bugs = BugRepository(db)
        self.users = UserRepository(db)
        self.history = HistoryRecorder(db)
        self.notifier = NotificationService(db)

    # ============================================================== reads

    def get(self, bug_id: int, *, for_update: bool = False) -> Bug:
        bug = self.bugs.get(bug_id, for_update=for_update)
        if bug is None:
            raise NotFoundError("Bug not found", details={"bug_id": bug_id})
        return bug

    def search(self, filters: BugFilters, *, sort: str, order: str, page: PageParams) -> Page[BugListItem]:
        if filters.created_from and filters.created_to and filters.created_from > filters.created_to:
            raise DomainValidationError("created_from must be on or before created_to", code="INVALID_DATE_RANGE")
        rows, total = self.bugs.search(filters, sort=sort, order=order, offset=page.offset, limit=page.page_size)
        return Page[BugListItem](
            items=[BugListItem.model_validate(b) for b in rows], total=total, page=page.page, page_size=page.page_size
        )

    def comments(self, bug_id: int) -> list[BugComment]:
        self.get(bug_id)
        return self.bugs.list_comments(bug_id)

    def history_for(self, bug_id: int) -> list[BugHistory]:
        self.get(bug_id)
        return self.bugs.list_history(bug_id)

    def allowed_transitions(self, actor: User, bug_id: int) -> list[AllowedTransition]:
        bug = self.get(bug_id)
        if not has_capability(actor.role_name, Capability.BUG_TRANSITION):
            return []
        return [
            AllowedTransition(
                to_status=r.target,
                label=r.label,
                requires_resolution_notes=r.requires_resolution_notes,
                requires_reason=r.requires_reason,
            )
            for r in workflow.available_transitions(
                bug.status, actor_id=actor.id, actor_role=actor.role_name, assignee_id=bug.assignee_id
            )
        ]

    # ============================================================== create / edit

    def create(self, actor: User, data: BugCreate) -> Bug:
        _require(actor, Capability.BUG_CREATE, "Your role cannot report bugs")
        if data.priority is not None and not has_capability(actor.role_name, Capability.BUG_SET_PRIORITY):
            raise PermissionDeniedError("Only project managers can set priority", code="PRIORITY_NOT_PERMITTED")

        values = data.model_dump(exclude={"priority"})
        bug = self.bugs.add(Bug(**values, priority=data.priority or "MEDIUM", reporter_id=actor.id))
        self.history.record(bug, actor, HistoryAction.CREATED, new=bug.key)
        self.db.commit()
        logger.info("bug created", extra={"bug_id": bug.id, "actor_id": actor.id})
        return self.get(bug.id)

    def update(self, actor: User, bug_id: int, data: BugUpdate) -> Bug:
        bug = self.get(bug_id, for_update=True)
        self._check_can_edit(actor, bug)

        changed = 0
        for field, new in data.changes().items():
            old = getattr(bug, field)
            if old != new:
                setattr(bug, field, new)
                self.history.record(bug, actor, HistoryAction.FIELD_UPDATED, field=field, old=old, new=new)
                changed += 1
        if changed:
            self.db.commit()
        return self.get(bug_id)

    def _check_can_edit(self, actor: User, bug: Bug) -> None:
        if bug.status == BugStatus.CLOSED:
            raise ConflictError("Closed bugs cannot be edited; reopen it first", code="BUG_CLOSED")
        if has_capability(actor.role_name, Capability.BUG_EDIT_ANY):
            return
        if has_capability(actor.role_name, Capability.BUG_EDIT_OWN):
            if bug.reporter_id != actor.id:
                raise PermissionDeniedError("You can only edit bugs you reported", code="NOT_REPORTER")
            if bug.status not in REPORTER_EDITABLE:
                editable = ", ".join(sorted(s.value for s in REPORTER_EDITABLE))
                raise ConflictError(f"Reporters can edit a bug only while it is {editable}", code="BUG_NOT_EDITABLE")
            return
        raise PermissionDeniedError("Your role cannot edit bugs")

    # ============================================================== priority / assignment

    def set_priority(self, actor: User, bug_id: int, priority: str) -> Bug:
        _require(actor, Capability.BUG_SET_PRIORITY, "Only project managers can set priority")
        bug = self.get(bug_id, for_update=True)
        if bug.status == BugStatus.CLOSED:
            raise ConflictError("Closed bugs cannot be re-prioritised", code="BUG_CLOSED")
        if bug.priority != priority:
            self.history.record(
                bug, actor, HistoryAction.PRIORITY_CHANGED, field="priority", old=bug.priority, new=priority
            )
            bug.priority = priority
            self.db.commit()
        return self.get(bug_id)

    def assign(self, actor: User, bug_id: int, assignee_id: int | None) -> Bug:
        _require(actor, Capability.BUG_ASSIGN, "Only project managers can assign bugs")
        bug = self.get(bug_id, for_update=True)
        if bug.status == BugStatus.CLOSED:
            raise ConflictError("Closed bugs cannot be reassigned", code="BUG_CLOSED")
        if assignee_id == bug.assignee_id:
            return bug

        new_assignee: User | None = None
        if assignee_id is None:
            if bug.status in ASSIGNEE_LOCKED:
                raise ConflictError(
                    f"A {bug.status.value} bug must keep an assignee; reassign it instead", code="ASSIGNEE_REQUIRED"
                )
        else:
            new_assignee = self.users.get(assignee_id)
            if new_assignee is None or not new_assignee.is_active or new_assignee.role_name != RoleName.DEVELOPER:
                raise DomainValidationError(
                    "Assignee must be an active developer",
                    code="INVALID_ASSIGNEE",
                    details={"assignee_id": assignee_id},
                )

        old_assignee = bug.assignee
        bug.assignee = new_assignee
        self.history.record(bug, actor, HistoryAction.ASSIGNED, field="assignee", old=old_assignee, new=new_assignee)
        if new_assignee:
            self.notifier.notify(
                [new_assignee.id],
                actor=actor,
                type_=NotificationType.BUG_ASSIGNED,
                bug=bug,
                message=f"{actor.full_name} assigned {bug.key} to you: {bug.title}",
            )
        if old_assignee:
            self.notifier.notify(
                [old_assignee.id],
                actor=actor,
                type_=NotificationType.BUG_ASSIGNED,
                bug=bug,
                message=f"{actor.full_name} unassigned you from {bug.key}: {bug.title}",
            )
        self.db.commit()
        return self.get(bug_id)

    # ============================================================== workflow

    def transition(
        self, actor: User, bug_id: int, to_status: BugStatus, *, resolution_notes: str | None, reason: str | None
    ) -> Bug:
        _require(actor, Capability.BUG_TRANSITION, "Your role cannot change bug status")
        bug = self.get(bug_id, for_update=True)
        workflow.check_transition(
            bug.status,
            to_status,
            actor_id=actor.id,
            actor_role=actor.role_name,
            assignee_id=bug.assignee_id,
            resolution_notes=resolution_notes,
            reason=reason,
        )

        now = datetime.now(UTC)
        old_status = bug.status
        bug.status = to_status
        if to_status == BugStatus.RESOLVED:
            if bug.resolution_notes != resolution_notes:
                self.history.record(
                    bug,
                    actor,
                    HistoryAction.FIELD_UPDATED,
                    field="resolution_notes",
                    old=bug.resolution_notes,
                    new=resolution_notes,
                )
            bug.resolution_notes = resolution_notes
            bug.resolved_at = now
        elif to_status == BugStatus.CLOSED:
            bug.closed_at = now
        elif to_status == BugStatus.REOPENED:
            bug.resolved_at = None
            bug.closed_at = None

        self.history.record(bug, actor, HistoryAction.STATUS_CHANGED, field="status", old=old_status, new=to_status)

        if to_status == BugStatus.REOPENED:
            reason_text = (reason or "").strip()  # non-empty: enforced by check_transition
            comment = BugComment(bug_id=bug.id, author_id=actor.id, body=f"Reopened: {reason_text}")
            self.db.add(comment)
            self.history.record(bug, actor, HistoryAction.COMMENT_ADDED, new=comment.body[:COMMENT_PREVIEW])
            self.notifier.notify(
                [bug.assignee_id, bug.reporter_id, *self.notifier.project_manager_ids()],
                actor=actor,
                type_=NotificationType.BUG_REOPENED,
                bug=bug,
                message=f"{actor.full_name} reopened {bug.key}: {reason_text}",
            )
        else:
            self.notifier.notify(
                [bug.reporter_id, bug.assignee_id],
                actor=actor,
                type_=NotificationType.STATUS_CHANGED,
                bug=bug,
                message=f"{actor.full_name} moved {bug.key} from {old_status.value} to {to_status.value}",
            )
        self.db.commit()
        logger.info(
            "bug status changed",
            extra={"bug_id": bug.id, "actor_id": actor.id, "from": old_status.value, "to": to_status.value},
        )
        return self.get(bug_id)

    # ============================================================== comments

    def add_comment(self, actor: User, bug_id: int, body: str) -> BugComment:
        _require(actor, Capability.BUG_COMMENT, "Your role cannot comment on bugs")
        bug = self.get(bug_id, for_update=True)
        comment = BugComment(bug_id=bug.id, author_id=actor.id, body=body)
        self.db.add(comment)
        self.history.record(bug, actor, HistoryAction.COMMENT_ADDED, new=body[:COMMENT_PREVIEW])
        self.notifier.notify(
            [bug.reporter_id, bug.assignee_id],
            actor=actor,
            type_=NotificationType.COMMENT_ADDED,
            bug=bug,
            message=f"{actor.full_name} commented on {bug.key}: {body[:120]}",
        )
        self.db.commit()
        self.db.refresh(comment)
        return comment
