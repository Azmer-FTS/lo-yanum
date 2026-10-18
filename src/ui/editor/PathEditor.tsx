import type maplibregl from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import {
  appendNode,
  bezierAt,
  closePath,
  densify,
  emptyPath,
  extendWithStroke,
  fitStroke,
  historyOf,
  insertNode,
  modelForRing,
  moveHandle,
  moveNode,
  nearestOnPath,
  pathAreaDunams,
  pointInRing,
  pushHistory,
  redoHistory,
  redrawSection,
  removeNode,
  ringAreaDunams,
  segmentControls,
  segmentCount,
  simplifyToleranceM,
  toggleNodeKind,
  tracedRingIsClosed,
  translatePath,
  undoHistory,
} from '@core/index'
import type { History, LatLng, PathModel } from '@core/index'

import { Icon } from '../components/Icon'
import { roadSegments, snapLngLat } from './roadSnap'
import type { RoadSegments } from './roadSnap'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BK (2026-10-18) — L'ÉDITEUR DE TRACÉS. UN SEUL, PARTOUT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Très compliqué à éditer. Plusieurs formes l'une par-dessus l'autre, et
 *     je ne sais pas comment en supprimer une. Quand je clique sur un point,
 *     il ne l'enlève pas. Un panneau s'ouvre, c'est écrit n'importe comment. »
 *                                                                   — le PO
 *
 * Diagnostic : `docs/bk/diagnostic.md`. Ce composant remplace les DEUX
 * éditeurs d'avant (l'écran des régions et la carte d'une ferme), qui avaient
 * deux grammaires de geste contraires.
 *
 * ★ LA GRAMMAIRE, UNE SEULE, CELLE D'ILLUSTRATOR, AU DOIGT COMME À LA SOURIS :
 *   · toucher un NŒUD le SÉLECTIONNE (jamais il ne le supprime) ; le glisser le
 *     déplace ; le toucher deux fois le fait passer de coin à arrondi ;
 *   · un nœud sélectionné se supprime par « מחיקת הנקודה » OU la touche Suppr /
 *     ⌫ — le PO travaille aussi sur iPad, où il n'y a pas de touche ;
 *   · un nœud ARRONDI montre ses deux poignées ; on les tire pour régler la
 *     courbe, l'autre reste alignée (`core/path.ts`, `moveHandle`) ;
 *   · le petit « + » au milieu d'un segment ajoute un nœud là (touché) ou là
 *     où on le lâche (glissé) — il ne ressemble PAS à un nœud ;
 *   · la poignée ✥ au centre déplace la forme entière ;
 *   · les outils : « בחירה » (la carte se déplace normalement), « עט » (chaque
 *     toucher pose un nœud, un toucher tiré pose un nœud arrondi, le premier
 *     nœud ferme ; sur une forme fermée, toucher le contour ajoute un nœud),
 *     « יד חופשית » (un trait devient des nœuds ; sur une forme fermée, un
 *     trait qui part du contour et y revient en remplace la portion) — et on
 *     passe de l'un à l'autre À TOUT MOMENT, y compris en cours de tracé ;
 *   · annuler / refaire sans limite pratique (500 gestes), boutons et
 *     ⌘Z / ⇧⌘Z / Ctrl+Y.
 *
 * ★ AU DOIGT : les nœuds, les poignées et la poignée ✥ sont des cibles de
 *   44 px ; ils vivent dans une surcouche SVG posée DANS le conteneur de la
 *   carte mais HORS de sa toile — un doigt posé sur un nœud ne parvient jamais
 *   à MapLibre, la carte ne peut pas glisser sous lui. Avec « עט » et
 *   « יד חופשית », un doigt dessine et la carte ne glisse plus ; deux doigts
 *   pincent toujours, et la barre d'espace déplace la carte à la souris.
 *
 * ★ LES SUPERPOSITIONS : la forme en cours d'édition est dessinée PAR-DESSUS
 *   les autres ; un toucher là où plusieurs formes s'empilent ouvre un CHOIX
 *   qui les nomme (la plus petite d'abord : c'est elle qu'on ne peut pas
 *   atteindre autrement) ; et le panneau liste toutes les formes de l'entité.
 *
 * ★ LE PANNEAU DIT : l'entité, la forme, le nombre de points, la surface, les
 *   actions. Rien d'autre (le diagnostic de BI/BJ n'est plus sur les cartes).
 *
 * L'hôte (la carte d'une ferme, l'écran des régions) garde la DONNÉE : il dit
 * quelles formes existent, et reçoit chaque geste (`onChange`), chaque forme
 * fermée (`onCreate`), chaque brouillon (`onDraft`), chaque suppression
 * demandée (`onDelete`, qu'il fait CONFIRMER). Chaque geste est écrit (BI).
 */

export interface EditorShape {
  id: string
  /** Ce que le PO lit : « גבול החווה », « שטח מרעה 2 », « יהודה ». */
  label: string
  color: string
  /** La forme réelle enregistrée. */
  ring: LatLng[]
  /** Le tracé enregistré (`zones.path`, `region-paths`) — repris seulement s'il redonne `ring`. */
  path?: unknown
}

export interface EditorKind {
  kind: string
  label: string
  color: string
}

export type EditorTool = 'select' | 'pen' | 'pencil'

/** Une demande de l'hôte : commencer une forme (de ce type, avec cet outil), ou reprendre un brouillon. */
export interface StartRequest {
  nonce: number
  kind: string
  tool: 'pen' | 'pencil'
  /** La forme qu'elle remplacera une fois fermée (confirmé par l'hôte AVANT). */
  replaceId?: string
  resume?: { model: PathModel; draftId: string }
}

export interface PathEditorProps {
  map: maplibregl.Map | null
  /** L'entité dont on édite les formes : « חוות בדיקה 11 », « אזורי הארץ ». */
  entityLabel: string
  shapes: EditorShape[]
  kinds: EditorKind[]
  activeId: string | null
  onActiveChange: (id: string | null) => void
  start?: StartRequest | null
  /** Une session est ouverte (édition ou tracé neuf) — l'hôte range ses autres outils. */
  onBusyChange?: (busy: boolean) => void
  onChange: (id: string, model: PathModel, ring: LatLng[]) => void
  /** Une forme neuve FERMÉE : l'hôte l'écrit et rend son identifiant. */
  onCreate: (kind: string, model: PathModel, ring: LatLng[], replaceId?: string) => string | null
  /** Le brouillon d'une forme neuve non fermée (appareil, BI) ; `null` = plus de brouillon. */
  onDraft?: (kind: string, draftId: string, model: PathModel | null) => void
  /** Demander la suppression d'une forme (l'hôte confirme en la nommant). Absent = pas de suppression. */
  onDelete?: (id: string) => void
  /** « שרטוט מחדש » : l'hôte confirme, puis renvoie un `start` avec `replaceId`. */
  onReplace?: (id: string) => void
  /** Des actions propres à l'hôte (l'écran des régions : שמירה, ביטול שינויים…). */
  extraActions?: ReactNode
}

type Session =
  | { mode: 'edit'; id: string; h: History<PathModel> }
  | { mode: 'new'; kind: string; draftId: string; replaceId?: string; h: History<PathModel> }

type Drag =
  | { type: 'node'; index: number; pointerId: number; x0: number; y0: number; moved: boolean }
  | { type: 'handle'; index: number; which: 'in' | 'out'; pointerId: number; x0: number; y0: number; moved: boolean }
  | { type: 'mid'; seg: number; pointerId: number; x0: number; y0: number; moved: boolean; inserted: number | null }
  | { type: 'move'; pointerId: number; x0: number; y0: number; moved: boolean; from: LatLng }

const HIT = 22
/** Deux touchers en moins de 400 ms sur le même point : un double toucher (un doigt est plus lent qu'une souris). */
const DOUBLE_TAP_MS = 400

let draftSeq = 0
const newDraftId = () => `draft-${Date.now().toString(36)}-${(draftSeq += 1)}`

const ringOfShape = (s: EditorShape): Array<[number, number]> => s.ring.map((p) => [p.lng, p.lat])

export function PathEditor(props: PathEditorProps) {
  const { map, entityLabel, shapes, kinds, activeId, onActiveChange, start } = props
  const { t, i18n } = useTranslation()

  const [session, setSessionState] = useState<Session | null>(null)
  const [tool, setTool] = useState<EditorTool>('select')
  const [selected, setSelected] = useState<number | null>(null)
  const [live, setLive] = useState<PathModel | null>(null)
  const [trace, setTrace] = useState<LatLng[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [snap, setSnap] = useState(false)
  const [picker, setPicker] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  const [, setTick] = useState(0)
  const [host, setHost] = useState<HTMLElement | null>(null)

  const sessionRef = useRef<Session | null>(null)
  const setSession = (s: Session | null) => {
    sessionRef.current = s
    setSessionState(s)
  }
  const model: PathModel | null = live ?? session?.h.present ?? null

  /* Tout ce que les gestionnaires d'événements lisent, toujours à jour. */
  const latest = useRef({ props, tool, selected, snap, model })
  latest.current = { props, tool, selected, snap, model }

  // -------------------------------------------------------------------------
  // La surcouche : un conteneur dans celui de la carte, hors de sa toile.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) {
      setHost(null)
      return
    }
    const el = document.createElement('div')
    el.setAttribute('data-testid', 'path-editor-overlay')
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:1;touch-action:none;'
    map.getContainer().appendChild(el)
    /**
     * ★ AU DOIGT, UNE POIGNÉE SAISIE NE FAIT JAMAIS DÉFILER LA PAGE. La fiche
     *   sous la carte défile ; un doigt qui part d'un point et glisse était
     *   pris par le navigateur pour un défilement, qui ANNULAIT le geste en
     *   route (`pointercancel`) : le point s'arrêtait à mi-chemin (22 px,
     *   `bkeditui` A553/A554 au doigt). `touch-action` sur l'intérieur d'un SVG
     *   n'est pas tenu partout (Safari) : on empêche le défilement à la source.
     */
    const stopScroll = (e: TouchEvent) => {
      if ((e.target as Element | null)?.closest?.('[data-grip]')) e.preventDefault()
    }
    el.addEventListener('touchstart', stopScroll, { passive: false })
    el.addEventListener('touchmove', stopScroll, { passive: false })
    setHost(el)
    let frame = 0
    const repaint = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setTick((n) => n + 1)
      })
    }
    map.on('move', repaint)
    map.on('resize', repaint)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      map.off('move', repaint)
      map.off('resize', repaint)
      el.removeEventListener('touchstart', stopScroll)
      el.removeEventListener('touchmove', stopScroll)
      el.remove()
    }
  }, [map])

  // -------------------------------------------------------------------------
  // Ouvrir / fermer selon l'hôte
  // -------------------------------------------------------------------------
  const shapeById = (id: string | null) => (id ? (props.shapes.find((s) => s.id === id) ?? null) : null)

  useEffect(() => {
    const s = sessionRef.current
    if (activeId === null) {
      if (s?.mode === 'edit') {
        setSession(null)
        setSelected(null)
        setLive(null)
      }
      return
    }
    if (s?.mode === 'edit' && s.id === activeId) return
    const shape = shapeById(activeId)
    if (!shape) return
    setSession({ mode: 'edit', id: shape.id, h: historyOf(modelForRing(shape.ring, shape.path).model) })
    setSelected(null)
    setLive(null)
    setNotice(null)
    setTool('select')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  /* La forme a DISPARU (supprimée, confirmé par l'hôte ; ou ailleurs) : l'éditeur se referme. */
  const activeExists = activeId === null || props.shapes.some((s) => s.id === activeId)
  useEffect(() => {
    const s = sessionRef.current
    if (!activeExists && s?.mode === 'edit' && s.id === activeId) finish()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExists])

  /* La forme a changé AILLEURS (relecture, autre appareil) et on n'y a pas touché ici : on la reprend. */
  const activeShape = shapeById(activeId)
  const activeRingKey = activeShape ? activeShape.ring.map((p) => `${p.lat},${p.lng}`).join(';') : ''
  useEffect(() => {
    const s = sessionRef.current
    if (!s || s.mode !== 'edit' || !activeShape || s.h.past.length > 0 || s.h.future.length > 0) return
    const fresh = modelForRing(activeShape.ring, activeShape.path).model
    if (JSON.stringify(fresh) !== JSON.stringify(s.h.present)) setSession({ ...s, h: historyOf(fresh) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRingKey])

  useEffect(() => {
    if (!start) return
    const draftId = start.resume?.draftId ?? newDraftId()
    setSession({ mode: 'new', kind: start.kind, draftId, replaceId: start.replaceId, h: historyOf(start.resume?.model ?? emptyPath()) })
    setTool(start.tool)
    setSelected(null)
    setLive(null)
    setNotice(null)
    setPicker(null)
    onActiveChange(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start?.nonce])

  const busy = session !== null
  useEffect(() => {
    props.onBusyChange?.(busy)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy])

  // -------------------------------------------------------------------------
  // Écrire un geste
  // -------------------------------------------------------------------------
  const persist = (s: Session, next: PathModel): Session => {
    const p = latest.current.props
    if (s.mode === 'edit') {
      if (next.closed && next.nodes.length >= 3) p.onChange(s.id, next, densify(next))
      return s
    }
    if (next.closed) {
      const ring = densify(next)
      const id = p.onCreate(s.kind, next, ring, s.replaceId)
      p.onDraft?.(s.kind, s.draftId, null)
      if (id) {
        setTool('select')
        setTimeout(() => p.onActiveChange(id), 0)
        return { mode: 'edit', id, h: historyOf(next) }
      }
      /* Refusée (moins de trois points DISTINCTS) : la forme reste ouverte, et c'est dit. */
      setTimeout(() => setNotice(t('editor.cannotClose')), 0)
      return { ...s, h: undoHistory(s.h) } as Session
    }
    p.onDraft?.(s.kind, s.draftId, next.nodes.length > 0 ? next : null)
    return s
  }

  const commit = (next: PathModel, select: number | null = latest.current.selected) => {
    const s = sessionRef.current
    if (!s) return
    setLive(null)
    setNotice(null)
    const pushed = { ...s, h: pushHistory(s.h, next) } as Session
    setSession(persist(pushed, next))
    setSelected(select !== null && select < next.nodes.length ? select : null)
  }

  const undo = () => {
    const s = sessionRef.current
    if (!s || s.h.past.length === 0) return
    const h = undoHistory(s.h)
    setLive(null)
    setNotice(null)
    setSession(persist({ ...s, h } as Session, h.present))
    setSelected(null)
  }
  const redo = () => {
    const s = sessionRef.current
    if (!s || s.h.future.length === 0) return
    const h = redoHistory(s.h)
    setLive(null)
    setSession(persist({ ...s, h } as Session, h.present))
    setSelected(null)
  }

  const deleteSelected = () => {
    const m = latest.current.model
    const i = latest.current.selected
    if (!m || i === null) return
    const r = removeNode(m, i)
    if (!r.ok) {
      setNotice(t('editor.minNodes'))
      return
    }
    commit(r.model, null)
  }

  const toggleSelected = () => {
    const m = latest.current.model
    const i = latest.current.selected
    if (!m || i === null) return
    commit(toggleNodeKind(m, i), i)
  }

  const closeNow = () => {
    const m = latest.current.model
    if (!m || m.closed) return
    const c = closePath(m)
    if (c) commit(c, null)
    else setNotice(t('editor.needThree'))
  }

  const finish = () => {
    setSession(null)
    setSelected(null)
    setLive(null)
    setTrace(null)
    setNotice(null)
    setPicker(null)
    setTool('select')
    onActiveChange(null)
  }

  // -------------------------------------------------------------------------
  // La géométrie à l'écran
  // -------------------------------------------------------------------------
  const project = (p: LatLng) => (map ? map.project([p.lng, p.lat]) : { x: 0, y: 0 })
  const unproject = (x: number, y: number): LatLng => {
    if (!map) return { lat: 0, lng: 0 }
    const ll = map.unproject([x, y])
    return { lat: ll.lat, lng: ll.lng }
  }
  const local = (e: { clientX: number; clientY: number }) => {
    const r = map?.getContainer().getBoundingClientRect()
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) }
  }
  const roadsRef = useRef<RoadSegments | null>(null)
  const snapped = (p: LatLng): LatLng => (map && latest.current.snap ? snapLngLat(map, roadsRef.current, p) : p)
  const loadRoads = () => {
    roadsRef.current = map && latest.current.snap ? roadSegments(map) : null
  }

  // -------------------------------------------------------------------------
  // La plume et la main levée : sur la toile de la carte
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map || !session || tool === 'select') return
    const canvas = map.getCanvas()
    const panWas = map.dragPan.isEnabled()
    const rotateWas = map.dragRotate.isEnabled()
    map.dragPan.disable()
    map.dragRotate.disable()
    const prevTouch = canvas.style.touchAction
    const prevCursor = canvas.style.cursor
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'crosshair'

    const pointers = new Set<number>()
    let gesture: { id: number; x: number; y: number; moved: boolean; at: LatLng; pts: LatLng[]; lx: number; ly: number } | null = null
    let spacePan = false

    const cancelGesture = () => {
      gesture = null
      setLive(null)
      setTrace(null)
    }
    const down = (e: PointerEvent) => {
      pointers.add(e.pointerId)
      if (pointers.size > 1 || spacePan) {
        /* Deux doigts : un pincement, jamais un nœud. */
        cancelGesture()
        return
      }
      if (!e.isPrimary || e.button > 0) return
      e.preventDefault()
      try {
        canvas.setPointerCapture(e.pointerId)
      } catch {
        /* voir MapCanvas (freehand) : la capture est une commodité */
      }
      loadRoads()
      const p = local(e)
      const at = unproject(p.x, p.y)
      gesture = { id: e.pointerId, x: p.x, y: p.y, moved: false, at, pts: [at], lx: e.clientX, ly: e.clientY }
      if (latest.current.tool === 'pencil') setTrace([at])
    }
    const move = (e: PointerEvent) => {
      if (!gesture || e.pointerId !== gesture.id) return
      e.preventDefault()
      const p = local(e)
      if (!gesture.moved && Math.hypot(p.x - gesture.x, p.y - gesture.y) > 6) gesture.moved = true
      /* ⚠️ Le modèle ENREGISTRÉ, jamais l'aperçu (`live`) : sinon chaque mouvement ajouterait un nœud de plus. */
      const m = sessionRef.current?.h.present ?? null
      if (latest.current.tool === 'pen') {
        if (gesture.moved && m && !m.closed) setLive(appendNode(m, snapped(gesture.at), unproject(p.x, p.y)))
        return
      }
      if (Math.hypot(e.clientX - gesture.lx, e.clientY - gesture.ly) < 2) return
      gesture.lx = e.clientX
      gesture.ly = e.clientY
      gesture.pts.push(unproject(p.x, p.y))
      setTrace([...gesture.pts])
    }
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (!gesture || e.pointerId !== gesture.id) return
      e.preventDefault()
      const g = gesture
      gesture = null
      try {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* rien */
      }
      const m = sessionRef.current?.h.present ?? null
      if (!m) return
      if (latest.current.tool === 'pen') {
        setLive(null)
        if (g.moved) {
          /* Un point posé à la plume n'est pas sélectionné : Échap sort du tracé (le brouillon reste), comme avant. */
          if (!m.closed) commit(appendNode(m, snapped(g.at), unproject(local(e).x, local(e).y)), null)
          return
        }
        penTap(m, g.at, g.x, g.y)
        return
      }
      setTrace(null)
      finishStroke(m, g.pts)
    }
    const cancel = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      cancelGesture()
    }
    const keyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !spacePan && !isTyping(e)) {
        spacePan = true
        map.dragPan.enable()
        canvas.style.cursor = 'grab'
        e.preventDefault()
      }
    }
    const keyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && spacePan) {
        spacePan = false
        map.dragPan.disable()
        canvas.style.cursor = 'crosshair'
      }
    }
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    return () => {
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      canvas.style.touchAction = prevTouch
      canvas.style.cursor = prevCursor
      if (panWas) map.dragPan.enable()
      else map.dragPan.disable()
      if (rotateWas) map.dragRotate.enable()
      setLive(null)
      setTrace(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, session !== null, tool])

  /** Un toucher de la plume (sans glisser). */
  const penTap = (m: PathModel, at: LatLng, x: number, y: number) => {
    if (!m.closed) {
      const first = m.nodes[0]
      if (first && m.nodes.length >= 3) {
        const f = project(first)
        if (Math.hypot(f.x - x, f.y - y) <= HIT) {
          closeNow()
          return
        }
      }
      commit(appendNode(m, snapped(at)), null)
      return
    }
    /* Forme fermée : toucher le contour ajoute un nœud là. */
    const near = nearestOnPath(m, at)
    if (near) {
      const q = project(near.point)
      if (Math.hypot(q.x - x, q.y - y) <= HIT) {
        const r = insertNode(m, near.seg, near.t)
        commit(r.model, r.index)
        return
      }
    }
    setNotice(t('editor.penOnClosed'))
  }

  /** La fin d'un trait de main levée. */
  const finishStroke = (m: PathModel, pts: LatLng[]) => {
    if (!map || pts.length < 3) return
    const zoom = map.getZoom()
    const tol = simplifyToleranceM(zoom, pts[0].lat)
    if (m.nodes.length === 0) {
      const closed = tracedRingIsClosed(pts, tol)
      const nodes = fitStroke(pts, tol, closed)
      commit({ v: 1, closed: closed && nodes.length >= 3, nodes }, null)
      return
    }
    if (!m.closed) {
      let ext = extendWithStroke(m, pts, tol)
      const f = project(ext.nodes[0])
      const l = project(pts[pts.length - 1])
      if (ext.nodes.length >= 4 && Math.hypot(f.x - l.x, f.y - l.y) <= HIT) {
        ext = { ...ext, nodes: ext.nodes.slice(0, -1) }
        const c = closePath(ext)
        if (c) ext = c
      }
      commit(ext, null)
      return
    }
    const metresPerPx = (78_271.51696 * Math.cos((pts[0].lat * Math.PI) / 180)) / Math.pow(2, zoom)
    const r = redrawSection(m, pts, tol, HIT * 1.5 * metresPerPx)
    if (r) commit(r, null)
    else setNotice(t('editor.strokeMissed'))
  }

  // -------------------------------------------------------------------------
  // Toucher la carte (outil « בחירה ») : choisir une forme, même empilée
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const s = sessionRef.current
      if (s?.mode === 'new' || latest.current.tool !== 'select') return
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng }
      const cur = latest.current
      const all = cur.props.shapes
      const ringFor = (sh: EditorShape): Array<[number, number]> =>
        s?.mode === 'edit' && s.id === sh.id && cur.model ? densify(cur.model).map((q) => [q.lng, q.lat] as [number, number]) : ringOfShape(sh)
      const hits = all
        .filter((sh) => pointInRing(p, ringFor(sh)))
        .map((sh) => ({ id: sh.id, area: ringAreaDunams(ringFor(sh).map(([lng, lat]) => ({ lat, lng }))) }))
        .sort((a, b) => a.area - b.area)
      setPicker(null)
      if (hits.length === 0) {
        setSelected(null)
        return
      }
      const active = s?.mode === 'edit' ? s.id : null
      if (active && hits[0].id === active) return
      if (hits.length === 1) {
        cur.props.onActiveChange(hits[0].id)
        return
      }
      setPicker({ x: e.point.x, y: e.point.y, ids: hits.map((h) => h.id) })
    }
    map.on('click', onClick)
    return () => {
      map.off('click', onClick)
    }
  }, [map])

  // -------------------------------------------------------------------------
  // Le clavier
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!session) return
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        redo()
        return
      }
      if (mod || e.altKey) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (latest.current.selected !== null) {
          e.preventDefault()
          deleteSelected()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        if (picker) setPicker(null)
        else if (latest.current.selected !== null) setSelected(null)
        else finish()
        return
      }
      if (e.key === 'Enter') {
        if (latest.current.model && !latest.current.model.closed) {
          e.preventDefault()
          closeNow()
        }
        return
      }
      const k = e.key.toLowerCase()
      if (k === 'v') setTool('select')
      else if (k === 'p') setTool('pen')
      else if (k === 'n') setTool('pencil')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session !== null, picker])

  // -------------------------------------------------------------------------
  // Glisser un nœud, une poignée, un « + », la forme
  // -------------------------------------------------------------------------
  const drag = useRef<Drag | null>(null)
  const lastTap = useRef<{ index: number; at: number } | null>(null)

  const startDrag = (e: React.PointerEvent, d: Drag) => {
    e.stopPropagation()
    e.preventDefault()
    try {
      ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    } catch {
      /* commodité */
    }
    loadRoads()
    drag.current = d
  }

  /**
   * Le modèle sous le doigt à la position (x, y). ⚠️ Calculé depuis l'ÉVÉNEMENT,
   * jamais depuis le dernier aperçu rendu : des touchers rapides arrivent plus
   * vite que React ne dessine, et le point lâché retardait de plusieurs
   * mouvements (31 m, attrapé par `bkeditui` A553 au doigt).
   */
  const dragModel = (d: Drag, x: number, y: number): PathModel | null => {
    const base = sessionRef.current?.h.present
    if (!base) return null
    const at = unproject(x, y)
    if (d.type === 'node') return moveNode(base, d.index, snapped(at))
    if (d.type === 'handle') return moveHandle(base, d.index, d.which, at)
    if (d.type === 'move') return translatePath(base, at.lat - d.from.lat, at.lng - d.from.lng)
    const r = insertNode(base, d.seg, 0.5)
    d.inserted = r.index
    return moveNode(r.model, r.index, snapped(at))
  }

  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    e.preventDefault()
    const p = local(e)
    if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) > 4) d.moved = true
    if (!d.moved) return
    const next = dragModel(d, p.x, p.y)
    if (next) setLive(next)
  }

  const onDragEnd = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    e.stopPropagation()
    const base = sessionRef.current?.h.present
    if (!base) return
    if (d.moved) {
      const p = local(e)
      const m = dragModel(d, p.x, p.y) ?? latest.current.model
      if (!m) return
      const keep = d.type === 'node' || d.type === 'handle' ? d.index : d.type === 'mid' ? d.inserted : latest.current.selected
      commit(m, keep)
      return
    }
    setLive(null)
    /* Un TOUCHER, pas un glissé. */
    if (d.type === 'node') {
      const tool = latest.current.tool
      if (tool === 'pen' && !base.closed && d.index === 0 && base.nodes.length >= 3) {
        closeNow()
        return
      }
      const now = Date.now()
      const prev = lastTap.current
      lastTap.current = { index: d.index, at: now }
      if (prev && prev.index === d.index && now - prev.at < DOUBLE_TAP_MS) {
        lastTap.current = null
        commit(toggleNodeKind(base, d.index), d.index)
        return
      }
      setSelected(d.index)
      setNotice(null)
      return
    }
    if (d.type === 'mid') {
      const r = insertNode(base, d.seg, 0.5)
      commit(r.model, r.index)
    }
  }

  // -------------------------------------------------------------------------
  // Le dessin
  // -------------------------------------------------------------------------
  const kindOf = session?.mode === 'new' ? kinds.find((k) => k.kind === session.kind) : null
  const color = session?.mode === 'edit' ? (activeShape?.color ?? '#2563eb') : (kindOf?.color ?? '#2563eb')
  const ring = model ? densify(model) : []
  const screen = ring.map(project)
  const d = screen.length ? `M${screen.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}${model?.closed ? 'Z' : ''}` : ''
  const nodes = model ? model.nodes.map(project) : []
  const sel = selected !== null && model && selected < model.nodes.length ? selected : null
  const showHandlesFor = new Set<number>()
  if (model && sel !== null) {
    const n = model.nodes.length
    showHandlesFor.add(sel)
    if (model.closed || sel > 0) showHandlesFor.add((sel - 1 + n) % n)
    if (model.closed || sel < n - 1) showHandlesFor.add((sel + 1) % n)
  }
  const mids =
    model && tool !== 'pencil'
      ? Array.from({ length: segmentCount(model) }, (_, s) => {
          const c = segmentControls(model, s)
          const a = project(c[0])
          const b = project(c[3])
          const m = project(bezierAt(c, 0.5))
          return { s, x: m.x, y: m.y, long: Math.hypot(a.x - b.x, a.y - b.y) > 64 }
        }).filter((x) => x.long)
      : []
  const centre = nodes.length ? { x: nodes.reduce((s, p) => s + p.x, 0) / nodes.length, y: nodes.reduce((s, p) => s + p.y, 0) / nodes.length } : null
  const traceD = trace && trace.length > 1 ? `M${trace.map(project).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}` : ''

  /**
   * ⛔ UNE ANNULATION N'EST PAS UN LÂCHER. Le navigateur annule un geste
   *    (`pointercancel`) quand il le reprend pour lui : ses coordonnées sont
   *    alors (0, 0). Traitée comme un lâcher, elle posait le point AU COIN de la
   *    carte (vu en sonde, BK). Annulé = rien d'écrit, la forme d'avant.
   */
  const onDragCancel = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    setLive(null)
  }
  const handlers = { onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragCancel }
  /**
   * ⚠️ EN MAIN LEVÉE, LES POINTS LAISSENT PASSER LE TRAIT. Reprendre un tracé
   *    ou redessiner une portion, c'est COMMENCER le trait sur un point : capté
   *    par le point, le trait le déplaçait au lieu de dessiner (attrapé par
   *    `bkeditui` A560 / A561, à la souris).
   */
  const grab = { pointerEvents: tool === 'pencil' ? ('none' as const) : ('all' as const), touchAction: 'none' as const, cursor: 'grab' }

  const overlay =
    host && map
      ? createPortal(
          <>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', touchAction: 'none' }} aria-hidden={!session}>
              {model && d && (
                /* Une forme enregistrée a déjà son remplissage sur la carte : ici, le CONTOUR en direct. */
                <path d={d} fill={model.closed && session?.mode === 'new' ? color : 'none'} fillOpacity={0.18} stroke={color} strokeWidth={3.5} strokeLinejoin="round" data-testid="editor-shape" data-ring={ring.length} />
              )}
              {traceD && <path d={traceD} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" data-testid="editor-trace" />}
              {/* Les « + » au milieu des segments : creux, petits, jamais confondus avec un nœud. */}
              {session &&
                mids.map((m) => (
                  <g key={`m${m.s}`} data-grip="" data-testid={`editor-mid-${m.s}`} transform={`translate(${m.x},${m.y})`} style={grab} onPointerDown={(e) => startDrag(e, { type: 'mid', seg: m.s, pointerId: e.pointerId, x0: local(e).x, y0: local(e).y, moved: false, inserted: null })} {...handlers}>
                    <circle r={18} fill="transparent" />
                    <circle r={7} fill="rgba(255,255,255,0.85)" stroke={color} strokeWidth={1.5} strokeDasharray="2 2" />
                    <path d="M-3.5,0H3.5M0,-3.5V3.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
                  </g>
                ))}
              {/* Les poignées des nœuds arrondis autour du nœud sélectionné. */}
              {session &&
                model &&
                [...showHandlesFor].flatMap((i) => {
                  const n = model.nodes[i]
                  const at = nodes[i]
                  return (['in', 'out'] as const)
                    .filter((w) => (w === 'in' ? n.hIn : n.hOut))
                    .map((w) => {
                      const off = (w === 'in' ? n.hIn : n.hOut) as LatLng
                      const h = project({ lat: n.lat + off.lat, lng: n.lng + off.lng })
                      return (
                        <g key={`h${i}${w}`} data-testid={`editor-handle-${i}-${w}`}>
                          <line x1={at.x} y1={at.y} x2={h.x} y2={h.y} stroke={color} strokeWidth={1.5} />
                          <g data-grip="" transform={`translate(${h.x},${h.y})`} style={grab} onPointerDown={(e) => startDrag(e, { type: 'handle', index: i, which: w, pointerId: e.pointerId, x0: local(e).x, y0: local(e).y, moved: false })} {...handlers}>
                            <circle r={HIT} fill="transparent" />
                            <circle r={6} fill={color} stroke="#fff" strokeWidth={2} />
                          </g>
                        </g>
                      )
                    })
                })}
              {/* Les nœuds : un CARRÉ pour un coin, un ROND pour un arrondi ; plein quand il est sélectionné. */}
              {session &&
                model &&
                model.nodes.map((n, i) => {
                  const p = nodes[i]
                  const on = sel === i
                  /* ★★ BH — un point visible de 16 px au moins, lisible sur une photo satellite claire. */
                  const r = on ? 10 : 8
                  const first = i === 0 && !model.closed && model.nodes.length >= 3 && tool === 'pen'
                  return (
                    <g
                      key={`n${i}`}
                      data-grip=""
                      data-testid={`editor-node-${i}`}
                      data-kind={n.kind}
                      data-selected={on ? '1' : '0'}
                      transform={`translate(${p.x},${p.y})`}
                      style={grab}
                      onPointerDown={(e) => startDrag(e, { type: 'node', index: i, pointerId: e.pointerId, x0: local(e).x, y0: local(e).y, moved: false })}
                      {...handlers}
                    >
                      <circle r={HIT} fill="transparent" />
                      {first && <circle r={14} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" />}
                      {n.kind === 'smooth' ? (
                        <circle r={r} fill={on ? color : '#fff'} stroke={on ? '#fff' : color} strokeWidth={2.5} />
                      ) : (
                        <rect x={-r} y={-r} width={2 * r} height={2 * r} rx={1.5} fill={on ? color : '#fff'} stroke={on ? '#fff' : color} strokeWidth={2.5} />
                      )}
                    </g>
                  )
                })}
              {/* ✥ — déplacer la forme entière. */}
              {session && model?.closed && centre && tool === 'select' && (
                <g
                  data-grip=""
                  data-testid="editor-move"
                  transform={`translate(${centre.x},${centre.y})`}
                  style={{ ...grab, cursor: 'move' }}
                  onPointerDown={(e) => {
                    const p = local(e)
                    startDrag(e, { type: 'move', pointerId: e.pointerId, x0: p.x, y0: p.y, moved: false, from: unproject(p.x, p.y) })
                  }}
                  {...handlers}
                >
                  <circle r={HIT} fill="rgba(255,255,255,0.9)" stroke={color} strokeWidth={2} />
                  <path d="M0,-11V11M-11,0H11M0,-11l-3.5,3.5M0,-11l3.5,3.5M0,11l-3.5,-3.5M0,11l3.5,-3.5M-11,0l3.5,-3.5M-11,0l3.5,3.5M11,0l-3.5,-3.5M11,0l-3.5,3.5" stroke={color} strokeWidth={2} strokeLinecap="round" fill="none" />
                </g>
              )}
            </svg>
            {picker && (
              <div
                data-testid="shape-picker"
                role="dialog"
                aria-label={t('editor.pickTitle')}
                dir="rtl"
                className="glass absolute z-20 flex w-64 flex-col gap-1 rounded-card p-2 shadow-lift"
                style={{ left: Math.max(8, Math.min(picker.x - 128, (map.getContainer().clientWidth || 300) - 264)), top: Math.max(8, picker.y + 12), pointerEvents: 'auto' }}
              >
                <p className="px-1 text-micro font-semibold text-content-secondary">{t('editor.pickTitle')}</p>
                {picker.ids.map((id) => {
                  const sh = shapeById(id)
                  if (!sh) return null
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`shape-pick-${id}`}
                      className="btn-secondary min-h-11 justify-start gap-2 py-1.5 text-caption"
                      onClick={() => {
                        setPicker(null)
                        onActiveChange(id)
                      }}
                    >
                      <span className="inline-block h-3 w-3 shrink-0 rounded-pill" style={{ backgroundColor: sh.color }} />
                      <span className="min-w-0 flex-1 truncate text-start">{sh.label}</span>
                      <bdi className="numeric text-micro text-content-muted">{t('editor.area', { n: fmt(ringAreaDunams(sh.ring), i18n.language) })}</bdi>
                    </button>
                  )
                })}
              </div>
            )}
          </>,
          host,
        )
      : null

  // -------------------------------------------------------------------------
  // Le panneau
  // -------------------------------------------------------------------------
  const shapeLabel = session?.mode === 'edit' ? (activeShape?.label ?? '') : session?.mode === 'new' ? t('editor.newShape', { kind: kindOf?.label ?? '' }) : ''
  const area = model?.closed ? pathAreaDunams(model) : 0
  const others = useMemo(() => shapes, [shapes])

  /**
   * ★ LE PANNEAU EST COURT, PARCE QUE LA CARTE D'UNE FICHE L'EST. Sur l'iPad en
   *   portrait, la carte d'une fiche fait 45 % de l'écran : un panneau de trois
   *   cents pixels cachait la forme qu'il éditait (mesuré, première capture).
   *   Une ligne dit QUOI (l'entité, la forme, ses points, sa surface) ; une
   *   ligne porte les outils, annuler / refaire et le point sélectionné ; les
   *   actions sur la forme entière (rares, et deux sont destructrices) sont
   *   derrière « פעולות ». Les formes de l'entité, quand il y en a plusieurs,
   *   ont leur propre ligne : c'est là qu'on passe de l'une à l'autre.
   */
  const [menu, setMenu] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)

  /* ⚠️ L'ouverture d'une forme NE RECADRE PAS la carte : « la caméra appartient au PO » (BF), et
     « entrer en édition ne recadre pas » (BH, `bhui` A489). Le panneau est court pour cette raison. */

  const iconBtn = 'btn-secondary min-h-11 min-w-11 justify-center px-2.5 py-1.5 text-micro'

  const panel = session && model && (
    <div
      ref={panelRef}
      dir="rtl"
      data-testid="shape-editor"
      data-mode={session.mode}
      data-shape={session.mode === 'edit' ? session.id : `new:${session.kind}`}
      data-nodes={model.nodes.length}
      data-closed={model.closed ? '1' : '0'}
      data-area={Math.round(area)}
      data-tool={tool}
      data-selected-node={sel ?? ''}
      data-undo={session.h.past.length}
      data-redo={session.h.future.length}
      className="glass pointer-events-auto flex w-full max-w-[48rem] flex-col gap-1.5 self-start rounded-card px-3 py-2 shadow-glow ring-1 ring-accent"
    >
      {/* 1. Quelle entité, quelle forme, combien de points, quelle surface. */}
      <div className="flex items-center gap-2">
        <span className="inline-block h-3 w-3 shrink-0 rounded-pill" style={{ backgroundColor: color }} />
        <p className="min-w-0 flex-1 truncate text-caption text-content-secondary" data-testid="editor-summary">
          <span className="font-semibold text-content-primary" data-testid="editor-entity">
            {entityLabel}
          </span>
          {' · '}
          <span className="font-semibold text-content-primary" data-testid="editor-shape-label">
            {shapeLabel}
          </span>
          {' · '}
          <bdi className="numeric">{t('editor.points', { count: model.nodes.length })}</bdi>
          {' · '}
          {model.closed ? <bdi className="numeric">{t('editor.area', { n: fmt(area, i18n.language) })}</bdi> : <span>{t('editor.notClosed')}</span>}
        </p>
        <button type="button" data-testid="editor-done" className="btn-primary min-h-11 shrink-0 py-1.5 text-micro" onClick={finish}>
          <Icon name="check" size={13} />
          {t('editor.done')}
        </button>
      </div>

      {/* 2. Les formes de l'entité : on passe de l'une à l'autre sans ambiguïté. */}
      {session.mode === 'edit' && others.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto" data-testid="editor-shapes" data-count={others.length}>
          <span className="shrink-0 text-micro text-content-muted">{t('editor.shapesHere', { count: others.length })}</span>
          {others.map((sh) => (
            <button
              key={sh.id}
              type="button"
              data-testid={`shape-chip-${sh.id}`}
              aria-pressed={sh.id === session.id}
              onClick={() => onActiveChange(sh.id)}
              className={`filter-pill min-h-11 shrink-0 ${sh.id === session.id ? 'filter-pill-active' : ''}`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-pill" style={{ backgroundColor: sh.color }} />
              {sh.label}
              <bdi className="numeric text-content-muted">{t('editor.area', { n: fmt(ringAreaDunams(sh.ring), i18n.language) })}</bdi>
            </button>
          ))}
        </div>
      )}

      {/* 3. Les outils, annuler / refaire, le point sélectionné, les actions sur la forme. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="radiogroup" aria-label={t('editor.toolsLabel')} className="flex items-center gap-0.5 rounded-pill bg-surface-high p-0.5">
          {(['select', 'pen', 'pencil'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={tool === k}
              title={t(`editor.hint.${k}`)}
              data-testid={`editor-tool-${k}`}
              onClick={() => {
                setTool(k)
                setNotice(null)
              }}
              className={`flex min-h-11 items-center gap-1 rounded-pill px-2.5 text-micro font-semibold transition-colors duration-fast ${
                tool === k ? 'bg-accent text-content-on-accent' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              <Icon name={k === 'select' ? 'pointer' : k === 'pen' ? 'penNib' : 'freehand'} size={14} />
              {t(`editor.tool.${k}`)}
            </button>
          ))}
        </div>
        <button type="button" data-testid="editor-undo" title={t('editor.undo')} aria-label={t('editor.undo')} className={iconBtn} disabled={session.h.past.length === 0} onClick={undo}>
          <Icon name="undo" size={15} />
        </button>
        <button type="button" data-testid="editor-redo" title={t('editor.redo')} aria-label={t('editor.redo')} className={iconBtn} disabled={session.h.future.length === 0} onClick={redo}>
          <Icon name="redo" size={15} />
        </button>
        {sel !== null && (
          <span className="flex items-center gap-1.5" data-testid="editor-node-actions">
            <span className="text-micro font-semibold text-content-primary">{t('editor.nodeN', { n: sel + 1 })}</span>
            <button type="button" data-testid="editor-node-kind" className={iconBtn} onClick={toggleSelected}>
              <Icon name={model.nodes[sel].kind === 'smooth' ? 'nodeCorner' : 'nodeSmooth'} size={14} />
              {t(model.nodes[sel].kind === 'smooth' ? 'editor.toCorner' : 'editor.toSmooth')}
            </button>
            <button type="button" data-testid="editor-node-delete" className={`${iconBtn} text-status-danger-ink`} onClick={deleteSelected}>
              <Icon name="trash" size={14} />
              {t('editor.deleteNode')}
            </button>
          </span>
        )}
        {!model.closed && (
          <button type="button" data-testid="editor-close-path" className="btn-primary min-h-11 py-1.5 text-micro" disabled={model.nodes.length < 3} onClick={closeNow}>
            <Icon name="check" size={13} />
            {t('editor.closePath')}
          </button>
        )}
        <div className="relative ms-auto">
          <button type="button" data-testid="editor-menu" aria-expanded={menu} className={iconBtn} onClick={() => setMenu((v) => !v)}>
            <Icon name="more" size={15} />
            {t('editor.actions')}
          </button>
          {menu && (
            <div
              role="menu"
              data-testid="editor-menu-panel"
              className="glass absolute bottom-full end-0 z-20 mb-2 flex w-56 flex-col gap-1 rounded-card p-1.5 shadow-lift"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button')) setMenu(false)
              }}
            >
              <button type="button" role="menuitemcheckbox" aria-checked={snap} data-testid="editor-snap" className={`min-h-11 justify-start py-1.5 text-micro ${snap ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSnap((v) => !v)}>
                <Icon name="route" size={13} />
                {t('editor.snap')}
              </button>
              {session.mode === 'edit' && props.onReplace && (
                <button type="button" role="menuitem" data-testid="editor-replace" className="btn-secondary min-h-11 justify-start py-1.5 text-micro" onClick={() => props.onReplace?.(session.id)}>
                  <Icon name="replace" size={13} />
                  {t('editor.replace')}
                </button>
              )}
              {session.mode === 'edit' && props.onDelete && (
                <button type="button" role="menuitem" data-testid="editor-delete-shape" className="btn-secondary min-h-11 justify-start py-1.5 text-micro text-status-danger-ink" onClick={() => props.onDelete?.(session.id)}>
                  <Icon name="trash" size={13} />
                  {t('editor.deleteShape')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {props.extraActions && <div className="flex flex-wrap items-center gap-1.5">{props.extraActions}</div>}
      {notice && (
        <p role="status" data-testid="editor-notice" className="text-micro font-semibold text-status-warn-ink">
          {notice}
        </p>
      )}
    </div>
  )

  return (
    <>
      {overlay}
      {panel}
    </>
  )
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

function fmt(n: number, lang: string): string {
  return Math.round(n).toLocaleString(lang === 'he' ? 'he-IL' : lang)
}
