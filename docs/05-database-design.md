# 05 — Database Design

PostgreSQL 16 · SQLAlchemy 2.1 models in `backend/app/models/` · Alembic migrations in `backend/alembic/versions/`.

## ER diagram

```mermaid
erDiagram
    roles ||--o{ users : "has"
    users ||--o{ refresh_tokens : "owns"
    users ||--o{ bugs : "reports (reporter_id)"
    users |o--o{ bugs : "is assigned (assignee_id)"
    bugs ||--o{ bug_comments : "has"
    users ||--o{ bug_comments : "writes"
    bugs ||--o{ bug_history : "has"
    users |o--o{ bug_history : "performs (actor_id)"
    bugs ||--o{ bug_attachments : "has"
    users ||--o{ bug_attachments : "uploads"
    users ||--o{ notifications : "receives (recipient_id)"
    bugs |o--o{ notifications : "about"
    bugs |o--o{ ai_analyses : "analysed by (v2)"
    users ||--o{ ai_analyses : "requests (v2)"
    ai_analyses ||--o{ ai_decisions : "records (v2)"

    roles {
        int id PK
        varchar name UK "TESTER|DEVELOPER|PROJECT_MANAGER|ADMIN"
        varchar description
    }
    users {
        int id PK
        varchar email UK "CHECK lowercase"
        varchar full_name "CHECK len>=2"
        varchar password_hash "bcrypt"
        int role_id FK
        bool is_active
        timestamptz last_login_at
        timestamptz created_at
        timestamptz updated_at
    }
    refresh_tokens {
        int id PK
        int user_id FK
        varchar token_hash UK "SHA-256"
        timestamptz expires_at
        timestamptz revoked_at
        text user_agent
        timestamptz created_at
    }
    bugs {
        int id PK
        varchar key UK "generated: BUG-id"
        varchar title "CHECK 5..200"
        text description "CHECK len>=10"
        varchar severity "LOW..CRITICAL"
        varchar priority "LOW..CRITICAL, default MEDIUM"
        varchar category "UI|BACKEND|...|OTHER"
        varchar status "NEW..CLOSED, default NEW"
        int reporter_id FK
        int assignee_id FK "nullable"
        varchar environment
        text steps_to_reproduce
        text expected_result
        text actual_result
        text resolution_notes
        timestamptz resolved_at
        timestamptz closed_at
        timestamptz created_at
        timestamptz updated_at
    }
    bug_comments {
        int id PK
        int bug_id FK
        int author_id FK
        text body "CHECK 1..5000"
        timestamptz created_at
    }
    bug_history {
        bigint id PK
        int bug_id FK
        int actor_id FK "nullable = system"
        varchar action
        varchar field_name
        text old_value
        text new_value
        timestamptz created_at
    }
    bug_attachments {
        int id PK
        int bug_id FK
        int uploaded_by_id FK
        varchar original_filename
        varchar stored_filename UK
        varchar content_type
        bigint size_bytes "CHECK > 0"
        timestamptz created_at
    }
    notifications {
        bigint id PK
        int recipient_id FK
        int bug_id FK "nullable"
        int actor_id FK "nullable"
        varchar type
        varchar message
        bool is_read
        timestamptz read_at
        timestamptz created_at
    }
    ai_analyses {
        int id PK "v2.0 migration"
    }
    ai_decisions {
        int id PK "v2.0 migration"
    }
```

The `ai_analyses` and `ai_decisions` tables are added by a separate v2.0 migration in Phase 9, so the migration history mirrors the release history.

## Normalisation

The schema is in **3NF**. Roles are a lookup table (no repeated role strings on users). Comments, history, attachments and notifications are separate child tables, not repeating columns. The only derived column is `bugs.key`, a PostgreSQL **stored generated column** (`'BUG-' || id`) that the database maintains, so it can't drift from `id`.

## Constraints

| Kind | Where | Purpose |
|---|---|---|
| Enum CHECKs | `roles.name`, `bugs.severity/priority/category/status`, `bug_history.action`, `notifications.type` | Enums stored as VARCHAR + named CHECK (easier to extend than native PG enums) |
| `ck_users_email_lowercase` | users | Case-insensitive uniqueness (service lower-cases input) |
| `ck_bugs_title_length`, `ck_bugs_description_min_length` | bugs | Mirrors API validation |
| `ck_bugs_active_work_requires_assignee` | bugs | IN_PROGRESS / RESOLVED must have an assignee |
| `ck_bugs_resolution_requires_notes` | bugs | RESOLVED / CLOSED must document the fix |
| `ck_bugs_closed_requires_closed_at` | bugs | Lifecycle timestamp integrity |
| `ck_bug_comments_body_length`, `ck_bug_attachments_size_positive` | children | Data sanity |

The workflow CHECKs are **defence in depth**. The service layer enforces the full transition rules and returns friendly 409 errors. The database guarantees that even a buggy code path can't persist an impossible state.

## Foreign-key delete behaviour

| FK | ON DELETE | Why |
|---|---|---|
| users → roles | RESTRICT | Roles are fixed reference data |
| bugs → users (reporter, assignee) | RESTRICT | Users are deactivated, never deleted |
| comments/history/attachments → bugs | CASCADE | Children have no meaning without their bug |
| comments/history/attachments → users | RESTRICT | Preserve audit authorship |
| notifications → users (recipient) | CASCADE | Personal inbox |
| notifications → users (actor) | SET NULL | Message still meaningful |
| refresh_tokens → users | CASCADE | Session data |

## Indexes

| Index | Supports |
|---|---|
| `ix_bugs_status`, `_severity`, `_priority`, `_category`, `_assignee_id`, `_reporter_id` | Single-field filters |
| `ix_bugs_assignee_id_status` | "My open bugs", workload per developer |
| `ix_bugs_status_created_at` | Dashboard trends, date-range filters |
| `ix_bugs_title_trgm`, `ix_bugs_description_trgm` (GIN, `pg_trgm`) | Keyword search with `ILIKE '%term%'` (verified by an EXPLAIN test) |
| `ix_bug_history_bug_id_created_at`, `ix_bug_comments_bug_id_created_at` | Bug detail timelines |
| `ix_bug_history_created_at` | Recent-activity feed |
| `ix_notifications_recipient_id_is_read_created_at` | Unread badge and inbox |
| `ix_refresh_tokens_user_id_expires_at` | Token revocation / cleanup |

## Migrations

| Revision | Description |
|---|---|
| `cb1fd34d2a60` | v1 initial schema: `pg_trgm` extension, 8 tables, seeded roles |

```bash
cd backend
alembic upgrade head          # apply
alembic downgrade -1          # roll back one revision
alembic revision --autogenerate -m "describe change"   # then review the generated file by hand
alembic check                 # fails if models and migrations have drifted
```

Each test run rebuilds the test database by running **upgrade → downgrade → upgrade**, and includes a test asserting the models and migrations are in sync.
