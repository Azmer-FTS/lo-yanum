import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatCoords } from '@core/index'
import type { AnchorPoint, Farm, LatLng } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker } from './MapView'
import { MarkerSwatch, farmMarkerColor, postColor, readToken } from './badges'
import { FullscreenToggle, fullscreenShell, useMapFullscreen } from './fullscreen'

/**
 * G8 — MEETING POINTS ARE WHERE THE CAR GOES; THE GUARD POST IS WHERE THE
 * GUARD STANDS.
 *
 * The reality this encodes: a private car leaves town from ONE pickup point
 * where the group boards, and stops at the farm's gate or track head — the
 * farmer's 4×4, or feet, cover the last stretch. Navigation in every generated
 * message points at these two, never at the post.
 */

/** The meeting-point colour — the palette's lake blue, in both themes. */
export function meetColor(): string {
  return readToken('--status-info')
}

export interface MeetPoints {
  pickupPoint: LatLng | null
  /** Null = the farm's own pin. */
  dropoffPoint: LatLng | null
  /** Null = the outbound points, inverted (the default). */
  returnPickupPoint: LatLng | null
  returnDropoffPoint: LatLng | null
}

type Armed = 'pickup' | 'returnPickup' | 'returnDropoff' | null

export function MeetPointsEditor({
  farm,
  anchors,
  value,
  onChange,
  className = 'h-[40dvh] min-h-[18rem] w-full',
}: {
  farm: Farm
  /** The guard posts already chosen, for context — not editable here. */
  anchors: AnchorPoint[]
  value: MeetPoints
  onChange: (v: MeetPoints) => void
  className?: string
}) {
  const { t } = useTranslation()
  const [armed, setArmed] = useState<Armed>(null)
  // G7bis.2 — an armed placement owns Esc; an idle Esc leaves fullscreen.
  const fullscreen = useMapFullscreen(armed !== null)
  const [customReturn, setCustomReturn] = useState(
    value.returnPickupPoint !== null || value.returnDropoffPoint !== null,
  )

  const dropoffEffective = value.dropoffPoint ?? farm.position

  useEffect(() => {
    if (!armed) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmed(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [armed])

  const place = (position: LatLng) => {
    if (armed === 'pickup') onChange({ ...value, pickupPoint: position })
    if (armed === 'returnPickup')
      onChange({ ...value, returnPickupPoint: position })
    if (armed === 'returnDropoff')
      onChange({ ...value, returnDropoffPoint: position })
    setArmed(null)
  }

  const markers: MapMarker[] = [
    {
      id: farm.id,
      position: farm.position,
      color: farmMarkerColor(),
      title: farm.name,
      subtitle: farm.locality,
      kind: 'farm',
    },
    ...anchors.map((a, i) => ({
      id: a.id,
      position: a.position,
      color: postColor(),
      title: a.name,
      subtitle: t('anchor.title'),
      kind: 'anchor' as const,
      badge: String(i + 1),
    })),
    // The farm-side stop. Always present (defaults to the farm pin), always
    // draggable — adjusting it IS the common gesture.
    {
      id: 'dropoff',
      position: dropoffEffective,
      color: meetColor(),
      title: t('meet.dropoff'),
      subtitle: value.dropoffPoint ? undefined : t('meet.dropoffDefault'),
      kind: 'car' as const,
      draggable: true,
      onDragEnd: (position: LatLng) =>
        onChange({ ...value, dropoffPoint: position }),
    },
    ...(value.pickupPoint
      ? [
          {
            id: 'pickup',
            position: value.pickupPoint,
            color: meetColor(),
            title: t('meet.pickup'),
            kind: 'car' as const,
            emphasis: true,
            draggable: true,
            onDragEnd: (position: LatLng) =>
              onChange({ ...value, pickupPoint: position }),
          },
        ]
      : []),
    ...(customReturn && value.returnPickupPoint
      ? [
          {
            id: 'return-pickup',
            position: value.returnPickupPoint,
            color: meetColor(),
            title: t('meet.returnPickup'),
            kind: 'car' as const,
            draggable: true,
            onDragEnd: (position: LatLng) =>
              onChange({ ...value, returnPickupPoint: position }),
          },
        ]
      : []),
    ...(customReturn && value.returnDropoffPoint
      ? [
          {
            id: 'return-dropoff',
            position: value.returnDropoffPoint,
            color: meetColor(),
            title: t('meet.returnDropoff'),
            kind: 'car' as const,
            draggable: true,
            onDragEnd: (position: LatLng) =>
              onChange({ ...value, returnDropoffPoint: position }),
          },
        ]
      : []),
  ]

  return (
    // G7bis.2 — the fullscreen shell wraps the TOOLBAR AND the map together:
    // the buttons are the editing tools, and a fullscreen map whose tools
    // stayed behind on the page would be a picture again.
    <div
      className={
        fullscreen.active
          ? `${fullscreenShell(true, '')} flex flex-col`
          : undefined
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {value.pickupPoint ? (
          <button
            type="button"
            onClick={() => onChange({ ...value, pickupPoint: null })}
            className="btn-secondary py-1.5 text-micro"
          >
            <Icon name="close" size={13} />
            {t('meet.removePickup')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setArmed(armed === 'pickup' ? null : 'pickup')}
            className={`py-1.5 text-micro ${armed === 'pickup' ? 'btn-primary' : 'btn-secondary'}`}
          >
            <Icon name="pin" size={13} />
            {t('meet.setPickup')}
          </button>
        )}

        {value.dropoffPoint && (
          <button
            type="button"
            onClick={() => onChange({ ...value, dropoffPoint: null })}
            className="btn-secondary py-1.5 text-micro"
          >
            <Icon name="history" size={13} />
            {t('meet.resetDropoff')}
          </button>
        )}

        <label className="ms-auto flex items-center gap-2 text-caption text-content-secondary">
          <input
            type="checkbox"
            className="check"
            checked={!customReturn}
            onChange={(e) => {
              const inverted = e.target.checked
              setCustomReturn(!inverted)
              onChange(
                inverted
                  ? {
                      ...value,
                      returnPickupPoint: null,
                      returnDropoffPoint: null,
                    }
                  : {
                      ...value,
                      // Seed the custom return with the inverted defaults so
                      // the pins exist and can simply be dragged.
                      returnPickupPoint: dropoffEffective,
                      returnDropoffPoint: value.pickupPoint,
                    },
              )
            }}
          />
          {t('meet.returnInverted')}
        </label>
      </div>

      <div className={fullscreen.active ? 'relative min-h-0 flex-1' : 'relative'}>
        <MapView
          ariaLabel={t('a11y.map')}
          className={`${
            fullscreen.active ? 'h-full w-full' : className
          } rounded-card transition-shadow duration-base ${
            armed ? 'ring-2 ring-accent' : ''
          }`}
          center={farm.position}
          zoom={11}
          markers={markers}
          onMapClick={armed ? place : undefined}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-end p-3">
          <FullscreenToggle
            active={fullscreen.active}
            onToggle={fullscreen.toggle}
          />
        </div>
        {armed && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
            {/* The armed-mode ring comes from shadow-glow's 1px accent spread. */}
            <div className="pointer-events-auto flex items-center gap-3 rounded-card bg-surface-overlay/95 px-3.5 py-2.5 shadow-glow backdrop-blur">
              <span className="shrink-0 text-accent-ink">
                <Icon name="pin" size={17} />
              </span>
              <p className="min-w-0 flex-1 text-caption font-semibold text-content-primary">
                {t('meet.armedHint')}
                <span className="block text-micro font-normal text-content-muted">
                  {t('anchor.escToCancel')}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setArmed(null)}
                className="btn-secondary shrink-0 py-1.5 text-micro"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-1.5">
          <Icon name="pin" size={13} />
          {t('meet.pickup')}:{' '}
          {value.pickupPoint ? (
            <span className="ltr-nums" dir="ltr">
              {formatCoords(value.pickupPoint)}
            </span>
          ) : (
            t('meet.notSet')
          )}
        </span>
        <span className="flex items-center gap-1.5">
          {t('meet.dropoff')}:{' '}
          <span className="ltr-nums" dir="ltr">
            {formatCoords(dropoffEffective)}
          </span>
          {!value.dropoffPoint && ` (${t('meet.dropoffDefault')})`}
        </span>
      </p>
    </div>
  )
}

/** Legend chip used wherever the three point kinds share a map. */
export function PointLegend({
  showPost = true,
  showMeet = true,
  showFarm = false,
  className = '',
}: {
  showPost?: boolean
  showMeet?: boolean
  showFarm?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <div
      className={`pointer-events-none flex flex-col gap-1 rounded-field border border-edge-subtle bg-surface-overlay/90 px-2.5 py-2 shadow-card backdrop-blur ${className}`}
    >
      {/* G7bis.1 — each entry repeats its marker's SHAPE: forest disc for the
          farm, amber pin for a guard post, blue pin for the car's stops. */}
      {showFarm && (
        <span className="flex items-center gap-1.5 text-micro text-content-secondary">
          <MarkerSwatch shape="disc" color={farmMarkerColor()} />
          {t('meet.legendFarm')}
        </span>
      )}
      {showPost && (
        <span className="flex items-center gap-1.5 text-micro text-content-secondary">
          <MarkerSwatch shape="pin" color={postColor()} />
          {t('anchor.title')}
        </span>
      )}
      {showMeet && (
        <span className="flex items-center gap-1.5 text-micro text-content-secondary">
          <MarkerSwatch shape="pin" color={meetColor()} />
          {t('meet.pickup')}
        </span>
      )}
    </div>
  )
}
