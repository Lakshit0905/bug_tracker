import { USERS, uniqueTitle } from '../data/users'
import { Api } from './api'

export type Status = 'NEW' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'REOPENED' | 'CLOSED'

const PATH: Record<Status, [actor: 'pm' | 'dev' | 'tester' | 'assign', to?: string][]> = {
  NEW: [],
  OPEN: [['pm', 'OPEN'], ['assign']],
  IN_PROGRESS: [['pm', 'OPEN'], ['assign'], ['dev', 'IN_PROGRESS']],
  RESOLVED: [['pm', 'OPEN'], ['assign'], ['dev', 'IN_PROGRESS'], ['dev', 'RESOLVED']],
  REOPENED: [['pm', 'OPEN'], ['assign'], ['dev', 'IN_PROGRESS'], ['dev', 'RESOLVED'], ['tester', 'REOPENED']],
  CLOSED: [['pm', 'OPEN'], ['assign'], ['dev', 'IN_PROGRESS'], ['dev', 'RESOLVED'], ['tester', 'CLOSED']],
}

/**
 * Create a bug (reported by Tina, the demo tester) and drive it to `status` through the real API, so UI tests can
 * start from any lifecycle state. From OPEN onwards the assignee is Raj (USERS.dev), as in the real triage flow.
 */
export async function arrangeBug(status: Status, overrides: Record<string, unknown> = {}) {
  const [tester, pm, dev] = await Promise.all([Api.login(USERS.tester), Api.login(USERS.pm), Api.login(USERS.dev)])
  const actors = { tester, pm, dev }
  const bug = await tester.createBug({ title: uniqueTitle(`Arranged ${status.toLowerCase()} bug`), ...overrides })
  for (const [who, to] of PATH[status]) {
    if (who === 'assign') await pm.send('put', `bugs/${bug.id}/assignee`, { assignee_id: dev.userId })
    else
      await actors[who].send('post', `bugs/${bug.id}/transitions`, {
        to_status: to,
        ...(to === 'RESOLVED' ? { resolution_notes: 'Fixed for the test' } : {}),
        ...(to === 'REOPENED' ? { reason: 'Reopened for the test' } : {}),
      })
  }
  await Promise.all([tester.dispose(), pm.dispose(), dev.dispose()])
  return bug
}
