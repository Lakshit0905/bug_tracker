"""Profile self-service and administrator user management."""

import logging
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.core.enums import RoleName
from app.core.exceptions import DomainValidationError, NotFoundError, PermissionDeniedError
from app.core.security import hash_password, verify_password
from app.models import User
from app.repositories.user_repository import RefreshTokenRepository, UserRepository
from app.schemas.common import Page, PageParams
from app.schemas.user import UserOut

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.tokens = RefreshTokenRepository(db)

    # -------------------------------------------------------------- self-service

    def update_profile(self, user: User, full_name: str) -> User:
        user.full_name = full_name
        self.db.commit()
        return user

    def change_password(self, user: User, current_password: str, new_password: str) -> None:
        if not verify_password(current_password, user.password_hash):
            raise DomainValidationError("Current password is incorrect", code="INVALID_CURRENT_PASSWORD")
        if verify_password(new_password, user.password_hash):
            raise DomainValidationError("New password must differ from the current one", code="PASSWORD_REUSED")
        user.password_hash = hash_password(new_password)
        # Force re-login on every other device.
        self.tokens.revoke_all_for_user(user.id, datetime.now(UTC))
        self.db.commit()
        logger.info("password changed", extra={"user_id": user.id})

    # -------------------------------------------------------------- admin

    def get(self, user_id: int) -> User:
        user = self.users.get(user_id)
        if user is None:
            raise NotFoundError("User not found", details={"user_id": user_id})
        return user

    def search(
        self, *, query: str | None, role: RoleName | None, is_active: bool | None, page: PageParams
    ) -> Page[UserOut]:
        rows, total = self.users.search(
            query=query, role=role, is_active=is_active, offset=page.offset, limit=page.page_size
        )
        return Page[UserOut](
            items=[UserOut.model_validate(u) for u in rows], total=total, page=page.page, page_size=page.page_size
        )

    def change_role(self, admin: User, user_id: int, role: RoleName) -> User:
        target = self.get(user_id)
        if target.id == admin.id:
            raise PermissionDeniedError("Administrators cannot change their own role", code="SELF_MODIFICATION")
        if target.role_name != role:
            old = target.role_name
            target.role = self.users.get_role(role)
            self.db.commit()
            logger.info("role changed", extra={"actor_id": admin.id, "user_id": target.id, "old": old, "new": role})
        return target

    def set_active(self, admin: User, user_id: int, is_active: bool) -> User:
        target = self.get(user_id)
        if target.id == admin.id:
            raise PermissionDeniedError("Administrators cannot deactivate their own account", code="SELF_MODIFICATION")
        if target.is_active != is_active:
            target.is_active = is_active
            if not is_active:
                # Existing access tokens are rejected by the auth dependency (is_active is checked per request);
                # refresh tokens are revoked so no new access tokens can be minted.
                self.tokens.revoke_all_for_user(target.id, datetime.now(UTC))
            self.db.commit()
            logger.info(
                "account status changed", extra={"actor_id": admin.id, "user_id": target.id, "is_active": is_active}
            )
        return target

    def list_developers(self) -> list[User]:
        return self.users.list_active_by_role(RoleName.DEVELOPER)
