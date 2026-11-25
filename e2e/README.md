# BugTrackr — End-to-end tests

Playwright + TypeScript with Page Objects. The suite starts an isolated stack (API :8100 on the `bugtracker_e2e` database, web on :5174 and :4174) and seeds it in `global-setup.ts`.

```bash
npm install
npx playwright install chromium        # or: export CHROME_PATH=/usr/bin/google-chrome
createdb -O bugtracker bugtracker_e2e    # once
npm test                                 # api, functional, integration, prod-build, a11y
npm run test:api                         # black-box API + OpenAPI contract + coverage report
npm run test:functional                  # every page and role
npm run test:integration                 # cross-role journeys, sessions, consistency
npm run test:prod                        # production build, cross-origin
npm run test:a11y                        # axe-core WCAG 2.1 AA
npm run test:visual                      # screenshot comparison (on demand; -u to update baselines)
npm run report                           # open the HTML report
```

| Folder | Contents |
|---|---|
| `pages/` | Page Objects (one class per screen) |
| `fixtures/` | `test` with page objects, `signInAs`, multi-user `asUser`, auto `health` check; `Api` client for arranging data |
| `data/` | Environment, accounts, unique test data |
| `tests/api/` | Black-box API, contract validation, authorization matrix, operation coverage |
| `tests/functional/` | Every page and role |
| `tests/integration/` | Cross-role lifecycle, session handling, UI/API/DB consistency |
| `tests/a11y/` | axe-core scans + keyboard path |
| `tests/visual/` | Screenshot baselines |
| `tests/prod-build/` | Production bundle against a separate API origin (CORS, SPA fallback, downloads) |

See `docs/09-integration.md` for the design of the suite.
