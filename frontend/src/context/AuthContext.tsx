import { useQueryClient } from '@tanstack/react-query'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { refreshSession, tokens } from '../api/client'
import { authApi, usersApi } from '../api/endpoints'
import type { Capability, CurrentUser } from '../types/api'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthValue {
  status: Status
  user: CurrentUser | null
  login: (email: string, password: string) => Promise<CurrentUser>
  logout: () => Promise<void>
  reloadUser: () => Promise<void>
  can: (capability: Capability) => boolean
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const queryClient = useQueryClient()

  // Restore the session on page load from the stored refresh token.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!tokens.refreshToken() || !(await refreshSession())) {
        if (!cancelled) setStatus('anonymous')
        return
      }
      try {
        const me = await usersApi.me()
        if (!cancelled) {
          setUser(me)
          setStatus('authenticated')
        }
      } catch {
        if (!cancelled) setStatus('anonymous')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // If the server rejects our refresh token mid-session, drop to the login screen.
  useEffect(
    () =>
      tokens.onSessionExpired(() => {
        setUser(null)
        setStatus('anonymous')
        queryClient.clear()
      }),
    [queryClient],
  )

  const login = useCallback(async (email: string, password: string) => {
    await authApi.login(email, password)
    const me = await usersApi.me()
    setUser(me)
    setStatus('authenticated')
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setStatus('anonymous')
      queryClient.clear()
    }
  }, [queryClient])

  const reloadUser = useCallback(async () => {
    setUser(await usersApi.me())
  }, [])

  const can = useCallback((c: Capability) => !!user?.capabilities.includes(c), [user])

  const value = useMemo(
    () => ({ status, user, login, logout, reloadUser, can }),
    [status, user, login, logout, reloadUser, can],
  )
  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth(): AuthValue {
  const ctx = use(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Non-null user for pages rendered behind <RequireAuth>. */
export function useCurrentUser(): CurrentUser {
  const { user } = useAuth()
  if (!user) throw new Error('useCurrentUser called without an authenticated user')
  return user
}
