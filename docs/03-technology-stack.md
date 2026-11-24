# 03 — Technology Stack & Versions

Versions were checked against the package registries on **2026-11-24** and are pinned in `backend/requirements*.txt` and `frontend/package.json` / `e2e/package.json` as they are introduced.

## Runtime

| Component | Version | Notes |
|---|---|---|
| Python | 3.12 (Docker image) — 3.12+ supported locally | 3.12 chosen for broad wheel availability; dev workspace also verified on 3.13 |
| Node.js | 22 LTS | |
| PostgreSQL | 16 | `postgres:16-alpine` in Docker |
| Docker Engine / Compose | 24+ / v2 | |

## Backend

| Package | Version | Purpose |
|---|---|---|
| fastapi | 0.165.x | Web framework, OpenAPI/Swagger |
| uvicorn[standard] | 0.54.x | ASGI server |
| sqlalchemy | 2.1.x | ORM (typed 2.x style) |
| alembic | 1.20.x | Migrations |
| psycopg[binary] | 3.3.x | PostgreSQL driver |
| pydantic | 2.14.x | Validation |
| pydantic-settings | 2.16.x | Env configuration |
| pyjwt | 2.15.x | JWT |
| bcrypt | 5.0.x | Password hashing (used directly; passlib avoided due to bcrypt-compat issues) |
| python-multipart | latest | File uploads |
| openai | 3.x | LLM provider (v2.0) |
| scikit-learn | latest | TF-IDF similarity fallback (v2.0) |

## Backend dev / test

| Package | Purpose |
|---|---|
| pytest 9.x, pytest-cov | Test runner, coverage |
| httpx 0.28.x | TestClient transport |
| jsonschema | Response schema validation in API tests |
| ruff 0.17.x | Lint + format |
| mypy | Static typing (optional gate) |

## Frontend

| Package | Version | Purpose |
|---|---|---|
| react / react-dom | 19.x | UI |
| typescript | 5.x/7.x (whichever Vite's template pins at scaffold time) | Types |
| vite | 8.x | Build/dev server |
| tailwindcss + @tailwindcss/vite | 4.x | Styling, dark mode via `class` strategy |
| react-router | 8.x | Routing |
| @tanstack/react-query | 5.x | Server state |
| recharts | 3.x | Charts |
| lucide-react | latest | Icons |
| eslint + typescript-eslint | latest | Lint |

## E2E

| Package | Version |
|---|---|
| @playwright/test | 1.65.x |

## Rationale for key choices

- **FastAPI + SQLAlchemy 2.x** — typed, async-capable, automatic OpenAPI. Sync SQLAlchemy sessions are used for simplicity and test-friendliness; endpoints are I/O-light.
- **Alembic** — industry-standard migrations, autogenerate + reviewed scripts.
- **bcrypt directly** instead of passlib — passlib is unmaintained and warns with bcrypt ≥ 4.1.
- **TanStack Query** — eliminates hand-rolled loading/error/cache state.
- **Heuristic AI provider** — makes the AI features testable and demo-able without an API key or network, and makes CI deterministic.
