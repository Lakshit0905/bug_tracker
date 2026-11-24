"""Verifies the migrated PostgreSQL schema: tables, seed data, keys, constraints, indexes and timestamps."""

import pytest
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, HistoryAction, NotificationType, RoleName
from app.db.base import Base
from app.models import BugComment, BugHistory, Notification, Role
from tests.factories import make_bug, make_user

pytestmark = pytest.mark.integration

EXPECTED_TABLES = {
    "roles",
    "users",
    "refresh_tokens",
    "bugs",
    "bug_comments",
    "bug_history",
    "bug_attachments",
    "notifications",
    "alembic_version",
}


def _expect_integrity_error(db: Session, constraint: str, sql: str, params: dict | None = None) -> None:
    with pytest.raises(IntegrityError) as exc_info, db.begin_nested():
        db.execute(text(sql), params or {})
    assert constraint in str(exc_info.value)


# ---------------------------------------------------------------- structure


def test_all_tables_created_by_migration(db_session: Session):
    assert set(inspect(db_session.connection()).get_table_names()) == EXPECTED_TABLES


def test_models_and_migrations_are_in_sync(db_session: Session):
    ctx = MigrationContext.configure(db_session.connection(), opts={"compare_type": True})
    assert compare_metadata(ctx, Base.metadata) == []


def test_roles_are_seeded(db_session: Session):
    names = set(db_session.execute(select(Role.name)).scalars())
    assert names == set(RoleName)


def test_pg_trgm_extension_installed(db_session: Session):
    assert db_session.execute(text("SELECT 1 FROM pg_extension WHERE extname='pg_trgm'")).scalar() == 1


@pytest.mark.parametrize(
    "index_name",
    [
        "ix_bugs_status",
        "ix_bugs_severity",
        "ix_bugs_priority",
        "ix_bugs_category",
        "ix_bugs_assignee_id",
        "ix_bugs_assignee_id_status",
        "ix_bugs_status_created_at",
        "ix_bugs_title_trgm",
        "ix_bugs_description_trgm",
        "ix_bug_history_bug_id_created_at",
        "ix_notifications_recipient_id_is_read_created_at",
    ],
)
def test_filter_indexes_exist(db_session: Session, index_name: str):
    found = db_session.execute(text("SELECT 1 FROM pg_indexes WHERE indexname = :n"), {"n": index_name}).scalar()
    assert found == 1


# ---------------------------------------------------------------- users


def test_user_email_must_be_unique(db_session: Session):
    make_user(db_session, email="dup@example.com")
    _expect_integrity_error(
        db_session,
        "uq_users_email",
        "INSERT INTO users(email, full_name, password_hash, role_id) VALUES ('dup@example.com','Someone','h',1)",
    )


def test_user_email_must_be_lowercase(db_session: Session):
    _expect_integrity_error(
        db_session,
        "ck_users_email_lowercase",
        "INSERT INTO users(email, full_name, password_hash, role_id) VALUES ('Upper@Example.com','Someone','h',1)",
    )


def test_user_requires_existing_role(db_session: Session):
    _expect_integrity_error(
        db_session,
        "fk_users_role_id_roles",
        "INSERT INTO users(email, full_name, password_hash, role_id) VALUES ('r@example.com','Someone','h',999)",
    )


def test_user_defaults(db_session: Session):
    user = make_user(db_session, RoleName.DEVELOPER)
    db_session.refresh(user)
    assert user.is_active is True
    assert user.role_name == RoleName.DEVELOPER
    assert user.created_at is not None and user.updated_at is not None


# ---------------------------------------------------------------- bugs


def test_bug_defaults_and_generated_key(db_session: Session):
    bug = make_bug(db_session, make_user(db_session))
    assert bug.key == f"BUG-{bug.id}"
    assert bug.status == BugStatus.NEW
    assert bug.priority == "MEDIUM"
    assert bug.assignee_id is None


def test_bug_rejects_invalid_enum_value(db_session: Session):
    reporter = make_user(db_session)
    _expect_integrity_error(
        db_session,
        "ck_bugs_bug_status",
        "INSERT INTO bugs(title, description, severity, category, status, reporter_id, steps_to_reproduce,"
        " expected_result, actual_result) VALUES ('Valid title','Valid description','LOW','UI','DONE',:r,'s','e','a')",
        {"r": reporter.id},
    )


def test_bug_title_length_enforced(db_session: Session):
    reporter = make_user(db_session)
    _expect_integrity_error(
        db_session,
        "ck_bugs_title_length",
        "INSERT INTO bugs(title, description, severity, category, reporter_id, steps_to_reproduce,"
        " expected_result, actual_result) VALUES ('Shrt','Valid description','LOW','UI',:r,'s','e','a')",
        {"r": reporter.id},
    )


def test_in_progress_bug_requires_assignee(db_session: Session):
    bug = make_bug(db_session, make_user(db_session))
    _expect_integrity_error(
        db_session,
        "ck_bugs_active_work_requires_assignee",
        "UPDATE bugs SET status='IN_PROGRESS' WHERE id=:id",
        {"id": bug.id},
    )


def test_resolved_bug_requires_resolution_notes(db_session: Session):
    dev = make_user(db_session, RoleName.DEVELOPER)
    bug = make_bug(db_session, make_user(db_session), assignee=dev)
    _expect_integrity_error(
        db_session,
        "ck_bugs_resolution_requires_notes",
        "UPDATE bugs SET status='RESOLVED' WHERE id=:id",
        {"id": bug.id},
    )


def test_closed_bug_requires_closed_at(db_session: Session):
    dev = make_user(db_session, RoleName.DEVELOPER)
    bug = make_bug(db_session, make_user(db_session), assignee=dev, resolution_notes="Fixed")
    _expect_integrity_error(
        db_session,
        "ck_bugs_closed_requires_closed_at",
        "UPDATE bugs SET status='CLOSED' WHERE id=:id",
        {"id": bug.id},
    )


def test_reporter_cannot_be_deleted_while_referenced(db_session: Session):
    reporter = make_user(db_session)
    make_bug(db_session, reporter)
    _expect_integrity_error(
        db_session, "fk_bugs_reporter_id_users", "DELETE FROM users WHERE id=:id", {"id": reporter.id}
    )


def test_orm_update_refreshes_updated_at(db_session: Session):
    bug = make_bug(db_session, make_user(db_session))
    # now() is frozen for the whole test transaction, so backdate the row first to observe the ORM's onupdate.
    db_session.execute(text("UPDATE bugs SET updated_at = now() - interval '1 day' WHERE id=:id"), {"id": bug.id})
    db_session.refresh(bug)
    backdated = bug.updated_at

    bug.title = "Renamed via the ORM"
    db_session.flush()
    db_session.refresh(bug)
    assert bug.updated_at > backdated


def test_bug_children_cascade_on_bug_delete(db_session: Session):
    reporter = make_user(db_session)
    bug = make_bug(db_session, reporter)
    db_session.add_all(
        [
            BugComment(bug_id=bug.id, author_id=reporter.id, body="First!"),
            BugHistory(bug_id=bug.id, actor_id=reporter.id, action=HistoryAction.CREATED),
            Notification(
                recipient_id=reporter.id, bug_id=bug.id, type=NotificationType.COMMENT_ADDED, message="New comment"
            ),
        ]
    )
    db_session.flush()
    db_session.execute(text("DELETE FROM bugs WHERE id=:id"), {"id": bug.id})
    for table in ("bug_comments", "bug_history", "notifications"):
        remaining = db_session.execute(text(f"SELECT count(*) FROM {table} WHERE bug_id=:id"), {"id": bug.id})  # noqa: S608
        assert remaining.scalar() == 0, table


def test_comment_body_cannot_be_empty(db_session: Session):
    reporter = make_user(db_session)
    bug = make_bug(db_session, reporter)
    _expect_integrity_error(
        db_session,
        "ck_bug_comments_body_length",
        "INSERT INTO bug_comments(bug_id, author_id, body) VALUES (:b, :a, '')",
        {"b": bug.id, "a": reporter.id},
    )


def test_attachment_size_must_be_positive(db_session: Session):
    reporter = make_user(db_session)
    bug = make_bug(db_session, reporter)
    _expect_integrity_error(
        db_session,
        "ck_bug_attachments_size_positive",
        "INSERT INTO bug_attachments(bug_id, uploaded_by_id, original_filename, stored_filename, content_type,"
        " size_bytes) VALUES (:b, :u, 'a.png', 'x.png', 'image/png', 0)",
        {"b": bug.id, "u": reporter.id},
    )


def test_keyword_search_uses_trigram_index(db_session: Session):
    db_session.execute(text("SET LOCAL enable_seqscan = off"))
    plan = "\n".join(db_session.execute(text("EXPLAIN SELECT id FROM bugs WHERE title ILIKE '%login%'")).scalars())
    assert "ix_bugs_title_trgm" in plan
