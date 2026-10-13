import { addDays, fromDayKey, iso, MINUTE } from './clock'
import { buildDayPlan, freeStopAsFarm, TOUR_STOP_MINUTES } from './tours'
import type { Tour } from './tours'
import type { AgendaEvent, AgendaLink, Farm, GeneralMeeting } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BE (2026-10-13) — LA RÈGLE 0 : TOUT CE QUI EST DATÉ EST DANS L'AGENDA.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « tout ce qui a un rapport avec une date et une heure avec un événement,
 *     il faut que ce soit dans mon agenda, je veux que ce soit automatisé,
 *     sinon je vais devoir faire copier-coller, quel est l'intérêt »
 *
 * ★ RIEN N'EST RECOPIÉ, JAMAIS. Un reflet n'est pas une ligne de plus en base :
 *   il est CALCULÉ, à chaque lecture, depuis sa source. Une seule donnée, deux
 *   endroits où la voir — donc l'itinéraire qui change d'heure déplace son
 *   reflet, et l'itinéraire supprimé emporte le sien, sans qu'aucun code n'ait
 *   à « synchroniser » quoi que ce soit. `bun run bepass` le vérifie.
 *
 * Ce module construit le reflet d'un ITINÉRAIRE. Celui d'une GARDE est fait par
 * `getAgendaEvents` (il y était depuis D4, il porte désormais `reflection`).
 *
 * PUR : aucun React, aucun DOM.
 */

/**
 * Le reflet d'un itinéraire : de son départ à son retour (l'horaire du
 * planificateur, estimé au vol d'oiseau quand la route n'est pas mesurée —
 * `buildDayPlan` sans `legOf`), son nom, ses étapes dans l'ordre et leur
 * heure. Un itinéraire sans étape occupe `TOUR_STOP_MINUTES` à partir de son
 * départ : il existe, il a une heure, il est dans l'agenda.
 *
 * `dayEvents` : les rendez-vous du jour (pas les reflets), qui sont les heures
 * fixes autour desquelles le planificateur calcule.
 */
export function tourReflection(tour: Tour, farms: readonly Farm[], dayEvents: readonly AgendaEvent[]): AgendaEvent {
  const free = (tour.freeStops ?? []).map(freeStopAsFarm)
  const pool = [...farms, ...free]
  const known = new Set(pool.map((f) => f.id))
  /* L'ordre du PO s'il l'a posé à la main (fermes ET points libres), sinon
     celui de l'enregistrement. */
  const order = (tour.plan?.order ?? [...tour.farmIds, ...free.map((f) => f.id)]).filter((id) => known.has(id))
  const plan = buildDayPlan({
    dayKey: tour.dayKey,
    tour: { ...tour, farmIds: order },
    farms: pool,
    events: dayEvents.filter((e) => !e.reflection),
    ...(tour.plan?.origin ? { origin: { lat: tour.plan.origin.lat, lng: tour.plan.origin.lng } } : {}),
    ...(tour.plan?.visitMinutes !== undefined ? { visitMinutes: tour.plan.visitMinutes } : {}),
    ...(tour.plan?.stopMinutes ? { stopMinutes: tour.plan.stopMinutes } : {}),
  })
  const start = Date.parse(tour.departAt)
  const end = plan.returnAt ? Date.parse(plan.returnAt) : start + TOUR_STOP_MINUTES * MINUTE
  const byId = new Map(pool.map((f) => [f.id, f]))
  const steps = order.map((id) => {
    const stop = plan.stops.find((s) => s.farm.id === id)
    const farm = byId.get(id)
    return { label: farm ? farm.farmName || farm.name : id, at: stop?.arriveAt ?? null }
  })
  return {
    id: `tour:${tour.id}`,
    kind: 'tour',
    at: tour.departAt,
    endAt: iso(new Date(Math.max(end, start + MINUTE))),
    title: tour.name,
    subtitle: steps.map((s) => s.label).join(' · '),
    href: `/coordinator/route?tour=${encodeURIComponent(tour.id)}`,
    missionStatus: null,
    done: false,
    farmId: null,
    /* Un itinéraire n'est pas en un lieu : il n'a pas d'épingle (AB3.4). */
    position: null,
    reflection: true,
    steps,
  }
}

/**
 * ★ CE QUI SE MANIPULE DEPUIS L'AGENDA : les rendez-vous du PO (une réunion, une
 * visite) se déplacent ; une réunion s'allonge par son bord inférieur (une
 * visite est un instant). UN REFLET, JAMAIS : il se modifie dans son écran.
 */
export const agendaCanMove = (e: Pick<AgendaEvent, 'kind' | 'reflection'>): boolean =>
  e.reflection !== true && (e.kind === 'meeting' || e.kind === 'visit')
export const agendaCanResize = (e: Pick<AgendaEvent, 'kind' | 'reflection'>): boolean => e.reflection !== true && e.kind === 'meeting'
/** Ce qui se modifie dans le panneau de l'agenda : la même règle que le déplacement. */
export const agendaCanEdit = agendaCanMove

/** Le jour suivant une clé `YYYY-MM-DD`, en clé. */
export function nextDayKey(key: string): string {
  const d = addDays(fromDayKey(key), 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Le lien d'un rendez-vous, quel que soit le champ qui le porte (un seul). */
export function meetingLink(m: Pick<GeneralMeeting, 'institutionId' | 'farmId' | 'leadId'>): AgendaLink | null {
  if (m.institutionId) return { kind: 'institution', id: m.institutionId }
  if (m.farmId) return { kind: 'farm', id: m.farmId }
  if (m.leadId) return { kind: 'lead', id: m.leadId }
  return null
}

/** Le patch qui pose UN lien (et efface les deux autres). */
export function meetingLinkPatch(link: AgendaLink | null): Pick<GeneralMeeting, 'institutionId' | 'farmId' | 'leadId'> {
  return {
    institutionId: link?.kind === 'institution' ? link.id : null,
    farmId: link?.kind === 'farm' ? link.id : null,
    leadId: link?.kind === 'lead' ? link.id : null,
  }
}

/**
 * ★ LE QUART D'HEURE. Le pas du glisser-déposer et du redimensionnement, et le
 * pas auquel un créneau touché crée un rendez-vous.
 */
export const SNAP_MINUTES = 15

/** Une minute du jour arrondie au quart d'heure le plus proche, dans [0, 24 h − pas]. */
export function snapMinute(minute: number, step = SNAP_MINUTES): number {
  const snapped = Math.round(minute / step) * step
  return Math.max(0, Math.min(24 * 60 - step, snapped))
}

/** La minute du jour sous un décalage vertical, en pixels, dans une grille de `hourPx` par heure. */
export function minuteAtOffset(offsetPx: number, hourPx: number, step = SNAP_MINUTES): number {
  return Math.max(0, Math.min(24 * 60 - step, Math.floor((offsetPx / hourPx) * 60 / step) * step))
}

/**
 * ★ DÉPLACER : la durée est conservée, jamais recalculée (AF4.1). Rend le
 * nouveau début et la nouvelle fin d'un rendez-vous dont le début va à
 * `startMinute` du jour `day`.
 */
export function movedSpan(at: string, endAt: string, day: Date, startMinute: number): { at: string; endAt: string } {
  const duration = Math.max(0, Date.parse(endAt) - Date.parse(at))
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(startMinute / 60), startMinute % 60)
  return { at: iso(start), endAt: iso(new Date(start.getTime() + duration)) }
}

/**
 * ★ ALLONGER (ou raccourcir) PAR LE BORD INFÉRIEUR : la fin va à `endMinute` du
 * jour du début, au quart d'heure, jamais moins d'un pas après le début.
 */
export function resizedEnd(at: string, endMinute: number, step = SNAP_MINUTES): string {
  const start = new Date(at)
  const startMinute = start.getHours() * 60 + start.getMinutes()
  const minute = Math.max(startMinute + step, Math.min(24 * 60, Math.round(endMinute / step) * step))
  const day = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  return iso(new Date(day.getTime() + minute * MINUTE))
}
