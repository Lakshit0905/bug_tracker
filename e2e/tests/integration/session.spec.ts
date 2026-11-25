import { request } from '@playwright/test'
import { Api } from '../../fixtures/api'
import { expect, signInAs, test } from '../../fixtures/test'
import { E2E } from '../../data/env'
import { USERS } from '../../data/users'

test.describe('Session handling across frontend and backend', () => {
  test('expired access token: many failing requests trigger exactly one refresh and all are retried', async ({ page, dashboard }) => {
    await signInAs(page, USERS.tester)
    await page.goto('/notifications')

    // Simulate expiry: the first call to each dashboard endpoint is answered with the backend's 401 envelope.
    const failedOnce = new Set<string>()
    await page.route(/\/api\/v1\/(dashboard|bugs)\b/, async (route) => {
      const url = route.request().url()
      if (failedOnce.has(url)) return route.continue()
      failedOnce.add(url)
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'INVALID_TOKEN', message: 'Token has expired', details: null, request_id: null } }),
      })
    })
    const refreshes: string[] = []
    page.on('request', (r) => r.url().endsWith('/auth/refresh') && refreshes.push(r.url()))

    await page.getByTestId('nav-dashboard').click()
    await expect(dashboard.rail()).toBeVisible()
    await expect(dashboard.railCount('NEW')).toHaveText(/^\d+$/)
    expect(failedOnce.size, 'several requests failed with 401 at the same time').toBeGreaterThanOrEqual(3)
    expect(refreshes, 'single-flight refresh').toHaveLength(1)
    await expect(page).toHaveURL(/\/$/)
  })

  test('a rate-limited session restore keeps the session for the next attempt (regression P5-1)', async ({ page, dashboard }) => {
    await signInAs(page, USERS.tester)
    await page.route('**/api/v1/auth/refresh', (route) =>
      route.fulfill({ status: 429, contentType: 'application/json', headers: { 'Retry-After': '1' },
        body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many attempts.', details: null, request_id: null } }) }),
    )
    await page.reload()
    await expect(page).toHaveURL(/\/login$/) // could not restore right now…
    expect(await page.evaluate(() => localStorage.getItem('bt-refresh')), '…but the refresh token was kept').not.toBeNull()

    await page.unroute('**/api/v1/auth/refresh')
    await page.goto('/')
    await expect(dashboard.rail(), 'signed back in without typing a password').toBeVisible()
  })

  test('a deactivated user is signed out on their next action and returns to the same page after sign-in', async ({ page, login }) => {
    const admin = await Api.login(USERS.admin)
    const samId = await admin.findUserId(USERS.tester2.email)
    await signInAs(page, USERS.tester2)

    await admin.send('patch', `users/${samId}/status`, { is_active: false })
    await page.getByTestId('nav-notifications').click()
    await expect(page).toHaveURL(/\/login$/)

    await login.signIn(USERS.tester2.email, USERS.tester2.password)
    await expect(login.error()).toContainText('deactivated')

    await admin.send('patch', `users/${samId}/status`, { is_active: true })
    await login.submit().click()
    await expect(page, 'returns to where they were going').toHaveURL(/\/notifications$/)
    await admin.dispose()
  })

  test('opening a deep link while signed out returns there after sign-in (regression P6-1)', async ({ page, login }) => {
    await page.goto('/bugs?status=OPEN&sort=priority')
    await expect(page).toHaveURL(/\/login$/)
    await login.signIn(USERS.pm.email, USERS.pm.password)
    await expect(page).toHaveURL(/\/bugs\?status=OPEN&sort=priority$/)
  })

  test('signing out revokes the refresh token on the server', async ({ page, shell }) => {
    await signInAs(page, USERS.tester)
    const stored = await page.evaluate(() => localStorage.getItem('bt-refresh'))
    expect(stored).toBeTruthy()

    await shell.signOut()
    await expect(page).toHaveURL(/\/login$/)
    expect(await page.evaluate(() => localStorage.getItem('bt-refresh'))).toBeNull()
    await page.goto('/bugs')
    await expect(page).toHaveURL(/\/login$/)

    const ctx = await request.newContext()
    const res = await ctx.post(`${E2E.apiBase}/auth/refresh`, { data: { refresh_token: stored } })
    expect(res.status(), 'the token the browser held is no longer usable').toBe(401)
    await ctx.dispose()
  })

  test('backend outage shows an actionable error and the page recovers when the API is back', async ({ page, bugList }) => {
    await signInAs(page, USERS.pm)
    await page.route(/\/api\/v1\/bugs\?/, (route) => route.abort('connectionrefused'))
    await bugList.goto()
    const error = page.getByTestId('error-state')
    await expect(error).toContainText('Cannot reach the server', { timeout: 15_000 })

    await page.unroute(/\/api\/v1\/bugs\?/)
    await error.getByRole('button', { name: 'Try again' }).click()
    await expect(bugList.rows().first()).toBeVisible()
  })

  test('a new account starts as tester and gains manager access as soon as an admin promotes it', async ({ page, shell, asUser }) => {
    const email = `new.${Date.now().toString(36)}@example.com`
    await page.goto('/register')
    await page.getByTestId('register-name').fill('Nova Newcomer')
    await page.getByTestId('register-email').fill(email)
    await page.getByTestId('register-password').fill('Welcome123')
    await page.getByTestId('register-confirm').fill('Welcome123')
    await page.getByTestId('register-submit').click()
    await expect(shell.roleLabel()).toHaveText('Tester')
    await expect(shell.nav('reports')).toHaveCount(0)

    const admin = await asUser(USERS.admin)
    await admin.po.users.goto()
    await admin.po.users.setRole(email, 'PROJECT_MANAGER')

    await page.reload()
    await expect(shell.roleLabel()).toHaveText('Project manager')
    await shell.nav('reports').click()
    await expect(page.getByTestId('report-metrics')).toBeVisible()
  })
})
