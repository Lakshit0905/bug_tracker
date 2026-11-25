import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { bugsApi, dashboardApi, notificationsApi, usersApi, type BugSearch, type UserSearch } from '../api/endpoints'

/** Central query keys so mutations can invalidate precisely. */
export const qk = {
  bugs: (p?: BugSearch) => ['bugs', p ?? {}] as const,
  bug: (id: number) => ['bug', id] as const,
  bugChildren: (id: number) => ['bug', id, 'children'] as const,
  transitions: (id: number) => ['bug', id, 'transitions'] as const,
  comments: (id: number) => ['bug', id, 'children', 'comments'] as const,
  history: (id: number) => ['bug', id, 'children', 'history'] as const,
  attachments: (id: number) => ['bug', id, 'children', 'attachments'] as const,
  developers: ['developers'] as const,
  users: (p?: UserSearch) => ['users', p ?? {}] as const,
  notifications: (p?: object) => ['notifications', p ?? {}] as const,
  unread: ['notifications', 'unread'] as const,
  dashboard: (part: string, arg?: unknown) => ['dashboard', part, arg] as const,
}

export const useBugs = (p: BugSearch) =>
  useQuery({ queryKey: qk.bugs(p), queryFn: () => bugsApi.search(p), placeholderData: keepPreviousData })
export const useBug = (id: number) => useQuery({ queryKey: qk.bug(id), queryFn: () => bugsApi.get(id) })
export const useTransitions = (id: number) =>
  useQuery({ queryKey: qk.transitions(id), queryFn: () => bugsApi.allowedTransitions(id) })
export const useComments = (id: number) => useQuery({ queryKey: qk.comments(id), queryFn: () => bugsApi.comments(id) })
export const useHistory = (id: number) => useQuery({ queryKey: qk.history(id), queryFn: () => bugsApi.history(id) })
export const useAttachments = (id: number) =>
  useQuery({ queryKey: qk.attachments(id), queryFn: () => bugsApi.attachments(id) })
export const useDevelopers = (enabled = true) =>
  useQuery({ queryKey: qk.developers, queryFn: usersApi.developers, enabled, staleTime: 60_000 })
export const useUsers = (p: UserSearch) =>
  useQuery({ queryKey: qk.users(p), queryFn: () => usersApi.search(p), placeholderData: keepPreviousData })

export const useUnreadCount = () =>
  useQuery({ queryKey: qk.unread, queryFn: notificationsApi.unreadCount, refetchInterval: 30_000 })
export const useNotifications = (p: { unread_only?: boolean; page?: number; page_size?: number }) =>
  useQuery({ queryKey: qk.notifications(p), queryFn: () => notificationsApi.list(p), placeholderData: keepPreviousData })

export const useSummary = () => useQuery({ queryKey: qk.dashboard('summary'), queryFn: dashboardApi.summary })
export const useTrends = (days: number) =>
  useQuery({ queryKey: qk.dashboard('trends', days), queryFn: () => dashboardApi.trends(days), placeholderData: keepPreviousData })
export const useActivity = (limit = 12) =>
  useQuery({ queryKey: qk.dashboard('activity', limit), queryFn: () => dashboardApi.activity(limit) })
export const useWorkload = (enabled: boolean) =>
  useQuery({ queryKey: qk.dashboard('workload'), queryFn: dashboardApi.workload, enabled })
export const useReports = () => useQuery({ queryKey: qk.dashboard('reports'), queryFn: dashboardApi.reports })
