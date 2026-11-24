"""Password hashing and token primitives. No database access here — pure functions, unit-tested in isolation."""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import get_settings

BCRYPT_MAX_BYTES = 72  # bcrypt silently ignores bytes beyond 72; the API rejects longer passwords instead.
TokenType = Literal["access"]


class TokenError(Exception):
    """Raised when a token is missing, malformed, expired, or otherwise invalid."""


# ------------------------------------------------------------------ passwords


def hash_password(password: str) -> str:
    raw = password.encode("utf-8")
    if len(raw) > BCRYPT_MAX_BYTES:
        raise ValueError("Password exceeds bcrypt's 72-byte limit")
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=get_settings().bcrypt_rounds)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    raw = password.encode("utf-8")
    if len(raw) > BCRYPT_MAX_BYTES:
        return False
    try:
        return bcrypt.checkpw(raw, password_hash.encode("utf-8"))
    except ValueError:  # malformed hash
        return False


_DUMMY_HASH: str | None = None


def burn_password_check(password: str) -> None:
    """Spend the same time as a real check, so unknown emails can't be detected by response timing."""
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password(secrets.token_urlsafe(16))
    verify_password(password, _DUMMY_HASH)


# ------------------------------------------------------------------ access tokens (JWT)


@dataclass(frozen=True)
class AccessTokenClaims:
    user_id: int
    jti: str
    expires_at: datetime


def create_access_token(user_id: int, *, now: datetime | None = None) -> tuple[str, int]:
    """Return (jwt, expires_in_seconds). Only the user id is embedded: role and active status are
    re-read from the database on every request, so a role change or deactivation applies immediately."""
    settings = get_settings()
    issued = now or datetime.now(UTC)
    lifetime = timedelta(minutes=settings.jwt_access_token_minutes)
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iss": settings.jwt_issuer,
        "iat": issued,
        "exp": issued + lifetime,
        "jti": uuid.uuid4().hex,
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> AccessTokenClaims:
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],  # pinned: prevents "alg: none" / algorithm confusion
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "exp", "iat", "iss", "type", "jti"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid token") from exc

    if payload.get("type") != "access":
        raise TokenError("Invalid token type")
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise TokenError("Invalid token subject") from exc
    return AccessTokenClaims(
        user_id=user_id, jti=payload["jti"], expires_at=datetime.fromtimestamp(payload["exp"], UTC)
    )


# ------------------------------------------------------------------ refresh tokens (opaque)


def generate_refresh_token() -> str:
    """Opaque random token. The client keeps it; the server stores only its SHA-256 hash."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def refresh_token_expiry(now: datetime | None = None) -> datetime:
    return (now or datetime.now(UTC)) + timedelta(days=get_settings().jwt_refresh_token_days)
