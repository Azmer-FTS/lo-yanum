import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { entityKindOf, ringAreaDunams, ringCenter } from '@core/index'
import type { AnchorPoint, Farm, FarmZone, FarmZoneKind, LatLng } from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker, MapPolygon } from './MapView'
import { ZoneLegend, zoneColor, zoneLabelKey } from './zones'
import { PointLegend } from './meet'
import { entityMarkerKind, farmMarkerColor, postColor } from './badges'
import { FullscreenToggle, fullscreenShell, useMapFullscreen } from './fullscreen'

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
 * then placement is an ARMED MODE — see the comment on `mode` below. A map
 * that silently accepts pins wherever a coordinator happens to tap while panning
 * is worse than one that does nothing.
 *
 * G1 adds the farm's two kinds of GROUND to the same instrument: pass `zones`
 * to draw them, and `onZoneCreate` / `onZoneRingChange` / `onZoneDelete` to
 * edit them. Drawing is armed the same way point placement is — a "draw"
 * button per kind, then each click is a vertex, and the polygon is closed
 * explicitly (button or double-click). Selecting a zone turns its vertices
 * into draggable handles.
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
  /** G1 — the farm's zones, drawn under the markers. */
  zones?: FarmZone[]
  /** G1 — enable the zone-drawing toolbar. */
  onZoneCreate?: (kind: FarmZoneKind, ring: LatLng[]) => void
  onZoneRingChange?: (id: string, ring: LatLng[]) => void
  onZoneDelete?: (id: string) => void
  /**
   * G15 — CONTROLLED zone selection, for a screen that also lists the zones
   * beside the map (the farm detail's "ערוך" buttons). Pass both or neither;
   * when absent the map keeps its own internal selection, as before.
   */
  selectedZoneId?: string | null
  onZoneSelectionChange?: (id: string | null) => void
  className?: string
  /** G14c — square corners for the full-bleed map-first column. */
  flush?: boolean
  /** Extra controls floated over the top of the map. */
  overlay?: React.ReactNode
}

/**
 * One armed mode at a time: placing a point, or drawing one kind of zone.
 * A single discriminated state instead of two booleans, because "armed for a
 * point AND drawing a boundary" is not a thing a click could satisfy.
 */
type Mode =
  | { kind: 'idle' }
  | { kind: 'placing' }
  | { kind: 'drawing'; zone: FarmZoneKind; draft: LatLng[] }

export function AnchorMap({
  farm,
  anchors,
  chosenIds = [],
  selectedId = null,
  onSelect,
  onCreate,
  onMove,
  zones = [],
  onZoneCreate,
  onZoneRingChange,
  onZoneDelete,
  selectedZoneId: controlledZoneId,
  onZoneSelectionChange,
  className = 'h-full w-full',
  flush = false,
  overlay,
}: AnchorMapProps) {
  const { t } = useTranslation()

  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  // G15 — selection is controlled when the parent passes the pair, internal
  // otherwise. One variable + one setter downstream, whichever the source.
  const [internalZoneId, setInternalZoneId] = useState<string | null>(null)
  const zoneControlled = controlledZoneId !== undefined
  const selectedZoneId = zoneControlled ? controlledZoneId : internalZoneId
  const setSelectedZoneId = (
    next: string | null | ((cur: string | null) => string | null),
  ) => {
    const value = typeof next === 'function' ? next(selectedZoneId) : next
    if (zoneControlled) onZoneSelectionChange?.(value)
    else setInternalZoneId(value)
  }
  // G7bis.2 — while a mode is armed (or a zone selected), Esc belongs to IT;
  // only an idle Esc leaves the fullscreen room.
  const fullscreen = useMapFullscreen(
    mode.kind !== 'idle' || selectedZoneId !== null,
  )

  const drawing = mode.kind === 'drawing' ? mode : null
  const arming = mode.kind === 'placing'
  const zonesEditable = Boolean(onZoneCreate)
  // G16 — a moshav paints its ground in the blue family and its boundary is
  // "גבול היישוב"; everything mechanical stays identical.
  const entity = entityKindOf(farm)
  const selectedZone =
    zonesEditable && selectedZoneId
      ? (zones.find((z) => z.id === selectedZoneId) ?? null)
      : null

  useEffect(() => {
    if (mode.kind === 'idle' && !selectedZoneId) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMode({ kind: 'idle' })
      setSelectedZoneId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode.kind, selectedZoneId])

  // Disarm when the map stops being about the same farm: an armed mode carried
  // across a farm change would drop the next point (or vertex) on the wrong one.
  useEffect(() => {
    setMode({ kind: 'idle' })
    setSelectedZoneId(null)
  }, [farm.id])

  /**
   * Memoised on a SIGNATURE, not on the array.
   *
   * MapCanvas tears down and rebuilds every marker whenever this prop changes
   * identity, so a fresh array on each render means the pins are destroyed and
   * recreated on every keystroke in the panel next to the map. The signature
   * covers exactly what changes a pin's appearance or position.
   */
  const draftKey = drawing
    ? drawing.draft.map((v) => `${v.lat},${v.lng}`).join(';')
    : ''
  const selectedRingKey = selectedZone
    ? selectedZone.ring.map((v) => `${v.lat},${v.lng}`).join(';')
    : ''
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
    drawing ? `draw:${drawing.zone}:${draftKey}` : '',
    selectedZone ? `zone:${selectedZone.id}:${selectedRingKey}` : '',
  ].join('#')

  const markers: MapMarker[] = useMemo(
    () => [
      {
        id: farm.id,
        position: farm.position,
        // G7bis.1 — the farm's identity pastille: forest, always. Its status
        // lives in the chips beside the map, not in the pin's colour.
        color: farmMarkerColor(),
        title: farm.name,
        subtitle: farm.locality,
        kind: entityMarkerKind(farm),
      },
      ...anchors.map((anchor) => {
        const rank = chosenIds.indexOf(anchor.id)
        return {
          id: anchor.id,
          position: anchor.position,
          color: postColor(),
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
      // G1 — the vertices being drawn right now.
      ...(drawing?.draft ?? []).map((v, i) => ({
        id: `draft-${i}`,
        position: v,
        color: zoneColor(drawing?.zone ?? 'farm_boundary', entity),
        title: t('zone.vertex'),
        kind: 'vertex' as const,
      })),
      // G1 — the selected zone's vertices, draggable to reshape it. Emphasis
      // separates a REAL vertex from the smaller G15 midpoint grips between.
      ...(selectedZone?.ring ?? []).map((v, i) => ({
        id: `vertex-${selectedZone?.id}-${i}`,
        position: v,
        color: zoneColor(selectedZone?.kind ?? 'farm_boundary', entity),
        title: t('zone.vertex'),
        kind: 'vertex' as const,
        emphasis: true,
        draggable: Boolean(onZoneRingChange),
        onDragEnd: onZoneRingChange
          ? (position: LatLng) => {
              if (!selectedZone) return
              const ring = selectedZone.ring.map((p, j) =>
                j === i ? position : p,
              )
              onZoneRingChange(selectedZone.id, ring)
            }
          : undefined,
      })),
      // G15 — a small grip on the MIDDLE of each edge: clicking it inserts a
      // vertex right there, ready to drag. This is how a 5-point sketch grows
      // into the field's real shape without redrawing it.
      ...(selectedZone && onZoneRingChange
        ? selectedZone.ring.map((v, i) => {
            const next = selectedZone.ring[(i + 1) % selectedZone.ring.length]
            const mid = {
              lat: (v.lat + next.lat) / 2,
              lng: (v.lng + next.lng) / 2,
            }
            return {
              id: `midpoint-${selectedZone.id}-${i}`,
              position: mid,
              color: zoneColor(selectedZone.kind, entity),
              title: t('zone.addVertex'),
              kind: 'vertex' as const,
              onSelect: () => {
                const ring = [...selectedZone.ring]
                ring.splice(i + 1, 0, mid)
                onZoneRingChange(selectedZone.id, ring)
              },
            }
          })
        : []),
      // G15 — the whole-polygon MOVE handle at the ring's centre: dragging it
      // translates every vertex by the same delta.
      ...(selectedZone && onZoneRingChange
        ? [
            {
              id: `zone-move-${selectedZone.id}`,
              position: ringCenter(selectedZone.ring),
              color: zoneColor(selectedZone.kind, entity),
              title: t('zone.moveZone'),
              kind: 'move' as const,
              draggable: true,
              onDragEnd: (position: LatLng) => {
                const from = ringCenter(selectedZone.ring)
                const dLat = position.lat - from.lat
                const dLng = position.lng - from.lng
                onZoneRingChange(
                  selectedZone.id,
                  selectedZone.ring.map((p) => ({
                    lat: p.lat + dLat,
                    lng: p.lng + dLng,
                  })),
                )
              },
            },
          ]
        : []),
      // G15 — the LIVE area read-out, riding the polygon being drawn/edited.
      ...(drawing && drawing.draft.length >= 3
        ? [
            {
              id: 'draft-area',
              position: ringCenter(drawing.draft),
              color: zoneColor(drawing.zone, entity),
              title: t('zone.areaDunams', {
                n: Math.round(ringAreaDunams(drawing.draft)).toLocaleString('he-IL'),
              }),
              kind: 'label' as const,
            },
          ]
        : []),
      ...(selectedZone
        ? [
            {
              id: `zone-area-${selectedZone.id}`,
              position: ringCenter(selectedZone.ring),
              color: zoneColor(selectedZone.kind, entity),
              title: t('zone.areaDunams', {
                n: Math.round(ringAreaDunams(selectedZone.ring)).toLocaleString('he-IL'),
              }),
              kind: 'label' as const,
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  )

  const polygons: MapPolygon[] = useMemo(
    () => [
      ...zones.map((z) => ({
        id: z.id,
        ring: z.ring,
        color: zoneColor(z.kind, entity),
        emphasis: z.id === selectedZoneId,
      })),
      ...(drawing && drawing.draft.length >= 3
        ? [
            {
              id: 'draft',
              ring: drawing.draft,
              color: zoneColor(drawing.zone, entity),
              emphasis: true,
            },
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      zones.map((z) => `${z.id}:${z.kind}:${z.ring.length}`).join('|'),
      zones
        .map((z) => z.ring.map((v) => `${v.lat},${v.lng}`).join(';'))
        .join('|'),
      selectedZoneId,
      drawing ? `${drawing.zone}:${draftKey}` : '',
    ],
  )

  const handleMapClick = (position: LatLng) => {
    if (drawing) {
      setMode({ ...drawing, draft: [...drawing.draft, position] })
      return
    }
    if (arming) {
      onCreate?.(position)
      setMode({ kind: 'idle' })
    }
  }

  const closeDraft = (dropLast = false) => {
    if (!drawing) return
    const ring = dropLast ? drawing.draft.slice(0, -1) : drawing.draft
    if (ring.length >= 3) onZoneCreate?.(drawing.zone, ring)
    setMode({ kind: 'idle' })
  }

  const startDrawing = (zone: FarmZoneKind) => {
    setSelectedZoneId(null)
    setMode({ kind: 'drawing', zone, draft: [] })
  }

  const empty = anchors.length === 0
  const active = mode.kind !== 'idle'

  return (
    <div className={fullscreenShell(fullscreen.active, `relative ${className}`)}>
      <MapView
        ariaLabel={t('a11y.map')}
        className={`h-full w-full transition-shadow duration-base ${
          flush && !fullscreen.active ? 'rounded-none' : 'rounded-card'
        } ${active ? 'ring-2 ring-accent' : ''}`}
        center={farm.position}
        zoom={13}
        markers={markers}
        polygons={polygons}
        onMapClick={active ? handleMapClick : undefined}
        // A double-click while drawing closes the ring. It has already fired
        // two plain clicks — the first was a real vertex, the second a
        // duplicate a few pixels away — so the duplicate is dropped.
        onMapDblClick={drawing ? () => closeDraft(true) : undefined}
        onPolygonClick={
          zonesEditable && !active
            ? (id) => setSelectedZoneId((cur) => (cur === id ? null : id))
            : undefined
        }
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3">
        <FullscreenToggle
          active={fullscreen.active}
          onToggle={fullscreen.toggle}
          className="self-end"
        />
        {overlay && <div className="pointer-events-auto">{overlay}</div>}

        {/* G1 — the zone-drawing toolbar. Explicit modes, one per kind. */}
        {zonesEditable && !active && (
          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => startDrawing('farm_boundary')}
              className="btn-secondary py-1.5 text-micro"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-pill"
                style={{ backgroundColor: zoneColor('farm_boundary', entity) }}
              />
              {t(entity === 'moshav' ? 'zone.drawBoundaryMoshav' : 'zone.drawBoundary')}
            </button>
            <button
              type="button"
              onClick={() => startDrawing('grazing_area')}
              className="btn-secondary py-1.5 text-micro"
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-pill"
                style={{ backgroundColor: zoneColor('grazing_area', entity) }}
              />
              {t('zone.drawGrazing')}
            </button>
            {selectedZone && (
              <>
                {/* G15 — the panel's half of the live read-out: which zone is
                    being edited, and how big it currently is. */}
                <span className="flex items-center gap-1.5 rounded-pill border border-edge-subtle bg-surface-overlay/95 px-3 py-1.5 text-micro font-semibold text-content-primary shadow-card backdrop-blur">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-pill"
                    style={{ backgroundColor: zoneColor(selectedZone.kind, entity) }}
                  />
                  {t(zoneLabelKey(selectedZone.kind, entity))}
                  <span className="numeric ltr-nums">
                    {t('zone.areaDunams', {
                      n: Math.round(
                        ringAreaDunams(selectedZone.ring),
                      ).toLocaleString('he-IL'),
                    })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onZoneDelete?.(selectedZone.id)
                    setSelectedZoneId(null)
                  }}
                  className="btn-secondary py-1.5 text-micro text-status-danger-ink"
                >
                  <Icon name="trash" size={13} />
                  {t('zone.deleteZone')}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedZoneId(null)}
                  className="btn-secondary py-1.5 text-micro"
                >
                  <Icon name="check" size={13} />
                  {t('zone.doneEditing')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* One bottom overlay for the legends AND the banner: stacked in a
          column so the legend can never slide behind the banner, whose height
          varies with the viewport (it wraps to three lines at 402 px). */}
      <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-col items-end gap-2 sm:items-start">
        {/* G7bis.1 — one legend stack: what the point shapes mean, then what
            the painted ground means. */}
        <PointLegend showFarm showPost showMeet={false} entity={entity} />
        <ZoneLegend zones={zones} entity={entity} />

        {/* The control sits ON the map, because the map is what it is about.
            The empty case is louder on purpose: with no points yet, this
            banner IS the only route forward. */}
        {(onCreate || drawing) && (
          <div className="w-full self-stretch">
          <div
            className={`pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card px-3.5 py-2.5 backdrop-blur ${
              active || empty
                ? 'border border-accent bg-surface-overlay/95 shadow-glow'
                : 'border border-edge-subtle bg-surface-overlay/90 shadow-card'
            }`}
          >
            <span className="shrink-0 text-accent-ink">
              <Icon
                name={drawing ? 'edit' : arming ? 'pin' : 'plus'}
                size={17}
              />
            </span>

            <p className="min-w-0 flex-1 text-caption text-content-secondary">
              <span className="font-semibold text-content-primary">
                {drawing
                  ? t(
                      drawing.zone === 'farm_boundary'
                        ? entity === 'moshav'
                          ? 'zone.drawingBoundaryMoshav'
                          : 'zone.drawingBoundary'
                        : 'zone.drawingGrazing',
                    )
                  : t(arming ? 'anchor.armedHint' : 'anchor.mapHintCreate')}
              </span>
              <span className="block text-micro text-content-muted">
                {drawing
                  ? `${t('zone.drawingHint')} · ${t('zone.vertexCount', {
                      count: drawing.draft.length,
                    })}${
                      drawing.draft.length >= 3
                        ? ` · ${t('zone.areaDunams', {
                            n: Math.round(
                              ringAreaDunams(drawing.draft),
                            ).toLocaleString('he-IL'),
                          })}`
                        : ''
                    } · ${t('anchor.escToCancel')}`
                  : arming
                    ? t('anchor.escToCancel')
                    : onMove && !empty
                      ? t('anchor.mapHintDrag')
                      : ''}
              </span>
            </p>

            {drawing ? (
              <>
                <button
                  type="button"
                  onClick={() => closeDraft()}
                  disabled={drawing.draft.length < 3}
                  className="btn-primary shrink-0 py-1.5 text-micro"
                >
                  <Icon name="check" size={13} />
                  {t('zone.closePolygon')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode({ kind: 'idle' })}
                  className="btn-secondary shrink-0 py-1.5 text-micro"
                >
                  <Icon name="close" size={13} />
                  {t('common.cancel')}
                </button>
              </>
            ) : arming ? (
              <button
                type="button"
                onClick={() => setMode({ kind: 'idle' })}
                className="btn-secondary shrink-0 py-1.5 text-micro"
              >
                <Icon name="close" size={13} />
                {t('common.cancel')}
              </button>
            ) : (
              onCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedZoneId(null)
                    setMode({ kind: 'placing' })
                  }}
                  className={`shrink-0 py-1.5 text-micro ${
                    empty ? 'btn-primary' : 'btn-secondary'
                  }`}
                >
                  <Icon name="plus" size={13} />
                  {t('anchor.addPoint')}
                </button>
              )
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
