# Project Checklist

Legend: `[x]` done and verified · `[~]` in progress · `[ ]` pending

Rule: a test is only ticked when it has actually been executed and passed; the evidence is in `docs/test-reports/`.

## Phase 1 — Requirements analysis and architecture ✅
- [x] Requirements analysis, roles, ambiguity decisions (`docs/01-requirements-analysis.md`)
- [x] Permission matrix
- [x] Bug lifecycle + transition rules table
- [x] Functional & non-functional requirements with IDs (traceability)
- [x] System architecture + diagrams (`docs/02-architecture.md`)
- [x] Planned REST endpoint list
- [x] Technology stack + versions (`docs/03-technology-stack.md`)
- [x] Project folder structure
- [x] Git repository initialised, `.gitignore`, `.env.example`
- [x] Branching strategy & GitHub Issues structure (`docs/04-development-workflow.md`)

## Phase 2 — Database schema and backend setup ✅
- [x] FastAPI app factory, config (pydantic-settings), structured JSON logging + request IDs, error envelope
- [x] SQLAlchemy models for all v1 tables (8 tables; AI tables arrive with the v2 migration)
- [x] Alembic initial migration (reviewed; pg_trgm + role seed added by hand); downgrade verified
- [x] ER diagram + database design doc (`docs/05-database-design.md`)
- [x] `/health` and `/health/ready`; Swagger at `/docs`
- [x] Pytest infrastructure: dedicated test DB, migrations run each session, per-test rollback, data factories
- [x] 58 tests executed and passing, 97% coverage, ruff clean (`docs/test-reports/phase2-backend.md`)

## Phase 3 — Authentication and RBAC ✅
- [x] Register / login / refresh (rotation + reuse detection) / logout
- [x] bcrypt hashing (72-byte guard), JWT with pinned algorithm and required claims
- [x] `get_current_user`, `require_roles`, `require_capability`; permission matrix in code
- [x] Login/register/refresh rate limiting (429 + Retry-After)
- [x] Admin seed script (idempotent)
- [x] Profile endpoints (view, rename, change password) and admin user management (search, role, activate/deactivate)
- [x] 266 tests executed and passing, 98% coverage; 4/4 deliberate security mutations caught (`docs/test-reports/phase3-auth-rbac.md`)
- [x] Live end-to-end check with curl against the dev DB
- [x] Security design doc (`docs/06-authentication-and-rbac.md`)

## Phase 4 — Core bug management ✅
- [x] Bug create / read / edit with role + ownership + status rules
- [x] Workflow engine; 432-case exhaustive transition matrix against an independent oracle
- [x] Assignment (active developers only, reassign vs unassign rules) & PM-only priority
- [x] Comments, append-only audit history, attachments (allow-list, magic bytes, size limit, safe download)
- [x] Search: 7 filter types, keyword + bug-key search, rank-aware sorting, pagination
- [x] Notifications: assignment, status change, comment, reopen; read / read-all / unread count
- [x] Dashboard: summary, trends, activity, workload; reports (closure, MTTR, reopen rate)
- [x] Row locking verified under concurrent requests (2 workers)
- [x] Demo data seed through the real services
- [x] 982 tests executed and passing, 99% coverage; 7/7 deliberate business-rule mutations caught (`docs/test-reports/phase4-bug-management.md`)

## Phase 5 — Frontend and dashboard ✅
- [x] Vite 8 + React 19 + TypeScript (strict) + Tailwind 4; design tokens; light, dark and system themes
- [x] App shell: role-aware sidebar, top bar (search, report bug, theme, user menu), mobile drawer, route guards
- [x] All 12 pages working against the real API (AI page explains v2.0, with no placeholder data)
- [x] Lifecycle rail, status/severity/priority badges, charts (validated palette), loading/empty/error states, confirmation dialogs, toasts
- [x] Typed API client with single-flight token refresh; filters kept in the URL; code-split routes
- [x] Typecheck, lint (incl. jsx-a11y) and build clean; 18-screen browser run as 4 roles with no console errors or 5xx (`docs/test-reports/phase5-frontend.md`)
- [x] Defect P5-1 (refresh rate limit signed users out) found, fixed in backend + frontend, regression test added

## Phase 6 — Integration ✅
- [x] Frontend ↔ backend through the typed client (dev proxy and cross-origin production build)
- [x] Configurable API origin (`VITE_API_URL`), CORS allow-list, attachment downloads re-based for any origin
- [x] Token refresh hardened: one refresh per expiry even when a 401 arrives after the refresh has finished
- [x] Return to the original page after sign-in (defect P6-1 fixed)
- [x] Isolated e2e stack (own DB + ports), migrations + seed in global setup; Page Objects and fixtures
- [x] 17 integration tests passing, stable over 3 full runs; deliberate-break checks confirm they catch P5-1, P6-1 and loss of single-flight refresh
- [x] One-command local start (`scripts/dev.sh`)

## Phase 7 — v1.0 testing
- [ ] Playwright framework (POM, fixtures, data builders)
- [ ] E2E suites: login, RBAC, create, assign, transitions, search, dashboard
- [ ] Coverage report, test execution report

## Phase 8 — Fix defects & release v1.0
- [ ] Defect log
- [ ] Release notes v1.0, tag `v1.0.0`

## Phase 9 — AI features
- [ ] Provider abstraction (OpenAI, heuristic, disabled)
- [ ] Categorisation, duplicates, priority, severity, summary, developer recommendation
- [ ] Validation, timeouts, fallback, decision logging
- [ ] AI analysis page + create-bug integration

## Phase 10 — AI evaluation
- [ ] Labelled dataset
- [ ] Metrics + thresholds harness
- [ ] Failure-mode & consistency tests

## Phase 11 — Regression & system testing
- [ ] Full regression run, report

## Phase 12 — Docker, CI/CD, AWS
- [ ] Dockerfiles, Compose, health checks, volumes
- [ ] GitHub Actions pipeline (9 stages)
- [ ] AWS EC2 deployment guide

## Phase 13 — Release v2.0
- [ ] Release notes v2.0, tag `v2.0.0`
- [ ] Final README, architecture & ER diagrams, test reports
