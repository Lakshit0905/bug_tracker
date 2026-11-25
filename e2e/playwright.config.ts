import { defineConfig, devices } from '@playwright/test'
import { E2E } from './data/env'

/**
 * The suite runs against an isolated stack it starts itself:
 *   backend   :8100  → database bugtracker_e2e (never the dev DB), relaxed rate limits
 *   web (dev) :5174  → Vite dev server proxying /api to :8100            (project: integration)
 *   web (prod):4174  → production build calling :8100 cross-origin (CORS) (project: prod-build)
 * Locally, CHROME_PATH lets Playwright use an installed Chrome instead of downloading browsers.
 */
const chrome = process.env.CHROME_PATH ? { launchOptions: { executablePath: process.env.CHROME_PATH } } : {}

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 45_000,
  expect: { timeout: 8_000, toHaveScreenshot: { maxDiffPixelRatio: 0.001, animations: 'disabled' } },
  fullyParallel: false,
  workers: 1, // one shared database; tests create their own data but role/status changes are global
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
  ],
  globalSetup: './global-setup.ts',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video needs Playwright's ffmpeg download; with a locally installed Chrome (CHROME_PATH) we rely on traces.
    video: process.env.CHROME_PATH ? 'off' : 'retain-on-failure',
    ...chrome,
  },
  projects: [
    {
      name: 'api',
      testMatch: /api\/.*\.spec\.ts/, // black-box API + contract tests (no browser)
    },
    {
      name: 'functional',
      testMatch: /functional\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...chrome, baseURL: E2E.devWebUrl },
    },
    {
      name: 'a11y',
      testMatch: /a11y\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...chrome, baseURL: E2E.devWebUrl },
    },
    {
      name: 'visual',
      testMatch: /visual\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...chrome, baseURL: E2E.devWebUrl },
    },
    {
      name: 'integration',
      testMatch: /integration\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...chrome, baseURL: E2E.devWebUrl },
    },
    {
      name: 'prod-build',
      testMatch: /prod-build\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], ...chrome, baseURL: E2E.prodWebUrl },
    },
  ],
  webServer: [
    {
      name: 'api',
      command: `${E2E.python} -m uvicorn app.main:app --port ${E2E.apiPort}`,
      cwd: '../backend',
      url: `${E2E.apiOrigin}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: E2E.backendEnv,
    },
    {
      name: 'web-dev',
      command: `npx vite --port ${E2E.devWebPort} --strictPort`,
      cwd: '../frontend',
      url: E2E.devWebUrl,
      reuseExistingServer: !process.env.CI,
      env: { VITE_BACKEND_URL: E2E.apiOrigin },
    },
    {
      name: 'web-prod',
      command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${E2E.prodWebPort} --strictPort`,
      cwd: '../frontend',
      url: E2E.prodWebUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { VITE_API_URL: `${E2E.apiOrigin}/api/v1`, VITE_SHOW_DEMO_ACCOUNTS: 'false' },
    },
  ],
})
