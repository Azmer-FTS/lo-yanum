import { haversineKm, positionOfLocality } from './geo'
import { DEFAULT_AVAILABILITY } from './types'
import type { Driver, LatLng, Mission, Volunteer } from './types'

/**
 * D5 — WHO SHOULD BE ASKED TO STAND GUARD.
 *
 * PURE TypeScript: no React, no DOM, no store access. Everything it needs is
 * passed in, so the same function ranks candidates in the wizard, in the
 * verification script (`bun run dispatch`), and — in Lot 1 — inside a Postgres
 * function without a line changing.
 *
 * THE RANKING IS A PROPOSAL, NOT A DECISION. The coordinator phones people; the
 * app only decides who to phone FIRST. That is why the score is decomposed into
 * named parts and surfaced in the UI: a coordinator who cannot see why a name is
 * at the top will not trust the list, and will go back to their notebook.
 *
 * Four rules, in the order the programme actually cares about them:
 *
 *   1. AVAILABILITY is a filter, not a score. Inactive volunteers and anyone
 *      already standing guard that same night are removed outright — no amount
 *      of proximity makes a double-booking acceptable.
 *   2. DISTANCE. The volunteer travels from his locality to the farm. Someone
 *      in Be'er Sheva going to a Negev farm is a fundamentally better ask than
 *      someone in Jerusalem.
 *   3. EQUITY. Volunteers who have stood fewer guards come first. Left to
 *      itself, a coordinator calls the same reliable six people until they burn
 *      out; this is the counterweight.
 *   4. PAIRING. A small bonus for sharing a yeshiva with someone already chosen
 *      for this guard. Groups that know each other travel and watch better, and
 *      it makes the phone call easier ("your friend X already said yes").
 *
 * DETERMINISM IS PART OF THE CONTRACT. No randomness, no `Date.now()`, and ties
 * break on volunteer id. The same inputs must always produce the same order, or
 * two coordinators comparing screens will see different lists.
 */

// --- Weights ---------------------------------------------------------------
//
// Tuned so that the three components are commensurable at the scale the data
// actually spans: ~150 km of country, ~0–42 guards served, one pairing bonus.

/** Points lost per kilometre. 100 km of extra travel ≈ 45 points. */
export const DISTANCE_WEIGHT = 0.45

/** Points lost per guard already served. The full 0–42 range ≈ 50 points. */
export const EQUITY_WEIGHT = 1.2

/** Points gained for sharing a yeshiva with an already-chosen candidate. */
export const PAIR_BONUS = 12

/**
 * G3.4 — points lost per availability-preference mismatch. A SOFT signal on
 * purpose: "prefers not to" must rank someone down, not disappear them — the
 * coordinator can still call, and often does when the list runs dry. An
 * explicitly excluded DATE is charged harder: that is a stated "not that
 * night", the closest thing preferences have to a no.
 */
export const AVAILABILITY_PENALTY = 18
export const EXCLUDED_DATE_PENALTY = 40

export type AvailabilityMismatch = 'nights' | 'days' | 'weekends' | 'date'

/**
 * Distance charged to a volunteer whose locality is not in the gazetteer.
 * A flat mid-range penalty rather than 0: an unknown town must not silently
 * out-rank a known nearby one.
 */
export const UNKNOWN_LOCALITY_KM = 80

export interface ScoreBreakdown {
  /** Negative — points removed for travel. */
  distance: number
  /** Negative — points removed for guards already served. */
  equity: number
  /** Positive — the same-yeshiva bonus, or 0. */
  pairing: number
  /** Negative — G3.4 availability-preference mismatches, or 0. */
  availability: number
}

export interface CandidateScore {
  volunteer: Volunteer
  /** Locality → farm, great-circle. `null` when the locality is unknown. */
  distanceKm: number | null
  score: number
  breakdown: ScoreBreakdown
  /** Drives the "travels with X" hint in the UI. */
  sameYeshivaAsChosen: boolean
  /** G3.4 — which stated preferences this night runs against. */
  availabilityMismatches: AvailabilityMismatch[]
}

export interface RankCandidatesInput {
  /** The pool to rank — normally the whole roster. */
  volunteers: Volunteer[]
  /** Where the guard is. The anchor point, when there is one. */
  destination: LatLng
  /** The night being staffed, as ISO datetimes. */
  startAt: string
  endAt: string
  /** Every mission that already exists, for the double-booking filter. */
  missions: Mission[]
  /** Already picked for THIS guard — they seed the pairing bonus. */
  chosenIds?: string[]
  /** Declined or manually dismissed — removed from the list entirely. */
  excludedIds?: string[]
}

/** Two intervals overlap. Used to detect a volunteer already on guard. */
function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return (
    new Date(aStart).getTime() < new Date(bEnd).getTime() &&
    new Date(bStart).getTime() < new Date(aEnd).getTime()
  )
}

/**
 * G3.4 — where this night runs against a volunteer's stated preferences.
 *
 * The mission's character is read off its start: a guard beginning after
 * 18:00 or before 05:00 is a night; a start on Friday or Saturday is a
 * weekend (the Israeli one). Local time throughout — the preference and the
 * mission live in the same country.
 */
export function availabilityMismatchesFor(
  volunteer: Volunteer,
  startAt: string,
  endAt: string,
): AvailabilityMismatch[] {
  // Defensive: rows imported from a spreadsheet (or older fixtures) may not
  // carry preferences yet; absent means unconstrained.
  const prefs = volunteer.availability ?? DEFAULT_AVAILABILITY
  const out: AvailabilityMismatch[] = []
  const start = new Date(startAt)

  const hour = start.getHours()
  const isNight = hour >= 18 || hour < 5
  if (isNight && !prefs.nights) out.push('nights')
  if (!isNight && !prefs.days) out.push('days')

  const day = start.getDay()
  if ((day === 5 || day === 6) && !prefs.weekends) out.push('weekends')

  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`
  if (prefs.excludedDates.includes(key)) out.push('date')

  void endAt // a multi-day window may refine this in a later lot
  return out
}

/** Ids of volunteers already standing guard during the given window. */
export function busyVolunteerIds(
  missions: Mission[],
  startAt: string,
  endAt: string,
): Set<string> {
  const busy = new Set<string>()
  for (const m of missions) {
    if (!overlaps(startAt, endAt, m.startAt, m.endAt)) continue
    for (const a of m.assignments) busy.add(a.volunteerId)
  }
  return busy
}

/**
 * Rank the roster for one guard, best first.
 *
 * Availability is applied as a FILTER before scoring, so an unavailable person
 * never appears with a low score — "he is at the bottom of the list" and "he
 * cannot come" are different facts and must not look the same.
 */
export function rankCandidates(input: RankCandidatesInput): CandidateScore[] {
  const chosenIds = new Set(input.chosenIds ?? [])
  const excludedIds = new Set(input.excludedIds ?? [])
  const busy = busyVolunteerIds(input.missions, input.startAt, input.endAt)

  // The yeshivot already represented among the picked candidates.
  const chosenYeshivot = new Set(
    input.volunteers.filter((v) => chosenIds.has(v.id)).map((v) => v.yeshiva),
  )

  const scored = input.volunteers
    .filter(
      (v) =>
        v.status === 'active' &&
        !excludedIds.has(v.id) &&
        !chosenIds.has(v.id) &&
        !busy.has(v.id),
    )
    .map((volunteer) => {
      const home = positionOfLocality(volunteer.locality)
      const distanceKm = home ? haversineKm(home, input.destination) : null
      const chargedKm = distanceKm ?? UNKNOWN_LOCALITY_KM

      const sameYeshivaAsChosen = chosenYeshivot.has(volunteer.yeshiva)

      const availabilityMismatches = availabilityMismatchesFor(
        volunteer,
        input.startAt,
        input.endAt,
      )
      const availabilityPenalty = availabilityMismatches.reduce(
        (sum, m) =>
          sum + (m === 'date' ? EXCLUDED_DATE_PENALTY : AVAILABILITY_PENALTY),
        0,
      )

      const breakdown: ScoreBreakdown = {
        distance: -chargedKm * DISTANCE_WEIGHT,
        equity: -volunteer.guardsCount * EQUITY_WEIGHT,
        pairing: sameYeshivaAsChosen ? PAIR_BONUS : 0,
        availability: -availabilityPenalty,
      }

      return {
        volunteer,
        distanceKm,
        score:
          100 +
          breakdown.distance +
          breakdown.equity +
          breakdown.pairing +
          breakdown.availability,
        breakdown,
        sameYeshivaAsChosen,
        availabilityMismatches,
      }
    })

  // Ties break on id so the order is reproducible across sessions and machines.
  return scored.sort(
    (a, b) =>
      b.score - a.score || a.volunteer.id.localeCompare(b.volunteer.id),
  )
}

// --- Drivers ---------------------------------------------------------------

export interface DriverScore {
  driver: Driver
  distanceKm: number | null
  score: number
  /** True when the vehicle cannot seat the whole group. */
  tooFewSeats: boolean
}

export interface RankDriversInput {
  drivers: Driver[]
  destination: LatLng
  startAt: string
  endAt: string
  missions: Mission[]
  /** How many volunteers need seats. */
  groupSize: number
  excludedIds?: string[]
}

/**
 * Drivers are ranked on proximity alone — there is no equity concern, the pool
 * is six people, and a driver who lives an hour further away is simply an hour
 * further away. Seat capacity is shown rather than filtered: a coordinator may
 * legitimately split a group across two runs, and hiding the option would make
 * the app look broken rather than opinionated.
 */
export function rankDrivers(input: RankDriversInput): DriverScore[] {
  const excluded = new Set(input.excludedIds ?? [])
  const busy = new Set(
    input.missions
      .filter((m) => overlaps(input.startAt, input.endAt, m.startAt, m.endAt))
      .flatMap((m) => m.drivers.map((dr) => dr.driverId))
      .filter((id): id is string => id !== null),
  )

  return input.drivers
    .filter((d) => !excluded.has(d.id) && !busy.has(d.id))
    .map((driver) => {
      const home = positionOfLocality(driver.locality)
      const distanceKm = home ? haversineKm(home, input.destination) : null
      const chargedKm = distanceKm ?? UNKNOWN_LOCALITY_KM
      return {
        driver,
        distanceKm,
        score: 100 - chargedKm * DISTANCE_WEIGHT,
        tooFewSeats: driver.seats < input.groupSize,
      }
    })
    .sort((a, b) => b.score - a.score || a.driver.id.localeCompare(b.driver.id))
}

// --- Solicitation ----------------------------------------------------------

/**
 * Where one candidate stands in the phone-round.
 *
 * `idle` is "on the shortlist, not yet contacted" — distinct from `pending`,
 * which means the coordinator has actually reached out and is waiting. The
 * difference is the whole point of the screen at 20:00 with two seats to fill.
 */
export type SolicitationState = 'idle' | 'pending' | 'confirmed' | 'declined'

/**
 * How many candidates to shortlist for a given requirement.
 *
 * More than the number of seats, because people say no: with two seats, four
 * names on screen means the coordinator keeps working the list instead of
 * scrolling back for a replacement after the first refusal.
 */
export function shortlistSize(required: number): number {
  return Math.max(required + 2, Math.ceil(required * 1.5) + 1)
}
