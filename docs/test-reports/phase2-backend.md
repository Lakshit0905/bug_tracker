# Phase 2 — Backend Test Execution Report

- **Executed:** 2026-11-24 23:19 UTC
- **Environment:** Python 3.13.18, PostgreSQL 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1), database `bugtracker_test`
- **Command:** `pytest -v --cov=app --junitxml=docs/test-reports/phase2-junit.xml`
- **Result:**  58 passed in 1.23s 
- **Lint:** `ruff check .` and `ruff format --check .` pass with no findings

## Summary by layer

| Layer | Tests |
|---|---|
| unit | 12 passed |
| integration | 31 passed |
| api | 15 passed |

## Defects found and fixed during this phase

| # | Found by | Description | Fix |
|---|---|---|---|
| P2-1 | Pytest | `test_database_url_built_from_parts` failed: suite-wide `APP_ENV=test` leaked into a config test | Test sets `app_env` explicitly |
| P2-2 | Ruff (S105) | Default JWT secret could reach production unnoticed | Settings refuse to load in production with a default/short secret; 3 tests added |
| P2-3 | Pytest warnings | Alembic `path_separator` and Starlette `httpx` deprecation warnings | `path_separator = os`; added `httpx2` |

## Full output

```
============================= test session starts ==============================
platform linux -- Python 3.13.18, pytest-9.2.0, pluggy-1.7.0 -- /home/claude/bugtracker/backend/.venv/bin/python
cachedir: .pytest_cache
rootdir: /home/claude/bugtracker/backend
configfile: pyproject.toml
testpaths: tests
plugins: anyio-4.16.0, cov-7.1.0
collecting ... collected 58 items

tests/api/test_health_and_errors.py::test_health_returns_ok PASSED       [  1%]
tests/api/test_health_and_errors.py::test_readiness_reports_db_and_migration_revision PASSED [  3%]
tests/api/test_health_and_errors.py::test_readiness_returns_503_when_database_unreachable PASSED [  5%]
tests/api/test_health_and_errors.py::test_request_id_generated_when_absent PASSED [  6%]
tests/api/test_health_and_errors.py::test_request_id_propagated_when_supplied PASSED [  8%]
tests/api/test_health_and_errors.py::test_unknown_route_returns_error_envelope PASSED [ 10%]
tests/api/test_health_and_errors.py::test_method_not_allowed_returns_error_envelope PASSED [ 12%]
tests/api/test_health_and_errors.py::test_domain_not_found_maps_to_404 PASSED [ 13%]
tests/api/test_health_and_errors.py::test_invalid_transition_maps_to_409 PASSED [ 15%]
tests/api/test_health_and_errors.py::test_request_validation_maps_to_422_with_field_locations PASSED [ 17%]
tests/api/test_health_and_errors.py::test_unhandled_exception_returns_500_without_leaking_details PASSED [ 18%]
tests/api/test_health_and_errors.py::test_openapi_schema_available PASSED [ 20%]
tests/api/test_health_and_errors.py::test_swagger_ui_served PASSED       [ 22%]
tests/api/test_health_and_errors.py::test_cors_allows_configured_origin PASSED [ 24%]
tests/api/test_health_and_errors.py::test_cors_rejects_unknown_origin PASSED [ 25%]
tests/integration/test_schema.py::test_all_tables_created_by_migration PASSED [ 27%]
tests/integration/test_schema.py::test_models_and_migrations_are_in_sync PASSED [ 29%]
tests/integration/test_schema.py::test_roles_are_seeded PASSED           [ 31%]
tests/integration/test_schema.py::test_pg_trgm_extension_installed PASSED [ 32%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_status] PASSED [ 34%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_severity] PASSED [ 36%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_priority] PASSED [ 37%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_category] PASSED [ 39%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_assignee_id] PASSED [ 41%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_assignee_id_status] PASSED [ 43%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_status_created_at] PASSED [ 44%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_title_trgm] PASSED [ 46%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_description_trgm] PASSED [ 48%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bug_history_bug_id_created_at] PASSED [ 50%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_notifications_recipient_id_is_read_created_at] PASSED [ 51%]
tests/integration/test_schema.py::test_user_email_must_be_unique PASSED  [ 53%]
tests/integration/test_schema.py::test_user_email_must_be_lowercase PASSED [ 55%]
tests/integration/test_schema.py::test_user_requires_existing_role PASSED [ 56%]
tests/integration/test_schema.py::test_user_defaults PASSED              [ 58%]
tests/integration/test_schema.py::test_bug_defaults_and_generated_key PASSED [ 60%]
tests/integration/test_schema.py::test_bug_rejects_invalid_enum_value PASSED [ 62%]
tests/integration/test_schema.py::test_bug_title_length_enforced PASSED  [ 63%]
tests/integration/test_schema.py::test_in_progress_bug_requires_assignee PASSED [ 65%]
tests/integration/test_schema.py::test_resolved_bug_requires_resolution_notes PASSED [ 67%]
tests/integration/test_schema.py::test_closed_bug_requires_closed_at PASSED [ 68%]
tests/integration/test_schema.py::test_reporter_cannot_be_deleted_while_referenced PASSED [ 70%]
tests/integration/test_schema.py::test_orm_update_refreshes_updated_at PASSED [ 72%]
tests/integration/test_schema.py::test_bug_children_cascade_on_bug_delete PASSED [ 74%]
tests/integration/test_schema.py::test_comment_body_cannot_be_empty PASSED [ 75%]
tests/integration/test_schema.py::test_attachment_size_must_be_positive PASSED [ 77%]
tests/integration/test_schema.py::test_keyword_search_uses_trigram_index PASSED [ 79%]
tests/unit/test_config_and_logging.py::test_database_url_built_from_parts PASSED [ 81%]
tests/unit/test_config_and_logging.py::test_test_env_selects_test_database PASSED [ 82%]
tests/unit/test_config_and_logging.py::test_database_url_override_wins PASSED [ 84%]
tests/unit/test_config_and_logging.py::test_cors_origins_parsed_into_list PASSED [ 86%]
tests/unit/test_config_and_logging.py::test_log_level_normalised_to_upper_case PASSED [ 87%]
tests/unit/test_config_and_logging.py::test_production_rejects_default_or_weak_jwt_secret[insecure-dev-only-change-me] PASSED [ 89%]
tests/unit/test_config_and_logging.py::test_production_rejects_default_or_weak_jwt_secret[too-short] PASSED [ 91%]
tests/unit/test_config_and_logging.py::test_production_accepts_strong_jwt_secret PASSED [ 93%]
tests/unit/test_config_and_logging.py::test_development_allows_default_secret PASSED [ 94%]
tests/unit/test_config_and_logging.py::test_json_formatter_emits_structured_fields PASSED [ 96%]
tests/unit/test_config_and_logging.py::test_json_formatter_redacts_sensitive_keys_including_nested PASSED [ 98%]
tests/unit/test_config_and_logging.py::test_json_formatter_includes_request_id_from_context PASSED [100%]

- generated xml file: /home/claude/bugtracker/docs/test-reports/phase2-junit.xml -
================================ tests coverage ================================
_______________ coverage: platform linux, python 3.13.18-final-0 _______________

Name                            Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------------------------
app/__init__.py                     0      0      0      0   100%
app/ai/__init__.py                  0      0      0      0   100%
app/ai/providers/__init__.py        0      0      0      0   100%
app/api/__init__.py                 0      0      0      0   100%
app/api/v1/__init__.py              0      0      0      0   100%
app/api/v1/router.py                2      0      0      0   100%
app/api/v1/routes/__init__.py       0      0      0      0   100%
app/api/v1/routes/health.py        25      0      0      0   100%
app/core/__init__.py                0      0      0      0   100%
app/core/config.py                 55      1      4      0    98%   82
app/core/enums.py                  46      0      0      0   100%
app/core/exceptions.py             57      1      2      1    97%   30
app/core/logging.py                56      1     12      1    97%   26
app/db/__init__.py                  0      0      0      0   100%
app/db/base.py                     13      0      0      0   100%
app/db/session.py                  13      5      0      0    62%   18-23
app/main.py                        19      0      0      0   100%
app/models/__init__.py              3      0      0      0   100%
app/models/bug.py                  78      1      0      0    99%   92
app/models/user.py                 41      2      0      0    95%   24, 51
app/repositories/__init__.py        0      0      0      0   100%
app/schemas/__init__.py             0      0      0      0   100%
app/schemas/health.py              10      0      0      0   100%
app/services/__init__.py            0      0      0      0   100%
---------------------------------------------------------------------------
TOTAL                             418     11     18      2    97%
============================== 58 passed in 1.23s ==============================
```
