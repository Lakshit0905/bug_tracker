"""API tests for /api/v1/users — profile self-service (FR-USER-2) and administration (FR-USER-1)."""

import pytest
from fastapi.testclient import TestClient
from jsonschema import validate
from sqlalchemy.orm import Session

from app.core.enums import RoleName
from tests.api.test_auth_api import USER_SCHEMA, login
from tests.factories import DEFAULT_PASSWORD, auth_headers, make_user

pytestmark = pytest.mark.api

USERS = "/api/v1/users"
NON_ADMIN_ROLES = [RoleName.TESTER, RoleName.DEVELOPER, RoleName.PROJECT_MANAGER]

PAGE_SCHEMA = {
    "type": "object",
    "required": ["items", "total", "page", "page_size"],
    "properties": {"items": {"type": "array", "items": USER_SCHEMA}, "total": {"type": "integer"}},
}


@pytest.fixture
def admin(db_session: Session):
    return make_user(db_session, RoleName.ADMIN, full_name="Ada Admin")


# ================================================================== /users/me


@pytest.mark.parametrize("role", list(RoleName))
def test_me_returns_profile_and_role_capabilities(client: TestClient, db_session: Session, role: RoleName):
    user = make_user(db_session, role)
    res = client.get(f"{USERS}/me", headers=auth_headers(user))
    assert res.status_code == 200
    body = res.json()
    assert body["id"] == user.id
    assert body["role"] == role
    assert isinstance(body["capabilities"], list)
    assert ("users:manage" in body["capabilities"]) is (role == RoleName.ADMIN)


def test_update_own_name(client: TestClient, db_session: Session):
    user = make_user(db_session)
    res = client.patch(f"{USERS}/me", json={"full_name": "  Renamed Person  "}, headers=auth_headers(user))
    assert res.status_code == 200
    assert res.json()["full_name"] == "Renamed Person"


@pytest.mark.parametrize("payload", [{"full_name": "x"}, {"full_name": "Valid", "role": "ADMIN"}, {}])
def test_update_me_rejects_invalid_or_extra_fields(client: TestClient, db_session: Session, payload: dict):
    """Extra fields like role are forbidden (422), not silently ignored, on the authenticated endpoint."""
    user = make_user(db_session)
    assert client.patch(f"{USERS}/me", json=payload, headers=auth_headers(user)).status_code == 422


def test_change_password_success_and_old_password_stops_working(client: TestClient, db_session: Session):
    user = make_user(db_session)
    other_session_refresh = login(client, user.email).json()["refresh_token"]
    res = client.post(
        f"{USERS}/me/password",
        json={"current_password": DEFAULT_PASSWORD, "new_password": "BrandNew99"},
        headers=auth_headers(user),
    )
    assert res.status_code == 204
    assert login(client, user.email, DEFAULT_PASSWORD).status_code == 401
    assert login(client, user.email, "BrandNew99").status_code == 200
    # Other sessions are signed out.
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": other_session_refresh}).status_code == 401


def test_change_password_wrong_current(client: TestClient, db_session: Session):
    user = make_user(db_session)
    res = client.post(
        f"{USERS}/me/password",
        json={"current_password": "Wrong-pass1", "new_password": "BrandNew99"},
        headers=auth_headers(user),
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "INVALID_CURRENT_PASSWORD"


def test_change_password_same_as_current_rejected(client: TestClient, db_session: Session):
    user = make_user(db_session)
    res = client.post(
        f"{USERS}/me/password",
        json={"current_password": DEFAULT_PASSWORD, "new_password": DEFAULT_PASSWORD},
        headers=auth_headers(user),
    )
    assert res.json()["error"]["code"] == "PASSWORD_REUSED"


def test_change_password_policy_enforced(client: TestClient, db_session: Session):
    user = make_user(db_session)
    res = client.post(
        f"{USERS}/me/password",
        json={"current_password": DEFAULT_PASSWORD, "new_password": "short"},
        headers=auth_headers(user),
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


# ================================================================== RBAC on admin endpoints


ADMIN_ENDPOINTS = [
    ("get", USERS, None),
    ("get", f"{USERS}/{{id}}", None),
    ("patch", f"{USERS}/{{id}}/role", {"role": "ADMIN"}),
    ("patch", f"{USERS}/{{id}}/status", {"is_active": False}),
]


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ENDPOINTS)
@pytest.mark.parametrize("role", NON_ADMIN_ROLES)
def test_non_admins_get_403_on_admin_endpoints(
    client: TestClient, db_session: Session, role: RoleName, method: str, path: str, body: dict | None
):
    actor = make_user(db_session, role)
    target = make_user(db_session)
    res = client.request(method, path.format(id=target.id), json=body, headers=auth_headers(actor))
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "FORBIDDEN"
    db_session.refresh(target)
    assert target.role_name == RoleName.TESTER and target.is_active  # nothing changed


@pytest.mark.parametrize(("method", "path", "body"), ADMIN_ENDPOINTS)
def test_admin_endpoints_require_authentication(client: TestClient, method: str, path: str, body: dict | None):
    assert client.request(method, path.format(id=1), json=body).status_code == 401


# ================================================================== admin: search


def test_admin_lists_users_paginated(client: TestClient, db_session: Session, admin):
    for _ in range(5):
        make_user(db_session)
    res = client.get(USERS, params={"page": 1, "page_size": 2}, headers=auth_headers(admin))
    assert res.status_code == 200
    body = res.json()
    validate(body, PAGE_SCHEMA)
    assert len(body["items"]) == 2
    assert body["total"] >= 6


def test_admin_search_filters(client: TestClient, db_session: Session, admin):
    make_user(db_session, RoleName.DEVELOPER, full_name="Zelda Searchable")
    make_user(db_session, RoleName.DEVELOPER, full_name="Inactive Dev", is_active=False)
    headers = auth_headers(admin)

    by_name = client.get(USERS, params={"q": "zelda"}, headers=headers).json()
    assert [u["full_name"] for u in by_name["items"]] == ["Zelda Searchable"]

    devs = client.get(USERS, params={"role": "DEVELOPER", "is_active": True}, headers=headers).json()
    assert all(u["role"] == "DEVELOPER" and u["is_active"] for u in devs["items"])
    assert "Inactive Dev" not in [u["full_name"] for u in devs["items"]]


@pytest.mark.parametrize("params", [{"page": 0}, {"page_size": 0}, {"page_size": 101}, {"role": "KING"}])
def test_admin_search_rejects_invalid_params(client: TestClient, admin, params: dict):
    assert client.get(USERS, params=params, headers=auth_headers(admin)).status_code == 422


def test_admin_page_beyond_end_returns_empty(client: TestClient, admin):
    body = client.get(USERS, params={"page": 999}, headers=auth_headers(admin)).json()
    assert body["items"] == [] and body["page"] == 999


# ================================================================== admin: role + status


def test_admin_changes_role_and_it_applies_to_existing_token(client: TestClient, db_session: Session, admin):
    target = make_user(db_session, RoleName.TESTER)
    target_headers = auth_headers(target)
    assert client.get(f"{USERS}/developers", headers=target_headers).status_code == 403

    res = client.patch(f"{USERS}/{target.id}/role", json={"role": "PROJECT_MANAGER"}, headers=auth_headers(admin))
    assert res.status_code == 200
    assert res.json()["role"] == "PROJECT_MANAGER"
    # Role is read from the DB per request, so the same token now has PM rights.
    assert client.get(f"{USERS}/developers", headers=target_headers).status_code == 200


def test_admin_cannot_change_own_role(client: TestClient, admin):
    res = client.patch(f"{USERS}/{admin.id}/role", json={"role": "TESTER"}, headers=auth_headers(admin))
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "SELF_MODIFICATION"


def test_admin_cannot_deactivate_self(client: TestClient, admin):
    res = client.patch(f"{USERS}/{admin.id}/status", json={"is_active": False}, headers=auth_headers(admin))
    assert res.status_code == 403


def test_invalid_role_value_422(client: TestClient, db_session: Session, admin):
    target = make_user(db_session)
    assert (
        client.patch(f"{USERS}/{target.id}/role", json={"role": "SUPERUSER"}, headers=auth_headers(admin)).status_code
        == 422
    )


@pytest.mark.parametrize("path", [f"{USERS}/999999", f"{USERS}/999999/role", f"{USERS}/999999/status"])
def test_unknown_user_404(client: TestClient, admin, path: str):
    method = "get" if path.endswith("999999") else "patch"
    body = {"role": "TESTER"} if path.endswith("role") else {"is_active": True}
    res = client.request(method, path, json=None if method == "get" else body, headers=auth_headers(admin))
    assert res.status_code == 404


def test_non_integer_user_id_422(client: TestClient, admin):
    assert client.get(f"{USERS}/abc", headers=auth_headers(admin)).status_code == 422


def test_deactivate_blocks_login_and_refresh_then_reactivate_restores(client: TestClient, db_session: Session, admin):
    target = make_user(db_session)
    refresh = login(client, target.email).json()["refresh_token"]

    res = client.patch(f"{USERS}/{target.id}/status", json={"is_active": False}, headers=auth_headers(admin))
    assert res.status_code == 200 and res.json()["is_active"] is False
    assert login(client, target.email).status_code == 403
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}).status_code == 401

    client.patch(f"{USERS}/{target.id}/status", json={"is_active": True}, headers=auth_headers(admin))
    assert login(client, target.email).status_code == 200


def test_admin_get_user_detail(client: TestClient, db_session: Session, admin):
    target = make_user(db_session)
    res = client.get(f"{USERS}/{target.id}", headers=auth_headers(admin))
    assert res.status_code == 200
    validate(res.json(), USER_SCHEMA)


# ================================================================== developers list (assignment support)


@pytest.mark.parametrize(
    ("role", "status"),
    [
        (RoleName.PROJECT_MANAGER, 200),
        (RoleName.ADMIN, 200),
        (RoleName.TESTER, 403),
        (RoleName.DEVELOPER, 403),
    ],
)
def test_developers_list_access(client: TestClient, db_session: Session, role: RoleName, status: int):
    assert client.get(f"{USERS}/developers", headers=auth_headers(make_user(db_session, role))).status_code == status


def test_developers_list_contains_only_active_developers(client: TestClient, db_session: Session):
    pm = make_user(db_session, RoleName.PROJECT_MANAGER)
    active = make_user(db_session, RoleName.DEVELOPER)
    inactive = make_user(db_session, RoleName.DEVELOPER, is_active=False)
    tester = make_user(db_session, RoleName.TESTER)
    ids = {u["id"] for u in client.get(f"{USERS}/developers", headers=auth_headers(pm)).json()}
    assert active.id in ids
    assert inactive.id not in ids and tester.id not in ids and pm.id not in ids


# ================================================================== require_roles guard (used by Phase 4 routes)


@pytest.mark.parametrize(
    ("role", "status"),
    [(RoleName.TESTER, 200), (RoleName.PROJECT_MANAGER, 200), (RoleName.DEVELOPER, 403), (RoleName.ADMIN, 403)],
)
def test_require_roles_guard(app, db_session: Session, role: RoleName, status: int):
    from fastapi import APIRouter, Depends

    from app.api.deps import require_roles

    router = APIRouter()

    @router.get("/_probe/roles", dependencies=[Depends(require_roles(RoleName.TESTER, RoleName.PROJECT_MANAGER))])
    def _probe():
        return {"ok": True}

    app.include_router(router)
    res = TestClient(app).get("/_probe/roles", headers=auth_headers(make_user(db_session, role)))
    assert res.status_code == status
    if status == 403:
        assert res.json()["error"]["details"]["required_roles"] == ["PROJECT_MANAGER", "TESTER"]
