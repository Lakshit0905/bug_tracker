"""Create (or promote) the first administrator from environment variables. Idempotent.

Usage (from backend/):  python -m scripts.seed_admin
Reads ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULL_NAME from the environment or .env (see .env.example).
"""

import sys

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.enums import RoleName
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import _check_password_policy


def seed_admin(db: Session, email: str, password: str, full_name: str) -> tuple[User, str]:
    """Returns (user, action) where action is 'created', 'promoted' or 'unchanged'."""
    email = email.strip().lower()
    _check_password_policy(password)
    repo = UserRepository(db)
    admin_role = repo.get_role(RoleName.ADMIN)
    user = repo.get_by_email(email)

    if user is None:
        user = repo.add(User(email=email, full_name=full_name, password_hash=hash_password(password), role=admin_role))
        action = "created"
    elif user.role_name != RoleName.ADMIN or not user.is_active:
        user.role = admin_role
        user.is_active = True
        action = "promoted"
    else:
        action = "unchanged"
    db.commit()
    return user, action


def main() -> int:
    settings = get_settings()
    email, password, full_name = settings.admin_email, settings.admin_password, settings.admin_full_name
    if not email or not password:
        print("ADMIN_EMAIL and ADMIN_PASSWORD must be set (environment or .env).", file=sys.stderr)
        return 1
    with SessionLocal() as db:
        try:
            user, action = seed_admin(db, email, password, full_name)
        except ValueError as exc:
            print(f"Invalid ADMIN_PASSWORD: {exc}", file=sys.stderr)
            return 1
    print(f"Administrator {user.email}: {action}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
