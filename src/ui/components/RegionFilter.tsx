import { useTranslation } from 'react-i18next'

import { REGIONS } from '@core/index'
import type { RegionId } from '@core/index'

import { Icon } from './Icon'

/**
 * ★ X12.4 (2026-09-04) — FILTERING BY REGION IS A PICKER, NOT THIRTEEN PILLS.
 *
 * Every other filter on these screens is a pill because there are three or
 * four of them and a pill carries its own count. Thirteen would be a second
 * scrolling row above every roster — longer than the incident log's twelve
 * farm pills, which D7.3 deleted for exactly this reason.
 *
 * So it is one control that reads as a pill and behaves as a `<select>`: the
 * native picker, which on iPadOS is a full-height wheel a thumb can actually
 * drive, wrapped in the filter row's own skin. It wears `filter-pill-active`
 * once something is chosen, so a set filter is as visible as any other.
 *
 * `all` is the empty value rather than `''`, because an empty `<option>` value
 * on iOS renders as a blank row in the wheel.
 */
export function RegionFilter({
  value,
  onChange,
  /** Number of records per region, so a choice is never a wasted tap (D7.3). */
  counts,
  testId = 'region-filter',
}: {
  value: RegionId | null
  onChange: (next: RegionId | null) => void
  counts?: Partial<Record<RegionId, number>>
  testId?: string
}) {
  const { t } = useTranslation()
  const active = value !== null

  return (
    <label
      className={`filter-pill relative cursor-pointer ${active ? 'filter-pill-active' : ''}`}
      data-testid={testId}
    >
      <Icon name="region" size={13} className="shrink-0" />
      <select
        value={value ?? 'all'}
        onChange={(e) => onChange(e.target.value === 'all' ? null : (e.target.value as RegionId))}
        aria-label={t('farms.colRegionStd')}
        /* `appearance-none` + `bg-transparent`: the pill IS the control's
           skin, and a native select chrome inside it would be a second
           border. The picker itself is still the platform's. */
        className="cursor-pointer appearance-none bg-transparent pe-1 text-micro font-medium
                   text-inherit outline-none"
      >
        <option value="all">{t('farms.regionAll')}</option>
        {REGIONS.map((r) => {
          const n = counts?.[r.id]
          return (
            <option key={r.id} value={r.id}>
              {n === undefined ? r.name : `${r.name} (${n})`}
            </option>
          )
        })}
      </select>
    </label>
  )
}
