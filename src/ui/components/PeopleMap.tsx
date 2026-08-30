import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { bubbleDiameter, clusterByLocality } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker } from './MapView'
import { readToken } from './badges'

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
 * P0bis.1 — THIS IS NOW JUST THE MAP; THE SHELL IS `MapSplit`.
 * ------------------------------------------------------------
 * P0.2 shipped it as a BLOCK ABOVE the table, and the reason was real: both
 * rosters are G7 WINDOW-virtualised tables, and MapPanel's content column has
 * its own `overflow-y-auto`, which takes the window's scroll away and makes
 * the virtualiser draw its rows a page above themselves. The product owner's
 * frozen rule is that the map is on the LEFT on every screen that has one, so
 * the fix was to give the shell a second scroll strategy rather than to give
 * this screen a second layout: `MapSplit scroll="page"` keeps the WINDOW as
 * the scroll container and makes the MAP column `sticky` instead. G7 is
 * untouched and the gabarit holds.
 *
 * The bubble counts reflect every OTHER active filter but not the locality one
 * — otherwise picking a town would collapse the map to a single bubble and
 * there would be no way back to the neighbours.
 */
export interface PeopleMapProps {
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
  }, [clusters, max, selected, onSelect, tone, t])

  return (
    <>
      <MapView
        ariaLabel={ariaLabel}
        className="h-full w-full rounded-none"
        markers={markers}
        fit
      />

      {/* The count of towns, and — this is the load-bearing half — the ones
          the gazetteer could not place. A locality outside `LOCALITY_POSITIONS`
          is REPORTED, never silently dropped: same contract as `distanceKm:
          null` in the dispatch scoring. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10">
        <p className="pointer-events-auto inline-block max-w-full rounded-card bg-surface-overlay/95 px-3 py-1.5 text-micro text-content-secondary shadow-card backdrop-blur">
          {t('people.bubbleHint', { count: clusters.length })}
          {unplacedCount > 0 &&
            ` · ${t('people.bubbleUnplaced', {
              count: unplacedCount,
              towns: unplaced.join(', '),
            })}`}
        </p>
      </div>

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
    </>
  )
}
