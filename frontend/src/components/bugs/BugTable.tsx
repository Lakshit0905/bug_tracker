import clsx from 'clsx'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { useNavigate } from 'react-router'
import type { SortField } from '../../api/endpoints'
import { CATEGORY_LABEL, dateTime, timeAgo } from '../../lib/format'
import type { BugListItem } from '../../types/api'
import { PersonChip, PriorityMark, SeverityMeter, StatusBadge } from '../ui/Badges'

interface Props {
  bugs: BugListItem[]
  sort: SortField
  order: 'asc' | 'desc'
  onSort: (field: SortField) => void
  compact?: boolean
}

function SortHeader({
  field,
  label,
  sort,
  order,
  onSort,
  className,
}: {
  field: SortField
  label: string
  sort: SortField
  order: 'asc' | 'desc'
  onSort: (f: SortField) => void
  className?: string
}) {
  const active = sort === field
  const Icon = !active ? ArrowUpDown : order === 'asc' ? ArrowUp : ArrowDown
  return (
    <th scope="col" aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        data-testid={`sort-${field}`}
        className={clsx('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}
      >
        {label}
        <Icon className={clsx('size-3', !active && 'opacity-40')} aria-hidden />
      </button>
    </th>
  )
}

export function BugTable({ bugs, sort, order, onSort, compact }: Props) {
  const navigate = useNavigate()
  const sh = { sort, order, onSort }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="bug-table">
        <thead>
          <tr className="border-b border-line text-left text-[12.5px] font-medium text-ink-3 [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
            <SortHeader field="id" label="Key" {...sh} className="w-[88px]" />
            <SortHeader field="title" label="Title" {...sh} />
            <SortHeader field="status" label="Status" {...sh} className="w-[120px]" />
            <SortHeader field="severity" label="Severity" {...sh} className="hidden w-[110px] md:table-cell" />
            <SortHeader field="priority" label="Priority" {...sh} className="hidden w-[100px] md:table-cell" />
            {!compact && <th scope="col" className="hidden w-[170px] lg:table-cell">Assignee</th>}
            <SortHeader field="updated_at" label="Updated" {...sh} className="hidden w-[110px] sm:table-cell" />
          </tr>
        </thead>
        <tbody>
          {bugs.map((b) => (
            <tr
              key={b.id}
              data-testid="bug-row"
              data-bug-key={b.key}
              onClick={() => navigate(`/bugs/${b.id}`)}
              className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2 [&>td]:px-3 [&>td]:py-2.5"
            >
              <td className="whitespace-nowrap text-[13px] text-ink-3 tabular-nums">
                <a
                  href={`/bugs/${b.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    navigate(`/bugs/${b.id}`)
                  }}
                  className="hover:text-accent hover:underline"
                >
                  {b.key}
                </a>
              </td>
              <td className="max-w-0">
                <div className="truncate font-medium text-ink" title={b.title}>
                  {b.title}
                </div>
                <div className="text-[12px] text-ink-3">{CATEGORY_LABEL[b.category]}</div>
              </td>
              <td>
                <StatusBadge status={b.status} />
              </td>
              <td className="hidden md:table-cell">
                <SeverityMeter severity={b.severity} />
              </td>
              <td className="hidden md:table-cell">
                <PriorityMark priority={b.priority} />
              </td>
              {!compact && (
                <td className="hidden max-w-0 lg:table-cell">
                  <PersonChip name={b.assignee?.full_name} />
                </td>
              )}
              <td className="hidden whitespace-nowrap text-[13px] text-ink-2 sm:table-cell" title={dateTime(b.updated_at)}>
                {timeAgo(b.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
