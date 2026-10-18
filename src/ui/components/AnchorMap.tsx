import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  densify,
  entityKindOf,
  fromRing,
  parsePath,
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
  PathModel,
  ThreatVector,
  ThreatZone,
} from '@core/index'

import { Icon } from './Icon'
import { MapView } from './MapView'
import type { MapMarker, MapPolygon } from './MapView'
import { ThreatLegend, threatVectorShapes, threatZoneShapes } from './threats'
import { ZoneLegend, zoneColor, zoneDisplayName, zoneLabelKey, zoneSatColor } from './zones'
import { clearZoneDraft, readZoneDrafts, writeZoneDraft } from '../farm/zoneDraft'
import type { ZoneDraft } from '../farm/zoneDraft'
import { PointLegend } from './meet'
import { MapLegend } from './MapLegend'
import { farmMarkerColor, postColor, readToken } from './badges'
import { farmPin } from './placeMarkers'
import { fullscreenShell, useMapFullscreen } from './fullscreen'
import { PathEditor } from '../editor/PathEditor'
import type { EditorShape, StartRequest } from '../editor/PathEditor'
import type maplibregl from 'maplibre-gl'

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
  /** ★★ BK — avec le tracé éditable (`core/path.ts`) ; rend la forme créée (son id ouvre l'édition). */
  onZoneCreate?: (kind: FarmZoneKind, ring: LatLng[], path?: PathModel) => FarmZone | null | void
  onZoneRingChange?: (id: string, ring: LatLng[], path?: PathModel) => void
  onZoneDelete?: (id: string) => void
  /** ★★ BK — « שרטוט מחדש » : la nouvelle forme remplace l'ancienne (confirmé avant de tracer). */
  onZoneReplace?: (oldId: string, kind: FarmZoneKind, ring: LatLng[], path: PathModel) => FarmZone | null | void
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
  /**
   * ★★ AD3.3 — OUVRIR DÉJÀ ARMÉ EN MODE TRACÉ.
   *
   * La file « לתיחום » amène ici pour une seule chose : dessiner un contour.
   * Arriver sur une carte au repos et devoir retrouver le bon outil, c'est
   * trois gestes de plus par ferme, multipliés par le nombre de fiches de la
   * file — c'est-à-dire précisément ce que « sans repasser par la liste »
   * demande d'éviter.
   *
   * ⚠️ ARMÉ UNE FOIS, PAS MAINTENU. Le mode est un état de la carte : le
   *    réarmer à chaque rendu empêcherait de l'annuler avec Échap, et laisser
   *    l'URL le redemander après un tracé terminé rouvrirait un outil que le
   *    coordinateur vient de ranger.
   */
  armZone?: FarmZoneKind | null
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
  /* ★★ BK — les formes de la ferme se tracent dans l'éditeur (`ui/editor/`) ; ici ne reste que la menace. */
  | { kind: 'freehand'; zone: 'threat'; live: LatLng[] }

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
  onZoneReplace,
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
  armZone = null,
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
  /** ★★ BK — l'éditeur de tracés a une session ouverte (une forme en édition, ou en cours de tracé). */
  const [editorBusy, setEditorBusy] = useState(false)
  const fullscreen = useMapFullscreen(
    mode.kind !== 'idle' || selectedZoneId !== null || editorBusy,
  )

  const threatDrawing = mode.kind === 'threatZone' ? mode : null
  const vectorDrawing = mode.kind === 'threatVector' ? mode : null
  const tracing = mode.kind === 'freehand' ? mode : null
  const arming = mode.kind === 'placing'
  const zonesEditable = Boolean(onZoneCreate)
  // G16 — a moshav paints its ground in the blue family and its boundary is
  // "גבול היישוב"; everything mechanical stays identical.
  const entity = entityKindOf(farm)

  /**
   * ★★ BI (2026-10-15) — LE TRACÉ NON TERMINÉ, GARDÉ SUR L'APPAREIL
   * (`ui/farm/zoneDraft.ts`). ★★ BK : c'est l'éditeur qui l'écrit à chaque
   * geste (`onDraft`), avec son tracé (nœuds, poignées) ; seuls « סגירת
   * הצורה » et « מחיקת הטיוטה » confirmé l'effacent. Hors tracé, une bande le
   * nomme et propose de le reprendre — ou de NETTOYER tous les brouillons
   * abandonnés de la ferme, toujours sur confirmation.
   */
  const [storedDrafts, setStoredDrafts] = useState<ZoneDraft[]>(() => (zonesEditable ? readZoneDrafts(farm.id) : []))
  const storedDraft = storedDrafts[0] ?? null
  const [confirmDiscard, setConfirmDiscard] = useState<'one' | 'all' | false>(false)
  useEffect(() => {
    if (editorBusy) return
    setStoredDrafts(zonesEditable ? readZoneDrafts(farm.id) : [])
    setConfirmDiscard(false)
  }, [editorBusy, farm.id, zonesEditable])

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * ★★★ BK (2026-10-18) — LES FORMES DE LA FERME SE TRACENT ET SE RETOUCHENT
   *     DANS L'ÉDITEUR DE TRACÉS (`ui/editor/PathEditor.tsx`), le même que
   *     l'écran des régions. Ici : quelles formes, sous quel nom, et où va
   *     chaque geste. Voir `docs/bk/diagnostic.md` pour ce qu'il remplace.
   * ═════════════════════════════════════════════════════════════════════════
   */
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null)
  const [startReq, setStartReq] = useState<StartRequest | null>(null)
  const nonce = useRef(0)
  const startShape = (kind: FarmZoneKind, extra: Partial<StartRequest> = {}) => {
    nonce.current += 1
    setMode({ kind: 'idle' })
    setSelectedZoneId(null)
    setStartReq({ nonce: nonce.current, kind, tool: freehandArmed ? 'pencil' : 'pen', ...extra })
  }
  const resumeDraft = () => {
    if (!storedDraft) return
    const parsed = parsePath(storedDraft.path)
    const model = parsed && !parsed.closed ? parsed : fromRing(storedDraft.draft, false)
    startShape(storedDraft.zone, { resume: { model, draftId: storedDraft.id }, tool: 'pen' })
  }
  const discardDraft = () => {
    if (confirmDiscard === 'all') for (const d of storedDrafts) clearZoneDraft(farm.id, d.id)
    else if (storedDraft) clearZoneDraft(farm.id, storedDraft.id)
    setStoredDrafts(readZoneDrafts(farm.id))
    setConfirmDiscard(false)
  }
  /* « שרטוט מחדש » : confirmé ici, avant de tracer — la forme actuelle reste jusqu'à ce que la nouvelle soit fermée. */
  const [replaceAsk, setReplaceAsk] = useState<string | null>(null)

  /** Les formes de la ferme, nommées sans ambiguïté (deux « שטח מרעה » deviennent 1 et 2). */
  const editorShapes: EditorShape[] = useMemo(() => {
    const seen = new Map<string, number>()
    const totals = new Map<string, number>()
    for (const z of zones) totals.set(z.kind, (totals.get(z.kind) ?? 0) + 1)
    return zones.map((z) => {
      const n = (seen.get(z.kind) ?? 0) + 1
      seen.set(z.kind, n)
      const base = t(zoneLabelKey(z.kind, entity))
      return { id: z.id, label: (totals.get(z.kind) ?? 0) > 1 ? `${base} ${n}` : base, color: zoneColor(z.kind, entity), ring: z.ring, path: z.path }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, entity, t])

  useEffect(() => {
    if (mode.kind === 'idle') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      /* ★★ BK — une forme en édition : Échap appartient à l'éditeur (voir le garde de l'effet). */
      setMode({ kind: 'idle' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode.kind, selectedZoneId])

  /**
   * Disarm when the map stops being about the same farm: an armed mode carried
   * across a farm change would drop the next point (or vertex) on the wrong one.
   *
   * ★★ AD3.3 — ET C'EST AUSSI OÙ `armZone` EST HONORÉ, DANS LE MÊME EFFET.
   *
   * ⚠️ UN SECOND EFFET AURAIT ÉTÉ UN BOGUE D'ORDRE, ET IL L'A ÉTÉ : posé plus
   *    haut, il armait le mode et celui-ci le remettait à `idle` dans le même
   *    passage — `bun run adui` a rendu « the map came up idle » avec l'URL
   *    parfaitement correcte à côté. « La carte est devenue celle d'une autre
   *    ferme » a UN écrivain, et ce qu'il écrit est soit le repos, soit
   *    l'outil que la file a demandé.
   */
  useEffect(() => {
    /* ★★ BH — LE LIEN « לתיחום » (`?draw=`) N'ARME PLUS LE DESSIN QUAND LA
       FORME EXISTE DÉJÀ : il la SÉLECTIONNE. Sinon, à chaque retour par ce
       lien, le premier toucher sur la forme existante posait le premier
       sommet d'une NOUVELLE forme par-dessus — le symptôme du PO. */
    const existing = armZone ? zones.find((z) => z.kind === armZone) : undefined
    /* ★★ BI — un brouillon gardé passe d'abord : armer un tracé neuf le
       remplacerait au premier appui. La bande le propose. */
    setMode({ kind: 'idle' })
    setSelectedZoneId(existing && zonesEditable ? existing.id : null)
    if (armZone && zonesEditable && !existing && readZoneDrafts(farm.id).length === 0) startShape(armZone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farm.id, armZone, zonesEditable])

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
    threatDrawing
      ? `threat:${threatDrawing.draft.map((v) => `${v.lat},${v.lng}`).join(';')}`
      : '',
    vectorDrawing?.origin
      ? `vector:${vectorDrawing.origin.lat},${vectorDrawing.origin.lng}`
      : '',
    /* ★★ BK — l'étiquette de surface suit chaque geste écrit. */
    editorBusy && selectedZoneId ? `edit:${selectedZoneId}:${(zones.find((z) => z.id === selectedZoneId)?.ring ?? []).map((v) => `${v.lat},${v.lng}`).join(';')}` : '',
  ].join('#')

  /* La forme ouverte dans l'éditeur (telle qu'enregistrée : chaque geste l'est). */
  const editedZone = editorBusy && selectedZoneId ? (zones.find((z) => z.id === selectedZoneId) ?? null) : null

  /* ⛔ AN2 — une ferme sans position : pas de repère, pas de cadrage serré sur
     le point de repli (Jérusalem), la carte reste à l'échelle du pays. */
  const farmPt = farm.positionMissing ? null : farm.position
  const markers: MapMarker[] = useMemo(
    () => [
      ...(farmPt === null ? [] : [{
        id: farm.id,
        position: farmPt,
        // G7bis.1 — the farm's identity pastille: forest, always. Its status
        // lives in the chips beside the map, not in the pin's colour.
        color: farmMarkerColor(farm),
        title: farm.name,
        subtitle: farm.locality,
        ...farmPin(farm),
        // ★★ AU1 — la ferme de la fiche est le SUJET : aucun calque ne la cache.
        essential: true,
      }]),
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
      /* ★★ BK — les nœuds, poignées et « + » des formes de la ferme sont dans l'éditeur (une surcouche SVG), plus des marqueurs. */
      /* G15 / ★★ BI — la SURFACE de la forme éditée, posée sur la forme (la même que la barre, la tuile « מדוד » et la base). */
      ...(editedZone
        ? [
            {
              id: `zone-area-${editedZone.id}`,
              position: ringCenter(editedZone.ring),
              color: zoneColor(editedZone.kind, entity),
              title: t('zone.areaDunams', { n: Math.round(ringAreaDunams(editedZone.ring)).toLocaleString('he-IL') }),
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
      /* ★★ BK — la carte dessine TOUTES les formes (la forme éditée comprise : son
         remplissage suit chaque geste écrit) ; l'éditeur trace par-dessus le
         contour EN DIRECT, sous le doigt. */
      ...zones.map((z) => ({
        id: z.id,
        ring: z.ring,
        kind: z.kind,
        color: zoneColor(z.kind, entity),
        // U5 — the frank tint the zone takes over satellite imagery.
        satColor: zoneSatColor(z.kind, entity),
        emphasis: z.id === selectedZoneId,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      zones.map((z) => `${z.id}:${z.kind}:${z.ring.length}`).join('|'),
      zones
        .map((z) => z.ring.map((v) => `${v.lat},${v.lng}`).join(';'))
        .join('|'),
      selectedZoneId,
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
    const centre = trace.length > 0 ? trace[0] : (farmPt ?? farm.position)
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

    setMode({ kind: 'threatZone', draft: ring, traced: true })
  }

  const handleMapClick = (position: LatLng) => {
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

  /**
   * ★ ONE ENTRY POINT FOR BOTH WAYS OF DRAWING, and the kind is still chosen
   *   first. ★★ BK : la forme s'ouvre dans l'éditeur, avec la plume ou la main
   *   levée selon `freehandArmed` — et le PO change d'outil quand il veut.
   */
  const startDrawing = (zone: FarmZoneKind) => startShape(zone)

  const empty = anchors.length === 0
  const active = mode.kind !== 'idle' || editorBusy
  /**
   * ★ WHEN A TAP ON THE MAP MEANS SOMETHING. Not while a stroke is being
   *   traced (the pointer handler owns the gesture), and not on a draft that
   *   CAME from a stroke (its vertices are grips now, not a list being
   *   appended to).
   */
  const acceptsClicks =
    arming ||
    vectorDrawing !== null ||
    (threatDrawing !== null && !threatDrawing.traced)
  /**
   * The live surface, while the hand is still moving. Three points is the
   * floor for an area, so a trace shorter than that reports nothing rather
   * than zero — "0 dunams" and "not a shape yet" are different statements.
   */
  const liveDunams =
    tracing && tracing.live.length >= 3 ? ringAreaDunams(tracing.live) : null

  /**
   * ★ W6 (2026-09-02) — OPENING A SHEET FRAMES *THIS* ENTITY, CLOSE.
   *
   * `center = farm.position, zoom = 13` framed the region, not the farm: the
   * product owner's own words were that everything comes up minuscule. What
   * the sheet is about is the entity's OWN geometry — the rings of its
   * boundary and grazing, its guard posts, its pin — so that is what the
   * camera is given, with a 25 % margin around the box and a 56 px inset for
   * the controls that float over it.
   *
   * Keyed on the farm's id ALONE: the camera moves once, when the sheet
   * opens. Adding a vertex, dragging a post or panning must never re-frame
   * under the hand doing it (see `frameTo` in MapCanvas).
   */
  const framePoints = useMemo(
    () => [
      ...zones.flatMap((z) => z.ring),
      ...anchors.map((a) => a.position),
      ...(farmPt ? [farmPt] : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, anchors, farmPt?.lat, farmPt?.lng],
  )

  return (
    <div className={fullscreenShell(fullscreen.active, `relative ${className}`)}>
      <MapView
        ariaLabel={t('a11y.map')}
        className={`h-full w-full transition-shadow duration-base ${
          flush && !fullscreen.active ? 'rounded-none' : 'rounded-card'
        } ${active ? 'ring-2 ring-accent' : ''}`}
        center={farmPt ?? undefined}
        zoom={farmPt ? 13 : 7}
        frameTo={{ points: framePoints, key: farm.id }}
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
          threatDrawing && !threatDrawing.traced
            ? () => closeThreatDraft(true)
            : undefined
        }
        /* ★★ BK — toucher une forme (même recouverte par une autre) : c'est l'éditeur
           qui choisit, et qui demande laquelle quand plusieurs s'empilent. */
        onMapInstance={setMapInstance}
        /* ★★ BK — pendant une édition, l'appui long DESSINE (ou saisit un point) : jamais une épingle rapide. */
        quickPin={!editorBusy}
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
                color: readToken('--status-danger'),
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
          <div className="pointer-events-auto" data-top-banner="map-overlay">{overlay}</div>
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
      {/* X3.5 — `start-7`: the seam's grip hangs into this edge. See MapPanel. */}
      <div className="pointer-events-none absolute bottom-9 end-3 start-7 z-10 flex flex-col gap-2 pl-[4.5rem]">
        {/* The control sits ON the map, because the map is what it is about.
            The empty case is louder on purpose: with no points yet, this
            banner IS the only route forward. */}
        {(onCreate || zonesEditable || threatDrawing || vectorDrawing) && (
          <div className="w-full self-stretch">
          {/* ★★ W5 (2026-09-02) — THE LONG BAR DOES NOT COME BACK.
              It used to be printed whenever the map could create ANYTHING —
              i.e. permanently, on every farm — carrying "הקישו על המפה כדי
              להוסיף עמדה" and a הוסף נקודה button that the pencil menu
              already offers. A permanent instruction bar across the foot of
              a map is the single biggest thing between the product owner and
              his own geography.

              It now exists ONLY while something is armed, which is the one
              moment it says something that is both true and new: what is
              being drawn, how many vertices, how many dunams, and the way
              out. Nothing armed → no bar at all, and the pencil is the only
              thing on the canvas.

              `w-auto self-start` and `flex-nowrap`: it is a strip beside the
              legend, not a rule across the map. */}
          {!active && storedDraft && zonesEditable && (
            <div
              role="status"
              data-testid="zone-draft-banner"
              data-zone={storedDraft.zone}
              data-vertices={storedDraft.draft.length}
              data-drafts={storedDrafts.length}
              className="glass pointer-events-auto mb-2 flex w-auto max-w-full flex-wrap items-center gap-2 self-start rounded-card px-3.5 py-2.5 shadow-glow ring-1 ring-status-warn sm:max-w-[28rem]"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-caption font-semibold text-content-primary">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-pill" style={{ backgroundColor: zoneColor(storedDraft.zone, entity) }} />
                {t('zone.draftKept', { name: zoneDisplayName({ kind: storedDraft.zone }, farm, t), count: storedDraft.draft.length })}
              </span>
              {storedDrafts.length > 1 && (
                <span className="text-micro text-content-muted" data-testid="zone-draft-more" data-count={storedDrafts.length - 1}>
                  {t('zone.draftMore', { count: storedDrafts.length - 1 })}
                </span>
              )}
              <span className="basis-full text-micro text-content-muted">{t('zone.draftKeptHint')}</span>
              {confirmDiscard ? (
                <>
                  <span className="text-micro font-semibold text-status-danger-ink">
                    {confirmDiscard === 'all' ? t('zone.draftDiscardAllConfirm', { count: storedDrafts.length }) : t('zone.draftDiscardConfirm')}
                  </span>
                  <button type="button" data-testid="zone-draft-discard-yes" className="btn-secondary min-h-11 py-1.5 text-micro text-status-danger-ink" onClick={discardDraft}>
                    <Icon name="trash" size={13} />
                    {t('zone.draftDiscardYes')}
                  </button>
                  <button type="button" data-testid="zone-draft-discard-no" className="btn-secondary min-h-11 py-1.5 text-micro" onClick={() => setConfirmDiscard(false)}>
                    {t('common.cancel')}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" data-testid="zone-draft-resume" className="btn-primary min-h-11 py-1.5 text-micro" onClick={resumeDraft}>
                    <Icon name="edit" size={13} />
                    {t('zone.draftResume')}
                  </button>
                  <button type="button" data-testid="zone-draft-discard" className="btn-secondary min-h-11 py-1.5 text-micro" onClick={() => setConfirmDiscard('one')}>
                    <Icon name="trash" size={13} />
                    {t('zone.draftDiscard')}
                  </button>
                  {/* ★★ BK — les brouillons abandonnés ne s'accumulent pas en silence : on les nomme et on propose de les nettoyer. */}
                  {storedDrafts.length > 1 && (
                    <button type="button" data-testid="zone-draft-discard-all" className="btn-secondary min-h-11 py-1.5 text-micro" onClick={() => setConfirmDiscard('all')}>
                      <Icon name="trash" size={13} />
                      {t('zone.draftDiscardAll', { count: storedDrafts.length })}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {mode.kind !== 'idle' && (
          <div
            data-testid="draw-context-bar"
            className="glass pointer-events-auto flex w-auto max-w-full items-center gap-x-3
                       gap-y-2 self-start rounded-card px-3.5 py-2.5 shadow-glow ring-1 ring-accent
                       sm:max-w-[26rem]"
          >
            <span className="shrink-0 text-accent-ink">
              <Icon
                name={
                  tracing || threatDrawing
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

            <p className="min-w-0 text-caption text-content-secondary">
              <span className="font-semibold text-content-primary">
                {tracing
                  ? t('zone.tracing')
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
            ) : arming ? (
              <button
                type="button"
                onClick={() => setMode({ kind: 'idle' })}
                className="btn-secondary shrink-0 py-1.5 text-micro"
              >
                <Icon name="close" size={13} />
                {t('common.cancel')}
              </button>
            ) : null}
          </div>
          )}

          {/* ★★★ BK — L'ÉDITEUR DE TRACÉS : son panneau ici, ses nœuds sur la carte. */}
          {zonesEditable && replaceAsk && (
            <div role="alertdialog" data-testid="zone-replace-confirm" className="glass pointer-events-auto mb-2 flex w-auto max-w-full flex-wrap items-center gap-2 self-start rounded-card px-3.5 py-2.5 shadow-glow ring-1 ring-status-warn sm:max-w-[30rem]">
              <span className="basis-full text-caption font-semibold text-content-primary">
                {t('zone.replaceConfirm', { name: editorShapes.find((x) => x.id === replaceAsk)?.label ?? '' })}
              </span>
              <button
                type="button"
                data-testid="zone-replace-yes"
                className="btn-primary min-h-11 py-1.5 text-micro"
                onClick={() => {
                  const z = zones.find((x) => x.id === replaceAsk)
                  setReplaceAsk(null)
                  if (z) startShape(z.kind, { replaceId: z.id })
                }}
              >
                {t('zone.replaceYes')}
              </button>
              <button type="button" data-testid="zone-replace-no" className="btn-secondary min-h-11 py-1.5 text-micro" onClick={() => setReplaceAsk(null)}>
                {t('common.cancel')}
              </button>
            </div>
          )}
          {zonesEditable && (
            <PathEditor
              map={mapInstance}
              entityLabel={farm.name}
              shapes={editorShapes}
              kinds={(['farm_boundary', 'grazing_area'] as const).map((k) => ({ kind: k, label: t(zoneLabelKey(k, entity)), color: zoneColor(k, entity) }))}
              activeId={selectedZoneId}
              onActiveChange={setSelectedZoneId}
              start={startReq}
              onBusyChange={setEditorBusy}
              onChange={(id, model, ring) => onZoneRingChange?.(id, ring, model)}
              onCreate={(kind, model, ring, replaceId) => {
                const made = replaceId && onZoneReplace ? onZoneReplace(replaceId, kind as FarmZoneKind, ring, model) : onZoneCreate?.(kind as FarmZoneKind, ring, model)
                return made ? made.id : null
              }}
              onDraft={(kind, draftId, model) => {
                if (model) writeZoneDraft(farm.id, { id: draftId, zone: kind as FarmZoneKind, draft: densify(model), path: model })
                else clearZoneDraft(farm.id, draftId)
              }}
              onDelete={
                onZoneDelete
                  ? (id) => {
                      /* La suppression est confirmée par l'écran, qui NOMME la forme. */
                      onZoneDelete(id)
                    }
                  : undefined
              }
              onReplace={onZoneReplace ? (id) => setReplaceAsk(id) : undefined}
            />
          )}
          </div>
        )}

        {/* U4 (2026-09-02) — THE BOTTOM ROW: the foldable legend at the inline
            start, the drawing tools' frosted button at the inline end. The
            tools used to be a wrapping row of five buttons that sat on the
            map permanently; now one 44 px glass button unfolds them on tap
            and folds them after a choice or a tap elsewhere. The map stays
            clean. */}
        {/* ★ X6 — `flex-wrap`, AND IT IS THE FIX FOR A REAL OVERFLOW. At 75 %
            of the wizard's seam this row has ~146 px (the map's 25 %, less its
            two insets and the 4.5 rem strip the mode pill owns) and it holds a
            legend, the licence "i" and the pencil — about 180 px. A `flex`
            row that cannot fit overflows at its END, which in Hebrew is the
            physical LEFT, i.e. into negative x, which is exactly where an RTL
            page's `scrollWidth` grows. Caught by `bun run layout` at ipad
            PORTRAIT and nowhere else. It is anchored by `bottom`, so wrapping
            grows it upward, over the map, at no cost. */}
        {/**
          * ★★ Y3.3 (2026-09-04) — THE PENCIL MOVED TO THE LEGEND'S SIDE.
          *
          * This row was `justify-between`: the legend at the inline start —
          * the physical RIGHT in Hebrew — and the drawing tools at the inline
          * end, i.e. the physical LEFT. Y3.3 laid the mode pill down beside
          * the "+" in exactly that corner, and `bun run blocks` caught the
          * result as a sixty-second timeout: "map-mode-full … intercepts
          * pointer events". The pencil was under the band.
          *
          * ⚠️ AND RESERVING THE BAND'S WIDTH WAS THE FIRST ANSWER, WHICH THE
          *    SWEEP REJECTED. A 232 px `padding-inline-start` gives the row a
          *    232 px min-content, and at 75 % of the mission wizard's seam the
          *    map column is narrower than that: `bun run layout` reported
          *    "HORIZONTAL SCROLL: scrollWidth 1074 vs window 1032 → div…
          *    bottom-9 (232px)". A reservation cannot fix a conflict on a
          *    surface too narrow to hold both.
          *
          * So the two controls share the side the band is NOT on. They read
          * better together anyway — the legend explains the map and the pencil
          * draws on it — and the physical left is left to the band alone.
          */}
        <div className="flex flex-wrap items-end justify-start gap-2">
          <MapLegend defaultOpen={false}>
            {/* G7bis.1 — one legend stack: what the point shapes mean, then
                what the painted ground means, then the assessment. */}
            <PointLegend showFarm showPost showMeet={false} entity={entity} />
            <ZoneLegend zones={zones} entity={entity} />
            <ThreatLegend zones={threatZones} vectors={threatVectors} />
          </MapLegend>
          {/* ★ W5 — THE PENCIL IS THE ONLY WAY IN NOW, so it has to exist on
              every map that can create ANYTHING, not only on the ones that
              can draw a polygon: הוסף נקודה used to live in the long bar and
              this is where it went. */}
          {(zonesEditable || onCreate) && !active && (
            <DrawToolsFab label={zonesEditable ? t('zone.newShape') : undefined}>
              {zonesEditable && (
              <>
              {/* ★★ PO POINT 9b — ציור חופשי, AND IT IS A MODE SWITCH RATHER
                  THAN A SIXTH TOOL. The kind of area is still chosen with the
                  buttons beside it; this decides HOW the ring is produced —
                  a continuous stroke instead of vertex-by-vertex — which is
                  why it is pressed FIRST and stays pressed. */}
              <button
                type="button"
                onClick={() => setFreehandArmed((armed) => !armed)}
                data-testid="draw-freehand"
                data-keep-open=""
                aria-pressed={freehandArmed}
                className={`min-h-11 justify-start py-1.5 text-micro ${
                  freehandArmed ? 'btn-primary' : 'btn-secondary'
                }`}
              >
                <Icon name="edit" size={14} />
                {t('zone.freehand')}
              </button>
              <button
                type="button"
                onClick={() => startDrawing('farm_boundary')}
                data-testid="draw-boundary"
                className="btn-secondary min-h-11 justify-start py-1.5 text-micro"
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
                className="btn-secondary min-h-11 justify-start py-1.5 text-micro"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-pill"
                  style={{ backgroundColor: zoneColor('grazing_area', entity) }}
                />
                {t('zone.drawGrazing')}
              </button>
              {/* G18 — the two threat tools, only where the caller armed
                  them. After the ground buttons: they write a different KIND
                  of statement. */}
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
                  className="btn-secondary min-h-11 justify-start py-1.5 text-micro"
                >
                  <Icon name="alert" size={14} />
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
                  className="btn-secondary min-h-11 justify-start py-1.5 text-micro"
                >
                  <Icon name="send" size={14} />
                  {t('threat.addVector')}
                </button>
              )}
              </>
              )}
              {onCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedZoneId(null)
                    setMode({ kind: 'placing' })
                  }}
                  data-testid="draw-add-point"
                  className="btn-secondary min-h-11 justify-start py-1.5 text-micro"
                >
                  <Icon name="pin" size={14} />
                  {t('anchor.addPoint')}
                </button>
              )}
            </DrawToolsFab>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * U4.1 — THE FROSTED TOOLS BUTTON. One 44 px glass button; a tap unfolds a
 * glass column with the tools above it; a tool press folds it (unless the
 * button carries `data-keep-open`, the freehand switch, which is a setting
 * rather than an action); a tap anywhere else, or Escape, folds it too.
 */
function DrawToolsFab({ children, label }: { children: React.ReactNode; label?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="pointer-events-auto relative shrink-0" data-testid="draw-tools" data-open={open ? '1' : '0'}>
      {open && (
        <div
          role="group"
          aria-label={t('map.tools.draw')}
          data-testid="draw-tools-panel"
          className="glass absolute bottom-full end-0 mb-2 flex w-56 animate-fade-in flex-col gap-1 rounded-card p-1.5"
          onClick={(e) => {
            const target = (e.target as HTMLElement).closest('button')
            if (target && !target.hasAttribute('data-keep-open')) setOpen(false)
          }}
        >
          <span className="px-2 pb-0.5 pt-1 text-micro font-semibold text-content-muted">
            {t('zone.toolsLabel')}
          </span>
          {children}
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t(open ? 'map.tools.drawClose' : 'map.tools.drawOpen')}
        title={t('map.tools.draw')}
        data-testid="draw-tools-toggle"
        className={`glass flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-pill transition-colors duration-fast ${label ? 'px-3.5' : 'w-11'} ${
          open ? 'bg-accent text-content-on-accent' : 'text-content-primary hover:text-accent-ink'
        }`}
      >
        <Icon name={open ? 'close' : 'edit'} size={19} />
        {/* ★★ BH — « צורה חדשה » : commencer une forme est un geste EXPLICITE. */}
        {label && !open && <span className="text-caption font-semibold" data-testid="zone-new">{label}</span>}
      </button>
    </div>
  )
}
