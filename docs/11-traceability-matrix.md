# 11 — Requirements Traceability Matrix (v1.0)

Each requirement from `01-requirements-analysis.md` is mapped to the automated tests that verify it. Paths are relative to `backend/tests/` (pytest), `frontend/src/__tests__/` (Vitest) and `e2e/tests/` (Playwright).

| ID | Requirement | Backend (pytest) | Black-box API | UI / integration |
|---|---|---|---|---|
| FR-AUTH-1 | Register; password policy | `api/test_auth_api.py` (register_*, password boundaries, duplicate email) | `api/auth-users` (round trip, 7/8/72/73-byte passwords, duplicate) | `functional/auth-rbac` (registration validation), `integration/session` (new account), `integration/consistency` (server error on field); Vitest `bug-form-validation` |
| FR-AUTH-2 | Login issues access + refresh token | `unit/test_security.py`, `api/test_auth_api.py` (login_*) | `api/auth-users` | `functional/auth-rbac` (login per role, wrong password) |
| FR-AUTH-3 | Logout revokes refresh token | `api/test_auth_api.py` (logout_*, replay after logout) | `api/auth-users` (logout → refresh 401) | `integration/session` (sign out revokes) |
| FR-AUTH-4 | bcrypt hashing, never exposed | `unit/test_security.py`, `api/test_auth_api.py` (hash stored, never returned) | — | — |
| FR-AUTH-5 | Every protected endpoint checks token, active flag, role | `api/test_auth_api.py` (expired/forged/refresh-as-access), `api/test_users_api.py` (RBAC) | `api/authz-matrix` (56 cells + anonymous) | `integration/session` (deactivated user signed out), Vitest `api-client` (refresh) |
| FR-USER-1 | Admin manages users; cannot modify self | `api/test_users_api.py` | `api/auth-users` (admin search/role/status, self-protection) | `functional/search-dashboard` (admin page), `integration/session` (promotion applies live) |
| FR-USER-2 | Own profile and password | `api/test_users_api.py` | `api/auth-users` (profile, password) | a11y scan of profile |
| FR-BUG-1 | Create, view, edit with role + ownership rules | `api/test_bugs_api.py` (create boundaries, edit rules) | `api/bugs` (CRUD, 422s, priority-on-create) | `functional/bugs` (form validation, boundaries, edit only changed fields, closed read-only), `functional/auth-rbac` (edit visibility) |
| FR-BUG-2 | Assign / reassign; active developers only | `api/test_bugs_api.py` (assignment_*) | `api/bugs` (assignment) | `functional/bugs` (assign, notify, unassign disabled, deactivated dev hidden) |
| FR-BUG-3 | Lifecycle transitions with rules | `unit/test_workflow.py` (432-case matrix), `api/test_workflow_api.py` | `api/bugs` (full lifecycle + every error code) | `functional/bugs` (actions per status × role, resolve dialog), `integration/lifecycle` |
| FR-BUG-4 | Attachments | `api/test_comments_attachments_api.py` (types, magic bytes, size, traversal, download headers) | `api/children-dashboard` (round trip, rejections, 10 MiB+1) | `integration/lifecycle` (upload), `prod-build/cross-origin` (download) |
| FR-CMT-1 | Comments | `api/test_comments_attachments_api.py` | `api/children-dashboard` | `integration/lifecycle`, `functional/auth-rbac` (admin cannot comment) |
| FR-HIST-1 | Complete audit trail | `api/test_bugs_api.py`, `api/test_workflow_api.py`, `api/test_comments_attachments_api.py` | `api/children-dashboard` | `functional/bugs` (history entry after edit / assign), `integration/lifecycle` (history in DB) |
| FR-SRCH-1 | Filter, keyword, sort, paginate | `api/test_search_api.py` | `api/bugs` (search) | `functional/search-dashboard` (keyword + URL, combined filters, priority sort, key search, scope, pagination, empty state) |
| FR-DASH-1 | Dashboard and reports | `api/test_notifications_dashboard_api.py` | `api/children-dashboard` | `functional/search-dashboard` (workload vs queue, KPI ↔ API, trend range, activity), `integration/consistency` |
| FR-NOTIF-1 | Notifications on events | `api/test_workflow_api.py`, `api/test_bugs_api.py` | `api/children-dashboard` | `functional/bugs` (badge increments), `integration/lifecycle` |
| FR-NOTIF-2 | Read / read-all / unread count | `api/test_notifications_dashboard_api.py` | `api/children-dashboard` | `functional/search-dashboard` (open marks read, mark all) |
| NFR Security | See test strategy, security techniques | `unit/test_security.py`, `api/test_auth_api.py`, `api/test_comments_attachments_api.py` | `api/auth-users`, `prod-build` (CORS) | `integration/session` |
| NFR Reliability | Error envelope; transactions; concurrency | `api/test_health_and_errors.py`, `api/test_openapi_contract.py` | Contract validation on every call | `integration/session` (outage recovery) |
| NFR Usability / a11y | WCAG 2.1 AA, keyboard, themes | — | — | `a11y/axe` (both themes, every page), `visual/screens` |
| NFR Maintainability | Lint, types, migrations in sync | `integration/test_schema.py` (models ↔ migrations) | — | tsc + oxlint in the v1.0 report |
