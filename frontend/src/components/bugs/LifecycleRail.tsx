import clsx from 'clsx'
import { Link } from 'react-router'
import { STATUS_LABEL, STATUS_VAR } from '../../lib/format'
import { STATUSES, type BugStatus } from '../../types/api'

/**
 * The signature element: the six lifecycle stages as one connected rail.
 * Dashboard variant — proportional segments with counts; each stage links to the filtered bug list.
 */
export function LifecycleRail({ counts }: { counts: Record<BugStatus, number> }) {
  const total = STATUSES.reduce((s, k) => s + counts[k], 0)
  return (
    <div data-testid="lifecycle-rail">
      <div className="grid grid-cols-3 gap-y-4 sm:grid-cols-6">
        {STATUSES.map((s, i) => (
          <Link
            key={s}
            to={`/bugs?status=${s}`}
            data-testid={`rail-${s}`}
            className="group relative flex flex-col gap-1 rounded-md px-3 py-1 hover:bg-sunken"
          >
            {i > 0 && <span className="absolute left-0 top-2 hidden h-8 w-px bg-line sm:block" aria-hidden />}
            <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2 group-hover:text-ink">
              <span className="size-2 rounded-full" style={{ background: STATUS_VAR[s] }} aria-hidden />
              {STATUS_LABEL[s]}
            </span>
            <span className="text-[28px] font-semibold leading-none tracking-tight tabular-nums" data-testid={`rail-count-${s}`}>
              {counts[s]}
            </span>
          </Link>
        ))}
      </div>
      <div className="mt-4 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-sunken" role="img" aria-label={railLabel(counts, total)}>
        {total > 0 &&
          STATUSES.filter((s) => counts[s] > 0).map((s, i) => (
            <span
              key={s}
              className="rail-seg h-full first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: counts[s], background: STATUS_VAR[s], animationDelay: `${i * 60}ms` }}
              title={`${STATUS_LABEL[s]}: ${counts[s]}`}
            />
          ))}
      </div>
    </div>
  )
}

function railLabel(counts: Record<BugStatus, number>, total: number) {
  return `${total} bugs: ` + STATUSES.map((s) => `${counts[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(', ')
}

const MAIN_PATH: BugStatus[] = ['NEW', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

/** Bug-detail variant: where this bug sits on the main path; REOPENED shows as a loop-back marker. */
export function LifecyclePosition({ status }: { status: BugStatus }) {
  const currentIndex = status === 'REOPENED' ? 2 : MAIN_PATH.indexOf(status)
  return (
    <ol className="flex items-center" aria-label={`Lifecycle: currently ${STATUS_LABEL[status]}`} data-testid="lifecycle-position">
      {MAIN_PATH.map((s, i) => {
        const done = i < currentIndex
        const current = s === status || (status === 'REOPENED' && s === 'IN_PROGRESS')
        const color = STATUS_VAR[status === 'REOPENED' && current ? 'REOPENED' : s]
        return (
          <li key={s} className="flex flex-1 items-center last:flex-none">
            <span className="flex flex-col items-center gap-1">
              <span
                className={clsx('flex size-3.5 items-center justify-center rounded-full border-2', current && 'ring-4')}
                style={{
                  borderColor: done || current ? color : 'var(--line-strong)',
                  background: done ? color : current ? 'var(--surface)' : 'var(--surface)',
                  ['--tw-ring-color' as string]: `color-mix(in oklab, ${color} 22%, transparent)`,
                }}
                aria-current={current ? 'step' : undefined}
              />
              <span className={clsx('whitespace-nowrap text-[11.5px]', current ? 'font-semibold text-ink' : 'text-ink-3')}>
                {current && status === 'REOPENED' ? 'Reopened' : STATUS_LABEL[s]}
              </span>
            </span>
            {i < MAIN_PATH.length - 1 && (
              <span className="mx-1 mb-5 h-0.5 flex-1 rounded" style={{ background: i < currentIndex ? STATUS_VAR[MAIN_PATH[i + 1]] : 'var(--line)' }} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
