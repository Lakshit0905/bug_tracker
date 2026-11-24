"""HTTP-level tests for health probes, the error envelope, request-id propagation and OpenAPI."""

import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from jsonschema import validate
from pydantic import BaseModel
from sqlalchemy.exc import OperationalError

from app.core.exceptions import InvalidTransitionError, NotFoundError
from app.db.session import get_db

pytestmark = pytest.mark.api

ERROR_SCHEMA = {
    "type": "object",
    "required": ["error"],
    "additionalProperties": False,
    "properties": {
        "error": {
            "type": "object",
            "required": ["code", "message", "details", "request_id"],
            "properties": {
                "code": {"type": "string"},
                "message": {"type": "string"},
                "details": {},
                "request_id": {"type": ["string", "null"]},
            },
        }
    },
}


def test_health_returns_ok(client: TestClient):
    res = client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["environment"] == "test"


def test_readiness_reports_db_and_migration_revision(client: TestClient):
    res = client.get("/health/ready")
    assert res.status_code == 200
    body = res.json()
    assert body["database"] == "ok"
    assert body["migration_revision"]


def test_readiness_returns_503_when_database_unreachable(app, client: TestClient):
    class BrokenSession:
        def execute(self, *_a, **_k):
            raise OperationalError("SELECT 1", {}, Exception("connection refused"))

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    res = client.get("/health/ready")
    assert res.status_code == 503
    assert res.json() == {"status": "unavailable", "database": "unreachable", "migration_revision": None}


def test_request_id_generated_when_absent(client: TestClient):
    res = client.get("/health")
    assert len(res.headers["X-Request-ID"]) == 32


def test_request_id_propagated_when_supplied(client: TestClient):
    res = client.get("/health", headers={"X-Request-ID": "abc-123"})
    assert res.headers["X-Request-ID"] == "abc-123"


def test_unknown_route_returns_error_envelope(client: TestClient):
    res = client.get("/api/v1/does-not-exist", headers={"X-Request-ID": "rid-404"})
    assert res.status_code == 404
    body = res.json()
    validate(body, ERROR_SCHEMA)
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["request_id"] == "rid-404"


def test_method_not_allowed_returns_error_envelope(client: TestClient):
    res = client.delete("/health")
    assert res.status_code == 405
    validate(res.json(), ERROR_SCHEMA)
    assert res.json()["error"]["code"] == "METHOD_NOT_ALLOWED"


# Probe routes mounted only in tests, to exercise domain-exception and validation handlers.
class _Payload(BaseModel):
    name: str
    count: int


@pytest.fixture
def probe_client(app) -> TestClient:
    router = APIRouter()

    @router.get("/_probe/not-found")
    def _nf():
        raise NotFoundError("Bug not found", details={"bug_id": 42})

    @router.get("/_probe/transition")
    def _tr():
        raise InvalidTransitionError("Cannot move NEW to CLOSED", details={"allowed": ["OPEN"]})

    @router.post("/_probe/validate")
    def _val(payload: _Payload):
        return payload

    @router.get("/_probe/crash")
    def _crash():
        raise RuntimeError("boom with secret details")

    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


def test_domain_not_found_maps_to_404(probe_client: TestClient):
    res = probe_client.get("/_probe/not-found")
    assert res.status_code == 404
    validate(res.json(), ERROR_SCHEMA)
    assert res.json()["error"]["details"] == {"bug_id": 42}


def test_invalid_transition_maps_to_409(probe_client: TestClient):
    res = probe_client.get("/_probe/transition")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "INVALID_TRANSITION"
    assert res.json()["error"]["details"] == {"allowed": ["OPEN"]}


def test_request_validation_maps_to_422_with_field_locations(probe_client: TestClient):
    res = probe_client.post("/_probe/validate", json={"name": "x", "count": "not-a-number"})
    assert res.status_code == 422
    body = res.json()
    validate(body, ERROR_SCHEMA)
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert ["body", "count"] in [d["loc"] for d in body["error"]["details"]]


def test_unhandled_exception_returns_500_without_leaking_details(probe_client: TestClient):
    res = probe_client.get("/_probe/crash")
    assert res.status_code == 500
    body = res.json()
    validate(body, ERROR_SCHEMA)
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "secret" not in res.text


def test_openapi_schema_available(client: TestClient):
    res = client.get("/openapi.json")
    assert res.status_code == 200
    spec = res.json()
    assert spec["info"]["title"] == "BugTrackr API"
    assert "/health/ready" in spec["paths"]


def test_swagger_ui_served(client: TestClient):
    res = client.get("/docs")
    assert res.status_code == 200
    assert "swagger-ui" in res.text.lower()


def test_cors_allows_configured_origin(client: TestClient):
    res = client.options("/health", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"})
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_rejects_unknown_origin(client: TestClient):
    res = client.options("/health", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in res.headers
