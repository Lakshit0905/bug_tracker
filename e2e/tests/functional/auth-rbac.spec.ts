import { expect, signInAs, test } from '../../fixtures/test'
import { arrangeBug } from '../../fixtures/arrange'
import { USERS, type Account } from '../../data/users'

const ROLE_LABEL = { TESTER: 'Tester', DEVELOPER: 'Developer', PROJECT_MANAGER: 'Project manager', ADMIN: 'Administrator' }

test.describe('Login', () => {
  for (const key of ['tester', 'dev', 'pm', 'admin'] as const) {
    test(`${key} signs in through the form and lands on the dashboard`, async ({ page, login, shell, dashboard }) => {
      const user: Account = USERS[key]
      await login.goto()
      await login.signIn(user.email, user.password)
      await expect(page).toHaveURL(/\/$/)
      await expect(dashboard.rail()).toBeVisible()
      await expect(shell.roleLabel()).toHaveText(ROLE_LABEL[user.role])
    })
  }

  test('wrong password shows a clear error and stays on the form', async ({ page, login }) => {
    await login.goto()
    await login.signIn(USERS.tester.email, 'Wrong-password1')
    await expect(login.error()).toHaveText('Invalid email or password')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('sign-in button is disabled until both fields are filled', async ({ login }) => {
    await login.goto()
    await expect(login.submit()).toBeDisabled()
    await login.email().fill(USERS.tester.email)
    await expect(login.submit()).toBeDisabled()
    await login.password().fill('x')
    await expect(login.submit()).toBeEnabled()
  })

  test('a signed-in user who opens /login is sent to the dashboard', async ({ page }) => {
    await signInAs(page, USERS.tester)
    await page.goto('/login')
    await expect(page).toHaveURL(/\/$/)
  })

  test('registration validates fields before calling the server', async ({ page }) => {
    await page.goto('/register')
    await page.getByTestId('register-name').fill('A')
    await page.getByTestId('register-email').fill('not-an-email')
    await page.getByTestId('register-password').fill('short')
    await page.getByTestId('register-confirm').fill('different')
    const calls: string[] = []
    page.on('request', (r) => r.url().includes('/auth/register') && calls.push(r.url()))
    await page.getByTestId('register-submit').click()
    for (const msg of ['Enter your name', 'Enter a valid email address.', 'Use at least 8 characters.', 'Passwords don’t match.'])
      await expect(page.getByText(msg, { exact: false })).toBeVisible()
    expect(calls).toEqual([])
  })
})

test.describe('Role-based access in the UI', () => {
  const NAV: Record<string, string[]> = {
    tester: ['dashboard', 'bugs', 'ai-triage', 'notifications'],
    dev: ['dashboard', 'bugs', 'notifications'],
    pm: ['dashboard', 'bugs', 'ai-triage', 'notifications', 'reports'],
    admin: ['dashboard', 'bugs', 'notifications', 'reports', 'users'],
  }
  const ALL = ['dashboard', 'bugs', 'ai-triage', 'notifications', 'reports', 'users']

  for (const [role, visible] of Object.entries(NAV)) {
    test(`${role}: navigation shows exactly the permitted sections`, async ({ page, shell }) => {
      await signInAs(page, USERS[role as keyof typeof USERS])
      for (const item of ALL) await expect(shell.nav(item), item).toHaveCount(visible.includes(item) ? 1 : 0)
      await expect(page.getByTestId('report-bug')).toHaveCount(['tester', 'pm'].includes(role) ? 1 : 0)
    })
  }

  for (const [role, path] of [['tester', '/users'], ['dev', '/reports'], ['dev', '/bugs/new'], ['admin', '/bugs/new'], ['tester', '/reports']] as const) {
    test(`${role} opening ${path} directly sees an access message and no data request is made`, async ({ page }) => {
      await signInAs(page, USERS[role])
      const forbidden: string[] = []
      page.on('response', (r) => r.status() === 403 && forbidden.push(r.url()))
      await page.goto(path)
      await expect(page.getByText('This page isn’t available for your role')).toBeVisible()
      expect(forbidden).toEqual([])
    })
  }

  test('edit, assignee and priority controls follow ownership and role', async ({ page, bugDetail, asUser }) => {
    const bug = await arrangeBug('NEW') // reported by Tina (USERS.tester)

    await signInAs(page, USERS.tester)
    await bugDetail.goto(bug.id)
    await expect(page.getByTestId('edit-bug'), 'reporter can edit while NEW').toBeVisible()
    await expect(bugDetail.assignee()).toHaveCount(0)
    await expect(bugDetail.priority()).toHaveCount(0)

    const other = await asUser(USERS.tester2)
    await other.po.bugDetail.goto(bug.id)
    await expect(other.getByTestId('edit-bug'), 'another tester cannot edit').toHaveCount(0)

    const pm = await asUser(USERS.pm)
    await pm.po.bugDetail.goto(bug.id)
    await expect(pm.getByTestId('edit-bug')).toBeVisible()
    await expect(pm.po.bugDetail.assignee()).toBeVisible()
    await expect(pm.po.bugDetail.priority()).toBeVisible()

    const admin = await asUser(USERS.admin)
    await admin.po.bugDetail.goto(bug.id)
    await expect(admin.getByTestId('edit-bug')).toHaveCount(0)
    await expect(admin.getByTestId('comment-form'), 'admins cannot comment').toHaveCount(0)
  })
})
