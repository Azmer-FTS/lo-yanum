import { useId, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { getGuardsPerWeek, getSignedGrowth } from '@core/index'
import type { GrowthPoint } from '@core/index'

import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { Icon } from './Icon'

/**
 * ORDRE DE NUIT 2026-09-02 (N6) → U3 — TWO GROWTH CHARTS ON THE DASHBOARD,
 * ONE UNDER THE OTHER, AND MADE BEAUTIFUL.
 *
 * ★ HAND-DRAWN SVG, NO LIBRARY. Two charts, twelve points each, in the app's
 *   own tokens: a charting library would be 60–150 kB gzipped on the one
 *   bundle this app cannot afford to grow (ETAT §12), for one area and
 *   twelve bars. `currentColor` and the CSS variables do the theming, so
 *   light and dark are the same markup.
 *
 * ★ U3 (the product owner's return): a SMOOTH area with a soft gradient,
 *   ROUNDED bars, three faint gridlines instead of axes, the value on hover
 *   or touch (a vertical guide and a small label follow the pointer), and a
 *   short entrance — the area grows out of the baseline, the bars rise one
 *   after the other. `prefers-reduced-motion` turns the entrance off.
 *
 * ★ THE NUMBERS COME FROM THE STORE'S ACCESSORS (`getSignedGrowth`,
 *   `getGuardsPerWeek`), the same way every KPI on this screen does.
 *
 * ★ RTL: the axis runs oldest → newest from RIGHT to LEFT, the direction the
 *   page is read in, so "now" is where the eye arrives.
 */

const W = 320
const H = 132
const PAD = { top: 22, right: 8, bottom: 22, left: 8 }

function monthLabel(key: string, locale: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short' })
}

function weekLabel(key: string, locale: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale, { day: 'numeric', month: 'numeric' })
}

/** x for index i, oldest at the right. */
const xAt = (i: number, n: number): number =>
  PAD.left + ((n - 1 - i) / Math.max(1, n - 1)) * (W - PAD.left - PAD.right)

const baseline = H - PAD.bottom

/**
 * A MONOTONE cubic spline (Fritsch–Carlson) through the points, as cubic
 * Béziers. Catmull-Rom overshoots: a cumulative series that steps 4 → 4 → 3
 * was drawn rising above 4 between the two equal points, which on a chart
 * of signed entities is a lie. Monotone tangents never cross the data.
 */
function smoothPath(pts: Array<[number, number]>): string {
  const n = pts.length
  if (n < 2) return pts.map(([x, y]) => `M${x},${y}`).join(' ')
  const dx: number[] = []
  const dy: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    dy.push(pts[i + 1][1] - pts[i][1])
    m.push(dx[i] === 0 ? 0 : dy[i] / dx[i])
  }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2)
  }
  t.push(m[n - 2])
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / m[i]
    const b = t[i + 1] / m[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      t[i] = (3 * a) / h * m[i]
      t[i + 1] = (3 * b) / h * m[i]
    }
  }
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const h = dx[i]
    d += ` C${(x0 + h / 3).toFixed(1)},${(y0 + (t[i] * h) / 3).toFixed(1)} ${(x1 - h / 3).toFixed(1)},${(y1 - (t[i + 1] * h) / 3).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`
  }
  return d
}

/** Where the pointer is, as the nearest point index — shared by both charts. */
function useNearest(n: number) {
  const [index, setIndex] = useState<number | null>(null)
  const onMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xAt(i, n) - x)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    setIndex(best)
  }
  return { index, onMove, clear: () => setIndex(null) }
}

function Gridlines({ max }: { max: number }) {
  const steps = [0.5, 1]
  return (
    <g className="stroke-edge-subtle" strokeWidth="1" strokeDasharray="2 3">
      {steps.map((s) => {
        const y = PAD.top + (1 - s) * (baseline - PAD.top)
        return <line key={s} x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} />
      })}
      <line x1={PAD.left} x2={W - PAD.right} y1={baseline} y2={baseline} strokeDasharray="0" className="stroke-edge-strong" />
      <text x={W - PAD.right} y={PAD.top - 6} textAnchor="end" fontSize="8" className="fill-content-muted">
        {max}
      </text>
    </g>
  )
}

function Tooltip({ x, y, label, value }: { x: number; y: number; label: string; value: string }) {
  const w = 62
  const left = Math.min(Math.max(PAD.left, x - w / 2), W - PAD.right - w)
  const top = Math.max(2, y - 34)
  return (
    <g className="pointer-events-none">
      <line x1={x} x2={x} y1={PAD.top} y2={baseline} className="stroke-content-muted/50" strokeWidth="1" strokeDasharray="3 2" />
      <rect x={left} y={top} width={w} height={26} rx="6" className="fill-surface-overlay stroke-edge-subtle" strokeWidth="1" />
      <text x={left + w / 2} y={top + 11} textAnchor="middle" fontSize="8.5" className="fill-content-muted">
        {label}
      </text>
      <text x={left + w / 2} y={top + 22} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-content-primary">
        {value}
      </text>
    </g>
  )
}

function AreaChart({ points, locale, colour }: { points: GrowthPoint[]; locale: string; colour: string }) {
  const id = useId()
  const n = points.length
  const max = Math.max(1, ...points.map((p) => p.cumulative))
  const yAt = (v: number) => PAD.top + (1 - v / max) * (baseline - PAD.top)
  const pts: Array<[number, number]> = points.map((p, i) => [xAt(i, n), yAt(p.cumulative)])
  const line = smoothPath(pts)
  const area = `${line} L${xAt(n - 1, n).toFixed(1)},${baseline} L${xAt(0, n).toFixed(1)},${baseline} Z`
  const last = points[n - 1]
  const hover = useNearest(n)
  const hi = hover.index

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-pan-y select-none"
      role="img"
      aria-hidden="true"
      style={{ color: colour }}
      onPointerMove={hover.onMove}
      onPointerDown={hover.onMove}
      onPointerLeave={hover.clear}
      data-testid="chart-area"
    >
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.38" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <Gridlines max={max} />
      <g className="chart-rise" style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}>
        <path d={area} fill={`url(#${id}-fill)`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      {points.map((p, i) => (
        <circle
          key={p.key}
          cx={xAt(i, n)}
          cy={yAt(p.cumulative)}
          r={i === hi ? 4.5 : i === n - 1 ? 4 : 2.2}
          fill="currentColor"
          className="stroke-surface-raised"
          strokeWidth={i === hi ? 2 : 0}
        />
      ))}
      {hi === null && (
        <text x={xAt(n - 1, n)} y={yAt(last.cumulative) - 9} textAnchor="middle" className="fill-content-primary" fontSize="11" fontWeight="700">
          {last.cumulative}
        </text>
      )}
      {points.map((p, i) =>
        i % 3 === 0 || i === n - 1 ? (
          <text key={p.key} x={xAt(i, n)} y={H - 6} textAnchor="middle" className="fill-content-muted" fontSize="9">
            {monthLabel(p.key, locale)}
          </text>
        ) : null,
      )}
      {hi !== null && (
        <Tooltip
          x={xAt(hi, n)}
          y={yAt(points[hi].cumulative)}
          label={monthLabel(points[hi].key, locale)}
          value={String(points[hi].cumulative)}
        />
      )}
    </svg>
  )
}

function BarChart({ points, locale, colour }: { points: GrowthPoint[]; locale: string; colour: string }) {
  const id = useId()
  const n = points.length
  const max = Math.max(1, ...points.map((p) => p.added))
  const slot = (W - PAD.left - PAD.right) / n
  const bw = Math.max(8, slot * 0.62)
  const yAt = (v: number) => PAD.top + (1 - v / max) * (baseline - PAD.top)
  const hover = useNearest(n)
  const hi = hover.index

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-pan-y select-none"
      role="img"
      aria-hidden="true"
      style={{ color: colour }}
      onPointerMove={hover.onMove}
      onPointerDown={hover.onMove}
      onPointerLeave={hover.clear}
      data-testid="chart-bars"
    >
      <defs>
        <linearGradient id={`${id}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <Gridlines max={max} />
      {points.map((p, i) => {
        const x = PAD.left + (n - 1 - i) * slot + (slot - bw) / 2
        const y = yAt(p.added)
        const h = Math.max(p.added > 0 ? 3 : 0, baseline - y)
        return (
          <g key={p.key}>
            <rect
              x={x}
              y={baseline - h}
              width={bw}
              height={h}
              rx="3"
              fill={`url(#${id}-bar)`}
              opacity={hi === null ? (i === n - 1 ? 1 : 0.85) : hi === i ? 1 : 0.5}
              className="chart-rise"
              style={{ transformBox: 'fill-box', transformOrigin: 'bottom', animationDelay: `${(n - 1 - i) * 35}ms` }}
            />
            {hi === null && p.added > 0 && (
              <text x={x + bw / 2} y={y - 4} textAnchor="middle" className="fill-content-primary" fontSize="9" fontWeight="600">
                {p.added}
              </text>
            )}
          </g>
        )
      })}
      {points.map((p, i) =>
        i % 3 === 0 || i === n - 1 ? (
          <text key={p.key} x={PAD.left + (n - 1 - i) * slot + slot / 2} y={H - 6} textAnchor="middle" className="fill-content-muted" fontSize="9">
            {weekLabel(p.key, locale)}
          </text>
        ) : null,
      )}
      {hi !== null && (
        <Tooltip
          x={PAD.left + (n - 1 - hi) * slot + slot / 2}
          y={yAt(points[hi].added)}
          label={weekLabel(points[hi].key, locale)}
          value={String(points[hi].added)}
        />
      )}
    </svg>
  )
}

export function GrowthCharts() {
  const { t } = useTranslation()
  const locale = useLocale()
  const signed = useCoreValue(() => getSignedGrowth(12))
  const guards = useCoreValue(() => getGuardsPerWeek(12))
  const guardsTotal = guards.reduce((s, p) => s + p.added, 0)

  return (
    // U3 — one under the other, by the product owner's order; never side by side.
    <div className="flex flex-col gap-2.5" data-testid="growth-charts">
      <div className="card card-pad min-w-0 bg-status-success/[0.05]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-semibold text-content-primary">{t('dashboard.growth.signed')}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-field bg-status-success/15 text-status-success-ink">
            <Icon name="document" size={16} />
          </span>
        </div>
        <p className="muted mb-1">{t('dashboard.growth.signedHint', { months: 12 })}</p>
        <AreaChart points={signed.points} locale={locale} colour="rgb(var(--status-success))" />
        {signed.undated > 0 && (
          <p className="muted mt-1">{t('dashboard.growth.undated', { count: signed.undated })}</p>
        )}
      </div>
      <div className="card card-pad min-w-0 bg-accent/[0.05]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-semibold text-content-primary">{t('dashboard.growth.guards')}</p>
          <span className="flex h-8 w-8 items-center justify-center rounded-field bg-accent/15 text-accent-ink">
            <Icon name="shield" size={16} />
          </span>
        </div>
        <p className="muted mb-1">{t('dashboard.growth.guardsHint', { weeks: 12, count: guardsTotal })}</p>
        <BarChart points={guards} locale={locale} colour="rgb(var(--accent))" />
      </div>
    </div>
  )
}
