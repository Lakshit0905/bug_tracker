import pytest
from sqlalchemy.orm import Session

from app.core.enums import RoleName
from app.core.security import verify_password
from scripts.seed_admin import seed_admin
from tests.factories import make_user

pytestmark = pytest.mark.integration


def test_seed_creates_admin(db_session: Session):
    user, action = seed_admin(db_session, " Root@Example.com ", "Adm1nPassword", "Root Admin")
    assert action == "created"
    assert user.email == "root@example.com"
    assert user.role_name == RoleName.ADMIN
    assert verify_password("Adm1nPassword", user.password_hash)


def test_seed_is_idempotent(db_session: Session):
    seed_admin(db_session, "root@example.com", "Adm1nPassword", "Root")
    _, action = seed_admin(db_session, "root@example.com", "Adm1nPassword", "Root")
    assert action == "unchanged"


def test_seed_promotes_and_reactivates_existing_user(db_session: Session):
    existing = make_user(db_session, RoleName.TESTER, email="promote@example.com", is_active=False)
    user, action = seed_admin(db_session, "promote@example.com", "Adm1nPassword", "x")
    assert action == "promoted"
    assert user.id == existing.id and user.role_name == RoleName.ADMIN and user.is_active


def test_seed_rejects_weak_password(db_session: Session):
    with pytest.raises(ValueError, match="at least 8"):
        seed_admin(db_session, "weak@example.com", "short1", "x")
