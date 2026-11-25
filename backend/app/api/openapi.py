"""Make the published OpenAPI document match what the server actually returns.

FastAPI documents validation errors with its default `HTTPValidationError` ({"detail": [...]}) and omits
the 401/404/500 responses that our dependencies and exception handlers produce. This post-processor:

* replaces the schema of every 4xx/5xx response with the real envelope (`ErrorResponse`);
* adds 401 to every operation that requires a bearer token, 404 to every operation with path parameters,
  422 to every operation with parameters or a body, and 500 everywhere;
* removes the now-unused default validation schemas.

The black-box API suite (e2e/tests/api) fails on any status code that isn't documented here, and validates
every body against these schemas, so documentation drift is caught automatically.
"""

from typing import Any

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

from app.schemas.common import ErrorResponse

ERROR_REF = {"$ref": "#/components/schemas/ErrorResponse"}
DEFAULT_DESCRIPTIONS = {
    "400": "Bad request",
    "401": "Missing, invalid or expired access token",
    "403": "Not permitted for this role or resource",
    "404": "Resource not found",
    "409": "Conflicts with the resource's current state",
    "413": "Payload too large",
    "415": "Unsupported media type",
    "422": "Validation error (field-level details in error.details)",
    "429": "Rate limited (see Retry-After)",
    "500": "Unexpected server error (quote error.request_id when reporting)",
}


def _add(responses: dict[str, Any], code: str) -> None:
    responses.setdefault(code, {"description": DEFAULT_DESCRIPTIONS[code]})


def build_openapi(app: FastAPI) -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title, version=app.version, description=app.description, routes=app.routes, tags=app.openapi_tags
    )
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    error_schema = ErrorResponse.model_json_schema(ref_template="#/components/schemas/{model}")
    for name, sub in error_schema.pop("$defs", {}).items():
        components[name] = sub
    components["ErrorResponse"] = error_schema

    for path_item in schema.get("paths", {}).values():
        for op in path_item.values():
            responses: dict[str, Any] = op.setdefault("responses", {})
            if op.get("security"):
                _add(responses, "401")
            params = op.get("parameters", [])
            if any(p.get("in") == "path" for p in params):
                _add(responses, "404")
            if params or op.get("requestBody"):
                _add(responses, "422")
            _add(responses, "500")
            for code, resp in responses.items():
                if code.isdigit() and int(code) >= 400:
                    resp["description"] = (resp.get("description") or DEFAULT_DESCRIPTIONS.get(code, "Error")).replace(
                        "Validation Error", DEFAULT_DESCRIPTIONS["422"]
                    )
                    resp["content"] = {"application/json": {"schema": ERROR_REF}}

    for unused in ("HTTPValidationError", "ValidationError"):
        components.pop(unused, None)
    app.openapi_schema = schema
    return schema


def install(app: FastAPI) -> None:
    app.openapi = lambda: build_openapi(app)  # type: ignore[method-assign]
