"""Shared payloads, JSON schemas and request helpers for API tests."""

from fastapi.testclient import TestClient

from app.models import User
from tests.factories import auth_headers

BUGS = "/api/v1/bugs"

USER_SUMMARY = {
    "type": "object",
    "required": ["id", "full_name", "email", "role"],
    "properties": {"id": {"type": "integer"}, "role": {"type": "string"}},
}
BUG_LIST_ITEM = {
    "type": "object",
    "required": [
        "id",
        "key",
        "title",
        "severity",
        "priority",
        "category",
        "status",
        "reporter",
        "assignee",
        "created_at",
        "updated_at",
    ],
    "properties": {
        "key": {"type": "string", "pattern": "^BUG-[0-9]+$"},
        "status": {"enum": ["NEW", "OPEN", "IN_PROGRESS", "RESOLVED", "REOPENED", "CLOSED"]},
        "severity": {"enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
        "priority": {"enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
        "reporter": USER_SUMMARY,
        "assignee": {"anyOf": [{"type": "null"}, USER_SUMMARY]},
    },
}
BUG_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        *BUG_LIST_ITEM["required"],
        "description",
        "environment",
        "steps_to_reproduce",
        "expected_result",
        "actual_result",
        "resolution_notes",
        "resolved_at",
        "closed_at",
    ],
    "properties": {
        **BUG_LIST_ITEM["properties"],
        **{
            k: {}
            for k in (
                "id",
                "title",
                "category",
                "created_at",
                "updated_at",
                "description",
                "environment",
                "steps_to_reproduce",
                "expected_result",
                "actual_result",
                "resolution_notes",
                "resolved_at",
                "closed_at",
            )
        },
    },
}
PAGE_OF_BUGS = {
    "type": "object",
    "required": ["items", "total", "page", "page_size"],
    "additionalProperties": False,
    "properties": {
        "items": {"type": "array", "items": BUG_LIST_ITEM},
        "total": {"type": "integer", "minimum": 0},
        "page": {"type": "integer"},
        "page_size": {"type": "integer"},
    },
}


def bug_payload(**overrides) -> dict:
    return {
        "title": "Checkout button does nothing",
        "description": "Clicking the checkout button has no visible effect.",
        "severity": "HIGH",
        "category": "UI",
        "environment": "Chrome 131 / Windows 11",
        "steps_to_reproduce": "1. Add item to cart\n2. Click Checkout",
        "expected_result": "Checkout page opens",
        "actual_result": "Nothing happens",
    } | overrides


def create_bug(client: TestClient, reporter: User, **overrides) -> dict:
    res = client.post(BUGS, json=bug_payload(**overrides), headers=auth_headers(reporter))
    assert res.status_code == 201, res.text
    return res.json()


def transition(client: TestClient, actor: User, bug_id: int, to_status: str, **extra):
    return client.post(
        f"{BUGS}/{bug_id}/transitions", json={"to_status": to_status, **extra}, headers=auth_headers(actor)
    )


def assign(client: TestClient, pm: User, bug_id: int, assignee_id: int | None):
    return client.put(f"{BUGS}/{bug_id}/assignee", json={"assignee_id": assignee_id}, headers=auth_headers(pm))


def history(client: TestClient, user: User, bug_id: int) -> list[dict]:
    res = client.get(f"{BUGS}/{bug_id}/history", headers=auth_headers(user))
    assert res.status_code == 200
    return res.json()


def advance(client: TestClient, team, bug_id: int, target: str) -> None:
    """Drive a NEW bug to `target` through the real API."""
    path = {
        "OPEN": [("pm", "OPEN")],
        "IN_PROGRESS": [("pm", "OPEN"), ("assign", None), ("dev", "IN_PROGRESS")],
        "RESOLVED": [("pm", "OPEN"), ("assign", None), ("dev", "IN_PROGRESS"), ("dev", "RESOLVED")],
        "CLOSED": [("pm", "OPEN"), ("assign", None), ("dev", "IN_PROGRESS"), ("dev", "RESOLVED"), ("tester", "CLOSED")],
        "REOPENED": [
            ("pm", "OPEN"),
            ("assign", None),
            ("dev", "IN_PROGRESS"),
            ("dev", "RESOLVED"),
            ("tester", "REOPENED"),
        ],
    }[target]
    for who, status in path:
        if who == "assign":
            res = assign(client, team.pm, bug_id, team.dev.id)
        else:
            extra = {}
            if status == "RESOLVED":
                extra["resolution_notes"] = "Fixed the handler"
            if status == "REOPENED":
                extra["reason"] = "Still broken"
            res = transition(client, getattr(team, who), bug_id, status, **extra)
        assert res.status_code == 200, res.text
