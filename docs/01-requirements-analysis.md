# 01 — Requirements Analysis

**Project:** Software Bug Tracking System — From Manual Defect Management to AI-Assisted Decision Support
**Product name (working):** BugTrackr
**Phase:** 1 — Requirements analysis and architecture
**Status:** Approved baseline for v1.0 implementation

---

## 1. Problem statement

Teams that track defects in spreadsheets or email lose information: who changed what, which bugs are duplicates, which are urgent, and who should fix them. BugTrackr provides:

- **v1.0** — a complete, role-based, auditable manual defect-management workflow.
- **v2.0** — AI *decision support* layered on top: suggestions that humans accept or override, never automatic decisions.

## 2. Actors and roles

| Role | Code | Purpose |
|---|---|---|
| Tester | `TESTER` | Finds, reports, verifies and reopens bugs |
| Developer | `DEVELOPER` | Works on assigned bugs, documents fixes |
| Project Manager | `PROJECT_MANAGER` | Triages, assigns, prioritises, monitors progress |
| Administrator | `ADMIN` | Manages user accounts and roles |

Each user has exactly **one** role (sufficient for the scope; a many-to-many `user_roles` table is a documented future extension).

### 2.1 Decisions on ambiguous requirements

| # | Ambiguity | Decision | Rationale |
|---|---|---|---|
| D1 | Can anyone self-register with any role? | **No.** Self-registration always creates a `TESTER`. Only an Admin can change roles. | Prevents privilege escalation. |
| D2 | How is the first Admin created? | A CLI seed command (`python -m scripts.seed_admin`) reading `ADMIN_EMAIL` / `ADMIN_PASSWORD` from env. | No hard-coded credentials. |
| D3 | Developers "view assigned bugs" — can they see others? | Developers can **read** all bugs (needed to spot duplicates/context) but **modify only bugs assigned to them**. Their default list view is "Assigned to me". | Matches Jira/Linear practice; mutation is still restricted. |
| D4 | Can Admin act on bugs? | Admin has **read-only** access to bugs and full access to user management. | Separation of duties. |
| D5 | Can a PM also comment / reopen? | PM can comment on any bug and reopen a **Closed** bug. | PMs often reopen after customer escalation. |
| D6 | Who can create bugs? | Tester and Project Manager. | Spec lists creation under Tester; PMs commonly log customer-reported bugs. |
| D7 | Who sets severity vs priority? | Reporter sets an initial **severity** (technical impact). **Priority** (business urgency) is set/changed only by a PM. Reporter's priority defaults to `MEDIUM`. | Standard QA distinction. |
| D8 | Deactivated users | Cannot log in; existing tokens rejected; their historical records are kept; they cannot be newly assigned. | Data integrity + security. |
| D9 | Attachments | Stored on disk/volume (S3-compatible later); metadata in DB. Max 10 MB, allow-listed MIME types (png, jpg, gif, webp, pdf, txt, log, json, zip). | Simple, secure, portable. |
| D10 | Notifications delivery | In-app notifications stored in DB, fetched by polling (30 s) + unread badge. Email is a documented extension. | No extra infra required. |
| D11 | Hard delete of bugs | Not supported. Bugs are closed, never deleted. | Audit integrity. |

## 3. Permission matrix (v1.0)

`✔` allowed · `own` only bugs they reported · `asg` only bugs assigned to them · `—` denied

| Capability | Tester | Developer | PM | Admin |
|---|---|---|---|---|
| Register / login / logout / view own profile | ✔ | ✔ | ✔ | ✔ |
| List & view bugs | ✔ | ✔ | ✔ | ✔ (read-only) |
| Create bug | ✔ | — | ✔ | — |
| Edit descriptive fields (title, description, steps, env, expected/actual, category, severity) | own (while New/Open/Reopened) | — | ✔ | — |
| Set / change priority | — | — | ✔ | — |
| Assign / reassign developer | — | — | ✔ | — |
| Change status | see §4 | see §4 | see §4 | — |
| Add comment | ✔ | ✔ | ✔ | — |
| Upload attachment | ✔ | asg | ✔ | — |
| View history | ✔ | ✔ | ✔ | ✔ |
| Dashboard statistics | ✔ (basic) | ✔ (basic) | ✔ (full) | ✔ (full) |
| Reports & analytics page | — | — | ✔ | ✔ |
| Manage users (list, change role, activate/deactivate) | — | — | — | ✔ |

## 4. Bug lifecycle and transition rules

```
           triage            start work          fix done
  NEW ───────────────▶ OPEN ───────────▶ IN_PROGRESS ──────────▶ RESOLVED
                         ▲                    ▲                  │     │
                         │                    │ resume work      │     │ verified
                         │ re-triage          │                  │     ▼
                         └──────────────── REOPENED ◀────────────┘  CLOSED
                                              ▲      fails verify      │
                                              └────────────────────────┘
                                                    regression found
```

| From | To | Allowed roles | Preconditions / side effects |
|---|---|---|---|
| NEW | OPEN | PM | Triage. Assignee optional at this point. |
| OPEN | IN_PROGRESS | Developer (asg) | Bug **must** have an assignee, and actor must be that assignee. |
| IN_PROGRESS | RESOLVED | Developer (asg) | **`resolution_notes` required** (documents the fix). Sets `resolved_at`. |
| RESOLVED | CLOSED | Tester, PM | Verification. Sets `closed_at`. |
| RESOLVED | REOPENED | Tester, PM | **Reason required** (stored as a comment). Clears `resolved_at`. |
| CLOSED | REOPENED | Tester, PM | **Reason required**. Clears `closed_at`. |
| REOPENED | IN_PROGRESS | Developer (asg) | Must have an assignee. |
| REOPENED | OPEN | PM | Re-triage / reassignment. |

Any other transition — including same-status "transitions" — is rejected with **HTTP 409 Conflict** and an error body naming the allowed targets. Rules live in one place (`app/services/workflow.py`) and are unit-tested exhaustively (every from/to/role combination).

Additional assignment rules:
- Assignee must be an **active** user with role `DEVELOPER`.
- Assigning a `NEW` bug does not auto-change status (triage is an explicit decision).
- Reassignment is recorded in history and notifies both old and new assignee.

## 5. Bug data model (functional)

| Field | Type | Rules |
|---|---|---|
| `id` | integer PK | Internal |
| `key` | string, unique | Human-readable `BUG-<id>` (e.g. `BUG-1042`) |
| `title` | string | 5–200 chars, required |
| `description` | text | 10–10 000 chars, required |
| `severity` | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `priority` | enum | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` (PM-controlled) |
| `category` | enum | `UI`, `BACKEND`, `DATABASE`, `AUTHENTICATION`, `PERFORMANCE`, `SECURITY`, `API`, `INFRASTRUCTURE`, `OTHER` |
| `status` | enum | `NEW`, `OPEN`, `IN_PROGRESS`, `RESOLVED`, `REOPENED`, `CLOSED` |
| `reporter_id` | FK users | Set from token, never from request body |
| `assignee_id` | FK users, nullable | Developer only |
| `environment` | string | e.g. "Chrome 131 / Windows 11 / staging" (≤ 255) |
| `steps_to_reproduce` | text | required |
| `expected_result` | text | required |
| `actual_result` | text | required |
| `resolution_notes` | text, nullable | Required on → RESOLVED |
| `created_at`, `updated_at` | timestamptz | Server-managed |
| `resolved_at`, `closed_at` | timestamptz, nullable | Lifecycle timestamps |
| attachments | 0..n | See D9 |

The AI category list in the spec is reused as the bug category enum (plus `OTHER`), so AI suggestions map 1:1 to valid values.

## 6. Functional requirements (v1.0)

| ID | Requirement |
|---|---|
| FR-AUTH-1 | Register with full name, email (unique, case-insensitive), password (≥ 8 chars, letter + digit). |
| FR-AUTH-2 | Login returns a short-lived JWT access token (30 min) and a refresh token (7 days). |
| FR-AUTH-3 | Logout revokes the refresh token server-side. |
| FR-AUTH-4 | Passwords hashed with bcrypt; never returned or logged. |
| FR-AUTH-5 | Every protected endpoint checks token validity, user active flag, and role. |
| FR-USER-1 | Admin lists/searches users, changes role, activates/deactivates. Admin cannot deactivate or demote themself. |
| FR-USER-2 | Any user updates own name and password (current password required). |
| FR-BUG-1 | Create, view, edit bugs per §3. |
| FR-BUG-2 | Assign/reassign per §4. |
| FR-BUG-3 | Status transitions per §4. |
| FR-BUG-4 | Upload, list, download attachments. |
| FR-CMT-1 | Add and list comments (chronological). Comment edits are out of scope (immutable audit trail). |
| FR-HIST-1 | Every change to a bug writes history rows: actor, field, old value, new value, timestamp. Creation, assignment, status, priority, comment and attachment events included. |
| FR-SRCH-1 | Filter by status, severity, priority, assignee, category, created-date range, keyword (title/description/key); combinable; paginated; sortable. |
| FR-DASH-1 | Totals by status, critical count, per-developer workload, created-vs-resolved trend (daily, configurable range), recent activity feed. |
| FR-NOTIF-1 | Notifications on: assignment (to assignee), status change (to reporter & assignee), new comment (to reporter & assignee, excluding author), reopen (to assignee & PMs). |
| FR-NOTIF-2 | Mark one / all as read; unread count endpoint. |

## 7. Functional requirements (v2.0 — AI decision support)

| ID | Requirement |
|---|---|
| FR-AI-1 | On bug draft submission, request an analysis **before** the bug is saved; user reviews then saves. |
| FR-AI-2 | Suggest category with confidence 0–1. |
| FR-AI-3 | Duplicate detection: top-N similar existing bugs with similarity score; user chooses "create anyway" or "open existing". |
| FR-AI-4 | Suggest priority and severity with explanation and confidence. |
| FR-AI-5 | Summarise long descriptions; highlight key technical facts (errors, versions, endpoints). |
| FR-AI-6 | Recommend developers from category history + current workload (computed from DB, not LLM-invented). |
| FR-AI-7 | Every suggestion and the user's final decision (accepted / overridden + final value) is persisted. |
| NFR-AI-1 | Suggestions are validated against enums/business rules; invalid LLM output is discarded, never applied. |
| NFR-AI-2 | Timeouts (default 15 s) and provider errors degrade to manual entry; bug creation never depends on AI. |
| NFR-AI-3 | API keys only in backend env; never sent to the browser. |
| NFR-AI-4 | Provider is configurable (`AI_PROVIDER=openai|heuristic|disabled`). A deterministic local `heuristic` provider exists for offline use and CI. |

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | OWASP-aware: hashed passwords, JWT expiry, CORS allow-list, input validation, file-type allow-list, no secrets in repo, rate limit on auth endpoints. |
| Reliability | Consistent error envelope `{ "error": { "code", "message", "details" } }`; DB transactions per request. |
| Performance | Bug list p95 < 300 ms for 10k bugs (indexes on filter columns). |
| Observability | Structured JSON logs with request ID; `/health` and `/health/ready` endpoints. |
| Usability | Responsive (≥ 360 px), keyboard accessible, light/dark themes, loading/empty/error states. |
| Maintainability | Layered backend (routes → services → repositories → models); typed frontend; lint + format in CI. |
| Testability | Backend coverage target ≥ 85 %; E2E covering each role's core journey. |

## 9. Out of scope (documented future work)

Multiple projects/workspaces, SSO/OAuth, email notifications, WebSocket push, custom workflows, file virus scanning, bug deletion.

## 10. Traceability

Every FR ID above will be referenced in test names/docstrings (e.g. `test_fr_bug_3_developer_cannot_close_bug`) so the test report maps back to requirements.
