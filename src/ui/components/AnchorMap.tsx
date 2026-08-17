import { useEffect, useMemo, useState } from 'react'
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
 * decimal degrees. So "add a point" arms the map, the next click drops the pin,
 * a drag moves it, and the select degrades from "the only way in" to "a
 * shortcut for a point that already exists".
 *
 * Three screens share it — the wizard's first step, the farm detail, and the
 * anchor form — so the gesture is learned once and the pins look the same
 * everywhere they appear.
 *
 * Read-only is the default: pass `onCreate` / `onMove` to enable editing. Even
 * then placement is an ARMED MODE — see the comment on `arming` below. A map
 * that silently accepts pins wherever a coordinator happens to tap while panning
 * is worse than one that does nothing.
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
  /**
   * Enable point creation. Omit for a read-only map. The map still does not
   * accept a click until the user presses "add a point" — this only decides
   * whether that button exists at all.
   */
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

  /**
   * PLACEMENT IS AN ARMED MODE, NOT A LIVE CLICK (Lot 0.9 follow-up).
   *
   * Shipped first as "any click on the map drops a point", which is what made
   * the dead end impossible and also meant a mis-tap while panning created
   * junk. The product owner's answer: an explicit "add a point" button arms the
   * mode, the NEXT click places the pin, and the mode disarms itself
   * immediately afterwards — one button press buys exactly one point.
   *
   * Three things make the armed state legible rather than modal-feeling: the
   * canvas takes a crosshair cursor (a side effect of `onMapClick` being passed
   * at all, which is why it is passed ONLY while armed), the map gains an accent
   * ring, and the banner swaps its instruction. Escape cancels, because a mode
   * you cannot leave with the keyboard is a trap.
   */
  const [arming, setArming] = useState(false)

  useEffect(() => {
    if (!arming) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArming(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [arming])

  // Disarm when the map stops being about the same farm: an armed mode carried
  // across a farm change would drop the next point on the wrong one.
  useEffect(() => setArming(false), [farm.id])

  const place = (position: LatLng) => {
    onCreate?.(position)
    setArming(false)
  }

  const empty = anchors.length === 0

  return (
    <div className={`relative ${className}`}>
      <MapView
        ariaLabel={t('a11y.map')}
        className={`h-full w-full rounded-card transition-shadow duration-base ${
          arming ? 'ring-2 ring-accent' : ''
        }`}
        center={farm.position}
        zoom={13}
        markers={markers}
        onMapClick={onCreate && arming ? place : undefined}
      />

      {overlay && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
          <div className="pointer-events-auto">{overlay}</div>
        </div>
      )}

      {/* The control sits ON the map, because the map is what it is about. The
          empty case is louder on purpose: with no points yet, this banner IS
          the only route forward. */}
      {onCreate && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
          <div
            className={`pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card px-3.5 py-2.5 backdrop-blur ${
              arming || empty
                ? 'border border-accent bg-surface-overlay/95 shadow-glow'
                : 'border border-edge-subtle bg-surface-overlay/90 shadow-card'
            }`}
          >
            <span className="shrink-0 text-accent-ink">
              <Icon name={arming ? 'pin' : 'plus'} size={17} />
            </span>

            <p className="min-w-0 flex-1 text-caption text-content-secondary">
              <span className="font-semibold text-content-primary">
                {t(arming ? 'anchor.armedHint' : 'anchor.mapHintCreate')}
              </span>
              <span className="block text-micro text-content-muted">
                {arming
                  ? t('anchor.escToCancel')
                  : onMove && !empty
                    ? t('anchor.mapHintDrag')
                    : ''}
              </span>
            </p>

            {arming ? (
              <button
                type="button"
                onClick={() => setArming(false)}
                className="btn-secondary shrink-0 py-1.5 text-micro"
              >
                <Icon name="close" size={13} />
                {t('common.cancel')}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setArming(true)}
                className={`shrink-0 py-1.5 text-micro ${
                  empty ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                <Icon name="plus" size={13} />
                {t('anchor.addPoint')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
