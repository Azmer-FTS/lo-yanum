import { farmPoint, haversineKm } from './geo'
import { isInstitutionEngaged, isInstitutionProspect } from './institutions'
import type { Institution } from './institutions'
import type { BorderKind } from './borders'
import type { PairRoad } from './roadMesh'
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
 * ★★ LA DISTANCE — AW1 (2026-10-09), QUI REMPLACE AU4.6. Un lien existe si
 *   la ROUTE tient dans `radiusKm`, et seulement alors. Le vol d'oiseau ne
 *   sert qu'à écarter sans calcul ce qui est de toute façon hors de portée
 *   (une route n'est jamais plus courte) ; une paire que le vol d'oiseau
 *   laisse passer et dont la route n'est PAS ENCORE mesurée n'est pas un
 *   lien : elle est comptée « en cours », jamais dessinée, jamais comptée.
 *   ⛔ Aucun repli au vol d'oiseau : c'est lui qui reliait tout à tout.
 *
 * ★ LA LIGNE VERTE (AW1.6). Un lien dont la seule route franchit la Ligne
 *   verte ou une frontière est `blocked` : dessiné à part, compté dans
 *   AUCUNE couverture. Un lien dont le plus RAPIDE la franchit mais qui a un
 *   trajet par Israël porte ce trajet, et le dit (`fastestBeyond`).
 */

export type CoverageFamily = 'signed' | 'pipeline' | 'leads' | 'engaged' | 'prospect'
export const COVERAGE_FAMILIES: readonly CoverageFamily[] = ['signed', 'pipeline', 'leads', 'engaged', 'prospect'] as const

/** Le parc. */
export const PARK_STATUSES: readonly FarmStatus[] = ['signed', 'active']
/** Démarchées, pas encore engagées. */
export const PIPELINE_STATUSES: readonly FarmStatus[] = ['incoming_request', 'to_contact', 'contacted', 'visited', 'verbal_ok']

export const DEFAULT_RADIUS_KM = 35
export const RADIUS_MIN_KM = 5
/**
 * ★ AW1.7 — la fin de la RÉGLETTE, pas une limite : le champ chiffré à côté
 *   accepte n'importe quel rayon (`clampRadiusKm`), sans plafond.
 */
export const RADIUS_MAX_KM = 150

/** Un rayon saisi : entier, au moins 1 km, AUCUN plafond (AW1.7). */
export function clampRadiusKm(km: number): number {
  if (!Number.isFinite(km)) return DEFAULT_RADIUS_KM
  return Math.max(1, Math.round(km))
}

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
  /** Kilomètres PAR LA ROUTE (le trajet par Israël quand il existe). */
  km: number
  /** Durée de roulage estimée, en secondes, sans marge. */
  seconds: number
  /** La seule route franchit la Ligne verte / une frontière : non comptée. */
  blocked: BorderKind | null
  /** Le plus rapide passe au-delà ; `km` est alors celui du trajet par Israël. */
  fastestBeyond: null | { line: BorderKind; km: number; seconds: number }
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
  /** AW1 — le maillage : ce que la route a fait du filtre à vol d'oiseau. */
  mesh: {
    /** Paires que le vol d'oiseau laisse dans le rayon (toutes familles). */
    airPairs: number
    /** Dont la route tient dans le rayon : les liens (comptés ou bloqués). */
    roadPairs: number
    /** Écartées : la route dépasse le rayon. */
    dropped: number
    /** Pas encore mesurées. */
    pending: number
    /** Sans aucun chemin sur le réseau. */
    noRoad: number
    /** La seule route passe au-delà d'une ligne. */
    blocked: number
    /** Le plus rapide passe au-delà, un trajet par Israël existe. */
    fastestBeyond: number
  }
}

export interface CoverageInput {
  farms: readonly Farm[]
  leads: readonly Lead[]
  institutions: readonly Institution[]
  radiusKm: number
  visible: Visible
  /** La route mesurée entre une institution et une ferme ; `undefined` = pas encore. */
  road?: (institution: LatLng, farm: LatLng) => PairRoad | undefined
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
  const mesh = { airPairs: 0, roadPairs: 0, dropped: 0, pending: 0, noRoad: 0, blocked: 0, fastestBeyond: 0 }
  for (const { i, family, position } of institutions) {
    for (const f of farmPlaces) {
      // Le filtre EXACT : une route n'est jamais plus courte que le vol d'oiseau.
      if (haversineKm(position, f.position) > radiusKm) continue
      mesh.airPairs++
      const road = input.road?.(position, f.position)
      if (road === undefined) {
        mesh.pending++
        continue
      }
      if (road.kind === 'none') {
        mesh.noRoad++
        continue
      }
      if (road.km > radiusKm) {
        mesh.dropped++
        continue
      }
      mesh.roadPairs++
      const blocked = road.kind === 'beyondOnly' ? road.line : null
      const fastestBeyond = road.kind === 'road' ? road.fastestBeyond : null
      if (blocked) mesh.blocked++
      if (fastestBeyond) mesh.fastestBeyond++
      if (!blocked) {
        const r = reach.get(f.id)!
        if (family === 'engaged') r.real++
        else r.potential++
      }
      if (!visible[family]) continue
      links.push({
        institutionId: i.id,
        farmId: f.id,
        tone: family === 'engaged' ? 'real' : 'potential',
        km: road.km,
        seconds: road.seconds,
        blocked,
        fastestBeyond,
        from: position,
        to: f.position,
      })
      if (i.positionUncertain) uncertainLinks++
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
    mesh,
  }
}

/** Les deux usages de terrain, en un geste chacun (AU4.3). */
export const COVERAGE_PRESETS: Record<'meeting' | 'prepare', Visible> = {
  // EN RENDEZ-VOUS : le parc réel et les institutions déjà engagées, nommées.
  meeting: { signed: true, pipeline: false, leads: false, engaged: true, prospect: false },
  // EN PRÉPARATION : tout, pistes comprises.
  prepare: { signed: true, pipeline: true, leads: true, engaged: true, prospect: true },
}
