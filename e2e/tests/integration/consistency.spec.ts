import { Api } from '../../fixtures/api'
import { expect, signInAs, test } from '../../fixtures/test'
import { USERS, uniqueTitle } from '../../data/users'

const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'REOPENED', 'CLOSED'] as const
type Summary = { by_status: Record<(typeof STATUSES)[number], number>; open_total: number }

test.describe('UI, API and database agree', () => {
  test('dashboard counts match the API and the filtered bug list', async ({ page, dashboard }) => {
    const api = await Api.login(USERS.pm)
    await signInAs(page, USERS.pm)
    await dashboard.goto()
    const summary = await api.get<Summary>('dashboard/summary')

    for (const s of STATUSES) await expect(dashboard.railCount(s), s).toHaveText(String(summary.by_status[s]))
    await expect(dashboard.kpi('open')).toContainText(String(summary.open_total))

    await page.getByTestId('rail-OPEN').click()
    await expect(page).toHaveURL(/\/bugs\?status=OPEN$/)
    const listed = await api.get<{ total: number }>('bugs', { status: 'OPEN' })
    expect(listed.total).toBe(summary.by_status.OPEN)
    await expect(page.getByTestId('pagination-range')).toHaveText(new RegExp(`of ${summary.by_status.OPEN}$`))
    await api.dispose()
  })

  test('a bug reported in the UI is immediately searchable and counted on the dashboard', async ({ page, bugForm, bugList, dashboard }) => {
    const api = await Api.login(USERS.pm)
    const before = (await api.get<Summary>('dashboard/summary')).by_status.NEW
    const title = uniqueTitle('Tooltip clipped on narrow screens')

    await signInAs(page, USERS.tester)
    await bugForm.goto()
    await bugForm.fill({ title, description: 'Tooltips are cut off below 400px width.', severity: 'LOW', category: 'UI', steps: 'Resize to 390px and hover a chart', expected: 'Full tooltip', actual: 'Clipped tooltip' })
    await bugForm.submit().click()
    await expect(page.getByTestId('bug-detail')).toBeVisible()

    await bugList.goto()
    await bugList.search(title)
    await expect(bugList.rows()).toHaveCount(1)
    await expect(bugList.rows().first()).toContainText(title)

    await dashboard.goto()
    await expect(dashboard.railCount('NEW')).toHaveText(String(before + 1))
    await api.dispose()
  })

  test('server-side validation errors appear on the right form field', async ({ page }) => {
    await page.goto('/register')
    await page.getByTestId('register-name').fill('Duplicate Person')
    await page.getByTestId('register-email').fill(USERS.tester.email)
    await page.getByTestId('register-password').fill('Whatever123')
    await page.getByTestId('register-confirm').fill('Whatever123')
    await page.getByTestId('register-submit').click()
    await expect(page.getByText('An account with this email already exists.')).toBeVisible()
    await expect(page.getByTestId('register-email')).toHaveAttribute('aria-invalid', 'true')
  })

  test('opening a bug that does not exist shows a not-found state, not a crash', async ({ page }) => {
    await signInAs(page, USERS.tester)
    await page.goto('/bugs/999999')
    await expect(page.getByTestId('error-state')).toContainText('Not found')
  })
})
