import clsx from 'clsx'
import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

const control =
  'w-full rounded-md border bg-surface text-ink placeholder:text-ink-3 text-sm ' +
  'border-line-strong hover:border-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 ' +
  'disabled:bg-sunken disabled:text-ink-3 aria-invalid:border-danger aria-invalid:ring-danger/15'

interface FieldShellProps {
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  children: (props: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  className?: string
}

/** Label + control + hint/error, wired for screen readers (aria-describedby / aria-invalid). */
export function FieldShell({ label, error, hint, required, children, className }: FieldShellProps) {
  const id = useId()
  const msgId = `${id}-msg`
  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {required && <span className="text-ink-3"> (required)</span>}
      </label>
      {children({ id, describedBy: error || hint ? msgId : undefined, invalid: !!error })}
      {error ? (
        <p id={msgId} className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={msgId} className="text-[13px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type Common = { label: string; error?: string; hint?: ReactNode; className?: string }

export function TextField({ label, error, hint, className, required, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={clsx(control, 'h-9 px-3')}
          {...rest}
        />
      )}
    </FieldShell>
  )
}

export function TextArea({ label, error, hint, className, required, rows = 4, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={clsx(control, 'px-3 py-2 leading-relaxed resize-y')}
          {...rest}
        />
      )}
    </FieldShell>
  )
}

interface Option {
  value: string
  label: string
}

export function SelectField({
  label,
  error,
  hint,
  className,
  required,
  options,
  placeholder,
  ...rest
}: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: Option[]; placeholder?: string }) {
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          required={required}
          className={clsx(control, 'h-9 px-2.5')}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  )
}

export const controlClass = control
