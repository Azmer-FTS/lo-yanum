import { useTranslation } from 'react-i18next'

import type { ThreatIntensity, ThreatVector, ThreatZone } from '@core/index'

import { Icon } from './Icon'
import type { MapThreatVector, MapThreatZone } from './MapView'

/**
 * G18 — the threat vocabulary, shared by every surface that may show it.
 *
 * "May" is doing work there: the layer is coordinator-only and the gate is in
 * `access.ts`, so nothing in this file needs to check a role. It is a
 * rendering vocabulary, and it renders whatever it is handed — which is
 * exactly nothing for a farmer, because the accessor returned an empty list.
 *
 * THE INTENSITY SCALE IS TWO HUES AND A WEIGHT, NOT THREE HUES.
 *
 * Decision 49 keeps `--critical` for four meanings, and a threat assessment is
 * none of them — spending the orange here would dilute the one colour that
 * says "a volunteer is unaccounted for". So the ladder is amber → danger, and
 * the third step is carried by WEIGHT: a denser hatch and a heavier outline on
 * the map, a ring on the chip. That is better than a third hue anyway —
 * density survives a sun-washed iPad and colour-blindness, which is most of
 * what this layer has to survive.
 */

const INTENSITY_CHIP: Record<ThreatIntensity, string> = {
  low: 'bg-status-warn/15 text-status-warn-ink',
  medium: 'bg-status-danger/15 text-status-danger-ink',
  high: 'bg-status-danger/15 text-status-danger-ink ring-1 ring-status-danger',
}

export function ThreatIntensityChip({
  intensity,
}: {
  intensity: ThreatIntensity
}) {
  const { t } = useTranslation()
  return (
    <span className={`chip ${INTENSITY_CHIP[intensity]}`}>
      <Icon name="alert" size={11} />
      {t(`threat.intensity.${intensity}`)}
    </span>
  )
}

/** Zones ready for MapView's `threatZones` prop. */
export function threatZoneShapes(
  zones: ThreatZone[],
  selectedId?: string | null,
): MapThreatZone[] {
  return zones.map((z) => ({
    id: z.id,
    ring: z.ring,
    intensity: z.intensity,
    emphasis: z.id === selectedId,
  }))
}

/** Vectors ready for MapView's `threatVectors` prop. */
export function threatVectorShapes(
  vectors: ThreatVector[],
  selectedId?: string | null,
): MapThreatVector[] {
  return vectors.map((v) => ({
    id: v.id,
    origin: v.origin,
    target: v.target,
    intensity: v.intensity,
    emphasis: v.id === selectedId,
  }))
}

/**
 * The layer's own legend, shown only when the layer is on and carries
 * something. Separate from `ZoneLegend` on purpose: the two answer different
 * questions ("what ground is this" vs "what is the assessment"), and merging
 * them would put a hatch swatch in the middle of the farm's own tints.
 */
export function ThreatLegend({
  zones,
  vectors,
  className = '',
}: {
  zones: ThreatZone[]
  vectors: ThreatVector[]
  className?: string
}) {
  const { t } = useTranslation()
  const present = new Set<ThreatIntensity>([
    ...zones.map((z) => z.intensity),
    ...vectors.map((v) => v.intensity),
  ])
  if (present.size === 0) return null

  const ordered: ThreatIntensity[] = (['high', 'medium', 'low'] as const).filter(
    (i) => present.has(i),
  )

  return (
    <div
      className={`pointer-events-none flex flex-col gap-1 rounded-field border border-edge-subtle bg-surface-overlay/90 px-2.5 py-2 shadow-card backdrop-blur ${className}`}
    >
      <span className="text-micro font-semibold text-content-primary">
        {t('threat.layer')}
      </span>
      {ordered.map((intensity) => (
        <span
          key={intensity}
          className="flex items-center gap-1.5 text-micro text-content-secondary"
        >
          {/* A hatched swatch, because the hatch IS the layer's signature —
              a flat colour chip here would teach the wrong thing. */}
          <span
            className="inline-block h-2.5 w-4 border border-dashed"
            style={{
              borderColor: `rgb(var(${intensityVar(intensity)}))`,
              backgroundImage: `repeating-linear-gradient(45deg, rgb(var(${intensityVar(
                intensity,
              )})) 0 1.5px, transparent 1.5px ${intensity === 'high' ? '3px' : '5px'})`,
            }}
          />
          {t(`threat.intensity.${intensity}`)}
        </span>
      ))}
    </div>
  )
}

/** The hue half of the ladder; the weight half is the hatch density. */
function intensityVar(intensity: ThreatIntensity): string {
  return intensity === 'low' ? '--status-warn' : '--status-danger'
}
