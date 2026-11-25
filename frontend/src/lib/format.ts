import type { BugStatus, Category, HistoryEntry, Role, Severity } from '../types/api'

export const STATUS_LABEL: Record<BugStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
  REOPENED: 'Reopened',
  CLOSED: 'Closed',
}

export const STATUS_VAR: Record<BugStatus, string> = {
  NEW: 'var(--st-new)',
  OPEN: 'var(--st-open)',
  IN_PROGRESS: 'var(--st-progress)',
  RESOLVED: 'var(--st-resolved)',
  REOPENED: 'var(--st-reopened)',
  CLOSED: 'var(--st-closed)',
}

export const LEVEL_LABEL: Record<Severity, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' }
export const LEVEL_RANK: Record<Severity, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
export const SEVERITY_VAR: Record<Severity, string> = {
  LOW: 'var(--sev-low)',
  MEDIUM: 'var(--sev-medium)',
  HIGH: 'var(--sev-high)',
  CRITICAL: 'var(--sev-critical)',
}

export const CATEGORY_LABEL: Record<Category, string> = {
  UI: 'UI',
  BACKEND: 'Backend',
  DATABASE: 'Database',
  AUTHENTICATION: 'Authentication',
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  API: 'API',
  INFRASTRUCTURE: 'Infrastructure',
  OTHER: 'Other',
}

export const ROLE_LABEL: Record<Role, string> = {
  TESTER: 'Tester',
  DEVELOPER: 'Developer',
  PROJECT_MANAGER: 'Project manager',
  ADMIN: 'Administrator',
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return 'just now'
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')
}

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`
}

const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  description: 'description',
  severity: 'severity',
  category: 'category',
  environment: 'environment',
  steps_to_reproduce: 'steps to reproduce',
  expected_result: 'expected result',
  actual_result: 'actual result',
  resolution_notes: 'fix notes',
  priority: 'priority',
  assignee: 'assignee',
  status: 'status',
}

function pretty(value: string | null): string {
  if (value === null) return 'nobody'
  if (value in STATUS_LABEL) return STATUS_LABEL[value as BugStatus]
  if (value in LEVEL_LABEL) return LEVEL_LABEL[value as Severity]
  if (value in CATEGORY_LABEL) return CATEGORY_LABEL[value as Category]
  return value
}

/** Human sentence for an audit entry, e.g. "changed status from Open to In progress". */
export function describeHistory(e: Pick<HistoryEntry, 'action' | 'field_name' | 'old_value' | 'new_value'>): string {
  switch (e.action) {
    case 'CREATED':
      return `reported ${e.new_value ?? 'this bug'}`
    case 'STATUS_CHANGED':
      return `moved it from ${pretty(e.old_value)} to ${pretty(e.new_value)}`
    case 'ASSIGNED':
      return e.new_value ? `assigned it to ${e.new_value}` : `unassigned ${e.old_value ?? 'the developer'}`
    case 'PRIORITY_CHANGED':
      return `set priority from ${pretty(e.old_value)} to ${pretty(e.new_value)}`
    case 'COMMENT_ADDED':
      return 'commented'
    case 'ATTACHMENT_ADDED':
      return `attached ${e.new_value ?? 'a file'}`
    case 'FIELD_UPDATED': {
      const field = FIELD_LABEL[e.field_name ?? ''] ?? e.field_name ?? 'a field'
      const short = (v: string | null) => (v && v.length <= 40 ? pretty(v) : null)
      const from = short(e.old_value)
      const to = short(e.new_value)
      return from && to ? `changed ${field} from ${from} to ${to}` : `edited the ${field}`
    }
  }
}
