import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { OPS_LOG } from './fixtures/contract'
import { E2E } from './data/env'

/** Rebuild the e2e database from migrations and load the demo team, so every run starts from the same state. */
export default function globalSetup() {
  rmSync(OPS_LOG, { force: true }) // fresh endpoint-coverage log for this run
  const run = (...args: string[]) =>
    execFileSync(E2E.python, args, {
      cwd: E2E.backendDir,
      env: { ...process.env, ...E2E.backendEnv },
      stdio: ['ignore', 'pipe', 'inherit'],
    }).toString()

  // Full rebuild (all tables, users included) so every run starts from an identical state — previously only bugs
  // were reset and accounts created by earlier runs accumulated (defect P8-1). Also re-verifies the migrations.
  run('-m', 'alembic', 'downgrade', 'base')
  run('-m', 'alembic', 'upgrade', 'head')
  process.stdout.write(run('-m', 'scripts.seed_demo', '--reset'))
  process.stdout.write(run('-m', 'scripts.seed_admin'))
}
