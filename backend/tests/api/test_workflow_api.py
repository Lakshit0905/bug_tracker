"""Lifecycle through the HTTP API (FR-BUG-3): happy path, side effects, error mapping, notifications."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification
from tests.api.helpers import BUGS, advance, assign, create_bug, history, transition
from tests.factories import auth_headers

pytestmark = pytest.mark.api


def notifications_for(db: Session, user_id: int) -> list[Notification]:
    stmt = select(Notification).where(Notification.recipient_id == user_id).order_by(Notification.id)
    return list(db.execute(stmt).unique().scalars())


def test_full_lifecycle_with_reopen(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    bid = bug["id"]

    assert transition(client, team.pm, bid, "OPEN").json()["status"] == "OPEN"
    assign(client, team.pm, bid, team.dev.id)
    assert transition(client, team.dev, bid, "IN_PROGRESS").json()["status"] == "IN_PROGRESS"

    resolved = transition(client, team.dev, bid, "RESOLVED", resolution_notes="Null check added").json()
    assert resolved["status"] == "RESOLVED"
    assert resolved["resolution_notes"] == "Null check added"
    assert resolved["resolved_at"] is not None

    reopened = transition(client, team.tester, bid, "REOPENED", reason="Fails on mobile").json()
    assert reopened["status"] == "REOPENED"
    assert reopened["resolved_at"] is None and reopened["closed_at"] is None
    assert reopened["resolution_notes"] == "Null check added"  # previous fix notes kept for context

    transition(client, team.dev, bid, "IN_PROGRESS")
    transition(client, team.dev, bid, "RESOLVED", resolution_notes="Mobile breakpoint fixed too")
    closed = transition(client, team.tester, bid, "CLOSED").json()
    assert closed["status"] == "CLOSED" and closed["closed_at"] is not None

    statuses = [
        (e["old_value"], e["new_value"]) for e in history(client, team.pm, bid) if e["action"] == "STATUS_CHANGED"
    ]
    assert statuses == [
        ("NEW", "OPEN"),
        ("OPEN", "IN_PROGRESS"),
        ("IN_PROGRESS", "RESOLVED"),
        ("RESOLVED", "REOPENED"),
        ("REOPENED", "IN_PROGRESS"),
        ("IN_PROGRESS", "RESOLVED"),
        ("RESOLVED", "CLOSED"),
    ]
    notes_changes = [e for e in history(client, team.pm, bid) if e["field_name"] == "resolution_notes"]
    assert [(e["old_value"], e["new_value"]) for e in notes_changes] == [
        (None, "Null check added"),
        ("Null check added", "Mobile breakpoint fixed too"),
    ]


def test_closed_bug_can_be_reopened_by_pm(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "CLOSED")
    res = transition(client, team.pm, bug["id"], "REOPENED", reason="Customer reports regression")
    assert res.status_code == 200 and res.json()["closed_at"] is None


def test_reopen_reason_is_recorded_as_comment(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "RESOLVED")
    transition(client, team.tester, bug["id"], "REOPENED", reason="  Still crashes on submit  ")
    comments = client.get(f"{BUGS}/{bug['id']}/comments", headers=auth_headers(team.pm)).json()
    assert comments[-1]["body"] == "Reopened: Still crashes on submit"
    assert comments[-1]["author"]["id"] == team.tester.id


@pytest.mark.parametrize(
    ("setup", "actor", "to", "extra", "status", "code"),
    [
        ("NEW", "pm", "CLOSED", {}, 409, "INVALID_TRANSITION"),
        ("NEW", "pm", "NEW", {}, 409, "INVALID_TRANSITION"),
        ("NEW", "tester", "OPEN", {}, 403, "TRANSITION_NOT_PERMITTED"),
        ("OPEN", "pm", "IN_PROGRESS", {}, 403, "TRANSITION_NOT_PERMITTED"),
        ("OPEN", "dev2", "IN_PROGRESS", {}, 409, "ASSIGNEE_REQUIRED"),  # OPEN without assignee
        ("IN_PROGRESS", "dev2", "RESOLVED", {"resolution_notes": "x"}, 403, "NOT_ASSIGNEE"),
        ("IN_PROGRESS", "dev", "RESOLVED", {}, 422, "RESOLUTION_NOTES_REQUIRED"),
        ("IN_PROGRESS", "dev", "RESOLVED", {"resolution_notes": "   "}, 422, "RESOLUTION_NOTES_REQUIRED"),
        ("RESOLVED", "dev", "CLOSED", {}, 403, "TRANSITION_NOT_PERMITTED"),
        ("RESOLVED", "tester", "REOPENED", {}, 422, "REASON_REQUIRED"),
        ("CLOSED", "tester", "OPEN", {}, 409, "INVALID_TRANSITION"),
        ("RESOLVED", "admin", "CLOSED", {}, 403, "FORBIDDEN"),
    ],
)
def test_transition_errors_map_to_status_codes(client: TestClient, team, setup, actor, to, extra, status, code):
    bug = create_bug(client, team.tester)
    if setup != "NEW":
        advance(client, team, bug["id"], setup)
    before = client.get(f"{BUGS}/{bug['id']}", headers=auth_headers(team.pm)).json()["status"]

    res = transition(client, getattr(team, actor), bug["id"], to, **extra)
    assert res.status_code == status, res.text
    assert res.json()["error"]["code"] == code
    after = client.get(f"{BUGS}/{bug['id']}", headers=auth_headers(team.pm)).json()["status"]
    assert after == before  # rejected transitions change nothing


def test_invalid_transition_reports_allowed_targets(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = transition(client, team.pm, bug["id"], "RESOLVED")
    assert res.json()["error"]["details"] == {"from": "NEW", "to": "RESOLVED", "allowed_targets": ["OPEN"]}


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"to_status": "DONE"},
        {"to_status": "RESOLVED", "resolution_notes": "x" * 5001},
        {"to_status": "REOPENED", "reason": "x" * 2001},
    ],
)
def test_transition_body_validation(client: TestClient, team, payload):
    bug = create_bug(client, team.tester)
    res = client.post(f"{BUGS}/{bug['id']}/transitions", json=payload, headers=auth_headers(team.pm))
    assert res.status_code == 422


def test_transition_unknown_bug_404(client: TestClient, team):
    assert transition(client, team.pm, 999_999, "OPEN").status_code == 404


# ------------------------------------------------------------------ allowed-transitions endpoint


@pytest.mark.parametrize(
    ("status", "who", "expected"),
    [
        ("NEW", "pm", [("OPEN", False, False)]),
        ("NEW", "tester", []),
        ("IN_PROGRESS", "dev", [("RESOLVED", True, False)]),
        ("IN_PROGRESS", "dev2", []),
        ("RESOLVED", "tester", [("CLOSED", False, False), ("REOPENED", False, True)]),
        ("RESOLVED", "admin", []),
    ],
)
def test_allowed_transitions_endpoint(client: TestClient, team, status, who, expected):
    bug = create_bug(client, team.tester)
    if status != "NEW":
        advance(client, team, bug["id"], status)
    res = client.get(f"{BUGS}/{bug['id']}/allowed-transitions", headers=auth_headers(getattr(team, who)))
    assert res.status_code == 200
    got = sorted((t["to_status"], t["requires_resolution_notes"], t["requires_reason"]) for t in res.json())
    assert got == expected
    assert all(t["label"] for t in res.json())


# ------------------------------------------------------------------ notifications (FR-NOTIF-1)


def test_status_change_notifies_reporter_and_assignee_but_not_actor(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "IN_PROGRESS")  # dev performed the last step
    dev_types = [n.type.value for n in notifications_for(db_session, team.dev.id)]
    tester_types = [n.type.value for n in notifications_for(db_session, team.tester.id)]
    # Tester (reporter) hears about NEW→OPEN and OPEN→IN_PROGRESS; dev hears about the assignment and the triage
    # (NEW→OPEN happened before assignment, so dev only gets the assignment) but not about their own action.
    assert tester_types == ["STATUS_CHANGED", "STATUS_CHANGED"]
    assert dev_types == ["BUG_ASSIGNED"]


def test_reopen_notifies_assignee_reporter_and_project_managers(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "RESOLVED")
    transition(client, team.tester2, bug["id"], "REOPENED", reason="Regression")
    for user in (team.dev, team.tester, team.pm):
        assert "BUG_REOPENED" in [n.type.value for n in notifications_for(db_session, user.id)], user.full_name
    assert "BUG_REOPENED" not in [n.type.value for n in notifications_for(db_session, team.tester2.id)]


def test_inactive_users_are_not_notified(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    team.tester.is_active = False
    db_session.flush()
    transition(client, team.pm, bug["id"], "OPEN")
    assert notifications_for(db_session, team.tester.id) == []
