import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatCoords } from '@core/index'
import type { LatLng } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import { readToken } from './badges'

/**
 * G2 — A LOCATION IS ENTERED BY PLACING A PIN, NEVER BY TYPING DEGREES.
 *
 * The farm form used to ask for latitude and longitude in two number fields,
 * which nobody can fill from memory and everybody fills by opening another map
 * and copying digits across. This block IS that other map: click to place the
 * pin, drag to adjust, and the coordinates become a discreet read-out instead
 * of an input.
 *
 * Arming (decision 55) is scoped deliberately: while the field is EMPTY the map
 * is armed by itself — there is nothing a stray click can damage, and a
 * required press-then-click would be friction protecting nothing. Once a pin
 * exists, clicks are inert again; moving it is a drag, and re-placing it from
 * scratch takes the explicit "re-place" button, exactly one click's worth.
 */
export function PinMap({
  value,
  onChange,
  fallbackCenter,
  zoom = 14,
  emptyZoom = 10,
  error,
  className = 'h-[46dvh] min-h-[20rem] w-full',
}: {
  value: LatLng | null
  onChange: (position: LatLng) => void
  /** Where the map looks while no pin exists — the locality when known. */
  fallbackCenter: LatLng
  zoom?: number
  emptyZoom?: number
  error?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [rearming, setRearming] = useState(false)
  const armed = rearming || value === null

  // The camera is STATE, not a mirror of the pin: re-centring on every drag
  // would snap the map back under the user's finger (see decision 51). It
  // follows the locality only while there is no pin to disturb.
  const [center, setCenter] = useState<LatLng>(value ?? fallbackCenter)
  const centreKey = `${fallbackCenter.lat},${fallbackCenter.lng}`
  useEffect(() => {
    if (!value) setCenter(fallbackCenter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centreKey])

  useEffect(() => {
    if (!rearming) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRearming(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rearming])

  const place = (position: LatLng) => {
    onChange(position)
    setRearming(false)
  }

  return (
    <div>
      <div className={`relative ${className}`}>
        <MapView
          ariaLabel={t('a11y.map')}
          className={`h-full w-full rounded-card transition-shadow duration-base ${
            armed ? 'ring-2 ring-accent' : error ? 'ring-2 ring-status-danger' : ''
          }`}
          center={center}
          zoom={value ? zoom : emptyZoom}
          onMapClick={armed ? place : undefined}
          markers={
            value
              ? [
                  {
                    id: 'pin',
                    position: value,
                    color: readToken('--accent'),
                    title: t('pin.markerLabel'),
                    kind: 'pin' as const,
                    draggable: true,
                    onDragEnd: place,
                  },
                ]
              : []
          }
        />

        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10">
          <div
            className={`pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card px-3.5 py-2.5 backdrop-blur ${
              armed
                ? 'border border-accent bg-surface-overlay/95 shadow-glow'
                : 'border border-edge-subtle bg-surface-overlay/90 shadow-card'
            }`}
          >
            <span className="shrink-0 text-accent-ink">
              <Icon name="pin" size={17} />
            </span>

            <p className="min-w-0 flex-1 text-caption text-content-secondary">
              <span className="font-semibold text-content-primary">
                {t(armed ? 'pin.placeHint' : 'pin.dragHint')}
              </span>
              {/* The coordinates survive as a READ-OUT: still visible for the
                  phone call where a farmer dictates or checks them, no longer
                  an input anybody has to fill. */}
              <span className="block text-micro text-content-muted">
                {rearming ? (
                  t('anchor.escToCancel')
                ) : value ? (
                  <span className="ltr-nums" dir="ltr">
                    {formatCoords(value)}
                  </span>
                ) : (
                  ''
                )}
              </span>
            </p>

            {rearming ? (
              <button
                type="button"
                onClick={() => setRearming(false)}
                className="btn-secondary shrink-0 py-1.5 text-micro"
              >
                <Icon name="close" size={13} />
                {t('common.cancel')}
              </button>
            ) : (
              value && (
                <button
                  type="button"
                  onClick={() => setRearming(true)}
                  className="btn-secondary shrink-0 py-1.5 text-micro"
                >
                  <Icon name="pin" size={13} />
                  {t('pin.rePlace')}
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-1 text-micro text-status-danger-ink">{error}</p>
      )}
    </div>
  )
}
