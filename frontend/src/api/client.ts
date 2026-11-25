/**
 * Typed fetch wrapper for the BugTrackr API.
 *
 * - Access token lives in memory only; the refresh token in localStorage (documented trade-off).
 * - On a 401 the client refreshes once (single-flight, shared by concurrent requests) and retries.
 * - Every non-2xx response becomes an ApiError carrying the backend's error envelope.
 */
import type { ApiErrorBody, TokenResponse, ValidationDetail } from '../types/api'

/** Same-origin '/api/v1' by default (dev proxy, Nginx). Set VITE_API_URL at build time for a separate API origin. */
export const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api/v1'
const API_PATH = '/api/v1'
const REFRESH_KEY = 'bt-refresh'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly requestId: string | null

  constructor(status: number, code: string, message: string, details: unknown = null, requestId: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
    this.requestId = requestId
  }

  /** Field-level messages from a 422 validation error, keyed by the last path segment. */
  fieldErrors(): Record<string, string> {
    if (this.code !== 'VALIDATION_ERROR' || !Array.isArray(this.details)) return {}
    const out: Record<string, string> = {}
    for (const d of this.details as ValidationDetail[]) {
      const key = String(d.loc[d.loc.length - 1])
      out[key] ??= d.msg.replace(/^Value error, /, '')
    }
    return out
  }
}

let accessToken: string | null = null
let refreshInFlight: Promise<boolean> | null = null
const sessionListeners = new Set<() => void>()

export const tokens = {
  setSession(t: TokenResponse) {
    accessToken = t.access_token
    try {
      localStorage.setItem(REFRESH_KEY, t.refresh_token)
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  },
  clear() {
    accessToken = null
    try {
      localStorage.removeItem(REFRESH_KEY)
    } catch {
      /* ignore */
    }
  },
  refreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_KEY)
    } catch {
      return null
    }
  },
  hasAccess: () => accessToken !== null,
  /** Called when the session can't be recovered (refresh failed). */
  onSessionExpired(fn: () => void) {
    sessionListeners.add(fn)
    return () => {
      sessionListeners.delete(fn)
    }
  },
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON error body */
  }
  const e = body?.error
  return new ApiError(
    res.status,
    e?.code ?? `HTTP_${res.status}`,
    e?.message ?? (res.status >= 500 ? 'The server ran into a problem. Try again in a moment.' : res.statusText),
    e?.details ?? null,
    e?.request_id ?? res.headers.get('X-Request-ID'),
  )
}

/** Exchange the stored refresh token for a new pair. Returns false if the session is gone. */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight
  const rt = tokens.refreshToken()
  if (!rt) return Promise.resolve(false)
  refreshInFlight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      })
      if (!res.ok) {
        // Only a definitive rejection ends the session. A 429, 5xx or proxy error is transient: keep the
        // refresh token so the next attempt (or a reload) can still restore the session. (Regression P5-1)
        if (res.status === 401) tokens.clear()
        return false
      }
      tokens.setSession((await res.json()) as TokenResponse)
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

type Query = Record<string, string | number | boolean | (string | number)[] | null | undefined>

export function buildQuery(params?: Query): string {
  if (!params) return ''
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)))
    else qs.append(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  form?: FormData
  auth?: boolean
  signal?: AbortSignal
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, form, auth = true, signal } = opts

  let usedToken: string | null = null
  const send = () => {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    usedToken = accessToken
    if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`
    return fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal,
    })
  }

  let res: Response
  try {
    res = await send()
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.')
  }

  if (res.status === 401 && auth) {
    // If another request already refreshed the session while this one was in flight, just retry with the new
    // token; only refresh when the token that failed is still the current one. Together with the shared
    // in-flight promise this guarantees one refresh per expiry, however many requests fail at once.
    if (usedToken !== null && usedToken !== accessToken) {
      res = await send()
    } else if (await refreshSession()) {
      res = await send()
    } else {
      sessionListeners.forEach((fn) => fn())
    }
  }

  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

/** Downloads need the bearer token, so they go through fetch → blob rather than a plain link. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  // The API returns download_url as a path ('/api/v1/attachments/…'); re-base it onto API_BASE, which may be absolute.
  const url = path.startsWith(API_PATH) ? path.slice(API_PATH.length) : path
  const doFetch = () =>
    fetch(`${API_BASE}${url}`, { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} })
  let res = await doFetch()
  if (res.status === 401 && (await refreshSession())) res = await doFetch()
  if (!res.ok) throw await toApiError(res)
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
  URL.revokeObjectURL(href)
}
