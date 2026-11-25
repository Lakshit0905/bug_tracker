import { Api } from '../../fixtures/api'
import { expect, signInAs, test } from '../../fixtures/test'
import { USERS, uniqueTitle } from '../../data/users'

test.describe('Cross-role bug lifecycle', () => {
  test('a bug travels from report to verified fix through tester, PM and developer', async ({ page, bugForm, bugDetail, asUser }) => {
    const title = uniqueTitle('Checkout total ignores discount code')

    // --- Tester reports the bug through the form -------------------------------------------------------------
    await signInAs(page, USERS.tester)
    await bugForm.goto()
    await bugForm.fill({
      title,
      description: 'The order total does not change after applying a valid discount code.',
      severity: 'HIGH',
      category: 'BACKEND',
      steps: '1. Add any item\n2. Apply code SAVE10\n3. Look at the total',
      expected: 'Total is reduced by 10%',
      actual: 'Total is unchanged',
      environment: 'Chrome 131 / staging',
    })
    await bugForm.submit().click()
    await bugDetail.expectStatus('NEW')
    const id = bugDetail.id()
    const key = (await bugDetail.key().textContent())!.trim()
    await expect(bugDetail.title()).toHaveText(title)
    await expect(bugDetail.actions(), 'a tester cannot triage').toHaveCount(0)

    // --- Project manager triages, prioritises and assigns -----------------------------------------------------
    const pm = await asUser(USERS.pm)
    await pm.po.bugDetail.goto(id)
    await pm.po.bugDetail.move('OPEN')
    await pm.po.bugDetail.priority().selectOption('HIGH')
    await expect(pm.getByTestId('toast').filter({ hasText: 'Priority set to High' })).toBeVisible()
    await pm.po.bugDetail.assignee().selectOption({ label: USERS.dev.name })
    await expect(pm.getByTestId('toast').filter({ hasText: `Assigned to ${USERS.dev.name}` })).toBeVisible()

    // --- Developer is notified, starts work, attaches evidence, comments and resolves ------------------------
    const dev = await asUser(USERS.dev)
    await dev.po.notifications.goto()
    const assignment = dev.po.notifications.withText(`assigned ${key} to you`)
    await expect(assignment).toBeVisible()
    await expect(assignment).toHaveAttribute('data-read', 'false')
    await assignment.click()
    await expect(dev).toHaveURL(new RegExp(`/bugs/${id}$`))
    await dev.po.bugDetail.move('IN_PROGRESS')
    await dev.po.bugDetail.upload({ name: 'checkout-trace.log', mimeType: 'text/plain', buffer: Buffer.from('discount=0 applied after tax\n') })
    await dev.po.bugDetail.comment('Root cause: discount applied after tax rounding.')
    await dev.po.bugDetail.move('RESOLVED', 'Apply the discount before tax; added a unit test for SAVE10.')
    await expect(dev.po.bugDetail.resolutionNotes()).toContainText('Apply the discount before tax')

    // --- Tester verifies, finds a gap and reopens with a reason ----------------------------------------------
    await bugDetail.goto(id)
    await bugDetail.move('REOPENED', 'Still wrong for 100% discount codes.')
    await expect(bugDetail.comments().filter({ hasText: 'Reopened: Still wrong for 100% discount codes.' })).toBeVisible()

    // --- Developer resumes and resolves again; tester closes ------------------------------------------------
    await dev.po.bugDetail.goto(id)
    await dev.po.bugDetail.move('IN_PROGRESS')
    await dev.po.bugDetail.move('RESOLVED', 'Clamp totals at zero for full discounts.')
    await bugDetail.goto(id)
    await bugDetail.move('CLOSED')
    await expect(page.getByTestId('edit-bug'), 'closed bugs are read-only').toHaveCount(0)
    await expect(bugDetail.actions().getByRole('button')).toHaveText(['Reopen'])

    // --- What reached the database ----------------------------------------------------------------------------
    const api = await Api.login(USERS.pm)
    const bug = await api.get<{ status: string; priority: string; assignee: { email: string }; resolution_notes: string; closed_at: string | null }>(`bugs/${id}`)
    expect(bug).toMatchObject({ status: 'CLOSED', priority: 'HIGH', resolution_notes: 'Clamp totals at zero for full discounts.' })
    expect(bug.assignee.email).toBe(USERS.dev.email)
    expect(bug.closed_at).not.toBeNull()

    const history = await api.get<{ action: string; old_value: string | null; new_value: string | null }[]>(`bugs/${id}/history`)
    expect(history.filter((h) => h.action === 'STATUS_CHANGED').map((h) => `${h.old_value}>${h.new_value}`)).toEqual([
      'NEW>OPEN', 'OPEN>IN_PROGRESS', 'IN_PROGRESS>RESOLVED', 'RESOLVED>REOPENED', 'REOPENED>IN_PROGRESS', 'IN_PROGRESS>RESOLVED', 'RESOLVED>CLOSED',
    ])
    expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(['CREATED', 'PRIORITY_CHANGED', 'ASSIGNED', 'ATTACHMENT_ADDED', 'COMMENT_ADDED']))
    const attachments = await api.get<{ original_filename: string; content_type: string }[]>(`bugs/${id}/attachments`)
    expect(attachments).toEqual([expect.objectContaining({ original_filename: 'checkout-trace.log', content_type: 'text/plain' })])
    await api.dispose()

    // --- The reporter was kept informed -----------------------------------------------------------------------
    await page.goto('/notifications')
    await expect(page.getByTestId('notification').filter({ hasText: `${key} from RESOLVED to CLOSED` })).toHaveCount(0) // own action: no notification
    await expect(page.getByTestId('notification').filter({ hasText: `moved ${key} from IN_PROGRESS to RESOLVED` })).toHaveCount(2)
  })

  test('a developer who is not the assignee is offered no workflow actions', async ({ page, bugDetail }) => {
    const pm = await Api.login(USERS.pm)
    const tester = await Api.login(USERS.tester)
    const bug = await tester.createBug({ title: uniqueTitle('Assigned elsewhere') })
    await pm.send('post', `bugs/${bug.id}/transitions`, { to_status: 'OPEN' })
    await pm.send('put', `bugs/${bug.id}/assignee`, { assignee_id: await pm.get<{ id: number; email: string }[]>('users/developers').then((d) => d.find((u) => u.email === USERS.dev2.email)!.id) })

    await signInAs(page, USERS.dev)
    await bugDetail.goto(bug.id)
    await bugDetail.expectStatus('OPEN')
    await expect(bugDetail.actions()).toHaveCount(0)
    await expect(bugDetail.assignee(), 'developers cannot reassign').toHaveCount(0)
    await Promise.all([pm.dispose(), tester.dispose()])
  })
})
