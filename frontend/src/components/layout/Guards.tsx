import { ShieldX } from 'lucide-react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import type { Capability } from '../../types/api'
import { ButtonLink } from '../ui/Button'
import { EmptyState } from '../ui/Feedback'

export function FullPageLoader() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-label="Loading">
      <div className="size-6 animate-spin rounded-full border-2 border-accent border-r-transparent" />
    </div>
  )
}

/** Sends anonymous users to /login, remembering where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageLoader />
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

/** Signed-in users who open /login or /register go back to where they were heading (or the dashboard).
 *  This guard re-renders the moment sign-in succeeds, so it — not the login form — decides the destination. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const from = (useLocation().state as { from?: string } | null)?.from
  if (status === 'loading') return <FullPageLoader />
  if (status === 'authenticated') return <Navigate to={from && from.startsWith('/') && !from.startsWith('//') ? from : '/'} replace />
  return children
}

/** UI-level guard only — the API enforces the same rule and returns 403 regardless. */
export function RequireCapability({ capability, children }: { capability: Capability; children: ReactNode }) {
  const { can } = useAuth()
  if (!can(capability)) {
    return (
      <EmptyState
        icon={<ShieldX className="size-8" />}
        title="This page isn’t available for your role"
        action={<ButtonLink to="/">Go to dashboard</ButtonLink>}
      >
        Ask an administrator if you need access.
      </EmptyState>
    )
  }
  return children
}
