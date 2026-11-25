import { useState, type FormEvent, type ReactNode } from 'react'
import { ApiError } from '../../api/client'
import { CATEGORY_LABEL, LEVEL_LABEL } from '../../lib/format'
import { CATEGORIES, LEVELS, type Bug, type BugInput, type Category, type Priority, type Severity } from '../../types/api'
import { Button } from '../ui/Button'
import { Alert } from '../ui/Feedback'
import { SelectField, TextArea, TextField } from '../ui/Field'

type Values = Omit<BugInput, 'severity' | 'category' | 'priority'> & { severity: Severity | ''; category: Category | ''; priority: Priority | '' }

const LIMITS = { title: [5, 200], description: [10, 10_000], environment: [0, 255], long: [1, 5_000] } as const

export function emptyBug(): Values {
  return { title: '', description: '', severity: '', category: '', priority: '', environment: '', steps_to_reproduce: '', expected_result: '', actual_result: '' }
}

export function fromBug(b: Bug): Values {
  return {
    title: b.title,
    description: b.description,
    severity: b.severity,
    category: b.category,
    priority: b.priority,
    environment: b.environment,
    steps_to_reproduce: b.steps_to_reproduce,
    expected_result: b.expected_result,
    actual_result: b.actual_result,
  }
}

/** Mirrors the API's limits so most mistakes are caught before a round-trip; the server stays authoritative. */
export function validate(v: Values): Record<string, string> {
  const e: Record<string, string> = {}
  const len = (s: string) => s.trim().length
  if (len(v.title) < LIMITS.title[0]) e.title = 'Use at least 5 characters so others can find this bug.'
  else if (len(v.title) > LIMITS.title[1]) e.title = 'Keep the title under 200 characters.'
  if (len(v.description) < LIMITS.description[0]) e.description = 'Describe the problem in at least 10 characters.'
  if (!v.severity) e.severity = 'Choose how severe the impact is.'
  if (!v.category) e.category = 'Choose the closest category.'
  if (len(v.environment) > LIMITS.environment[1]) e.environment = 'Keep the environment under 255 characters.'
  for (const f of ['steps_to_reproduce', 'expected_result', 'actual_result'] as const) {
    if (len(v[f]) < 1) e[f] = 'This field is required.'
    else if (len(v[f]) > LIMITS.long[1]) e[f] = 'Keep this under 5,000 characters.'
  }
  return e
}

interface Props {
  initial: Values
  canSetPriority: boolean
  submitLabel: string
  onSubmit: (values: BugInput) => Promise<unknown>
  onCancel: () => void
  aside?: ReactNode
  /** In edit mode only changed fields are sent and priority has its own control. */
  mode: 'create' | 'edit'
}

export function BugForm({ initial, canSetPriority, submitLabel, onSubmit, onCancel, aside, mode }: Props) {
  const [values, setValues] = useState<Values>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const bind = (k: keyof Values) => ({
    name: k,
    value: values[k],
    error: errors[k],
    onChange: (e: { target: { value: string } }) => {
      setValues((v) => ({ ...v, [k]: e.target.value }))
      if (errors[k]) setErrors(({ [k]: _drop, ...rest }) => rest)
    },
    'data-testid': `field-${k}`,
  })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      document.querySelector<HTMLElement>(`[name="${Object.keys(found)[0]}"]`)?.focus()
      return
    }
    const payload: BugInput = {
      title: values.title.trim(),
      description: values.description.trim(),
      severity: values.severity as Severity,
      category: values.category as Category,
      environment: values.environment.trim(),
      steps_to_reproduce: values.steps_to_reproduce.trim(),
      expected_result: values.expected_result.trim(),
      actual_result: values.actual_result.trim(),
      ...(mode === 'create' && canSetPriority && values.priority ? { priority: values.priority as Priority } : {}),
    }
    setSaving(true)
    try {
      await onSubmit(payload)
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fieldErrors()
        if (Object.keys(fields).length) setErrors(fields)
        setFormError(Object.keys(fields).length ? 'Some fields need attention.' : err.message)
      } else {
        setFormError((err as Error).message)
      }
    } finally {
      setSaving(false)
    }
  }

  const levelOptions = LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" data-testid="bug-form">
      <div className="flex flex-col gap-5">
        {formError && <Alert>{formError}</Alert>}
        <TextField label="Title" required placeholder="Short summary of what’s wrong" maxLength={200} {...bind('title')} hint="Example: Checkout button does nothing on Safari" />
        <TextArea label="Description" required rows={5} {...bind('description')} hint="What happened, how often, and who is affected." />
        <TextArea label="Steps to reproduce" required rows={4} placeholder={'1. Go to …\n2. Click …'} {...bind('steps_to_reproduce')} />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextArea label="Expected result" required rows={3} {...bind('expected_result')} />
          <TextArea label="Actual result" required rows={3} {...bind('actual_result')} />
        </div>
      </div>

      <div className="flex flex-col gap-5 lg:border-l lg:border-line lg:pl-6">
        <SelectField label="Severity" required placeholder="Choose…" options={levelOptions} {...bind('severity')} hint="Technical impact" />
        <SelectField label="Category" required placeholder="Choose…" options={CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} {...bind('category')} />
        {mode === 'create' && canSetPriority && (
          <SelectField label="Priority" placeholder="Medium (default)" options={levelOptions} {...bind('priority')} hint="Business urgency" />
        )}
        <TextField label="Environment" placeholder="Browser, OS, build or server" maxLength={255} {...bind('environment')} />
        {aside}
        <div className="mt-auto flex gap-2 pt-2">
          <Button type="submit" variant="primary" loading={saving} data-testid="submit-bug">
            {submitLabel}
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </form>
  )
}
