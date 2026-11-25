import { describe, expect, it } from 'vitest'
import { describeHistory, fileSize, initials, percent, timeAgo } from '../lib/format'

describe('timeAgo', () => {
  const now = Date.parse('2026-11-24T12:00:00Z')
  it.each([
    ['2026-11-24T11:59:30Z', 'just now'],
    ['2026-11-24T11:55:00Z', '5 minutes ago'],
    ['2026-11-24T09:00:00Z', '3 hours ago'],
    ['2026-11-23T12:00:00Z', 'yesterday'],
    ['2026-11-10T12:00:00Z', '2 weeks ago'],
    ['2025-11-24T12:00:00Z', 'last year'],
  ])('%s → %s', (iso, expected) => {
    expect(timeAgo(iso, now)).toBe(expected)
  })
})

describe('fileSize', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [10 * 1024 * 1024, '10.0 MB'],
  ])('%i bytes → %s', (bytes, expected) => expect(fileSize(bytes)).toBe(expected))
})

describe('initials', () => {
  it.each([
    ['Priya Patel', 'PP'],
    ['madonna', 'M'],
    ['  Ada   Lovelace  King ', 'AL'],
    ['élodie durand', 'ÉD'],
  ])('%s → %s', (name, expected) => expect(initials(name)).toBe(expected))
})

describe('percent', () => {
  it.each([
    [0, '0%'],
    [0.1053, '11%'],
    [0.255, '26%'],
    [1, '100%'],
  ])('%f → %s', (r, expected) => expect(percent(r)).toBe(expected))
})

describe('describeHistory', () => {
  const e = (action: string, field: string | null, old_value: string | null, new_value: string | null) =>
    describeHistory({ action: action as never, field_name: field, old_value, new_value })

  it('uses human status names', () => expect(e('STATUS_CHANGED', 'status', 'IN_PROGRESS', 'RESOLVED')).toBe('moved it from In progress to Resolved'))
  it('describes assignment and unassignment', () => {
    expect(e('ASSIGNED', 'assignee', null, 'Raj Mehta')).toBe('assigned it to Raj Mehta')
    expect(e('ASSIGNED', 'assignee', 'Raj Mehta', null)).toBe('unassigned Raj Mehta')
  })
  it('shows short field values and summarises long ones', () => {
    expect(e('FIELD_UPDATED', 'severity', 'HIGH', 'CRITICAL')).toBe('changed severity from High to Critical')
    expect(e('FIELD_UPDATED', 'description', 'x'.repeat(41), 'y')).toBe('edited the description')
    expect(e('FIELD_UPDATED', 'resolution_notes', null, 'Done')).toBe('edited the fix notes')
  })
  it('covers every action type', () => {
    expect(e('CREATED', null, null, 'BUG-7')).toBe('reported BUG-7')
    expect(e('PRIORITY_CHANGED', 'priority', 'LOW', 'HIGH')).toBe('set priority from Low to High')
    expect(e('COMMENT_ADDED', null, null, 'hi')).toBe('commented')
    expect(e('ATTACHMENT_ADDED', 'attachment', null, 'a.png')).toBe('attached a.png')
  })
})
