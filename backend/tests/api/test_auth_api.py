"""API tests for /api/v1/auth — FR-AUTH-1..5. Covers positive, negative, boundary and security scenarios."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from jsonschema import validate
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.enums import RoleName
from app.core.rate_limit import SlidingWindowRateLimiter
from app.core.security import create_access_token, hash_refresh_token
from app.models import RefreshToken, User
from tests.factories import DEFAULT_PASSWORD, auth_headers, make_user

pytestmark = pytest.mark.api

AUTH = "/api/v1/auth"

USER_SCHEMA = {
    "type": "object",
    "required": ["id", "email", "full_name", "role", "is_active", "last_login_at", "created_at"],
    "additionalProperties": False,
    "properties": {
        "id": {"type": "integer"},
        "email": {"type": "string"},
        "full_name": {"type": "string"},
        "role": {"enum": ["TESTER", "DEVELOPER", "PROJECT_MANAGER", "ADMIN"]},
        "is_active": {"type": "boolean"},
        "last_login_at": {"type": ["string", "null"]},
        "created_at": {"type": "string"},
    },
}
TOKEN_SCHEMA = {
    "type": "object",
    "required": ["access_token", "refresh_token", "token_type", "expires_in", "user"],
    "additionalProperties": False,
    "properties": {
        "access_token": {"type": "string", "minLength": 20},
        "refresh_token": {"type": "string", "minLength": 20},
        "token_type": {"const": "bearer"},
        "expires_in": {"type": "integer", "minimum": 1},
        "user": USER_SCHEMA,
    },
}


def register(client: TestClient, **overrides):
    body = {"email": "new.user@example.com", "full_name": "New User", "password": "Passw0rd123"} | overrides
    return client.post(f"{AUTH}/register", json=body)


def login(client: TestClient, email: str, password: str = DEFAULT_PASSWORD):
    return client.post(f"{AUTH}/login", json={"email": email, "password": password})


# ================================================================== register (FR-AUTH-1)


def test_fr_auth_1_register_creates_tester(client: TestClient):
    res = register(client)
    assert res.status_code == 201
    body = res.json()
    validate(body, USER_SCHEMA)
    assert body["role"] == "TESTER"
    assert body["is_active"] is True


def test_register_never_returns_password_or_hash(client: TestClient):
    res = register(client)
    assert "password" not in res.text.lower()
    assert "$2b$" not in res.text


def test_register_ignores_client_supplied_role(client: TestClient):
    """D1: no privilege escalation through self-registration."""
    res = register(client, role="ADMIN")
    assert res.status_code == 201
    assert res.json()["role"] == "TESTER"


def test_register_normalises_email_to_lowercase(client: TestClient):
    res = register(client, email="  Mixed.Case@Example.COM ")
    assert res.json()["email"] == "mixed.case@example.com"


def test_register_stores_bcrypt_hash(client: TestClient, db_session: Session):
    register(client, email="hash.check@example.com")
    user = db_session.execute(select(User).where(User.email == "hash.check@example.com")).scalar_one()
    assert user.password_hash.startswith("$2b$")


@pytest.mark.parametrize("email", ["dupe@example.com", "DUPE@example.com"])
def test_register_duplicate_email_conflict_case_insensitive(client: TestClient, email: str):
    assert register(client, email="dupe@example.com").status_code == 201
    res = register(client, email=email)
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "EMAIL_TAKEN"


@pytest.mark.parametrize(
    ("password", "reason"),
    [
        ("Pass123", "7 chars — below minimum"),
        ("passwordonly", "no digit"),
        ("12345678", "no letter"),
        ("a1" * 37, "74 bytes — over bcrypt limit"),
        ("", "empty"),
    ],
)
def test_register_rejects_weak_passwords(client: TestClient, password: str, reason: str):
    res = register(client, password=password)
    assert res.status_code == 422, reason
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert ["body", "password"] in [d["loc"] for d in res.json()["error"]["details"]]


@pytest.mark.parametrize("password", ["Pass1234", "a1" * 36])
def test_register_accepts_password_boundaries(client: TestClient, password: str):
    """8 characters (minimum) and exactly 72 bytes (maximum)."""
    assert register(client, password=password).status_code == 201


@pytest.mark.parametrize("email", ["not-an-email", "a@", "@example.com", ""])
def test_register_rejects_invalid_email(client: TestClient, email: str):
    assert register(client, email=email).status_code == 422


@pytest.mark.parametrize(
    ("name", "status"), [("A", 422), ("  A  ", 422), ("Al", 201), ("x" * 120, 201), ("x" * 121, 422)]
)
def test_register_full_name_boundaries(client: TestClient, name: str, status: int):
    assert register(client, full_name=name).status_code == status


def test_register_missing_fields(client: TestClient):
    res = client.post(f"{AUTH}/register", json={})
    assert res.status_code == 422
    locs = [d["loc"][-1] for d in res.json()["error"]["details"]]
    assert set(locs) == {"email", "full_name", "password"}


# ================================================================== login (FR-AUTH-2)


def test_fr_auth_2_login_returns_token_pair(client: TestClient, db_session: Session):
    user = make_user(db_session, RoleName.DEVELOPER)
    res = login(client, user.email)
    assert res.status_code == 200
    body = res.json()
    validate(body, TOKEN_SCHEMA)
    assert body["user"]["id"] == user.id
    assert body["expires_in"] == 30 * 60


def test_login_records_last_login_and_stores_only_refresh_hash(client: TestClient, db_session: Session):
    user = make_user(db_session)
    body = login(client, user.email).json()
    db_session.refresh(user)
    assert user.last_login_at is not None
    stored = db_session.execute(select(RefreshToken).where(RefreshToken.user_id == user.id)).scalar_one()
    assert stored.token_hash == hash_refresh_token(body["refresh_token"])
    assert stored.token_hash != body["refresh_token"]


def test_login_is_case_insensitive_on_email(client: TestClient, db_session: Session):
    user = make_user(db_session, email="case@example.com")
    assert login(client, "CASE@Example.com").status_code == 200
    assert user.id


def test_login_wrong_password_and_unknown_email_are_indistinguishable(client: TestClient, db_session: Session):
    user = make_user(db_session)
    wrong_pw = login(client, user.email, "Wrong-pass1")
    unknown = login(client, "nobody@example.com", "Wrong-pass1")
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["error"]["code"] == unknown.json()["error"]["code"] == "INVALID_CREDENTIALS"
    assert wrong_pw.json()["error"]["message"] == unknown.json()["error"]["message"]
    assert wrong_pw.headers["WWW-Authenticate"] == "Bearer"


def test_login_deactivated_account_forbidden(client: TestClient, db_session: Session):
    user = make_user(db_session, is_active=False)
    res = login(client, user.email)
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "ACCOUNT_DISABLED"


def test_login_deactivated_account_with_wrong_password_reveals_nothing(client: TestClient, db_session: Session):
    user = make_user(db_session, is_active=False)
    res = login(client, user.email, "Wrong-pass1")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_CREDENTIALS"


def test_login_missing_password_422(client: TestClient):
    assert client.post(f"{AUTH}/login", json={"email": "a@b.co"}).status_code == 422


# ================================================================== protected endpoints (FR-AUTH-5)


def test_fr_auth_5_protected_endpoint_requires_token(client: TestClient):
    res = client.get("/api/v1/users/me")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "UNAUTHENTICATED"
    assert res.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "header",
    ["Bearer", "Bearer not.a.jwt", "Basic dXNlcjpwYXNz", "Token abc"],
)
def test_malformed_authorization_header_401(client: TestClient, header: str):
    assert client.get("/api/v1/users/me", headers={"Authorization": header}).status_code == 401


def test_expired_access_token_401(client: TestClient, db_session: Session):
    user = make_user(db_session)
    token, _ = create_access_token(user.id, now=datetime.now(UTC) - timedelta(hours=2))
    res = client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_TOKEN"


def test_refresh_token_cannot_be_used_as_access_token(client: TestClient, db_session: Session):
    user = make_user(db_session)
    refresh = login(client, user.email).json()["refresh_token"]
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {refresh}"}).status_code == 401


def test_token_for_nonexistent_user_401(client: TestClient):
    token, _ = create_access_token(999_999)
    assert client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_deactivation_invalidates_existing_access_token_immediately(client: TestClient, db_session: Session):
    user = make_user(db_session)
    headers = auth_headers(user)
    assert client.get("/api/v1/users/me", headers=headers).status_code == 200
    user.is_active = False
    db_session.flush()
    res = client.get("/api/v1/users/me", headers=headers)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "ACCOUNT_DISABLED"


# ================================================================== refresh


def test_refresh_rotates_tokens(client: TestClient, db_session: Session):
    user = make_user(db_session)
    first = login(client, user.email).json()
    res = client.post(f"{AUTH}/refresh", json={"refresh_token": first["refresh_token"]})
    assert res.status_code == 200
    second = res.json()
    validate(second, TOKEN_SCHEMA)
    assert second["refresh_token"] != first["refresh_token"]
    assert (
        client.get("/api/v1/users/me", headers={"Authorization": f"Bearer {second['access_token']}"}).status_code == 200
    )


def test_refresh_token_reuse_revokes_all_sessions(client: TestClient, db_session: Session):
    user = make_user(db_session)
    original = login(client, user.email).json()["refresh_token"]
    rotated = client.post(f"{AUTH}/refresh", json={"refresh_token": original}).json()["refresh_token"]

    replay = client.post(f"{AUTH}/refresh", json={"refresh_token": original})
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "REFRESH_TOKEN_REUSED"
    # The legitimately rotated token is now revoked too (whole session family killed).
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": rotated}).status_code == 401


def test_refresh_with_unknown_token_401(client: TestClient):
    res = client.post(f"{AUTH}/refresh", json={"refresh_token": "x" * 64})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "INVALID_REFRESH_TOKEN"


def test_refresh_with_expired_token_401(client: TestClient, db_session: Session):
    user = make_user(db_session)
    token = login(client, user.email).json()["refresh_token"]
    db_session.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == hash_refresh_token(token))
        .values(expires_at=datetime.now(UTC) - timedelta(seconds=1))
    )
    res = client.post(f"{AUTH}/refresh", json={"refresh_token": token})
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "REFRESH_TOKEN_EXPIRED"


def test_refresh_for_deactivated_user_401(client: TestClient, db_session: Session):
    user = make_user(db_session)
    token = login(client, user.email).json()["refresh_token"]
    user.is_active = False
    db_session.flush()
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": token}).status_code == 401


@pytest.mark.parametrize("value", ["", "short", "x" * 513])
def test_refresh_token_length_validated(client: TestClient, value: str):
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": value}).status_code == 422


# ================================================================== logout (FR-AUTH-3)


def test_fr_auth_3_logout_revokes_refresh_token(client: TestClient, db_session: Session):
    user = make_user(db_session)
    tokens = login(client, user.email).json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    res = client.post(f"{AUTH}/logout", json={"refresh_token": tokens["refresh_token"]}, headers=headers)
    assert res.status_code == 204
    assert res.content == b""
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": tokens["refresh_token"]}).status_code == 401


def test_logout_is_idempotent(client: TestClient, db_session: Session):
    user = make_user(db_session)
    tokens = login(client, user.email).json()
    headers = {"Authorization": f"Bearer {tokens['access_token']}"}
    for _ in range(2):
        assert (
            client.post(f"{AUTH}/logout", json={"refresh_token": tokens["refresh_token"]}, headers=headers).status_code
            == 204
        )


def test_logout_cannot_revoke_another_users_token(client: TestClient, db_session: Session):
    victim, attacker = make_user(db_session), make_user(db_session)
    victim_refresh = login(client, victim.email).json()["refresh_token"]
    res = client.post(f"{AUTH}/logout", json={"refresh_token": victim_refresh}, headers=auth_headers(attacker))
    assert res.status_code == 204  # no information leak
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": victim_refresh}).status_code == 200


def test_logout_requires_authentication(client: TestClient):
    assert client.post(f"{AUTH}/logout", json={"refresh_token": "x" * 64}).status_code == 401


# ================================================================== rate limiting


def test_login_rate_limited_after_threshold(app, client: TestClient, db_session: Session):
    app.state.auth_rate_limiter = SlidingWindowRateLimiter(max_requests=3, window_seconds=60)
    user = make_user(db_session)
    statuses = [login(client, user.email, "Wrong-pass1").status_code for _ in range(3)]
    assert statuses == [401, 401, 401]
    blocked = login(client, user.email)  # even the correct password is blocked now
    assert blocked.status_code == 429
    assert blocked.json()["error"]["code"] == "RATE_LIMITED"
    assert int(blocked.headers["Retry-After"]) >= 1


def test_rate_limit_is_per_endpoint(app, client: TestClient):
    app.state.auth_rate_limiter = SlidingWindowRateLimiter(max_requests=1, window_seconds=60)
    login(client, "a@example.com", "x")
    assert login(client, "a@example.com", "x").status_code == 429
    assert register(client).status_code == 201


def test_refresh_has_its_own_looser_limit_than_login(app, client: TestClient, db_session: Session):
    """Regression (P5-1): page reloads refresh the session; they must not hit the password-guessing limit."""
    app.state.auth_rate_limiter = SlidingWindowRateLimiter(max_requests=2, window_seconds=60)
    app.state.refresh_rate_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=60)
    user = make_user(db_session)
    token = login(client, user.email).json()["refresh_token"]
    for _ in range(4):  # more refreshes than the login limit allows
        res = client.post(f"{AUTH}/refresh", json={"refresh_token": token})
        assert res.status_code == 200
        token = res.json()["refresh_token"]
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": token}).status_code == 200  # 5th: still allowed
    assert client.post(f"{AUTH}/refresh", json={"refresh_token": token}).status_code == 429  # 6th: limited
