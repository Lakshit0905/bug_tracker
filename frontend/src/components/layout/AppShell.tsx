import clsx from 'clsx'
import {
  Bell,
  BarChart3,
  Bug as BugIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Sparkles,
  Sun,
  UserCog,
  Users,
  X,
} from 'lucide-react'
import { Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router'
import { useAuth, useCurrentUser } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useUnreadCount } from '../../hooks/queries'
import { ROLE_LABEL } from '../../lib/format'
import type { Capability } from '../../types/api'
import { Avatar } from '../ui/Badges'
import { ButtonLink } from '../ui/Button'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  needs?: Capability
  badge?: ReactNode
  end?: boolean
}

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 px-2 text-[15px] font-semibold tracking-tight text-ink">
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="7" fill="var(--accent)" />
        <path d="M8 11h16M8 16h11M8 21h7" stroke="var(--accent-ink)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="23" cy="21" r="3" fill="#fab219" />
      </svg>
      BugTrackr
    </Link>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth()
  const unread = useUnreadCount().data?.unread ?? 0

  const items: NavItem[] = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
    { to: '/bugs', label: 'Bugs', icon: BugIcon },
    { to: '/ai', label: 'AI triage', icon: Sparkles, needs: 'bug:create', badge: <span className="text-[11px] text-ink-3">v2.0</span> },
    {
      to: '/notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unread > 0 && (
        <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-accent-ink" data-testid="nav-unread">
          {unread > 99 ? '99+' : unread}
        </span>
      ),
    },
    { to: '/reports', label: 'Reports', icon: BarChart3, needs: 'reports:view' },
    { to: '/users', label: 'Users', icon: Users, needs: 'users:manage' },
  ]

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items
        .filter((i) => !i.needs || can(i.needs))
        .map(({ to, label, icon: Icon, badge, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            data-testid={`nav-${label.toLowerCase().replace(/\s+/g, '-')}`}
            className={({ isActive }) =>
              clsx(
                'group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors',
                isActive ? 'bg-surface font-medium text-ink shadow-[inset_2px_0_0_var(--accent)]' : 'text-ink-2 hover:bg-surface/60 hover:text-ink',
              )
            }
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{label}</span>
            {badge}
          </NavLink>
        ))}
    </nav>
  )
}

function UserMenu() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="user-menu"
        className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-sunken"
      >
        <Avatar name={user.full_name} size={26} />
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-medium">{user.full_name}</span>
          <span className="block text-[11.5px] text-ink-3" data-testid="user-role">
            {ROLE_LABEL[user.role]}
          </span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-56 rounded-lg border border-line bg-surface p-1 shadow-xl">
          <div className="border-b border-line px-2.5 py-2 text-[12.5px] text-ink-3">{user.email}</div>
          <button
            role="menuitem"
            type="button"
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-sunken"
            onClick={() => {
              setOpen(false)
              navigate('/profile')
            }}
          >
            <UserCog className="size-4 text-ink-3" aria-hidden /> Profile and settings
          </button>
          <button
            role="menuitem"
            type="button"
            data-testid="sign-out"
            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-sm hover:bg-sunken"
            onClick={async () => {
              setOpen(false)
              await logout()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut className="size-4 text-ink-3" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    navigate(q.trim() ? `/bugs?q=${encodeURIComponent(q.trim())}` : '/bugs')
  }
  return (
    <form onSubmit={submit} role="search" className="relative hidden max-w-sm flex-1 sm:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search bugs or jump to BUG-12"
        aria-label="Search bugs"
        className="h-8 w-full rounded-md border border-line bg-surface-2 pl-8 pr-3 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
    </form>
  )
}

export function AppShell() {
  const { can } = useAuth()
  const { resolved, toggle } = useTheme()
  // The drawer closes itself through Sidebar's onNavigate, so no route-change effect is needed.
  const [drawer, setDrawer] = useState(false)

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* desktop sidebar */}
      <div className="hidden border-r border-line bg-sunken/70 lg:block">
        <aside className="sticky top-0 flex h-dvh flex-col gap-6 px-3 py-4">
          <Logo />
          <Sidebar />
        </aside>
      </div>

      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" tabIndex={-1} aria-label="Close menu" className="absolute inset-0 cursor-default bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col gap-6 bg-paper px-3 py-4 shadow-xl">
            <div className="flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="rounded p-1 hover:bg-sunken">
                <X className="size-4" />
              </button>
            </div>
            <Sidebar onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur lg:px-6">
          <button type="button" className="rounded p-1.5 hover:bg-sunken lg:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1.5">
            {can('bug:create') && (
              <ButtonLink to="/bugs/new" variant="primary" size="sm" icon={<Plus className="size-4" />} data-testid="report-bug">
                <span className="hidden sm:inline">Report bug</span>
              </ButtonLink>
            )}
            <button
              type="button"
              onClick={toggle}
              data-testid="theme-toggle"
              aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-md p-2 text-ink-2 hover:bg-sunken hover:text-ink"
            >
              {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            <UserMenu />
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 lg:px-8">
          <Suspense fallback={<div className="grid h-40 place-items-center"><span className="size-5 animate-spin rounded-full border-2 border-accent border-r-transparent" /></div>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
