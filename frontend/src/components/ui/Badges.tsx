import clsx from 'clsx'
import { ChevronDown, ChevronsUp, ChevronUp, Equal } from 'lucide-react'
import { LEVEL_LABEL, LEVEL_RANK, ROLE_LABEL, SEVERITY_VAR, STATUS_LABEL, STATUS_VAR, initials } from '../../lib/format'
import type { BugStatus, Priority, Role, Severity } from '../../types/api'

/** Lifecycle status: colored dot + label (never color alone). */
export function StatusBadge({ status, className }: { status: BugStatus; className?: string }) {
  const color = STATUS_VAR[status]
  return (
    <span
      data-testid="status-badge"
      data-status={status}
      className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap', className)}
      style={{ color, background: `color-mix(in oklab, ${color} 13%, transparent)` }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  )
}

/** Severity as a 4-step meter plus its name — readable without color. */
export function SeverityMeter({ severity, showLabel = true }: { severity: Severity; showLabel?: boolean }) {
  const rank = LEVEL_RANK[severity]
  const color = SEVERITY_VAR[severity]
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2" title={`Severity: ${LEVEL_LABEL[severity]}`}>
      <span className="inline-flex items-end gap-[2px] h-3" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="w-[3px] rounded-[1px]"
            style={{ height: `${4 + i * 2}px`, background: i <= rank ? color : 'var(--line-strong)' }}
          />
        ))}
      </span>
      {showLabel ? LEVEL_LABEL[severity] : <span className="sr-only">{LEVEL_LABEL[severity]}</span>}
    </span>
  )
}

const PRIORITY_ICON = { LOW: ChevronDown, MEDIUM: Equal, HIGH: ChevronUp, CRITICAL: ChevronsUp }

export function PriorityMark({ priority, showLabel = true }: { priority: Priority; showLabel?: boolean }) {
  const Icon = PRIORITY_ICON[priority]
  const strong = priority === 'HIGH' || priority === 'CRITICAL'
  return (
    <span
      className={clsx('inline-flex items-center gap-1 text-[13px]', strong ? 'text-ink font-medium' : 'text-ink-2')}
      title={`Priority: ${LEVEL_LABEL[priority]}`}
    >
      <Icon className="size-3.5" style={{ color: SEVERITY_VAR[priority] }} aria-hidden strokeWidth={2.5} />
      {showLabel ? LEVEL_LABEL[priority] : <span className="sr-only">{LEVEL_LABEL[priority]}</span>}
    </span>
  )
}

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="inline-flex rounded border border-line px-1.5 py-px text-[12px] text-ink-2 whitespace-nowrap">
      {ROLE_LABEL[role]}
    </span>
  )
}

const AVATAR_HUES = [200, 160, 260, 20, 320, 100, 40, 230]

export function Avatar({ name, size = 24 }: { name: string; size?: number }) {
  const hue = AVATAR_HUES[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_HUES.length]
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `oklch(0.9 0.05 ${hue})`,
        color: `oklch(0.35 0.08 ${hue})`,
      }}
    >
      {initials(name)}
    </span>
  )
}

export function PersonChip({ name, empty = 'Unassigned' }: { name?: string | null; empty?: string }) {
  if (!name) return <span className="text-[13px] text-ink-3">{empty}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink min-w-0">
      <Avatar name={name} size={20} />
      <span className="truncate">{name}</span>
    </span>
  )
}
