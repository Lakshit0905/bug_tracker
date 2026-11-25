# Phase 6 — Integration Test Execution Report

- **Executed:** 2026-11-25 00:54 UTC
- **Stack:** FastAPI on :8100 → PostgreSQL 16 database `bugtracker_e2e` (migrated and seeded by global setup); React dev server :5174; production build :4174 (cross-origin)
- **Runner:** Playwright 1.65 + TypeScript, Google Chrome (headless), 1 worker
- **Command:** `cd e2e && npm test`
- **Result:** 17 passed (1.2m) — JUnit: `phase6-e2e-junit.xml`
- **Stability:** full suite run 3 times in a row with no failures and no flaky retries (16 tests in the first two runs, 17 after the P5-1 regression test was added)

## Results

| Project | Spec | Test | Result |
|---|---|---|---|
| integration | consistency | dashboard counts match the API and the filtered bug list | ✅ 4.3s |
| integration | consistency | a bug reported in the UI is immediately searchable and counted on the dashboard | ✅ 6.2s |
| integration | consistency | server-side validation errors appear on the right form field | ✅ 1.0s |
| integration | consistency | opening a bug that does not exist shows a not-found state, not a crash | ✅ 2.3s |
| integration | lifecycle | a bug travels from report to verified fix through tester, PM and developer | ✅ 15.4s |
| integration | lifecycle | a developer who is not the assignee is offered no workflow actions | ✅ 2.8s |
| integration | session | expired access token: many failing requests trigger exactly one refresh and all are retried | ✅ 2.9s |
| integration | session | a rate-limited session restore keeps the session for the next attempt (regression P5-1) | ✅ 3.6s |
| integration | session | a deactivated user is signed out on their next action and returns to the same page after sign-in | ✅ 3.1s |
| integration | session | opening a deep link while signed out returns there after sign-in (regression P6-1) | ✅ 1.4s |
| integration | session | signing out revokes the refresh token on the server | ✅ 2.6s |
| integration | session | backend outage shows an actionable error and the page recovers when the API is back | ✅ 5.5s |
| integration | session | a new account starts as tester and gains manager access as soon as an admin promotes it | ✅ 7.4s |
| prod-build | cross-origin | signs in through the form and loads data cross-origin with CORS | ✅ 1.6s |
| prod-build | cross-origin | deep links survive a full page reload (SPA fallback + session restore) | ✅ 2.1s |
| prod-build | cross-origin | attachment download works across origins with the bearer token | ✅ 2.1s |
| prod-build | cross-origin | the API refuses cross-origin access to origins that are not allow-listed | ✅ 151ms |

## Deliberate-break check (do these tests detect the defects they target?)

| Change made on purpose | Target test | Outcome |
|---|---|---|
| Revert P6-1 (always redirect to dashboard after sign-in) | deep link while signed out | ❌ failed, as it should |
| Remove the shared in-flight refresh promise | exactly one refresh on concurrent 401s | ❌ failed, as it should |
| Revert P5-1 (any refresh failure clears the token) | rate-limited session restore | ❌ failed, as it should |
| Revert P5-1 | deactivated-user test (control: different code path) | ✅ passed, as expected |

## Defects found during this phase

| # | Severity | Found by | Description | Fix |
|---|---|---|---|---|
| P6-1 | Medium | Integration test | After being signed out mid-session (or opening a deep link while signed out), signing in always led to the dashboard instead of the page you were on. The guard that redirects signed-in users away from \`/login\` re-rendered first and won against the login form's own redirect. | The guard now redirects to the saved \`from\` path (same-origin paths only) |
| P6-2 | Medium | Code review while adding \`VITE_API_URL\` | Attachment downloads would have broken whenever the API is on another origin, because the download path was re-based against the configured API URL instead of the \`/api/v1\` path the server returns | Re-base on the API path; covered by \`attachment download works across origins\` |
| P6-3 | Low | Review of the refresh logic | A 401 arriving just *after* a refresh finished would start a second, unnecessary refresh (another token rotation) | Each request remembers the token it used; if that token has already been replaced it retries without refreshing |
| P6-4 | — (test defect) | First run | The prod-build test reloaded the page before the sign-in request finished | The test now waits for the redirect before checking |
| — | — (environment) | First run | Video recording needs Playwright's ffmpeg download, which this sandbox blocks | Video is off when \`CHROME_PATH\` is used; traces are still captured. CI keeps video on |
