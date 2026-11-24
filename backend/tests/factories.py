"""Test-data builders that write real rows (no mocked database)."""

from itertools import count

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, Category, RoleName, Severity
from app.models import Bug, Role, User

_seq = count(1)


def get_role(db: Session, name: RoleName) -> Role:
    return db.execute(select(Role).where(Role.name == name)).scalar_one()


def make_user(db: Session, role: RoleName = RoleName.TESTER, **overrides) -> User:
    n = next(_seq)
    user = User(
        email=overrides.pop("email", f"user{n}@example.com"),
        full_name=overrides.pop("full_name", f"Test User {n}"),
        password_hash=overrides.pop("password_hash", "not-a-real-hash"),
        role=get_role(db, role),
        **overrides,
    )
    db.add(user)
    db.flush()
    return user


def make_bug(db: Session, reporter: User, **overrides) -> Bug:
    n = next(_seq)
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
