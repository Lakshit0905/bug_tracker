"""Bug create / read / edit / priority / assignment (FR-BUG-1, FR-BUG-2, FR-HIST-1, FR-NOTIF-1)."""

import pytest
from fastapi.testclient import TestClient
from jsonschema import validate
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, RoleName
from app.models import Notification
from tests.api.helpers import BUG_SCHEMA, BUGS, advance, assign, bug_payload, create_bug, history
from tests.factories import auth_headers, make_bug, make_user

pytestmark = pytest.mark.api


# ================================================================== create


@pytest.mark.parametrize("who", ["tester", "pm"])
def test_fr_bug_1_create_bug(client: TestClient, team, who):
    reporter = getattr(team, who)
    res = client.post(BUGS, json=bug_payload(), headers=auth_headers(reporter))
    assert res.status_code == 201
    body = res.json()
    validate(body, BUG_SCHEMA)
    assert body["key"] == f"BUG-{body['id']}"
    assert body["status"] == "NEW"
    assert body["priority"] == "MEDIUM"
    assert body["reporter"]["id"] == reporter.id
    assert body["assignee"] is None
    assert res.headers["Location"] == f"/api/v1/bugs/{body['id']}"


@pytest.mark.parametrize("who", ["dev", "admin"])
def test_developers_and_admins_cannot_create_bugs(client: TestClient, team, who):
    res = client.post(BUGS, json=bug_payload(), headers=auth_headers(getattr(team, who)))
    assert res.status_code == 403


def test_create_requires_authentication(client: TestClient):
    assert client.post(BUGS, json=bug_payload()).status_code == 401


def test_pm_may_set_priority_on_create(client: TestClient, team):
    assert create_bug(client, team.pm, priority="CRITICAL")["priority"] == "CRITICAL"


def test_tester_may_not_set_priority_on_create(client: TestClient, team):
    res = client.post(BUGS, json=bug_payload(priority="CRITICAL"), headers=auth_headers(team.tester))
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "PRIORITY_NOT_PERMITTED"


def test_reporter_and_status_cannot_be_injected(client: TestClient, team):
    for extra in ({"reporter_id": team.pm.id}, {"status": "CLOSED"}, {"assignee_id": team.dev.id}):
        res = client.post(BUGS, json=bug_payload(**extra), headers=auth_headers(team.tester))
        assert res.status_code == 422, extra


def test_create_writes_created_history(client: TestClient, team):
    bug = create_bug(client, team.tester)
    entries = history(client, team.tester, bug["id"])
    assert [(e["action"], e["new_value"], e["actor"]["id"]) for e in entries] == [
        ("CREATED", bug["key"], team.tester.id)
    ]


def test_create_strips_whitespace(client: TestClient, team):
    assert create_bug(client, team.tester, title="   Padded title here   ")["title"] == "Padded title here"


@pytest.mark.parametrize(
    ("field", "value", "status"),
    [
        ("title", "abcd", 422),
        ("title", "abcde", 201),
        ("title", "x" * 200, 201),
        ("title", "x" * 201, 422),
        ("title", "     abcd     ", 422),
        ("description", "x" * 9, 422),
        ("description", "x" * 10, 201),
        ("description", "x" * 10_000, 201),
        ("description", "x" * 10_001, 422),
        ("environment", "", 201),
        ("environment", "x" * 255, 201),
        ("environment", "x" * 256, 422),
        ("steps_to_reproduce", "", 422),
        ("steps_to_reproduce", "x" * 5000, 201),
        ("steps_to_reproduce", "x" * 5001, 422),
        ("expected_result", " ", 422),
        ("actual_result", "y", 201),
        ("severity", "BLOCKER", 422),
        ("category", "FRONTEND", 422),
        ("severity", None, 422),
    ],
)
def test_create_field_boundaries(client: TestClient, team, field, value, status):
    res = client.post(BUGS, json=bug_payload(**{field: value}), headers=auth_headers(team.tester))
    assert res.status_code == status, res.text
    if status == 422:
        assert field in [d["loc"][-1] for d in res.json()["error"]["details"]]


@pytest.mark.parametrize(
    "missing",
    ["title", "description", "severity", "category", "steps_to_reproduce", "expected_result", "actual_result"],
)
def test_create_required_fields(client: TestClient, team, missing):
    payload = bug_payload()
    del payload[missing]
    assert client.post(BUGS, json=payload, headers=auth_headers(team.tester)).status_code == 422


# ================================================================== read


@pytest.mark.parametrize("who", ["tester", "dev", "pm", "admin"])
def test_every_role_can_view_a_bug(client: TestClient, team, who):
    bug = create_bug(client, team.tester)
    res = client.get(f"{BUGS}/{bug['id']}", headers=auth_headers(getattr(team, who)))
    assert res.status_code == 200
    validate(res.json(), BUG_SCHEMA)


def test_get_unknown_bug_404(client: TestClient, team):
    res = client.get(f"{BUGS}/999999", headers=auth_headers(team.tester))
    assert res.status_code == 404
    assert res.json()["error"]["details"] == {"bug_id": 999999}


@pytest.mark.parametrize("bad_id", ["abc", "1.5", "-x"])
def test_get_bug_with_non_integer_id_422(client: TestClient, team, bad_id):
    assert client.get(f"{BUGS}/{bad_id}", headers=auth_headers(team.tester)).status_code == 422


# ================================================================== edit


def test_pm_edits_any_bug_and_each_changed_field_is_audited(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = client.patch(
        f"{BUGS}/{bug['id']}",
        json={"title": "A clearer bug title", "severity": "CRITICAL", "category": "UI"},
        headers=auth_headers(team.pm),
    )
    assert res.status_code == 200
    assert res.json()["title"] == "A clearer bug title"
    updates = [e for e in history(client, team.pm, bug["id"]) if e["action"] == "FIELD_UPDATED"]
    # category was unchanged (UI → UI), so only two rows
    assert {(e["field_name"], e["old_value"], e["new_value"]) for e in updates} == {
        ("title", "Checkout button does nothing", "A clearer bug title"),
        ("severity", "HIGH", "CRITICAL"),
    }
    assert all(e["actor"]["id"] == team.pm.id for e in updates)


def test_reporter_edits_own_bug(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = client.patch(f"{BUGS}/{bug['id']}", json={"environment": "Firefox 133"}, headers=auth_headers(team.tester))
    assert res.status_code == 200
    assert res.json()["environment"] == "Firefox 133"


def test_tester_cannot_edit_someone_elses_bug(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = client.patch(f"{BUGS}/{bug['id']}", json={"title": "Hijacked title"}, headers=auth_headers(team.tester2))
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "NOT_REPORTER"


@pytest.mark.parametrize("status", ["IN_PROGRESS", "RESOLVED"])
def test_reporter_cannot_edit_once_work_started(client: TestClient, team, status):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], status)
    res = client.patch(f"{BUGS}/{bug['id']}", json={"title": "Changed late"}, headers=auth_headers(team.tester))
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "BUG_NOT_EDITABLE"


@pytest.mark.parametrize("status", ["OPEN", "REOPENED"])
def test_reporter_can_edit_while_open_or_reopened(client: TestClient, team, status):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], status)
    res = client.patch(f"{BUGS}/{bug['id']}", json={"title": "Still editable"}, headers=auth_headers(team.tester))
    assert res.status_code == 200


def test_closed_bug_cannot_be_edited_even_by_pm(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "CLOSED")
    res = client.patch(f"{BUGS}/{bug['id']}", json={"title": "Too late now"}, headers=auth_headers(team.pm))
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "BUG_CLOSED"


@pytest.mark.parametrize("who", ["dev", "admin"])
def test_developer_and_admin_cannot_edit(client: TestClient, team, who):
    bug = create_bug(client, team.tester)
    res = client.patch(f"{BUGS}/{bug['id']}", json={"title": "Not allowed"}, headers=auth_headers(getattr(team, who)))
    assert res.status_code == 403


@pytest.mark.parametrize(
    "payload",
    [{}, {"title": None}, {"status": "CLOSED"}, {"priority": "LOW"}, {"assignee_id": 1}, {"title": "abc"}],
)
def test_edit_rejects_empty_null_restricted_or_invalid(client: TestClient, team, payload):
    bug = create_bug(client, team.tester)
    assert client.patch(f"{BUGS}/{bug['id']}", json=payload, headers=auth_headers(team.pm)).status_code == 422


def test_edit_with_identical_values_writes_no_history(client: TestClient, team):
    bug = create_bug(client, team.tester)
    client.patch(f"{BUGS}/{bug['id']}", json={"title": bug["title"]}, headers=auth_headers(team.pm))
    assert [e["action"] for e in history(client, team.pm, bug["id"])] == ["CREATED"]


def test_edit_unknown_bug_404(client: TestClient, team):
    assert (
        client.patch(f"{BUGS}/999999", json={"title": "Whatever title"}, headers=auth_headers(team.pm)).status_code
        == 404
    )


# ================================================================== priority


def test_pm_sets_priority_with_history(client: TestClient, team):
    bug = create_bug(client, team.tester)
    res = client.put(f"{BUGS}/{bug['id']}/priority", json={"priority": "CRITICAL"}, headers=auth_headers(team.pm))
    assert res.status_code == 200 and res.json()["priority"] == "CRITICAL"
    entry = history(client, team.pm, bug["id"])[-1]
    assert (entry["action"], entry["old_value"], entry["new_value"]) == ("PRIORITY_CHANGED", "MEDIUM", "CRITICAL")


@pytest.mark.parametrize("who", ["tester", "dev", "admin"])
def test_only_pm_sets_priority(client: TestClient, team, who):
    bug = create_bug(client, team.tester)
    res = client.put(f"{BUGS}/{bug['id']}/priority", json={"priority": "LOW"}, headers=auth_headers(getattr(team, who)))
    assert res.status_code == 403


def test_priority_invalid_value_422(client: TestClient, team):
    bug = create_bug(client, team.tester)
    assert (
        client.put(
            f"{BUGS}/{bug['id']}/priority", json={"priority": "URGENT"}, headers=auth_headers(team.pm)
        ).status_code
        == 422
    )


def test_priority_on_closed_bug_409(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "CLOSED")
    res = client.put(f"{BUGS}/{bug['id']}/priority", json={"priority": "LOW"}, headers=auth_headers(team.pm))
    assert res.status_code == 409


# ================================================================== assignment


def test_fr_bug_2_pm_assigns_developer_with_history_and_notification(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    res = assign(client, team.pm, bug["id"], team.dev.id)
    assert res.status_code == 200
    assert res.json()["assignee"]["id"] == team.dev.id
    assert res.json()["status"] == "NEW"  # assignment does not auto-triage
    entry = history(client, team.pm, bug["id"])[-1]
    assert (entry["action"], entry["old_value"], entry["new_value"]) == ("ASSIGNED", None, "Dana Developer")
    notes = db_session.execute(select(Notification).where(Notification.recipient_id == team.dev.id)).scalars().all()
    assert [n.type.value for n in notes] == ["BUG_ASSIGNED"]
    assert bug["key"] in notes[0].message


def test_reassignment_notifies_old_and_new_assignee(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    assign(client, team.pm, bug["id"], team.dev.id)
    assign(client, team.pm, bug["id"], team.dev2.id)
    msgs = {
        uid: [
            n.message
            for n in db_session.execute(select(Notification).where(Notification.recipient_id == uid)).scalars()
        ]
        for uid in (team.dev.id, team.dev2.id)
    }
    assert any("unassigned you" in m for m in msgs[team.dev.id])
    assert any("assigned" in m and "to you" in m for m in msgs[team.dev2.id])


def test_assigning_same_developer_again_is_a_no_op(client: TestClient, team):
    bug = create_bug(client, team.tester)
    assign(client, team.pm, bug["id"], team.dev.id)
    assign(client, team.pm, bug["id"], team.dev.id)
    assert [e["action"] for e in history(client, team.pm, bug["id"])].count("ASSIGNED") == 1


@pytest.mark.parametrize("who", ["tester", "dev", "admin"])
def test_only_pm_assigns(client: TestClient, team, who):
    bug = create_bug(client, team.tester)
    assert assign(client, getattr(team, who), bug["id"], team.dev.id).status_code == 403


@pytest.mark.parametrize("target", ["tester", "pm", "admin", "inactive_dev", "missing"])
def test_assignee_must_be_active_developer(client: TestClient, team, db_session: Session, target):
    bug = create_bug(client, team.tester)
    if target == "inactive_dev":
        target_id = make_user(db_session, RoleName.DEVELOPER, is_active=False).id
    elif target == "missing":
        target_id = 999_999
    else:
        target_id = getattr(team, target).id
    res = assign(client, team.pm, bug["id"], target_id)
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INVALID_ASSIGNEE"


def test_unassign_allowed_while_open(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "OPEN")
    assign(client, team.pm, bug["id"], team.dev.id)
    res = assign(client, team.pm, bug["id"], None)
    assert res.status_code == 200 and res.json()["assignee"] is None


@pytest.mark.parametrize("status", ["IN_PROGRESS", "RESOLVED"])
def test_cannot_unassign_bug_being_worked_on(client: TestClient, team, status):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], status)
    res = assign(client, team.pm, bug["id"], None)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "ASSIGNEE_REQUIRED"


def test_can_reassign_bug_in_progress(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "IN_PROGRESS")
    assert assign(client, team.pm, bug["id"], team.dev2.id).json()["assignee"]["id"] == team.dev2.id


def test_cannot_assign_closed_bug(client: TestClient, team):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "CLOSED")
    assert assign(client, team.pm, bug["id"], team.dev2.id).status_code == 409


def test_assignee_field_is_required_in_body(client: TestClient, team):
    bug = create_bug(client, team.tester)
    assert client.put(f"{BUGS}/{bug['id']}/assignee", json={}, headers=auth_headers(team.pm)).status_code == 422


def test_deactivated_reporter_bug_still_readable(client: TestClient, team, db_session: Session):
    """D8: deactivating a user keeps their historical records intact."""
    bug = make_bug(db_session, team.tester2, status=BugStatus.NEW)
    team.tester2.is_active = False
    db_session.flush()
    res = client.get(f"{BUGS}/{bug.id}", headers=auth_headers(team.pm))
    assert res.status_code == 200 and res.json()["reporter"]["id"] == team.tester2.id
