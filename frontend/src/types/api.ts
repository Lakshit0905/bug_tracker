// TypeScript mirrors of the backend's Pydantic schemas (backend/app/schemas/*).

export const ROLES = ['TESTER', 'DEVELOPER', 'PROJECT_MANAGER', 'ADMIN'] as const
export type Role = (typeof ROLES)[number]

export const STATUSES = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'REOPENED', 'CLOSED'] as const
export type BugStatus = (typeof STATUSES)[number]

export const LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type Severity = (typeof LEVELS)[number]
export type Priority = (typeof LEVELS)[number]

export const CATEGORIES = [
  'UI',
  'BACKEND',
  'DATABASE',
  'AUTHENTICATION',
  'PERFORMANCE',
  'SECURITY',
  'API',
  'INFRASTRUCTURE',
  'OTHER',
] as const
export type Category = (typeof CATEGORIES)[number]

export type Capability =
  | 'bug:view'
  | 'bug:create'
  | 'bug:edit:any'
  | 'bug:edit:own'
  | 'bug:set_priority'
  | 'bug:assign'
  | 'bug:transition'
  | 'bug:comment'
  | 'bug:attach:any'
  | 'bug:attach:assigned'
  | 'bug:view_history'
  | 'dashboard:basic'
  | 'dashboard:full'
  | 'reports:view'
  | 'users:manage'
  | 'users:list_developers'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface User {
  id: number
  email: string
  full_name: string
  role: Role
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

export interface CurrentUser extends User {
  capabilities: Capability[]
}

export interface UserSummary {
  id: number
  full_name: string
  email: string
  role: Role
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
  user: User
}

export interface BugListItem {
  id: number
  key: string
  title: string
  severity: Severity
  priority: Priority
  category: Category
  status: BugStatus
  reporter: UserSummary
  assignee: UserSummary | null
  created_at: string
  updated_at: string
}

export interface Bug extends BugListItem {
  description: string
  environment: string
  steps_to_reproduce: string
  expected_result: string
  actual_result: string
  resolution_notes: string | null
  resolved_at: string | null
  closed_at: string | null
}

export interface BugInput {
  title: string
  description: string
  severity: Severity
  category: Category
  priority?: Priority
  environment: string
  steps_to_reproduce: string
  expected_result: string
  actual_result: string
}

export interface AllowedTransition {
  to_status: BugStatus
  label: string
  requires_resolution_notes: boolean
  requires_reason: boolean
}

export interface Comment {
  id: number
  bug_id: number
  body: string
  author: UserSummary
  created_at: string
}

export type HistoryAction =
  | 'CREATED'
  | 'FIELD_UPDATED'
  | 'STATUS_CHANGED'
  | 'ASSIGNED'
  | 'PRIORITY_CHANGED'
  | 'COMMENT_ADDED'
  | 'ATTACHMENT_ADDED'

export interface HistoryEntry {
  id: number
  bug_id: number
  action: HistoryAction
  field_name: string | null
  old_value: string | null
  new_value: string | null
  actor: UserSummary | null
  created_at: string
}

export interface Attachment {
  id: number
  bug_id: number
  original_filename: string
  content_type: string
  size_bytes: number
  uploaded_by: UserSummary
  created_at: string
  download_url: string
}

export type NotificationType = 'BUG_ASSIGNED' | 'STATUS_CHANGED' | 'COMMENT_ADDED' | 'BUG_REOPENED'

export interface Notification {
  id: number
  type: NotificationType
  message: string
  bug_id: number | null
  bug_key: string | null
  is_read: boolean
  created_at: string
  read_at: string | null
}

export interface DashboardSummary {
  total: number
  by_status: Record<BugStatus, number>
  open_total: number
  critical_open: number
  unassigned_open: number
  by_severity_open: Record<Severity, number>
  by_priority_open: Record<Priority, number>
  by_category_open: Record<Category, number>
  my_assigned_active: number
  my_reported_open: number
}

export interface TrendPoint {
  date: string
  created: number
  resolved: number
  closed: number
}

export interface DeveloperWorkload {
  developer_id: number
  full_name: string
  open: number
  in_progress: number
  reopened: number
  resolved: number
  active_total: number
}

export interface ActivityItem {
  id: number
  bug_id: number
  bug_key: string
  bug_title: string
  action: HistoryAction
  field_name: string | null
  old_value: string | null
  new_value: string | null
  actor_name: string | null
  created_at: string
}

export interface ReportOverview {
  total_bugs: number
  closed_bugs: number
  closure_rate: number
  avg_hours_to_resolve: number | null
  reopened_bugs: number
  reopen_rate: number
  by_category: { category: Category; total: number; open: number; closed: number }[]
  by_severity: Record<Severity, number>
}

export interface ApiErrorBody {
  error: { code: string; message: string; details: unknown; request_id: string | null }
}

export interface ValidationDetail {
  loc: (string | number)[]
  msg: string
  type: string
}
