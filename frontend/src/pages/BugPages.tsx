import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bug as BugIcon, Pencil } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { bugsApi, type BugSearch, type SortField } from '../api/endpoints'
import { BugFilters, EMPTY_FILTERS, type FilterState } from '../components/bugs/BugFilters'
import { BugForm, emptyBug, fromBug } from '../components/bugs/BugForm'
import { BugTable } from '../components/bugs/BugTable'
import { ActivityFeed, AssignControl, Attachments, PriorityControl, TransitionActions } from '../components/bugs/BugDetailParts'
import { LifecyclePosition } from '../components/bugs/LifecycleRail'
import { RequireCapability } from '../components/layout/Guards'
import { PageHeader } from '../components/layout/AppShell'
import { PersonChip, SeverityMeter, StatusBadge } from '../components/ui/Badges'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState, ErrorState, Pagination, Panel, Skeleton, useToast } from '../components/ui/Feedback'
import { useAuth, useCurrentUser } from '../context/AuthContext'
import { qk, useBug, useBugs } from '../hooks/queries'
import { CATEGORY_LABEL, dateTime, timeAgo } from '../lib/format'
import type { Bug, BugInput, BugStatus, CurrentUser } from '../types/api'

// ================================================================== list

const SORTS: SortField[] = ['created_at', 'updated_at', 'priority', 'severity', 'status', 'title', 'id']

function readFilters(sp: URLSearchParams): FilterState {
  const mine = sp.get('mine')
  return {
    q: sp.get('q') ?? '',
    status: sp.getAll('status'),
    severity: sp.getAll('severity'),
    priority: sp.getAll('priority'),
    category: sp.getAll('category'),
    mine: mine === 'assigned' || mine === 'reported' || mine === 'unassigned' ? mine : '',
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
  }
}

export function BugListPage() {
  const [sp, setSp] = useSearchParams()
  const filters = readFilters(sp)
  const sort = (SORTS.includes(sp.get('sort') as SortField) ? sp.get('sort') : 'created_at') as SortField
  const order = sp.get('order') === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number(sp.get('page')) || 1)
  const pageSize = 20

  const search: BugSearch = {
    q: filters.q || undefined,
    status: filters.status as BugStatus[],
    severity: filters.severity as BugSearch['severity'],
    priority: filters.priority as BugSearch['priority'],
    category: filters.category as BugSearch['category'],
    assigned_to_me: filters.mine === 'assigned',
    reported_by_me: filters.mine === 'reported',
    unassigned: filters.mine === 'unassigned',
    created_from: filters.from || undefined,
    created_to: filters.to || undefined,
    sort,
    order,
    page,
    page_size: pageSize,
  }
  const { data, isLoading, isError, error, refetch, isFetching } = useBugs(search)

  /** Filters live in the URL, so any view can be bookmarked or shared. */
  const write = (f: FilterState, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams()
    if (f.q) next.set('q', f.q)
    f.status.forEach((v) => next.append('status', v))
    f.severity.forEach((v) => next.append('severity', v))
    f.priority.forEach((v) => next.append('priority', v))
    f.category.forEach((v) => next.append('category', v))
    if (f.mine) next.set('mine', f.mine)
    if (f.from) next.set('from', f.from)
    if (f.to) next.set('to', f.to)
    const merged = { sort, order, ...extra }
    if (merged.sort !== 'created_at') next.set('sort', merged.sort)
    if (merged.order !== 'desc') next.set('order', merged.order)
    if (extra.page && extra.page !== '1') next.set('page', extra.page)
    setSp(next, { replace: true })
  }

  const onSort = (f: SortField) => write(filters, { sort: f, order: sort === f && order === 'desc' ? 'asc' : 'desc' })
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)
  const { can } = useAuth()

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Bugs"
        description={data ? `${data.total} ${data.total === 1 ? 'bug' : 'bugs'}${filtered ? ' match these filters' : ' in total'}` : 'Loading…'}
      />
      <BugFilters value={filters} onChange={(f) => write(f)} />
      {/* Previous results stay on screen while a new query loads (no flicker), visibly dimmed so they aren't mistaken for current ones. */}
      <Panel bodyClassName={`p-0 transition-opacity ${isFetching && !isLoading ? 'opacity-55' : ''}`} aria-busy={isFetching} data-testid="bug-results" data-stale={isFetching && !isLoading}>
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9" />)}
          </div>
        ) : data && data.items.length > 0 ? (
          <BugTable bugs={data.items} sort={sort} order={order} onSort={onSort} />
        ) : (
          <EmptyState
            icon={<BugIcon className="size-7" />}
            title={filtered ? 'No bugs match these filters' : 'No bugs reported yet'}
            action={filtered ? <button type="button" className="text-sm text-accent hover:underline" onClick={() => write(EMPTY_FILTERS)}>Clear filters</button> : can('bug:create') ? <ButtonLink to="/bugs/new" variant="primary">Report the first bug</ButtonLink> : undefined}
          >
            {filtered ? 'Try removing a filter or searching for a different keyword.' : 'Reported bugs appear here with their status, severity and owner.'}
          </EmptyState>
        )}
      </Panel>
      {data && <Pagination page={page} pageSize={pageSize} total={data.total} onPage={(p) => write(filters, { page: String(p) })} />}
    </div>
  )
}

// ================================================================== create

export function BugCreatePage() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: bugsApi.create,
    onSuccess: (bug) => {
      qc.invalidateQueries({ queryKey: ['bugs'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${bug.key} reported`)
      navigate(`/bugs/${bug.id}`)
    },
  })
  return (
    <RequireCapability capability="bug:create">
      <PageHeader title="Report a bug" description="Clear steps and expected behaviour get bugs fixed faster." />
      <BugForm
        mode="create"
        initial={emptyBug()}
        canSetPriority={can('bug:set_priority')}
        submitLabel="Report bug"
        onSubmit={(v) => create.mutateAsync(v)}
        onCancel={() => navigate(-1)}
      />
    </RequireCapability>
  )
}

// ================================================================== edit

export function canEditBug(user: CurrentUser, bug: Bug): boolean {
  if (bug.status === 'CLOSED') return false
  if (user.capabilities.includes('bug:edit:any')) return true
  return user.capabilities.includes('bug:edit:own') && bug.reporter.id === user.id && ['NEW', 'OPEN', 'REOPENED'].includes(bug.status)
}

export function BugEditPage() {
  const id = Number(useParams().id)
  const user = useCurrentUser()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { data: bug, isLoading, isError, error, refetch } = useBug(id)

  const save = useMutation({
    mutationFn: (changes: Partial<BugInput>) => bugsApi.update(id, changes),
    onSuccess: (b) => {
      qc.setQueryData(qk.bug(id), b)
      qc.invalidateQueries({ queryKey: ['bugs'] })
      qc.invalidateQueries({ queryKey: qk.bugChildren(id) })
      toast.success(`${b.key} saved`)
      navigate(`/bugs/${id}`)
    },
  })

  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading || !bug) return <Skeleton className="h-96" />
  if (!canEditBug(user, bug))
    return (
      <EmptyState title="This bug can’t be edited right now" action={<ButtonLink to={`/bugs/${id}`}>Back to {bug.key}</ButtonLink>}>
        {bug.status === 'CLOSED' ? 'Closed bugs are read-only. Reopen it first.' : 'Only project managers, or the reporter before work starts, can edit a bug.'}
      </EmptyState>
    )

  const original = fromBug(bug)
  return (
    <>
      <PageHeader title={`Edit ${bug.key}`} description="Only the fields you change are saved and recorded in the history." />
      <BugForm
        mode="edit"
        initial={original}
        canSetPriority={false}
        submitLabel="Save changes"
        onCancel={() => navigate(`/bugs/${id}`)}
        onSubmit={async (v) => {
          const changes = Object.fromEntries(
            Object.entries(v).filter(([k, val]) => original[k as keyof typeof original] !== val),
          ) as Partial<BugInput>
          if (Object.keys(changes).length === 0) {
            navigate(`/bugs/${id}`)
            return
          }
          await save.mutateAsync(changes)
        }}
      />
    </>
  )
}

// ================================================================== detail

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-2">{children}</div>
    </section>
  )
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-center gap-2 py-1.5 text-[13px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

export function BugDetailPage() {
  const id = Number(useParams().id)
  const user = useCurrentUser()
  const { data: bug, isLoading, isError, error, refetch } = useBug(id)
  const breadcrumbs = useMemo(() => <Link to="/bugs" className="text-[13px] text-ink-3 hover:text-accent">Bugs</Link>, [])

  if (!Number.isInteger(id) || id < 1) return <ErrorState error={new Error('That isn’t a valid bug link.')} />
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />
  if (isLoading || !bug)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    )

  return (
    <article className="flex flex-col gap-6" data-testid="bug-detail" data-bug-key={bug.key}>
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          {breadcrumbs}
          <span className="text-ink-3">/</span>
          <span className="text-[13px] tabular-nums text-ink-2" data-testid="bug-key">
            {bug.key}
          </span>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="max-w-3xl text-[22px] font-semibold leading-snug tracking-tight" data-testid="bug-title">
            {bug.title}
          </h1>
          {canEditBug(user, bug) && (
            <ButtonLink to={`/bugs/${bug.id}/edit`} icon={<Pencil className="size-3.5" />} data-testid="edit-bug">
              Edit
            </ButtonLink>
          )}
        </div>
        <div className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1 md:max-w-xl">
            <LifecyclePosition status={bug.status} />
          </div>
          <TransitionActions bug={bug} />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-6">
          <Section title="Description">{bug.description}</Section>
          <Section title="Steps to reproduce">{bug.steps_to_reproduce}</Section>
          <div className="grid gap-6 sm:grid-cols-2">
            <Section title="Expected result">{bug.expected_result}</Section>
            <Section title="Actual result">{bug.actual_result}</Section>
          </div>
          {bug.resolution_notes && (
            <section className="rounded-lg border border-line bg-surface-2 p-4" data-testid="resolution-notes">
              <h2 className="text-[13px] font-semibold">Fix notes</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{bug.resolution_notes}</p>
            </section>
          )}
          <ActivityFeed bugId={bug.id} />
        </div>

        <aside className="flex flex-col gap-6 lg:border-l lg:border-line lg:pl-6">
          <dl className="divide-y divide-line" data-testid="bug-meta">
            <Meta label="Status">
              <StatusBadge status={bug.status} />
            </Meta>
            <Meta label="Severity">
              <SeverityMeter severity={bug.severity} />
            </Meta>
            <Meta label="Priority">
              <PriorityControl bug={bug} />
            </Meta>
            <Meta label="Category">
              <span className="text-[13px]">{CATEGORY_LABEL[bug.category]}</span>
            </Meta>
            <Meta label="Assignee">
              <AssignControl bug={bug} />
            </Meta>
            <Meta label="Reporter">
              <PersonChip name={bug.reporter.full_name} />
            </Meta>
            <Meta label="Environment">
              <span className="text-[13px] break-words">{bug.environment || '—'}</span>
            </Meta>
            <Meta label="Reported">
              <span title={dateTime(bug.created_at)}>{timeAgo(bug.created_at)}</span>
            </Meta>
            <Meta label="Updated">
              <span title={dateTime(bug.updated_at)}>{timeAgo(bug.updated_at)}</span>
            </Meta>
            {bug.resolved_at && (
              <Meta label="Resolved">
                <span title={dateTime(bug.resolved_at)}>{timeAgo(bug.resolved_at)}</span>
              </Meta>
            )}
            {bug.closed_at && (
              <Meta label="Closed">
                <span title={dateTime(bug.closed_at)}>{timeAgo(bug.closed_at)}</span>
              </Meta>
            )}
          </dl>
          <Attachments bug={bug} />
        </aside>
      </div>
    </article>
  )
}
