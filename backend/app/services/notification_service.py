"""In-app notifications (FR-NOTIF-1, FR-NOTIF-2).

Rules: the actor is never notified about their own action, inactive users are skipped, and each recipient
gets at most one notification per event.
"""

from collections.abc import Iterable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import NotificationType, RoleName
from app.core.exceptions import NotFoundError
from app.models import Bug, Notification, User
from app.repositories.bug_repository import NotificationRepository
from app.repositories.user_repository import UserRepository
from app.schemas.bug import NotificationOut
from app.schemas.common import Page, PageParams

MAX_MESSAGE = 500


class NotificationService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = NotificationRepository(db)
        self.users = UserRepository(db)

    # -------------------------------------------------------------- producing

    def notify(
        self,
        recipient_ids: Iterable[int | None],
        *,
        actor: User,
        type_: NotificationType,
        bug: Bug,
        message: str,
    ) -> int:
        wanted = {rid for rid in recipient_ids if rid is not None and rid != actor.id}
        if not wanted:
            return 0
        active = self.db.execute(select(User.id).where(User.id.in_(wanted), User.is_active.is_(True))).scalars()
        items = [
            Notification(recipient_id=uid, bug_id=bug.id, actor_id=actor.id, type=type_, message=message[:MAX_MESSAGE])
            for uid in sorted(active)
        ]
        self.repo.add_many(items)
        return len(items)

    def project_manager_ids(self) -> list[int]:
        return [u.id for u in self.users.list_active_by_role(RoleName.PROJECT_MANAGER)]

    # -------------------------------------------------------------- consuming

    def list(self, user: User, *, unread_only: bool, page: PageParams) -> Page[NotificationOut]:
        rows, total = self.repo.list_for(user.id, unread_only=unread_only, offset=page.offset, limit=page.page_size)
        return Page[NotificationOut](
            items=[NotificationOut.model_validate(n) for n in rows],
            total=total,
            page=page.page,
            page_size=page.page_size,
        )

    def unread_count(self, user: User) -> int:
        return self.repo.unread_count(user.id)

    def mark_read(self, user: User, notification_id: int) -> Notification:
        n = self.repo.get_for(notification_id, user.id)
        if n is None:  # another user's notification is indistinguishable from a missing one
            raise NotFoundError("Notification not found")
        if not n.is_read:
            n.is_read = True
            n.read_at = datetime.now(UTC)
            self.db.commit()
        return n

    def mark_all_read(self, user: User) -> int:
        updated = self.repo.mark_all_read(user.id, datetime.now(UTC))
        self.db.commit()
        return updated
