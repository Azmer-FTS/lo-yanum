import { useContext } from 'react'
import { useTranslation } from 'react-i18next'

import { regions } from '@core/index'
import type { RegionId } from '@core/index'

import { Icon } from './Icon'
import { FilterShape } from './primitives'

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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA1.4 (2026-09-07) — AND ON A PHONE IT LEAVES THE ROW ALTOGETHER.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Sur téléphone, le sélecteur de RÉGION quitte la rangée et devient un
 *     menu déroulant à part, chevron vers le bas, sur sa propre ligne. Douze
 *     régions ne tiennent pas en pastilles à 402 px. »
 *
 * ★ IT IS THE SAME `<select>` IN BOTH SHAPES, not two controls behind a
 *   breakpoint — the X5 lesson, and the reason `FilterShape` is a context
 *   rather than a prop: one element, one test id, one thing to keep in step.
 *   What changes is the skin around it: a pill on the row, or a full-width
 *   field on a line of its own with the chevron the shape promises.
 *
 * ⚠️ AND THE `<select>` IS THE HIT AREA, NOT THE LABEL AROUND IT. A pill's
 *    44 px target is drawn by a transparent `::before` (see `.filter-pill`),
 *    which for a button is exactly right and for a `<label>` wrapping a select
 *    would be a transparent lid over the control: the tap reaches the label,
 *    the label forwards a focus, and on iOS the wheel does not open. So the
 *    select is stretched over the whole target itself and the visible text is
 *    drawn under it — the tap lands on the control, always, at any point a
 *    thumb can reach.
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
  const { phone } = useContext(FilterShape)
  const active = value !== null
  const chosen = value === null ? null : regions().find((r) => r.id === value) ?? null

  const options = (
    <>
      <option value="all">{t('farms.regionAll')}</option>
      {regions().map((r) => {
        const n = counts?.[r.id]
        /**
         * ★★ Y8.3 (2026-09-06) — "Les régions sans aucun élément apparaissent
         *    grisées, pas masquées." Hiding an empty region makes the list
         *    change shape from one screen to the next, and a coordinator who
         *    knows there are thirteen and counts eleven has to work out which
         *    two are missing and why.
         *
         * ⚠️ AND IT IS NEVER DISABLED WHILE IT IS THE ACTIVE FILTER, or the
         *    control would show a selection the user cannot see selected.
         */
        const empty = n === 0 && value !== r.id
        return (
          <option key={r.id} value={r.id} disabled={empty}>
            {n === undefined ? r.name : `${r.name} (${n})`}
          </option>
        )
      })}
    </>
  )

  const select = (className: string) => (
    <select
      value={value ?? 'all'}
      onChange={(e) => onChange(e.target.value === 'all' ? null : (e.target.value as RegionId))}
      aria-label={t('farms.colRegionStd')}
      className={className}
    >
      {options}
    </select>
  )

  if (phone) {
    return (
      <label
        data-testid={testId}
        data-shape="block"
        className={`relative flex basis-full items-center gap-2 rounded-field border px-3
                    text-caption font-medium ${
                      active
                        ? 'border-accent bg-accent/15 text-accent-ink'
                        : 'border-edge-strong bg-surface-raised text-content-primary'
                    }`}
        style={{ minHeight: '2.75rem' }}
      >
        <Icon name="region" size={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {chosen
            ? counts?.[chosen.id] === undefined
              ? chosen.name
              : `${chosen.name} (${counts[chosen.id]})`
            : t('farms.regionAll')}
        </span>
        {/* The chevron the product owner named. Down, not forward: this opens
            a menu, it does not navigate. */}
        <span data-chevron="" className="shrink-0 text-content-muted">
          <Icon name="chevronDown" size={15} />
        </span>
        {select(
          'absolute inset-0 h-full w-full cursor-pointer opacity-0',
        )}
      </label>
    )
  }

  return (
    <label
      className={`filter-pill relative cursor-pointer ${active ? 'filter-pill-active' : ''}`}
      data-testid={testId}
      data-shape="pill"
    >
      <Icon name="region" size={13} className="shrink-0" />
      <span className="whitespace-nowrap">
        {chosen
          ? counts?.[chosen.id] === undefined
            ? chosen.name
            : `${chosen.name} (${counts[chosen.id]})`
          : t('farms.regionAll')}
      </span>
      <span data-chevron="" className="shrink-0 opacity-70">
        <Icon name="chevronDown" size={11} />
      </span>
      {/* AA1.4 — the control IS the target: stretched over the pill's own
          44 px hit area rather than sitting inside it, so a tap anywhere on
          the pill opens the picker. */}
      {select(
        'absolute inset-x-0 top-1/2 h-11 w-full -translate-y-1/2 cursor-pointer opacity-0',
      )}
    </label>
  )
}
