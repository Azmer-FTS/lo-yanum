import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { statusLegend } from '@core/index'
import type { FarmStatus } from '@core/index'

import { FarmStatusDot } from './badges'
import { readBlockOpen, writeBlockOpen } from './primitives'

/**
 * ★★ BD 5 — les statuts PRÉSENTS sur la carte, avec leur compte ; les autres
 * derrière « הצג את כל הסטטוסים » (déplié : mémorisé, comme la légende). Les
 * comptes sont ceux des épingles que la carte dessine (`statuses`).
 */
export function StatusLegend({ statuses }: { statuses: readonly FarmStatus[] }) {
  const { t } = useTranslation()
  const { present, empty } = statusLegend(statuses)
  const [all, setAll] = useState(() => readBlockOpen('map-legend-all-statuses', false))
  const row = (status: FarmStatus, count: number) => (
    <li key={status} className="flex items-center gap-2" data-testid={`legend-status-${status}`} data-count={count}>
      <FarmStatusDot status={status} />
      <span className={`text-caption ${count > 0 ? 'text-content-secondary' : 'text-content-muted'}`}>{t(`farmStatus.${status}`)}</span>
      <span className="numeric ms-auto ps-3 text-caption text-content-muted">{count}</span>
    </li>
  )
  return (
    <div data-testid="status-legend" data-present={present.length} data-empty={empty.length}>
      <ul className="flex flex-col gap-1.5">
        {present.map((r) => row(r.status, r.count))}
        {all && empty.map((s) => row(s, 0))}
      </ul>
      {empty.length > 0 && (
        <button
          type="button"
          className="mt-1 min-h-8 rounded-field px-1 text-micro font-semibold text-accent-ink hover:bg-surface-high"
          aria-expanded={all}
          data-testid="status-legend-all"
          onClick={() => {
            writeBlockOpen('map-legend-all-statuses', !all)
            setAll(!all)
          }}
        >
          {all ? t('map.legendFewerStatuses') : t('map.legendAllStatuses', { count: empty.length })}
        </button>
      )}
    </div>
  )
}
