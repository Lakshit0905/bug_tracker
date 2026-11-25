# 08 — Frontend

React 19 + TypeScript (strict) + Vite 8 + Tailwind CSS 4 + TanStack Query 5 + React Router 8 + Recharts 3.

## Design system

**Brief:** a tool QA and development teams use all day. It should be dense, calm and quick to scan, closer to Linear or Jira than to a marketing site.

| Token | Light | Dark | Role |
|---|---|---|---|
| paper | `#f4f6f8` | `#0e131a` | app background (cool slate, not cream) |
| surface | `#ffffff` | `#151b24` | panels, tables, inputs |
| line | `#dfe4ea` | `#263041` | borders and dividers (panels use borders, not shadows) |
| ink / ink-2 / ink-3 | `#1b2230` / `#4f596b` / `#7a8497` | `#e6eaf0` / `#a6b0c0` / `#7c879a` | text hierarchy |
| accent | `#0f7a6c` (teal) | `#2bb39f` | the only brand colour: primary actions, focus, active navigation |

- **Typeface:** IBM Plex Sans (variable, self-hosted via `@fontsource`, so it works offline), with tabular figures for counts and bug keys. One family throughout.
- **Signature element:** the **lifecycle rail**. On the dashboard, the six statuses are shown as one connected rail with proportional segments, and each stage links to the filtered bug list. On a bug's page, it shows where the bug sits on the main path. It is the only animated element (segments grow once on load, and this respects `prefers-reduced-motion`).
- **Status vs severity:** lifecycle statuses have their own reserved hues (dot + label). Severity uses the fixed status palette and is always shown as a 1–4 bar meter plus its name, so it is never conveyed by colour alone. Priority is shown as an arrow icon plus its name.
- **Restraint:** no all-caps labels, no shadows on panels, no decorative gradients. Key figures sit in one divided strip rather than a grid of identical cards.

### Charts

Charts follow the dataviz method: validated categorical slots 1–3 (with dark-mode values chosen separately, not auto-inverted), 2px lines, 4px rounded bar ends with 2px gaps between stacked segments, a recessive grid, a legend whenever there are two or more series, a hover tooltip on every chart, and an `aria-label` summary for screen readers. Daily counts are drawn with straight (linear) segments, because curves would suggest values between days.

## Architecture

```
src/
├── api/client.ts        fetch wrapper: bearer token, single-flight refresh on 401, ApiError with the envelope
├── api/endpoints.ts     typed functions for every backend endpoint
├── types/api.ts         TypeScript mirrors of the Pydantic schemas
├── context/             AuthContext (session restore, can(capability)), ThemeContext (light/dark/system)
├── hooks/queries.ts     TanStack Query hooks + central query keys for precise invalidation
├── components/
│   ├── ui/              Button, fields, badges (status/severity/priority/role/avatar), Panel, Dialog,
│   │                    ConfirmDialog, Toast, EmptyState, ErrorState, Skeleton, Pagination
│   ├── layout/          AppShell (sidebar, top bar, mobile drawer), route guards
│   ├── bugs/            LifecycleRail, BugTable, BugFilters, BugForm, detail parts
│   └── charts/          TrendChart, StackedBars, MeterList
└── pages/               the 12 pages (code-split per route)
```

### Session handling

| Concern | Approach |
|---|---|
| Access token | Kept in memory only (never in storage) |
| Refresh token | `localStorage` (`bt-refresh`). An httpOnly cookie is the documented hardening option |
| Page reload | `AuthProvider` exchanges the refresh token, then loads `/users/me` |
| Expired access token | The first 401 triggers one shared refresh; the original request is retried |
| Refresh rejected (401) | Token cleared → login screen, and the page you were on is remembered |
| Refresh rate-limited / 5xx / offline | Token **kept** (temporary failure; see defect P5-1) |

### Permissions in the UI

`/users/me` returns the user's capability list, and `can('bug:assign')` reads from it. Navigation items, buttons and selects are hidden or disabled with it, and routes that need a capability are guarded **before** the page loads, so no forbidden API call is ever made. The **backend still enforces every rule**. The UI only avoids offering actions that would fail. Allowed status changes come from `GET /bugs/{id}/allowed-transitions`, so the UI never duplicates the workflow rules.

### Pages

| Page | Route | Roles |
|---|---|---|
| Sign in / Register | `/login`, `/register` | public |
| Dashboard | `/` | all (workload panel: PM, Admin; personal queue: Tester, Developer) |
| Bug list | `/bugs` | all. Filters, sort and page are kept in the URL, so views can be shared |
| Report bug | `/bugs/new` | Tester, PM |
| Bug details | `/bugs/:id` | all. Status actions, assignee and priority depend on role |
| Edit bug | `/bugs/:id/edit` | PM; reporter before work starts |
| AI triage | `/ai` | Tester, PM. Explains the v2.0 features; no placeholder data |
| Notifications | `/notifications` | all |
| Reports | `/reports` | PM, Admin |
| Users | `/users` | Admin |
| Profile and settings | `/profile` | all |

### States every page handles

Loading (skeletons), empty (explains what will appear and offers the next action), error (`ErrorState` with the server's message, a retry button and the request ID), 403/404, confirmation dialogs for destructive actions, toasts for completed actions, and validation messages per field. Field errors from the server's 422 responses are mapped back onto the form.

## Accessibility

Labels tied to every control (`aria-describedby` for hints and errors, `aria-invalid`), a "Skip to content" link, visible focus rings, native `<dialog>` (focus trap and Esc), `aria-sort` on sortable columns, `aria-pressed` on toggle groups, `role="img"` with text summaries on charts, status never shown by colour alone, and reduced motion respected. Linted with oxlint's `jsx-a11y` plugin.

Two lint rules are deliberately off:
- `prefer-tag-over-role`: the ARIA roles we use (`img` on chart containers, `group`, `listbox`) are correct patterns.
- `no-autofocus`: autofocus is used only on the sign-in email field and inside modal dialogs.

`react/only-export-components` is also off, because it only affects hot reload during development.

## Running

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to http://localhost:8000
npm run typecheck    # tsc -b (strict)
npm run lint         # oxlint (react, typescript, jsx-a11y)
npm run build        # production bundle in dist/
```

Set `VITE_BACKEND_URL` to proxy to a different backend. Demo-account shortcuts on the sign-in page appear in development builds, or when `VITE_SHOW_DEMO_ACCOUNTS=true`.
