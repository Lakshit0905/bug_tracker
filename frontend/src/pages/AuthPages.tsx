import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ApiError } from '../api/client'
import { authApi } from '../api/endpoints'
import { Button } from '../components/ui/Button'
import { Alert, useToast } from '../components/ui/Feedback'
import { TextField } from '../components/ui/Field'
import { useAuth } from '../context/AuthContext'
import { STATUS_LABEL, STATUS_VAR } from '../lib/format'
import { STATUSES } from '../types/api'

const DEMO_ACCOUNTS = [
  { email: 'priya.patel@demo.bugtrackr.dev', role: 'Project manager' },
  { email: 'tina.torres@demo.bugtrackr.dev', role: 'Tester' },
  { email: 'raj.mehta@demo.bugtrackr.dev', role: 'Developer' },
]
const SHOW_DEMO = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'

function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,520px)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-sunken px-12 py-10 lg:flex">
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
            <rect width="32" height="32" rx="7" fill="var(--accent)" />
            <path d="M8 11h16M8 16h11M8 21h7" stroke="var(--accent-ink)" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="23" cy="21" r="3" fill="#fab219" />
          </svg>
          BugTrackr
        </div>
        <div className="max-w-md">
          <p className="text-[30px] font-semibold leading-tight tracking-tight">Every defect, from first report to verified fix.</p>
          <ol className="mt-8 flex flex-col gap-3" aria-label="Bug lifecycle">
            {STATUSES.map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm text-ink-2">
                <span className="flex size-6 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: STATUS_VAR[s] }}>
                  {i + 1}
                </span>
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-[13px] text-ink-3">Role-based workflow for testers, developers and project managers.</p>
      </aside>
      <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <h1 className="text-[24px] font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <p className="mt-6 text-sm text-ink-2">{footer}</p>
        </div>
      </main>
    </div>
  )
}

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'RATE_LIMITED'
          ? 'Too many attempts. Wait a minute and try again.'
          : err instanceof ApiError
            ? err.message
            : 'Sign-in failed. Try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Use your work email and password." footer={<>New here? <Link to="/register" className="font-medium text-accent hover:underline">Create an account</Link></>}>
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="login-form">
        {error && <Alert>{error}</Alert>}
        <TextField label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email" autoFocus />
        <TextField label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
        <Button type="submit" variant="primary" loading={loading} disabled={!email || !password} className="mt-2 w-full" data-testid="login-submit">
          Sign in
        </Button>
      </form>
      {SHOW_DEMO && (
        <div className="mt-8 rounded-lg border border-dashed border-line-strong p-3" data-testid="demo-accounts">
          <p className="text-[13px] font-medium">Demo accounts</p>
          <p className="mb-2 text-[12.5px] text-ink-3">Password for all: Demo12345</p>
          <ul className="flex flex-col">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email)
                    setPassword('Demo12345')
                  }}
                  className="flex w-full justify-between rounded px-1.5 py-1 text-left text-[13px] hover:bg-sunken"
                >
                  <span className="truncate">{a.email}</span>
                  <span className="text-ink-3">{a.role}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AuthLayout>
  )
}

export function RegisterPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState({ full_name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setErrors(({ [k]: _drop, ...rest }) => rest)
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (form.full_name.trim().length < 2) e.full_name = 'Enter your name (at least 2 characters).'
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address.'
    if (form.password.length < 8) e.password = 'Use at least 8 characters.'
    else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Include at least one letter and one number.'
    else if (new TextEncoder().encode(form.password).length > 72) e.password = 'Use at most 72 bytes.'
    if (form.confirm !== form.password) e.confirm = 'Passwords don’t match.'
    return e
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault()
    setFormError(null)
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) return
    setLoading(true)
    try {
      await authApi.register({ full_name: form.full_name.trim(), email: form.email.trim(), password: form.password })
      await login(form.email.trim(), form.password)
      toast.success('Account created. You’re signed in as a tester.')
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: 'An account with this email already exists.' })
      else if (err instanceof ApiError && Object.keys(err.fieldErrors()).length) setErrors(err.fieldErrors())
      else setFormError(err instanceof Error ? err.message : 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="New accounts start as testers. An administrator can change your role."
      footer={<>Already have an account? <Link to="/login" className="font-medium text-accent hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="register-form">
        {formError && <Alert>{formError}</Alert>}
        <TextField label="Full name" autoComplete="name" required value={form.full_name} onChange={set('full_name')} error={errors.full_name} data-testid="register-name" maxLength={120} />
        <TextField label="Work email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} data-testid="register-email" />
        <TextField label="Password" type="password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} hint="At least 8 characters, with a letter and a number." data-testid="register-password" />
        <TextField label="Confirm password" type="password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} error={errors.confirm} data-testid="register-confirm" />
        <Button type="submit" variant="primary" loading={loading} className="mt-2 w-full" data-testid="register-submit">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
