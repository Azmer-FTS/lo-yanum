import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import type { AnchorPoint, Farm, LatLng } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker } from './MapView'
import { readStatusColor, readToken } from './badges'

/**
 * F2 / F6 — THE MAP THAT CREATES ANCHOR POINTS.
 *
 * This exists because of a dead end. A guard needs an anchor point, the anchor
 * point was a required `<select>`, and a farm that had none rendered that
 * select EMPTY — with no way to add one without leaving the wizard, losing the
 * half-filled form, and coming back. The field was mandatory and unsatisfiable
 * at the same time, which is not a validation rule, it is a wall.
 *
 * The fix is not a better error message. It is to make the map the instrument:
 * a coordinator on the phone with a farmer is looking at the farm anyway, and
 * "where do they stand?" is a question you answer by pointing, not by typing two
 * decimal degrees. So a click drops a point, a drag moves it, and the select
 * degrades from "the only way in" to "a shortcut for a point that already
 * exists".
 *
 * Three screens share it — the wizard's first step, the farm detail, and the
 * anchor form — so the gesture is learned once and the pins look the same
 * everywhere they appear.
 *
 * Read-only is the default: pass `onCreate` / `onMove` to arm it. A map that
 * silently accepts pins wherever a coordinator happens to tap while panning is
 * worse than one that does nothing.
 */

export interface AnchorMapProps {
  farm: Farm
  anchors: AnchorPoint[]
  /**
   * Anchors attached to the guard being composed, in order. The FIRST is the
   * rendezvous, and each carries its rank as a badge on the pin — a group that
   * covers two positions has to be able to see which one the driver goes to.
   */
  chosenIds?: string[]
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Arm click-to-place. Omit for a read-only map. */
  onCreate?: (position: LatLng) => void
  /** Arm drag-to-move. Omit to pin the points where they are. */
  onMove?: (id: string, position: LatLng) => void
  className?: string
  /** Extra controls floated over the top of the map. */
  overlay?: React.ReactNode
}

export function AnchorMap({
  farm,
  anchors,
  chosenIds = [],
  selectedId = null,
  onSelect,
  onCreate,
  onMove,
  className = 'h-full w-full',
  overlay,
}: AnchorMapProps) {
  const { t } = useTranslation()

  /**
   * Memoised on a SIGNATURE, not on the array.
   *
   * MapCanvas tears down and rebuilds every marker whenever this prop changes
   * identity, so a fresh array on each render means the pins are destroyed and
   * recreated on every keystroke in the panel next to the map. The signature
   * covers exactly what changes a pin's appearance or position.
   */
  const signature = [
    farm.id,
    farm.status,
    `${farm.position.lat},${farm.position.lng}`,
    anchors
      .map((a) => `${a.id}:${a.name}:${a.position.lat},${a.position.lng}`)
      .join('|'),
    chosenIds.join(','),
    selectedId ?? '',
    onMove ? 'drag' : 'fixed',
  ].join('#')

  const markers: MapMarker[] = useMemo(
    () => [
      {
        id: farm.id,
        position: farm.position,
        color: readStatusColor(farm.status),
        title: farm.name,
        subtitle: farm.locality,
        kind: 'farm' as const,
      },
      ...anchors.map((anchor) => {
        const rank = chosenIds.indexOf(anchor.id)
        return {
          id: anchor.id,
          position: anchor.position,
          color: readToken('--accent'),
          title: anchor.name,
          subtitle: t('anchor.title'),
          kind: 'anchor' as const,
          // Emphasis means "this one is in play": chosen for the guard, or
          // open in the panel beside the map.
          emphasis: rank >= 0 || anchor.id === selectedId,
          badge: rank >= 0 ? String(rank + 1) : undefined,
          draggable: Boolean(onMove),
          onDragEnd: onMove
            ? (position: LatLng) => onMove(anchor.id, position)
            : undefined,
          onSelect: onSelect ? () => onSelect(anchor.id) : undefined,
        }
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  )

  return (
    <div className={`relative ${className}`}>
      <MapView
        ariaLabel={t('a11y.map')}
        className="h-full w-full rounded-card"
        center={farm.position}
        zoom={13}
        markers={markers}
        onMapClick={onCreate}
      />

      {overlay && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
          <div className="pointer-events-auto">{overlay}</div>
        </div>
      )}

      {/* The instruction sits ON the map, because that is the thing it is
          talking about. The empty case is louder on purpose: with no points
          yet, this banner IS the only route forward. */}
      {onCreate && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
          <div
            className={`pointer-events-auto flex items-center gap-2.5 rounded-card px-3.5 py-2.5 backdrop-blur ${
              anchors.length === 0
                ? 'border border-accent bg-surface-overlay/95 shadow-glow'
                : 'border border-edge-subtle bg-surface-overlay/90 shadow-card'
            }`}
          >
            <span className="shrink-0 text-accent-ink">
              <Icon name={anchors.length === 0 ? 'plus' : 'pin'} size={17} />
            </span>
            <p className="min-w-0 text-caption text-content-secondary">
              <span className="font-semibold text-content-primary">
                {t('anchor.mapHintCreate')}
              </span>
              {onMove && anchors.length > 0 && (
                <span className="block text-micro text-content-muted">
                  {t('anchor.mapHintDrag')}
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
