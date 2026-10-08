import { farmPoint, haversineKm } from './geo'
import { isInstitutionEngaged, isInstitutionProspect } from './institutions'
import type { Institution } from './institutions'
import type { Farm, FarmStatus, LatLng, Lead } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AU4 (2026-10-08) — LA CARTE DE COUVERTURE : LE CALCUL, SANS ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cinq familles, deux côtés :
 *   terres        · `signed`   — le parc (נחתם, פעיל)
 *                 · `pipeline` — démarchées, pas encore engagées
 *                 · `leads`    — les pistes de la salle d'attente qui ont un lieu
 *   institutions  · `engaged`  — חתום
 *                 · `prospect` — טרם נוצר קשר · נוצר קשר · מעוניין
 *
 * ⛔ CE MODULE NE COMPTE NI DOUNAMS NI OBJECTIF. Il compte des LIEUX atteints,
 *    et les pistes n'entrent dans AUCUN de ses compteurs de fermes (AS6.8,
 *    AU4.7) : elles sont des points de contexte, comptées à part.
 *
 * ★ LA DISTANCE. Un lien existe si la ferme est à `radiusKm` ou moins de
 *   l'institution. La distance retenue est celle de la ROUTE quand elle est
 *   connue (`roadKm`), sinon le vol d'oiseau, et chaque lien dit laquelle.
 *   La route étant toujours plus longue que le vol d'oiseau, le filtre à vol
 *   d'oiseau ne manque JAMAIS une ferme : il en garde au plus quelques-unes de
 *   trop, que la route retire dès qu'elle est mesurée.
 */

export type CoverageFamily = 'signed' | 'pipeline' | 'leads' | 'engaged' | 'prospect'
export const COVERAGE_FAMILIES: readonly CoverageFamily[] = ['signed', 'pipeline', 'leads', 'engaged', 'prospect'] as const

/** Le parc. */
export const PARK_STATUSES: readonly FarmStatus[] = ['signed', 'active']
/** Démarchées, pas encore engagées. */
export const PIPELINE_STATUSES: readonly FarmStatus[] = ['incoming_request', 'to_contact', 'contacted', 'visited', 'verbal_ok']

export const DEFAULT_RADIUS_KM = 35
export const RADIUS_MIN_KM = 5
export const RADIUS_MAX_KM = 80

export type Visible = Record<CoverageFamily, boolean>

export interface CoveragePlace {
  id: string
  name: string
  position: LatLng
  family: CoverageFamily
}

export interface CoverageLink {
  institutionId: string
  farmId: string
  /** Réelle (institution engagée) ou possible (à démarcher). */
  tone: 'real' | 'potential'
  km: number
  measured: 'road' | 'air'
  from: LatLng
  to: LatLng
}

export interface CoverageCounts {
  /** Fermes affichées (parc et/ou en cours), JAMAIS les pistes. */
  farms: number
  /** Atteintes par au moins une institution ENGAGÉE. */
  covered: number
  /** Atteintes par personne d'engagé. */
  uncovered: number
  /** Parmi les non couvertes, celles qu'atteindrait une institution à démarcher. */
  potential: number
  /** Atteintes par personne, même en comptant les institutions à démarcher. */
  unreachable: number
}

export interface CoverageResult {
  places: CoveragePlace[]
  links: CoverageLink[]
  counts: CoverageCounts
  /** Par ferme : ce qui l'atteint (pour les filtres et la fiche). */
  reach: Map<string, { real: number; potential: number }>
  /** Pistes avec lieu, affichées ; et sans lieu, hors carte (le compte est DIT). */
  leadsPlaced: number
  leadsUnplaced: number
  institutionsUnplaced: number
  institutionsNotRelevant: number
  /** Liens dont l'institution a un point à vérifier (AU3.4). */
  uncertainLinks: number
  /** Liens dont la distance est celle de la route. */
  roadLinks: number
}

export interface CoverageInput {
  farms: readonly Farm[]
  leads: readonly Lead[]
  institutions: readonly Institution[]
  radiusKm: number
  visible: Visible
  /** La distance sur route connue entre une institution et une ferme, en km. */
  roadKm?: (institutionId: string, farmId: string) => number | undefined
}

export function farmFamily(status: FarmStatus): 'signed' | 'pipeline' | null {
  if (PARK_STATUSES.includes(status)) return 'signed'
  if (PIPELINE_STATUSES.includes(status)) return 'pipeline'
  return null
}

/** Une piste qui reste « à démarcher » (ni refusée, ni devenue ferme). */
export function isLeadOpen(l: Lead): boolean {
  return !l.convertedFarmId && l.status !== 'not_now' && l.status !== 'not_interested'
}

export function computeCoverage(input: CoverageInput): CoverageResult {
  const { visible, radiusKm } = input
  const places: CoveragePlace[] = []
  const farmPlaces: CoveragePlace[] = []
  for (const f of input.farms) {
    const family = farmFamily(f.status)
    const p = farmPoint(f)
    if (!family || !p) continue
    const place = { id: f.id, name: f.name, position: p, family }
    if (visible[family]) {
      places.push(place)
      farmPlaces.push(place)
    }
  }

  let leadsPlaced = 0
  let leadsUnplaced = 0
  for (const l of input.leads) {
    if (!isLeadOpen(l)) continue
    if (!l.position) {
      leadsUnplaced++
      continue
    }
    leadsPlaced++
    if (visible.leads) places.push({ id: l.id, name: l.name, position: l.position, family: 'leads' })
  }

  let institutionsUnplaced = 0
  let institutionsNotRelevant = 0
  const institutions: Array<{ i: Institution; family: 'engaged' | 'prospect'; position: LatLng }> = []
  for (const i of input.institutions) {
    if (i.engagement === 'not_relevant') {
      institutionsNotRelevant++
      continue
    }
    const family = isInstitutionEngaged(i) ? 'engaged' : isInstitutionProspect(i) ? 'prospect' : null
    if (!family) continue
    if (!i.position) {
      institutionsUnplaced++
      continue
    }
    institutions.push({ i, family, position: i.position })
    if (visible[family]) places.push({ id: i.id, name: i.name, position: i.position, family })
  }

  // Les liens et la portée : calculés sur TOUTES les institutions placées,
  // pour que « potentiel » ne dépende pas de ce qui est affiché ; seuls les
  // liens des familles visibles sont rendus.
  const reach = new Map<string, { real: number; potential: number }>()
  for (const f of farmPlaces) reach.set(f.id, { real: 0, potential: 0 })
  const links: CoverageLink[] = []
  let uncertainLinks = 0
  let roadLinks = 0
  for (const { i, family, position } of institutions) {
    for (const f of farmPlaces) {
      const air = haversineKm(position, f.position)
      if (air > radiusKm) continue
      const road = input.roadKm?.(i.id, f.id)
      const km = road ?? air
      if (km > radiusKm) continue
      const r = reach.get(f.id)!
      if (family === 'engaged') r.real++
      else r.potential++
      if (!visible[family]) continue
      links.push({
        institutionId: i.id,
        farmId: f.id,
        tone: family === 'engaged' ? 'real' : 'potential',
        km,
        measured: road === undefined ? 'air' : 'road',
        from: position,
        to: f.position,
      })
      if (i.positionUncertain) uncertainLinks++
      if (road !== undefined) roadLinks++
    }
  }

  let covered = 0
  let potential = 0
  let unreachable = 0
  for (const r of reach.values()) {
    if (r.real > 0) covered++
    else if (r.potential > 0) potential++
    else unreachable++
  }
  return {
    places,
    links,
    counts: { farms: farmPlaces.length, covered, uncovered: farmPlaces.length - covered, potential, unreachable },
    reach,
    leadsPlaced,
    leadsUnplaced,
    institutionsUnplaced,
    institutionsNotRelevant,
    uncertainLinks,
    roadLinks,
  }
}

/** Les deux usages de terrain, en un geste chacun (AU4.3). */
export const COVERAGE_PRESETS: Record<'meeting' | 'prepare', Visible> = {
  // EN RENDEZ-VOUS : le parc réel et les institutions déjà engagées, nommées.
  meeting: { signed: true, pipeline: false, leads: false, engaged: true, prospect: false },
  // EN PRÉPARATION : tout, pistes comprises.
  prepare: { signed: true, pipeline: true, leads: true, engaged: true, prospect: true },
}
