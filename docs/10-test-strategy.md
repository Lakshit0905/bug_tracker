# 10 — Test Strategy

## Objectives

1. Prove every functional requirement (FR-*) and the permission matrix work as specified, for every role.
2. Catch regressions automatically at the cheapest layer that can detect them.
3. Treat security, accessibility and the published API contract as tested requirements, not afterthoughts.
4. Make results trustworthy: tests are isolated and deterministic, and a test only counts once it has been seen to fail against the defect it targets.

## Test pyramid (v1.0)

```
                      ▲  visual regression        6   Playwright screenshots (static screens, light + dark)
                     ▲▲  accessibility            9   axe-core WCAG 2.1 AA, every page, both themes
                    ▲▲▲  UI functional + integ.  67   Playwright + Page Objects (all roles, all pages; prod build)
                  ▲▲▲▲▲  black-box API           99   Playwright APIRequestContext + OpenAPI contract validation
              ▲▲▲▲▲▲▲▲▲  backend API (in-process) 370  pytest + TestClient + jsonschema
          ▲▲▲▲▲▲▲▲▲▲▲▲▲  backend integration      37   pytest against real PostgreSQL (schema, migrations, seed)
      ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲  unit                    630   pytest (581: workflow matrix, RBAC, security) + Vitest (49)
```

| Level | Tool | Location | What it proves | Runs |
|---|---|---|---|---|
| Unit (backend) | pytest | `backend/tests/unit` | Workflow engine (432-case matrix vs an independent oracle), permission matrix, JWT/bcrypt, rate limiter, config | every commit |
| Unit (frontend) | Vitest | `frontend/src/__tests__` | Form validation boundaries, API client (refresh, error mapping), formatting | every commit |
| Integration (DB) | pytest + PostgreSQL | `backend/tests/integration` | Constraints, indexes, migrations up/down/up, models ↔ migrations in sync, seed scripts | every commit |
| API (in-process) | pytest + TestClient | `backend/tests/api` | Every endpoint: positive, negative, boundary, schema, authN/authZ, side effects (history, notifications) | every commit |
| API (black-box, contract) | Playwright API | `e2e/tests/api` | The running server matches its published OpenAPI document; authorization matrix; 100% operation coverage | every PR |
| UI functional | Playwright + POM | `e2e/tests/functional` | Every page and role: login, RBAC, create/edit, assignment, transitions, search, dashboard, notifications, admin | every PR |
| UI integration | Playwright | `e2e/tests/integration`, `prod-build` | Cross-role journeys, session expiry/revocation/outage, UI ↔ API ↔ DB consistency, cross-origin production build | every PR |
| Accessibility | axe-core | `e2e/tests/a11y` | No serious/critical WCAG 2.1 AA violations; keyboard path | every PR |
| Visual | Playwright screenshots | `e2e/tests/visual` | Static screens unchanged (0.1% pixel tolerance) | on demand (baselines are platform-specific) |

## Environments and data

| Suite | Database | Isolation |
|---|---|---|
| pytest | `bugtracker_test` | Schema rebuilt from migrations each session; every test in a transaction rolled back afterwards |
| Playwright | `bugtracker_e2e` | Own API (:8100) and web (:5174 / :4174) servers; DB migrated and seeded by `global-setup.ts`; each test creates uniquely named data |
| Development | `bugtracker` | Never touched by tests |

**Test data:** factories (`backend/tests/factories.py`) for pytest; for Playwright, the demo seed provides the users and `fixtures/arrange.ts` puts a bug into any lifecycle state through the real API. Tests never depend on another test's data or on seeded bug IDs.

## Techniques

- **Equivalence classes and boundaries:** every length limit is tested at limit−1, at the limit and at limit+1 (titles 4/5/200/201, passwords 7/8/72/73 bytes, comments 0/5000/5001, uploads 10 MiB / +1 byte, `days` 0/1/365/366, `page_size` 0/1/100/101).
- **Decision tables:** the 6×6 status × 4 role × 3 assignee matrix; the 14-operation × 4-role authorization matrix; UI action menus per status and role.
- **State transition testing:** the complete lifecycle including the reopen loop, through the API and the UI.
- **Contract testing:** responses validated against `/openapi.json`; undocumented status codes fail.
- **Security tests:** account enumeration, brute-force limits, token tampering / `alg: none`, refresh-token rotation and reuse, privilege escalation at signup, mass assignment, path traversal, disguised uploads, LIKE-wildcard injection, CORS allow-list.
- **Mutation spot-checks:** for key rules and every fixed defect, the rule was broken on purpose to confirm a test fails (15 deliberate breaks across Phases 3–7, all caught).

## Entry and exit criteria for v1.0

| Criterion | Target |
|---|---|
| All automated suites | 100% pass in a single run, no flaky retries |
| Backend coverage (statement + branch) | ≥ 85% |
| Requirement traceability | Every FR has at least one automated test (`11-traceability-matrix.md`) |
| API operation coverage (black-box) | 100% |
| Accessibility | 0 serious/critical axe violations |
| Open defects | No open High or Medium defects |
| Static checks | ruff, tsc (strict), oxlint (incl. jsx-a11y): 0 findings |

## Defect management

Defects get an ID per phase (`P<phase>-<n>`), a severity, how they were found, root cause, fix, and the test that now guards them. They are logged in each phase's report and consolidated in `test-reports/v1.0-test-report.md`.

| Severity | Meaning |
|---|---|
| High | Data loss, security weakness, or a core workflow blocked or broken for real users |
| Medium | Wrong behaviour with a workaround; misleading contract or documentation; WCAG AA failure |
| Low | Cosmetic, minor UX, or development-only |

## Running everything

```bash
cd backend  && pytest --cov=app                 # 988 tests
cd frontend && npm test && npm run typecheck && npm run lint
cd e2e      && npm test                         # api, functional, integration, prod-build, a11y
cd e2e      && npm run test:visual              # on demand
```
