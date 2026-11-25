import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { Button } from './Button'

// ------------------------------------------------------------------ panel

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  ...rest
}: {
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={clsx('rounded-[10px] border border-line bg-surface', className)} {...rest}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          {title && <h2 className="text-[14px] font-semibold text-ink">{title}</h2>}
          {actions}
        </header>
      )}
      <div className={clsx('p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

// ------------------------------------------------------------------ states

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center" data-testid="empty-state">
      {icon && <div className="mb-1 text-ink-3">{icon}</div>}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-sm text-ink-2">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const err = error instanceof ApiError ? error : null
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-12 text-center" data-testid="error-state">
      <AlertTriangle className="size-6 text-danger" aria-hidden />
      <p className="text-[15px] font-semibold">
        {err?.status === 403 ? 'You don’t have access to this' : err?.status === 404 ? 'Not found' : 'Couldn’t load this'}
      </p>
      <p className="max-w-md text-sm text-ink-2">{err?.message ?? (error as Error)?.message ?? 'Unexpected error'}</p>
      {err?.requestId && <p className="text-[12px] text-ink-3">Reference: {err.requestId}</p>}
      {onRetry && err?.status !== 403 && err?.status !== 404 && (
        <Button size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-sunken', className)} aria-hidden />
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'info' | 'success'; children: ReactNode }) {
  const styles = {
    danger: 'bg-danger-soft text-danger border-danger/25',
    info: 'bg-sunken text-ink-2 border-line',
    success: 'bg-success-soft text-success border-success/25',
  }[tone]
  const Icon = { danger: AlertTriangle, info: Info, success: CheckCircle2 }[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={clsx('flex gap-2 rounded-md border px-3 py-2 text-sm', styles)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

// ------------------------------------------------------------------ dialog (native <dialog>: focus trap + Esc for free)

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  testId,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  testId?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    // Click-outside is a mouse convenience; keyboard users close with Esc, which <dialog> provides natively.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      data-testid={testId}
      aria-labelledby="dialog-title"
      className="m-auto w-[min(92vw,30rem)] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      {open && (
        <div className="flex flex-col">
          <header className="flex items-center justify-between border-b border-line px-5 py-3">
            <h2 id="dialog-title" className="text-[15px] font-semibold">
              {title}
            </h2>
            <button type="button" onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-sunken hover:text-ink" aria-label="Close">
              <X className="size-4" />
            </button>
          </header>
          <div className="px-5 py-4 text-sm">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = 'primary',
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      testId="confirm-dialog"
      footer={
        <>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} loading={loading} data-testid="confirm-button">
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Dialog>
  )
}

// ------------------------------------------------------------------ toasts

interface Toast {
  id: number
  tone: 'success' | 'danger' | 'info'
  message: string
}

const ToastContext = createContext<(tone: Toast['tone'], message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const push = useCallback((tone: Toast['tone'], message: string) => {
    const id = nextId.current++
    setToasts((t) => [...t, { id, tone, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500)
  }, [])

  return (
    <ToastContext value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            data-testid="toast"
            data-tone={t.tone}
            className="pointer-events-auto flex items-start gap-2 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm shadow-lg"
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            ) : t.tone === 'danger' ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
            )}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext>
  )
}

export function useToast() {
  const push = use(ToastContext)
  return {
    success: (m: string) => push('success', m),
    error: (e: unknown) => push('danger', e instanceof Error ? e.message : String(e)),
    info: (m: string) => push('info', m),
  }
}

// ------------------------------------------------------------------ pagination

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  return (
    <nav className="flex items-center justify-between gap-3 text-[13px] text-ink-2" aria-label="Pagination">
      <span data-testid="pagination-range">
        {from}–{to} of {total}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="px-1">
          Page {page} of {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}
