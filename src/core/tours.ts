import { MINUTE, iso } from './clock'
import { HOME_BASE, haversineKm, wazeUrl } from './geo'
import { estimateDriveMinutes, googleMapsPointsUrl } from './routing'
import type { AgendaEvent, Farm, LatLng } from './types'

/**
 * G9 — THE BRIDGE BETWEEN THE ROUTE PLANNER AND THE AGENDA.
 *
 * A Tour is a SAVED field day: "on this date I leave at 08:30 and visit these
 * farms in this order". The planner had the ordering maths since Lot 0.7 and
 * threw the result away on navigation; the agenda had the day's fixed hours and
 * no notion of driving between them. This module is the object both share, plus
 * the engine that folds the two together into one chronological day plan —
 * the "היום שלי" block on the dashboard and the agenda's day view.
 */

export interface Tour {
  id: string
  /** Local day key `YYYY-MM-DD` — a tour IS a calendar day, one per day. */
  dayKey: string
  /** ISO datetime of the departure from the home base. */
  departAt: string
  /** Farm ids in visit order, as saved from the planner. */
  farmIds: string[]
}

/**
 * How long a farm stop is assumed to take. One flat number rather than a field
 * per stop: the coordinator's own meetings carry real times, and a knob nobody
 * asked for on every row would make saving a tour a form-filling chore.
 */
export const TOUR_STOP_MINUTES = 45

/** A suggestion must not bend the day out of shape. */
export const SUGGESTION_MAX_DETOUR_KM = 12
export const SUGGESTION_LIMIT = 4

export interface DayPlanStop {
  farm: Farm
  /** 1-based position in the visit order. */
  order: number
  /** Kilometres from the previous point (origin or previous stop). */
  legKm: number
  /** Minutes of driving from the previous point. */
  driveMinutes: number
  /** Minutes spent waiting for a fixed event to end before this stop fits. */
  waitMinutes: number
  arriveAt: string
  departAt: string
  wazeUrl: string
  /** A visit already planned on this farm this day, if one exists. */
  visitEvent: AgendaEvent | null
}

export interface DayPlanItem {
  kind: 'stop' | 'event' | 'return'
  /** ISO datetime the item starts — the merge key of the chronology. */
  at: string
  stop?: DayPlanStop
  event?: AgendaEvent
}

export interface TourSuggestion {
  farm: Farm
  /** Extra kilometres the best insertion adds to the route. */
  detourKm: number
  /** Index in `farmIds` BEFORE which the farm inserts best. */
  insertAt: number
}

export interface DayPlan {
  dayKey: string
  tour: Tour | null
  stops: DayPlanStop[]
  /** The day's fixed hours NOT absorbed into a stop — the constraints. */
  fixedEvents: AgendaEvent[]
  /** Stops, fixed events and the return leg, merged chronologically. */
  items: DayPlanItem[]
  suggestions: TourSuggestion[]
  /** Round trip, origin → stops → origin. */
  totalKm: number
  driveMinutes: number
  returnAt: string | null
  mapsUrl: string | null
}

export interface DayPlanInput {
  dayKey: string
  tour: Tour | null
  /** Every farm the session can see — resolves the tour and feeds suggestions. */
  farms: Farm[]
  /** The day's agenda events, whatever their kind. */
  events: AgendaEvent[]
  origin?: LatLng
}

interface Window {
  start: number
  end: number
}

/**
 * A fixed event blocks its own duration; a point event (a visit has
 * `endAt === at`) still blocks the time the meeting itself takes.
 */
function windowOf(event: AgendaEvent): Window {
  const start = new Date(event.at).getTime()
  const end = Math.max(
    new Date(event.endAt).getTime(),
    start + TOUR_STOP_MINUTES * MINUTE,
  )
  return { start, end }
}

/**
 * Fold a saved tour and the day's fixed hours into one chronological plan.
 *
 * THE FIXED HOURS ARE CONSTRAINTS, NOT DECORATION: the drive is simulated from
 * the departure time, and a stop whose slot would overlap a meeting is pushed
 * to after that meeting ends — the coordinator cannot be in two places, and a
 * plan that pretends otherwise is worse than none. A visit already planned on
 * a farm the tour passes through is the one exception: it is absorbed INTO its
 * stop (shown there with its own fixed time) instead of blocking it, because
 * the visit and the stop are the same errand.
 *
 * Pure — the store-reading wrapper is `getDayPlan` in access.ts, and the
 * split is what lets `bun run accept` drive this engine without a browser.
 */
export function buildDayPlan(input: DayPlanInput): DayPlan {
  const origin = input.origin ?? HOME_BASE
  const tour = input.tour
  const farmsById = new Map(input.farms.map((f) => [f.id, f]))
  const tourFarms = (tour?.farmIds ?? []).flatMap((id) => {
    const farm = farmsById.get(id)
    return farm ? [farm] : []
  })
  const tourFarmIds = new Set(tourFarms.map((f) => f.id))

  // A visit on a tour farm belongs to its stop; everything else is a wall.
  const absorbedByFarm = new Map<string, AgendaEvent>()
  const fixedEvents: AgendaEvent[] = []
  for (const event of input.events) {
    if (
      event.kind === 'visit' &&
      event.farmId !== null &&
      tourFarmIds.has(event.farmId) &&
      !absorbedByFarm.has(event.farmId)
    ) {
      absorbedByFarm.set(event.farmId, event)
    } else {
      fixedEvents.push(event)
    }
  }
  // Only the hours the coordinator personally attends are walls: meetings and
  // visits. A guard mission is on the day's agenda — and stays in the
  // chronology below — but it is the volunteers' night, not a slot in the
  // coordinator's drive; letting tonight's 21:00–05:00 guard block tomorrow
  // morning's route produced four-hour "waits" for an appointment nobody has.
  const walls = fixedEvents
    .filter((e) => e.kind !== 'mission')
    .map(windowOf)
    .sort((a, b) => a.start - b.start)

  const stops: DayPlanStop[] = []
  let cursor = tour ? new Date(tour.departAt).getTime() : 0
  let position = origin
  let totalKm = 0
  let driveMinutes = 0

  for (const farm of tourFarms) {
    const legKm = haversineKm(position, farm.position)
    const legMinutes = estimateDriveMinutes(legKm)
    let arrive = cursor + legMinutes * MINUTE

    // Push past every fixed hour the stop would collide with. The walls are
    // sorted, so one forward pass settles the final slot.
    const unobstructed = arrive
    for (const wall of walls) {
      const departs = arrive + TOUR_STOP_MINUTES * MINUTE
      if (arrive < wall.end && departs > wall.start) {
        arrive = wall.end
      }
    }

    const departAt = arrive + TOUR_STOP_MINUTES * MINUTE
    stops.push({
      farm,
      order: stops.length + 1,
      legKm,
      driveMinutes: legMinutes,
      waitMinutes: Math.round((arrive - unobstructed) / MINUTE),
      arriveAt: iso(new Date(arrive)),
      departAt: iso(new Date(departAt)),
      wazeUrl: wazeUrl(farm.position),
      visitEvent: absorbedByFarm.get(farm.id) ?? null,
    })

    totalKm += legKm
    driveMinutes += legMinutes
    cursor = departAt
    position = farm.position
  }

  let returnAt: string | null = null
  if (stops.length > 0) {
    const returnKm = haversineKm(position, origin)
    const returnMinutes = estimateDriveMinutes(returnKm)
    totalKm += returnKm
    driveMinutes += returnMinutes
    returnAt = iso(new Date(cursor + returnMinutes * MINUTE))
  }

  const items: DayPlanItem[] = [
    ...stops.map((stop) => ({ kind: 'stop' as const, at: stop.arriveAt, stop })),
    ...fixedEvents.map((event) => ({
      kind: 'event' as const,
      at: event.at,
      event,
    })),
    ...(returnAt ? [{ kind: 'return' as const, at: returnAt }] : []),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  return {
    dayKey: input.dayKey,
    tour,
    stops,
    fixedEvents,
    items,
    suggestions: suggestNearby(input.farms, tourFarmIds, stops, origin),
    totalKm,
    driveMinutes,
    returnAt,
    mapsUrl:
      stops.length > 0
        ? googleMapsPointsUrl(
            origin,
            stops.map((s) => s.farm.position),
          )
        : null,
  }
}

/**
 * Farms worth folding into the day BECAUSE the car passes nearby anyway.
 *
 * For every farm not already on the tour, find the leg where inserting it costs
 * the fewest extra kilometres (triangle detour: prev→farm→next minus
 * prev→next). Ranked by that cost, capped at SUGGESTION_MAX_DETOUR_KM — a farm
 * 40 km off the road is a different day, not a suggestion.
 */
function suggestNearby(
  farms: Farm[],
  tourFarmIds: Set<string>,
  stops: DayPlanStop[],
  origin: LatLng,
): TourSuggestion[] {
  if (stops.length === 0) return []

  // The route as a chain of points: origin → stops → origin.
  const chain: LatLng[] = [
    origin,
    ...stops.map((s) => s.farm.position),
    origin,
  ]

  const out: TourSuggestion[] = []
  for (const farm of farms) {
    if (tourFarmIds.has(farm.id) || farm.status === 'declined') continue

    let best = Infinity
    let insertAt = 0
    for (let i = 0; i < chain.length - 1; i++) {
      const detour =
        haversineKm(chain[i], farm.position) +
        haversineKm(farm.position, chain[i + 1]) -
        haversineKm(chain[i], chain[i + 1])
      if (detour < best) {
        best = detour
        insertAt = i
      }
    }

    if (best <= SUGGESTION_MAX_DETOUR_KM) {
      out.push({ farm, detourKm: best, insertAt })
    }
  }

  return out
    .sort((a, b) => a.detourKm - b.detourKm)
    .slice(0, SUGGESTION_LIMIT)
}
