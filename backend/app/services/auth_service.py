"""Registration, login, token refresh (with rotation and reuse detection) and logout."""

import logging
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import RoleName
from app.core.exceptions import AuthenticationError, ConflictError, PermissionDeniedError
from app.core.security import (
    burn_password_check,
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    refresh_token_expiry,
    verify_password,
)
from app.models import RefreshToken, User
from app.repositories.user_repository import RefreshTokenRepository, UserRepository
from app.schemas.auth import RegisterRequest

logger = logging.getLogger(__name__)

INVALID_CREDENTIALS = "Invalid email or password"


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    refresh_token: str
    expires_in: int
    user: User


class AuthService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.users = UserRepository(db)
        self.tokens = RefreshTokenRepository(db)

    # -------------------------------------------------------------- register

    def register(self, data: RegisterRequest) -> User:
        if self.users.email_exists(data.email):
            raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN")
        user = User(
            email=data.email,
            full_name=data.full_name,
            password_hash=hash_password(data.password),
            role=self.users.get_role(RoleName.TESTER),  # D1: self-registration is always TESTER
            is_active=True,
        )
        try:
            self.users.add(user)
            self.db.commit()
        except IntegrityError as exc:  # concurrent registration with the same email
            self.db.rollback()
            raise ConflictError("An account with this email already exists", code="EMAIL_TAKEN") from exc
        logger.info("user registered", extra={"user_id": user.id})
        return user

    # -------------------------------------------------------------- login

    def login(self, email: str, password: str, *, user_agent: str | None = None) -> IssuedTokens:
        user = self.users.get_by_email(email)
        if user is None:
            burn_password_check(password)
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")
        if not verify_password(password, user.password_hash):
            logger.info("login failed", extra={"user_id": user.id})
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")
        # Only revealed after a correct password, so it doesn't help attackers enumerate accounts.
        if not user.is_active:
            raise PermissionDeniedError("This account has been deactivated", code="ACCOUNT_DISABLED")

        user.last_login_at = datetime.now(UTC)
        issued = self._issue(user, user_agent)
        self.db.commit()
        logger.info("login succeeded", extra={"user_id": user.id})
        return issued

    # -------------------------------------------------------------- refresh

    def refresh(self, raw_refresh_token: str, *, user_agent: str | None = None) -> IssuedTokens:
        now = datetime.now(UTC)
        stored = self.tokens.get_by_hash(hash_refresh_token(raw_refresh_token), for_update=True)
        if stored is None:
            raise AuthenticationError("Invalid refresh token", code="INVALID_REFRESH_TOKEN")

        if stored.revoked_at is not None:
            # A rotated (already used) token was presented again: likely theft. Kill every session of this user.
            revoked = self.tokens.revoke_all_for_user(stored.user_id, now)
            self.db.commit()
            logger.warning("refresh token reuse detected", extra={"user_id": stored.user_id, "revoked": revoked})
            raise AuthenticationError("Refresh token has been revoked", code="REFRESH_TOKEN_REUSED")

        if stored.expires_at <= now:
            raise AuthenticationError("Refresh token has expired", code="REFRESH_TOKEN_EXPIRED")

        user = self.users.get(stored.user_id)
        if user is None or not user.is_active:
            raise AuthenticationError("Account is not active", code="ACCOUNT_DISABLED")

        stored.revoked_at = now  # rotation: each refresh token is single-use
        issued = self._issue(user, user_agent)
        self.db.commit()
        return issued

    # -------------------------------------------------------------- logout

    def logout(self, user: User, raw_refresh_token: str) -> None:
        stored = self.tokens.get_by_hash(hash_refresh_token(raw_refresh_token), for_update=True)
        # Idempotent, and never reveals whether a token belongs to someone else.
        # The row is deleted rather than marked revoked: "revoked" means "rotated", and presenting a rotated token
        # is treated as theft (all sessions killed). A token that was simply signed out must not trigger that.
        if stored is not None and stored.user_id == user.id:
            self.db.delete(stored)
            self.db.commit()
        logger.info("logout", extra={"user_id": user.id})

    # -------------------------------------------------------------- helpers

    def _issue(self, user: User, user_agent: str | None) -> IssuedTokens:
        access_token, expires_in = create_access_token(user.id)
        raw_refresh = generate_refresh_token()
        self.tokens.add(
            RefreshToken(
                user_id=user.id,
                token_hash=hash_refresh_token(raw_refresh),
                expires_at=refresh_token_expiry(),
                user_agent=(user_agent or "")[:500] or None,
            )
        )
        return IssuedTokens(access_token=access_token, refresh_token=raw_refresh, expires_in=expires_in, user=user)
