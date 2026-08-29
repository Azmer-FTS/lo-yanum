import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { bubbleDiameter, clusterByLocality } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker } from './MapView'
import { readToken } from './badges'
import type { MapMode } from './mapMode'
import { MapModeSwitch } from './mapMode'

/**
 * P0.2 — THE ROSTER GETS A MAP, AND IT COUNTS RATHER THAN LOCATES.
 *
 * The volunteers and drivers screens are the two rosters, and the question
 * they were bad at is geographic: "where do my people actually live". Sorting
 * a locality column answers it only if you already know which towns matter.
 *
 * So: one bubble per יישוב, its area proportional to the head count, the count
 * written inside. Tapping one filters the roster to that town, and the filter
 * COMPOSES with the KPI-filters above it — "kosher phones in Netivot" is two
 * taps — with the same "נקה" clearing all of them. There is deliberately no
 * per-person pin: the programme holds a home town, not a home address (see
 * `clusterByLocality`).
 *
 * WHY NOT `MapPanel`
 * ------------------
 * Both rosters are G7 WINDOW-virtualised tables: the page is the scroll
 * surface, and that is what lets 300 rows use the whole width of an iPad.
 * MapPanel's side-by-side shell puts the content in its own `overflow-y-auto`
 * column, which would take the window's scroll away and undo G7. The map is
 * therefore a BLOCK above the table that scrolls off with the rest of the
 * header — and it shares the three-state switch, the storage key space and the
 * mounted-but-hidden rule with MapPanel, so the two behave identically to the
 * hand.
 *
 * The bubble counts reflect every OTHER active filter but not the locality one
 * — otherwise picking a town would collapse the map to a single bubble and
 * there would be no way back to the neighbours.
 */
export interface PeopleMapProps {
  mode: MapMode
  onModeChange: (mode: MapMode) => void
  /** One entry per person, already filtered by everything except locality. */
  localities: readonly string[]
  /** The town currently filtering the roster, or null. */
  selected: string | null
  onSelect: (locality: string | null) => void
  ariaLabel: string
  /**
   * Which roster this is. Volunteers and drivers are told apart BY THE SCREEN
   * (the spec's own rule), so the distinction is one colour, not a legend.
   */
  tone: 'volunteers' | 'drivers'
}

const TONE_TOKEN: Record<PeopleMapProps['tone'], string> = {
  volunteers: '--accent',
  drivers: '--status-info',
}

export function PeopleMap({
  mode,
  onModeChange,
  localities,
  selected,
  onSelect,
  ariaLabel,
  tone,
}: PeopleMapProps) {
  const { t } = useTranslation()

  const { clusters, unplaced, unplacedCount, max } = useMemo(
    () => clusterByLocality(localities),
    [localities],
  )

  const markers: MapMarker[] = useMemo(() => {
    const color = readToken(TONE_TOKEN[tone])
    return clusters.map((c) => ({
      id: `loc-${c.locality}`,
      position: c.position,
      color,
      kind: 'bubble' as const,
      diameter: bubbleDiameter(c.count, max),
      badge: String(c.count),
      title: t('people.bubbleTitle', { locality: c.locality, count: c.count }),
      emphasis: selected === c.locality,
      onSelect: () => onSelect(selected === c.locality ? null : c.locality),
    }))
    // `mode` is in the deps on purpose: the token colours are read from the
    // computed style, and a theme switch re-renders the screen anyway, but a
    // mode change is what re-sizes the canvas the markers are drawn on.
  }, [clusters, max, selected, onSelect, tone, t, mode])

  return (
    <div className="mb-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <MapModeSwitch mode={mode} onChange={onModeChange} />
        {mode !== 'hidden' && (
          <p className="muted">
            {t('people.bubbleHint', { count: clusters.length })}
            {unplacedCount > 0 &&
              ` · ${t('people.bubbleUnplaced', {
                count: unplacedCount,
                towns: unplaced.join(', '),
              })}`}
          </p>
        )}
      </div>

      {mode !== 'hidden' && (
        <div
          className={`relative overflow-hidden rounded-card ${
            mode === 'full'
              ? 'h-[calc(100dvh-var(--shell-top)-var(--shell-bottom)-5rem)]'
              : 'h-[38dvh] min-h-64'
          }`}
        >
          <MapView
            ariaLabel={ariaLabel}
            className="h-full w-full rounded-card"
            markers={markers}
            fit
          />

          {selected !== null && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex justify-center">
              <button
                type="button"
                onClick={() => onSelect(null)}
                className="btn-secondary pointer-events-auto min-h-11 shadow-lift"
              >
                <Icon name="close" size={14} />
                {t('people.bubbleClear', { locality: selected })}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
