import { useTranslation } from 'react-i18next'

import { entityKindOf } from '@core/index'
import type { EntityKind, Farm, FarmZone, FarmZoneKind } from '@core/index'

import type { MapPolygon } from './MapView'
import { readToken } from './badges'

/**
 * G1/G16 — the zone vocabulary, shared by every map that shows an entity's
 * ground.
 *
 * Colour comes from the four `--zone-*` theme tokens so light and dark each
 * get values tuned for their raster; nothing here decides a colour, it only
 * reads one. G16 split the family in two: a FARM's ground is the green pair,
 * a MOSHAV's the blue pair — four tints total, because a moshav routinely
 * adjoins a farm and their zones must stay tellable side by side (A55).
 */

export function zoneColor(kind: FarmZoneKind, entity: EntityKind = 'farm'): string {
  if (entity === 'moshav') {
    return readToken(
      kind === 'farm_boundary' ? '--zone-boundary-moshav' : '--zone-grazing-moshav',
    )
  }
  return readToken(
    kind === 'farm_boundary' ? '--zone-boundary' : '--zone-grazing',
  )
}

/** G16 — the label swaps with the entity: a moshav has a יישוב boundary. */
export function zoneLabelKey(
  kind: FarmZoneKind,
  entity: EntityKind = 'farm',
): string {
  if (kind === 'farm_boundary') {
    return entity === 'moshav' ? 'zone.boundaryMoshav' : 'zone.boundary'
  }
  return entity === 'moshav' ? 'zone.grazingMoshav' : 'zone.grazing'
}

/**
 * Zones of any number of entities, ready for MapView's `polygons` prop.
 * Pass the farms so each zone paints in ITS OWN entity's family; without
 * them everything reads as farm ground (the pre-G16 behaviour).
 */
export function zonePolygons(
  zones: FarmZone[],
  farms?: Array<Pick<Farm, 'id' | 'entityKind'>>,
): MapPolygon[] {
  const kindOf = new Map((farms ?? []).map((f) => [f.id, entityKindOf(f)]))
  return zones.map((z) => ({
    id: z.id,
    ring: z.ring,
    color: zoneColor(z.kind, kindOf.get(z.farmId) ?? 'farm'),
  }))
}

/**
 * Discreet legend chip-stack — up to the four G16 tints, but only the kinds
 * actually on the map. Renders nothing when there is nothing to explain.
 */
export function ZoneLegend({
  zones,
  farms,
  entity,
  className = '',
}: {
  zones: FarmZone[]
  /** For MIXED maps: lets each zone find its entity's family. */
  farms?: Array<Pick<Farm, 'id' | 'entityKind'>>
  /** For single-entity maps (the detail screen): one kind for all zones. */
  entity?: EntityKind
  className?: string
}) {
  const { t } = useTranslation()

  const kindOf = new Map((farms ?? []).map((f) => [f.id, entityKindOf(f)]))
  const entityOf = (z: FarmZone): EntityKind =>
    entity ?? kindOf.get(z.farmId) ?? 'farm'

  const entries: Array<{ kind: FarmZoneKind; entity: EntityKind }> = []
  for (const zoneKind of ['farm_boundary', 'grazing_area'] as FarmZoneKind[]) {
    for (const ek of ['farm', 'moshav'] as EntityKind[]) {
      if (
        zones.some(
          (z) =>
            z.kind === zoneKind &&
            (entityOf(z) === ek || (ek === 'farm' && entityOf(z) === 'other')),
        )
      ) {
        entries.push({ kind: zoneKind, entity: ek })
      }
    }
  }
  if (entries.length === 0) return null

  return (
    <div
      className={`pointer-events-none flex flex-col gap-1 rounded-field border border-edge-subtle bg-surface-overlay/90 px-2.5 py-2 shadow-card backdrop-blur ${className}`}
    >
      {entries.map(({ kind, entity: ek }) => (
        <span
          key={`${kind}-${ek}`}
          className="flex items-center gap-1.5 text-micro text-content-secondary"
        >
          <span
            className="inline-block h-2 w-3.5 border"
            style={{
              borderColor: zoneColor(kind, ek),
              backgroundColor: `color-mix(in srgb, ${zoneColor(kind, ek)} 18%, transparent)`,
            }}
          />
          {t(zoneLabelKey(kind, ek))}
        </span>
      ))}
    </div>
  )
}
