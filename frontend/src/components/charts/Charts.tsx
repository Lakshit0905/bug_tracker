/**
 * Charts follow the dataviz method: thin marks (2px lines, 4px rounded bar ends), validated categorical
 * slots 1–3 (CSS vars --series-*, stepped separately for dark mode), recessive grid, legend for ≥2 series,
 * hover tooltip on every chart, text in ink tokens (never the series colour), one y-axis only.
 */
import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { shortDate } from '../../lib/format'

const AXIS = { stroke: 'var(--ink-3)', fontSize: 12, tickLine: false, axisLine: false } as const

interface TooltipLike {
  active?: boolean
  label?: unknown
  payload?: readonly { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }[]
}

function TooltipCard({ active, payload, label, formatLabel }: TooltipLike & { formatLabel?: (l: string) => string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2 text-[12.5px] shadow-lg">
      <div className="mb-1 font-medium text-ink">{formatLabel ? formatLabel(String(label)) : String(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2 text-ink-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="flex-1">{String(p.name)}</span>
          <span className="font-medium tabular-nums text-ink">{String(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

function LegendRow({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

export function ChartFrame({ legend, children, height = 240, summary }: { legend?: ReactNode; children: ReactNode; height?: number; summary: string }) {
  return (
    <figure className="flex flex-col gap-3">
      {legend}
      <div style={{ height }} role="img" aria-label={summary}>
        {children}
      </div>
    </figure>
  )
}

// ------------------------------------------------------------------ trend (two series, one axis)

export function TrendChart({ points }: { points: { date: string; created: number; resolved: number }[] }) {
  const totalCreated = points.reduce((s, p) => s + p.created, 0)
  const totalResolved = points.reduce((s, p) => s + p.resolved, 0)
  return (
    <ChartFrame
      summary={`Over ${points.length} days, ${totalCreated} bugs were reported and ${totalResolved} resolved.`}
      legend={<LegendRow items={[{ label: `Reported (${totalCreated})`, color: 'var(--series-1)' }, { label: `Resolved (${totalResolved})`, color: 'var(--series-2)' }]} />}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={(d: string) => shortDate(`${d}T00:00:00`)} minTickGap={28} {...AXIS} />
          <YAxis allowDecimals={false} width={44} {...AXIS} />
          <Tooltip
            cursor={{ stroke: 'var(--line-strong)', strokeWidth: 1 }}
            content={(props: TooltipLike) => (
              <TooltipCard {...props} formatLabel={(l) => new Date(`${l}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} />
            )}
          />
          <Line type="linear" dataKey="created" name="Reported" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} />
          <Line type="linear" dataKey="resolved" name="Resolved" stroke="var(--series-2)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)' }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

// ------------------------------------------------------------------ stacked horizontal bars (≤ 3 series)

interface StackSeries {
  key: string
  label: string
  color: string
}

export function StackedBars({
  data,
  category,
  series,
  summary,
}: {
  data: Record<string, string | number>[]
  category: string
  series: StackSeries[]
  summary: string
}) {
  const height = Math.max(120, data.length * 36 + 24)
  return (
    <ChartFrame summary={summary} height={height} legend={<LegendRow items={series.map((s) => ({ label: s.label, color: s.color }))} />}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }} barCategoryGap={10}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} {...AXIS} />
          <YAxis type="category" dataKey={category} width={112} {...AXIS} tick={{ fill: 'var(--ink-2)', fontSize: 12.5 }} />
          <Tooltip cursor={{ fill: 'var(--sunken)' }} content={(props: TooltipLike) => <TooltipCard {...props} />} />
          <Legend content={() => null} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId="a"
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={2}
              radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
              maxBarSize={18}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

/** Single-series magnitude list — a chart where a chart is overkill (no legend; title names it). */
export function MeterList({ rows, total }: { rows: { label: string; value: number; color?: string; icon?: ReactNode }[]; total: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[110px_1fr_36px] items-center gap-3 text-[13px]">
          <span className="flex items-center gap-1.5 text-ink-2">
            {r.icon}
            {r.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full" style={{ width: total ? `${(r.value / total) * 100}%` : 0, background: r.color ?? 'var(--series-1)' }} />
          </span>
          <span className="text-right font-medium tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  )
}
