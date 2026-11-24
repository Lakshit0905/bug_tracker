# Phase 3 — Authentication & RBAC Test Execution Report

- **Executed:** 2026-11-24 23:52 UTC
- **Environment:** Python 3.13.18, PostgreSQL 16, database `bugtracker_test`
- **Command:** `pytest -v --cov=app --junitxml=docs/test-reports/phase3-junit.xml`
- **Result:**  266 passed in 5.15s 
- **Coverage:** 98% (branch coverage enabled)
- **Lint:** ruff check + ruff format --check: clean

## Tests by layer

| Layer | Passed |
|---|---|
| unit | 108 |
| integration | 35 |
| api | 123 |

## Tests by file

| File | Passed |
|---|---|
| `tests/api/test_auth_api.py` | 54 |
| `tests/api/test_health_and_errors.py` | 15 |
| `tests/api/test_users_api.py` | 54 |
| `tests/integration/test_schema.py` | 31 |
| `tests/integration/test_seed_admin.py` | 4 |
| `tests/unit/test_config_and_logging.py` | 12 |
| `tests/unit/test_permissions.py` | 69 |
| `tests/unit/test_security.py` | 27 |

## Mutation check (do the tests actually catch regressions?)

Each security rule was broken on purpose, one at a time, and the suite was run with `-x`. The code was restored after each run.

| Deliberate defect | Caught? |
|---|---|
| Skip the `is_active` check in `get_current_user` | ✅ 1 failure |
| Remove `USERS_MANAGE` from the Admin role | ✅ 1 failure |
| Disable refresh-token reuse detection | ✅ 1 failure |
| Allow an admin to change their own role | ✅ 1 failure |

## Live end-to-end verification (uvicorn + dev DB + curl)

| Step | Expected | Observed |
|---|---|---|
| `seed_admin` run twice | created, then unchanged | ✅ |
| Register with `"role":"ADMIN"` and mixed-case email | 201, role TESTER, email lower-cased | ✅ |
| Tester calls `GET /users` | 403 | ✅ |
| Admin lists users | 200, 2 users | ✅ |
| Admin promotes tester to DEVELOPER | 200, role DEVELOPER | ✅ |
| Refresh, then replay the old refresh token | 200, then 401 `REFRESH_TOKEN_REUSED` | ✅ |
| Admin deactivates user; user's old access token | 401 `ACCOUNT_DISABLED` | ✅ |
| Passwords or tokens present in server log | none | ✅ 0 matches |

## Defects found during this phase

| # | Found by | Description | Fix |
|---|---|---|---|
| P3-1 | Code review | `seed_admin` read only OS env vars, so values in `.env` were ignored | Admin settings moved into `Settings` |
| P3-2 | Code review | `UserOut` accepted only `role_name` (ORM attribute), so building from a dict would fail | `AliasChoices("role_name", "role")` |
| P3-3 | Coverage | `require_roles` guard had no test | Parametrised guard test added |

## Full output

```
============================= test session starts ==============================
platform linux -- Python 3.13.18, pytest-9.2.0, pluggy-1.7.0 -- /home/claude/bugtracker/backend/.venv/bin/python
cachedir: .pytest_cache
rootdir: /home/claude/bugtracker/backend
configfile: pyproject.toml
testpaths: tests
plugins: anyio-4.16.0, cov-7.1.0
collecting ... collected 266 items

tests/api/test_auth_api.py::test_fr_auth_1_register_creates_tester PASSED [  0%]
tests/api/test_auth_api.py::test_register_never_returns_password_or_hash PASSED [  0%]
tests/api/test_auth_api.py::test_register_ignores_client_supplied_role PASSED [  1%]
tests/api/test_auth_api.py::test_register_normalises_email_to_lowercase PASSED [  1%]
tests/api/test_auth_api.py::test_register_stores_bcrypt_hash PASSED      [  1%]
tests/api/test_auth_api.py::test_register_duplicate_email_conflict_case_insensitive[dupe@example.com] PASSED [  2%]
tests/api/test_auth_api.py::test_register_duplicate_email_conflict_case_insensitive[DUPE@example.com] PASSED [  2%]
tests/api/test_auth_api.py::test_register_rejects_weak_passwords[Pass123-7 chars \u2014 below minimum] PASSED [  3%]
tests/api/test_auth_api.py::test_register_rejects_weak_passwords[passwordonly-no digit] PASSED [  3%]
tests/api/test_auth_api.py::test_register_rejects_weak_passwords[12345678-no letter] PASSED [  3%]
tests/api/test_auth_api.py::test_register_rejects_weak_passwords[a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1-74 bytes \u2014 over bcrypt limit] PASSED [  4%]
tests/api/test_auth_api.py::test_register_rejects_weak_passwords[-empty] PASSED [  4%]
tests/api/test_auth_api.py::test_register_accepts_password_boundaries[Pass1234] PASSED [  4%]
tests/api/test_auth_api.py::test_register_accepts_password_boundaries[a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1] PASSED [  5%]
tests/api/test_auth_api.py::test_register_rejects_invalid_email[not-an-email] PASSED [  5%]
tests/api/test_auth_api.py::test_register_rejects_invalid_email[a@] PASSED [  6%]
tests/api/test_auth_api.py::test_register_rejects_invalid_email[@example.com] PASSED [  6%]
tests/api/test_auth_api.py::test_register_rejects_invalid_email[] PASSED [  6%]
tests/api/test_auth_api.py::test_register_full_name_boundaries[A-422] PASSED [  7%]
tests/api/test_auth_api.py::test_register_full_name_boundaries[  A  -422] PASSED [  7%]
tests/api/test_auth_api.py::test_register_full_name_boundaries[Al-201] PASSED [  7%]
tests/api/test_auth_api.py::test_register_full_name_boundaries[name3-201] PASSED [  8%]
tests/api/test_auth_api.py::test_register_full_name_boundaries[name4-422] PASSED [  8%]
tests/api/test_auth_api.py::test_register_missing_fields PASSED          [  9%]
tests/api/test_auth_api.py::test_fr_auth_2_login_returns_token_pair PASSED [  9%]
tests/api/test_auth_api.py::test_login_records_last_login_and_stores_only_refresh_hash PASSED [  9%]
tests/api/test_auth_api.py::test_login_is_case_insensitive_on_email PASSED [ 10%]
tests/api/test_auth_api.py::test_login_wrong_password_and_unknown_email_are_indistinguishable PASSED [ 10%]
tests/api/test_auth_api.py::test_login_deactivated_account_forbidden PASSED [ 10%]
tests/api/test_auth_api.py::test_login_deactivated_account_with_wrong_password_reveals_nothing PASSED [ 11%]
tests/api/test_auth_api.py::test_login_missing_password_422 PASSED       [ 11%]
tests/api/test_auth_api.py::test_fr_auth_5_protected_endpoint_requires_token PASSED [ 12%]
tests/api/test_auth_api.py::test_malformed_authorization_header_401[Bearer] PASSED [ 12%]
tests/api/test_auth_api.py::test_malformed_authorization_header_401[Bearer not.a.jwt] PASSED [ 12%]
tests/api/test_auth_api.py::test_malformed_authorization_header_401[Basic dXNlcjpwYXNz] PASSED [ 13%]
tests/api/test_auth_api.py::test_malformed_authorization_header_401[Token abc] PASSED [ 13%]
tests/api/test_auth_api.py::test_expired_access_token_401 PASSED         [ 13%]
tests/api/test_auth_api.py::test_refresh_token_cannot_be_used_as_access_token PASSED [ 14%]
tests/api/test_auth_api.py::test_token_for_nonexistent_user_401 PASSED   [ 14%]
tests/api/test_auth_api.py::test_deactivation_invalidates_existing_access_token_immediately PASSED [ 15%]
tests/api/test_auth_api.py::test_refresh_rotates_tokens PASSED           [ 15%]
tests/api/test_auth_api.py::test_refresh_token_reuse_revokes_all_sessions PASSED [ 15%]
tests/api/test_auth_api.py::test_refresh_with_unknown_token_401 PASSED   [ 16%]
tests/api/test_auth_api.py::test_refresh_with_expired_token_401 PASSED   [ 16%]
tests/api/test_auth_api.py::test_refresh_for_deactivated_user_401 PASSED [ 16%]
tests/api/test_auth_api.py::test_refresh_token_length_validated[] PASSED [ 17%]
tests/api/test_auth_api.py::test_refresh_token_length_validated[short] PASSED [ 17%]
tests/api/test_auth_api.py::test_refresh_token_length_validated[value2] PASSED [ 18%]
tests/api/test_auth_api.py::test_fr_auth_3_logout_revokes_refresh_token PASSED [ 18%]
tests/api/test_auth_api.py::test_logout_is_idempotent PASSED             [ 18%]
tests/api/test_auth_api.py::test_logout_cannot_revoke_another_users_token PASSED [ 19%]
tests/api/test_auth_api.py::test_logout_requires_authentication PASSED   [ 19%]
tests/api/test_auth_api.py::test_login_rate_limited_after_threshold PASSED [ 19%]
tests/api/test_auth_api.py::test_rate_limit_is_per_endpoint PASSED       [ 20%]
tests/api/test_health_and_errors.py::test_health_returns_ok PASSED       [ 20%]
tests/api/test_health_and_errors.py::test_readiness_reports_db_and_migration_revision PASSED [ 21%]
tests/api/test_health_and_errors.py::test_readiness_returns_503_when_database_unreachable PASSED [ 21%]
tests/api/test_health_and_errors.py::test_request_id_generated_when_absent PASSED [ 21%]
tests/api/test_health_and_errors.py::test_request_id_propagated_when_supplied PASSED [ 22%]
tests/api/test_health_and_errors.py::test_unknown_route_returns_error_envelope PASSED [ 22%]
tests/api/test_health_and_errors.py::test_method_not_allowed_returns_error_envelope PASSED [ 22%]
tests/api/test_health_and_errors.py::test_domain_not_found_maps_to_404 PASSED [ 23%]
tests/api/test_health_and_errors.py::test_invalid_transition_maps_to_409 PASSED [ 23%]
tests/api/test_health_and_errors.py::test_request_validation_maps_to_422_with_field_locations PASSED [ 24%]
tests/api/test_health_and_errors.py::test_unhandled_exception_returns_500_without_leaking_details PASSED [ 24%]
tests/api/test_health_and_errors.py::test_openapi_schema_available PASSED [ 24%]
tests/api/test_health_and_errors.py::test_swagger_ui_served PASSED       [ 25%]
tests/api/test_health_and_errors.py::test_cors_allows_configured_origin PASSED [ 25%]
tests/api/test_health_and_errors.py::test_cors_rejects_unknown_origin PASSED [ 25%]
tests/api/test_users_api.py::test_me_returns_profile_and_role_capabilities[TESTER] PASSED [ 26%]
tests/api/test_users_api.py::test_me_returns_profile_and_role_capabilities[DEVELOPER] PASSED [ 26%]
tests/api/test_users_api.py::test_me_returns_profile_and_role_capabilities[PROJECT_MANAGER] PASSED [ 27%]
tests/api/test_users_api.py::test_me_returns_profile_and_role_capabilities[ADMIN] PASSED [ 27%]
tests/api/test_users_api.py::test_update_own_name PASSED                 [ 27%]
tests/api/test_users_api.py::test_update_me_rejects_invalid_or_extra_fields[payload0] PASSED [ 28%]
tests/api/test_users_api.py::test_update_me_rejects_invalid_or_extra_fields[payload1] PASSED [ 28%]
tests/api/test_users_api.py::test_update_me_rejects_invalid_or_extra_fields[payload2] PASSED [ 28%]
tests/api/test_users_api.py::test_change_password_success_and_old_password_stops_working PASSED [ 29%]
tests/api/test_users_api.py::test_change_password_wrong_current PASSED   [ 29%]
tests/api/test_users_api.py::test_change_password_same_as_current_rejected PASSED [ 30%]
tests/api/test_users_api.py::test_change_password_policy_enforced PASSED [ 30%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[TESTER-get-/api/v1/users-None] PASSED [ 30%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[TESTER-get-/api/v1/users/{id}-None] PASSED [ 31%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[TESTER-patch-/api/v1/users/{id}/role-body2] PASSED [ 31%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[TESTER-patch-/api/v1/users/{id}/status-body3] PASSED [ 31%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[DEVELOPER-get-/api/v1/users-None] PASSED [ 32%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[DEVELOPER-get-/api/v1/users/{id}-None] PASSED [ 32%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[DEVELOPER-patch-/api/v1/users/{id}/role-body2] PASSED [ 33%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[DEVELOPER-patch-/api/v1/users/{id}/status-body3] PASSED [ 33%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[PROJECT_MANAGER-get-/api/v1/users-None] PASSED [ 33%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[PROJECT_MANAGER-get-/api/v1/users/{id}-None] PASSED [ 34%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[PROJECT_MANAGER-patch-/api/v1/users/{id}/role-body2] PASSED [ 34%]
tests/api/test_users_api.py::test_non_admins_get_403_on_admin_endpoints[PROJECT_MANAGER-patch-/api/v1/users/{id}/status-body3] PASSED [ 34%]
tests/api/test_users_api.py::test_admin_endpoints_require_authentication[get-/api/v1/users-None] PASSED [ 35%]
tests/api/test_users_api.py::test_admin_endpoints_require_authentication[get-/api/v1/users/{id}-None] PASSED [ 35%]
tests/api/test_users_api.py::test_admin_endpoints_require_authentication[patch-/api/v1/users/{id}/role-body2] PASSED [ 36%]
tests/api/test_users_api.py::test_admin_endpoints_require_authentication[patch-/api/v1/users/{id}/status-body3] PASSED [ 36%]
tests/api/test_users_api.py::test_admin_lists_users_paginated PASSED     [ 36%]
tests/api/test_users_api.py::test_admin_search_filters PASSED            [ 37%]
tests/api/test_users_api.py::test_admin_search_rejects_invalid_params[params0] PASSED [ 37%]
tests/api/test_users_api.py::test_admin_search_rejects_invalid_params[params1] PASSED [ 37%]
tests/api/test_users_api.py::test_admin_search_rejects_invalid_params[params2] PASSED [ 38%]
tests/api/test_users_api.py::test_admin_search_rejects_invalid_params[params3] PASSED [ 38%]
tests/api/test_users_api.py::test_admin_page_beyond_end_returns_empty PASSED [ 39%]
tests/api/test_users_api.py::test_admin_changes_role_and_it_applies_to_existing_token PASSED [ 39%]
tests/api/test_users_api.py::test_admin_cannot_change_own_role PASSED    [ 39%]
tests/api/test_users_api.py::test_admin_cannot_deactivate_self PASSED    [ 40%]
tests/api/test_users_api.py::test_invalid_role_value_422 PASSED          [ 40%]
tests/api/test_users_api.py::test_unknown_user_404[/api/v1/users/999999] PASSED [ 40%]
tests/api/test_users_api.py::test_unknown_user_404[/api/v1/users/999999/role] PASSED [ 41%]
tests/api/test_users_api.py::test_unknown_user_404[/api/v1/users/999999/status] PASSED [ 41%]
tests/api/test_users_api.py::test_non_integer_user_id_422 PASSED         [ 42%]
tests/api/test_users_api.py::test_deactivate_blocks_login_and_refresh_then_reactivate_restores PASSED [ 42%]
tests/api/test_users_api.py::test_admin_get_user_detail PASSED           [ 42%]
tests/api/test_users_api.py::test_developers_list_access[PROJECT_MANAGER-200] PASSED [ 43%]
tests/api/test_users_api.py::test_developers_list_access[ADMIN-200] PASSED [ 43%]
tests/api/test_users_api.py::test_developers_list_access[TESTER-403] PASSED [ 43%]
tests/api/test_users_api.py::test_developers_list_access[DEVELOPER-403] PASSED [ 44%]
tests/api/test_users_api.py::test_developers_list_contains_only_active_developers PASSED [ 44%]
tests/api/test_users_api.py::test_require_roles_guard[TESTER-200] PASSED [ 45%]
tests/api/test_users_api.py::test_require_roles_guard[PROJECT_MANAGER-200] PASSED [ 45%]
tests/api/test_users_api.py::test_require_roles_guard[DEVELOPER-403] PASSED [ 45%]
tests/api/test_users_api.py::test_require_roles_guard[ADMIN-403] PASSED  [ 46%]
tests/integration/test_schema.py::test_all_tables_created_by_migration PASSED [ 46%]
tests/integration/test_schema.py::test_models_and_migrations_are_in_sync PASSED [ 46%]
tests/integration/test_schema.py::test_roles_are_seeded PASSED           [ 47%]
tests/integration/test_schema.py::test_pg_trgm_extension_installed PASSED [ 47%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_status] PASSED [ 48%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_severity] PASSED [ 48%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_priority] PASSED [ 48%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_category] PASSED [ 49%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_assignee_id] PASSED [ 49%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_assignee_id_status] PASSED [ 50%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_status_created_at] PASSED [ 50%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_title_trgm] PASSED [ 50%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bugs_description_trgm] PASSED [ 51%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_bug_history_bug_id_created_at] PASSED [ 51%]
tests/integration/test_schema.py::test_filter_indexes_exist[ix_notifications_recipient_id_is_read_created_at] PASSED [ 51%]
tests/integration/test_schema.py::test_user_email_must_be_unique PASSED  [ 52%]
tests/integration/test_schema.py::test_user_email_must_be_lowercase PASSED [ 52%]
tests/integration/test_schema.py::test_user_requires_existing_role PASSED [ 53%]
tests/integration/test_schema.py::test_user_defaults PASSED              [ 53%]
tests/integration/test_schema.py::test_bug_defaults_and_generated_key PASSED [ 53%]
tests/integration/test_schema.py::test_bug_rejects_invalid_enum_value PASSED [ 54%]
tests/integration/test_schema.py::test_bug_title_length_enforced PASSED  [ 54%]
tests/integration/test_schema.py::test_in_progress_bug_requires_assignee PASSED [ 54%]
tests/integration/test_schema.py::test_resolved_bug_requires_resolution_notes PASSED [ 55%]
tests/integration/test_schema.py::test_closed_bug_requires_closed_at PASSED [ 55%]
tests/integration/test_schema.py::test_reporter_cannot_be_deleted_while_referenced PASSED [ 56%]
tests/integration/test_schema.py::test_orm_update_refreshes_updated_at PASSED [ 56%]
tests/integration/test_schema.py::test_bug_children_cascade_on_bug_delete PASSED [ 56%]
tests/integration/test_schema.py::test_comment_body_cannot_be_empty PASSED [ 57%]
tests/integration/test_schema.py::test_attachment_size_must_be_positive PASSED [ 57%]
tests/integration/test_schema.py::test_keyword_search_uses_trigram_index PASSED [ 57%]
tests/integration/test_seed_admin.py::test_seed_creates_admin PASSED     [ 58%]
tests/integration/test_seed_admin.py::test_seed_is_idempotent PASSED     [ 58%]
tests/integration/test_seed_admin.py::test_seed_promotes_and_reactivates_existing_user PASSED [ 59%]
tests/integration/test_seed_admin.py::test_seed_rejects_weak_password PASSED [ 59%]
tests/unit/test_config_and_logging.py::test_database_url_built_from_parts PASSED [ 59%]
tests/unit/test_config_and_logging.py::test_test_env_selects_test_database PASSED [ 60%]
tests/unit/test_config_and_logging.py::test_database_url_override_wins PASSED [ 60%]
tests/unit/test_config_and_logging.py::test_cors_origins_parsed_into_list PASSED [ 60%]
tests/unit/test_config_and_logging.py::test_log_level_normalised_to_upper_case PASSED [ 61%]
tests/unit/test_config_and_logging.py::test_production_rejects_default_or_weak_jwt_secret[insecure-dev-only-change-me] PASSED [ 61%]
tests/unit/test_config_and_logging.py::test_production_rejects_default_or_weak_jwt_secret[too-short] PASSED [ 62%]
tests/unit/test_config_and_logging.py::test_production_accepts_strong_jwt_secret PASSED [ 62%]
tests/unit/test_config_and_logging.py::test_development_allows_default_secret PASSED [ 62%]
tests/unit/test_config_and_logging.py::test_json_formatter_emits_structured_fields PASSED [ 63%]
tests/unit/test_config_and_logging.py::test_json_formatter_redacts_sensitive_keys_including_nested PASSED [ 63%]
tests/unit/test_config_and_logging.py::test_json_formatter_includes_request_id_from_context PASSED [ 63%]
tests/unit/test_permissions.py::test_every_capability_is_specified PASSED [ 64%]
tests/unit/test_permissions.py::test_every_role_has_a_capability_set PASSED [ 64%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:view] PASSED [ 65%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:create] PASSED [ 65%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:edit:any] PASSED [ 65%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:edit:own] PASSED [ 66%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:set_priority] PASSED [ 66%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:assign] PASSED [ 66%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:transition] PASSED [ 67%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:comment] PASSED [ 67%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:attach:any] PASSED [ 68%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:attach:assigned] PASSED [ 68%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-bug:view_history] PASSED [ 68%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-dashboard:basic] PASSED [ 69%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-dashboard:full] PASSED [ 69%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-reports:view] PASSED [ 69%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-users:manage] PASSED [ 70%]
tests/unit/test_permissions.py::test_permission_matrix_cell[TESTER-users:list_developers] PASSED [ 70%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:view] PASSED [ 71%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:create] PASSED [ 71%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:edit:any] PASSED [ 71%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:edit:own] PASSED [ 72%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:set_priority] PASSED [ 72%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:assign] PASSED [ 72%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:transition] PASSED [ 73%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:comment] PASSED [ 73%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:attach:any] PASSED [ 74%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:attach:assigned] PASSED [ 74%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-bug:view_history] PASSED [ 74%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-dashboard:basic] PASSED [ 75%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-dashboard:full] PASSED [ 75%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-reports:view] PASSED [ 75%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-users:manage] PASSED [ 76%]
tests/unit/test_permissions.py::test_permission_matrix_cell[DEVELOPER-users:list_developers] PASSED [ 76%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:view] PASSED [ 77%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:create] PASSED [ 77%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:edit:any] PASSED [ 77%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:edit:own] PASSED [ 78%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:set_priority] PASSED [ 78%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:assign] PASSED [ 78%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:transition] PASSED [ 79%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:comment] PASSED [ 79%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:attach:any] PASSED [ 80%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:attach:assigned] PASSED [ 80%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-bug:view_history] PASSED [ 80%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-dashboard:basic] PASSED [ 81%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-dashboard:full] PASSED [ 81%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-reports:view] PASSED [ 81%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-users:manage] PASSED [ 82%]
tests/unit/test_permissions.py::test_permission_matrix_cell[PROJECT_MANAGER-users:list_developers] PASSED [ 82%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:view] PASSED [ 83%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:create] PASSED [ 83%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:edit:any] PASSED [ 83%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:edit:own] PASSED [ 84%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:set_priority] PASSED [ 84%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:assign] PASSED [ 84%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:transition] PASSED [ 85%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:comment] PASSED [ 85%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:attach:any] PASSED [ 86%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:attach:assigned] PASSED [ 86%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-bug:view_history] PASSED [ 86%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-dashboard:basic] PASSED [ 87%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-dashboard:full] PASSED [ 87%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-reports:view] PASSED [ 87%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-users:manage] PASSED [ 88%]
tests/unit/test_permissions.py::test_permission_matrix_cell[ADMIN-users:list_developers] PASSED [ 88%]
tests/unit/test_permissions.py::test_admin_cannot_modify_bugs PASSED     [ 89%]
tests/unit/test_permissions.py::test_only_admin_manages_users PASSED     [ 89%]
tests/unit/test_permissions.py::test_capabilities_for_is_sorted_strings PASSED [ 89%]
tests/unit/test_security.py::test_fr_auth_4_password_hash_is_bcrypt_and_not_plaintext PASSED [ 90%]
tests/unit/test_security.py::test_same_password_hashes_differently_each_time PASSED [ 90%]
tests/unit/test_security.py::test_verify_password_accepts_correct_and_rejects_wrong PASSED [ 90%]
tests/unit/test_security.py::test_verify_password_handles_malformed_hash PASSED [ 91%]
tests/unit/test_security.py::test_password_over_72_bytes_rejected_by_hash_and_verify PASSED [ 91%]
tests/unit/test_security.py::test_password_of_exactly_72_bytes_is_supported PASSED [ 92%]
tests/unit/test_security.py::test_access_token_round_trip PASSED         [ 92%]
tests/unit/test_security.py::test_access_token_contains_no_role_or_personal_data PASSED [ 92%]
tests/unit/test_security.py::test_expired_access_token_rejected PASSED   [ 93%]
tests/unit/test_security.py::test_tampered_signature_rejected PASSED     [ 93%]
tests/unit/test_security.py::test_token_signed_with_other_secret_rejected PASSED [ 93%]
tests/unit/test_security.py::test_alg_none_token_rejected PASSED         [ 94%]
tests/unit/test_security.py::test_wrong_claims_rejected[override0-type] PASSED [ 94%]
tests/unit/test_security.py::test_wrong_claims_rejected[override1-Invalid token] PASSED [ 95%]
tests/unit/test_security.py::test_wrong_claims_rejected[override2-subject] PASSED [ 95%]
tests/unit/test_security.py::test_token_missing_required_claim_rejected PASSED [ 95%]
tests/unit/test_security.py::test_garbage_token_rejected[] PASSED        [ 96%]
tests/unit/test_security.py::test_garbage_token_rejected[abc] PASSED     [ 96%]
tests/unit/test_security.py::test_garbage_token_rejected[a.b.c] PASSED   [ 96%]
tests/unit/test_security.py::test_garbage_token_rejected[Bearer xyz] PASSED [ 97%]
tests/unit/test_security.py::test_refresh_tokens_are_random_and_long PASSED [ 97%]
tests/unit/test_security.py::test_refresh_token_hash_is_deterministic_sha256 PASSED [ 98%]
tests/unit/test_security.py::test_refresh_token_expiry_uses_configured_days PASSED [ 98%]
tests/unit/test_security.py::test_rate_limiter_allows_up_to_limit_then_blocks PASSED [ 98%]
tests/unit/test_security.py::test_rate_limiter_window_slides PASSED      [ 99%]
tests/unit/test_security.py::test_rate_limiter_keys_are_independent PASSED [ 99%]
tests/unit/test_security.py::test_rate_limiter_reset PASSED              [100%]

- generated xml file: /home/claude/bugtracker/docs/test-reports/phase3-junit.xml -
================================ tests coverage ================================
_______________ coverage: platform linux, python 3.13.18-final-0 _______________

Name                                  Stmts   Miss Branch BrPart  Cover   Missing
---------------------------------------------------------------------------------
app/__init__.py                           0      0      0      0   100%
app/ai/__init__.py                        0      0      0      0   100%
app/ai/providers/__init__.py              0      0      0      0   100%
app/api/__init__.py                       0      0      0      0   100%
app/api/deps.py                          41      0     10      0   100%
app/api/v1/__init__.py                    0      0      0      0   100%
app/api/v1/router.py                      5      0      0      0   100%
app/api/v1/routes/__init__.py             0      0      0      0   100%
app/api/v1/routes/auth.py                27      0      0      0   100%
app/api/v1/routes/health.py              25      0      0      0   100%
app/api/v1/routes/users.py               43      0      0      0   100%
app/core/__init__.py                      0      0      0      0   100%
app/core/config.py                       61      1      4      0    98%   90
app/core/enums.py                        46      0      0      0   100%
app/core/exceptions.py                   64      0      2      0   100%
app/core/logging.py                      56      1     12      1    97%   26
app/core/rate_limit.py                   23      0      4      0   100%
app/core/security.py                     63      0      8      0   100%
app/db/__init__.py                        0      0      0      0   100%
app/db/base.py                           13      0      0      0   100%
app/db/session.py                        13      5      0      0    62%   18-23
app/main.py                              21      0      0      0   100%
app/models/__init__.py                    3      0      0      0   100%
app/models/bug.py                        78      1      0      0    99%   92
app/models/user.py                       41      2      0      0    95%   24, 51
app/repositories/__init__.py              0      0      0      0   100%
app/repositories/user_repository.py      50      0      8      1    98%   75->77
app/schemas/__init__.py                   0      0      0      0   100%
app/schemas/auth.py                      21      0      0      0   100%
app/schemas/common.py                    14      0      0      0   100%
app/schemas/health.py                    10      0      0      0   100%
app/schemas/user.py                      46      0      6      0   100%
app/services/__init__.py                  0      0      0      0   100%
app/services/auth_service.py             81      3     18      0    97%   59-61
app/services/permissions.py              25      0      0      0   100%
app/services/user_service.py             60      0     16      2    97%   65->70, 76->86
---------------------------------------------------------------------------------
TOTAL                                   930     13     88      4    98%
============================= 266 passed in 5.15s ==============================
```
