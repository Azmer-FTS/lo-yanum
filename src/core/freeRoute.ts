import { HOME_BASE, haversineKm } from './geo'
import { OFF_NETWORK_METERS } from './roadGraph'
import type { RoadLeg } from './roadGraph'
import { estimateDriveMinutes } from './routing'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH9 (2026-09-09) — L'ITINÉRAIRE LIBRE. DEMANDÉ DEPUIS PLUSIEURS PASSES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO appelle des agriculteurs, chacun lui envoie sa localisation par
 *     WhatsApp, et il doit bâtir sa tournée du lendemain. CES FERMES NE SONT
 *     PAS DANS LA BASE. »
 *
 * ★★ ET C'EST LA PHRASE QUI EXPLIQUE POURQUOI CE MODULE EXISTE À CÔTÉ DE
 *    `routing.ts` ET NON DEDANS. `planRoute` prend des `Farm[]` : chaque étape
 *    y est une FICHE, avec un id, un statut, une file de prospection. Ici une
 *    étape est un POINT et un nom, parce que c'est tout ce qu'un lien WhatsApp
 *    donne, et exiger une fiche avant de pouvoir tracer la tournée inverserait
 *    l'ordre du travail réel : on trace d'abord, on crée les fiches ensuite —
 *    ce qui est exactement ce que la conversion d'AH9.5 fait.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⛔ AH9.7 — AUCUN SERVICE EXTERNE N'EST APPELÉ, ET C'EST DIT PLUTÔT QUE
 *    SUPPOSÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Si le calcul de trajet demande un service externe, dis lequel, ce qu'il
 *     coûte et ce qu'il envoie. Ne l'intègre pas en silence. »
 *
 * IL N'Y EN A PAS. Les distances sont des ORTHODROMIES (`haversineKm`) et les
 * durées viennent d'`estimateDriveMinutes`, qui applique au kilométrage à vol
 * d'oiseau un facteur de route de 1,35 sur une moyenne de 72 km/h — la règle
 * établie en Lot 0.7 et mesurée sur les routes du Néguev. Rien ne quitte
 * l'appareil : ni les points collés, ni les numéros, ni l'ordre des visites.
 *
 * ★ CE QUE ÇA COÛTE, DIT FRANCHEMENT : sur une route droite du Néguev
 *   l'estimation est bonne à quelques minutes ; autour d'un wadi ou d'un
 *   barrage militaire elle sous-estime, parfois beaucoup. C'est une AIDE À LA
 *   TOURNÉE, pas une promesse faite à un agriculteur — et c'est pourquoi le
 *   message envoyé (AH9.5) dit une heure APPROXIMATIVE.
 *
 * ★ CE QU'IL FAUDRAIT POUR FAIRE MIEUX, pour que le PO tranche s'il le veut un
 *   jour : une matrice de trajets (Google Distance Matrix, Mapbox Matrix, ou
 *   OSRM auto-hébergé). Les deux premiers sont payants à la requête et
 *   ENVOIENT les coordonnées de chaque agriculteur à un tiers — ce qui, pour
 *   des exploitations dont on cartographie les zones de menace, est une
 *   décision et non un détail technique. OSRM auto-hébergé n'envoie rien mais
 *   demande un serveur. Aucun des trois n'est branché.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI1 → AI3 (2026-09-14) — ET LE VOL D'OISEAU N'EST PLUS QUE LE REPLI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO l'a jugé « utilisable mais trop approximatif : autour d'un wadi,
 * l'écart réel atteint 30 à 40 % ». Le tracé suit désormais les routes de la
 * carte, sur l'appareil (`roadGraph.ts`), et `planFreeRoute` prend ses
 * distances et ses durées dans ce tracé quand il existe. Le calcul ci-dessus
 * reste — c'est ce qui s'affiche pendant les quelques centaines de
 * millisecondes du premier calcul, et quand aucun chemin n'existe (AI2.6).
 * Chaque étape dit laquelle des deux elle porte (`mode`).
 *
 * ★★ AI3.2 — LA MARGE. Une durée de roulage calculée est une durée SANS
 *    tracteur, sans feu rouge et sans portail fermé. La marge (réglage
 *    « מרווח ביטחון », 15 % au départ — voir `ROUTE_MARGIN_INITIAL`)
 *    s'applique aux durées de ROULAGE, jamais au temps passé sur place : le PO
 *    sait combien de temps il reste chez un agriculteur, il ne sait pas ce
 *    que fera la route.
 *
 * PURE : ni DOM, ni React, ni stockage.
 */

/**
 * ★ AI3.2 — 15 %, ET POURQUOI. Les vitesses de `roadGraph.ts` sont des
 *   moyennes de roulage en circulation fluide. Sur les trajets de quinze à
 *   quarante minutes d'une tournée de la zone Adoulam–Lakhish, les pertes
 *   qu'elles ne voient pas — une traversée de moshav, un tracteur sur la 353,
 *   un portail à ouvrir, un demi-tour — font quelques minutes par trajet :
 *   15 % d'un trajet de 25 minutes, c'est quatre minutes. Au-delà, l'heure
 *   annoncée devient une heure où le PO attend dans sa voiture ; en deçà,
 *   une heure qu'il ne tient pas. Réglable de 0 à 100 %.
 */
export const ROUTE_MARGIN_INITIAL = 15

export interface FreeStop {
  id: string
  /** Ce que le PO tape, ou « עצירה 3 » à défaut. */
  label: string
  position: LatLng
  /** Le portable de l'agriculteur, pour AH9.5. Facultatif. */
  phone: string
  /** Minutes sur place ; `null` = la durée par défaut de l'itinéraire. */
  visitMinutes: number | null
}

export interface FreeRoute {
  id: string
  name: string
  /** `YYYY-MM-DD` quand l'itinéraire est daté ; `null` tant qu'il ne l'est pas. */
  dayKey: string | null
  origin: LatLng
  originLabel: string
  /** Heure de départ locale, `HH:MM`. */
  departAt: string
  defaultVisitMinutes: number
  stops: FreeStop[]
  /** ISO du dernier enregistrement — pour trier la liste des itinéraires. */
  updatedAt: string
}

/** Jérusalem par défaut (AH9.2) : c'est `HOME_BASE`, la même que partout. */
export const FREE_ROUTE_ORIGIN: LatLng = HOME_BASE
export const DEFAULT_VISIT_MINUTES = 30

export type FreeLegMode = 'road' | 'straight' | 'pending'

export interface FreeLeg {
  stop: FreeStop
  /** 1 pour la première étape. */
  order: number
  /** Distance ROULÉE : sur route quand `mode === 'road'`, estimée sinon. */
  legKm: number
  /** À vol d'oiseau, toujours — AI3.4 veut les deux. */
  airKm: number
  /** Durée de roulage, marge COMPRISE. */
  driveMinutes: number
  /**
   * `road` : tracé sur route. `straight` : aucun chemin, repli à vol d'oiseau
   * (AI2.6). `pending` : le tracé n'est pas encore calculé.
   */
  mode: FreeLegMode
  /** Mètres hors réseau au bout de cette étape (du point de route à l'étape). */
  offNetworkMeters: number
  /** `HH:MM` local. */
  arriveAt: string
  leaveAt: string
  visitMinutes: number
}

export interface FreeRoutePlan {
  legs: FreeLeg[]
  totalKm: number
  returnKm: number
  returnMode: FreeLegMode
  /** À vol d'oiseau, aller et retour — pour AI3.4. */
  airRoundTripKm: number
  roundTripKm: number
  /** L'heure de retour au point de départ. */
  returnAt: string
  /** Durée totale de la journée, en minutes. */
  totalMinutes: number
}

// ---------------------------------------------------------------------------
// L'horloge de la journée
// ---------------------------------------------------------------------------

/**
 * ⚠️ LES HEURES SONT DES MINUTES DEPUIS MINUIT, PAS DES `Date`.
 *
 * Un itinéraire est un plan pour UNE journée, saisi « 08:30 », lu « 08:30 ».
 * Le faire transiter par un instant obligerait à choisir un jour, un fuseau et
 * un passage à l'heure d'été pour une information qui n'en dépend d'aucune —
 * et c'est ainsi qu'on affiche 09:30 à quelqu'un qui a tapé 08:30.
 */
export function parseClock(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

export function formatClock(minutes: number): string {
  /* Au-delà de minuit on continue de compter — une tournée qui finit à 01:10
     le dit plutôt que de repartir à 01:10 « du matin même ». */
  const m = ((minutes % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Le trajet
// ---------------------------------------------------------------------------

/**
 * Le trajet dans l'ORDRE OÙ LES ÉTAPES SONT, jamais réordonné en silence.
 *
 * ★★ C'EST LA DÉCISION DU BLOC. « Réordonnancement par glisser-déposer, ET une
 *    proposition d'ordre le plus court que le PO peut ACCEPTER OU IGNORER. »
 *    Une fonction qui optimiserait ici rendrait la proposition obligatoire et
 *    le glisser-déposer décoratif : le PO connaît des raisons que la distance
 *    ignore — un agriculteur qui n'est là qu'après la traite, une route
 *    fermée. `shortestOrder` est offerte à côté, et c'est lui qui l'applique.
 */
export interface FreeRouteOptions {
  /**
   * Les étapes calculées sur route : une par trajet, départ → étape 1 → … →
   * retour, donc `stops.length + 1`. `null` pour un trajet sans chemin ;
   * absent tant que rien n'est calculé.
   */
  roadLegs?: ReadonlyArray<RoadLeg | null> | null
  /** AI3.2 — pourcentage ajouté aux durées de roulage. */
  marginPercent?: number
}

export function planFreeRoute(route: FreeRoute, options: FreeRouteOptions = {}): FreeRoutePlan {
  const start = parseClock(route.departAt) ?? 8 * 60
  const margin = 1 + Math.max(0, options.marginPercent ?? 0) / 100
  const road = options.roadLegs ?? null
  const legs: FreeLeg[] = []
  let current = route.origin
  let clock = start
  let totalKm = 0
  let airTotal = 0

  const measure = (from: LatLng, to: LatLng, index: number) => {
    const airKm = haversineKm(from, to)
    const computed = road ? road[index] : undefined
    if (computed) {
      /* ★ AI2.5 — LE HORS-RÉSEAU COMPTÉ À L'ARRIVÉE. Le premier bout pendant
         d'une étape est le départ de la précédente ; seul le dernier dit
         « cette ferme est au bout d'un chemin que la carte ignore ». */
      const last = computed.gaps.length > 0 ? computed.gaps[computed.gaps.length - 1] : null
      const arrivalGap =
        last && last[1].lat === to.lat && last[1].lng === to.lng
          ? haversineKm(last[0], last[1]) * 1000
          : 0
      return {
        airKm,
        km: computed.meters / 1000,
        raw: computed.seconds / 60,
        mode: 'road' as const,
        offNetworkMeters: arrivalGap >= OFF_NETWORK_METERS ? arrivalGap : 0,
      }
    }
    return {
      airKm,
      km: airKm,
      raw: estimateDriveMinutes(airKm),
      mode: (road ? 'straight' : 'pending') as FreeLegMode,
      offNetworkMeters: 0,
    }
  }

  route.stops.forEach((stop, i) => {
    const m = measure(current, stop.position, i)
    const driveMinutes = Math.round(m.raw * margin)
    totalKm += m.km
    airTotal += m.airKm
    clock += driveMinutes
    const arriveAt = formatClock(clock)
    const visitMinutes = stop.visitMinutes ?? route.defaultVisitMinutes
    clock += visitMinutes
    legs.push({
      stop,
      order: i + 1,
      legKm: m.km,
      airKm: m.airKm,
      driveMinutes,
      mode: m.mode,
      offNetworkMeters: m.offNetworkMeters,
      arriveAt,
      leaveAt: formatClock(clock),
      visitMinutes,
    })
    current = stop.position
  })

  let returnKm = 0
  let returnMode: FreeLegMode = road ? 'straight' : 'pending'
  if (route.stops.length > 0) {
    const back = measure(current, route.origin, route.stops.length)
    returnKm = back.km
    returnMode = back.mode
    airTotal += back.airKm
    clock += Math.round(back.raw * margin)
  }

  return {
    legs,
    totalKm,
    returnKm,
    returnMode,
    roundTripKm: totalKm + returnKm,
    airRoundTripKm: airTotal,
    returnAt: formatClock(clock),
    totalMinutes: clock - start,
  }
}

/**
 * L'ordre le plus court, au sens du plus proche voisin. Glouton et
 * DÉTERMINISTE : la même liste rend le même ordre, ce qui est ce qui permet au
 * PO de comparer sa proposition à la sienne plutôt que de la subir.
 *
 * ⚠️ CE N'EST PAS L'OPTIMUM et on ne le prétend pas. Sur trois à huit étapes
 *    d'une journée de terrain, l'écart au meilleur ordre est de quelques
 *    kilomètres ; le calcul exact est factoriel, et une tournée qui met dix
 *    secondes à s'afficher est une tournée qu'on ne refait pas.
 */
export function shortestOrder(stops: readonly FreeStop[], origin: LatLng): FreeStop[] {
  const remaining = [...stops]
  const out: FreeStop[] = []
  let current = origin
  while (remaining.length > 0) {
    let best = 0
    let bestKm = haversineKm(current, remaining[0].position)
    for (let i = 1; i < remaining.length; i++) {
      const km = haversineKm(current, remaining[i].position)
      if (km < bestKm) {
        bestKm = km
        best = i
      }
    }
    const [stop] = remaining.splice(best, 1)
    out.push(stop)
    current = stop.position
  }
  return out
}

/** Le kilométrage total d'un ordre donné, pour dire ce que la proposition gagne. */
export function routeKm(stops: readonly FreeStop[], origin: LatLng): number {
  let current = origin
  let total = 0
  for (const s of stops) {
    total += haversineKm(current, s.position)
    current = s.position
  }
  return total + (stops.length === 0 ? 0 : haversineKm(current, origin))
}

/** Déplacer une étape. `to` est l'index VOULU dans la liste résultante. */
export function moveStop(stops: readonly FreeStop[], from: number, to: number): FreeStop[] {
  if (from === to || from < 0 || from >= stops.length) return [...stops]
  const next = [...stops]
  const [moved] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved)
  return next
}

// ---------------------------------------------------------------------------
// AH9.5 — le message
// ---------------------------------------------------------------------------

/**
 * ★★ « C'EST CE QUE LE PO ANNONCE PAR TÉLÉPHONE À CHAQUE AGRICULTEUR », donc
 *    c'est un GABARIT et non une phrase en dur — même règle qu'AE4 pour le SMS
 *    de garde et qu'AH5 pour le document.
 *
 * ⚠️ ET IL DIT « בסביבות », APPROXIMATIVEMENT. L'heure vient d'une estimation
 *    à vol d'oiseau corrigée d'un facteur (voir l'en-tête) ; l'annoncer comme
 *    une heure ferme serait promettre à un agriculteur qui attend dehors ce
 *    que le calcul ne sait pas tenir.
 */
export function renderArrivalMessage(
  template: string,
  values: { name: string; time: string; coordinator: string },
): string {
  return template
    .replace(/\{\{name\}\}/g, values.name)
    .replace(/\{\{time\}\}/g, values.time)
    .replace(/\{\{coordinator\}\}/g, values.coordinator)
}

export function newFreeRouteId(): string {
  return `route-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

export function newFreeStopId(): string {
  return `stop-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}
