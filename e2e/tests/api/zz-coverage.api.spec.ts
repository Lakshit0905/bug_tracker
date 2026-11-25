/**
 * Runs last in the api project (alphabetical order, one worker): compares the operations the suite actually
 * called with every operation in the OpenAPI document and writes reports/api-coverage.md.
 */
import { expect, test } from '@playwright/test'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OPS_LOG, allOperations, loadSpec } from '../../fixtures/contract'

test('every documented API operation is exercised by the black-box suite', async () => {
  await loadSpec()
  const called = new Map<string, number>()
  if (existsSync(OPS_LOG)) {
    for (const line of readFileSync(OPS_LOG, 'utf8').split('\n').filter(Boolean)) {
      const op = JSON.parse(line).op as string
      called.set(op, (called.get(op) ?? 0) + 1)
    }
  }
  const ops = allOperations()
  const missing = ops.filter((o) => !called.has(o))
  const rows = ops.map((o) => `| \`${o}\` | ${called.get(o) ?? 0} | ${called.has(o) ? '✅' : '❌'} |`)
  const pct = Math.round(((ops.length - missing.length) / ops.length) * 100)
  writeFileSync(
    path.resolve(path.dirname(OPS_LOG), 'api-coverage.md'),
    `# API operation coverage\n\n${ops.length - missing.length}/${ops.length} operations (${pct}%) exercised.\n\n| Operation | Calls | Covered |\n|---|---|---|\n${rows.join('\n')}\n`,
  )
  expect(missing, 'operations never called by the API suite').toEqual([])
})
