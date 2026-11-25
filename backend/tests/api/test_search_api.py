"""Search, filtering, sorting and pagination (FR-SRCH-1)."""

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from jsonschema import validate
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.enums import BugStatus, Category, Priority, Severity
from app.models import Bug
from tests.api.helpers import BUGS, PAGE_OF_BUGS
from tests.factories import auth_headers, make_bug

pytestmark = pytest.mark.api


@pytest.fixture
def dataset(db_session: Session, team):
    """A small, fully known set of bugs. Tests assert on exact ids."""
    t, d, d2 = team.tester, team.dev, team.dev2
    specs = {
        "login": dict(
            title="Login fails with SSO",
            description="SAML assertion rejected",
            severity=Severity.CRITICAL,
            priority=Priority.CRITICAL,
            category=Category.AUTHENTICATION,
            status=BugStatus.IN_PROGRESS,
            assignee=d,
        ),
        "chart": dict(
            title="Chart legend overlaps",
            description="Legend covers bars on mobile",
            severity=Severity.LOW,
            priority=Priority.LOW,
            category=Category.UI,
            status=BugStatus.NEW,
        ),
        "slow": dict(
            title="Slow bug list query",
            description="Takes 4 seconds with 50% of rows",
            severity=Severity.HIGH,
            priority=Priority.HIGH,
            category=Category.PERFORMANCE,
            status=BugStatus.OPEN,
            assignee=d2,
        ),
        "api": dict(
            title="API returns 500 on empty body",
            description="Underscore_field breaks parser",
            severity=Severity.MEDIUM,
            priority=Priority.MEDIUM,
            category=Category.API,
            status=BugStatus.CLOSED,
            assignee=d,
        ),
        "db": dict(
            title="Deadlock on concurrent assign",
            description="Two managers assign at once",
            severity=Severity.HIGH,
            priority=Priority.CRITICAL,
            category=Category.DATABASE,
            status=BugStatus.RESOLVED,
            assignee=d2,
        ),
    }
    reporters = {"login": t, "chart": t, "slow": team.pm, "api": t, "db": team.pm}
    bugs = {k: make_bug(db_session, reporters[k], **v) for k, v in specs.items()}
    # spread creation dates: login today, chart -1d, slow -5d, api -10d, db -30d
    now = datetime.now(UTC)
    for key, days in {"login": 0, "chart": 1, "slow": 5, "api": 10, "db": 30}.items():
        db_session.execute(update(Bug).where(Bug.id == bugs[key].id).values(created_at=now - timedelta(days=days)))
    db_session.flush()
    return {k: b.id for k, b in bugs.items()}


def search(client: TestClient, user, **params) -> dict:
    res = client.get(BUGS, params=params, headers=auth_headers(user))
    assert res.status_code == 200, res.text
    validate(res.json(), PAGE_OF_BUGS)
    return res.json()


def ids(page: dict) -> set[int]:
    return {b["id"] for b in page["items"]}


def test_no_filters_returns_all(client, team, dataset):
    page = search(client, team.tester)
    assert ids(page) == set(dataset.values()) and page["total"] == 5


@pytest.mark.parametrize(
    ("params", "expected"),
    [
        ({"status": "NEW"}, {"chart"}),
        ({"status": ["NEW", "OPEN"]}, {"chart", "slow"}),
        ({"severity": "HIGH"}, {"slow", "db"}),
        ({"priority": "CRITICAL"}, {"login", "db"}),
        ({"category": ["UI", "API"]}, {"chart", "api"}),
        ({"severity": "HIGH", "priority": "CRITICAL"}, {"db"}),
        ({"status": "CLOSED", "category": "UI"}, set()),
    ],
)
def test_enum_filters(client, team, dataset, params, expected):
    assert ids(search(client, team.pm, **params)) == {dataset[k] for k in expected}


def test_assignee_filters(client, team, dataset):
    assert ids(search(client, team.pm, assignee_id=team.dev.id)) == {dataset["login"], dataset["api"]}
    assert ids(search(client, team.dev2, assigned_to_me=True)) == {dataset["slow"], dataset["db"]}
    assert ids(search(client, team.pm, unassigned=True)) == {dataset["chart"]}


def test_reporter_filters(client, team, dataset):
    assert ids(search(client, team.pm, reported_by_me=True)) == {dataset["slow"], dataset["db"]}
    assert ids(search(client, team.pm, reporter_id=team.tester.id)) == {
        dataset["login"],
        dataset["chart"],
        dataset["api"],
    }


@pytest.mark.parametrize(
    ("q", "expected"),
    [
        ("login", {"login"}),
        ("LEGEND", {"chart"}),  # case-insensitive, matches title and description
        ("saml", {"login"}),  # description only
        ("50%", {"slow"}),  # % is a literal, not a wildcard
        ("_", {"api"}),  # _ is a literal, not a wildcard
        ("nothing-matches-this", set()),
    ],
)
def test_keyword_search(client, team, dataset, q, expected):
    assert ids(search(client, team.tester, q=q)) == {dataset[k] for k in expected}


def test_search_by_bug_key_and_number(client, team, dataset):
    bid = dataset["chart"]
    assert dataset["chart"] in ids(search(client, team.tester, q=f"BUG-{bid}"))
    assert dataset["chart"] in ids(search(client, team.tester, q=f"bug-{bid}"))
    assert dataset["chart"] in ids(search(client, team.tester, q=str(bid)))


def test_blank_keyword_is_ignored(client, team, dataset):
    assert search(client, team.tester, q="   ")["total"] == 5


def test_created_date_range_is_inclusive(client, team, dataset):
    today = datetime.now(UTC).date()
    assert ids(search(client, team.pm, created_from=str(today - timedelta(days=1)), created_to=str(today))) == {
        dataset["login"],
        dataset["chart"],
    }
    assert ids(search(client, team.pm, created_to=str(today - timedelta(days=10)))) == {dataset["api"], dataset["db"]}
    assert ids(
        search(client, team.pm, created_from=str(today - timedelta(days=10)), created_to=str(today - timedelta(days=5)))
    ) == {dataset["slow"], dataset["api"]}


def test_reversed_date_range_422(client, team, dataset):
    res = client.get(
        BUGS, params={"created_from": "2026-02-01", "created_to": "2026-01-01"}, headers=auth_headers(team.pm)
    )
    assert res.status_code == 422 and res.json()["error"]["code"] == "INVALID_DATE_RANGE"


def test_sort_by_priority_uses_business_rank_not_alphabet(client, team, dataset):
    items = search(client, team.pm, sort="priority", order="desc")["items"]
    ranks = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
    assert [ranks[b["priority"]] for b in items] == sorted((ranks[b["priority"]] for b in items), reverse=True)


def test_sort_by_severity_ascending(client, team, dataset):
    items = search(client, team.pm, sort="severity", order="asc")["items"]
    assert items[0]["severity"] == "LOW" and items[-1]["severity"] == "CRITICAL"


def test_sort_by_status_follows_lifecycle(client, team, dataset):
    statuses = [b["status"] for b in search(client, team.pm, sort="status", order="asc")["items"]]
    order = [s.value for s in BugStatus]
    assert statuses == sorted(statuses, key=order.index)


def test_default_sort_is_newest_first(client, team, dataset):
    assert [b["id"] for b in search(client, team.pm)["items"]][:2] == [dataset["login"], dataset["chart"]]


def test_sort_by_title(client, team, dataset):
    titles = [b["title"] for b in search(client, team.pm, sort="title", order="asc")["items"]]
    assert titles == sorted(titles)


def test_pagination(client, team, dataset):
    p1 = search(client, team.pm, page=1, page_size=2, sort="id", order="asc")
    p2 = search(client, team.pm, page=2, page_size=2, sort="id", order="asc")
    p3 = search(client, team.pm, page=3, page_size=2, sort="id", order="asc")
    assert p1["total"] == p2["total"] == p3["total"] == 5
    assert [len(p["items"]) for p in (p1, p2, p3)] == [2, 2, 1]
    assert ids(p1) | ids(p2) | ids(p3) == set(dataset.values())
    assert search(client, team.pm, page=4, page_size=2)["items"] == []


@pytest.mark.parametrize(
    "params",
    [
        {"page": 0},
        {"page_size": 0},
        {"page_size": 101},
        {"status": "DONE"},
        {"severity": "BLOCKER"},
        {"sort": "reporter"},
        {"order": "sideways"},
        {"created_from": "not-a-date"},
        {"assignee_id": "me"},
        {"q": "x" * 201},
    ],
)
def test_invalid_query_params_422(client, team, params):
    assert client.get(BUGS, params=params, headers=auth_headers(team.pm)).status_code == 422


def test_search_requires_auth(client):
    assert client.get(BUGS).status_code == 401


def test_filters_combined_with_pagination_total(client, team, dataset):
    page = search(client, team.pm, severity=["HIGH", "CRITICAL"], page_size=1)
    assert page["total"] == 3 and len(page["items"]) == 1


def test_date_type_boundary(client, team, dataset):
    """A date far in the future returns nothing; far in the past returns everything."""
    assert search(client, team.pm, created_from=str(date(2999, 1, 1)))["total"] == 0
    assert search(client, team.pm, created_from=str(date(2000, 1, 1)))["total"] == 5
