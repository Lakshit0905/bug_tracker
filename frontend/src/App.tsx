import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './components/layout/AppShell'
import { FullPageLoader, RedirectIfAuthed, RequireAuth, RequireCapability } from './components/layout/Guards'
import { LoginPage, RegisterPage } from './pages/AuthPages'

// Route-level code splitting: charts (Recharts) only load on the pages that draw them.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const bugPages = () => import('./pages/BugPages')
const BugListPage = lazy(() => bugPages().then((m) => ({ default: m.BugListPage })))
const BugCreatePage = lazy(() => bugPages().then((m) => ({ default: m.BugCreatePage })))
const BugDetailPage = lazy(() => bugPages().then((m) => ({ default: m.BugDetailPage })))
const BugEditPage = lazy(() => bugPages().then((m) => ({ default: m.BugEditPage })))
const otherPages = () => import('./pages/OtherPages')
const AIAnalysisPage = lazy(() => otherPages().then((m) => ({ default: m.AIAnalysisPage })))
const NotificationsPage = lazy(() => otherPages().then((m) => ({ default: m.NotificationsPage })))
const UsersPage = lazy(() => otherPages().then((m) => ({ default: m.UsersPage })))
const ReportsPage = lazy(() => otherPages().then((m) => ({ default: m.ReportsPage })))
const ProfilePage = lazy(() => otherPages().then((m) => ({ default: m.ProfilePage })))
const NotFoundPage = lazy(() => otherPages().then((m) => ({ default: m.NotFoundPage })))

// Capability guards sit on the routes so a page's data hooks never run for a role that can't use it.
export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/login" element={<RedirectIfAuthed><LoginPage /></RedirectIfAuthed>} />
        <Route path="/register" element={<RedirectIfAuthed><RegisterPage /></RedirectIfAuthed>} />
        <Route element={<RequireAuth><AppShell /></RequireAuth>}>
          <Route index element={<DashboardPage />} />
          <Route path="bugs" element={<BugListPage />} />
          <Route path="bugs/new" element={<RequireCapability capability="bug:create"><BugCreatePage /></RequireCapability>} />
          <Route path="bugs/:id" element={<BugDetailPage />} />
          <Route path="bugs/:id/edit" element={<BugEditPage />} />
          <Route path="ai" element={<RequireCapability capability="bug:create"><AIAnalysisPage /></RequireCapability>} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="users" element={<RequireCapability capability="users:manage"><UsersPage /></RequireCapability>} />
          <Route path="reports" element={<RequireCapability capability="reports:view"><ReportsPage /></RequireCapability>} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
