/**
 * Automated accessibility scans (axe-core, WCAG 2.1 A/AA rules) of every page in light and dark themes.
 * Any "serious" or "critical" violation fails the test; the report lists each rule, impact and affected nodes.
 */
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { arrangeBug } from '../../fixtures/arrange'
import { expect, signInAs, test } from '../../fixtures/test'
import { USERS } from '../../data/users'

async function scan(page: Page, label: string) {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(700) // let the one-off rail animation finish
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  const summary = blocking.map((v) => `${v.id} [${v.impact}] ×${v.nodes.length}: ${v.help}\n    e.g. ${v.nodes[0]?.target.join(' ')} — ${v.nodes[0]?.failureSummary?.split('\n').slice(1, 2).join(' ').trim()}`)
  expect(summary, `${label}: serious/critical accessibility violations`).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme })

    test('sign-in and registration', async ({ page }) => {
      await page.goto('/login')
      await scan(page, 'login')
      await page.goto('/register')
      await page.getByTestId('register-submit').click() // include the error state
      await scan(page, 'register with errors')
    })

    test('dashboard, bug list and reports (project manager)', async ({ page }) => {
      await signInAs(page, USERS.pm)
      await scan(page, 'dashboard')
      await page.goto('/bugs')
      await scan(page, 'bug list')
      await page.goto('/reports')
      await scan(page, 'reports')
    })

    test('bug details, report form and notifications (tester)', async ({ page }) => {
      const bug = await arrangeBug('RESOLVED')
      await signInAs(page, USERS.tester)
      await page.goto(`/bugs/${bug.id}`)
      await scan(page, 'bug detail')
      await page.getByTestId('transition-REOPENED').click()
      await scan(page, 'reopen dialog')
      await page.keyboard.press('Escape')
      await page.goto('/bugs/new')
      await page.getByTestId('submit-bug').click()
      await scan(page, 'report form with errors')
      await page.goto('/notifications')
      await scan(page, 'notifications')
      await page.goto('/profile')
      await scan(page, 'profile')
    })

    test('user management (admin)', async ({ page }) => {
      await signInAs(page, USERS.admin)
      await page.goto('/users')
      await scan(page, 'users')
    })
  })
}

test('the app is fully usable from the keyboard: skip link, menu and dialog', async ({ page }) => {
  await signInAs(page, USERS.pm)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#main$/)
  await page.getByTestId('user-menu').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
})
