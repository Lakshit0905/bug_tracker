/**
 * Visual regression for screens whose content does not depend on data. Baselines live next to this file
 * (…-snapshots/). They are platform- and browser-specific, so this project runs on demand rather than in every CI run:
 *   npm run test:visual            # compare
 *   npm run test:visual -- -u      # accept intentional changes
 */
import { expect, signInAs, test } from '../../fixtures/test'
import { USERS } from '../../data/users'

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme}`, () => {
    test.use({ colorScheme: theme, viewport: { width: 1280, height: 800 } })

    test('sign-in page', async ({ page }) => {
      await page.goto('/login')
      await expect(page).toHaveScreenshot(`login-${theme}.png`)
    })

    test('registration with validation errors', async ({ page }) => {
      await page.goto('/register')
      await page.getByTestId('register-submit').click()
      await expect(page).toHaveScreenshot(`register-errors-${theme}.png`)
    })

    test('AI triage (v2.0 introduction) and not-found page', async ({ page }) => {
      await signInAs(page, USERS.tester)
      await page.goto('/ai')
      await expect(page.locator('main')).toHaveScreenshot(`ai-intro-${theme}.png`)
      await page.goto('/no-such-page')
      await expect(page.locator('main')).toHaveScreenshot(`not-found-${theme}.png`)
    })
  })
}
