import type {
  ActivityItem,
  AllowedTransition,
  Attachment,
  Bug,
  BugInput,
  BugListItem,
  BugStatus,
  Category,
  Comment,
  CurrentUser,
  DashboardSummary,
  DeveloperWorkload,
  HistoryEntry,
  Notification,
  Page,
  Priority,
  ReportOverview,
  Role,
  Severity,
  TokenResponse,
  User,
  UserSummary,
} from '../types/api'
import { request, tokens } from './client'

// ------------------------------------------------------------------ auth

export const authApi = {
  async login(email: string, password: string): Promise<TokenResponse> {
    const t = await request<TokenResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false })
    tokens.setSession(t)
    return t
  },
  register: (data: { email: string; full_name: string; password: string }) =>
    request<User>('/auth/register', { method: 'POST', body: data, auth: false }),
  async logout(): Promise<void> {
    const rt = tokens.refreshToken()
    try {
      if (rt && tokens.hasAccess()) await request<void>('/auth/logout', { method: 'POST', body: { refresh_token: rt } })
    } finally {
      tokens.clear()
    }
  },
}

// ------------------------------------------------------------------ users

export interface UserSearch {
  q?: string
  role?: Role
  is_active?: boolean
  page?: number
  page_size?: number
}

export const usersApi = {
  me: () => request<CurrentUser>('/users/me'),
  updateMe: (full_name: string) => request<CurrentUser>('/users/me', { method: 'PATCH', body: { full_name } }),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/users/me/password', { method: 'POST', body: { current_password, new_password } }),
  developers: () => request<UserSummary[]>('/users/developers'),
  search: (params: UserSearch) => request<Page<User>>('/users', { query: { ...params } }),
  setRole: (id: number, role: Role) => request<User>(`/users/${id}/role`, { method: 'PATCH', body: { role } }),
  setActive: (id: number, is_active: boolean) =>
    request<User>(`/users/${id}/status`, { method: 'PATCH', body: { is_active } }),
}

// ------------------------------------------------------------------ bugs

export type SortField = 'created_at' | 'updated_at' | 'priority' | 'severity' | 'status' | 'title' | 'id'

export interface BugSearch {
  status?: BugStatus[]
  severity?: Severity[]
  priority?: Priority[]
  category?: Category[]
  assignee_id?: number
  assigned_to_me?: boolean
  unassigned?: boolean
  reported_by_me?: boolean
  created_from?: string
  created_to?: string
  q?: string
  sort?: SortField
  order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export const bugsApi = {
  search: (params: BugSearch) => request<Page<BugListItem>>('/bugs', { query: { ...params } }),
  get: (id: number) => request<Bug>(`/bugs/${id}`),
  create: (data: BugInput) => request<Bug>('/bugs', { method: 'POST', body: data }),
  update: (id: number, data: Partial<BugInput>) => request<Bug>(`/bugs/${id}`, { method: 'PATCH', body: data }),
  setPriority: (id: number, priority: Priority) =>
    request<Bug>(`/bugs/${id}/priority`, { method: 'PUT', body: { priority } }),
  assign: (id: number, assignee_id: number | null) =>
    request<Bug>(`/bugs/${id}/assignee`, { method: 'PUT', body: { assignee_id } }),
  allowedTransitions: (id: number) => request<AllowedTransition[]>(`/bugs/${id}/allowed-transitions`),
  transition: (id: number, to_status: BugStatus, extra: { resolution_notes?: string; reason?: string } = {}) =>
    request<Bug>(`/bugs/${id}/transitions`, { method: 'POST', body: { to_status, ...extra } }),
  comments: (id: number) => request<Comment[]>(`/bugs/${id}/comments`),
  addComment: (id: number, body: string) => request<Comment>(`/bugs/${id}/comments`, { method: 'POST', body: { body } }),
  history: (id: number) => request<HistoryEntry[]>(`/bugs/${id}/history`),
  attachments: (id: number) => request<Attachment[]>(`/bugs/${id}/attachments`),
  upload: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<Attachment>(`/bugs/${id}/attachments`, { method: 'POST', form })
  },
}

// ------------------------------------------------------------------ notifications & dashboard

export const notificationsApi = {
  list: (params: { unread_only?: boolean; page?: number; page_size?: number }) =>
    request<Page<Notification>>('/notifications', { query: { ...params } }),
  unreadCount: () => request<{ unread: number }>('/notifications/unread-count'),
  markRead: (id: number) => request<Notification>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () => request<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
}

export const dashboardApi = {
  summary: () => request<DashboardSummary>('/dashboard/summary'),
  trends: (days: number) => request<{ days: number; points: { date: string; created: number; resolved: number; closed: number }[] }>(
    '/dashboard/trends',
    { query: { days } },
  ),
  activity: (limit = 12) => request<ActivityItem[]>('/dashboard/activity', { query: { limit } }),
  workload: () => request<DeveloperWorkload[]>('/dashboard/workload'),
  reports: () => request<ReportOverview>('/dashboard/reports'),
}
