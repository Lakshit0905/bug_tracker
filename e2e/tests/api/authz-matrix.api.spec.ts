/**
 * Authorization matrix (docs/01-requirements-analysis.md §3), exercised black-box against the running server.
 * Each cell sends a request that is valid in every other respect, so the only thing that differs between roles
 * is the role itself: an allowed role must NOT get 403, a denied role MUST get 403.
 */
import { expect, test } from '@playwright/test'
import { ContractClient } from '../../fixtures/contract'
import { USERS, uniqueTitle } from '../../data/users'

type Role = 'tester' | 'dev' | 'pm' | 'admin'
const ROLES: Role[] = ['tester', 'dev', 'pm', 'admin']

let clients: Record<Role, ContractClient>
let bugId: number

test.beforeAll(async () => {
  const entries = await Promise.all(ROLES.map(async (r) => [r, await ContractClient.as(USERS[r])] as const))
  clients = Object.fromEntries(entries) as Record<Role, ContractClient>
  bugId = (
    await clients.tester.call<{ id: number }>('POST', '/bugs', {
      json: { title: uniqueTitle('Authz target'), description: 'Target for the authorization matrix.', severity: 'LOW', category: 'UI', steps_to_reproduce: 'x', expected_result: 'y', actual_result: 'z' },
      expect: 201,
    })
  ).body.id
})
test.afterAll(async () => Promise.all(Object.values(clients).map((c) => c.dispose())))

const newBug = () => ({ title: uniqueTitle('Matrix bug'), description: 'Created by the authorization matrix.', severity: 'LOW', category: 'UI', steps_to_reproduce: 'x', expected_result: 'y', actual_result: 'z' })

interface Cell {
  name: string
  allowed: Role[]
  call: (c: ContractClient) => ReturnType<ContractClient['call']>
}

const MATRIX: Cell[] = [
  { name: 'list bugs', allowed: ['tester', 'dev', 'pm', 'admin'], call: (c) => c.call('GET', '/bugs') },
  { name: 'view bug', allowed: ['tester', 'dev', 'pm', 'admin'], call: (c) => c.call('GET', '/bugs/{bug_id}', { path: { bug_id: bugId } }) },
  { name: 'view history', allowed: ['tester', 'dev', 'pm', 'admin'], call: (c) => c.call('GET', '/bugs/{bug_id}/history', { path: { bug_id: bugId } }) },
  { name: 'create bug', allowed: ['tester', 'pm'], call: (c) => c.call('POST', '/bugs', { json: newBug() }) },
  { name: 'set priority', allowed: ['pm'], call: (c) => c.call('PUT', '/bugs/{bug_id}/priority', { path: { bug_id: bugId }, json: { priority: 'LOW' } }) },
  { name: 'assign', allowed: ['pm'], call: (c) => c.call('PUT', '/bugs/{bug_id}/assignee', { path: { bug_id: bugId }, json: { assignee_id: null } }) },
  { name: 'comment', allowed: ['tester', 'dev', 'pm'], call: (c) => c.call('POST', '/bugs/{bug_id}/comments', { path: { bug_id: bugId }, json: { body: 'matrix' } }) },
  { name: 'workload', allowed: ['pm', 'admin'], call: (c) => c.call('GET', '/dashboard/workload') },
  { name: 'reports', allowed: ['pm', 'admin'], call: (c) => c.call('GET', '/dashboard/reports') },
  { name: 'developer list', allowed: ['pm', 'admin'], call: (c) => c.call('GET', '/users/developers') },
  { name: 'user admin: search', allowed: ['admin'], call: (c) => c.call('GET', '/users') },
  { name: 'user admin: view user', allowed: ['admin'], call: (c) => c.call('GET', '/users/{user_id}', { path: { user_id: clients.tester.userId! } }) },
  { name: 'user admin: change role', allowed: ['admin'], call: (c) => c.call('PATCH', '/users/{user_id}/role', { path: { user_id: clients.tester.userId! }, json: { role: 'TESTER' } }) },
  { name: 'user admin: change status', allowed: ['admin'], call: (c) => c.call('PATCH', '/users/{user_id}/status', { path: { user_id: clients.tester.userId! }, json: { is_active: true } }) },
]

for (const cell of MATRIX) {
  for (const role of ROLES) {
    const allowed = cell.allowed.includes(role)
    test(`${cell.name} — ${role} ${allowed ? 'allowed' : 'denied'}`, async () => {
      const res = await cell.call(clients[role])
      if (allowed) expect(res.status, JSON.stringify(res.body)).not.toBe(403)
      else expect(res.status).toBe(403)
      expect(res.status).toBeLessThan(500)
    })
  }
}

test('every protected operation rejects anonymous callers with 401', async () => {
  const anon = await ContractClient.anonymous()
  for (const cell of MATRIX) expect((await cell.call(anon)).status, cell.name).toBe(401)
  await anon.dispose()
})
