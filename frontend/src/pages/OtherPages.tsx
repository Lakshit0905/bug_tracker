import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, Copy, ListChecks, Sparkles, Tags, Users as UsersIcon, Gauge, FileSearch } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { notificationsApi, usersApi } from '../api/endpoints'
import { MeterList, StackedBars } from '../components/charts/Charts'
import { PageHeader } from '../components/layout/AppShell'
import { RequireCapability } from '../components/layout/Guards'
import { Avatar, RoleBadge, SeverityMeter } from '../components/ui/Badges'
import { Button, ButtonLink } from '../components/ui/Button'
import { Alert, ConfirmDialog, EmptyState, ErrorState, Pagination, Panel, Skeleton, useToast } from '../components/ui/Feedback'
import { SelectField, TextField, controlClass } from '../components/ui/Field'
import { useAuth, useCurrentUser } from '../context/AuthContext'
import { useTheme, type ThemePref } from '../context/ThemeContext'
import { qk, useNotifications, useReports, useUsers, useWorkload } from '../hooks/queries'
import { CATEGORY_LABEL, LEVEL_LABEL, ROLE_LABEL, SEVERITY_VAR, dateTime, percent, timeAgo } from '../lib/format'
import { LEVELS, ROLES, type Notification, type Role, type User } from '../types/api'

// ================================================================== AI triage (arrives in v2.0)

export function AIAnalysisPage() {
  const planned = [
    { icon: Tags, title: 'Category suggestion', text: 'Proposes UI, API, database, security and other categories from the report text.' },
    { icon: Copy, title: 'Duplicate check', text: 'Lists similar existing bugs with a similarity score before you submit.' },
    { icon: Gauge, title: 'Priority and severity advice', text: 'Recommends levels with a short explanation and a confidence score.' },
    { icon: FileSearch, title: 'Summary', text: 'Condenses long descriptions and highlights error messages, versions and endpoints.' },
    { icon: UsersIcon, title: 'Developer suggestion', text: 'Ranks developers by past work in the same category and current workload.' },
  ]
  return (
    <RequireCapability capability="bug:create">
      <PageHeader title="AI triage" description="Suggestions to speed up reporting. You always make the final decision." />
      <Panel>
        <EmptyState icon={<Sparkles className="size-7" />} title="AI-assisted triage arrives in version 2.0" action={<ButtonLink to="/bugs/new" variant="primary">Report a bug manually</ButtonLink>}>
          Version 1.0 is the manual workflow. When the AI service is switched on, these suggestions appear while you report a bug, and every one can be accepted or overridden.
        </EmptyState>
        <ul className="mx-auto grid max-w-3xl gap-x-8 gap-y-4 border-t border-line pt-6 sm:grid-cols-2">
          {planned.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-[13px] text-ink-2">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </RequireCapability>
  )
}

// ================================================================== notifications

const NOTIF_LABEL: Record<Notification['type'], string> = {
  BUG_ASSIGNED: 'Assignment',
  STATUS_CHANGED: 'Status change',
  COMMENT_ADDED: 'Comment',
  BUG_REOPENED: 'Reopened',
}

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error, refetch } = useNotifications({ unread_only: unreadOnly, page, page_size: 20 })
  const qc = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] })

  const readAll = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: (r) => {
      toast.success(r.updated ? `Marked ${r.updated} as read` : 'Everything was already read')
      refresh()
    },
  })
  const open = async (n: Notification) => {
    if (!n.is_read) await notificationsApi.markRead(n.id).then(refresh).catch(() => {})
    if (n.bug_id) navigate(`/bugs/${n.bug_id}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Notifications"
        description="Assignments, status changes, comments and reopened bugs that involve you."
        actions={<Button icon={<CheckCheck className="size-4" />} onClick={() => readAll.mutate()} loading={readAll.isPending} data-testid="mark-all-read">Mark all as read</Button>}
      />
      <div className="inline-flex self-start rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Show">
        {[false, true].map((u) => (
          <button
            key={String(u)}
            type="button"
            aria-pressed={unreadOnly === u}
            onClick={() => {
              setUnreadOnly(u)
              setPage(1)
            }}
            className={`h-7 rounded px-3 text-[13px] ${unreadOnly === u ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:text-ink'}`}
          >
            {u ? 'Unread' : 'All'}
          </button>
        ))}
      </div>
      <Panel bodyClassName="p-0">
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading ? (
          <Skeleton className="m-4 h-40" />
        ) : !data?.items.length ? (
          <EmptyState icon={<Bell className="size-7" />} title={unreadOnly ? 'You’re all caught up' : 'No notifications yet'}>
            You’ll be notified when a bug is assigned to you, changes status, gets a comment or is reopened.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-line" data-testid="notification-list">
            {data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  data-testid="notification"
                  data-read={n.is_read}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2"
                >
                  <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.is_read ? 'bg-transparent' : 'bg-accent'}`} aria-label={n.is_read ? undefined : 'Unread'} />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm ${n.is_read ? 'text-ink-2' : 'font-medium text-ink'}`}>{n.message}</span>
                    <span className="mt-0.5 flex gap-3 text-[12.5px] text-ink-3">
                      <span>{NOTIF_LABEL[n.type]}</span>
                      {n.bug_key && <span className="tabular-nums">{n.bug_key}</span>}
                      <span title={dateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {data && <Pagination page={page} pageSize={20} total={data.total} onPage={setPage} />}
    </div>
  )
}

// ================================================================== user management (admin)

export function UsersPage() {
  const me = useCurrentUser()
  const [q, setQ] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [active, setActive] = useState<'' | 'true' | 'false'>('')
  const [page, setPage] = useState(1)
  const [confirm, setConfirm] = useState<User | null>(null)
  const params = { q: q || undefined, role: role || undefined, is_active: active === '' ? undefined : active === 'true', page, page_size: 20 }
  const { data, isLoading, isError, error, refetch } = useUsers(params)
  const qc = useQueryClient()
  const toast = useToast()
  const done = (msg: string) => {
    toast.success(msg)
    qc.invalidateQueries({ queryKey: ['users'] })
    qc.invalidateQueries({ queryKey: qk.developers })
  }

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: Role }) => usersApi.setRole(id, role),
    onSuccess: (u) => done(`${u.full_name} is now a ${ROLE_LABEL[u.role].toLowerCase()}`),
    onError: (e) => toast.error(e),
  })
  const toggle = useMutation({
    mutationFn: (u: User) => usersApi.setActive(u.id, !u.is_active),
    onSuccess: (u) => {
      setConfirm(null)
      done(u.is_active ? `${u.full_name} can sign in again` : `${u.full_name} has been deactivated`)
    },
    onError: (e) => toast.error(e),
  })

  return (
    <RequireCapability capability="users:manage">
      <div className="flex flex-col gap-5">
        <PageHeader title="Users" description="Change roles and control who can sign in. You can’t change your own account here." />
        <div className="flex flex-wrap items-end gap-3">
          <TextField label="Search" placeholder="Name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1) }} className="min-w-60 flex-1" data-testid="user-search" />
          <SelectField label="Role" placeholder="All roles" value={role} onChange={(e) => { setRole(e.target.value as Role); setPage(1) }} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} className="w-44" />
          <SelectField label="Status" placeholder="Any status" value={active} onChange={(e) => { setActive(e.target.value as typeof active); setPage(1) }} options={[{ value: 'true', label: 'Active' }, { value: 'false', label: 'Deactivated' }]} className="w-40" />
        </div>
        <Panel bodyClassName="p-0">
          {isError ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : !data?.items.length ? (
            <EmptyState icon={<UsersIcon className="size-7" />} title="No users match">Try a different name, role or status.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="user-table">
                <thead>
                  <tr className="border-b border-line text-left text-[12.5px] text-ink-3 [&>th]:px-4 [&>th]:py-2 [&>th]:font-medium">
                    <th scope="col">Person</th>
                    <th scope="col" className="w-52">Role</th>
                    <th scope="col" className="hidden w-36 md:table-cell">Last sign-in</th>
                    <th scope="col" className="w-40">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => {
                    const self = u.id === me.id
                    return (
                      <tr key={u.id} className="border-b border-line last:border-0 [&>td]:px-4 [&>td]:py-2.5" data-testid="user-row" data-email={u.email}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <Avatar name={u.full_name} size={28} />
                            <div className="min-w-0">
                              <div className="font-medium">{u.full_name}{self && <span className="ml-1.5 text-[12px] font-normal text-ink-3">(you)</span>}</div>
                              <div className="truncate text-[12.5px] text-ink-3">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          {self ? (
                            <RoleBadge role={u.role} />
                          ) : (
                            <select
                              aria-label={`Role for ${u.full_name}`}
                              className={`${controlClass} h-8 px-2`}
                              value={u.role}
                              data-testid="role-select"
                              onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value as Role })}
                            >
                              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="hidden text-[13px] text-ink-2 md:table-cell">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={`text-[13px] ${u.is_active ? 'text-success' : 'text-ink-3'}`}>{u.is_active ? 'Active' : 'Deactivated'}</span>
                            {!self && (
                              <Button size="sm" variant="ghost" onClick={() => setConfirm(u)} data-testid="toggle-active">
                                {u.is_active ? 'Deactivate' : 'Reactivate'}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        {data && <Pagination page={page} pageSize={20} total={data.total} onPage={setPage} />}
        <ConfirmDialog
          open={confirm !== null}
          title={confirm?.is_active ? `Deactivate ${confirm.full_name}?` : `Reactivate ${confirm?.full_name}?`}
          message={
            confirm?.is_active
              ? 'They’ll be signed out everywhere and can’t sign in until reactivated. Their bugs, comments and history stay in place.'
              : 'They’ll be able to sign in again with their existing password.'
          }
          confirmLabel={confirm?.is_active ? 'Deactivate' : 'Reactivate'}
          tone={confirm?.is_active ? 'danger' : 'primary'}
          loading={toggle.isPending}
          onConfirm={() => confirm && toggle.mutate(confirm)}
          onCancel={() => setConfirm(null)}
        />
      </div>
    </RequireCapability>
  )
}

// ================================================================== reports (PM, admin)

export function ReportsPage() {
  const { can } = useAuth()
  const { data: r, isLoading, isError, error, refetch } = useReports()
  const workload = useWorkload(can('dashboard:full'))
  return (
    <RequireCapability capability="reports:view">
      <div className="flex flex-col gap-6">
        <PageHeader title="Reports" description="How quickly bugs are fixed and where they come from." />
        {isError ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : isLoading || !r ? (
          <Skeleton className="h-96" />
        ) : (
          <>
            <section aria-label="Headline metrics" className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-line bg-surface sm:grid-cols-4 sm:divide-x sm:divide-line" data-testid="report-metrics">
              {[
                { label: 'Bugs reported', value: String(r.total_bugs), note: `${r.closed_bugs} closed` },
                { label: 'Closure rate', value: percent(r.closure_rate), note: 'closed ÷ reported' },
                { label: 'Average time to resolve', value: r.avg_hours_to_resolve === null ? 'No data' : r.avg_hours_to_resolve >= 48 ? `${(r.avg_hours_to_resolve / 24).toFixed(1)} days` : `${r.avg_hours_to_resolve.toFixed(1)} hours`, note: 'reported → resolved' },
                { label: 'Reopen rate', value: percent(r.reopen_rate), note: `${r.reopened_bugs} reopened at least once` },
              ].map((m) => (
                <div key={m.label} className="flex flex-col gap-1 border-line px-5 py-4 max-sm:odd:border-r max-sm:[&:nth-child(-n+2)]:border-b">
                  <span className="text-[13px] text-ink-2">{m.label}</span>
                  <span className="text-[24px] font-semibold leading-none tabular-nums">{m.value}</span>
                  <span className="text-[12.5px] text-ink-3">{m.note}</span>
                </div>
              ))}
            </section>
            <div className="grid gap-6 xl:grid-cols-2">
              <Panel title="Bugs by category">
                {r.total_bugs ? (
                  <StackedBars
                    category="label"
                    data={r.by_category.filter((c) => c.total > 0).map((c) => ({ label: CATEGORY_LABEL[c.category], open: c.open, closed: c.closed }))}
                    series={[
                      { key: 'open', label: 'Not closed', color: 'var(--series-1)' },
                      { key: 'closed', label: 'Closed', color: 'var(--series-3)' },
                    ]}
                    summary={r.by_category.map((c) => `${CATEGORY_LABEL[c.category]}: ${c.total}`).join('; ')}
                  />
                ) : (
                  <EmptyState icon={<ListChecks className="size-6" />} title="No bugs yet">Categories appear once bugs are reported.</EmptyState>
                )}
              </Panel>
              <Panel title="All bugs by severity">
                <MeterList
                  total={Math.max(...LEVELS.map((l) => r.by_severity[l]), 1)}
                  rows={[...LEVELS].reverse().map((l) => ({ label: LEVEL_LABEL[l], value: r.by_severity[l], color: SEVERITY_VAR[l], icon: <SeverityMeter severity={l} showLabel={false} /> }))}
                />
              </Panel>
            </div>
            {workload.data && workload.data.length > 0 && (
              <Panel title="Developer workload">
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
              </Panel>
            )}
          </>
        )}
      </div>
    </RequireCapability>
  )
}

// ================================================================== profile & settings

export function ProfilePage() {
  const user = useCurrentUser()
  const { reloadUser } = useAuth()
  const { pref, setPref } = useTheme()
  const toast = useToast()
  const [name, setName] = useState(user.full_name)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({})
  const [pwError, setPwError] = useState<string | null>(null)

  const saveName = useMutation({
    mutationFn: () => usersApi.updateMe(name.trim()),
    onSuccess: async () => {
      await reloadUser()
      toast.success('Name updated')
    },
    onError: (e) => toast.error(e),
  })
  const savePw = useMutation({
    mutationFn: () => usersApi.changePassword(pw.current, pw.next),
    onSuccess: () => {
      setPw({ current: '', next: '', confirm: '' })
      toast.success('Password changed. Other devices have been signed out.')
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_CURRENT_PASSWORD') setPwErrors({ current: 'That isn’t your current password.' })
      else if (e instanceof ApiError && e.code === 'PASSWORD_REUSED') setPwErrors({ next: 'Choose a password you aren’t using now.' })
      else setPwError(e instanceof Error ? e.message : String(e))
    },
  })

  const submitPw = (e: FormEvent) => {
    e.preventDefault()
    setPwError(null)
    const errs: Record<string, string> = {}
    if (!pw.current) errs.current = 'Enter your current password.'
    if (pw.next.length < 8 || !/[A-Za-z]/.test(pw.next) || !/\d/.test(pw.next)) errs.next = 'At least 8 characters, with a letter and a number.'
    if (pw.confirm !== pw.next) errs.confirm = 'Passwords don’t match.'
    setPwErrors(errs)
    if (!Object.keys(errs).length) savePw.mutate()
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Profile and settings" />
      <Panel title="Your account">
        <div className="mb-5 flex items-center gap-3">
          <Avatar name={user.full_name} size={44} />
          <div>
            <p className="font-medium">{user.email}</p>
            <p className="text-[13px] text-ink-2">
              <RoleBadge role={user.role} /> <span className="ml-1">Member since {new Date(user.created_at).toLocaleDateString()}</span>
            </p>
          </div>
        </div>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length >= 2) saveName.mutate()
          }}
        >
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className="min-w-64 flex-1" error={name.trim().length < 2 ? 'At least 2 characters.' : undefined} data-testid="profile-name" />
          <Button type="submit" variant="primary" loading={saveName.isPending} disabled={name.trim() === user.full_name || name.trim().length < 2}>
            Save name
          </Button>
        </form>
      </Panel>

      <Panel title="Change password">
        <form onSubmit={submitPw} noValidate className="grid gap-4 sm:grid-cols-3" data-testid="password-form">
          {pwError && <div className="sm:col-span-3"><Alert>{pwError}</Alert></div>}
          <TextField label="Current password" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} error={pwErrors.current} />
          <TextField label="New password" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} error={pwErrors.next} />
          <TextField label="Confirm new password" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwErrors.confirm} />
          <div className="sm:col-span-3">
            <Button type="submit" loading={savePw.isPending}>Change password</Button>
          </div>
        </form>
      </Panel>

      <Panel title="Appearance">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-2 text-[13px] text-ink-2">Theme</legend>
          {(['light', 'dark', 'system'] as ThemePref[]).map((t) => (
            <label key={t} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${pref === t ? 'border-accent bg-accent-soft' : 'border-line-strong hover:bg-surface-2'}`}>
              <input type="radio" name="theme" value={t} checked={pref === t} onChange={() => setPref(t)} className="accent-[var(--accent)]" data-testid={`theme-${t}`} />
              {t === 'system' ? 'Match my device' : t === 'light' ? 'Light' : 'Dark'}
            </label>
          ))}
        </fieldset>
      </Panel>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <EmptyState title="Page not found" action={<Link to="/" className="text-sm text-accent hover:underline">Go to the dashboard</Link>}>
      The link may be broken, or the page may have moved.
    </EmptyState>
  )
}
