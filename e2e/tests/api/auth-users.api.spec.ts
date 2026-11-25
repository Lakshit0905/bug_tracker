import { expect, test } from '@playwright/test'
import { ContractClient } from '../../fixtures/contract'
import { USERS } from '../../data/users'

const uniqueEmail = () => `api.${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`

test.describe('Health', () => {
  test('liveness and readiness are documented and healthy', async () => {
    const c = await ContractClient.anonymous()
    expect((await c.call('GET', '/health', { expect: 200 })).body).toMatchObject({ status: 'ok' })
    expect((await c.call('GET', '/health/ready', { expect: 200 })).body).toMatchObject({ status: 'ok', database: 'ok' })
    await c.dispose()
  })
})

test.describe('Auth API', () => {
  test('register → login → me → refresh → logout round trip', async () => {
    const anon = await ContractClient.anonymous()
    const email = uniqueEmail()
    const reg = await anon.call('POST', '/auth/register', { json: { email: email.toUpperCase(), full_name: 'Api Person', password: 'Passw0rd1', role: 'ADMIN' }, expect: 201 })
    expect(reg.body).toMatchObject({ email, role: 'TESTER', is_active: true })

    const login = await anon.call<{ access_token: string; refresh_token: string; expires_in: number }>('POST', '/auth/login', {
      json: { email, password: 'Passw0rd1' },
      expect: 200,
    })
    expect(login.body.expires_in).toBeGreaterThan(0)
    anon.token = login.body.access_token
    const me = await anon.call<{ capabilities: string[] }>('GET', '/users/me', { expect: 200 })
    expect(me.body.capabilities).toContain('bug:create')

    const refreshed = await anon.call<{ refresh_token: string; access_token: string }>('POST', '/auth/refresh', { json: { refresh_token: login.body.refresh_token }, expect: 200, auth: false })
    expect(refreshed.body.refresh_token).not.toBe(login.body.refresh_token)
    anon.token = refreshed.body.access_token
    await anon.call('POST', '/auth/logout', { json: { refresh_token: refreshed.body.refresh_token }, expect: 204 })
    const after = await anon.call<{ error: { code: string } }>('POST', '/auth/refresh', { json: { refresh_token: refreshed.body.refresh_token }, expect: 401, auth: false })
    expect(after.body.error.code).toBe('INVALID_REFRESH_TOKEN')
    await anon.dispose()
  })

  test('replaying a rotated refresh token is detected', async () => {
    const c = await ContractClient.as(USERS.tester2)
    await c.call('POST', '/auth/refresh', { json: { refresh_token: c.refreshToken }, expect: 200, auth: false })
    const replay = await c.call<{ error: { code: string } }>('POST', '/auth/refresh', { json: { refresh_token: c.refreshToken }, expect: 401, auth: false })
    expect(replay.body.error.code).toBe('REFRESH_TOKEN_REUSED')
    await c.dispose()
  })

  test.describe('negative and boundary', () => {
    for (const [label, password, status] of [
      ['7 characters', 'Abcdef1', 422],
      ['8 characters (minimum)', 'Abcdefg1', 201],
      ['72 bytes (maximum)', 'a1'.repeat(36), 201],
      ['73 bytes', 'a1'.repeat(36) + 'b', 422],
      ['no digit', 'Abcdefgh', 422],
    ] as const) {
      test(`register password: ${label} → ${status}`, async () => {
        const c = await ContractClient.anonymous()
        const res = await c.call<{ error?: { code: string } }>('POST', '/auth/register', { json: { email: uniqueEmail(), full_name: 'Boundary', password }, expect: status })
        if (status === 422) expect(res.body.error!.code).toBe('VALIDATION_ERROR')
        await c.dispose()
      })
    }

    test('duplicate email (any case) → 409 EMAIL_TAKEN', async () => {
      const c = await ContractClient.anonymous()
      const res = await c.call<{ error: { code: string } }>('POST', '/auth/register', { json: { email: USERS.tester.email.toUpperCase(), full_name: 'Dup', password: 'Passw0rd1' }, expect: 409 })
      expect(res.body.error.code).toBe('EMAIL_TAKEN')
      await c.dispose()
    })

    test('wrong password and unknown email are indistinguishable', async () => {
      const c = await ContractClient.anonymous()
      const a = await c.call<{ error: { code: string; message: string } }>('POST', '/auth/login', { json: { email: USERS.tester.email, password: 'Wrong123' }, expect: 401 })
      const b = await c.call<{ error: { code: string; message: string } }>('POST', '/auth/login', { json: { email: 'nobody@example.com', password: 'Wrong123' }, expect: 401 })
      expect(a.body.error).toMatchObject({ code: b.body.error.code, message: b.body.error.message })
      expect(a.headers['www-authenticate']).toBe('Bearer')
      await c.dispose()
    })

    test('protected endpoint without / with a bad token → 401 with request id', async () => {
      const c = await ContractClient.anonymous()
      const none = await c.call<{ error: { code: string; request_id: string } }>('GET', '/users/me', { expect: 401 })
      expect(none.body.error.request_id).toMatch(/^[0-9a-f]{32}$/)
      const bad = await c.call('GET', '/users/me', { headers: { Authorization: 'Bearer not.a.jwt' }, expect: 401 })
      expect(bad.headers['x-request-id']).toBeTruthy()
      await c.dispose()
    })
  })
})

test.describe('Users API', () => {
  test('profile update and password change', async () => {
    const anon = await ContractClient.anonymous()
    const email = uniqueEmail()
    await anon.call('POST', '/auth/register', { json: { email, full_name: 'Pat Profile', password: 'Passw0rd1' }, expect: 201 })
    const me = await ContractClient.as({ email, password: 'Passw0rd1', name: 'Pat Profile', role: 'TESTER' })
    const upd = await me.call<{ full_name: string }>('PATCH', '/users/me', { json: { full_name: '  Pat Renamed  ' }, expect: 200 })
    expect(upd.body.full_name).toBe('Pat Renamed')
    await me.call('PATCH', '/users/me', { json: { full_name: 'X' }, expect: 422 })
    await me.call('PATCH', '/users/me', { json: { full_name: 'Valid Name', role: 'ADMIN' }, expect: 422 })
    const wrong = await me.call<{ error: { code: string } }>('POST', '/users/me/password', { json: { current_password: 'nope', new_password: 'NewPassw0rd' }, expect: 422 })
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD')
    await me.call('POST', '/users/me/password', { json: { current_password: 'Passw0rd1', new_password: 'NewPassw0rd' }, expect: 204 })
    await anon.call('POST', '/auth/login', { json: { email, password: 'NewPassw0rd' }, expect: 200 })
    await Promise.all([anon.dispose(), me.dispose()])
  })

  test('admin search, role change and status change with self-protection', async () => {
    const admin = await ContractClient.as(USERS.admin)
    const page = await admin.call<{ items: { id: number; email: string }[]; total: number }>('GET', '/users', { query: { role: 'DEVELOPER', is_active: true, page_size: 50 }, expect: 200 })
    expect(page.body.items.length).toBeGreaterThanOrEqual(3)
    const target = (await admin.call<{ items: { id: number }[] }>('GET', '/users', { query: { q: USERS.tester2.email }, expect: 200 })).body.items[0].id
    await admin.call('GET', '/users/{user_id}', { path: { user_id: target }, expect: 200 })
    await admin.call('PATCH', '/users/{user_id}/role', { path: { user_id: target }, json: { role: 'DEVELOPER' }, expect: 200 })
    await admin.call('PATCH', '/users/{user_id}/role', { path: { user_id: target }, json: { role: 'TESTER' }, expect: 200 })
    await admin.call('PATCH', '/users/{user_id}/status', { path: { user_id: target }, json: { is_active: true }, expect: 200 })
    const self = await admin.call<{ error: { code: string } }>('PATCH', '/users/{user_id}/role', { path: { user_id: admin.userId! }, json: { role: 'TESTER' }, expect: 403 })
    expect(self.body.error.code).toBe('SELF_MODIFICATION')
    await admin.call('GET', '/users/{user_id}', { path: { user_id: 99999999 }, expect: 404 })
    await admin.call('GET', '/users', { query: { page_size: 101 }, expect: 422 })
    await admin.dispose()
  })

  test('developer list for assignment contains only active developers', async () => {
    const pm = await ContractClient.as(USERS.pm)
    const devs = await pm.call<{ role: string }[]>('GET', '/users/developers', { expect: 200 })
    expect(devs.body.every((d) => d.role === 'DEVELOPER')).toBe(true)
    await pm.dispose()
  })
})
