import { expect, test } from '@playwright/test'
import { ContractClient } from '../../fixtures/contract'
import { USERS, uniqueTitle } from '../../data/users'

type BugOut = { id: number; key: string; status: string; priority: string; title: string; assignee: { id: number } | null; resolved_at: string | null; closed_at: string | null }

const payload = (over: Record<string, unknown> = {}) => ({
  title: uniqueTitle('API bug'),
  description: 'Created by the black-box API suite.',
  severity: 'MEDIUM',
  category: 'API',
  steps_to_reproduce: '1. Call the endpoint',
  expected_result: '200',
  actual_result: '500',
  ...over,
})

let tester: ContractClient, pm: ContractClient, dev: ContractClient, dev2: ContractClient, admin: ContractClient
let devId: number

test.beforeAll(async () => {
  ;[tester, pm, dev, dev2, admin] = await Promise.all([USERS.tester, USERS.pm, USERS.dev, USERS.dev2, USERS.admin].map((u) => ContractClient.as(u)))
  devId = dev.userId!
})
test.afterAll(async () => Promise.all([tester, pm, dev, dev2, admin].map((c) => c.dispose())))

test.describe('Bug CRUD', () => {
  test('create returns 201 with Location, key and defaults', async () => {
    const res = await tester.call<BugOut>('POST', '/bugs', { json: payload(), expect: 201 })
    expect(res.headers.location).toBe(`/api/v1/bugs/${res.body.id}`)
    expect(res.body).toMatchObject({ key: `BUG-${res.body.id}`, status: 'NEW', priority: 'MEDIUM', assignee: null })
    await tester.call('GET', '/bugs/{bug_id}', { path: { bug_id: res.body.id }, expect: 200 })
  })

  for (const [field, value] of [['title', 'abcd'], ['title', 'x'.repeat(201)], ['description', 'short'], ['severity', 'BLOCKER'], ['category', 'FRONTEND'], ['status', 'CLOSED']] as const) {
    test(`create rejects ${field}=${String(value).slice(0, 12)} with 422`, async () => {
      const res = await tester.call<{ error: { code: string; details: { loc: string[] }[] } }>('POST', '/bugs', { json: payload({ [field]: value }), expect: 422 })
      expect(res.body.error.details.map((d) => d.loc.at(-1))).toContain(field)
    })
  }

  test('only PMs may set priority on create', async () => {
    const res = await tester.call<{ error: { code: string } }>('POST', '/bugs', { json: payload({ priority: 'CRITICAL' }), expect: 403 })
    expect(res.body.error.code).toBe('PRIORITY_NOT_PERMITTED')
    expect((await pm.call<BugOut>('POST', '/bugs', { json: payload({ priority: 'CRITICAL' }), expect: 201 })).body.priority).toBe('CRITICAL')
  })

  test('edit: reporter while NEW, other tester forbidden, PM allowed, empty patch 422', async () => {
    const bug = (await tester.call<BugOut>('POST', '/bugs', { json: payload(), expect: 201 })).body
    await tester.call('PATCH', '/bugs/{bug_id}', { path: { bug_id: bug.id }, json: { environment: 'Firefox 133' }, expect: 200 })
    const other = await ContractClient.as(USERS.tester2)
    const res = await other.call<{ error: { code: string } }>('PATCH', '/bugs/{bug_id}', { path: { bug_id: bug.id }, json: { title: 'Hijacked title' }, expect: 403 })
    expect(res.body.error.code).toBe('NOT_REPORTER')
    await other.dispose()
    await pm.call('PATCH', '/bugs/{bug_id}', { path: { bug_id: bug.id }, json: { severity: 'HIGH' }, expect: 200 })
    await pm.call('PATCH', '/bugs/{bug_id}', { path: { bug_id: bug.id }, json: {}, expect: 422 })
    await pm.call('PATCH', '/bugs/{bug_id}', { path: { bug_id: 99999999 }, json: { title: 'Nothing here' }, expect: 404 })
  })

  test('priority and assignment are PM-only and validated', async () => {
    const bug = (await tester.call<BugOut>('POST', '/bugs', { json: payload(), expect: 201 })).body
    await tester.call('PUT', '/bugs/{bug_id}/priority', { path: { bug_id: bug.id }, json: { priority: 'HIGH' }, expect: 403 })
    expect((await pm.call<BugOut>('PUT', '/bugs/{bug_id}/priority', { path: { bug_id: bug.id }, json: { priority: 'HIGH' }, expect: 200 })).body.priority).toBe('HIGH')
    await pm.call('PUT', '/bugs/{bug_id}/priority', { path: { bug_id: bug.id }, json: { priority: 'URGENT' }, expect: 422 })

    const bad = await pm.call<{ error: { code: string } }>('PUT', '/bugs/{bug_id}/assignee', { path: { bug_id: bug.id }, json: { assignee_id: tester.userId }, expect: 422 })
    expect(bad.body.error.code).toBe('INVALID_ASSIGNEE')
    expect((await pm.call<BugOut>('PUT', '/bugs/{bug_id}/assignee', { path: { bug_id: bug.id }, json: { assignee_id: devId }, expect: 200 })).body.assignee!.id).toBe(devId)
    await dev.call('PUT', '/bugs/{bug_id}/assignee', { path: { bug_id: bug.id }, json: { assignee_id: dev2.userId }, expect: 403 })
    expect((await pm.call<BugOut>('PUT', '/bugs/{bug_id}/assignee', { path: { bug_id: bug.id }, json: { assignee_id: null }, expect: 200 })).body.assignee).toBeNull()
  })
})

test.describe('Search', () => {
  test('filters combine and totals agree with returned items', async () => {
    const marker = uniqueTitle('Searchmarker')
    for (const sev of ['LOW', 'HIGH', 'HIGH']) await tester.call('POST', '/bugs', { json: payload({ title: `${marker} ${sev}`, severity: sev, category: 'SECURITY' }), expect: 201 })
    const all = await pm.call<{ total: number; items: BugOut[] }>('GET', '/bugs', { query: { q: marker }, expect: 200 })
    expect(all.body.total).toBe(3)
    const high = await pm.call<{ total: number; items: { severity: string }[] }>('GET', '/bugs', { query: { q: marker, severity: 'HIGH', category: 'SECURITY' }, expect: 200 })
    expect(high.body.total).toBe(2)
    const paged = await pm.call<{ total: number; items: unknown[]; page: number }>('GET', '/bugs', { query: { q: marker, page_size: 2, page: 2 }, expect: 200 })
    expect([paged.body.total, paged.body.items.length, paged.body.page]).toEqual([3, 1, 2])
  })

  test('bug key search and literal wildcard characters', async () => {
    const bug = (await tester.call<BugOut>('POST', '/bugs', { json: payload({ title: uniqueTitle('100% CPU_usage') }), expect: 201 })).body
    const byKey = await pm.call<{ items: BugOut[] }>('GET', '/bugs', { query: { q: bug.key }, expect: 200 })
    expect(byKey.body.items.map((b) => b.id)).toContain(bug.id)
    const pct = await pm.call<{ items: BugOut[] }>('GET', '/bugs', { query: { q: '100% CPU_usage' }, expect: 200 })
    expect(pct.body.items.every((b) => b.title.includes('100% CPU_usage'))).toBe(true)
  })

  test('priority sort uses business rank', async () => {
    const res = await pm.call<{ items: { priority: string }[] }>('GET', '/bugs', { query: { sort: 'priority', order: 'desc', page_size: 100 }, expect: 200 })
    const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as Record<string, number>
    const ranks = res.body.items.map((b) => rank[b.priority])
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a))
  })

  for (const query of [{ page: 0 }, { page_size: 101 }, { status: "DONE" }, { sort: "reporter" }, { created_from: "2026-02-01", created_to: "2026-01-01" }] as Record<string, string | number>[]) {
    test(`invalid search ${JSON.stringify(query)} → 422`, async () => {
      await pm.call('GET', '/bugs', { query, expect: 422 })
    })
  }
})

test.describe('Workflow', () => {
  test('full lifecycle with timestamps, allowed-transitions and error codes', async () => {
    const id = (await tester.call<BugOut>('POST', '/bugs', { json: payload(), expect: 201 })).body.id
    const t = (c: ContractClient, to: string, extra: Record<string, string> = {}, expectStatus = 200) =>
      c.call<BugOut & { error: { code: string; details: { allowed_targets: string[] } } }>('POST', '/bugs/{bug_id}/transitions', { path: { bug_id: id }, json: { to_status: to, ...extra }, expect: expectStatus })

    expect((await t(pm, 'CLOSED', {}, 409)).body.error.details.allowed_targets).toEqual(['OPEN'])
    expect((await t(tester, 'OPEN', {}, 403)).body.error.code).toBe('TRANSITION_NOT_PERMITTED')
    await t(pm, 'OPEN')
    expect((await t(dev, 'IN_PROGRESS', {}, 409)).body.error.code).toBe('ASSIGNEE_REQUIRED')
    await pm.call('PUT', '/bugs/{bug_id}/assignee', { path: { bug_id: id }, json: { assignee_id: devId }, expect: 200 })
    expect((await t(dev2, 'IN_PROGRESS', {}, 403)).body.error.code).toBe('NOT_ASSIGNEE')
    await t(dev, 'IN_PROGRESS')

    const allowed = await dev.call<{ to_status: string; requires_resolution_notes: boolean }[]>('GET', '/bugs/{bug_id}/allowed-transitions', { path: { bug_id: id }, expect: 200 })
    expect(allowed.body).toEqual([expect.objectContaining({ to_status: 'RESOLVED', requires_resolution_notes: true })])
    expect((await t(dev, 'RESOLVED', { resolution_notes: '   ' }, 422)).body.error.code).toBe('RESOLUTION_NOTES_REQUIRED')
    const resolved = (await t(dev, 'RESOLVED', { resolution_notes: 'Fixed' })).body
    expect(resolved.resolved_at).not.toBeNull()
    expect((await t(tester, 'REOPENED', {}, 422)).body.error.code).toBe('REASON_REQUIRED')
    const reopened = (await t(tester, 'REOPENED', { reason: 'Still broken' })).body
    expect([reopened.resolved_at, reopened.closed_at]).toEqual([null, null])
    await t(dev, 'IN_PROGRESS')
    await t(dev, 'RESOLVED', { resolution_notes: 'Fixed again' })
    expect((await t(tester, 'CLOSED')).body.closed_at).not.toBeNull()
    expect((await t(admin, 'REOPENED', { reason: 'x' }, 403)).body.error.code).toBe('FORBIDDEN')
    await pm.call('PATCH', '/bugs/{bug_id}', { path: { bug_id: id }, json: { title: 'Edit after close' }, expect: 409 })
  })
})
