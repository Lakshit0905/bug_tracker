# BugTrackr

**Software Bug Tracking System: From Manual Defect Management to AI-Assisted Decision Support**

A full-stack, role-based defect-tracking platform (React + FastAPI + PostgreSQL) with an AI decision-support layer that suggests — but never decides — categories, priorities, severities, duplicates, summaries and assignees.

> **Current status:** Phase 7 complete — v1.0 test campaign: **1,218 automated tests passing**, 99% backend coverage, 100% API operation coverage, 0 WCAG AA violations. Next: v1.0 release.

![Dashboard](docs/screenshots/03-dashboard-pm.png) See [`docs/PROJECT_CHECKLIST.md`](docs/PROJECT_CHECKLIST.md).

## Releases

| Version | Scope | Status |
|---|---|---|
| v1.0 | Core manual bug tracking: auth, RBAC, lifecycle, comments, audit history, search, dashboard, notifications | In development |
| v2.0 | AI-assisted analysis with evaluation framework | Planned |

## Documentation

| Doc | Contents |
|---|---|
| [01 Requirements analysis](docs/01-requirements-analysis.md) | Roles, permission matrix, lifecycle rules, FR/NFR with IDs |
| [02 Architecture](docs/02-architecture.md) | System, backend, frontend, testing and deployment architecture; API plan |
| [03 Technology stack](docs/03-technology-stack.md) | Pinned versions and rationale |
| [04 Development workflow](docs/04-development-workflow.md) | Branching, commits, issues, release gates |
| [05 Database design](docs/05-database-design.md) | ER diagram, constraints, indexes, migrations |
| [06 Authentication & RBAC](docs/06-authentication-and-rbac.md) | Token model, security controls, endpoints |
| [07 Bug management](docs/07-bug-management.md) | Lifecycle errors, editing rules, notifications, search, attachments, dashboard |
| [08 Frontend](docs/08-frontend.md) | Design system, architecture, session handling, accessibility |
| [09 Integration](docs/09-integration.md) | Deployment modes, session lifecycle, isolated e2e stack |
| [10 Test strategy](docs/10-test-strategy.md) | Pyramid, techniques, environments, exit criteria |
| [11 Traceability matrix](docs/11-traceability-matrix.md) | Every requirement → its tests |
| [v1.0 test report](docs/test-reports/v1.0-test-report.md) | Results, coverage, defect log |
| [Checklist](docs/PROJECT_CHECKLIST.md) | Completed / pending work |

## Repository layout

```
bugtracker/
├── backend/          FastAPI app (routes → services → repositories → models), Alembic, Pytest
├── frontend/         React + TypeScript + Tailwind SPA
├── e2e/              Playwright (TypeScript) — Page Object Model
├── ai-evaluation/    Labelled dataset + AI metrics harness (v2.0)
├── docs/             Requirements, architecture, diagrams, test reports, release notes
├── infra/aws/        EC2 deployment guide & scripts
└── .github/          CI workflows, issue templates
```

## Quick start

After the one-time setup in `backend/README.md`, `./scripts/dev.sh --seed` starts everything. Or step by step:

Backend:

See [`backend/README.md`](backend/README.md): create the databases, `pip install -r requirements-dev.txt`, `alembic upgrade head`, `uvicorn app.main:app --reload`, then `python -m scripts.seed_admin` to create the first administrator (optionally `python -m scripts.seed_demo` for demo data), and open http://localhost:8000/docs. Run `pytest` for the test suite.

Frontend (second terminal): `cd frontend && npm install && npm run dev`, then open http://localhost:5173 and sign in with a demo account (password `Demo12345`).
