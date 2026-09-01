import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  entityKindOf,
  ringAreaDunams,
  ringCenter,
  simplifyRing,
  simplifyToleranceM,
  tracedRingIsClosed,
} from '@core/index'
import type {
  AnchorPoint,
  Farm,
  FarmZone,
  FarmZoneKind,
  LatLng,
  ThreatVector,
  ThreatZone,
} from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker, MapPolygon } from './MapView'
import { ThreatLegend, threatVectorShapes, threatZoneShapes } from './threats'
import { ZoneLegend, zoneColor, zoneLabelKey } from './zones'
import { PointLegend } from './meet'
import { entityMarkerKind, farmMarkerColor, postColor, readToken } from './badges'
import { fullscreenShell, useMapFullscreen } from './fullscreen'

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
  /**
   * G18 — the threat overlay. Passing the arrays DISPLAYS them; passing the
   * two create callbacks additionally arms the drawing tools.
   *
   * Nothing here checks a role: `access.ts` returns an empty list for anyone
   * but the coordinator, so a farmer's screen renders an empty overlay by
   * construction rather than by a condition somebody could forget.
   */
  threatZones?: ThreatZone[]
  threatVectors?: ThreatVector[]
  onThreatZoneCreate?: (ring: LatLng[]) => void
  onThreatVectorCreate?: (origin: LatLng, target: LatLng) => void
  selectedThreatId?: string | null
}

/**
 * One armed mode at a time: placing a point, or drawing one kind of zone.
 * A single discriminated state instead of two booleans, because "armed for a
 * point AND drawing a boundary" is not a thing a click could satisfy.
 */
type Mode =
  | { kind: 'idle' }
  | { kind: 'placing' }
  /**
   * `traced` marks a draft that arrived from a FREEHAND stroke rather than
   * from taps, and it changes two things (PO point 9b):
   *
   *   · the map stops accepting taps as new vertices — the shape is drawn,
   *     the job now is to ADJUST it, and a stray tap adding a corner in the
   *     middle of that is the opposite of helpful;
   *   · and every vertex becomes a draggable grip, which is what "passe en
   *     mode édition normal, sommets ajustables un par un" asks for.
   */
  | { kind: 'drawing'; zone: FarmZoneKind; draft: LatLng[]; traced?: true }
  // G18 — a threat zone is drawn exactly like ground, in its own explicit
  // mode so a coordinator can never draw one by accident.
  | { kind: 'threatZone'; draft: LatLng[]; traced?: true }
  // A vector is TWO clicks: where they come from, then where they arrive.
  // `origin: null` is the first half of the gesture, which is what lets the
  // banner say which click the map is waiting for.
  | { kind: 'threatVector'; origin: LatLng | null }
  /**
   * PO POINT 9b — ציור חופשי. The operator TRACES; nothing is committed until
   * the trace has been simplified into a draft and he has said so.
   *
   * ★ IT CARRIES THE SAME `zone` AS `drawing`, plus `'threat'`, because the
   *   product owner's condition is that freehand works for EVERY kind of area
   *   and that the kind is chosen BEFORE the trace — exactly as it is today.
   *   One mode with a subject beats three near-identical modes.
   */
  | { kind: 'freehand'; zone: FarmZoneKind | 'threat'; live: LatLng[] }

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
  threatZones = [],
  threatVectors = [],
  onThreatZoneCreate,
  onThreatVectorCreate,
  selectedThreatId = null,
}: AnchorMapProps) {
  const { t } = useTranslation()

  const [mode, setMode] = useState<Mode>({ kind: 'idle' })
  /**
   * PO POINT 9b — is the next zone TRACED or tapped out vertex by vertex?
   *
   * A preference rather than a mode: a coordinator who draws with a Pencil
   * draws the next one with it too, so it survives finishing a zone and is
   * only cleared by pressing the button again.
   */
  const [freehandArmed, setFreehandArmed] = useState(false)
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
  const threatDrawing = mode.kind === 'threatZone' ? mode : null
  const vectorDrawing = mode.kind === 'threatVector' ? mode : null
  const tracing = mode.kind === 'freehand' ? mode : null
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
    drawing ? `draw:${drawing.zone}:${drawing.traced ? 'traced' : 'tapped'}:${draftKey}` : '',
    selectedZone ? `zone:${selectedZone.id}:${selectedRingKey}` : '',
    threatDrawing
      ? `threat:${threatDrawing.draft.map((v) => `${v.lat},${v.lng}`).join(';')}`
      : '',
    vectorDrawing?.origin
      ? `vector:${vectorDrawing.origin.lat},${vectorDrawing.origin.lng}`
      : '',
  ].join('#')

  const markers: MapMarker[] = useMemo(
    () => [
      {
        id: farm.id,
        position: farm.position,
        // G7bis.1 — the farm's identity pastille: forest, always. Its status
        // lives in the chips beside the map, not in the pin's colour.
        color: farmMarkerColor(farm),
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
      // G18 — the threat ring being drawn, and the vector's origin waiting
      // for its second click. Both in the danger hue, so a coordinator can
      // never mistake which kind of shape he is placing.
      ...(threatDrawing?.draft ?? []).map((v, i) => ({
        id: `threat-draft-${i}`,
        position: v,
        color: readToken('--status-danger'),
        title: t('zone.vertex'),
        kind: 'vertex' as const,
        draggable: Boolean(threatDrawing?.traced),
        onDragEnd: threatDrawing?.traced
          ? (position: LatLng) =>
              setMode((current) =>
                current.kind === 'threatZone'
                  ? {
                      ...current,
                      draft: current.draft.map((p, at) => (at === i ? position : p)),
                    }
                  : current,
              )
          : undefined,
      })),
      ...(vectorDrawing?.origin
        ? [
            {
              id: 'vector-origin',
              position: vectorDrawing.origin,
              color: readToken('--status-danger'),
              title: t('threat.vectorStep2'),
              kind: 'vertex' as const,
              emphasis: true,
            },
          ]
        : []),
      // G1 — the vertices being drawn right now.
      //
      // ★ A TRACED DRAFT'S VERTICES ARE GRIPS (PO point 9b). A tapped draft's
      //   are not, and must not be: while the map is armed, MapCanvas
      //   deliberately makes every marker transparent to clicks so a vertex
      //   placed near an existing one cannot swallow the next tap.
      ...(drawing?.draft ?? []).map((v, i) => ({
        id: `draft-${i}`,
        position: v,
        color: zoneColor(drawing?.zone ?? 'farm_boundary', entity),
        title: t('zone.vertex'),
        kind: 'vertex' as const,
        draggable: Boolean(drawing?.traced),
        onDragEnd: drawing?.traced
          ? (position: LatLng) =>
              setMode((current) =>
                current.kind === 'drawing'
                  ? {
                      ...current,
                      draft: current.draft.map((p, at) => (at === i ? position : p)),
                    }
                  : current,
              )
          : undefined,
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

  /**
   * PO POINT 9b — WHAT THE TRACE BECOMES WHEN THE HAND LIFTS.
   *
   * ★ THE TOLERANCE COMES FROM THE CAMERA, so a moshav traced at z12 and a
   *   paddock traced at z17 both come back with a workable number of
   *   vertices. `simplifyToleranceM` turns three screen pixels into metres at
   *   this zoom and this latitude; `core/geo.ts` explains why three.
   *
   * ★ AND IT LANDS IN THE ORDINARY DRAFT STATE. The product owner's condition
   *   is that after simplification the shape "passe en mode édition normal —
   *   sommets ajustables un par un comme aujourd'hui", so the simplified ring
   *   becomes exactly the draft that vertex-by-vertex drawing produces: same
   *   banner, same live area, same בטל, same סיום. There is no third state to
   *   learn and no second code path to keep in step.
   */
  const finishTrace = (trace: LatLng[], zoom: number) => {
    if (!tracing) return
    const centre = trace.length > 0 ? trace[0] : farm.position
    const toleranceM = simplifyToleranceM(zoom, centre.lat)

    // Under three points there is no shape; a stray tap in this mode should
    // leave the operator where he was rather than opening an empty draft.
    if (trace.length < 3) {
      setMode({ kind: 'freehand', zone: tracing.zone, live: [] })
      return
    }

    // ★ CLOSED IF THE HAND CAME BACK NEAR ITS START. When it did, the last
    //   point is the same corner as the first and keeping both leaves a
    //   hairline notch nobody can see and nobody can drag out.
    const closed = tracedRingIsClosed(trace, toleranceM)
    const raw = closed ? trace.slice(0, -1) : trace
    const ring = simplifyRing(raw, toleranceM)

    if (tracing.zone === 'threat') {
      setMode({ kind: 'threatZone', draft: ring, traced: true })
      return
    }
    setMode({ kind: 'drawing', zone: tracing.zone, draft: ring, traced: true })
  }

  const handleMapClick = (position: LatLng) => {
    if (drawing) {
      setMode({ ...drawing, draft: [...drawing.draft, position] })
      return
    }
    if (threatDrawing) {
      setMode({ kind: 'threatZone', draft: [...threatDrawing.draft, position] })
      return
    }
    if (vectorDrawing) {
      // Two clicks, and the SECOND one commits. Splitting it this way is what
      // lets the coordinator abandon a half-drawn vector with Esc without
      // leaving a stray origin behind.
      if (vectorDrawing.origin === null) {
        setMode({ kind: 'threatVector', origin: position })
      } else {
        onThreatVectorCreate?.(vectorDrawing.origin, position)
        setMode({ kind: 'idle' })
      }
      return
    }
    if (arming) {
      onCreate?.(position)
      setMode({ kind: 'idle' })
    }
  }

  const closeThreatDraft = (dropLast = false) => {
    if (!threatDrawing) return
    const ring = dropLast ? threatDrawing.draft.slice(0, -1) : threatDrawing.draft
    if (ring.length >= 3) onThreatZoneCreate?.(ring)
    setMode({ kind: 'idle' })
  }

  const closeDraft = (dropLast = false) => {
    if (!drawing) return
    const ring = dropLast ? drawing.draft.slice(0, -1) : drawing.draft
    if (ring.length >= 3) onZoneCreate?.(drawing.zone, ring)
    setMode({ kind: 'idle' })
  }

  /**
   * ★ ONE ENTRY POINT FOR BOTH WAYS OF DRAWING, and the kind is still chosen
   *   first. PO point 9b's fifth condition is that freehand works for every
   *   type of area with the type picked BEFORE the stroke — so the type
   *   buttons keep their meaning and `freehandArmed` only decides which mode
   *   they open.
   */
  const startDrawing = (zone: FarmZoneKind) => {
    setSelectedZoneId(null)
    setMode(
      freehandArmed
        ? { kind: 'freehand', zone, live: [] }
        : { kind: 'drawing', zone, draft: [] },
    )
  }

  const empty = anchors.length === 0
  const active = mode.kind !== 'idle'
  /**
   * ★ WHEN A TAP ON THE MAP MEANS SOMETHING. Not while a stroke is being
   *   traced (the pointer handler owns the gesture), and not on a draft that
   *   CAME from a stroke (its vertices are grips now, not a list being
   *   appended to).
   */
  const acceptsClicks =
    arming ||
    vectorDrawing !== null ||
    (drawing !== null && !drawing.traced) ||
    (threatDrawing !== null && !threatDrawing.traced)
  /**
   * The live surface, while the hand is still moving. Three points is the
   * floor for an area, so a trace shorter than that reports nothing rather
   * than zero — "0 dunams" and "not a shape yet" are different statements.
   */
  const liveDunams =
    tracing && tracing.live.length >= 3 ? ringAreaDunams(tracing.live) : null

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
        onMapClick={acceptsClicks ? handleMapClick : undefined}
        // A double-click while drawing closes the ring. It has already fired
        // two plain clicks — the first was a real vertex, the second a
        // duplicate a few pixels away — so the duplicate is dropped.
        threatZones={threatZoneShapes(
          threatZones,
          selectedThreatId,
        ).concat(
          threatDrawing && threatDrawing.draft.length >= 3
            ? [
                {
                  id: 'threat-draft',
                  ring: threatDrawing.draft,
                  intensity: 'medium' as const,
                  emphasis: true,
                },
              ]
            : [],
        )}
        threatVectors={threatVectorShapes(threatVectors, selectedThreatId)}
        onMapDblClick={
          drawing && !drawing.traced
            ? () => closeDraft(true)
            : threatDrawing && !threatDrawing.traced
              ? () => closeThreatDraft(true)
              : undefined
        }
        onPolygonClick={
          zonesEditable && !active
            ? (id) => setSelectedZoneId((cur) => (cur === id ? null : id))
            : undefined
        }
        fullscreen={{ active: fullscreen.active, onToggle: fullscreen.toggle }}
        /**
         * PO POINT 9b — while ציור חופשי is armed the map is a drawing
         * surface: the pan is suspended, a Pencil / finger / mouse traces, and
         * the release hands back the path. `MapCanvas` owns the gesture and
         * the live line; this component owns what the path MEANS.
         */
        freehand={
          tracing
            ? {
                active: true,
                color:
                  tracing.zone === 'threat'
                    ? readToken('--status-danger')
                    : zoneColor(tracing.zone, entity),
                onTrace: (live) =>
                  setMode((current) =>
                    current.kind === 'freehand' ? { ...current, live } : current,
                  ),
                onEnd: finishTrace,
              }
            : undefined
        }
      />

      {/* ★★ PO RETURN 2026-09-02 — THE TOP OF THE MAP HAS ONE OWNER NOW.
          This strip used to carry THREE of them: the "מסך מלא" button
          (`self-end`, which in an RTL document is the physical LEFT, i.e. on
          top of MapLibre's own controls), the host's `overlay`, and a
          full-width wrapping row of five drawing buttons. All three sat over
          the zoom and the ground switch on his iPad.

          · fullscreen  → a row of `MapTools`, the map's single control stack
          · the drawing tools → the BOTTOM bar, below, where they only appear
            in an editing context
          · what is left is the host's own `overlay`

          ⚠️ `pl-[4.5rem]` IS A PHYSICAL LEFT PADDING AND THAT IS DELIBERATE.
             MapLibre puts `top-left` controls on the physical left whatever
             the document direction, so a logical `ps-` would clear the wrong
             side in this RTL app — which is precisely how the collision got
             here. 4.5rem is the stack's 44 px plus its 12 px gutter. */}
      {overlay && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 p-3 pl-[4.5rem]">
          <div className="pointer-events-auto">{overlay}</div>
        </div>
      )}

      {/* One bottom overlay for the legends AND the banner: stacked in a
          column so the legend can never slide behind the banner, whose height
          varies with the viewport (it wraps to three lines at 402 px).

          ⚠️ `bottom-9` AND NOT `bottom-3`, AND THE GATE IS WHY. Moving the
             drawing tools down here (PO return 2026-09-02) put them straight
             onto MapLibre's attribution link — `bun run overlap` caught
             "OpenStreetMap × draw-boundary, 37×6 px" at all four viewports on
             the first run. That link is a LICENCE OBLIGATION, not decoration,
             so the bar clears it rather than the other way round: MapLibre's
             attribution occupies the bottom ~30 px of the map (20 px line box
             plus a 10 px margin), so the column starts above it.

          ⚠️ AND `pl-[4.5rem]`, FOR THE SAME REASON THE TOP STRIP HAS IT. On a
             phone the map column is about 40 dvh and this bar is three wrapped
             rows tall, so its top edge reaches up into the control stack —
             `bun run overlap` caught "map-tool-zoom-out × הוסף נקודה, 28×30 px"
             at 390 and 402 px wide. The stack is 44 px on the PHYSICAL left
             whatever the writing direction, so the reservation is physical
             too. It costs 72 px of a bar whose buttons already wrap, and it
             costs nothing at all on the iPad this is drawn on. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-9 z-10 flex flex-col items-end gap-2 pl-[4.5rem] sm:items-start">
        {/* G7bis.1 — one legend stack: what the point shapes mean, then what
            the painted ground means. */}
        <PointLegend showFarm showPost showMeet={false} entity={entity} />
        <ZoneLegend zones={zones} entity={entity} />
        {/* G18 — its own stack, because "what ground is this" and "what is the
            assessment" are different questions. Renders nothing when the layer
            is empty, which is what a farmer's session always produces. */}
        <ThreatLegend zones={threatZones} vectors={threatVectors} />

        {/* The control sits ON the map, because the map is what it is about.
            The empty case is louder on purpose: with no points yet, this
            banner IS the only route forward. */}
        {(onCreate || zonesEditable || drawing || threatDrawing || vectorDrawing) && (
          <div className="w-full self-stretch">
          {/* ★ THE SENTENCE ROW ONLY EXISTS WHERE IT HAS SOMETHING TO SAY.
              The bar as a whole now also opens for a map that is merely
              ZONE-editable, so that the drawing tools have somewhere to live;
              on such a map with nothing armed there is no point-placement
              hint and no button, and printing "tap to add a point" under a
              screen that cannot add one would be a lie in the calmest voice
              available. */}
          {(onCreate || active) && (
          <div
            className={`pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card px-3.5 py-2.5 backdrop-blur ${
              active || empty
                ? 'border border-accent bg-surface-overlay/95 shadow-glow'
                : 'border border-edge-subtle bg-surface-overlay/90 shadow-card'
            }`}
          >
            <span className="shrink-0 text-accent-ink">
              <Icon
                name={
                  tracing || drawing || threatDrawing
                    ? 'edit'
                    : vectorDrawing
                      ? 'alert'
                      : arming
                        ? 'pin'
                        : 'plus'
                }
                size={17}
              />
            </span>

            <p className="min-w-0 flex-1 text-caption text-content-secondary">
              <span className="font-semibold text-content-primary">
                {tracing
                  ? t('zone.tracing')
                  : drawing
                  ? t(
                      drawing.zone === 'farm_boundary'
                        ? entity === 'moshav'
                          ? 'zone.drawingBoundaryMoshav'
                          : 'zone.drawingBoundary'
                        : 'zone.drawingGrazing',
                    )
                  : threatDrawing
                    ? t('threat.drawingZone')
                    : vectorDrawing
                      ? t(
                          vectorDrawing.origin === null
                            ? 'threat.vectorStep1'
                            : 'threat.vectorStep2',
                        )
                      : t(arming ? 'anchor.armedHint' : 'anchor.mapHintCreate')}
              </span>
              <span className="block text-micro text-content-muted">
                {tracing
                  ? `${t('zone.tracingHint')}${
                      liveDunams === null
                        ? ''
                        : ` · ${t('zone.areaDunams', {
                            n: Math.round(liveDunams).toLocaleString('he-IL'),
                          })}`
                    } · ${t('anchor.escToCancel')}`
                  : drawing?.traced
                    ? /* ★ A TRACED DRAFT SAYS WHAT THE ALGORITHM DID. "Your
                         stroke is now N points, and here is the surface" is
                         the one sentence that makes an automatic
                         simplification trustworthy instead of mysterious. */
                      `${t('zone.simplified', { count: drawing.draft.length })} · ${t(
                        'zone.areaDunams',
                        {
                          n: Math.round(
                            ringAreaDunams(drawing.draft),
                          ).toLocaleString('he-IL'),
                        },
                      )} · ${t('anchor.escToCancel')}`
                  : drawing
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
                  : threatDrawing
                    ? `${t('zone.drawingHint')} · ${t('zone.vertexCount', {
                        count: threatDrawing.draft.length,
                      })} · ${t('anchor.escToCancel')}`
                    : vectorDrawing || arming
                      ? t('anchor.escToCancel')
                      : onMove && !empty
                        ? t('anchor.mapHintDrag')
                        : ''}
              </span>
            </p>

            {tracing ? (
              /* ★ ONE BUTTON, AND IT IS בטל. There is nothing to confirm while
                 the hand has not drawn yet — the trace itself is the commit —
                 so the only action here is the way out, which is PO point 9b's
                 fourth condition: "un tracé raté s'annule d'un bouton avant
                 validation". */
              <button
                type="button"
                onClick={() => setMode({ kind: 'idle' })}
                data-testid="freehand-cancel"
                className="btn-secondary shrink-0 py-1.5 text-micro"
              >
                <Icon name="close" size={13} />
                {t('common.cancel')}
              </button>
            ) : threatDrawing ? (
              <>
                <button
                  type="button"
                  onClick={() => closeThreatDraft()}
                  disabled={threatDrawing.draft.length < 3}
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
            ) : vectorDrawing ? (
              <button
                type="button"
                onClick={() => setMode({ kind: 'idle' })}
                className="btn-secondary shrink-0 py-1.5 text-micro"
              >
                <Icon name="close" size={13} />
                {t('common.cancel')}
              </button>
            ) : drawing ? (
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
          )}

          {/* ★★ PO RETURN 2026-09-02 — THE DRAWING TOOLS LIVE HERE NOW.
              They were a wrapping row of five buttons floated across the TOP
              of the canvas, over MapLibre's zoom and over the ground switch.
              They belong to an editing context, so they belong in the bar that
              only exists in one: the same bar that already carries the point
              placement, directly under the sentence that says what the map is
              currently for.

              ★ AND THEY ONLY RENDER WHEN THE MAP IS IDLE. While a ring is
                being drawn the bar's job is "close it or cancel it", and a row
                of five ways to start something else underneath that is how a
                half-drawn grazing area gets abandoned by accident. */}
          {zonesEditable && !active && (
            <div
              data-testid="draw-tools"
              className="pointer-events-auto mt-2 flex flex-wrap items-center gap-2
                         rounded-card border border-edge-subtle bg-surface-overlay/95
                         px-3.5 py-2.5 shadow-card backdrop-blur"
            >
              <span className="text-micro font-semibold text-content-muted">
                {t('zone.toolsLabel')}
              </span>
              {/* ★★ PO POINT 9b — ציור חופשי, AND IT IS A MODE SWITCH RATHER
                  THAN A SIXTH TOOL. The kind of area is still chosen with the
                  buttons beside it; this decides HOW the ring is produced —
                  a continuous stroke instead of vertex-by-vertex — which is
                  why it is pressed FIRST and stays pressed. On a real iPad the
                  Pencil is the reason it exists: a pen draws, and asking one
                  to place vertices one tap at a time is asking it to be a
                  finger. */}
              <button
                type="button"
                /* The row only exists while the map is idle, so there is never
                   a live trace to tear down here. */
                onClick={() => setFreehandArmed((armed) => !armed)}
                data-testid="draw-freehand"
                aria-pressed={freehandArmed}
                className={`min-h-[36px] py-1.5 text-micro ${
                  freehandArmed ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                <Icon name="edit" size={13} />
                {t('zone.freehand')}
              </button>
              <button
                type="button"
                onClick={() => startDrawing('farm_boundary')}
                data-testid="draw-boundary"
                className="btn-secondary min-h-[36px] py-1.5 text-micro"
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
                data-testid="draw-grazing"
                className="btn-secondary min-h-[36px] py-1.5 text-micro"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-pill"
                  style={{ backgroundColor: zoneColor('grazing_area', entity) }}
                />
                {t('zone.drawGrazing')}
              </button>
              {/* G18 — the two threat tools, only where the caller armed them.
                  Deliberately after the ground buttons: they write a different
                  KIND of statement. */}
              {onThreatZoneCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedZoneId(null)
                    setMode(
                      freehandArmed
                        ? { kind: 'freehand', zone: 'threat', live: [] }
                        : { kind: 'threatZone', draft: [] },
                    )
                  }}
                  data-testid="draw-threat-zone"
                  className="btn-secondary min-h-[36px] py-1.5 text-micro"
                >
                  <Icon name="alert" size={13} />
                  {t('threat.drawZone')}
                </button>
              )}
              {onThreatVectorCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedZoneId(null)
                    setMode({ kind: 'threatVector', origin: null })
                  }}
                  data-testid="draw-threat-vector"
                  className="btn-secondary min-h-[36px] py-1.5 text-micro"
                >
                  <Icon name="send" size={13} />
                  {t('threat.addVector')}
                </button>
              )}
            </div>
          )}

          {/* G15 — the selected zone's live read-out and its two actions.
              Same bar, same rule: it is a context, so it is here. */}
          {selectedZone && !active && (
            <div
              data-testid="zone-selected"
              className="pointer-events-auto mt-2 flex flex-wrap items-center gap-2
                         rounded-card border border-accent bg-surface-overlay/95
                         px-3.5 py-2.5 shadow-glow backdrop-blur"
            >
              <span className="flex items-center gap-1.5 text-micro font-semibold text-content-primary">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-pill"
                  style={{ backgroundColor: zoneColor(selectedZone.kind, entity) }}
                />
                {t(zoneLabelKey(selectedZone.kind, entity))}
                <span className="numeric ltr-nums">
                  {t('zone.areaDunams', {
                    n: Math.round(ringAreaDunams(selectedZone.ring)).toLocaleString(
                      'he-IL',
                    ),
                  })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => {
                  onZoneDelete?.(selectedZone.id)
                  setSelectedZoneId(null)
                }}
                className="btn-secondary min-h-[36px] py-1.5 text-micro text-status-danger-ink"
              >
                <Icon name="trash" size={13} />
                {t('zone.deleteZone')}
              </button>
              <button
                type="button"
                onClick={() => setSelectedZoneId(null)}
                className="btn-secondary min-h-[36px] py-1.5 text-micro"
              >
                <Icon name="check" size={13} />
                {t('zone.doneEditing')}
              </button>
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  )
}
