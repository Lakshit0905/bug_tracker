import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, buildQuery, request, tokens } from '../api/client'

describe('buildQuery', () => {
  it('omits empty, false and undefined values', () =>
    expect(buildQuery({ a: undefined, b: null, c: '', d: false, e: 0 })).toBe('?e=0'))
  it('repeats array parameters (status=OPEN&status=NEW)', () =>
    expect(buildQuery({ status: ['OPEN', 'NEW'], page: 2 })).toBe('?status=OPEN&status=NEW&page=2'))
  it('encodes special characters', () => expect(buildQuery({ q: '50% & more' })).toBe('?q=50%25+%26+more'))
  it('returns an empty string for no params', () => {
    expect(buildQuery()).toBe('')
    expect(buildQuery({})).toBe('')
  })
})

describe('ApiError.fieldErrors', () => {
  it('maps 422 details to field names and strips the "Value error" prefix', () => {
    const err = new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed', [
      { loc: ['body', 'title'], msg: 'String should have at least 5 characters', type: 'string_too_short' },
      { loc: ['body', 'password'], msg: 'Value error, Password must contain a digit', type: 'value_error' },
    ])
    expect(err.fieldErrors()).toEqual({ title: 'String should have at least 5 characters', password: 'Password must contain a digit' })
  })
  it('returns nothing for non-validation errors', () => expect(new ApiError(409, 'EMAIL_TAKEN', 'x').fieldErrors()).toEqual({}))
})

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    tokens.clear()
  })

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('turns the backend error envelope into an ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(409, { error: { code: 'INVALID_TRANSITION', message: 'Cannot move', details: { allowed_targets: ['OPEN'] }, request_id: 'r1' } })))
    const err = (await request('/bugs/1/transitions', { method: 'POST', body: {} }).catch((e) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect([err.status, err.code, err.message, err.requestId]).toEqual([409, 'INVALID_TRANSITION', 'Cannot move', 'r1'])
    expect(err.details).toEqual({ allowed_targets: ['OPEN'] })
  })

  it('reports network failures as NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const err = (await request('/bugs').catch((e) => e)) as ApiError
    expect(err.code).toBe('NETWORK_ERROR')
  })

  it('returns undefined for 204 No Content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    await expect(request('/users/me/password', { method: 'POST', body: {} })).resolves.toBeUndefined()
  })

  it('refreshes once on 401 and retries with the new token', async () => {
    localStorage.setItem('bt-refresh', 'old-refresh-token-xxxxxxxxxxxx')
    const calls: { url: string; auth: string | null }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string> | undefined)?.Authorization ?? null
      calls.push({ url, auth })
      if (url.endsWith('/auth/refresh'))
        return json(200, { access_token: 'new-access', refresh_token: 'new-refresh-token-xxxxxxxxxxxx', token_type: 'bearer', expires_in: 1800, user: {} })
      return auth === 'Bearer new-access' ? json(200, { ok: true }) : json(401, { error: { code: 'INVALID_TOKEN', message: 'expired', details: null, request_id: null } })
    }))
    await expect(request('/users/me')).resolves.toEqual({ ok: true })
    expect(calls.map((c) => c.url.replace('/api/v1', ''))).toEqual(['/users/me', '/auth/refresh', '/users/me'])
    expect(localStorage.getItem('bt-refresh')).toBe('new-refresh-token-xxxxxxxxxxxx')
  })

  it('keeps the refresh token when refresh is rate-limited (P5-1) and clears it on 401', async () => {
    localStorage.setItem('bt-refresh', 'keep-me-xxxxxxxxxxxxxxxxxxxxx')
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/auth/refresh') ? json(429, {}) : json(401, {}))))
    await request('/users/me').catch(() => {})
    expect(localStorage.getItem('bt-refresh')).toBe('keep-me-xxxxxxxxxxxxxxxxxxxxx')

    vi.stubGlobal('fetch', vi.fn(async () => json(401, {})))
    await request('/users/me').catch(() => {})
    expect(localStorage.getItem('bt-refresh')).toBeNull()
  })
})
