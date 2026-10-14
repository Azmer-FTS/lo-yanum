import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  COVERAGE_PRESETS,
  DEFAULT_RADIUS_KM,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  clampRadiusKm,
  airBoundKm,
  computeCoverage,
  farmPoint,
  linkMinutes,
  getInstitutions,
  getVolunteers,
  getVisibleFarms,
  getVisibleLeads,
  haversineKm,
  isInstitutionEngaged,
  isInstitutionToConfirm,
  coverageOrder,
  coverageSelect,
  linksOfSelection,
  getFarmInstitutionLinks,
  institutionsOfFarm,
  farmsOfInstitution,
  isFarmLinked,
  isInside,
  splitReach,
  institutionDocFarms,
} from '@core/index'
import type { CoverageFamily, Farm, Institution, LatLng, ReachCriterion, ReachRow, Visible } from '@core/index'

import { readToken } from '../../components/badges'
import { ChevronForward, Icon } from '../../components/Icon'
import { MapPanel } from '../../components/MapPanel'
import type { MapLink, MapMarker, MapRouteLine } from '../../components/MapView'
import { PageHeader } from '../../components/primitives'
import type { MapModeState } from '../../components/mapMode'
import { CoverageFarmCard } from '../../institutions/CoverageFarmCard'
import { ChainButton, useFarmLinking } from '../../institutions/FarmLinking'
import { InstitutionDocBlock } from '../../institutions/InstitutionDocBlock'
import { CoordinationChip, ENGAGEMENT_ON, HeadMissingChip, MinorsChip, peopleOf } from '../../institutions/institutionUi'
import { useCoreValue } from '../../hooks/useCore'
import { measureMeshPair } from '../../routing/roadNetwork'
import { meshPair, requestMeshPairs, useRoadMesh } from '../../routing/roadMesh'
import { useRouteMargin } from '../../settings/routeMargin'
import { onSettingsApplied } from '../../settings/applied'
import { InfoTip } from '../../components/InfoTip'
import { NumInput } from '../../components/fields'
import { DockedSheet } from '../../components/Sheet'
import { useViewportTier } from '../../hooks/useNarrow'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AU4 (2026-10-08) — LA CARTE DE COUVERTURE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La stratégie d'affectation du PO rendue visible, et sa carte de démarchage.
 *
 * ★ UN LANGAGE EN TROIS VARIABLES, POUR SE PASSER DE LÉGENDE :
 *     la TEINTE dit le côté      — sarcelle = terres, violet = institutions ;
 *     la FORME dit la chose      — épingle = ferme, carré à toque = institution,
 *                                  petit rond pointillé = piste ;
 *     le REMPLISSAGE dit l'acquis — plein = à moi, creux = à conquérir.
 *   Les liens suivent la même règle : trait plein = couverture réelle, tirets =
 *   couverture possible. Les interrupteurs du panneau portent le même dessin
 *   que la carte : ils SONT la légende.
 *
 * ★ DEUX USAGES, UN GESTE CHACUN (onglets en tête) :
 *   « פגישה » — le parc et les institutions engagées, NOMMÉES sur la carte ;
 *   rien d'interne (pistes, comptes de pistes sans lieu) : l'écran se montre.
 *   « הכנה » — tout, pistes comprises, avec ce qui manque.
 *   Toucher un interrupteur fait passer en « מותאם » sans rien perdre.
 *
 * ★★ LA DISTANCE — AW1 (2026-10-09), QUI ANNULE AU4.6. « À 35 km, TOUT est
 *   relié à TOUT » : le vol d'oiseau filtrait, et la route fait +69 % dans la
 *   zone. Désormais TOUTES les paires sont mesurées sur la route, hors ligne
 *   (`routing/roadMesh.ts` : une fois, gardées sur l'appareil, seules les
 *   paires neuves ou déplacées recalculées, progression affichée). Le vol
 *   d'oiseau n'écarte que l'impossible. Chaque lien porte ses kilomètres
 *   routiers et sa durée ; un lien dont la seule route franchit la Ligne verte
 *   est en pointillé d'alerte, et ne compte pas.
 *
 * ⛔ AUCUN DE CES COMPTEURS N'EST UN COMPTEUR D'OBJECTIF NI DE DOUNAMS : ils
 *    comptent des lieux atteints. Les pistes n'entrent dans aucun (AS6.8).
 */

/**
 * ⚠️★★ AX (2026-10-10) — UNE CLÉ À ELLE. Cet écran écrivait `lo-yanum:coverage`,
 *    que le réglage « פריסת שמירות » (`settings/coverage.ts`, le seuil des
 *    fermes oubliées) écrit AUSSI : chacun effaçait l'autre, et ouvrir cette
 *    carte remettait le seuil à son défaut — synchronisé vers l'autre
 *    appareil. Lue une fois depuis l'ancienne clé (rayon, familles), puis plus
 *    jamais touchée.
 */
const PREFS_KEY = 'lo-yanum:coverage-map'
const LEGACY_PREFS_KEY = 'lo-yanum:coverage'
type Usage = 'meeting' | 'prepare' | 'custom'
/** ★★ AX7 — la borne : kilomètres de route, ou minutes de trajet. */
type Unit = 'km' | 'min'
export const DEFAULT_LIMIT_MINUTES = 35
export const NIGHT_PCT_INITIAL = 0
type Focus = null | 'covered' | 'uncovered' | 'potential'
type Selected = { kind: 'farm' | 'lead' | 'institution'; id: string } | null

interface Prefs {
  radiusKm: number
  /** ★★ AX7 — la borne en minutes, gardée même quand l'unité choisie est le km. */
  minutes: number
  unit: Unit
  /**
   * ★★ AX7.2 — LA NUIT. Les gardes sont de nuit. La durée de base suppose des
   * routes VIDES (vitesses de circulation libre par type de route) — c'est
   * déjà la nuit pour le trafic ; ce pourcentage, que le PO règle, ajoute ce
   * que la nuit coûte en plus : routes non éclairées, pistes, barrages.
   */
  nightPct: number
  visible: Visible
}

function parsePrefs(raw: string | null): Partial<Prefs> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Partial<Prefs>
  } catch {
    return null
  }
}
function readPrefs(): Prefs {
  try {
    const p = parsePrefs(localStorage.getItem(PREFS_KEY)) ?? parsePrefs(localStorage.getItem(LEGACY_PREFS_KEY)) ?? {}
    const minutes = Number(p.minutes)
    const night = Number(p.nightPct)
    return {
      radiusKm: clampRadius(Number(p.radiusKm) || DEFAULT_RADIUS_KM),
      minutes: Number.isFinite(minutes) && minutes >= 1 ? Math.round(minutes) : DEFAULT_LIMIT_MINUTES,
      unit: p.unit === 'min' ? 'min' : 'km',
      nightPct: Number.isFinite(night) && night >= 0 && night <= 200 ? Math.round(night) : NIGHT_PCT_INITIAL,
      visible: { ...COVERAGE_PRESETS.prepare, ...(p.visible ?? {}) },
    }
  } catch {
    /* une préférence perdue n'est qu'un retour au défaut */
  }
  return { radiusKm: DEFAULT_RADIUS_KM, minutes: DEFAULT_LIMIT_MINUTES, unit: 'km', nightPct: NIGHT_PCT_INITIAL, visible: COVERAGE_PRESETS.prepare }
}
function writePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* idem */
  }
}
/* ★ AW1.7 — AUCUN PLAFOND : la réglette s'arrête à RADIUS_MAX_KM, le champ chiffré non. */
const clampRadius = clampRadiusKm

function usageOf(v: Visible): Usage {
  const same = (a: Visible, b: Visible) => (Object.keys(a) as CoverageFamily[]).every((k) => a[k] === b[k])
  if (same(v, COVERAGE_PRESETS.meeting)) return 'meeting'
  if (same(v, COVERAGE_PRESETS.prepare)) return 'prepare'
  return 'custom'
}

// --- La route d'une paire, tracé compris (mémoire de la page) -----------------

/**
 * Le TRACÉ d'une paire n'est pas gardé sur l'appareil (seuls km et durée le
 * sont) : toucher une ferme le redemande, et le graphe déjà chargé répond en
 * dizaines de millisecondes.
 */
const traceCache = new Map<string, LatLng[]>()
const traceKey = (a: LatLng, b: LatLng) => `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`
function useTrace(from: LatLng | null | undefined, to: LatLng | null | undefined): LatLng[] {
  const [, bump] = useState(0)
  const key = from && to ? traceKey(from, to) : ''
  useEffect(() => {
    if (!from || !to || traceCache.has(key)) return
    let alive = true
    void measureMeshPair(from, to).then((r) => {
      if (r && r.kind !== 'none' && r.coords) traceCache.set(key, r.coords)
      if (alive) bump((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return traceCache.get(key) ?? []
}

/**
 * « 23 ק״מ · 28 דק׳ » — TOUJOURS les deux (AX7.3), quelle que soit la borne.
 * La durée = la route (vitesses de circulation libre) × la marge du PO
 * (AI3.2) × la tenue de nuit (AX7.2).
 */
export function useLinkLabel(nightPct = 0): (km: number, seconds: number) => string {
  const { t } = useTranslation()
  const factor = useTimeFactor(nightPct)
  return (km, seconds) => t('coverage.linkLabel', { km: km.toFixed(km < 10 ? 1 : 0), min: linkMinutes(seconds, factor) })
}
export function useTimeFactor(nightPct: number): number {
  const margin = useRouteMargin()
  return (1 + margin / 100) * (1 + nightPct / 100)
}

// --- L'écran ------------------------------------------------------------------

/**
 * ★★ BG — le bandeau des réglages se REPLIE dès qu'une institution est
 * ouverte ; son état (replié / déplié) est mémorisé. Un état d'écran de CET
 * appareil : il ne voyage pas.
 */
export const BAND_KEY = 'lo-yanum:coverage-band'
function readBandOpen(): boolean {
  try {
    return localStorage.getItem(BAND_KEY) === 'open'
  } catch {
    return false
  }
}
function writeBandOpen(open: boolean): void {
  try {
    localStorage.setItem(BAND_KEY, open ? 'open' : 'folded')
  } catch {
    /* un état d'écran perdu n'est qu'un repli */
  }
}

/**
 * ★★ BG 3 — « LA RÈGLE SE DÉCIDE SUR LA PLACE RÉELLEMENT DISPONIBLE, PAS SUR
 * UNE LARGEUR D'ÉCRAN DEVINÉE. » Vrai quand l'élément est MONTÉ ET MIS EN
 * PAGE (aucun ancêtre en `display:none`, une largeur) : le panneau de droite
 * affiche alors la fiche, et le pop-up de la carte ferait doublon. Le panneau
 * caché (carte pleine, téléphone en mode carte) rend faux.
 */
function useLaidOut(ref: React.RefObject<HTMLElement>, key: unknown): boolean {
  const [shown, setShown] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) {
      setShown(false)
      return
    }
    const check = () => setShown(el.getClientRects().length > 0 && el.offsetWidth > 0)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return shown
}

export function CoverageScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const farms = useCoreValue(() => getVisibleFarms())
  const leads = useCoreValue(() => getVisibleLeads())
  const institutions = useCoreValue(() => getInstitutions())
  const volunteers = useCoreValue(() => getVolunteers())
  const farmLinks = useCoreValue(() => getFarmInstitutionLinks())
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs)
  /* ⚠️ ÉCRIT SUR UN GESTE, PAS AU MONTAGE : une clé synchronisée réécrite à
     chaque ouverture deviendrait « la plus récente » et écraserait le choix
     fait sur l'autre appareil. */
  const setPrefs = (f: (p: Prefs) => Prefs) =>
    setPrefsState((p) => {
      const next = f(p)
      writePrefs(next)
      return next
    })
  /* ★ AS4 — un choix fait sur l'autre appareil arrive ici. */
  useEffect(() => onSettingsApplied([PREFS_KEY], () => setPrefsState(readPrefs())), [])
  const margin = useRouteMargin()
  const factor = useTimeFactor(prefs.nightPct)
  const limitMinutes = prefs.unit === 'min' ? { minutes: prefs.minutes, factor } : null
  const airBound = airBoundKm({ radiusKm: prefs.radiusKm, limitMinutes })
  const limitText = prefs.unit === 'min' ? t('coverage.minutes', { min: prefs.minutes }) : t('coverage.km', { km: prefs.radiusKm })
  const criterion: ReachCriterion = { unit: prefs.unit, radiusKm: prefs.radiusKm, minutes: prefs.minutes, factor }
  const [focus, setFocus] = useState<Focus>(null)
  /* ★★ BG 1 — DEUX SÉLECTIONS, PAS UNE. L'institution (son maillage, ses
     trajets, sa fiche) et la fiche compacte d'une ferme ou d'une piste
     ouverte PAR-DESSUS. Avant BG, toucher une ferme REMPLAÇAIT l'institution :
     les trajets de tout le monde revenaient et le PO perdait son contexte.
     ★★ AX1 — ouverte depuis l'écran מוסדות : l'institution arrive choisie. */
  const [instId, setInstId] = useState<string | null>(() => new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('inst'))
  const [card, setCard] = useState<Selected>(null)
  const [cardKey, setCardKey] = useState(0)
  /* ★★ BC — LA BULLE EST UN ÉTAT À ELLE : la fermer garde la sélection (voir
     `core/coverageSelection.ts`). Ouverte d'office quand l'institution arrive
     de l'écran מוסדות. */
  const [bubble, setBubble] = useState<boolean>(() => instId !== null)
  /** Un nouveau cadrage à chaque flèche (et à l'arrivée par `?inst=`). */
  const [frameKey, setFrameKey] = useState(() => (instId !== null ? 1 : 0))
  const [bandOpen, setBandOpenState] = useState(readBandOpen)
  const setBandOpen = (open: boolean) => {
    setBandOpenState(open)
    writeBandOpen(open)
  }
  const tier = useViewportTier()
  const [routeTo, setRouteTo] = useState<string | null>(null)
  /* ★ AV1 — `null` = automatique : « לאשר » tant qu'il en reste, sinon « הכול ».
     Décidé à CHAQUE rendu et non au premier : l'hydratation arrive après,
     et un choix figé sur une liste encore vide changeait selon la vitesse
     du réseau (vu par `auui` sur le déployé). Le choix du PO, lui, reste. */
  const toConfirmCount = institutions.filter(isInstitutionToConfirm).length
  const usage = usageOf(prefs.visible)

  const selectedInst = instId !== null ? (institutions.find((i) => i.id === instId) ?? null) : null
  const linking = useFarmLinking()
  const modeRef = useRef<MapModeState | null>(null)
  const selRef = useRef<HTMLDivElement>(null)
  /* ★★ BG 3 — le panneau de droite affiche-t-il CETTE institution ? */
  const panelShowsInst = useLaidOut(selRef, selectedInst?.id ?? null) && selectedInst !== null

  /* ★★ AW1 — LES PAIRES À MESURER SUR LA ROUTE : toute institution placée ×
     toute ferme affichable que le vol d'oiseau laisse dans le rayon. Les
     paires déjà gardées ne coûtent rien ; les autres partent dans la file. */
  const mesh = useRoadMesh()
  const linkLabel = useLinkLabel(prefs.nightPct)
  const wanted = useMemo(() => {
    const out: Array<{ from: LatLng; to: LatLng }> = []
    const pts: LatLng[] = []
    for (const f of farms) {
      const p = farmPoint(f)
      if (!p) continue
      const fam = f.status === 'signed' || f.status === 'active' ? 'signed' : ['incoming_request', 'to_contact', 'contacted', 'visited', 'verbal_ok'].includes(f.status) ? 'pipeline' : null
      if (fam && prefs.visible[fam]) pts.push(p)
    }
    for (const i of institutions) {
      if (!i.position || i.engagement === 'not_relevant') continue
      for (const p of pts) if (haversineKm(i.position, p) <= airBound) out.push({ from: i.position, to: p })
    }
    return out
  }, [farms, institutions, airBound, prefs.visible])
  const wantedKey = wanted.map((w) => `${w.from.lat},${w.from.lng}>${w.to.lat},${w.to.lng}`).join('|')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    requestMeshPairs(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, retry])

  const coverage = useMemo(
    () =>
      computeCoverage({
        farms,
        leads,
        institutions,
        radiusKm: prefs.radiusKm,
        limitMinutes,
        visible: prefs.visible,
        road: (from, to) => meshPair(from, to),
      }),
    // `mesh.version` : une paire mesurée recompose le dessin et les compteurs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farms, leads, institutions, prefs, mesh.version, factor],
  )

  /* ★★ AY8 — les teintes de la carte, choisies pour ressortir (tokens.css). */
  const land = readToken('--map-farm')
  const school = readToken('--map-institution')
  const leadTone = readToken('--map-lead')

  const shownFarm = (id: string): boolean => {
    if (!focus) return true
    const r = coverage.reach.get(id)
    if (!r) return true
    if (focus === 'covered') return r.real > 0
    if (focus === 'uncovered') return r.real === 0
    return r.real === 0 && r.potential > 0
  }

  /* ★★ BG 1 — choisir une institution, et ce que ce geste emporte. */
  const openInstitution = (id: string) => {
    /* ★★ BC — toucher l'épingle : sélectionnée, bulle ouverte ; la même
       épingle, bulle fermée, rouvre la bulle. */
    const next = coverageSelect({ id: instId, bubble }, { type: 'pick', id })
    setBubble(next.bubble)
    setInstId(id)
    setCard(null)
    setRouteTo(null)
    /* ★★ BG 7 — dès qu'une institution est ouverte, le bandeau se replie. */
    if (id !== instId) setBandOpen(false)
  }

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = []
    for (const p of coverage.places) {
      const kind = p.family === 'leads' ? 'lead' : p.family === 'engaged' || p.family === 'prospect' ? 'institution' : 'farm'
      const pick = () => {
        if (kind === 'institution') {
          openInstitution(p.id)
          return
        }
        /* ★★ BG 1 — UNE FERME DANS UN MAILLAGE N'EST PAS UN CHANGEMENT DE
           CONTEXTE : l'institution reste choisie, ses trajets restent
           dessinés, la caméra ne bouge pas. Seul effet : sa fiche compacte. */
        setCard({ kind: kind as 'farm' | 'lead', id: p.id })
        setCardKey((k) => k + 1)
      }
      if (p.family === 'signed' || p.family === 'pipeline') {
        if (!shownFarm(p.id)) continue
        const isSel = card?.id === p.id
        out.push({ id: p.id, position: p.position, color: land, title: p.name, kind: 'farm', hollow: p.family === 'pipeline', emphasis: isSel, essential: isSel, onSelect: pick })
      } else if (p.family === 'leads') {
        out.push({ id: p.id, position: p.position, color: leadTone, title: p.name, kind: 'lead', emphasis: card?.id === p.id, onSelect: pick })
      } else {
        const inst = institutions.find((i) => i.id === p.id)
        const isSel = instId === p.id
        out.push({
          id: p.id,
          position: p.position,
          color: school,
          title: p.name,
          kind: 'institution',
          hollow: p.family === 'prospect',
          uncertain: inst?.positionUncertain,
          /* ★★ AY7.3 — le nom ne s'affiche plus en permanence (il masquait la
             carte) : il apparaît quand on touche l'institution. */
          label: isSel ? p.name : undefined,
          /* ★★ BG 3 — sur ordinateur, panneau ouvert sur elle : PAS de
             pop-up ; le marqueur se met en évidence, c'est tout. */
          emphasis: isSel,
          onSelect: pick,
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage, instId, card?.id, focus, land, school, institutions, bubble])

  const links: MapLink[] = useMemo(
    () =>
      /* ★★ BC — une institution SÉLECTIONNÉE (bulle ouverte ou fermée) : seuls
         ses trajets, épaissis. Fermer la bulle ne les rend plus tous ; ouvrir
         ou fermer la fiche d'une ferme non plus (BG 1). */
      linksOfSelection(coverage.links.filter((l) => shownFarm(l.farmId)), selectedInst?.id ?? null)
        .map((l) => ({
          from: l.from,
          to: l.to,
          tone: l.blocked ? ('blocked' as const) : l.tone,
          color: school,
          emphasis: !!selectedInst,
          label: `${l.blocked || l.fastestBeyond ? '⚠ ' : ''}${linkLabel(l.km, l.seconds)}`,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverage, selectedInst, focus, school, linkLabel],
  )

  const routeFarm = routeTo ? farms.find((x) => x.id === routeTo) : undefined
  const trace = useTrace(routeTo ? selectedInst?.position : null, routeFarm ? farmPoint(routeFarm) : null)
  const routeLines: MapRouteLine[] = useMemo(
    () => (trace.length > 1 ? [{ coords: trace, style: 'road' as const }] : []),
    [trace],
  )

  const setVisible = (family: CoverageFamily, on: boolean) => setPrefs((p) => ({ ...p, visible: { ...p.visible, [family]: on } }))
  const choose = (u: Usage) => {
    if (u === 'custom') return
    setPrefs((p) => ({ ...p, visible: COVERAGE_PRESETS[u] }))
    setFocus(null)
  }

  /* ★★ AY7 — les chiffres d'une institution : SES volontaires, les fermes qu'elle dessert. */
  const reachOf = (id: string) => coverage.links.filter((l) => l.institutionId === id && !l.blocked)

  /* ★★ BC — LE PARCOURS : ‹ › passent d'une institution à l'autre (celles que
     la carte dessine, par nom), la carte recadre sur elle et ses trajets, la
     bulle garde son état. Le fond de carte ou la croix de la barre désélectionnent. */
  const order = coverageOrder(coverage.places)
  const instSel = { id: selectedInst?.id ?? null, bubble }
  const stepInstitution = (dir: 1 | -1) => {
    const next = coverageSelect(instSel, { type: 'step', dir, order })
    if (!next.id) return
    setInstId(next.id)
    setCard(null)
    setBubble(next.bubble)
    setRouteTo(null)
    setFrameKey((k) => k + 1)
  }
  const deselect = () => {
    setBubble(coverageSelect(instSel, { type: 'deselect' }).bubble)
    setInstId(null)
    setCard(null)
    setRouteTo(null)
  }
  const framePoints = useMemo(() => {
    if (!selectedInst?.position) return []
    const farmsById = new Map(farms.map((f) => [f.id, f]))
    const pts = reachOf(selectedInst.id).map((l) => farmPoint(farmsById.get(l.farmId) as Farm)).filter((p): p is LatLng => !!p)
    return [selectedInst.position, ...pts]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInst?.id, coverage])
  const volunteersOfInst = (inst: Institution) => peopleOf(inst, volunteers).filter((v) => v.status !== 'inactive').length

  /* ★★ BG 4 — LES FERMES D'UNE INSTITUTION, mesurées sur la route : une fois,
     partagées par la liste de la fiche et par le document. */
  const reachRows = useMemo(() => {
    if (!selectedInst?.position) return [] as Array<ReachRow<Farm>>
    const out: Array<ReachRow<Farm>> = []
    for (const f of farms) {
      const p = farmPoint(f)
      if (!p) continue
      const air = haversineKm(selectedInst.position, p)
      const linkedHere = isFarmLinked(farmLinks, f.id, selectedInst.id)
      /* Une ferme LIÉE reste dans la fiche même au-delà du vol d'oiseau. */
      if (air > airBound && !linkedHere) continue
      out.push({ farm: f, air, road: meshPair(selectedInst.position, p) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInst, farms, airBound, mesh.version, farmLinks])
  const instNames = useMemo(() => new Map(institutions.map((i) => [i.id, i.name])), [institutions])
  const linkedNamesOf = (farmId: string): string[] => institutionsOfFarm(farmLinks, farmId).map((id) => instNames.get(id) ?? id)
  const docFarms = useMemo(
    () => (selectedInst ? institutionDocFarms(reachRows, new Set(farmsOfInstitution(farmLinks, selectedInst.id)), criterion, (r) => isInside(r.road, criterion)) : { linked: [], proposed: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reachRows, farmLinks, selectedInst?.id, prefs, factor],
  )

  const cardFarm = card?.kind === 'farm' ? farms.find((f) => f.id === card.id) : undefined
  const cardLead = card?.kind === 'lead' ? leads.find((l) => l.id === card.id) : undefined
  const cardPlace = card ? coverage.places.find((p) => p.id === card.id) : undefined
  const cardFarmPoint = cardFarm ? farmPoint(cardFarm) : null

  const detail: ReactNode = cardFarm ? (
    <CoverageFarmCard
      farm={cardFarm}
      inst={selectedInst}
      road={selectedInst?.position && cardFarmPoint ? meshPair(selectedInst.position, cardFarmPoint) : undefined}
      factor={factor}
      margin={margin}
      nightPct={prefs.nightPct}
      linkedNames={linkedNamesOf(cardFarm.id)}
      link={
        selectedInst ? (
          <ChainButton linked={isFarmLinked(farmLinks, cardFarm.id, selectedInst.id)} farmName={cardFarm.name} instName={selectedInst.name} onClick={() => linking.toggle(cardFarm, selectedInst)} testId="coverage-farm-card-chain" />
        ) : undefined
      }
      /* ★★ BG 1 — fermer la fiche n'efface RIEN d'autre. */
      onClose={() => setCard(null)}
    />
  ) : cardLead ? (
    <div className="w-[min(17rem,calc(100vw-2rem))] rounded-card bg-surface-overlay/95 p-3 shadow-lift backdrop-blur" data-testid="coverage-lead-card">
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-label font-bold text-content-primary">{cardLead.name}</p>
          <p className="muted mt-0.5 truncate text-micro">{[cardLead.contactName, cardLead.place].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" onClick={() => setCard(null)} aria-label={t('common.close')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-muted hover:bg-surface-high">
          <Icon name="close" size={16} />
        </button>
      </div>
      <p className="mt-1 text-micro text-content-secondary">{t('coverage.leadNotCounted')}</p>
      <Link to="/coordinator/leads" className="btn-secondary mt-2 min-h-11 w-full">
        {t('coverage.openLeads')}
      </Link>
    </div>
  ) : null

  const c = coverage.counts
  const meeting = usage === 'meeting'

  /* ★★ BG 3 — au téléphone (et partout où le panneau est caché), le pop-up
     de l'institution est RÉDUIT : son nom, son type, son village, et un
     bouton qui ouvre la fiche. */
  const openFiche = () => {
    modeRef.current?.setMode('hidden')
    window.setTimeout(() => selRef.current?.scrollIntoView({ block: 'start' }), 60)
  }

  /* ★★ BC — LA BARRE DE RAPPEL : le nom de l'institution sélectionnée et ses
     chiffres, en une ligne ; ‹ › pour passer à la voisine ; « פרטים » rouvre
     la bulle fermée ; × désélectionne. Au téléphone, c'est la barre de la
     feuille ancrée en bas. */
  const recall = selectedInst && (
    <div className="flex min-h-11 min-w-0 items-center gap-2" data-testid="coverage-recall" data-inst={selectedInst.id} data-bubble={bubble ? 'open' : 'closed'} data-panel={panelShowsInst ? 'shown' : 'hidden'}>
      <p className="min-w-0 flex-1 truncate text-caption" data-testid="coverage-recall-line">
        <span className="font-bold text-content-primary">{selectedInst.name}</span>
        <span className="text-content-secondary">
          {' · '}
          {tier === 'phone'
            ? [t(`institutions.kind.${selectedInst.kind}`), selectedInst.locality].filter(Boolean).join(' · ')
            : t('coverage.recallFigures', { volunteers: volunteersOfInst(selectedInst), farms: reachOf(selectedInst.id).length })}
        </span>
      </p>
      <span className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => stepInstitution(-1)} disabled={order.length < 2} aria-label={t('coverage.recallPrev')} title={t('coverage.recallPrev')} data-testid="coverage-recall-prev" className="flex h-11 w-11 items-center justify-center rounded-pill border border-edge-subtle bg-surface-raised text-content-primary hover:bg-surface-high disabled:opacity-40">
          <Icon name="chevron" size={16} className="ltr:-scale-x-100" />
        </button>
        <button type="button" onClick={() => stepInstitution(1)} disabled={order.length < 2} aria-label={t('coverage.recallNext')} title={t('coverage.recallNext')} data-testid="coverage-recall-next" className="flex h-11 w-11 items-center justify-center rounded-pill border border-edge-subtle bg-surface-raised text-content-primary hover:bg-surface-high disabled:opacity-40">
          <ChevronForward size={16} />
        </button>
        {!bubble && !panelShowsInst && tier !== 'phone' && (
          <button type="button" onClick={() => setBubble(coverageSelect(instSel, { type: 'openBubble' }).bubble)} data-testid="coverage-recall-open" className="flex h-11 items-center gap-1.5 rounded-pill border border-accent bg-accent/15 px-3 text-caption font-semibold text-accent-ink">
            <Icon name="info" size={15} />
            {t('coverage.recallOpen')}
          </button>
        )}
        <button type="button" onClick={deselect} aria-label={t('coverage.recallClear')} title={t('coverage.recallClear')} data-testid="coverage-recall-clear" className="flex h-11 w-11 items-center justify-center rounded-pill text-content-muted hover:bg-surface-high hover:text-content-primary">
          <Icon name="close" size={18} />
        </button>
      </span>
    </div>
  )
  /* ★★ BG 3 — le pop-up (la bulle) ne s'ouvre PAS quand le panneau affiche déjà la fiche. */
  const figures = selectedInst && tier !== 'phone' && !panelShowsInst && (
    <InstitutionFigures inst={selectedInst} reach={reachOf(selectedInst.id)} volunteers={volunteersOfInst(selectedInst)} limitText={limitText} bubble onClose={() => setBubble(coverageSelect(instSel, { type: 'closeBubble' }).bubble)} />
  )
  /* Grand écran : la barre en haut de la carte, la bulle RANGÉE dessous, au
     coin — plus jamais posée sur l'institution, au milieu de ses trajets. */
  const overlay =
    selectedInst && tier !== 'phone' ? (
      <div className="flex max-w-[34rem] flex-col items-start gap-2">
        <div className="glass w-full rounded-card px-2 py-1 shadow-lift">{recall}</div>
        {bubble && figures}
      </div>
    ) : undefined
  /* La place que la barre et la bulle prennent sur la carte : le cadrage la laisse libre. */
  const showsBubble = bubble && !!figures
  const framePadding =
    tier === 'phone'
      ? { top: 40, bottom: 120, left: 40, right: 40 }
      : { top: showsBubble ? 120 : 90, bottom: 56, left: 80, right: showsBubble ? 470 : 56 }

  // --- Le bandeau des réglages ------------------------------------------------
  const bandFolded = selectedInst !== null && !bandOpen
  const bandSummary = t(prefs.unit === 'min' ? 'coverage.band.upToMin' : 'coverage.band.upToKm', { min: prefs.minutes, km: prefs.radiusKm }) + ' · ' + t(prefs.unit === 'min' ? 'coverage.band.byTime' : 'coverage.band.byDistance')

  const meshStatus = (compact: boolean) => (
    <MeshStatus
      compact={compact}
      progress={mesh.progress}
      mesh={coverage.mesh}
      limitText={limitText}
      onRetry={() => setRetry((n) => n + 1)}
      resetText={prefs.unit === 'min' ? t('coverage.minutes', { min: DEFAULT_LIMIT_MINUTES }) : t('coverage.km', { km: DEFAULT_RADIUS_KM })}
      onReset={() => setPrefs((p) => (p.unit === 'min' ? { ...p, minutes: DEFAULT_LIMIT_MINUTES } : { ...p, radiusKm: DEFAULT_RADIUS_KM }))}
      farmsShown={c.farms}
    />
  )
  const band = bandFolded ? (
    <>
    <button
      type="button"
      onClick={() => setBandOpen(true)}
      aria-expanded={false}
      className="flex min-h-11 w-full items-center gap-2 rounded-card bg-surface-raised px-3 py-2 text-start shadow-card hover:bg-surface-high"
      data-testid="coverage-band-folded"
      data-unit={prefs.unit}
    >
      <Icon name="filter" size={16} className="shrink-0 text-content-muted" />
      <span className="ltr-nums min-w-0 flex-1 truncate text-caption font-semibold text-content-primary" data-testid="coverage-band-summary">
        {bandSummary}
      </span>
      <span className="shrink-0 text-micro text-content-muted">{t('coverage.band.edit')}</span>
      <Icon name="chevronDown" size={16} className="shrink-0 text-content-muted" />
    </button>
    {meshStatus(true)}
    </>
  ) : (
    <div data-testid="coverage-band" data-open="true">
      {/* ★★ AX3 — « פגישה » N'ÉTAIT NI UN ONGLET NI UN FILTRE : c'est un MODE
          de l'écran (on le montre à une institution : rien d'interne). Un
          interrupteur, à sa place ; les familles ci-dessous sont LES filtres. */}
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card bg-surface-raised px-3 py-2 shadow-card" data-testid="coverage-usage" data-usage={usage}>
        <input
          type="checkbox"
          role="switch"
          className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
          checked={usage === 'meeting'}
          onChange={(e) => choose(e.target.checked ? 'meeting' : 'prepare')}
          data-testid="coverage-usage-meeting"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-caption font-semibold text-content-primary">{t('coverage.meetingMode')}</span>
          <span className="block truncate text-micro text-content-muted">{t(`coverage.usage.${usage}Short`)}</span>
        </span>
      </label>
      {usage !== 'meeting' && toConfirmCount > 0 && (
        <button
          type="button"
          data-testid="coverage-to-confirm"
          data-count={toConfirmCount}
          onClick={() => navigate('/coordinator/institutions?filter=toConfirm')}
          className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-field bg-status-warn/15 px-3 py-2 text-start text-caption font-semibold text-status-warn-ink"
        >
          <Icon name="alert" size={16} />
          <span className="min-w-0 flex-1">{t('institutions.toConfirmBanner', { count: toConfirmCount })}</span>
          <ChevronForward size={16} />
        </button>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* LES CINQ FAMILLES — les interrupteurs SONT la légende            */}
      {/* ---------------------------------------------------------------- */}
      <div className="mt-4 grid gap-3" data-testid="coverage-families">
        <fieldset className="min-w-0 rounded-card bg-surface-raised p-3 shadow-card [&>button:not(:first-of-type)]:mt-2">
          <legend className="px-1 text-caption font-bold text-content-secondary">{t('coverage.side.land')}</legend>
          <FamilyToggle family="signed" on={prefs.visible.signed} onChange={setVisible} count={coverage.places.filter((p) => p.family === 'signed').length || countFamily(farms, 'signed')} swatch={<Swatch kind="pin" color={land} />} />
          <FamilyToggle family="pipeline" on={prefs.visible.pipeline} onChange={setVisible} count={countFamily(farms, 'pipeline')} swatch={<Swatch kind="pin" color={land} hollow />} />
          <FamilyToggle family="leads" on={prefs.visible.leads} onChange={setVisible} count={coverage.leadsPlaced} swatch={<Swatch kind="lead" color={leadTone} />} />
        </fieldset>
        <fieldset className="min-w-0 rounded-card bg-surface-raised p-3 shadow-card [&>button:not(:first-of-type)]:mt-2">
          <legend className="px-1 text-caption font-bold text-content-secondary">{t('coverage.side.institutions')}</legend>
          <FamilyToggle family="engaged" on={prefs.visible.engaged} onChange={setVisible} count={institutions.filter((i) => isInstitutionEngaged(i) && i.position).length} swatch={<Swatch kind="school" color={school} />} />
          <FamilyToggle family="prospect" on={prefs.visible.prospect} onChange={setVisible} count={institutions.filter((i) => !isInstitutionEngaged(i) && i.engagement !== 'not_relevant' && i.position).length} swatch={<Swatch kind="school" color={school} hollow />} />
          <div className="mt-2 flex items-center gap-3 border-t border-edge-subtle pt-2 text-micro text-content-secondary">
            <span className="flex items-center gap-1.5"><Swatch kind="line" color={school} /> {t('coverage.linkReal')}</span>
            <span className="flex items-center gap-1.5"><Swatch kind="line" color={school} hollow /> {t('coverage.linkPotential')}</span>
          </div>
        </fieldset>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* LE RAYON                                                          */}
      {/* ---------------------------------------------------------------- */}
      {/* ★★ AX7 — LA BORNE, EN KILOMÈTRES OU EN MINUTES : le choix est au PO.
          Son engagement auprès des institutions est de 35 MINUTES. */}
      <div className="mt-4 block rounded-card bg-surface-raised p-3 shadow-card" data-testid="coverage-radius" data-unit={prefs.unit}>
        <span className="flex flex-nowrap items-center justify-between gap-3">
          <span className="flex items-center text-caption font-bold text-content-secondary">
            {t('coverage.limit')}
            <InfoTip label={t('coverage.durationWhat')} testId="coverage-duration-info" className="contents">
              <p>{t('coverage.durationIs')}</p>
              <p className="mt-1">{t('coverage.durationSpeeds')}</p>
              <p className="mt-1">{t('coverage.durationMargin', { percent: margin })}</p>
              <p className="mt-1">{t('coverage.durationNight', { percent: prefs.nightPct })}</p>
              <p className="mt-1">{t('coverage.distanceRule')}</p>
            </InfoTip>
          </span>
          <span className="numeric ltr-nums text-title text-content-primary" data-testid="coverage-radius-value">
            {limitText}
          </span>
        </span>
        <span role="radiogroup" aria-label={t('coverage.unitLabel')} className="mt-4 flex flex-nowrap gap-2" data-testid="coverage-unit">
          {(['min', 'km'] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={prefs.unit === u}
              onClick={() => setPrefs((p) => ({ ...p, unit: u }))}
              data-testid={`coverage-unit-${u}`}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-field border text-caption font-semibold ${
                prefs.unit === u ? 'border-accent bg-accent/15 text-accent-ink' : 'border-edge-subtle text-content-secondary hover:bg-surface-high'
              }`}
            >
              {t(`coverage.unit.${u}`)}
            </button>
          ))}
        </span>
        {prefs.unit === 'km' ? (
          <>
            <input
              type="range"
              min={RADIUS_MIN_KM}
              max={Math.max(RADIUS_MAX_KM, prefs.radiusKm)}
              step={5}
              value={prefs.radiusKm}
              onChange={(e) => setPrefs((p) => ({ ...p, radiusKm: clampRadius(Number(e.target.value)) }))}
              className="mt-2 h-11 w-full accent-[rgb(var(--status-violet))]"
              data-testid="coverage-radius-input"
              aria-valuetext={t('coverage.km', { km: prefs.radiusKm })}
            />
            <span className="mt-1 flex items-center gap-2 text-caption text-content-secondary">
              {/* ★ AW1.7 — un champ chiffré, SANS plafond : la réglette n'est qu'un raccourci. */}
              <span>{t('coverage.radiusAny')}</span>
              <NumInput
                min={1}
                value={prefs.radiusKm}
                onCommit={(n) => n !== null && setPrefs((p) => ({ ...p, radiusKm: clampRadius(n) }))}
                className="h-11 w-24 text-center"
                testId="coverage-radius-number"
                ariaLabel={t('coverage.radius')}
              />
              <span>{t('coverage.kmUnit')}</span>
            </span>
          </>
        ) : (
          <>
            <input
              type="range"
              min={10}
              max={Math.max(90, prefs.minutes)}
              step={5}
              value={prefs.minutes}
              onChange={(e) => setPrefs((p) => ({ ...p, minutes: Math.max(1, Math.round(Number(e.target.value))) }))}
              className="mt-2 h-11 w-full accent-[rgb(var(--status-violet))]"
              data-testid="coverage-minutes-input"
              aria-valuetext={t('coverage.minutes', { min: prefs.minutes })}
            />
            <span className="mt-1 flex flex-wrap items-center gap-2 text-caption text-content-secondary">
              <span>{t('coverage.minutesAny')}</span>
              <NumInput
                min={1}
                value={prefs.minutes}
                onCommit={(n) => n !== null && setPrefs((p) => ({ ...p, minutes: n }))}
                className="h-11 w-20 text-center"
                testId="coverage-minutes-number"
                ariaLabel={t('coverage.limit')}
              />
              <span>{t('coverage.minUnit')}</span>
            </span>
          </>
        )}
        {/* ★★ AX7.2 — LA NUIT, RÉGLABLE PAR LE PO, ET DITE EN UNE LIGNE. */}
        <span className="mt-2 flex flex-wrap items-center gap-2 border-t border-edge-subtle pt-2 text-caption text-content-secondary">
          <Icon name="moon" size={14} />
          <span>{t('coverage.nightLabel')}</span>
          <NumInput
            min={0}
            max={200}
            value={prefs.nightPct}
            onCommit={(n) => n !== null && setPrefs((p) => ({ ...p, nightPct: n }))}
            className="h-11 w-20 text-center"
            testId="coverage-night"
            ariaLabel={t('coverage.nightLabel')}
          />
          <span>%</span>
          <span className="muted ms-auto text-micro" data-testid="coverage-duration-line">
            {t('coverage.durationLine', { margin, night: prefs.nightPct })}
          </span>
        </span>
      </div>

      {meshStatus(false)}
      {/* ★★ BG 7 — appliqué : le bandeau se referme (une institution est ouverte). */}
      {selectedInst && (
        <button type="button" className="btn-primary mt-3 min-h-11 w-full" onClick={() => setBandOpen(false)} data-testid="coverage-band-apply">
          <Icon name="check" size={16} />
          {t('coverage.band.apply')}
        </button>
      )}
    </div>
  )

  // --- La fiche de l'institution, en tête du panneau --------------------------
  const selectedSection = selectedInst && (
    <div ref={selRef} className="mt-4 scroll-mt-24" data-testid="coverage-selected" data-inst={selectedInst.id}>
      <div className="rounded-card bg-surface-raised p-3 shadow-card">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-caption font-bold text-content-secondary">{t('coverage.figures.selected')}</p>
          {/* ★★ BG 8 — en haut de la fiche : la fiche COMPLÈTE de cette institution. */}
          <Link
            to={`/coordinator/institutions/${selectedInst.id}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field border border-edge-subtle bg-surface-overlay text-content-primary hover:bg-surface-high"
            aria-label={t('coverage.openFull', { name: selectedInst.name })}
            title={t('coverage.openFull', { name: selectedInst.name })}
            data-testid="coverage-open-institution"
          >
            <Icon name="external" size={17} />
          </Link>
        </div>
        <div className="mt-2">
          <InstitutionFigures inst={selectedInst} reach={reachOf(selectedInst.id)} volunteers={volunteersOfInst(selectedInst)} limitText={limitText} />
        </div>
      </div>
      <InstitutionDocBlock inst={selectedInst} linked={docFarms.linked} proposed={docFarms.proposed} limitText={limitText} margin={margin} nightPct={prefs.nightPct} />
      <div className="mt-4">
        <p className="text-caption font-bold text-content-secondary">
          {t('coverage.reachTitleLimit', { limit: limitText })}
          {mesh.progress.pending > 0 && <span className="muted ms-2 font-normal">{t('coverage.measuringRoad', { count: mesh.progress.pending })}</span>}
        </p>
        <ReachList
          inst={selectedInst}
          rows={reachRows}
          criterion={criterion}
          nightPct={prefs.nightPct}
          routeTo={routeTo}
          onRoute={(id) => setRouteTo(routeTo === id ? null : id)}
          linkedHere={(id) => isFarmLinked(farmLinks, id, selectedInst.id)}
          linkedNames={linkedNamesOf}
          onChain={(farm) => linking.toggle(farm, selectedInst)}
        />
      </div>
    </div>
  )

  return (
    <MapPanel
      screenKey="coverage"
      ariaLabel={t('coverage.mapLabel')}
      markers={markers}
      links={links}
      routeLines={routeLines}
      fit
      /* ★★ BF — les familles affichées et le focus : un geste du PO. */
      fitScope={JSON.stringify([prefs.visible, focus])}
      detail={detail}
      /* ★★ BG 1 — dans un maillage, la fiche de ferme est RANGÉE au coin
         (aucune caméra) ; sans institution, elle s'ancre sur l'épingle. */
      detailAt={cardPlace && !selectedInst ? { position: cardPlace.position, key: cardKey } : undefined}
      overlay={overlay}
      frameTo={framePoints.length > 0 && frameKey > 0 ? { points: framePoints, key: `${selectedInst?.id}-${frameKey}`, maxZoom: 12, padding: framePadding } : undefined}
      /* ★★ BG 1 — le fond de carte ferme d'abord la fiche de ferme ; ensuite seulement il désélectionne. */
      onBackgroundTap={card ? () => setCard(null) : selectedInst ? deselect : undefined}
    >
      {(state: MapModeState) => {
        modeRef.current = state
        return (
          <div data-testid="coverage-screen" data-usage={usage} data-band={bandFolded ? 'folded' : 'open'}>
            <PageHeader
              title={t('coverage.title')}
              info={
                <>
                  <p>{t('coverage.subtitle')}</p>
                  <p className="mt-1">{t(`coverage.usage.${usage}Hint`)}</p>
                </>
              }
              actions={
                <Link to="/coordinator/route" className="btn-ghost min-h-11" data-testid="coverage-to-route">
                  <Icon name="route" size={16} />
                  <span className="hidden sm:inline">{t('coverage.toRoute')}</span>
                </Link>
              }
            />

            {band}

            {/* ★★ BG 7 — le gain de hauteur du bandeau replié va à la fiche, juste dessous. */}
            {selectedSection}

            {/* ---------------------------------------------------------------- */}
            {/* CE QU'IL FAUT VOIR D'UN COUP D'ŒIL                                */}
            {/* ---------------------------------------------------------------- */}
            <div className="mt-4 grid grid-cols-3 gap-2" data-testid="coverage-counts" data-farms={c.farms} data-covered={c.covered} data-uncovered={c.uncovered} data-potential={c.potential}>
              <Counter testId="coverage-covered" value={c.covered} of={c.farms} label={t('coverage.covered')} tone="success" active={focus === 'covered'} onClick={() => setFocus(focus === 'covered' ? null : 'covered')} />
              <Counter testId="coverage-uncovered" value={c.uncovered} of={c.farms} label={t('coverage.uncovered')} tone="warn" active={focus === 'uncovered'} onClick={() => setFocus(focus === 'uncovered' ? null : 'uncovered')} />
              <Counter testId="coverage-potential" value={c.potential} of={c.uncovered} label={t('coverage.potential')} tone="violet" plus active={focus === 'potential'} onClick={() => setFocus(focus === 'potential' ? null : 'potential')} />
            </div>
            {/* ★★ AX3.5 — ICI, CHIFFRES ET FILTRES À LA FOIS, ET L'ÉCRAN LE DIT : ce
                sont les nombres qu'on montre à une institution (gros, lisibles de
                loin) ; les toucher isole ces fermes sur la carte. */}
            <p className="muted mt-1.5 text-micro">
              {t('coverage.countsScope', { n: c.farms })} · {focus ? t('coverage.focusOn') : t('coverage.countsTap')}
            </p>
            {!meeting && c.unreachable > 0 && (
              <p className="mt-1 text-caption font-semibold text-status-warn-ink" data-testid="coverage-unreachable">
                {t('coverage.unreachable', { count: c.unreachable })}
              </p>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* CE QUI MANQUE (préparation seulement : rien d'interne en rendez-vous) */}
            {/* ---------------------------------------------------------------- */}
            {!meeting && (
              <ul className="mt-3 flex flex-col gap-1.5 text-caption" data-testid="coverage-missing">
                {coverage.leadsUnplaced > 0 && (
                  <li data-testid="coverage-leads-unplaced" data-count={coverage.leadsUnplaced}>
                    <Link to="/coordinator/leads" className="flex items-center gap-2 font-semibold text-status-warn-ink underline-offset-2 hover:underline">
                      <Icon name="pin" size={14} />
                      {t('coverage.leadsUnplaced', { count: coverage.leadsUnplaced })}
                    </Link>
                  </li>
                )}
                {coverage.institutionsUnplaced > 0 && (
                  <li className="flex items-center gap-2 text-content-secondary" data-testid="coverage-institutions-unplaced">
                    <Icon name="pin" size={14} />
                    {t('coverage.institutionsUnplaced', { count: coverage.institutionsUnplaced })}
                  </li>
                )}
                {coverage.uncertainLinks > 0 && (
                  <li className="flex items-center gap-2 text-content-secondary" data-testid="coverage-uncertain">
                    <Icon name="alert" size={14} />
                    {t('coverage.uncertainLinks', { count: coverage.uncertainLinks })}
                  </li>
                )}
                {coverage.institutionsNotRelevant > 0 && (
                  <li className="text-content-muted">{t('coverage.notRelevantHidden', { count: coverage.institutionsNotRelevant })}</li>
                )}
              </ul>
            )}

            {institutions.length === 0 && (
              <div className="mt-4 rounded-card border border-dashed border-edge-strong p-4" data-testid="coverage-no-institutions">
                <p className="font-semibold text-content-primary">{t('coverage.noInstitutions')}</p>
                <p className="muted mt-1">{t('coverage.noInstitutionsHint')}</p>
                <Link to="/coordinator/import/institutions" className="btn-primary mt-3">
                  <Icon name="upload" size={16} />
                  {t('institutions.import.title')}
                </Link>
              </div>
            )}

            {/* ★★ BC — au téléphone, la bulle ne flotte pas au milieu : elle est une
                feuille ANCRÉE en bas (sa barre = la barre de rappel).
                ★★ BG 3 — RÉDUITE : nom, type, village, et « פתיחת הכרטיס » ; et
                seulement quand le panneau ne montre pas déjà la fiche, ni une fiche
                de ferme ouverte par-dessus. */}
            {selectedInst && tier === 'phone' && !panelShowsInst && !card && (
              <DockedSheet expanded={bubble} onExpandedChange={setBubble} header={recall} testId="coverage-sheet">
                <div className="flex flex-col gap-2 pb-1" data-testid="coverage-phone-popup">
                  {/* Le nom, le type et le village sont dans la barre, au-dessus. */}
                  <button type="button" className="btn-primary min-h-11 w-full" onClick={openFiche} data-testid="coverage-phone-open-fiche">
                    {t('coverage.openFiche')}
                    <ChevronForward size={16} />
                  </button>
                </div>
              </DockedSheet>
            )}
            {linking.dialog}
          </div>
        )
      }}
    </MapPanel>
  )
}

function countFamily(farms: readonly Farm[], family: 'signed' | 'pipeline'): number {
  const signed = ['signed', 'active']
  const pipe = ['incoming_request', 'to_contact', 'contacted', 'visited', 'verbal_ok']
  return farms.filter((f) => farmPoint(f) && (family === 'signed' ? signed : pipe).includes(f.status)).length
}

// --- Petits morceaux ---------------------------------------------------------

/** Le même dessin que sur la carte, en miniature : l'interrupteur EST la légende. */
function Swatch({ kind, color, hollow = false }: { kind: 'pin' | 'lead' | 'school' | 'line'; color: string; hollow?: boolean }) {
  const ring = 'rgb(var(--surface-base))'
  if (kind === 'line') {
    return (
      <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
        <line x1="1" y1="4" x2="25" y2="4" stroke={color} strokeWidth={hollow ? 1.8 : 3} strokeDasharray={hollow ? '4 3' : undefined} strokeLinecap="round" />
      </svg>
    )
  }
  void ring
  /* ★★ AY8 — la légende dessine EXACTEMENT les marqueurs de la carte. */
  if (kind === 'lead') {
    return <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-pill" style={{ border: `2.5px dashed ${color}`, background: '#ffffff', boxShadow: '0 0 0 1.2px #141b26' }} />
  }
  if (kind === 'school') {
    return (
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-field" style={{ background: hollow ? '#ffffff' : color, border: `2.5px solid ${hollow ? color : '#ffffff'}`, boxShadow: '0 0 0 1.2px #141b26' }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={hollow ? color : '#ffffff'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 9.5 12 5l10 4.5L12 14Z M6 11.5v4.2c0 1.3 2.7 2.8 6 2.8s6-1.5 6-2.8v-4.2 M22 9.5v5" />
        </svg>
      </span>
    )
  }
  return (
    <svg width="18" height="28" viewBox="1.75 -1.25 20.5 33.5" aria-hidden="true">
      <path d="M10.7 15.9 L13.3 15.9 L12.25 31.1 L11.75 31.1 Z" fill="#141b26" />
      <circle cx="12" cy="8.9" r="9.1" fill="#ffffff" stroke="#141b26" strokeWidth="1.1" />
      <circle cx="12" cy="8.9" r="7.6" fill={hollow ? '#ffffff' : color} stroke={hollow ? color : 'none'} strokeWidth={hollow ? 2.2 : 0} />
    </svg>
  )
}

function FamilyToggle({
  family,
  on,
  onChange,
  count,
  swatch,
}: {
  family: CoverageFamily
  on: boolean
  onChange: (f: CoverageFamily, on: boolean) => void
  count: number
  swatch: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={`coverage-family-${family}`}
      onClick={() => onChange(family, !on)}
      className={`flex min-h-11 w-full items-center gap-3 rounded-field px-2 py-1.5 text-start transition-colors duration-fast hover:bg-surface-high ${on ? '' : 'opacity-50'}`}
    >
      <span className="flex w-7 shrink-0 justify-center">{swatch}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-semibold text-content-primary">{t(`coverage.family.${family}`)}</span>
        <span className="block truncate text-micro text-content-muted">{t(`coverage.familyHint.${family}`)}</span>
      </span>
      <span className="numeric ltr-nums text-caption font-bold text-content-secondary">{count}</span>
      <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-pill transition-colors duration-fast ${on ? 'bg-accent' : 'bg-surface-high'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-pill bg-surface-overlay shadow-card transition-all duration-fast ${on ? 'end-0.5' : 'start-0.5'}`} />
      </span>
    </button>
  )
}

function Counter({
  value,
  of,
  label,
  tone,
  active,
  onClick,
  testId,
  plus = false,
}: {
  value: number
  of: number
  label: string
  tone: 'success' | 'warn' | 'violet'
  active: boolean
  onClick: () => void
  testId: string
  plus?: boolean
}) {
  const ink = { success: 'text-status-success-ink', warn: 'text-status-warn-ink', violet: 'text-status-violet-ink' }[tone]
  const bg = { success: 'bg-status-success/15', warn: 'bg-status-warn/15', violet: 'bg-status-violet/15' }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      data-value={value}
      className={`flex min-h-[5.5rem] min-w-0 flex-col items-start justify-between rounded-card p-3 text-start shadow-card transition-colors duration-fast ${active ? bg : 'bg-surface-raised hover:bg-surface-high'}`}
    >
      <span className={`numeric ltr-nums text-title font-bold leading-none ${ink}`}>
        {plus && value > 0 ? '+' : ''}
        {value}
        <span className="text-caption font-semibold text-content-muted"> /{of}</span>
      </span>
      <span className="text-caption font-semibold text-content-primary">{label}</span>
    </button>
  )
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY7 (2026-10-11) — LA FICHE D'UNE INSTITUTION, LISIBLE DE LOIN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Trop dense, je mets du temps à la lire. » Ce que le PO montre en deux
 * secondes, en rendez-vous, à la personne en face : le NOM, et quatre
 * chiffres en gros — combien de volontaires, combien de fermes desservies
 * (le lien existe sur la route, dans la borne), à quelle distance (la plus
 * proche desservie), et la borne elle-même. Le reste (lieu, type, statut,
 * contact, rencontre) est derrière ⓘ.
 */
function InstitutionFigures({
  inst,
  reach,
  volunteers,
  limitText,
  onClose,
  bubble = false,
}: {
  inst: Institution
  reach: Array<{ tone: 'real' | 'potential'; km: number; seconds: number }>
  volunteers: number
  limitText: string
  onClose?: () => void
  bubble?: boolean
}) {
  const { t } = useTranslation()
  const nearest = reach.length > 0 ? Math.min(...reach.map((r) => r.km)) : null
  const figures = [
    { v: String(volunteers), l: t('coverage.figures.volunteers'), testId: 'coverage-fig-volunteers' },
    { v: String(reach.length), l: t('coverage.figures.farms'), testId: 'coverage-fig-farms' },
    { v: nearest === null ? '—' : t('coverage.figures.km', { km: nearest.toFixed(nearest < 10 ? 1 : 0) }), l: t('coverage.figures.nearest'), testId: 'coverage-fig-nearest' },
    { v: limitText, l: t('coverage.figures.limit'), testId: 'coverage-fig-limit' },
  ]
  return (
    <div
      className={bubble ? 'w-[min(22rem,calc(100vw-2rem))] rounded-card bg-surface-overlay/95 p-4 shadow-lift backdrop-blur lg:w-[28rem] lg:p-5' : ''}
      data-testid={bubble ? 'coverage-institution-card' : 'coverage-institution-figures'}
    >
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-title font-bold leading-tight text-content-primary lg:text-[1.75rem]" data-testid="coverage-institution-name">
          {inst.name}
        </p>
        <InfoTip label={t('coverage.figures.more')} testId="coverage-institution-info">
          <p className="text-caption text-content-primary">{[inst.locality, t(`institutions.kind.${inst.kind}`), t(`institutions.audience.${inst.audience}`), inst.network].filter(Boolean).join(' · ')}</p>
          <p className="mt-1 flex flex-wrap gap-1">
            <span className={`chip border ${ENGAGEMENT_ON[inst.engagement]}`}>{t(`institutions.engagement.${inst.engagement}`)}</span>
            {isInstitutionToConfirm(inst) && <span className="chip bg-status-warn/15 text-status-warn-ink">{t('institutions.toConfirm')}</span>}
            {inst.positionUncertain && <span className="chip bg-status-warn/15 text-status-warn-ink" data-testid="coverage-uncertain-chip">{t('institutions.uncertain')}</span>}
            {/* ★★ AZ5 — le contact affiché est le rang 1 ; sans lui, on le dit. */}
            <HeadMissingChip inst={inst} />
            <MinorsChip inst={inst} />
            {/* ★★ BB — « נדרש תיאום מוקדם », avec son texte. */}
            <CoordinationChip inst={inst} full />
          </p>
          {(inst.contactName || inst.metOn || inst.students !== null) && (
            <p className="mt-1 text-caption text-content-secondary" data-testid="coverage-institution-facts">
              {[inst.contactName, inst.metOn ? t('institutions.metOnShort', { date: inst.metOn.split('-').reverse().join('.') }) : '', inst.students !== null ? t('institutions.studentsShort', { count: inst.students }) : ''].filter(Boolean).join(' · ')}
            </p>
          )}
          <Link to={`/coordinator/institutions/${inst.id}`} className="btn-ghost mt-1 min-h-11 px-0">
            <Icon name="edit" size={15} />
            {t('coverage.figures.edit')}
          </Link>
        </InfoTip>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="h-11 w-11 shrink-0 rounded-field text-content-muted hover:bg-surface-high hover:text-content-primary">
            <Icon name="close" size={18} />
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {figures.map((f) => (
          <div key={f.testId} className="rounded-card bg-surface-raised px-3 py-2.5 text-center shadow-card" data-testid={f.testId}>
            <p className="numeric ltr-nums text-[2rem] font-bold leading-none text-content-primary lg:text-[2.5rem]">{f.v}</p>
            <p className="mt-1 text-caption font-semibold text-content-secondary">{f.l}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * ★★ BG 4 — LES FERMES D'UNE INSTITUTION, DANS L'ORDRE DU CRITÈRE DU PO.
 *
 * D'abord celles qui sont DANS le seuil, sans mélange, triées par minutes
 * croissantes (critère « temps ») ou par kilomètres croissants (critère
 * « distance ») — `splitReach`. Ensuite, dans une section REPLIÉE par défaut,
 * le complément exact : « מעבר לטווח שבחרת (N) ». Chaque titre porte son compte.
 *
 * ★★ BG 5 — au bout de chaque ligne, le chaînon (`ChainButton`) ; une ferme
 * liée à plus d'une institution le dit, discrètement mais visiblement.
 */
function ReachList({
  inst,
  rows,
  criterion,
  nightPct,
  routeTo,
  onRoute,
  linkedHere,
  linkedNames,
  onChain,
}: {
  inst: Institution
  rows: ReadonlyArray<ReachRow<Farm>>
  criterion: ReachCriterion
  nightPct: number
  routeTo: string | null
  onRoute: (id: string) => void
  linkedHere: (farmId: string) => boolean
  linkedNames: (farmId: string) => string[]
  onChain: (farm: Farm) => void
}) {
  const { t } = useTranslation()
  const label = useLinkLabel(nightPct)
  const { inside, outside } = useMemo(() => splitReach(rows, criterion, (f) => `${f.name}\u0000${f.id}`), [rows, criterion.unit, criterion.radiusKm, criterion.minutes, criterion.factor]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!inst.position) return <p className="muted mt-1">{t('coverage.noInstitutionPosition')}</p>
  if (rows.length === 0) return <p className="muted mt-1">{t('coverage.reachNone')}</p>

  const row = ({ farm, road }: ReachRow<Farm>) => {
    const measured = road && road.kind !== 'none' ? road : null
    const out = !!measured && !isInside(road, criterion)
    const blocked = road?.kind === 'beyondOnly'
    const beyond = road?.kind === 'road' ? road.fastestBeyond : null
    const names = linkedNames(farm.id)
    const here = linkedHere(farm.id)
    return (
      <li key={farm.id} className="flex items-stretch gap-1.5" data-testid={`coverage-reach-row-${farm.id}`} data-linked={here ? 'true' : 'false'} data-links={names.length}>
        <button
          type="button"
          onClick={() => onRoute(farm.id)}
          aria-pressed={routeTo === farm.id}
          className={`flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-field border px-3 py-1.5 text-start text-caption ${routeTo === farm.id ? 'border-accent bg-accent/10' : 'border-edge-subtle hover:bg-surface-high'}`}
          data-testid={`coverage-reach-${farm.id}`}
          data-road={measured ? measured.km.toFixed(2) : ''}
          data-min={measured ? linkMinutes(measured.seconds, criterion.factor) : ''}
          data-state={road === undefined ? 'pending' : road.kind === 'none' ? 'none' : blocked ? 'blocked' : out ? 'out' : 'in'}
        >
          <span className="min-w-0 flex-1 truncate font-semibold text-content-primary">{farm.name}</span>
          <span className="ltr-nums shrink-0 text-content-secondary">
            {measured ? label(measured.km, measured.seconds) : road?.kind === 'none' ? t('coverage.noRoadShort') : t('coverage.measuringOne')}
          </span>
          {blocked && <span className="chip bg-status-danger/15 text-status-danger-ink" data-testid="coverage-reach-blocked">{t('coverage.beyondOnly')}</span>}
          {/* ★★ BG 5.4 — l'exception, repérable : liée à plus d'une institution. */}
          {names.length > 1 && (
            <span className="chip bg-status-warn/15 text-status-warn-ink" data-testid="coverage-reach-multi" title={names.join(' · ')}>
              <Icon name="link" size={12} />
              {t('sponsor.multiShort', { count: names.length })}
            </span>
          )}
          {names.length === 1 && !here && (
            <span className="w-full truncate text-micro text-content-muted" data-testid="coverage-reach-elsewhere">
              {t('sponsor.elsewhere', { name: names[0] })}
            </span>
          )}
          {beyond && (
            <span className="w-full text-micro text-status-warn-ink" data-testid="coverage-reach-beyond">
              {t('coverage.fastestBeyond', { km: beyond.km.toFixed(1) })}
            </span>
          )}
        </button>
        <ChainButton linked={here} farmName={farm.name} instName={inst.name} onClick={() => onChain(farm)} testId={`coverage-chain-${farm.id}`} />
      </li>
    )
  }

  return (
    <div className="mt-2" data-testid="coverage-reach-list" data-unit={criterion.unit} data-inside={inside.length} data-outside={outside.length}>
      <p className="mb-1.5 text-micro font-semibold text-content-muted" data-testid="coverage-reach-inside-title">
        {t('coverage.reachInside', { count: inside.length })}
      </p>
      {inside.length === 0 ? (
        <p className="muted text-caption">{t('coverage.reachInsideNone')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5" data-testid="coverage-reach-inside">
          {inside.map(row)}
        </ul>
      )}
      {outside.length > 0 && (
        <details className="mt-3" data-testid="coverage-reach-outside">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-field px-1 text-caption font-semibold text-content-secondary hover:bg-surface-high" data-testid="coverage-reach-outside-title">
            <Icon name="chevronDown" size={15} />
            {t('coverage.reachOutside', { count: outside.length })}
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1.5 opacity-80">{outside.map(row)}</ul>
        </details>
      )}
    </div>
  )
}

/**
 * ★★ AW1.3 · AW1.4 — CE QUE FAIT LE CALCUL, DIT À L'ÉCRAN : la progression la
 * première fois, puis le bilan du maillage — combien de paires le vol
 * d'oiseau laissait passer, combien la route garde, combien elle écarte.
 */
function MeshStatus({
  progress,
  mesh,
  limitText,
  onRetry,
  resetText,
  onReset,
  farmsShown,
  compact = false,
}: {
  /** ★★ BG 7 — le bandeau replié : une ligne de progression pendant le calcul, rien après. */
  compact?: boolean
  progress: ReturnType<typeof useRoadMesh>['progress']
  mesh: { airPairs: number; roadPairs: number; dropped: number; pending: number; noRoad: number; blocked: number; fastestBeyond: number }
  limitText: string
  onRetry: () => void
  resetText: string
  onReset: () => void
  farmsShown: number
}) {
  const { t } = useTranslation()
  const running = progress.running && progress.total > 0
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  if (compact) {
    const busy = !progress.unavailable && (running || mesh.pending > 0)
    return (
      <div
        className={busy ? 'mt-2 px-1' : ''}
        data-testid="coverage-mesh"
        data-compact="true"
        data-running={running ? 'true' : 'false'}
        data-air={mesh.airPairs}
        data-road={mesh.roadPairs}
        data-dropped={mesh.dropped}
        data-pending={mesh.pending}
        data-blocked={mesh.blocked}
        data-beyond={mesh.fastestBeyond}
        data-last-ms={progress.lastMs ?? ''}
      >
        {busy && (
          <>
            <div className="h-1.5 overflow-hidden rounded-pill bg-surface-high" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full rounded-pill bg-status-violet transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="ltr-nums mt-0.5 text-micro text-content-muted">
              {progress.phase === 'tiles' ? t('coverage.mesh.loadingRoads') : t('coverage.mesh.progress', { done: progress.done, total: progress.total })}
            </p>
          </>
        )}
      </div>
    )
  }
  return (
    <div
      className="mt-3 rounded-card bg-surface-raised p-3 shadow-card"
      data-testid="coverage-mesh"
      data-running={running ? 'true' : 'false'}
      data-air={mesh.airPairs}
      data-road={mesh.roadPairs}
      data-dropped={mesh.dropped}
      data-pending={mesh.pending}
      data-blocked={mesh.blocked}
      data-beyond={mesh.fastestBeyond}
      data-last-ms={progress.lastMs ?? ''}
    >
      <p className="flex items-center gap-2 text-caption font-bold text-content-secondary">
        <Icon name="route" size={16} />
        {t('coverage.mesh.title')}
      </p>
      {progress.unavailable ? (
        <div className="mt-1.5" data-testid="coverage-mesh-unavailable">
          <p className="text-caption font-semibold text-status-warn-ink">{t('coverage.mesh.unavailable')}</p>
          <button type="button" className="btn-secondary mt-2 min-h-11" onClick={onRetry}>
            {t('coverage.mesh.retry')}
          </button>
        </div>
      ) : running || mesh.pending > 0 ? (
        <div className="mt-1.5" data-testid="coverage-mesh-progress">
          <div className="h-2 overflow-hidden rounded-pill bg-surface-high" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-pill bg-status-violet transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="ltr-nums mt-1 text-caption text-content-secondary">
            {progress.phase === 'tiles' ? t('coverage.mesh.loadingRoads') : t('coverage.mesh.progress', { done: progress.done, total: progress.total })}
          </p>
          <p className="muted text-micro">{t('coverage.mesh.provisional')}</p>
        </div>
      ) : (
        <p className="ltr-nums mt-1 text-caption text-content-primary" data-testid="coverage-mesh-summary">
          {t('coverage.mesh.summaryLimit', { road: mesh.roadPairs, air: mesh.airPairs, dropped: mesh.dropped, limit: limitText })}
        </p>
      )}
      {/* ★★ AY1.2 — « le maillage a disparu » : chez le PO, la borne valait
          3 minutes (le pavé ne laissait pas vider le champ : « 35 » effacé
          s'arrêtait à « 3 »). Aucun lien ne tient alors, et rien ne le disait.
          Une borne qui écarte TOUT se dit, et se rétablit d'un toucher. */}
      {!running && mesh.pending === 0 && !progress.unavailable && mesh.roadPairs === 0 && farmsShown > 0 && (
        <div className="mt-2 rounded-field border border-status-warn/40 bg-status-warn/10 p-2.5" data-testid="coverage-mesh-empty">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-status-warn-ink">
            <Icon name="alert" size={14} />
            {t('coverage.mesh.empty', { limit: limitText })}
          </p>
          <button type="button" className="btn-secondary mt-2 min-h-11" onClick={onReset} data-testid="coverage-mesh-reset">
            {t('coverage.mesh.reset', { limit: resetText })}
          </button>
        </div>
      )}
      {mesh.blocked > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-caption font-semibold text-status-danger-ink" data-testid="coverage-mesh-blocked">
          <Icon name="alert" size={14} />
          {t('coverage.mesh.blocked', { count: mesh.blocked })}
        </p>
      )}
      {mesh.fastestBeyond > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-caption text-status-warn-ink" data-testid="coverage-mesh-beyond">
          <Icon name="alert" size={14} />
          {t('coverage.mesh.beyond', { count: mesh.fastestBeyond })}
        </p>
      )}
      {mesh.noRoad > 0 && <p className="muted mt-1 text-micro">{t('coverage.mesh.noRoad', { count: mesh.noRoad })}</p>}
    </div>
  )
}


