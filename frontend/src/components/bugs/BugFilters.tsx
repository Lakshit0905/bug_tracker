import clsx from 'clsx'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { CATEGORY_LABEL, LEVEL_LABEL, STATUS_LABEL } from '../../lib/format'
import { CATEGORIES, LEVELS, STATUSES } from '../../types/api'
import { Button } from '../ui/Button'

export interface FilterState {
  q: string
  status: string[]
  severity: string[]
  priority: string[]
  category: string[]
  mine: '' | 'assigned' | 'reported' | 'unassigned'
  from: string
  to: string
}

export const EMPTY_FILTERS: FilterState = { q: '', status: [], severity: [], priority: [], category: [], mine: '', from: '', to: '' }

function MultiSelect({
  label,
  options,
  value,
  onChange,
  testId,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string[]
  onChange: (v: string[]) => void
  testId: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const summary = value.length === 0 ? label : value.length === 1 ? options.find((o) => o.value === value[0])?.label : `${label} (${value.length})`

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid={`filter-${testId}`}
        className={clsx(
          'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px]',
          value.length ? 'border-accent/50 bg-accent-soft text-ink' : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
        )}
      >
        {summary}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </button>
      {open && (
        <div role="listbox" aria-multiselectable aria-label={label} className="absolute left-0 top-9 z-30 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-xl">
          {options.map((o) => {
            const checked = value.includes(o.value)
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={checked}
                data-testid={`option-${testId}-${o.value}`}
                onClick={() => onChange(checked ? value.filter((v) => v !== o.value) : [...value, o.value])}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] hover:bg-sunken"
              >
                <span className={clsx('flex size-4 items-center justify-center rounded border', checked ? 'border-accent bg-accent text-accent-ink' : 'border-line-strong')}>
                  {checked && <Check className="size-3" strokeWidth={3} />}
                </span>
                {o.label}
              </button>
            )
          })}
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full border-t border-line px-2 pt-1.5 pb-1 text-left text-[12.5px] text-ink-3 hover:text-ink">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function BugFilters({ value, onChange }: { value: FilterState; onChange: (f: FilterState) => void }) {
  const { user } = useAuth()
  const [q, setQ] = useState(value.q)
  const [syncedQ, setSyncedQ] = useState(value.q)

  // Keep the input in step when the URL changes elsewhere (global search, clear filters) — adjusted during
  // render, as React recommends, rather than in an effect.
  if (value.q !== syncedQ) {
    setSyncedQ(value.q)
    setQ(value.q)
  }

  // Debounce keyword typing before it reaches the URL.
  useEffect(() => {
    if (q === value.q) return
    const t = setTimeout(() => onChange({ ...value, q }), 300)
    return () => clearTimeout(t)
    // onChange/value are intentionally read at fire time; re-running on their identity would reset the timer.
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FilterState>(k: K, v: FilterState[K]) => onChange({ ...value, [k]: v })
  const active =
    value.q || value.status.length || value.severity.length || value.priority.length || value.category.length || value.mine || value.from || value.to

  const scopes: { key: FilterState['mine']; label: string; show: boolean }[] = [
    { key: '', label: 'All bugs', show: true },
    { key: 'assigned', label: 'Assigned to me', show: user?.role === 'DEVELOPER' },
    { key: 'reported', label: 'Reported by me', show: user?.role === 'TESTER' || user?.role === 'PROJECT_MANAGER' },
    { key: 'unassigned', label: 'Unassigned', show: true },
  ]

  return (
    <div className="flex flex-col gap-3" data-testid="bug-filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-line-strong bg-surface p-0.5" role="group" aria-label="Scope">
          {scopes
            .filter((s) => s.show)
            .map((s) => (
              <button
                key={s.key || 'all'}
                type="button"
                aria-pressed={value.mine === s.key}
                data-testid={`scope-${s.key || 'all'}`}
                onClick={() => set('mine', s.key)}
                className={clsx('h-7 rounded px-2.5 text-[13px]', value.mine === s.key ? 'bg-sunken font-medium text-ink' : 'text-ink-2 hover:text-ink')}
              >
                {s.label}
              </button>
            ))}
        </div>
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by keyword or bug key"
            aria-label="Keyword"
            data-testid="filter-keyword"
            maxLength={200}
            className="h-8 w-full rounded-md border border-line-strong bg-surface pl-8 pr-3 text-[13px] placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect testId="status" label="Status" value={value.status} onChange={(v) => set('status', v)} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} />
        <MultiSelect testId="severity" label="Severity" value={value.severity} onChange={(v) => set('severity', v)} options={LEVELS.map((s) => ({ value: s, label: LEVEL_LABEL[s] }))} />
        <MultiSelect testId="priority" label="Priority" value={value.priority} onChange={(v) => set('priority', v)} options={LEVELS.map((s) => ({ value: s, label: LEVEL_LABEL[s] }))} />
        <MultiSelect testId="category" label="Category" value={value.category} onChange={(v) => set('category', v)} options={CATEGORIES.map((s) => ({ value: s, label: CATEGORY_LABEL[s] }))} />
        <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink-2">
          From
          <input type="date" value={value.from} max={value.to || undefined} onChange={(e) => set('from', e.target.value)} data-testid="filter-from" className="bg-transparent text-ink focus:outline-none" />
        </label>
        <label className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2 text-[13px] text-ink-2">
          To
          <input type="date" value={value.to} min={value.from || undefined} onChange={(e) => set('to', e.target.value)} data-testid="filter-to" className="bg-transparent text-ink focus:outline-none" />
        </label>
        {active ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTERS)} icon={<X className="size-3.5" />} data-testid="clear-filters">
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  )
}
