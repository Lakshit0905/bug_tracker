/**
 * Page Objects. Each class owns the locators and actions for one screen; specs read like user journeys and
 * never touch raw selectors. Locators prefer roles and data-testid attributes (stable across styling changes).
 */
import { expect, type Locator, type Page } from '@playwright/test'

export class LoginPage {
  constructor(readonly page: Page) {}
  readonly email = () => this.page.getByTestId('login-email')
  readonly password = () => this.page.getByTestId('login-password')
  readonly submit = () => this.page.getByTestId('login-submit')
  readonly error = () => this.page.getByRole('alert')

  async goto() {
    await this.page.goto('/login')
  }
  async signIn(email: string, password: string) {
    await this.email().fill(email)
    await this.password().fill(password)
    await this.submit().click()
  }
}

export class AppShell {
  constructor(readonly page: Page) {}
  nav = (name: string) => this.page.getByTestId(`nav-${name}`)
  readonly unreadBadge = () => this.page.getByTestId('nav-unread')
  readonly roleLabel = () => this.page.getByTestId('user-role')

  async signOut() {
    await this.page.getByTestId('user-menu').click()
    await this.page.getByTestId('sign-out').click()
  }
}

export class DashboardPage {
  constructor(readonly page: Page) {}
  readonly rail = () => this.page.getByTestId('lifecycle-rail')
  railCount = (status: string) => this.page.getByTestId(`rail-count-${status}`)
  kpi = (name: 'open' | 'critical' | 'unassigned' | 'mine') => this.page.getByTestId(`kpi-${name}`)

  async goto() {
    await this.page.goto('/')
    await expect(this.rail()).toBeVisible()
  }
}

export class BugListPage {
  constructor(readonly page: Page) {}
  readonly rows = () => this.page.getByTestId('bug-row')
  readonly keyword = () => this.page.getByTestId('filter-keyword')
  readonly range = () => this.page.getByTestId('pagination-range')
  /** Resolves once the list shows results for the current URL (not the previous query's results). */
  async settled() {
    await expect(this.page.getByTestId('bug-results')).toHaveAttribute('data-stale', 'false')
  }
  row = (key: string) => this.page.locator(`[data-testid="bug-row"][data-bug-key="${key}"]`)

  async goto(query = '') {
    await this.page.goto(`/bugs${query}`)
  }
  async search(text: string) {
    await this.keyword().fill(text)
    await expect(this.page).toHaveURL(new RegExp(`q=${encodeURIComponent(text).replace(/%20/g, '(\\+|%20)')}`))
  }
}

export interface BugFields {
  title: string
  description: string
  severity: string
  category: string
  steps: string
  expected: string
  actual: string
  environment?: string
}

export class BugFormPage {
  constructor(readonly page: Page) {}
  field = (name: string) => this.page.getByTestId(`field-${name}`)
  readonly submit = () => this.page.getByTestId('submit-bug')

  async goto() {
    await this.page.goto('/bugs/new')
  }
  async fill(b: BugFields) {
    await this.field('title').fill(b.title)
    await this.field('description').fill(b.description)
    await this.field('steps_to_reproduce').fill(b.steps)
    await this.field('expected_result').fill(b.expected)
    await this.field('actual_result').fill(b.actual)
    await this.field('severity').selectOption(b.severity)
    await this.field('category').selectOption(b.category)
    if (b.environment) await this.field('environment').fill(b.environment)
  }
}

export class BugDetailPage {
  constructor(readonly page: Page) {}
  readonly root = () => this.page.getByTestId('bug-detail')
  readonly key = () => this.page.getByTestId('bug-key')
  readonly title = () => this.page.getByTestId('bug-title')
  readonly status = () => this.page.getByTestId('bug-meta').getByTestId('status-badge')
  readonly assignee = () => this.page.getByTestId('assignee-select')
  readonly priority = () => this.page.getByTestId('priority-select')
  readonly actions = () => this.page.getByTestId('transition-actions')
  action = (toStatus: string) => this.page.getByTestId(`transition-${toStatus}`)
  readonly comments = () => this.page.getByTestId('comment')
  readonly history = () => this.page.getByTestId('history-entry')
  readonly attachments = () => this.page.getByTestId('attachment-list')
  readonly resolutionNotes = () => this.page.getByTestId('resolution-notes')

  async goto(id: number) {
    await this.page.goto(`/bugs/${id}`)
    await expect(this.root()).toBeVisible()
  }
  /** Returns the numeric id from the current URL. */
  id(): number {
    return Number(new URL(this.page.url()).pathname.split('/')[2])
  }
  async expectStatus(status: string) {
    await expect(this.status()).toHaveAttribute('data-status', status)
  }
  async move(toStatus: string, text?: string) {
    await this.action(toStatus).click()
    if (text !== undefined) {
      const dialog = this.page.getByTestId('transition-dialog')
      await dialog.getByTestId('transition-text').fill(text)
      await dialog.getByTestId('confirm-transition').click()
    }
    await this.expectStatus(toStatus)
  }
  async comment(body: string) {
    await this.page.getByTestId('comment-input').fill(body)
    await this.page.getByTestId('post-comment').click()
    await expect(this.comments().filter({ hasText: body })).toBeVisible()
  }
  async upload(file: { name: string; mimeType: string; buffer: Buffer }) {
    await this.page.getByTestId('attachment-input').setInputFiles(file)
    await expect(this.attachments().getByText(file.name)).toBeVisible()
  }
}

export class NotificationsPage {
  constructor(readonly page: Page) {}
  readonly items = () => this.page.getByTestId('notification')
  readonly markAll = () => this.page.getByTestId('mark-all-read')
  withText = (text: string | RegExp): Locator => this.items().filter({ hasText: text })

  async goto() {
    await this.page.goto('/notifications')
  }
}

export class UsersPage {
  constructor(readonly page: Page) {}
  row = (email: string) => this.page.locator(`[data-testid="user-row"][data-email="${email}"]`)

  async goto() {
    await this.page.goto('/users')
    await expect(this.page.getByTestId('user-table')).toBeVisible()
  }
  async setRole(email: string, roleValue: string) {
    await this.row(email).getByTestId('role-select').selectOption(roleValue)
    await expect(this.page.getByTestId('toast').last()).toBeVisible()
  }
  async toggleActive(email: string) {
    await this.row(email).getByTestId('toggle-active').click()
    await this.page.getByTestId('confirm-button').click()
    await expect(this.page.getByTestId('confirm-dialog')).not.toBeVisible()
  }
}
