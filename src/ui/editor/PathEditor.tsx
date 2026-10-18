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
import type { IconName } from '../components/Icon'
import { SNAP_PX, roadSegments, snapLngLat, snapPoint } from './roadSnap'
import type { RoadSegments } from './roadSnap'
import { ToolButton } from './ToolButton'

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
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BL (2026-10-18) — LA BARRE D'OUTILS REMONTE EN HAUT, AU NIVEAU D'ILLUSTRATOR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Ma map est superposée de plein d'outils, c'est vraiment embêtant pour
 *     retracer ma map. J'aimerais que mes outils se trouvent dans le header. »
 *                                                                   — le PO
 *
 * ★ PLUS RIEN NE FLOTTE SUR LA CARTE PENDANT L'ÉDITION. Ce composant rend UNE
 *   barre, que l'hôte pose EN HAUT, hors de la carte (l'écran des régions :
 *   sous la rangée des régions ; la carte d'une ferme : au-dessus d'elle). Sur
 *   la carte ne restent que les points, les poignées et les « + » — ce qu'on
 *   édite — et la pile de MapLibre (le recentrage y est désormais une icône).
 *   La poignée ✥ qui flottait au centre de la forme est devenue un OUTIL.
 *
 * ★ LES OUTILS SONT CEUX D'ILLUSTRATOR, DESSINÉS EN SVG (`Icon.tsx`) :
 *   · בחירה (V)        — la flèche : toucher un point le sélectionne, le
 *                        glisser le déplace, deux touchers l'arrondissent ;
 *                        le « + » d'un segment y ajoute un point ;
 *   · עט (P)           — la plume : chaque toucher pose un point, un toucher
 *                        tiré un point arrondi, le premier point ferme ;
 *   · הוספת נקודה (+)  — la plume « + » : toucher le contour y ajoute un point ;
 *   · מחיקת נקודה (−)  — la plume « − » : toucher un point le supprime ;
 *   · המרת נקודה (⇧C)  — la conversion : toucher un point le fait passer de
 *                        coin à arrondi (et retour), le tirer en sort les
 *                        poignées ;
 *   · עיפרון (N)       — le crayon : la main levée ;
 *   · הזזת הצורה (M)   — la croix : glisser n'importe où déplace la forme.
 *   L'outil actif est PLEIN (fond d'accent) et nommé dans la ligne du haut.
 *   Chaque outil porte son nom en hébreu en infobulle (survol, appui long).
 *
 * ★ LA FORME D'ORIGINE, DITE. Une forme rouverte garde sous elle, en
 *   POINTILLÉS, la forme telle qu'elle était à l'ouverture (pour un « שרטוט
 *   מחדש », la forme qu'on remplace) — pour comparer. Le PO a mis du temps à
 *   comprendre ce qu'était ce trait : il est maintenant NOMMÉ dans la barre, et
 *   un bouton l'affiche ou le masque.
 *
 * ★ LES ACTIONS DESTRUCTRICES SONT DANS « ⋯ » (שרטוט מחדש, מחיקת הצורה, et
 *   celles de l'hôte, comme « שחזור המקור » des régions) ; annuler / refaire
 *   restent dans la barre.
 *
 * L'hôte (la carte d'une ferme, l'écran des régions) garde la DONNÉE : il dit
 * quelles formes existent, et reçoit chaque geste (`onChange`), chaque forme
 * fermée (`onCreate`), chaque brouillon (`onDraft`), chaque suppression
 * demandée (`onDelete`, qu'il fait CONFIRMER). Chaque geste est écrit (BI).
 *
 * ★ AU DOIGT : les points et les poignées sont des cibles de 44 px, dans une
 *   surcouche SVG posée DANS le conteneur de la carte mais HORS de sa toile —
 *   un doigt posé sur un point ne parvient jamais à MapLibre. Les outils de
 *   la barre font 44 px ; la barre passe à la ligne plutôt que de déborder
 *   (iPad en écran partagé). Avec la plume, le crayon et le déplacement, un
 *   doigt agit et la carte ne glisse plus ; deux doigts pincent toujours, et
 *   la barre d'espace déplace la carte à la souris.
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

export type EditorTool = 'select' | 'pen' | 'penAdd' | 'penRemove' | 'convert' | 'pencil' | 'move'

/** La barre, dans l'ordre d'Illustrator : sélection, plumes, conversion, crayon, déplacement. */
const TOOLS: ReadonlyArray<{ id: EditorTool; icon: IconName; key: string }> = [
  { id: 'select', icon: 'pointer', key: 'V' },
  { id: 'pen', icon: 'pen', key: 'P' },
  { id: 'penAdd', icon: 'penAdd', key: '+' },
  { id: 'penRemove', icon: 'penRemove', key: '−' },
  { id: 'convert', icon: 'anchorConvert', key: '⇧C' },
  { id: 'pencil', icon: 'pencil', key: 'N' },
  { id: 'move', icon: 'moveShape', key: 'M' },
]

/** Les outils qui prennent le doigt sur la toile : la carte ne glisse plus sous eux. */
const CANVAS_TOOLS: ReadonlySet<EditorTool> = new Set(['pen', 'pencil', 'move'])

/** Une demande de l'hôte : commencer une forme (de ce type, avec cet outil), ou reprendre un brouillon. */
export interface StartRequest {
  nonce: number
  kind: string
  tool: 'pen' | 'pencil'
  /** La forme qu'elle remplacera une fois fermée (confirmé par l'hôte AVANT). */
  replaceId?: string
  resume?: { model: PathModel; draftId: string }
}

/** Ce que l'éditeur dit de sa session à l'hôte. */
export interface EditorSessionInfo {
  mode: 'edit' | 'new'
  id: string | null
  replaceId: string | null
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
  /** ★★ BL — la session (pour qu'un « שרטוט מחדש » montre l'ancienne forme en pointillés, pas en aplat). */
  onSessionChange?: (s: EditorSessionInfo | null) => void
  onChange: (id: string, model: PathModel, ring: LatLng[]) => void
  /** Une forme neuve FERMÉE : l'hôte l'écrit et rend son identifiant. */
  onCreate: (kind: string, model: PathModel, ring: LatLng[], replaceId?: string) => string | null
  /** Le brouillon d'une forme neuve non fermée (appareil, BI) ; `null` = plus de brouillon. */
  onDraft?: (kind: string, draftId: string, model: PathModel | null) => void
  /** Demander la suppression d'une forme (l'hôte confirme en la nommant). Absent = pas de suppression. */
  onDelete?: (id: string) => void
  /** « שרטוט מחדש » : l'hôte confirme, puis renvoie un `start` avec `replaceId`. */
  onReplace?: (id: string) => void
  /** Des actions propres à l'hôte, DANS la barre (l'écran des régions : ביטול שינויים, שמירה). */
  extraActions?: ReactNode
  /** ★★ BL — des entrées propres à l'hôte dans le menu « ⋯ » (les régions : שחזור המקור). */
  menuItems?: ReactNode
  /** ★★ BL — la liste des formes de l'entité dans la barre. Faux quand l'hôte les montre déjà (les régions). */
  showShapeList?: boolean
  /** ★★ BL — sans session : la barre reste à sa place, outils éteints, avec cette ligne (les régions). */
  idleHint?: ReactNode
  /** ★★ BL — ce que l'hôte veut dire dans la barre, sous les outils (une confirmation, un avis). */
  notes?: ReactNode
}

type Session =
  | { mode: 'edit'; id: string; h: History<PathModel> }
  | { mode: 'new'; kind: string; draftId: string; replaceId?: string; h: History<PathModel> }

type Drag =
  | { type: 'node'; index: number; tool: EditorTool; pointerId: number; x0: number; y0: number; moved: boolean }
  | { type: 'handle'; index: number; which: 'in' | 'out'; pointerId: number; x0: number; y0: number; moved: boolean }
  | { type: 'mid'; seg: number; pointerId: number; x0: number; y0: number; moved: boolean; inserted: number | null }

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
  /**
   * ★★ BL — L'ACCROCHE SE VOIT. Pendant le geste, la route visée S'ÉCLAIRE et
   * une cible marque le point où le nœud ira ; au lâcher, le nœud SAUTE sur la
   * route, et un cercle qui s'élargit montre le saut (`pulse`).
   */
  const [snapHint, setSnapHint] = useState<{ x: number; y: number; line: Array<[number, number]> } | null>(null)
  const [pulse, setPulse] = useState<{ x: number; y: number; key: number } | null>(null)
  /** ★★ BL — la forme d'origine (pointillés) : montrée par défaut, le PO la masque d'un bouton. */
  const [showGhost, setShowGhost] = useState(true)
  const [picker, setPicker] = useState<{ x: number; y: number; ids: string[] } | null>(null)
  const [, setTick] = useState(0)
  const [host, setHost] = useState<HTMLElement | null>(null)

  const sessionRef = useRef<Session | null>(null)
  /** ★★ BL — la forme telle qu'elle était à l'ouverture de la session (édition). */
  const originRef = useRef<LatLng[] | null>(null)
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
  const shapeById = (id: string | null | undefined) => (id ? (props.shapes.find((s) => s.id === id) ?? null) : null)

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
    const m = modelForRing(shape.ring, shape.path).model
    /* Une forme qu'on vient de FERMER garde l'origine de son tracé : rien (c'est une forme neuve). */
    originRef.current = s?.mode === 'new' ? null : densify(m)
    setSession({ mode: 'edit', id: shape.id, h: historyOf(m) })
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
    if (JSON.stringify(fresh) !== JSON.stringify(s.h.present)) {
      if (originRef.current) originRef.current = densify(fresh)
      setSession({ ...s, h: historyOf(fresh) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRingKey])

  useEffect(() => {
    if (!start) return
    const draftId = start.resume?.draftId ?? newDraftId()
    originRef.current = null
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

  const sessionKey = session ? `${session.mode}:${session.mode === 'edit' ? session.id : `${session.kind}:${session.replaceId ?? ''}`}` : ''
  useEffect(() => {
    const s = sessionRef.current
    props.onSessionChange?.(s ? { mode: s.mode, id: s.mode === 'edit' ? s.id : null, replaceId: s.mode === 'new' ? (s.replaceId ?? null) : null } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey])

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
        /* ⚠️ Les props lues QUAND le délai part, pas `p` : `onCreate` vient de changer l'hôte, et
           l'ancienne fermeture de RegionsEditScreen (où `selected` vaut encore null) rappelait
           `open()`, qui vidait le brouillon — « שרטוט מחדש » perdait sa forme neuve (settings A53). */
        setTimeout(() => latest.current.props.onActiveChange(id), 0)
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

  const removeAt = (i: number) => {
    const m = sessionRef.current?.h.present
    if (!m) return
    const r = removeNode(m, i)
    if (!r.ok) {
      setNotice(t('editor.minNodes'))
      return
    }
    commit(r.model, null)
  }
  const deleteSelected = () => {
    const i = latest.current.selected
    if (i !== null) removeAt(i)
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
    originRef.current = null
    /* ⚠️ Les props d'à présent : l'effet clavier (Échap) garde le `finish` du rendu d'OUVERTURE, et
       l'`onActiveChange` de ce rendu-là croyait la région intacte — la retouche partait sans être
       enregistrée (settings A53). Même lecture pour « סיום » et l'effet `activeExists`. */
    latest.current.props.onActiveChange(null)
  }

  const chooseTool = (k: EditorTool) => {
    setTool(k)
    setNotice(null)
    setPicker(null)
    if (k === 'penAdd' || k === 'penRemove' || k === 'pencil' || k === 'move') setSelected(null)
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
  const snappedAt = snapped
  const loadRoads = () => {
    roadsRef.current = map && latest.current.snap ? roadSegments(map) : null
  }
  /** La route que vise (x, y), à l'écran — pour l'éclairer pendant le geste. */
  const hintAt = (x: number, y: number) => {
    const roads = roadsRef.current
    if (!latest.current.snap || !roads) return null
    const q = snapPoint(roads, x, y, SNAP_PX)
    return q ? { x: q.x, y: q.y, line: roads.lines[q.line] ?? [] } : null
  }
  /** Le saut, montré : un cercle qui s'élargit là où le point a atterri sur la route. */
  const showJump = (from: LatLng, to: LatLng) => {
    if (Math.abs(from.lat - to.lat) < 1e-12 && Math.abs(from.lng - to.lng) < 1e-12) return
    const q = project(to)
    setPulse({ x: q.x, y: q.y, key: Date.now() })
  }
  useEffect(() => {
    if (!pulse) return
    const id = window.setTimeout(() => setPulse(null), 1100)
    return () => window.clearTimeout(id)
  }, [pulse])
  const toggleSnap = () => {
    const on = !latest.current.snap
    setSnap(on)
    setNotice(null)
    /* Rien à quoi s'accrocher dans la vue (une zone pas encore chargée, un zoom trop lointain) : on le DIT. */
    if (on && map && roadSegments(map).segs.length === 0) setNotice(t('editor.snapNoRoads'))
  }

  // -------------------------------------------------------------------------
  // La plume, le crayon, le déplacement : sur la toile de la carte
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map || !session || !CANVAS_TOOLS.has(tool)) return
    const canvas = map.getCanvas()
    const panWas = map.dragPan.isEnabled()
    const rotateWas = map.dragRotate.isEnabled()
    map.dragPan.disable()
    map.dragRotate.disable()
    const prevTouch = canvas.style.touchAction
    const prevCursor = canvas.style.cursor
    const cursor = tool === 'move' ? 'move' : 'crosshair'
    canvas.style.touchAction = 'none'
    canvas.style.cursor = cursor

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
      const k = latest.current.tool
      if (k === 'pen') {
        if (gesture.moved && m && !m.closed) setLive(appendNode(m, snapped(gesture.at), unproject(p.x, p.y)))
        return
      }
      if (k === 'move') {
        if (gesture.moved && m) {
          const at = unproject(p.x, p.y)
          setLive(translatePath(m, at.lat - gesture.at.lat, at.lng - gesture.at.lng))
        }
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
      const k = latest.current.tool
      if (k === 'move') {
        setLive(null)
        if (!g.moved) return
        const at = unproject(local(e).x, local(e).y)
        commit(translatePath(m, at.lat - g.at.lat, at.lng - g.at.lng))
        return
      }
      if (k === 'pen') {
        setLive(null)
        if (g.moved) {
          /* Un point posé à la plume n'est pas sélectionné : Échap sort du tracé (le brouillon reste), comme avant. */
          if (!m.closed) {
            const at = snapped(g.at)
            commit(appendNode(m, at, unproject(local(e).x, local(e).y)), null)
            showJump(g.at, at)
          }
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
        canvas.style.cursor = cursor
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

  /* Les outils de point (plume +, plume −, conversion) : la carte glisse, le curseur dit l'outil. */
  useEffect(() => {
    if (!map || !session || (tool !== 'penAdd' && tool !== 'penRemove' && tool !== 'convert')) return
    const canvas = map.getCanvas()
    const prev = canvas.style.cursor
    canvas.style.cursor = tool === 'penAdd' ? 'copy' : 'pointer'
    return () => {
      canvas.style.cursor = prev
    }
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
      const to = snapped(at)
      commit(appendNode(m, to), null)
      showJump(at, to)
      return
    }
    /* Forme fermée : toucher le contour ajoute un nœud là. */
    if (!insertOnOutline(m, at, x, y)) setNotice(t('editor.penOnClosed'))
  }

  /** Toucher le contour à (x, y) : un point y naît, sélectionné. Faux si le toucher est loin du contour. */
  const insertOnOutline = (m: PathModel, at: LatLng, x: number, y: number): boolean => {
    const near = nearestOnPath(m, at)
    if (!near) return false
    const q = project(near.point)
    if (Math.hypot(q.x - x, q.y - y) > HIT) return false
    const r = insertNode(m, near.seg, near.t)
    commit(r.model, r.index)
    return true
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
  // Toucher la carte : choisir une forme (בחירה), ajouter un point (plume +)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) return
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const s = sessionRef.current
      const cur = latest.current
      const k = cur.tool
      if (s && k === 'penAdd') {
        const m = s.h.present
        if (!insertOnOutline(m, { lat: e.lngLat.lat, lng: e.lngLat.lng }, e.point.x, e.point.y)) setNotice(t('editor.penAddMiss'))
        return
      }
      if (s && k === 'penRemove') {
        setNotice(t('editor.penRemoveMiss'))
        return
      }
      if (s && k === 'convert') {
        setNotice(t('editor.convertMiss'))
        return
      }
      if (s?.mode === 'new' || k !== 'select') return
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      /* Les raccourcis d'Illustrator. */
      if (e.key === '+' || e.key === '=') chooseTool('penAdd')
      else if (e.key === '-') chooseTool('penRemove')
      else if (e.shiftKey && e.key.toLowerCase() === 'c') chooseTool('convert')
      else {
        const k = e.key.toLowerCase()
        if (k === 'v') chooseTool('select')
        else if (k === 'p') chooseTool('pen')
        else if (k === 'n') chooseTool('pencil')
        else if (k === 'm') chooseTool('move')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session !== null, picker])

  // -------------------------------------------------------------------------
  // Glisser un nœud, une poignée, un « + »
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
  const dragModel = (d: Drag, x: number, y: number, final = true): PathModel | null => {
    const base = sessionRef.current?.h.present
    if (!base) return null
    const at = unproject(x, y)
    /* ★★ BL — pendant le geste le point suit le DOIGT (la route visée s'éclaire) ; il saute sur la route au lâcher. */
    const snapped = (q: LatLng) => (final ? snappedAt(q) : q)
    if (d.type === 'node') {
      if (d.tool === 'penRemove') return null
      if (d.tool === 'convert') {
        /* La conversion TIRÉE d'un point : ses poignées sortent, symétriques (Illustrator). */
        const n = base.nodes[d.index]
        const bare = n.kind === 'corner' ? { ...base, nodes: base.nodes.map((q, i) => (i === d.index ? { lat: q.lat, lng: q.lng, kind: 'smooth' as const } : q)) } : base
        return moveHandle(bare, d.index, 'out', at)
      }
      return moveNode(base, d.index, snapped(at))
    }
    if (d.type === 'handle') return moveHandle(base, d.index, d.which, at)
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
    const next = dragModel(d, p.x, p.y, false)
    if (next) setLive(next)
    if (d.type === 'node' || d.type === 'mid') setSnapHint(d.type === 'node' && d.tool === 'convert' ? null : hintAt(p.x, p.y))
  }

  const onDragEnd = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    e.stopPropagation()
    const base = sessionRef.current?.h.present
    if (!base) return
    setSnapHint(null)
    if (d.moved) {
      const p = local(e)
      const m = dragModel(d, p.x, p.y)
      if (!m) {
        setLive(null)
        return
      }
      const keep = d.type === 'node' || d.type === 'handle' ? d.index : d.type === 'mid' ? d.inserted : latest.current.selected
      commit(m, keep)
      if ((d.type === 'node' && d.tool !== 'convert') || d.type === 'mid') {
        const i = d.type === 'node' ? d.index : (d.inserted ?? -1)
        if (i >= 0 && m.nodes[i]) showJump(unproject(p.x, p.y), m.nodes[i])
      }
      return
    }
    setLive(null)
    /* Un TOUCHER, pas un glissé. */
    if (d.type === 'node') {
      if (d.tool === 'penRemove') {
        removeAt(d.index)
        return
      }
      if (d.tool === 'convert') {
        commit(toggleNodeKind(base, d.index), d.index)
        return
      }
      if (d.tool === 'pen' && !base.closed && d.index === 0 && base.nodes.length >= 3) {
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
  const pathD = (pts: Array<{ x: number; y: number }>, closed: boolean) => (pts.length ? `M${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}${closed ? 'Z' : ''}` : '')
  const d = pathD(screen, !!model?.closed)
  const nodes = model ? model.nodes.map(project) : []
  const sel = selected !== null && model && selected < model.nodes.length ? selected : null
  const showHandlesFor = new Set<number>()
  if (model && sel !== null && (tool === 'select' || tool === 'convert' || tool === 'pen')) {
    const n = model.nodes.length
    showHandlesFor.add(sel)
    if (model.closed || sel > 0) showHandlesFor.add((sel - 1 + n) % n)
    if (model.closed || sel < n - 1) showHandlesFor.add((sel + 1) % n)
  }
  const mids =
    model && (tool === 'select' || tool === 'penAdd')
      ? Array.from({ length: segmentCount(model) }, (_, s) => {
          const c = segmentControls(model, s)
          const a = project(c[0])
          const b = project(c[3])
          const m = project(bezierAt(c, 0.5))
          return { s, x: m.x, y: m.y, long: Math.hypot(a.x - b.x, a.y - b.y) > 64 }
        }).filter((x) => x.long)
      : []
  const traceD = trace && trace.length > 1 ? pathD(trace.map(project), false) : ''

  /* ★★ BL — la forme d'origine : à l'ouverture (édition), ou celle qu'on remplace (שרטוט מחדש). */
  const ghostRing: LatLng[] | null = session ? (session.mode === 'edit' ? originRef.current : (shapeById(session.replaceId)?.ring ?? null)) : null
  const ghostDiffers = !!ghostRing && (ghostRing.length !== ring.length || ghostRing.some((p, i) => Math.abs(p.lat - ring[i].lat) > 1e-12 || Math.abs(p.lng - ring[i].lng) > 1e-12))
  const ghostD = ghostRing && showGhost ? pathD(ghostRing.map(project), true) : ''

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
    setSnapHint(null)
  }
  const handlers = { onPointerMove: onDragMove, onPointerUp: onDragEnd, onPointerCancel: onDragCancel }
  /**
   * ⚠️ EN MAIN LEVÉE, LES POINTS LAISSENT PASSER LE TRAIT. Reprendre un tracé
   *    ou redessiner une portion, c'est COMMENCER le trait sur un point : capté
   *    par le point, le trait le déplaçait au lieu de dessiner (attrapé par
   *    `bkeditui` A560 / A561, à la souris). ★★ BL — de même pour la
   *    croix de déplacement (on saisit la forme n'importe où, même sur un
   *    point) et la plume « + » (on touche le contour, même près d'un point).
   */
  const nodesGrab = tool !== 'pencil' && tool !== 'move' && tool !== 'penAdd'
  const grab = (on: boolean, cursor = 'grab') => ({ pointerEvents: on ? ('all' as const) : ('none' as const), touchAction: 'none' as const, cursor })
  const nodeCursor = tool === 'penRemove' ? 'pointer' : tool === 'convert' ? 'crosshair' : 'grab'

  const overlay =
    host && map
      ? createPortal(
          <>
            <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none', touchAction: 'none' }} aria-hidden={!session}>
              {ghostD && (
                /* La forme d'origine : un pointillé sombre sur un liseré clair, lisible sur une photo comme sur le plan. */
                <g data-testid="editor-ghost" data-ring={ghostRing?.length ?? 0}>
                  <path d={ghostD} fill="none" stroke="#fff" strokeOpacity={0.85} strokeWidth={4} strokeLinejoin="round" />
                  <path d={ghostD} fill="none" stroke="#1f2937" strokeWidth={2} strokeDasharray="7 5" strokeLinejoin="round" />
                </g>
              )}
              {snapHint && snapHint.line.length > 1 && (
                /* ★★ BL — la route visée, ÉCLAIRÉE, et la cible où le point va sauter. */
                <g data-testid="editor-snap-road" data-x={snapHint.x.toFixed(2)} data-y={snapHint.y.toFixed(2)}>
                  <path d={pathD(snapHint.line.map(([x, y]) => ({ x, y })), false)} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
                  <path d={pathD(snapHint.line.map(([x, y]) => ({ x, y })), false)} fill="none" stroke="#f59e0b" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
                  <g data-testid="editor-snap-target" transform={`translate(${snapHint.x},${snapHint.y})`}>
                    <circle r={13} fill="none" stroke="#fff" strokeWidth={4} />
                    <circle r={13} fill="none" stroke="#b45309" strokeWidth={2} strokeDasharray="4 3" />
                    <circle r={3.5} fill="#b45309" />
                  </g>
                </g>
              )}
              {pulse && (
                <g key={pulse.key} data-testid="editor-snap-pulse" transform={`translate(${pulse.x},${pulse.y})`}>
                  <circle r={10} fill="none" stroke="#f59e0b" strokeWidth={3}>
                    <animate attributeName="r" from="8" to="34" dur="0.7s" fill="freeze" />
                    <animate attributeName="opacity" from="1" to="0" dur="0.9s" fill="freeze" />
                  </circle>
                </g>
              )}
              {model && d && (
                /* Une forme enregistrée a déjà son remplissage sur la carte : ici, le CONTOUR en direct. */
                <path d={d} fill={model.closed && session?.mode === 'new' ? color : 'none'} fillOpacity={0.18} stroke={color} strokeWidth={3.5} strokeLinejoin="round" data-testid="editor-shape" data-ring={ring.length} />
              )}
              {traceD && <path d={traceD} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" data-testid="editor-trace" />}
              {/* Les « + » au milieu des segments : creux, petits, jamais confondus avec un nœud. */}
              {session &&
                mids.map((m) => (
                  <g key={`m${m.s}`} data-grip="" data-testid={`editor-mid-${m.s}`} transform={`translate(${m.x},${m.y})`} style={grab(true)} onPointerDown={(e) => startDrag(e, { type: 'mid', seg: m.s, pointerId: e.pointerId, x0: local(e).x, y0: local(e).y, moved: false, inserted: null })} {...handlers}>
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
                          <g data-grip="" transform={`translate(${h.x},${h.y})`} style={grab(true)} onPointerDown={(e) => startDrag(e, { type: 'handle', index: i, which: w, pointerId: e.pointerId, x0: local(e).x, y0: local(e).y, moved: false })} {...handlers}>
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
                      style={grab(nodesGrab, nodeCursor)}
                      onPointerDown={(e) => startDrag(e, { type: 'node', index: i, tool, pointerId: e.pointerId, x0: local(e).x, y0: local(e).y, moved: false })}
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
  // La barre
  // -------------------------------------------------------------------------
  const shapeLabel = session?.mode === 'edit' ? (activeShape?.label ?? '') : session?.mode === 'new' ? t('editor.newShape', { kind: kindOf?.label ?? '' }) : ''
  const area = model?.closed ? pathAreaDunams(model) : 0
  const others = useMemo(() => shapes, [shapes])
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!menu) return
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [menu])

  /* ⚠️ L'ouverture d'une forme NE RECADRE PAS la carte : « la caméra appartient au PO » (BF), et
     « entrer en édition ne recadre pas » (BH, `bhui` A489). */

  /**
   * ★★ BL — LA BARRE EST AU-DESSUS DE LA CARTE, DONC SA HAUTEUR EST CELLE QUE LA
   *   CARTE PERD. Quand elle paraît (une forme ouverte), grandit (une
   *   confirmation) ou s'en va, la carte change de hauteur par le HAUT, et
   *   MapLibre garde son centre : tout ce qu'elle montre glissait de la moitié
   *   de la différence — sous le doigt du PO (11 px mesurés par `blui` A578,
   *   quand la ligne du point sélectionné paraissait). La barre réserve donc la
   *   place de ce qui va et vient (le point sélectionné, la ligne d'avis), et ce
   *   qui reste est COMPENSÉ ici : la carte est décalée d'autant, rien ne bouge
   *   à l'écran. Les deux hôtes posent la barre juste au-dessus d'une carte dont
   *   le bas est fixe.
   */
  const barRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = barRef.current
    if (!el || !map || typeof ResizeObserver === 'undefined') return
    let h = el.getBoundingClientRect().height
    const ro = new ResizeObserver(() => {
      const next = el.getBoundingClientRect().height
      const d = next - h
      h = next
      if (Math.abs(d) >= 0.5) map.panBy([0, d / 2], { animate: false })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [map])

  const toolLabel = (k: EditorTool) => t(`editor.tool.${k}`)
  const sep = <span aria-hidden className="mx-0.5 h-7 w-px shrink-0 bg-edge-subtle" />

  const toolRow = (on: boolean) => (
    <div className="flex flex-wrap items-center gap-1" data-testid="editor-toolbar-row">
      {/* 1. Les outils — un groupe radio, l'actif est PLEIN. */}
      <div role="radiogroup" aria-label={t('editor.toolsLabel')} data-testid="editor-tools" className="flex flex-wrap items-center gap-0.5 rounded-card bg-surface-high p-0.5">
        {TOOLS.map((k) => (
          <ToolButton key={k.id} testId={`editor-tool-${k.id}`} kind="radio" icon={k.icon} label={toolLabel(k.id)} shortcut={k.key} active={on && tool === k.id} disabled={!on} onClick={() => chooseTool(k.id)} />
        ))}
      </div>
      {sep}
      {/* 2. Annuler / refaire. */}
      <div className="flex items-center gap-0.5">
        <ToolButton testId="editor-undo" icon="undo" label={t('editor.undo')} shortcut="⌘Z" disabled={!on || !session || session.h.past.length === 0} onClick={undo} />
        <ToolButton testId="editor-redo" icon="redo" label={t('editor.redo')} shortcut="⇧⌘Z" disabled={!on || !session || session.h.future.length === 0} onClick={redo} />
      </div>
      {sep}
      {/* 3. Ce qui change la vue ou l'accroche : l'aimant, la forme d'origine. */}
      <div className="flex items-center gap-0.5">
        <ToolButton testId="editor-snap" kind="toggle" icon="magnet" label={t('editor.snap')} active={on && snap} disabled={!on} onClick={toggleSnap} />
        <ToolButton testId="editor-ghost-toggle" kind="toggle" icon="ghostShape" label={t(showGhost ? 'editor.ghostHide' : 'editor.ghostShow')} active={on && showGhost && !!ghostRing} disabled={!on || !ghostRing} onClick={() => setShowGhost((v) => !v)} />
      </div>
      {/* 4. Le point sélectionné. ★ Sa place est TOUJOURS réservée (éteinte sans point) : la barre ne
             change pas de hauteur quand on touche un point, donc la carte ne bouge pas sous le doigt. */}
      {sep}
      {/* ⚠️ Sans point sélectionné, les mêmes boutons, ÉTEINTS, sous un autre nom : `editor-node-*` reste le
             nom des points de la carte (et des actions d'un point sélectionné), comme en BK. */}
      {on && model && sel !== null ? (
        <span className="flex items-center gap-0.5" data-testid="editor-node-actions">
          <span className="min-w-[4.5rem] px-1 text-micro font-semibold text-content-primary">{t('editor.nodeN', { n: sel + 1 })}</span>
          <ToolButton testId="editor-node-kind" icon={model.nodes[sel].kind === 'smooth' ? 'nodeCorner' : 'nodeSmooth'} label={t(model.nodes[sel].kind === 'smooth' ? 'editor.toCorner' : 'editor.toSmooth')} onClick={toggleSelected} />
          <ToolButton testId="editor-node-delete" icon="trash" danger label={t('editor.deleteNode')} shortcut="⌫" onClick={deleteSelected} />
        </span>
      ) : (
        <span className="flex items-center gap-0.5" data-testid="editor-point-slot">
          <span className="min-w-[4.5rem] px-1 text-micro font-semibold text-content-muted">{t('editor.noNode')}</span>
          <ToolButton testId="editor-point-kind-off" icon="nodeSmooth" label={t('editor.toSmooth')} disabled onClick={() => undefined} />
          <ToolButton testId="editor-point-delete-off" icon="trash" danger label={t('editor.deleteNode')} disabled onClick={() => undefined} />
        </span>
      )}
      {on && model && !model.closed && (
        <button type="button" data-testid="editor-close-path" className="btn-primary min-h-11 py-1.5 text-micro" disabled={model.nodes.length < 3} onClick={closeNow}>
          <Icon name="check" size={13} />
          {t('editor.closePath')}
        </button>
      )}
      {props.extraActions && <div className="flex flex-wrap items-center gap-1.5">{props.extraActions}</div>}
      {/* 5. Le menu « ⋯ » : ce qui détruit, loin des outils. */}
      {on && (
      <div ref={menuRef} className="relative ms-auto">
        <ToolButton testId="editor-menu" icon="more" label={t('editor.actions')} active={menu} kind="toggle" onClick={() => setMenu((v) => !v)} />
        {menu && (
          <div
            role="menu"
            data-testid="editor-menu-panel"
            className="glass absolute end-0 top-full z-30 mt-2 flex w-64 flex-col gap-1 rounded-card p-1.5 shadow-lift"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('button')) setMenu(false)
            }}
          >
            {session?.mode === 'edit' && props.onReplace && (
              <button type="button" role="menuitem" data-testid="editor-replace" className="btn-secondary min-h-11 justify-start py-1.5 text-micro" onClick={() => props.onReplace?.(session.id)}>
                <Icon name="replace" size={13} />
                {t('editor.replace')}
              </button>
            )}
            {props.menuItems}
            {session?.mode === 'edit' && props.onDelete && (
              <button type="button" role="menuitem" data-testid="editor-delete-shape" className="btn-secondary min-h-11 justify-start py-1.5 text-micro text-status-danger-ink" onClick={() => props.onDelete?.(session.id)}>
                <Icon name="trash" size={13} />
                {t('editor.deleteShape')}
              </button>
            )}
          </div>
        )}
      </div>
      )}
    </div>
  )

  const shell = 'pointer-events-auto flex w-full flex-col gap-1.5 rounded-card border border-edge-subtle bg-surface-overlay px-2.5 py-2 shadow-card'

  const panel = session && model && (
    <div
      dir="rtl"
      data-testid="shape-editor"
      data-mode={session.mode}
      data-shape={session.mode === 'edit' ? session.id : `new:${session.kind}`}
      data-nodes={model.nodes.length}
      data-closed={model.closed ? '1' : '0'}
      data-area={Math.round(area)}
      data-tool={tool}
      data-snap={snap ? '1' : '0'}
      data-ghost={ghostD ? '1' : '0'}
      data-selected-node={sel ?? ''}
      data-undo={session.h.past.length}
      data-redo={session.h.future.length}
      className={shell}
    >
      {/* 1. Quelle entité, quelle forme, combien de points, quelle surface — et l'outil en main. */}
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
        <span data-testid="editor-active-tool" data-tool={tool} className="hidden shrink-0 items-center gap-1 rounded-pill bg-surface-high px-2.5 py-1 text-micro font-semibold text-accent-ink ring-1 ring-accent sm:flex">
          <Icon name={TOOLS.find((k) => k.id === tool)?.icon ?? 'pointer'} size={14} />
          {toolLabel(tool)}
        </span>
        <button type="button" data-testid="editor-done" className="btn-primary min-h-11 shrink-0 py-1.5 text-micro" onClick={finish}>
          <Icon name="check" size={13} />
          {t('editor.done')}
        </button>
      </div>

      {/* 2. La barre d'outils. */}
      {toolRow(true)}

      {/* 3. Les formes de l'entité, quand l'hôte ne les montre pas déjà. */}
      {session.mode === 'edit' && props.showShapeList !== false && others.length > 1 && (
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

      {/* 4. Ce qui est dit — UNE ligne, toujours là (sa hauteur ne bouge pas) : un avis s'il y en a un,
             sinon la forme d'origine nommée. Puis ce que l'hôte ajoute. */}
      <div className="flex min-h-5 items-center gap-2 text-micro" data-testid="editor-message-line">
        {snap && !notice && (
          /* ★★ BL — l'accroche est DITE tant qu'elle est active : une accroche silencieuse est une accroche cassée. */
          <span data-testid="editor-snap-status" className="flex shrink-0 items-center gap-1 rounded-pill bg-surface-high px-2 py-0.5 font-semibold text-accent-ink ring-1 ring-accent">
            <Icon name="magnet" size={13} />
            {t('editor.snapOn')}
          </span>
        )}
        {notice ? (
          <p role="status" data-testid="editor-notice" className="min-w-0 truncate font-semibold text-status-warn-ink">
            {notice}
          </p>
        ) : ghostD && ghostDiffers ? (
          <p data-testid="editor-ghost-note" className="flex min-w-0 items-center gap-1.5 text-content-muted">
            <svg width="26" height="8" aria-hidden="true" className="shrink-0">
              <path d="M1 4H25" stroke="currentColor" strokeWidth={2} strokeDasharray="5 3" />
            </svg>
            <span className="truncate">{t(session.mode === 'new' ? 'editor.ghostNoteReplace' : 'editor.ghostNote')}</span>
          </p>
        ) : null}
      </div>
      {props.notes}
    </div>
  )

  /* ★★ BL — sans session, la barre reste à sa place (l'écran des régions) : rien ne saute sous le doigt. */
  const idle = !session && props.idleHint !== undefined && (
    <div dir="rtl" data-testid="shape-editor-idle" className={shell}>
      <p className="flex min-h-11 items-center text-caption text-content-secondary">{props.idleHint}</p>
      {toolRow(false)}
      {/* La même ligne d'avis que la barre ouverte : la hauteur ne change pas à l'ouverture d'une forme. */}
      <div className="min-h-5" aria-hidden="true" />
      {props.notes}
    </div>
  )

  return (
    <>
      {overlay}
      <div ref={barRef} data-testid="path-editor-bar" className={panel || idle ? 'pb-2' : undefined}>
        {panel || idle}
      </div>
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
