# 04 — Development Workflow, Branching & Releases

## Branching model (GitHub Flow + release tags)

| Branch | Purpose |
|---|---|
| `main` | Always releasable. Protected: PR + green CI required. |
| `develop` | Integration branch for the current version. |
| `feature/<phase>-<short-name>` | One per feature, e.g. `feature/p3-auth-jwt`, `feature/p4-workflow-engine` |
| `fix/<issue-id>-<short-name>` | Defect fixes, e.g. `fix/42-reopen-clears-resolved-at` |
| `release/v1.0`, `release/v2.0` | Stabilisation before tagging |

Flow: `feature/*` → PR → `develop` → `release/vX` → PR → `main` → tag `vX.Y.Z`.

## Commit convention (Conventional Commits)

```
feat(bugs): enforce status transition rules
fix(auth): reject tokens of deactivated users
test(api): add negative cases for bug assignment
docs(arch): add sequence diagram for AI analysis
chore(ci): cache pip dependencies
```

## GitHub Issues structure

**Labels**
- Type: `type:feature`, `type:bug`, `type:test`, `type:docs`, `type:chore`
- Area: `area:backend`, `area:frontend`, `area:ai`, `area:e2e`, `area:devops`
- Priority: `priority:high`, `priority:medium`, `priority:low`
- Version: `v1.0`, `v2.0`

**Milestones:** one per phase (`P1 Architecture` … `P13 Release v2.0`), grouped under releases `v1.0` and `v2.0`.

**Issue templates:** `.github/ISSUE_TEMPLATE/feature.md`, `bug_report.md`.

## Definition of Done (per feature)

1. Code + types complete, lint clean.
2. Unit/API tests written and **executed** green; E2E updated if UI changed.
3. Requirement IDs referenced in tests.
4. Docs/checklist updated.
5. PR reviewed and merged with CI green.

## Release gates

- **v1.0** — all Phase 1–7 items done; full Pytest + Playwright suite green; no open `priority:high` bugs; release notes in `docs/releases/v1.0.md`.
- **v2.0** — v1 regression green + AI evaluation metrics meet thresholds; release notes in `docs/releases/v2.0.md`.
