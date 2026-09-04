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
  /**
   * ★★ Y9.3 (2026-09-04) — TRUE WHEN THIS STOP'S HOUR IS NOT NEGOTIABLE.
   *
   * A farm with an appointment already booked on it is PINNED to that hour;
   * `arriveAt` IS the appointment. Everything else in the day floats around
   * it. See `buildDayPlan`.
   */
  fixed: boolean
  /**
   * ★★ Y9.3 — minutes by which the drive cannot make a pinned hour, when the
   * day as ordered is simply impossible. Zero on every feasible plan.
   *
   * ⚠️ REPORTED RATHER THAN SILENTLY ABSORBED. The alternative is to move the
   *    appointment, which is what the app used to do and what the product
   *    owner reported: a 09:30 shown at 12:32. An appointment the coordinator
   *    made with a farmer is not the app's to move; if the driving does not
   *    fit, the plan says so and he decides.
   */
  lateBy: number
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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★★ Y9.3 (2026-09-04) — A BOOKED HOUR IS AN ABSOLUTE CONSTRAINT.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * The product owner: "un rendez-vous déjà pris (ex. 09:30) doit être honoré
   * tel quel dans l'ordre calculé — actuellement l'app le décale à 12:32. Les
   * heures fixes sont des CONTRAINTES ABSOLUES ; l'optimisation ne réordonne
   * que ce qui flotte entre elles."
   *
   * ⚠️ AND THE OLD CODE MADE THAT IMPOSSIBLE BY CONSTRUCTION. A visit booked
   *    on a farm the tour passes through was ABSORBED into its stop — taken
   *    out of `walls` on the reasoning that "the visit and the stop are the
   *    same errand", which is true — and then the stop's hour was computed
   *    from the drive simulation like every other. So the appointment was the
   *    one event on the day that constrained NOTHING: the stop showed 12:32
   *    and carried a 09:30 label. Absorbing it was right; letting it float
   *    afterwards was the defect.
   *
   * THE SCHEDULE IS BUILT AROUND THE PINS.
   *
   *   1  Every tour farm with an absorbed visit is PINNED, and the pins are
   *      taken in the order of their own hours — a coordinator cannot be at
   *      10:00 before 09:30 whatever his list says.
   *   2  The floating stops keep the order he saved them in, and are poured
   *      into the gaps BEFORE each pin, greedily, while one still fits: the
   *      drive there, the stop itself, and the drive on to the pin, all
   *      before the pin's hour.
   *   3  What did not fit runs after the last pin, in the same order, exactly
   *      as the whole day used to.
   *
   * That is "l'optimisation ne réordonne que ce qui flotte entre elles",
   * literally: a pinned stop never moves, and a floating stop never overtakes
   * another floating stop.
   */
  const pinnedAt = (farm: Farm): number | null => {
    const event = absorbedByFarm.get(farm.id)
    return event ? new Date(event.at).getTime() : null
  }
  const pins = tourFarms
    .filter((f) => pinnedAt(f) !== null)
    .sort((a, b) => (pinnedAt(a) as number) - (pinnedAt(b) as number))
  const floating = tourFarms.filter((f) => pinnedAt(f) === null)

  const stops: DayPlanStop[] = []
  let cursor = tour ? new Date(tour.departAt).getTime() : 0
  let position = origin
  let totalKm = 0
  let driveMinutes = 0

  /** Place one floating farm at the cursor, pushed past any wall it hits. */
  const placeFloating = (farm: Farm): void => {
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
      visitEvent: null,
      fixed: false,
      lateBy: 0,
    })

    totalKm += legKm
    driveMinutes += legMinutes
    cursor = departAt
    position = farm.position
  }

  /** Place one pinned farm AT its hour, whatever the driving says. */
  const placePinned = (farm: Farm): void => {
    const event = absorbedByFarm.get(farm.id) as AgendaEvent
    const at = new Date(event.at).getTime()
    const legKm = haversineKm(position, farm.position)
    const legMinutes = estimateDriveMinutes(legKm)
    const earliest = cursor + legMinutes * MINUTE
    // The appointment lasts as long as it says, or a stop, whichever is more.
    const ends = Math.max(new Date(event.endAt).getTime(), at + TOUR_STOP_MINUTES * MINUTE)

    stops.push({
      farm,
      order: stops.length + 1,
      legKm,
      driveMinutes: legMinutes,
      waitMinutes: Math.max(0, Math.round((at - earliest) / MINUTE)),
      arriveAt: iso(new Date(at)),
      departAt: iso(new Date(ends)),
      wazeUrl: wazeUrl(farm.position),
      visitEvent: event,
      fixed: true,
      lateBy: Math.max(0, Math.round((earliest - at) / MINUTE)),
    })

    totalKm += legKm
    driveMinutes += legMinutes
    cursor = ends
    position = farm.position
  }

  const queue = [...floating]
  for (const pin of pins) {
    const at = pinnedAt(pin) as number
    // Pour in what still fits before this appointment, in the saved order.
    for (;;) {
      const next = queue[0]
      if (!next) break
      const toNext = estimateDriveMinutes(haversineKm(position, next.position)) * MINUTE
      const onward = estimateDriveMinutes(haversineKm(next.position, pin.position)) * MINUTE
      const done = cursor + toNext + TOUR_STOP_MINUTES * MINUTE
      if (done + onward > at) break
      queue.shift()
      placeFloating(next)
    }
    placePinned(pin)
  }
  for (const farm of queue) placeFloating(farm)

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
