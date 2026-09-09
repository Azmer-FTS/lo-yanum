import { HOME_BASE, haversineKm } from './geo'
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
 * PURE : ni DOM, ni React, ni stockage.
 */

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

export interface FreeLeg {
  stop: FreeStop
  /** 1 pour la première étape. */
  order: number
  legKm: number
  driveMinutes: number
  /** `HH:MM` local. */
  arriveAt: string
  leaveAt: string
  visitMinutes: number
}

export interface FreeRoutePlan {
  legs: FreeLeg[]
  totalKm: number
  returnKm: number
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
export function planFreeRoute(route: FreeRoute): FreeRoutePlan {
  const start = parseClock(route.departAt) ?? 8 * 60
  const legs: FreeLeg[] = []
  let current = route.origin
  let clock = start
  let totalKm = 0

  route.stops.forEach((stop, i) => {
    const legKm = haversineKm(current, stop.position)
    const driveMinutes = estimateDriveMinutes(legKm)
    totalKm += legKm
    clock += driveMinutes
    const arriveAt = formatClock(clock)
    const visitMinutes = stop.visitMinutes ?? route.defaultVisitMinutes
    clock += visitMinutes
    legs.push({
      stop,
      order: i + 1,
      legKm,
      driveMinutes,
      arriveAt,
      leaveAt: formatClock(clock),
      visitMinutes,
    })
    current = stop.position
  })

  const returnKm = route.stops.length === 0 ? 0 : haversineKm(current, route.origin)
  clock += estimateDriveMinutes(returnKm)

  return {
    legs,
    totalKm,
    returnKm,
    roundTripKm: totalKm + returnKm,
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
