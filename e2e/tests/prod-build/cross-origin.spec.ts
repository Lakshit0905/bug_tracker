import { request } from '@playwright/test'
import { Api } from '../../fixtures/api'
import { expect, signInAs, test } from '../../fixtures/test'
import { E2E } from '../../data/env'
import { USERS, uniqueTitle } from '../../data/users'

/** The production bundle (VITE_API_URL set) served on its own origin, calling the API on another origin. */
test.describe('Production build against a separate API origin', () => {
  test('signs in through the form and loads data cross-origin with CORS', async ({ page, login, dashboard }) => {
    const apiCalls: { url: string; allowOrigin: string | null }[] = []
    page.on('response', async (r) => {
      if (r.url().startsWith(E2E.apiOrigin)) apiCalls.push({ url: r.url(), allowOrigin: (await r.allHeaders())['access-control-allow-origin'] ?? null })
    })

    await login.goto()
    await expect(page.getByTestId('demo-accounts'), 'demo shortcuts are hidden in production builds').toHaveCount(0)
    await login.signIn(USERS.pm.email, USERS.pm.password)
    await expect(page).toHaveURL(`${E2E.prodWebUrl}/`)
    await expect(dashboard.rail()).toBeVisible()

    expect(apiCalls.length, 'the bundle calls the API origin directly').toBeGreaterThan(3)
    for (const c of apiCalls) expect(c.allowOrigin, c.url).toBe(E2E.prodWebUrl)
  })

  test('deep links survive a full page reload (SPA fallback + session restore)', async ({ page }) => {
    const api = await Api.login(USERS.tester)
    const bug = await api.createBug({ title: uniqueTitle('Deep link target') })
    await signInAs(page, USERS.tester)
    await page.goto(`/bugs/${bug.id}`)
    await expect(page.getByTestId('bug-title')).toHaveText(bug.title)
    await page.reload()
    await expect(page.getByTestId('bug-title')).toHaveText(bug.title)
    await api.dispose()
  })

  test('attachment download works across origins with the bearer token', async ({ page }) => {
    const api = await Api.login(USERS.tester)
    const bug = await api.createBug({ title: uniqueTitle('Has an attachment') })
    const content = 'line 1: NullPointerException at Checkout.total\n'
    await api.upload(bug.id, { name: 'stacktrace.txt', mimeType: 'text/plain', buffer: Buffer.from(content) })

    await signInAs(page, USERS.dev)
    await page.goto(`/bugs/${bug.id}`)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download stacktrace.txt' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('stacktrace.txt')
    const path = await download.path()
    const { readFile } = await import('node:fs/promises')
    expect(await readFile(path, 'utf8')).toBe(content)
    await api.dispose()
  })

  test('the API refuses cross-origin access to origins that are not allow-listed', async () => {
    const ctx = await request.newContext()
    const allowed = await ctx.fetch(`${E2E.apiBase}/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: E2E.prodWebUrl, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    })
    expect(allowed.headers()['access-control-allow-origin']).toBe(E2E.prodWebUrl)
    const denied = await ctx.fetch(`${E2E.apiBase}/auth/login`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    })
    expect(denied.headers()['access-control-allow-origin']).toBeUndefined()
    await ctx.dispose()
  })
})
