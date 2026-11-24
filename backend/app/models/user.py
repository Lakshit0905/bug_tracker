from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.enums import RoleName
from app.db.base import Base, CreatedAtMixin, TimestampMixin, str_enum

if TYPE_CHECKING:
    from app.models.bug import Bug


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[RoleName] = mapped_column(str_enum(RoleName, "role_name"), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    users: Mapped[list["User"]] = relationship(back_populates="role")

    def __repr__(self) -> str:
        return f"<Role {self.name}>"


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email = lower(email)", name="email_lowercase"),
        CheckConstraint("char_length(full_name) >= 2", name="full_name_min_length"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    role: Mapped[Role] = relationship(back_populates="users", lazy="joined")
    reported_bugs: Mapped[list["Bug"]] = relationship(back_populates="reporter", foreign_keys="Bug.reporter_id")
    assigned_bugs: Mapped[list["Bug"]] = relationship(back_populates="assignee", foreign_keys="Bug.assignee_id")

    @property
    def role_name(self) -> RoleName:
        return self.role.name

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"


class RefreshToken(CreatedAtMixin, Base):
    """Server-side record of issued refresh tokens (only a SHA-256 hash is stored) to support logout/revocation."""

    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_tokens_user_id_expires_at", "user_id", "expires_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_agent: Mapped[str | None] = mapped_column(Text)
