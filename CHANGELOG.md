# Changelog

All notable changes are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Planned for 2.0.0
- AI-assisted triage: category, priority and severity suggestions with confidence and explanation; duplicate detection; summaries; developer recommendation. Every suggestion can be overridden and is logged.
- AI evaluation framework with a labelled dataset and metric thresholds.
- Docker images, Docker Compose, GitHub Actions CI/CD and an AWS EC2 deployment guide.

## [1.0.0] — 2026-11-24

First release: complete manual defect management. See [`docs/releases/v1.0.md`](docs/releases/v1.0.md).

### Added
- **Accounts and access:** registration (always as tester), sign-in with JWT access tokens and rotating refresh tokens, sign-out, profile and password change. Four roles (Tester, Developer, Project manager, Administrator) with a capability-based permission matrix. Admin user management.
- **Bug tracking:** report, view and edit bugs with severity, priority, category, environment, steps and expected/actual results. Lifecycle New → Open → In progress → Resolved → Reopened → Closed, enforced by the backend. Assignment to active developers. Comments, a complete audit history and secure attachments.
- **Finding bugs:** combinable filters (status, severity, priority, category, assignee, reporter, date range), keyword and bug-key search, sorting by business rank, pagination, shareable URLs.
- **Awareness:** in-app notifications for assignments, status changes, comments and reopened bugs. Dashboard with the lifecycle rail, key figures, reported-vs-resolved trend, severity breakdown, developer workload and recent activity. Reports with closure rate, average time to resolve and reopen rate.
- **Interface:** React 19 single-page app with 12 pages, light, dark and system themes, responsive down to 360 px, WCAG 2.1 AA.
- **API:** 37 documented REST operations with OpenAPI/Swagger, and a consistent error envelope that is documented for every error response.
- **Quality:** 1,218 automated tests (pytest, Vitest, Playwright: API contract, functional, integration, production build, accessibility, visual); 99% backend coverage.

### Security
- bcrypt password hashing with a 72-byte guard; algorithm-pinned JWTs with required claims; refresh-token rotation with reuse detection; protection against account enumeration; rate limiting on credential endpoints; upload allow-list with content checks; downloads forced to `attachment` with `nosniff`; CORS allow-list; production startup refuses a weak JWT secret.

### Fixed during release preparation
- P8-1: end-to-end test database now fully rebuilt each run (accounts accumulated across runs and made a test order-dependent).
- P8-2: chart animations removed (they ignored *reduce motion* and contradicted the single-motion design rule).
- P8-3: the bug list exposes which query its rows belong to, so tests (and assistive technology via `aria-busy`) never act on stale results.

[Unreleased]: https://github.com/OWNER/bugtrackr/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/OWNER/bugtrackr/releases/tag/v1.0.0
