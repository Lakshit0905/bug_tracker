import { Api } from '../../fixtures/api'
import { expect, signInAs, test } from '../../fixtures/test'
import { USERS, uniqueTitle } from '../../data/users'

test.describe('Search and filtering', () => {
  let marker: string
  test.beforeAll(async () => {
    marker = uniqueTitle('Filtermark')
    const tester = await Api.login(USERS.tester)
    for (const [suffix, severity, category] of [['alpha', 'LOW', 'UI'], ['bravo', 'HIGH', 'API'], ['charlie', 'CRITICAL', 'API']] as const)
      await tester.createBug({ title: `${marker} ${suffix}`, severity, category })
    await tester.dispose()
  })

  test('keyword search narrows the list and is kept in the URL across reloads', async ({ page, bugList }) => {
    await signInAs(page, USERS.pm)
    await bugList.goto()
    await bugList.search(marker)
    await expect(bugList.rows()).toHaveCount(3)
    await page.reload()
    await expect(bugList.keyword()).toHaveValue(marker)
    await expect(bugList.rows()).toHaveCount(3)
  })

  test('severity and category filters combine', async ({ page, bugList }) => {
    await signInAs(page, USERS.pm)
    await bugList.goto(`?q=${encodeURIComponent(marker)}`)
    await page.getByTestId('filter-severity').click()
    await page.getByTestId('option-severity-HIGH').click()
    await page.getByTestId('option-severity-CRITICAL').click()
    await page.keyboard.press('Escape')
    await expect(bugList.rows()).toHaveCount(2)
    await page.getByTestId('filter-category').click()
    await page.getByTestId('option-category-API').click()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/severity=HIGH&severity=CRITICAL&category=API/)
    await expect(bugList.rows()).toHaveCount(2)
    await expect(page.getByTestId('filter-severity')).toHaveText(/Severity \(2\)/)
  })

  test('sorting by priority orders rows by business rank', async ({ page, bugList }) => {
    await signInAs(page, USERS.pm)
    await bugList.goto()
    await page.getByTestId('sort-priority').click() // desc
    await expect(page).toHaveURL(/sort=priority/)
    const ranks = { Low: 1, Medium: 2, High: 3, Critical: 4 } as Record<string, number>
    const shown = (await bugList.rows().locator('td:nth-child(5)').allInnerTexts()).map((t) => ranks[t.trim()])
    expect(shown).toEqual([...shown].sort((a, b) => b - a))
    await expect(page.getByTestId('sort-priority').locator('..')).toHaveAttribute('aria-sort', 'descending')
  })

  test('bug key search jumps to the exact bug', async ({ page, bugList }) => {
    const api = await Api.login(USERS.tester)
    const bug = await api.createBug({ title: uniqueTitle('Key target') })
    await signInAs(page, USERS.dev)
    await page.getByRole('searchbox', { name: 'Search bugs' }).or(page.getByLabel('Search bugs')).first().fill(bug.key)
    await page.keyboard.press('Enter')
    await expect(bugList.row(bug.key)).toBeVisible()
    await api.dispose()
  })

  test('scope buttons, pagination and empty state', async ({ page, bugList }) => {
    await signInAs(page, USERS.dev)
    await bugList.goto()
    await page.getByTestId('scope-assigned').click()
    await expect(page).toHaveURL(/mine=assigned/)
    await bugList.settled()
    for (const cell of await bugList.rows().locator('td:nth-child(6)').allInnerTexts()) expect(cell).toContain(USERS.dev.name)

    await page.getByTestId('scope-all').click()
    await expect(bugList.range()).toHaveText(/^1–20 of \d+$/)
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(bugList.range()).toHaveText(/^21–/)

    await bugList.search('zzz-no-such-bug-zzz')
    await expect(page.getByTestId('empty-state')).toContainText('No bugs match these filters')
    await page.getByTestId('clear-filters').click()
    await expect(bugList.rows().first()).toBeVisible()
  })
})

test.describe('Dashboard', () => {
  test('PM sees workload; developer sees their own queue instead', async ({ page, asUser }) => {
    await signInAs(page, USERS.pm)
    await expect(page.getByRole('heading', { name: 'Workload by developer' })).toBeVisible()
    await expect(page.getByRole('img', { name: /Raj Mehta: \d+ active/ })).toBeVisible()

    const dev = await asUser(USERS.dev)
    await expect(dev.getByRole('heading', { name: 'Your queue' })).toBeVisible()
    await expect(dev.getByRole('heading', { name: 'Workload by developer' })).toHaveCount(0)
    const api = await Api.login(USERS.dev)
    const mine = await api.get<{ items: { key: string }[] }>('bugs', { assigned_to_me: true, page_size: 100 })
    const shown = await dev.getByTestId('bug-row').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-bug-key')))
    expect(shown.length).toBeGreaterThan(0)
    for (const key of shown) expect(mine.items.map((b) => b.key), 'queue only lists bugs assigned to the developer').toContain(key)
    await api.dispose()
  })

  test('critical KPI matches the API and links to the filtered list', async ({ page, dashboard }) => {
    const api = await Api.login(USERS.pm)
    const s = await api.get<{ critical_open: number }>('dashboard/summary')
    await signInAs(page, USERS.pm)
    await expect(dashboard.kpi('critical')).toContainText(String(s.critical_open))
    await dashboard.kpi('critical').click()
    await expect(page).toHaveURL(/severity=CRITICAL/)
    await expect(page.getByTestId('pagination-range')).toHaveText(new RegExp(`of ${s.critical_open}$`))
    await api.dispose()
  })

  test('trend range buttons change the period shown', async ({ page }) => {
    await signInAs(page, USERS.tester)
    const chart = page.getByRole('img', { name: /^Over \d+ days/ })
    await expect(chart).toHaveAttribute('aria-label', /^Over 30 days/)
    await page.getByRole('button', { name: '14 days' }).click()
    await expect(chart).toHaveAttribute('aria-label', /^Over 14 days/)
    await page.getByRole('button', { name: '90 days' }).click()
    await expect(chart).toHaveAttribute('aria-label', /^Over 90 days/)
  })

  test('recent activity shows a change moments after it happens', async ({ page }) => {
    const api = await Api.login(USERS.tester)
    const bug = await api.createBug({ title: uniqueTitle('Fresh activity') })
    await signInAs(page, USERS.pm)
    await expect(page.getByTestId('activity-feed').locator('li').first()).toContainText(bug.key)
    await api.dispose()
  })
})

test.describe('Notifications and user administration', () => {
  test('opening a notification marks it read and navigates to the bug; mark all clears the badge', async ({ page, notifications, shell }) => {
    const tester = await Api.login(USERS.tester)
    const pm = await Api.login(USERS.pm)
    const bug = await tester.createBug({ title: uniqueTitle('Notify me') })
    await pm.send('post', `bugs/${bug.id}/comments`, { body: 'Please attach the HAR file' })

    await signInAs(page, USERS.tester)
    await notifications.goto()
    const item = notifications.withText(`commented on ${bug.key}`)
    await expect(item).toHaveAttribute('data-read', 'false')
    await item.click()
    await expect(page).toHaveURL(new RegExp(`/bugs/${bug.id}$`))
    await notifications.goto()
    await expect(notifications.withText(`commented on ${bug.key}`)).toHaveAttribute('data-read', 'true')

    await notifications.markAll().click()
    await expect(shell.unreadBadge()).toHaveCount(0)
    await page.getByRole('button', { name: 'Unread', exact: true }).click()
    await expect(page.getByTestId('empty-state')).toContainText('You’re all caught up')
    await Promise.all([tester.dispose(), pm.dispose()])
  })

  test('admin can search users; cancelling deactivation changes nothing; own row is locked', async ({ page, users }) => {
    await signInAs(page, USERS.admin)
    await users.goto()
    await expect(users.row(USERS.admin.email).getByTestId('role-select')).toHaveCount(0)
    await expect(users.row(USERS.admin.email).getByTestId('toggle-active')).toHaveCount(0)

    await page.getByTestId('user-search').fill('fischer')
    await expect(page.getByTestId('user-row')).toHaveCount(1)
    await users.row(USERS.dev2.email).getByTestId('toggle-active').click()
    await expect(page.getByTestId('confirm-dialog')).toContainText('signed out everywhere')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(users.row(USERS.dev2.email)).toContainText('Active')
  })
})
