"""Notifications (FR-NOTIF-2) and dashboard / reports (FR-DASH-1)."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from jsonschema import validate
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, Severity
from app.models import BugHistory
from tests.api.helpers import BUGS, advance, assign, create_bug, transition
from tests.factories import auth_headers, make_bug

pytestmark = pytest.mark.api

N = "/api/v1/notifications"
D = "/api/v1/dashboard"

NOTIFICATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["id", "type", "message", "bug_id", "bug_key", "is_read", "created_at", "read_at"],
}
NOTIFICATION_SCHEMA["properties"] = {k: {} for k in NOTIFICATION_SCHEMA["required"]}


def make_notifications(client, team, count: int) -> int:
    """Each comment by the PM notifies the reporter (tester). Returns the bug id."""
    bug = create_bug(client, team.tester)
    for i in range(count):
        client.post(f"{BUGS}/{bug['id']}/comments", json={"body": f"note {i}"}, headers=auth_headers(team.pm))
    return bug["id"]


# ================================================================== notifications


def test_list_notifications_newest_first(client: TestClient, team):
    make_notifications(client, team, 3)
    res = client.get(N, headers=auth_headers(team.tester))
    assert res.status_code == 200
    body = res.json()
    assert body["total"] == 3
    for item in body["items"]:
        validate(item, NOTIFICATION_SCHEMA)
    assert [i["message"][-6:] for i in body["items"]] == ["note 2", "note 1", "note 0"]
    assert body["items"][0]["bug_key"].startswith("BUG-")


def test_unread_count_and_mark_one_read(client: TestClient, team):
    make_notifications(client, team, 2)
    h = auth_headers(team.tester)
    assert client.get(f"{N}/unread-count", headers=h).json() == {"unread": 2}
    first = client.get(N, headers=h).json()["items"][0]
    res = client.post(f"{N}/{first['id']}/read", headers=h)
    assert res.status_code == 200 and res.json()["is_read"] is True and res.json()["read_at"]
    assert client.get(f"{N}/unread-count", headers=h).json() == {"unread": 1}
    # idempotent
    assert client.post(f"{N}/{first['id']}/read", headers=h).status_code == 200
    assert client.get(f"{N}/unread-count", headers=h).json() == {"unread": 1}


def test_unread_only_filter(client: TestClient, team):
    make_notifications(client, team, 3)
    h = auth_headers(team.tester)
    first = client.get(N, headers=h).json()["items"][0]
    client.post(f"{N}/{first['id']}/read", headers=h)
    assert client.get(N, params={"unread_only": True}, headers=h).json()["total"] == 2


def test_mark_all_read(client: TestClient, team):
    make_notifications(client, team, 4)
    h = auth_headers(team.tester)
    assert client.post(f"{N}/read-all", headers=h).json() == {"updated": 4}
    assert client.get(f"{N}/unread-count", headers=h).json() == {"unread": 0}
    assert client.post(f"{N}/read-all", headers=h).json() == {"updated": 0}


def test_cannot_read_or_see_someone_elses_notification(client: TestClient, team):
    make_notifications(client, team, 1)
    theirs = client.get(N, headers=auth_headers(team.tester)).json()["items"][0]
    res = client.post(f"{N}/{theirs['id']}/read", headers=auth_headers(team.tester2))
    assert res.status_code == 404
    assert client.get(N, headers=auth_headers(team.tester2)).json()["total"] == 0
    assert client.get(f"{N}/unread-count", headers=auth_headers(team.tester)).json() == {"unread": 1}


def test_notification_pagination_and_validation(client: TestClient, team):
    make_notifications(client, team, 5)
    h = auth_headers(team.tester)
    assert len(client.get(N, params={"page_size": 2, "page": 3}, headers=h).json()["items"]) == 1
    assert client.get(N, params={"page_size": 0}, headers=h).status_code == 422


@pytest.mark.parametrize("path", [N, f"{N}/unread-count"])
def test_notifications_require_auth(client: TestClient, path):
    assert client.get(path).status_code == 401


# ================================================================== dashboard summary


def test_summary_counts(client: TestClient, team, db_session: Session):
    make_bug(db_session, team.tester, severity=Severity.CRITICAL)  # NEW, unassigned, critical
    make_bug(db_session, team.tester, status=BugStatus.OPEN)  # unassigned
    make_bug(db_session, team.pm, status=BugStatus.IN_PROGRESS, assignee=team.dev)
    make_bug(db_session, team.tester, status=BugStatus.CLOSED, assignee=team.dev, severity=Severity.CRITICAL)

    res = client.get(f"{D}/summary", headers=auth_headers(team.dev))
    assert res.status_code == 200
    s = res.json()
    assert s["total"] == 4
    assert s["by_status"] == {"NEW": 1, "OPEN": 1, "IN_PROGRESS": 1, "RESOLVED": 0, "REOPENED": 0, "CLOSED": 1}
    assert s["open_total"] == 3
    assert s["critical_open"] == 1  # the closed critical is excluded
    assert s["unassigned_open"] == 2
    assert s["my_assigned_active"] == 1  # dev: IN_PROGRESS counts, CLOSED doesn't
    assert sum(s["by_severity_open"].values()) == 3
    assert set(s["by_category_open"]) >= {"UI", "BACKEND", "OTHER"}

    tester_view = client.get(f"{D}/summary", headers=auth_headers(team.tester)).json()
    assert tester_view["my_reported_open"] == 2


def test_summary_on_empty_database(client: TestClient, team):
    s = client.get(f"{D}/summary", headers=auth_headers(team.pm)).json()
    assert s["total"] == 0 and all(v == 0 for v in s["by_status"].values())


# ================================================================== trends


def test_trends_fill_every_day_and_count_from_history(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "CLOSED")
    res = client.get(f"{D}/trends", params={"days": 7}, headers=auth_headers(team.tester))
    assert res.status_code == 200
    points = res.json()["points"]
    assert len(points) == 7
    assert points[-1]["date"] == datetime.now(UTC).date().isoformat()
    assert points[-1] == {"date": points[-1]["date"], "created": 1, "resolved": 1, "closed": 1}
    assert all(p["created"] == 0 for p in points[:-1])


def test_trends_reopened_bug_still_counted_on_resolution_day(client: TestClient, team, db_session: Session):
    bug = create_bug(client, team.tester)
    advance(client, team, bug["id"], "REOPENED")
    yesterday = datetime.now(UTC) - timedelta(days=1)
    db_session.execute(
        update(BugHistory)
        .where(BugHistory.bug_id == bug["id"], BugHistory.new_value == "RESOLVED")
        .values(created_at=yesterday)
    )
    points = client.get(f"{D}/trends", params={"days": 2}, headers=auth_headers(team.pm)).json()["points"]
    assert [p["resolved"] for p in points] == [1, 0]


@pytest.mark.parametrize(("days", "status"), [(0, 422), (1, 200), (365, 200), (366, 422)])
def test_trends_days_boundaries(client: TestClient, team, days, status):
    assert client.get(f"{D}/trends", params={"days": days}, headers=auth_headers(team.pm)).status_code == status


# ================================================================== workload, activity, reports


def test_workload_per_active_developer(client: TestClient, team, db_session: Session):
    make_bug(db_session, team.tester, status=BugStatus.OPEN, assignee=team.dev)
    make_bug(db_session, team.tester, status=BugStatus.IN_PROGRESS, assignee=team.dev)
    make_bug(db_session, team.tester, status=BugStatus.RESOLVED, assignee=team.dev2)
    rows = {w["developer_id"]: w for w in client.get(f"{D}/workload", headers=auth_headers(team.pm)).json()}
    assert set(rows) == {team.dev.id, team.dev2.id}
    assert (rows[team.dev.id]["open"], rows[team.dev.id]["in_progress"], rows[team.dev.id]["active_total"]) == (1, 1, 2)
    assert (rows[team.dev2.id]["resolved"], rows[team.dev2.id]["active_total"]) == (1, 0)


@pytest.mark.parametrize(("who", "status"), [("pm", 200), ("admin", 200), ("tester", 403), ("dev", 403)])
def test_workload_and_reports_access(client: TestClient, team, who, status):
    h = auth_headers(getattr(team, who))
    assert client.get(f"{D}/workload", headers=h).status_code == status
    assert client.get(f"{D}/reports", headers=h).status_code == status


def test_activity_feed_newest_first(client: TestClient, team):
    bug = create_bug(client, team.tester)
    transition(client, team.pm, bug["id"], "OPEN")
    assign(client, team.pm, bug["id"], team.dev.id)
    feed = client.get(f"{D}/activity", params={"limit": 2}, headers=auth_headers(team.dev)).json()
    assert [(a["action"], a["bug_key"], a["actor_name"]) for a in feed] == [
        ("ASSIGNED", bug["key"], "Pat Manager"),
        ("STATUS_CHANGED", bug["key"], "Pat Manager"),
    ]


@pytest.mark.parametrize(("limit", "status"), [(0, 422), (100, 200), (101, 422)])
def test_activity_limit_boundaries(client: TestClient, team, limit, status):
    assert client.get(f"{D}/activity", params={"limit": limit}, headers=auth_headers(team.pm)).status_code == status


def test_reports_metrics(client: TestClient, team, db_session: Session):
    a = create_bug(client, team.tester)
    b = create_bug(client, team.tester, category="API")
    create_bug(client, team.tester, category="API")
    advance(client, team, a["id"], "CLOSED")
    advance(client, team, b["id"], "REOPENED")

    r = client.get(f"{D}/reports", headers=auth_headers(team.pm)).json()
    assert r["total_bugs"] == 3
    assert r["closed_bugs"] == 1
    assert r["closure_rate"] == pytest.approx(1 / 3, abs=1e-3)
    assert r["reopened_bugs"] == 1
    assert r["reopen_rate"] == 0.5  # 1 of 2 ever-resolved bugs was reopened
    assert r["avg_hours_to_resolve"] is not None and r["avg_hours_to_resolve"] >= 0
    api_row = next(c for c in r["by_category"] if c["category"] == "API")
    assert (api_row["total"], api_row["open"], api_row["closed"]) == (2, 2, 0)
    assert len(r["by_category"]) == 9


def test_reports_on_empty_database(client: TestClient, team):
    r = client.get(f"{D}/reports", headers=auth_headers(team.pm)).json()
    assert (r["total_bugs"], r["closure_rate"], r["avg_hours_to_resolve"], r["reopen_rate"]) == (0, 0.0, None, 0.0)


@pytest.mark.parametrize("path", ["/summary", "/trends", "/activity", "/workload", "/reports"])
def test_dashboard_requires_auth(client: TestClient, path):
    assert client.get(f"{D}{path}").status_code == 401
