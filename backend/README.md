# BugTrackr — Backend

FastAPI + SQLAlchemy 2.1 + Alembic + PostgreSQL 16.

## Prerequisites

- Python 3.12+
- PostgreSQL 16 running locally (or use Docker: `docker run -d --name bt-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16-alpine`)

## 1. Create the databases (one time)

```bash
psql -U postgres -c "CREATE USER bugtracker WITH PASSWORD 'devpass' CREATEDB;"
psql -U postgres -c "CREATE DATABASE bugtracker OWNER bugtracker;"
psql -U postgres -c "CREATE DATABASE bugtracker_test OWNER bugtracker;"
```

## 2. Configure

```bash
cp ../.env.example .env     # then set POSTGRES_PASSWORD=devpass (and a JWT_SECRET_KEY)
```

## 3. Install

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
```

## 4. Migrate, create the first admin, and run

```bash
alembic upgrade head
python -m scripts.seed_admin        # uses ADMIN_EMAIL / ADMIN_PASSWORD from .env
uvicorn app.main:app --reload --port 8000
```

In Swagger, call `POST /api/v1/auth/login`, copy `access_token`, click **Authorize**, and paste it.

- Swagger UI: http://localhost:8000/docs
- Liveness: http://localhost:8000/health
- Readiness (DB + migration revision): http://localhost:8000/health/ready

## 5. Test and lint

```bash
pytest                       # all tests (uses bugtracker_test, never the dev DB)
pytest -m unit               # just unit tests
pytest --cov=app             # with coverage
ruff check . && ruff format --check .
```

## Layout

```
app/
  core/          config, enums, logging, exceptions
  db/            declarative base, session
  models/        ORM models
  schemas/       Pydantic request/response models
  repositories/  data access            (Phase 3+)
  services/      business rules         (Phase 3+)
  api/v1/routes/ HTTP endpoints
alembic/         migrations
tests/
  unit/ integration/ api/   + conftest.py, factories.py
```
