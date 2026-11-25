import { expect, test } from '@playwright/test'
import { ContractClient } from '../../fixtures/contract'
import { USERS, uniqueTitle } from '../../data/users'

let tester: ContractClient, pm: ContractClient, dev: ContractClient
let bugId: number

test.beforeAll(async () => {
  ;[tester, pm, dev] = await Promise.all([USERS.tester, USERS.pm, USERS.dev].map((u) => ContractClient.as(u)))
  bugId = (
    await tester.call<{ id: number }>('POST', '/bugs', {
      json: { title: uniqueTitle('Child resources'), description: 'Comments, history and attachments.', severity: 'LOW', category: 'UI', steps_to_reproduce: 'x', expected_result: 'y', actual_result: 'z' },
      expect: 201,
    })
  ).body.id
})
test.afterAll(async () => Promise.all([tester, pm, dev].map((c) => c.dispose())))

test.describe('Comments and history', () => {
  test('comments are listed oldest first and audited', async () => {
    for (const body of ['first', 'second']) await pm.call('POST', '/bugs/{bug_id}/comments', { path: { bug_id: bugId }, json: { body }, expect: 201 })
    const list = await tester.call<{ body: string }[]>('GET', '/bugs/{bug_id}/comments', { path: { bug_id: bugId }, expect: 200 })
    expect(list.body.map((c) => c.body)).toEqual(['first', 'second'])
    const history = await tester.call<{ action: string }[]>('GET', '/bugs/{bug_id}/history', { path: { bug_id: bugId }, expect: 200 })
    expect(history.body.map((h) => h.action)).toEqual(['CREATED', 'COMMENT_ADDED', 'COMMENT_ADDED'])
  })

  test('comment boundaries: empty → 422, 5000 chars → 201, 5001 → 422', async () => {
    await pm.call('POST', '/bugs/{bug_id}/comments', { path: { bug_id: bugId }, json: { body: '   ' }, expect: 422 })
    await pm.call('POST', '/bugs/{bug_id}/comments', { path: { bug_id: bugId }, json: { body: 'x'.repeat(5000) }, expect: 201 })
    await pm.call('POST', '/bugs/{bug_id}/comments', { path: { bug_id: bugId }, json: { body: 'x'.repeat(5001) }, expect: 422 })
    await pm.call('GET', '/bugs/{bug_id}/comments', { path: { bug_id: 99999999 }, expect: 404 })
  })
})

test.describe('Attachments', () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])

  test('upload, list and download round-trip with safe headers', async () => {
    const up = await tester.call<{ id: number; content_type: string; download_url: string }>('POST', '/bugs/{bug_id}/attachments', {
      path: { bug_id: bugId },
      multipart: { file: { name: 'screen.png', mimeType: 'application/x-anything', buffer: png } },
      expect: 201,
    })
    expect(up.body.content_type).toBe('image/png')
    const list = await dev.call<{ id: number }[]>('GET', '/bugs/{bug_id}/attachments', { path: { bug_id: bugId }, expect: 200 })
    expect(list.body.map((a) => a.id)).toContain(up.body.id)
    const dl = await dev.call<Buffer>('GET', '/attachments/{attachment_id}/download', { path: { attachment_id: up.body.id }, expect: 200 })
    expect(Buffer.compare(dl.body, png)).toBe(0)
    expect(dl.headers['content-disposition']).toMatch(/^attachment;/)
    expect(dl.headers['x-content-type-options']).toBe('nosniff')
  })

  test('rejects disguised, disallowed, empty and oversized files', async () => {
    const up = (name: string, buffer: Buffer, status: number) =>
      tester.call('POST', '/bugs/{bug_id}/attachments', { path: { bug_id: bugId }, multipart: { file: { name, mimeType: 'image/png', buffer } }, expect: status })
    await up('fake.png', Buffer.from('<html>not an image</html>'), 415)
    await up('run.exe', Buffer.from('MZ'), 415)
    await up('empty.txt', Buffer.alloc(0), 422)
    await up('huge.txt', Buffer.alloc(10 * 1024 * 1024 + 1, 0x61), 413) // MAX_UPLOAD_MB=10 → 10 MiB + 1 byte
    await dev.call('POST', '/bugs/{bug_id}/attachments', { path: { bug_id: bugId }, multipart: { file: { name: 'a.png', mimeType: 'image/png', buffer: png } }, expect: 403 })
    await tester.call('GET', '/attachments/{attachment_id}/download', { path: { attachment_id: 99999999 }, expect: 404 })
  })
})

test.describe('Notifications', () => {
  test('unread count, list, mark one, mark all — scoped to the recipient', async () => {
    await pm.call('POST', '/bugs/{bug_id}/comments', { path: { bug_id: bugId }, json: { body: 'ping for the reporter' }, expect: 201 })
    const unread = await tester.call<{ unread: number }>('GET', '/notifications/unread-count', { expect: 200 })
    expect(unread.body.unread).toBeGreaterThan(0)
    const list = await tester.call<{ items: { id: number; is_read: boolean }[] }>('GET', '/notifications', { query: { unread_only: true, page_size: 5 }, expect: 200 })
    const first = list.body.items[0]
    await pm.call('POST', '/notifications/{notification_id}/read', { path: { notification_id: first.id }, expect: 404 }) // not theirs
    expect((await tester.call<{ is_read: boolean }>('POST', '/notifications/{notification_id}/read', { path: { notification_id: first.id }, expect: 200 })).body.is_read).toBe(true)
    await tester.call('POST', '/notifications/read-all', { expect: 200 })
    expect((await tester.call<{ unread: number }>('GET', '/notifications/unread-count', { expect: 200 })).body.unread).toBe(0)
  })
})

test.describe('Dashboard and reports', () => {
  test('summary totals are internally consistent', async () => {
    const s = await pm.call<{ total: number; by_status: Record<string, number>; open_total: number }>('GET', '/dashboard/summary', { expect: 200 })
    const sum = Object.values(s.body.by_status).reduce((a, b) => a + b, 0)
    expect(sum).toBe(s.body.total)
    expect(s.body.open_total).toBe(s.body.total - s.body.by_status.CLOSED)
  })

  test('trends return one zero-filled point per day; range boundaries enforced', async () => {
    for (const days of [1, 30, 365]) {
      const res = await pm.call<{ points: { date: string }[] }>('GET', '/dashboard/trends', { query: { days }, expect: 200 })
      expect(res.body.points).toHaveLength(days)
    }
    await pm.call('GET', '/dashboard/trends', { query: { days: 0 }, expect: 422 })
    await pm.call('GET', '/dashboard/trends', { query: { days: 366 }, expect: 422 })
  })

  test('activity, workload and reports', async () => {
    const act = await tester.call<unknown[]>('GET', '/dashboard/activity', { query: { limit: 5 }, expect: 200 })
    expect(act.body.length).toBeLessThanOrEqual(5)
    await pm.call('GET', '/dashboard/workload', { expect: 200 })
    const rep = await pm.call<{ closure_rate: number; reopen_rate: number }>('GET', '/dashboard/reports', { expect: 200 })
    expect(rep.body.closure_rate).toBeGreaterThanOrEqual(0)
    expect(rep.body.closure_rate).toBeLessThanOrEqual(1)
  })
})
