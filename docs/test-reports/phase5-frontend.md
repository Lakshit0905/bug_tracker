# Phase 5 — Frontend Test Execution Report

- **Executed:** 2026-11-25 00:34 UTC
- **Environment:** Node v22.23.5, Google Chrome (headless, driven by Playwright 1.65), FastAPI backend on PostgreSQL 16 with demo data

## Static checks

| Check | Command | Result |
|---|---|---|
| Type-check (strict) | `npm run typecheck` | ✅ 0 errors |
| Lint (react, typescript, jsx-a11y) | `oxlint src --deny-warnings` | ✅ 0 warnings, 0 errors |
| Production build | `npm run build` | ✅ — main bundle 341.81 kB, pages code-split |
| Backend regression suite | `pytest` | 983 passed in 27.92s |

## Browser run against the live API

A Playwright script signed in as 4 roles (plus anonymous) on the dev server, using the real backend and seeded data, and captured 18 screens (`docs/screenshots/`). It recorded any console error, uncaught page error or 5xx response.

| Session | Screens | Viewport / theme |
|---|---|---|
| Anonymous | sign in, register | 1440×900 light |
| Project manager | dashboard, bug list, filtered list, bug details, create-bug validation, reports, notifications, AI triage, profile, users (denied) | 1440×900 light |
| Administrator | user management | 1440×900 light |
| Developer | dashboard, bug details, resolve dialog | 1440×900 **dark** |
| Tester | dashboard, bug list | **390×844 mobile** |

**Final result:** no console errors, no page errors, no 5xx responses.

> Full end-to-end assertions (Page Object Model, fixtures, role journeys) arrive in Phase 7. This phase verifies that every page renders and works against the real API.

## Defects found during this phase

| # | Severity | Found by | Description | Fix |
|---|---|---|---|---|
| P5-1 | High | Browser run (became repeatable once diagnosed) | `/auth/refresh` shared the login rate limit (10/min per IP). Each page reload refreshes the session, so after about 10 reloads in a minute the server returned 429. The client treated any refresh failure as "session over", deleted the refresh token and **signed the user out**. Offices sharing one IP address would hit this. | Backend: refresh has its own limit (`REFRESH_RATE_LIMIT_PER_MINUTE`, default 60). Frontend: only a 401 clears the token; 429, 5xx and network errors keep it. Regression test `test_refresh_has_its_own_looser_limit_than_login`. |
| P5-2 | Medium | Code review | Trend dates (`2026-11-24`) were parsed as UTC midnight, so users west of UTC saw every chart label one day early | Dates parsed as local calendar days |
| P5-3 | Low | Browser run | The Users page fetched `/users` before its role guard rendered, so a project manager triggered a 403 in the console | Capability guards moved onto the routes, so page hooks never run for roles without access |
| P5-4 | Low | Screenshot review | Bug keys wrapped onto two lines on mobile; the sidebar background stopped at the viewport height; trend lines used curves that implied values between days | `nowrap`, full-height sidebar column, linear lines |
| P5-5 | Low | oxlint jsx-a11y | The mobile-menu backdrop could be clicked but had no keyboard role | Replaced with a button |
| P5-6 | Low | oxlint | State set inside effects (drawer close, keyword sync) | Close via navigation handler; keyword synced during render |
