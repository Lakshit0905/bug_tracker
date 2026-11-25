import { Activity } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { LifecycleRail } from '../components/bugs/LifecycleRail'
import { BugTable } from '../components/bugs/BugTable'
import { MeterList, StackedBars, TrendChart } from '../components/charts/Charts'
import { PageHeader } from '../components/layout/AppShell'
import { SeverityMeter } from '../components/ui/Badges'
import { EmptyState, ErrorState, Panel, Skeleton } from '../components/ui/Feedback'
import { useAuth, useCurrentUser } from '../context/AuthContext'
import { useActivity, useBugs, useSummary, useTrends, useWorkload } from '../hooks/queries'
import { LEVEL_LABEL, SEVERITY_VAR, describeHistory, timeAgo } from '../lib/format'
import { LEVELS } from '../types/api'

function Kpi({ label, value, to, tone, testId }: { label: string; value: number; to: string; tone?: 'danger'; testId: string }) {
  return (
    <Link to={to} className="flex flex-col gap-1 px-5 py-4 hover:bg-surface-2" data-testid={testId}>
      <span className="text-[13px] text-ink-2">{label}</span>
      <span className={`text-[26px] font-semibold leading-none tabular-nums ${tone === 'danger' && value > 0 ? 'text-danger' : ''}`}>{value}</span>
    </Link>
  )
}

function RangePicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="inline-flex rounded-md border border-line p-0.5" role="group" aria-label="Time range">
      {[14, 30, 90].map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={value === d}
          onClick={() => onChange(d)}
          className={`h-6 rounded px-2 text-[12px] ${value === d ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
        >
          {d} days
        </button>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const user = useCurrentUser()
  const { can } = useAuth()
  const [days, setDays] = useState(30)
  const summary = useSummary()
  const trends = useTrends(days)
  const activity = useActivity(7)
  const fullView = can('dashboard:full')
  const workload = useWorkload(fullView)
  const isDev = user.role === 'DEVELOPER'
  const myQueue = useBugs(
    isDev
      ? { assigned_to_me: true, status: ['OPEN', 'IN_PROGRESS', 'REOPENED'], sort: 'priority', order: 'desc', page_size: 6 }
      : { reported_by_me: true, sort: 'updated_at', order: 'desc', page_size: 6 },
  )

  if (summary.isError) return <ErrorState error={summary.error} onRetry={() => summary.refetch()} />
  const s = summary.data

  return (
    <div className="flex flex-col gap-6" data-testid="dashboard">
      <PageHeader title="Dashboard" description={`Signed in as ${user.full_name}. Figures update as the team works.`} />

      <Panel title="Where every bug stands" bodyClassName="p-4 sm:p-5">
        {s ? <LifecycleRail counts={s.by_status} /> : <Skeleton className="h-24" />}
      </Panel>

      <section aria-label="Key figures" className="grid grid-cols-2 divide-line overflow-hidden rounded-[10px] border border-line bg-surface sm:grid-cols-4 sm:divide-x [&>*:nth-child(-n+2)]:border-b [&>*:nth-child(-n+2)]:border-line sm:[&>*:nth-child(-n+2)]:border-b-0">
        {s ? (
          <>
            <Kpi testId="kpi-open" label="Open bugs" value={s.open_total} to="/bugs?status=NEW&status=OPEN&status=IN_PROGRESS&status=RESOLVED&status=REOPENED" />
            <Kpi testId="kpi-critical" label="Critical, not closed" value={s.critical_open} tone="danger" to="/bugs?severity=CRITICAL&status=NEW&status=OPEN&status=IN_PROGRESS&status=RESOLVED&status=REOPENED" />
            <Kpi testId="kpi-unassigned" label="Waiting for an assignee" value={s.unassigned_open} to="/bugs?mine=unassigned&status=NEW&status=OPEN&status=REOPENED" />
            {isDev ? (
              <Kpi testId="kpi-mine" label="Assigned to you" value={s.my_assigned_active} to="/bugs?mine=assigned&status=OPEN&status=IN_PROGRESS&status=REOPENED" />
            ) : (
              <Kpi testId="kpi-mine" label="Reported by you, still open" value={s.my_reported_open} to="/bugs?mine=reported" />
            )}
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="m-4 h-12" />)
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Reported vs resolved" actions={<RangePicker value={days} onChange={setDays} />} className="xl:col-span-2">
          {trends.data ? <TrendChart points={trends.data.points} /> : trends.isError ? <ErrorState error={trends.error} /> : <Skeleton className="h-60" />}
        </Panel>
        <Panel title="Open bugs by severity">
          {s ? (
            <MeterList
              total={Math.max(...LEVELS.map((l) => s.by_severity_open[l]), 1)}
              rows={[...LEVELS].reverse().map((l) => ({
                label: LEVEL_LABEL[l],
                value: s.by_severity_open[l],
                color: SEVERITY_VAR[l],
                icon: <SeverityMeter severity={l} showLabel={false} />,
              }))}
            />
          ) : (
            <Skeleton className="h-32" />
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {fullView ? (
          <Panel title="Workload by developer" actions={<Link to="/reports" className="text-[13px] text-accent hover:underline">Reports</Link>}>
            {workload.data ? (
              workload.data.length ? (
                <StackedBars
                  category="full_name"
                  data={workload.data.map((w) => ({ ...w }))}
                  series={[
                    { key: 'open', label: 'Open', color: 'var(--series-1)' },
                    { key: 'in_progress', label: 'In progress', color: 'var(--series-2)' },
                    { key: 'reopened', label: 'Reopened', color: 'var(--series-3)' },
                  ]}
                  summary={workload.data.map((w) => `${w.full_name}: ${w.active_total} active`).join('; ')}
                />
              ) : (
                <EmptyState title="No active developers">Developers appear here once an administrator assigns the role.</EmptyState>
              )
            ) : (
              <Skeleton className="h-40" />
            )}
          </Panel>
        ) : (
          <Panel
            title={isDev ? 'Your queue' : 'Your recent reports'}
            bodyClassName="p-0"
            actions={<Link to={isDev ? '/bugs?mine=assigned' : '/bugs?mine=reported'} className="text-[13px] text-accent hover:underline">View all</Link>}
          >
            {myQueue.data?.items.length ? (
              <BugTable bugs={myQueue.data.items} sort="updated_at" order="desc" onSort={() => {}} compact />
            ) : myQueue.isLoading ? (
              <Skeleton className="m-4 h-32" />
            ) : (
              <EmptyState title={isDev ? 'Nothing assigned to you' : 'You haven’t reported anything yet'}>
                {isDev ? 'When a project manager assigns you a bug it appears here.' : 'Report a bug and track it from here.'}
              </EmptyState>
            )}
          </Panel>
        )}

        <Panel title="Recent activity" bodyClassName="p-0">
          {activity.data?.length ? (
            <ol className="divide-y divide-line" data-testid="activity-feed">
              {activity.data.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-[13px]">
                  <Link to={`/bugs/${a.bug_id}`} className="group block">
                    <span className="text-ink-2">
                      <span className="font-medium text-ink">{a.actor_name ?? 'System'}</span> {describeHistory(a)}
                    </span>
                    <span className="mt-0.5 flex items-baseline gap-2 text-[12.5px] text-ink-3">
                      <span className="shrink-0 whitespace-nowrap tabular-nums">{a.bug_key}</span>
                      <span className="truncate group-hover:text-accent">{a.bug_title}</span>
                      <span className="ml-auto shrink-0">{timeAgo(a.created_at)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : activity.isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : (
            <EmptyState icon={<Activity className="size-6" />} title="No activity yet">
              Changes to bugs show up here as they happen.
            </EmptyState>
          )}
        </Panel>
      </div>
    </div>
  )
}
