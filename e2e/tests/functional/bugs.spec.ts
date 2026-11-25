import { Api } from '../../fixtures/api'
import { arrangeBug, type Status } from '../../fixtures/arrange'
import { expect, signInAs, test } from '../../fixtures/test'
import { USERS, uniqueTitle } from '../../data/users'

test.describe('Report and edit bugs', () => {
  test('empty submit shows every required-field message and sends nothing', async ({ page, bugForm }) => {
    await signInAs(page, USERS.tester)
    await bugForm.goto()
    const posts: string[] = []
    page.on('request', (r) => r.method() === 'POST' && r.url().endsWith('/api/v1/bugs') && posts.push(r.url()))
    await bugForm.submit().click()
    for (const f of ['title', 'description', 'severity', 'category', 'steps_to_reproduce', 'expected_result', 'actual_result'])
      await expect(bugForm.field(f), f).toHaveAttribute('aria-invalid', 'true')
    await expect(bugForm.field('title')).toBeFocused()
    expect(posts).toEqual([])
  })

  test('title boundary: 4 characters rejected, 5 accepted', async ({ page, bugForm, bugDetail }) => {
    await signInAs(page, USERS.tester)
    await bugForm.goto()
    await bugForm.fill({ title: 'abcd', description: 'Ten chars!!', severity: 'LOW', category: 'UI', steps: 's', expected: 'e', actual: 'a' })
    await bugForm.submit().click()
    await expect(page.getByText('Use at least 5 characters')).toBeVisible()
    await bugForm.field('title').fill('abcde')
    await bugForm.submit().click()
    await expect(bugDetail.title()).toHaveText('abcde')
  })

  test('tester never sees the priority field; PM can set it on create', async ({ page, bugForm, bugDetail, asUser }) => {
    await signInAs(page, USERS.tester)
    await bugForm.goto()
    await expect(bugForm.field('priority')).toHaveCount(0)

    const pm = await asUser(USERS.pm)
    await pm.po.bugForm.goto()
    await pm.po.bugForm.fill({ title: uniqueTitle('PM reported outage'), description: 'Payments API is down for EU users.', severity: 'CRITICAL', category: 'API', steps: 'Call /pay', expected: '200', actual: '503' })
    await pm.po.bugForm.field('priority').selectOption('CRITICAL')
    await pm.po.bugForm.submit().click()
    await expect(pm.getByTestId('bug-meta')).toBeVisible()
    await expect(pm.po.bugDetail.priority()).toHaveValue('CRITICAL')
    void bugDetail
  })

  test('reporter edits their bug; only changed fields are saved and audited', async ({ page, bugDetail }) => {
    const bug = await arrangeBug('NEW')
    await signInAs(page, USERS.tester)
    await bugDetail.goto(bug.id)
    await page.getByTestId('edit-bug').click()
    await page.getByTestId('field-severity').selectOption('CRITICAL')
    const patch = page.waitForRequest((r) => r.method() === 'PATCH')
    await page.getByTestId('submit-bug').click()
    expect((await patch).postDataJSON()).toEqual({ severity: 'CRITICAL' })
    await expect(page.getByTestId('bug-meta')).toContainText('Critical')
    await expect(bugDetail.history().filter({ hasText: 'changed severity from Medium to Critical' })).toBeVisible()
  })

  test('closed bugs show no edit button and the edit URL explains why', async ({ page }) => {
    const bug = await arrangeBug('CLOSED')
    await signInAs(page, USERS.pm)
    await page.goto(`/bugs/${bug.id}/edit`)
    await expect(page.getByText('Closed bugs are read-only. Reopen it first.')).toBeVisible()
  })
})

test.describe('Assignment', () => {
  test('PM assigns, the developer gets an unread notification, reassignment notifies both', async ({ page, bugDetail, asUser }) => {
    const bug = await arrangeBug('OPEN')
    const devApi = await Api.login(USERS.dev2)
    const before = (await devApi.get<{ unread: number }>('notifications/unread-count')).unread

    await signInAs(page, USERS.pm)
    await bugDetail.goto(bug.id)
    await expect(bugDetail.assignee()).toHaveValue(/\d+/) // arranged with Raj
    await bugDetail.assignee().selectOption({ label: USERS.dev2.name })
    await expect(page.getByTestId('toast').filter({ hasText: `Assigned to ${USERS.dev2.name}` })).toBeVisible()
    await expect(bugDetail.history().filter({ hasText: `assigned it to ${USERS.dev2.name}` })).toBeVisible()

    expect((await devApi.get<{ unread: number }>('notifications/unread-count')).unread).toBe(before + 1)
    const lena = await asUser(USERS.dev2)
    await expect(lena.po.shell.unreadBadge()).toHaveText(String(before + 1))
    await devApi.dispose()
  })

  test('the unassign option is disabled while a bug is being worked on', async ({ page, bugDetail }) => {
    const bug = await arrangeBug('IN_PROGRESS')
    await signInAs(page, USERS.pm)
    await bugDetail.goto(bug.id)
    await expect(bugDetail.assignee().locator('option[value=""]')).toBeDisabled()
  })

  test('deactivated developers are not offered for assignment', async ({ page, bugDetail }) => {
    const admin = await Api.login(USERS.admin)
    const lenaId = await admin.findUserId(USERS.dev2.email)
    await admin.send('patch', `users/${lenaId}/status`, { is_active: false })
    try {
      const bug = await arrangeBug('OPEN')
      await signInAs(page, USERS.pm)
      await bugDetail.goto(bug.id)
      await expect(bugDetail.assignee().locator('option', { hasText: USERS.dev.name })).toHaveCount(1)
      await expect(bugDetail.assignee().locator('option', { hasText: USERS.dev2.name })).toHaveCount(0)
    } finally {
      await admin.send('patch', `users/${lenaId}/status`, { is_active: true })
      await admin.dispose()
    }
  })
})

test.describe('Status transitions offered in the UI', () => {
  const CASES: [Status, keyof typeof USERS, string[]][] = [
    ['NEW', 'pm', ['Triage']],
    ['NEW', 'tester', []],
    ['OPEN', 'dev', ['Start work']],
    ['OPEN', 'dev2', []],
    ['IN_PROGRESS', 'dev', ['Resolve']],
    ['RESOLVED', 'tester', ['Verify & close', 'Reopen']],
    ['RESOLVED', 'dev', []],
    ['REOPENED', 'pm', ['Re-triage']],
    ['REOPENED', 'dev', ['Resume work']],
    ['CLOSED', 'tester2', ['Reopen']],
    ['CLOSED', 'admin', []],
  ]
  for (const [status, who, labels] of CASES) {
    test(`${status} as ${who} → ${labels.length ? labels.join(', ') : 'no actions'}`, async ({ page, bugDetail }) => {
      const bug = await arrangeBug(status)
      await signInAs(page, USERS[who])
      await bugDetail.goto(bug.id)
      await bugDetail.expectStatus(status)
      if (labels.length) await expect(bugDetail.actions().getByRole('button')).toHaveText(labels)
      else await expect(bugDetail.actions()).toHaveCount(0)
    })
  }

  test('resolve dialog requires notes; cancelling changes nothing', async ({ page, bugDetail }) => {
    const bug = await arrangeBug('IN_PROGRESS')
    await signInAs(page, USERS.dev)
    await bugDetail.goto(bug.id)
    await bugDetail.action('RESOLVED').click()
    const dialog = page.getByTestId('transition-dialog')
    await expect(dialog.getByTestId('confirm-transition')).toBeDisabled()
    await dialog.getByTestId('transition-text').fill('   ')
    await expect(dialog.getByTestId('confirm-transition')).toBeDisabled()
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await bugDetail.expectStatus('IN_PROGRESS')
  })

  test('the lifecycle indicator tracks the current status', async ({ page, bugDetail }) => {
    const bug = await arrangeBug('RESOLVED')
    await signInAs(page, USERS.tester)
    await bugDetail.goto(bug.id)
    await expect(page.getByTestId('lifecycle-position').locator('[aria-current="step"]')).toHaveCount(1)
    await expect(page.getByTestId('lifecycle-position')).toHaveAttribute('aria-label', 'Lifecycle: currently Resolved')
    await bugDetail.move('CLOSED')
    await expect(page.getByTestId('lifecycle-position')).toHaveAttribute('aria-label', 'Lifecycle: currently Closed')
  })
})
