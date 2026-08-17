import { useTranslation } from 'react-i18next'

import type { FarmZone, FarmZoneKind } from '@core/index'

import type { MapPolygon } from './MapView'
import { readToken } from './badges'

/**
 * G1 — the zone vocabulary, shared by every map that shows a farm's ground.
 *
 * Colour comes from the two `--zone-*` theme tokens so light and dark each get
 * a value tuned for their raster; nothing here decides a colour, it only reads
 * one.
 */

export function zoneColor(kind: FarmZoneKind): string {
  return readToken(
    kind === 'farm_boundary' ? '--zone-boundary' : '--zone-grazing',
  )
}

/** Zones of any number of farms, ready for MapView's `polygons` prop. */
export function zonePolygons(zones: FarmZone[]): MapPolygon[] {
  return zones.map((z) => ({
    id: z.id,
    ring: z.ring,
    color: zoneColor(z.kind),
  }))
}

/**
 * Discreet legend chip-stack. Renders nothing when there is nothing to
 * explain — a legend for an empty map is furniture.
 */
export function ZoneLegend({
  zones,
  className = '',
}: {
  zones: FarmZone[]
  className?: string
}) {
  const { t } = useTranslation()

  const kinds: FarmZoneKind[] = (
    ['farm_boundary', 'grazing_area'] as FarmZoneKind[]
  ).filter((k) => zones.some((z) => z.kind === k))
  if (kinds.length === 0) return null

  return (
    <div
      className={`pointer-events-none flex flex-col gap-1 rounded-field border border-edge-subtle bg-surface-overlay/90 px-2.5 py-2 shadow-card backdrop-blur ${className}`}
    >
      {kinds.map((kind) => (
        <span
          key={kind}
          className="flex items-center gap-1.5 text-micro text-content-secondary"
        >
          <span
            className="inline-block h-2 w-3.5 border"
            style={{
              borderColor: zoneColor(kind),
              backgroundColor: `color-mix(in srgb, ${zoneColor(kind)} 18%, transparent)`,
            }}
          />
          {t(kind === 'farm_boundary' ? 'zone.boundary' : 'zone.grazing')}
        </span>
      ))}
    </div>
  )
}
