import { test as base, expect, type Page } from '@playwright/test'
import type { Account } from '../data/users'
import { AppShell, BugDetailPage, BugFormPage, BugListPage, DashboardPage, LoginPage, NotificationsPage, UsersPage } from '../pages'
import { Api } from './api'

interface Pages {
  login: LoginPage
  shell: AppShell
  dashboard: DashboardPage
  bugList: BugListPage
  bugForm: BugFormPage
  bugDetail: BugDetailPage
  notifications: NotificationsPage
  users: UsersPage
}

/**
 * Sign in without the login form: obtain a refresh token from the API and seed it into localStorage before the
 * app boots. The app then restores the session exactly as it does on a real page reload. UI sign-in itself is
 * covered by its own tests, so other tests don't spend time on it.
 */
export async function signInAs(page: Page, account: Account): Promise<void> {
  const api = await Api.login(account)
  await api.dispose()
  await page.addInitScript((token) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      localStorage.setItem('bt-refresh', token)
      sessionStorage.setItem('e2e-seeded', '1')
    }
  }, api.refreshToken)
  await page.goto('/')
  await expect(page.getByTestId('user-menu')).toBeVisible()
}

function pagesFor(page: Page): Pages {
  return {
    login: new LoginPage(page),
    shell: new AppShell(page),
    dashboard: new DashboardPage(page),
    bugList: new BugListPage(page),
    bugForm: new BugFormPage(page),
    bugDetail: new BugDetailPage(page),
    notifications: new NotificationsPage(page),
    users: new UsersPage(page),
  }
}

/** Collects browser-side problems; every test fails if the app logged an error or the API returned a 5xx. */
interface Health {
  problems: string[]
}

export const test = base.extend<Pages & { health: Health; asUser: (account: Account) => Promise<Page & { po: Pages }> }>({
  health: [
    async ({ page }, use) => {
      const health: Health = { problems: [] }
      page.on('pageerror', (e) => health.problems.push(`pageerror: ${e.message}`))
      page.on('response', (r) => {
        if (r.status() >= 500) health.problems.push(`${r.status()} ${r.request().method()} ${r.url()}`)
      })
      await use(health)
      expect(health.problems, 'browser errors or 5xx responses during the test').toEqual([])
    },
    { auto: true },
  ],
  login: async ({ page }, use) => use(new LoginPage(page)),
  shell: async ({ page }, use) => use(new AppShell(page)),
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
  bugList: async ({ page }, use) => use(new BugListPage(page)),
  bugForm: async ({ page }, use) => use(new BugFormPage(page)),
  bugDetail: async ({ page }, use) => use(new BugDetailPage(page)),
  notifications: async ({ page }, use) => use(new NotificationsPage(page)),
  users: async ({ page }, use) => use(new UsersPage(page)),
  /** Open an extra browser context signed in as another user (for multi-user journeys). */
  asUser: async ({ browser, baseURL }, use) => {
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = []
    await use(async (account) => {
      const ctx = await browser.newContext({ baseURL })
      contexts.push(ctx)
      const p = await ctx.newPage()
      await signInAs(p, account)
      return Object.assign(p, { po: pagesFor(p) })
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
})

export { expect }
