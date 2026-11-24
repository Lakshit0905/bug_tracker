"""Data access for users, roles and refresh tokens. No business rules, no HTTP concepts."""

from datetime import datetime

from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import Session

from app.core.enums import RoleName
from app.models import RefreshToken, Role, User


class UserRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: int) -> User | None:
        return self.db.get(User, user_id)

    def get_by_email(self, email: str) -> User | None:
        return self.db.execute(select(User).where(User.email == email.strip().lower())).scalar_one_or_none()

    def email_exists(self, email: str) -> bool:
        return self.db.execute(select(func.count()).where(User.email == email)).scalar_one() > 0

    def get_role(self, name: RoleName) -> Role:
        return self.db.execute(select(Role).where(Role.name == name)).scalar_one()

    def add(self, user: User) -> User:
        self.db.add(user)
        self.db.flush()
        return user

    def search(
        self,
        *,
        query: str | None,
        role: RoleName | None,
        is_active: bool | None,
        offset: int,
        limit: int,
    ) -> tuple[list[User], int]:
        stmt = select(User).join(User.role)
        if query:
            like = f"%{query.strip()}%"
            stmt = stmt.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
        if role:
            stmt = stmt.where(Role.name == role)
        if is_active is not None:
            stmt = stmt.where(User.is_active.is_(is_active))
        total = self.db.execute(select(func.count()).select_from(stmt.order_by(None).subquery())).scalar_one()
        rows = self.db.execute(stmt.order_by(User.full_name, User.id).offset(offset).limit(limit)).scalars().all()
        return list(rows), total

    def list_active_by_role(self, role: RoleName) -> list[User]:
        stmt = (
            select(User)
            .join(User.role)
            .where(Role.name == role, User.is_active.is_(True))
            .order_by(User.full_name, User.id)
        )
        return list(self.db.execute(stmt).scalars().all())


class RefreshTokenRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, token: RefreshToken) -> RefreshToken:
        self.db.add(token)
        self.db.flush()
        return token

    def get_by_hash(self, token_hash: str, *, for_update: bool = False) -> RefreshToken | None:
        stmt = select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        if for_update:
            stmt = stmt.with_for_update()
        return self.db.execute(stmt).scalar_one_or_none()

    def revoke_all_for_user(self, user_id: int, now: datetime) -> int:
        result = self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        return result.rowcount or 0
