import { useTranslation } from 'react-i18next'

import { getGuardsPerWeek, getSignedGrowth } from '@core/index'
import type { GrowthPoint } from '@core/index'

import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { Icon } from './Icon'

/**
 * ORDRE DE NUIT 2026-09-02 (N6) — TWO GROWTH CHARTS ON THE DASHBOARD.
 *
 * ★ HAND-DRAWN SVG, NO LIBRARY. Two charts, twelve points each, in the app's
 *   own tokens: a charting library would be 60–150 kB gzipped on the one
 *   bundle this app cannot afford to grow (ETAT §12), for two lines and
 *   twelve bars. `currentColor` and the CSS variables do the theming, so
 *   light and dark are the same markup.
 *
 * ★ THE NUMBERS COME FROM THE STORE'S ACCESSORS (`getSignedGrowth`,
 *   `getGuardsPerWeek`), the same way every KPI on this screen does — the
 *   demo dataset supplies the history; a real programme's own history draws
 *   itself here the day it has one.
 *
 * ★ RTL: the axis runs oldest → newest from RIGHT to LEFT, the direction the
 *   page is read in, so "now" is where the eye arrives.
 */

const W = 320
const H = 120
const PAD = { top: 10, right: 6, bottom: 22, left: 6 }

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

function LineChart({ points, locale, colour }: { points: GrowthPoint[]; locale: string; colour: string }) {
  const n = points.length
  const max = Math.max(1, ...points.map((p) => p.cumulative))
  const yAt = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i, n).toFixed(1)},${yAt(p.cumulative).toFixed(1)}`).join(' ')
  const area = `${path} L${xAt(n - 1, n).toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${xAt(0, n).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`
  const last = points[n - 1]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-hidden="true" style={{ color: colour }}>
      <path d={area} fill="currentColor" opacity="0.12" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={p.key} cx={xAt(i, n)} cy={yAt(p.cumulative)} r={i === n - 1 ? 4 : 2.2} fill="currentColor" />
      ))}
      <text x={xAt(n - 1, n)} y={yAt(last.cumulative) - 8} textAnchor="middle" className="fill-content-primary" fontSize="11" fontWeight="700">
        {last.cumulative}
      </text>
      {points.map((p, i) =>
        i % 3 === 0 || i === n - 1 ? (
          <text key={p.key} x={xAt(i, n)} y={H - 6} textAnchor="middle" className="fill-content-muted" fontSize="9">
            {monthLabel(p.key, locale)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function BarChart({ points, locale, colour }: { points: GrowthPoint[]; locale: string; colour: string }) {
  const n = points.length
  const max = Math.max(1, ...points.map((p) => p.added))
  const slot = (W - PAD.left - PAD.right) / n
  const bw = Math.max(6, slot * 0.6)
  const yAt = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-hidden="true" style={{ color: colour }}>
      {points.map((p, i) => {
        const x = PAD.left + (n - 1 - i) * slot + (slot - bw) / 2
        const y = yAt(p.added)
        return (
          <g key={p.key}>
            <rect x={x} y={y} width={bw} height={H - PAD.bottom - y} rx="2" fill="currentColor" opacity={i === n - 1 ? 1 : 0.7} />
            {p.added > 0 && (
              <text x={x + bw / 2} y={y - 3} textAnchor="middle" className="fill-content-primary" fontSize="9" fontWeight="600">
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
    <div className="auto-cols gap-2.5 [--col-min:18rem]" data-testid="growth-charts">
      <div className="card card-pad min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-semibold text-content-primary">{t('dashboard.growth.signed')}</p>
          <span className="text-status-success-ink"><Icon name="document" size={15} /></span>
        </div>
        <p className="muted mb-2">{t('dashboard.growth.signedHint', { months: 12 })}</p>
        <LineChart points={signed.points} locale={locale} colour="rgb(var(--status-success))" />
        {signed.undated > 0 && (
          <p className="muted mt-1">{t('dashboard.growth.undated', { count: signed.undated })}</p>
        )}
      </div>
      <div className="card card-pad min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-semibold text-content-primary">{t('dashboard.growth.guards')}</p>
          <span className="text-accent-ink"><Icon name="shield" size={15} /></span>
        </div>
        <p className="muted mb-2">{t('dashboard.growth.guardsHint', { weeks: 12, count: guardsTotal })}</p>
        <BarChart points={guards} locale={locale} colour="rgb(var(--accent))" />
      </div>
    </div>
  )
}
