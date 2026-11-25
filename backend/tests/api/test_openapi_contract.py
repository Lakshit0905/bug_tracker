"""The published OpenAPI document must describe the real error envelope and status codes (regression P7-1)."""

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.api


@pytest.fixture
def spec(client: TestClient) -> dict:
    return client.get("/openapi.json").json()


def _operations(spec: dict):
    for path, item in spec["paths"].items():
        for method, op in item.items():
            yield path, method, op


def test_default_validation_schemas_are_gone(spec: dict):
    schemas = spec["components"]["schemas"]
    assert "HTTPValidationError" not in schemas
    assert set(schemas["ErrorResponse"]["required"]) == {"error"}


def test_every_error_response_uses_the_envelope(spec: dict):
    for path, method, op in _operations(spec):
        for code, resp in op["responses"].items():
            if int(code) >= 400:
                ref = resp["content"]["application/json"]["schema"]["$ref"]
                assert ref == "#/components/schemas/ErrorResponse", f"{method} {path} {code}"


def test_standard_error_codes_are_documented(spec: dict):
    for path, method, op in _operations(spec):
        codes = set(op["responses"])
        assert "500" in codes, f"{method} {path}"
        if op.get("security"):
            assert "401" in codes, f"{method} {path}"
        if "{" in path:
            assert "404" in codes, f"{method} {path}"


def test_documented_422_matches_actual_body(client: TestClient):
    body = client.post("/api/v1/auth/login", json={}).json()
    assert set(body) == {"error"} and body["error"]["code"] == "VALIDATION_ERROR"
