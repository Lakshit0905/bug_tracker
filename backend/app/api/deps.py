"""FastAPI dependencies: authentication, role/capability guards, rate limiting."""

from collections.abc import Callable

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.enums import RoleName
from app.core.exceptions import AuthenticationError, PermissionDeniedError, RateLimitedError
from app.core.security import TokenError, decode_access_token
from app.db.session import get_db
from app.models import User
from app.services.permissions import Capability, has_capability

bearer_scheme = HTTPBearer(auto_error=False, description="Paste the access_token from /api/v1/auth/login")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AuthenticationError("Authentication required")
    try:
        claims = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise AuthenticationError(str(exc), code="INVALID_TOKEN") from exc

    user = db.get(User, claims.user_id)
    if user is None or not user.is_active:
        # Deactivation takes effect immediately, even for unexpired tokens.
        raise AuthenticationError("Account is not active", code="ACCOUNT_DISABLED")
    return user


def require_roles(*roles: RoleName) -> Callable[[User], User]:
    allowed = frozenset(roles)

    def _guard(user: User = Depends(get_current_user)) -> User:
        if user.role_name not in allowed:
            raise PermissionDeniedError(
                "You do not have permission to perform this action",
                details={"required_roles": sorted(allowed)},
            )
        return user

    return _guard


def require_capability(capability: Capability) -> Callable[[User], User]:
    def _guard(user: User = Depends(get_current_user)) -> User:
        if not has_capability(user.role_name, capability):
            raise PermissionDeniedError(
                "You do not have permission to perform this action", details={"required": capability.value}
            )
        return user

    return _guard


def _rate_limit(request: Request, limiter) -> None:
    client_ip = request.client.host if request.client else "unknown"
    allowed, retry_after = limiter.hit(f"{client_ip}:{request.url.path}")
    if not allowed:
        raise RateLimitedError(
            "Too many attempts. Please try again later.",
            details={"retry_after_seconds": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


def auth_rate_limit(request: Request) -> None:
    """Strict limit for credential endpoints (login, register)."""
    _rate_limit(request, request.app.state.auth_rate_limiter)


def refresh_rate_limit(request: Request) -> None:
    """Looser limit for token refresh, which legitimately happens on every page load and in every tab."""
    _rate_limit(request, request.app.state.refresh_rate_limiter)
