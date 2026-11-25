import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const apiPort = Number(process.env.E2E_API_PORT ?? 8100)
const devWebPort = Number(process.env.E2E_WEB_PORT ?? 5174)
const prodWebPort = Number(process.env.E2E_PROD_WEB_PORT ?? 4174)

/** Test-only database. Override E2E_DATABASE_URL in CI; the default matches backend/README.md local setup. */
const databaseUrl = process.env.E2E_DATABASE_URL ?? 'postgresql+psycopg://bugtracker:devpass@localhost:5432/bugtracker_e2e'

export const E2E = {
  apiPort,
  devWebPort,
  prodWebPort,
  apiOrigin: `http://localhost:${apiPort}`,
  apiBase: `http://localhost:${apiPort}/api/v1`,
  devWebUrl: `http://localhost:${devWebPort}`,
  prodWebUrl: `http://localhost:${prodWebPort}`,
  python: process.env.E2E_PYTHON ?? path.resolve(here, '../../backend/.venv/bin/python'),
  backendDir: path.resolve(here, '../../backend'),
  databaseUrl,
  backendEnv: {
    APP_ENV: 'development',
    DATABASE_URL: databaseUrl,
    AUTH_RATE_LIMIT_PER_MINUTE: '1000',
    REFRESH_RATE_LIMIT_PER_MINUTE: '1000',
    CORS_ORIGINS: `http://localhost:${devWebPort},http://localhost:${prodWebPort}`,
    UPLOAD_DIR: path.resolve(here, '../.uploads'),
    LOG_LEVEL: 'WARNING',
    ADMIN_EMAIL: 'admin@bugtrackr.dev',
    ADMIN_PASSWORD: 'Admin12345',
    ADMIN_FULL_NAME: 'Ada Admin',
  } as Record<string, string>,
}
