"""Test-data builders that write real rows (no mocked database)."""

from itertools import count

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, Category, RoleName, Severity
from app.core.security import create_access_token, hash_password
from app.models import Bug, Role, User

_seq = count(1)
DEFAULT_PASSWORD = "Passw0rd123"


def get_role(db: Session, name: RoleName) -> Role:
    return db.execute(select(Role).where(Role.name == name)).scalar_one()


def make_user(db: Session, role: RoleName = RoleName.TESTER, **overrides) -> User:
    n = next(_seq)
    user = User(
        email=overrides.pop("email", f"user{n}@example.com"),
        full_name=overrides.pop("full_name", f"Test User {n}"),
        password_hash=hash_password(overrides.pop("password", DEFAULT_PASSWORD)),
        role=get_role(db, role),
        **overrides,
    )
    db.add(user)
    db.flush()
    return user


def auth_headers(user: User) -> dict[str, str]:
    token, _ = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}


def make_bug(db: Session, reporter: User, **overrides) -> Bug:
    """Insert a bug directly in any state (test setup only — the API tests drive real transitions).
    Supplies the fields the DB constraints require for advanced statuses."""
    n = next(_seq)
    status = overrides.get("status", BugStatus.NEW)
    if status in (BugStatus.RESOLVED, BugStatus.CLOSED):
        overrides.setdefault("resolution_notes", "Fixed in test setup")
    if status == BugStatus.CLOSED:
        from datetime import UTC, datetime

        overrides.setdefault("closed_at", datetime.now(UTC))
    bug = Bug(
        title=overrides.pop("title", f"Sample bug number {n}"),
        description=overrides.pop("description", "A sufficiently long description of the defect."),
        severity=overrides.pop("severity", Severity.MEDIUM),
        category=overrides.pop("category", Category.UI),
        status=overrides.pop("status", BugStatus.NEW),
        reporter=reporter,
        steps_to_reproduce=overrides.pop("steps_to_reproduce", "1. Open page\n2. Click button"),
        expected_result=overrides.pop("expected_result", "Something happens"),
        actual_result=overrides.pop("actual_result", "Nothing happens"),
        **overrides,
    )
    db.add(bug)
    db.flush()
    db.refresh(bug)
    return bug
