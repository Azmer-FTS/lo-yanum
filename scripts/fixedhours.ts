import { buildDayPlan, TOUR_STOP_MINUTES } from '../src/core/tours'
import type { AgendaEvent, Farm } from '../src/core/index'

/**
 * ★★ Y9.3 — A BOOKED HOUR IS AN ABSOLUTE CONSTRAINT.
 *
 *   bun run fixedhours
 *
 * The product owner's report, verbatim:
 *
 *   "HEURES FIXES RESPECTÉES : un rendez-vous déjà pris (ex. 09:30) doit être
 *    honoré tel quel dans l'ordre calculé — actuellement l'app le décale à
 *    12:32. Les heures fixes sont des CONTRAINTES ABSOLUES ; l'optimisation ne
 *    réordonne que ce qui flotte entre elles. Gate dédié."
 *
 * ★ PURE, AND THAT IS THE POINT. `buildDayPlan` was split out of the store
 *   precisely so a scheduling claim could be tested as arithmetic rather than
 *   by reading a screen. Every case below is a day written out in full — a
 *   departure, a handful of farms with real coordinates, one or two
 *   appointments — and an assertion about the MINUTE the plan produces.
 *
 * ★ AND THE FARMS ARE FAR APART ON PURPOSE. The defect only shows when the
 *   driving does not happen to agree with the appointment: two farms twenty
 *   minutes apart would be honoured by accident.
 */

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

const DAY = '2026-09-10'
const iso = (hhmm: string): string => `${DAY}T${hhmm}:00.000Z`
const hhmm = (at: string): string => at.slice(11, 16)

/** A farm is a name and a point; nothing else in this file reads the rest. */
function farm(id: string, name: string, lat: number, lng: number): Farm {
  return {
    id,
    name,
    locality: name,
    type: 'agriculture',
    status: 'active',
    position: { lat, lng },
    farmDunams: 100,
    grazingDunams: 0,
    livestock: [],
    contacts: [],
    photo: null,
    nextVisitAt: null,
    notes: '',
    zones: [],
    region: null,
  } as unknown as Farm
}

function visit(id: string, farmId: string, at: string, minutes = TOUR_STOP_MINUTES): AgendaEvent {
  const start = new Date(iso(at)).getTime()
  return {
    id,
    kind: 'visit',
    at: iso(at),
    endAt: new Date(start + minutes * 60_000).toISOString(),
    farmId,
    title: 'ביקור',
  } as unknown as AgendaEvent
}

/** Roughly Beersheba, Kiryat Gat, Ashkelon, Eilat — real distances apart. */
const BEERSHEBA = farm('f-beersheba', 'באר שבע', 31.252, 34.791)
const KIRYAT_GAT = farm('f-kiryatgat', 'קרית גת', 31.61, 34.764)
const ASHKELON = farm('f-ashkelon', 'אשקלון', 31.668, 34.574)
const EILAT = farm('f-eilat', 'אילת', 29.557, 34.952)
const ALL = [BEERSHEBA, KIRYAT_GAT, ASHKELON, EILAT]
const ORIGIN = { lat: 31.252, lng: 34.791 }

console.log('')
console.log('  Y9.3 — FIXED HOURS ARE HONOURED, AND ONLY THE FLOAT MOVES')
console.log('  =========================================================')

// ---------------------------------------------------------------------------
section('1 — the report, reproduced and answered')
// ---------------------------------------------------------------------------

/**
 * The shape of the product owner's complaint: a long drive first, then a farm
 * with a 09:30 appointment on it. Under the old engine the appointment's stop
 * was simulated like every other and landed hours later.
 */
const reported = buildDayPlan({
  dayKey: DAY,
  origin: ORIGIN,
  farms: ALL,
  tour: {
    id: 't1',
    dayKey: DAY,
    departAt: iso('08:00'),
    farmIds: [EILAT.id, KIRYAT_GAT.id],
  },
  events: [visit('v1', KIRYAT_GAT.id, '09:30')],
})

const pinned = reported.stops.find((s) => s.farm.id === KIRYAT_GAT.id)
check(
  '★★ the 09:30 appointment is scheduled at 09:30',
  hhmm(pinned?.arriveAt ?? '') === '09:30',
  `the plan says ${hhmm(pinned?.arriveAt ?? '')} (it used to say whatever the driving came to)`,
)
check(
  'and the stop is marked as fixed, so the screen can say so',
  pinned?.fixed === true,
)
/**
 * ⚠️ AND THE ANSWER IS BETTER THAN THE ONE THIS CHECK FIRST ASSERTED. It was
 *    written expecting `lateBy > 0` — "Eilat first, so 09:30 cannot be made" —
 *    and the engine reported zero, because it had done the thing the product
 *    owner actually asked for: Eilat FLOATS, so it moved to after the
 *    appointment and the day became feasible. The assertion was describing
 *    the old behaviour's failure mode, not the rule.
 */
check(
  '★★ and the far farm MOVED, because a float may be reordered and a pin may not',
  reported.stops.findIndex((s) => s.farm.id === KIRYAT_GAT.id) <
    reported.stops.findIndex((s) => s.farm.id === EILAT.id),
  reported.stops.map((s) => `${s.order}. ${s.farm.name} ${hhmm(s.arriveAt)}`).join(' · '),
)
check(
  'so the day is feasible and nothing is reported late',
  (pinned?.lateBy ?? -1) === 0,
  `${pinned?.lateBy} minutes late`,
)

/**
 * ★ THE OTHER HALF: a day that CANNOT be made, whatever is reordered. There is
 *   one farm and one appointment five minutes after a one-hour drive; no
 *   ordering saves it, so the plan says how short it is instead of quietly
 *   moving the farmer's appointment.
 */
const impossible = buildDayPlan({
  dayKey: DAY,
  origin: ORIGIN,
  farms: ALL,
  tour: { id: 't1b', dayKey: DAY, departAt: iso('09:00'), farmIds: [ASHKELON.id] },
  events: [visit('v1b', ASHKELON.id, '09:05')],
})
const tight = impossible.stops[0]
check(
  '★★ an appointment the driving cannot make is still shown at ITS hour',
  hhmm(tight.arriveAt) === '09:05',
  hhmm(tight.arriveAt),
)
check(
  '★★ and the shortfall is REPORTED rather than absorbed',
  tight.lateBy > 0,
  `${tight.lateBy} minutes short of a ${tight.driveMinutes}-minute drive`,
)

// ---------------------------------------------------------------------------
section('2 — the float is poured into the gaps, in the order he saved')
// ---------------------------------------------------------------------------

const feasible = buildDayPlan({
  dayKey: DAY,
  origin: ORIGIN,
  farms: ALL,
  tour: {
    id: 't2',
    dayKey: DAY,
    departAt: iso('07:00'),
    farmIds: [ASHKELON.id, KIRYAT_GAT.id, BEERSHEBA.id],
  },
  // Beersheba is pinned late in the morning; Ashkelon and Kiryat Gat float.
  events: [visit('v2', BEERSHEBA.id, '11:30')],
})

const order = feasible.stops.map((s) => s.farm.id)
const beersheba = feasible.stops.find((s) => s.farm.id === BEERSHEBA.id)
check(
  '★★ the 11:30 appointment is at 11:30',
  hhmm(beersheba?.arriveAt ?? '') === '11:30',
  hhmm(beersheba?.arriveAt ?? ''),
)
check(
  '★ and it is feasible, so nothing is reported late',
  (beersheba?.lateBy ?? -1) === 0,
  `${beersheba?.lateBy} minutes late`,
)
check(
  '★★ the two floating farms keep the ORDER he saved them in',
  order.indexOf(ASHKELON.id) < order.indexOf(KIRYAT_GAT.id),
  feasible.stops.map((s) => `${s.order}. ${s.farm.name} ${hhmm(s.arriveAt)}`).join(' · '),
)
check(
  'and both are before the appointment, because both fit',
  order.indexOf(ASHKELON.id) < order.indexOf(BEERSHEBA.id) &&
    order.indexOf(KIRYAT_GAT.id) < order.indexOf(BEERSHEBA.id),
)
check(
  'every floating stop really is before 11:30',
  feasible.stops
    .filter((s) => !s.fixed)
    .every((s) => new Date(s.departAt).getTime() <= new Date(iso('11:30')).getTime()),
  feasible.stops.filter((s) => !s.fixed).map((s) => `${s.farm.name} → ${hhmm(s.departAt)}`).join(' · '),
)

// ---------------------------------------------------------------------------
section('3 — two appointments, and the day is built between them')
// ---------------------------------------------------------------------------

const twoPins = buildDayPlan({
  dayKey: DAY,
  origin: ORIGIN,
  farms: ALL,
  tour: {
    id: 't3',
    dayKey: DAY,
    departAt: iso('07:00'),
    farmIds: [KIRYAT_GAT.id, ASHKELON.id, BEERSHEBA.id],
  },
  // Deliberately saved in the WRONG order relative to their hours.
  events: [visit('v3', BEERSHEBA.id, '09:00'), visit('v4', ASHKELON.id, '13:00')],
})

const at = (id: string) => hhmm(twoPins.stops.find((s) => s.farm.id === id)?.arriveAt ?? '')
check(
  '★★ both appointments are at their own hour',
  at(BEERSHEBA.id) === '09:00' && at(ASHKELON.id) === '13:00',
  `באר שבע ${at(BEERSHEBA.id)}, אשקלון ${at(ASHKELON.id)}`,
)
check(
  '★★ and they are visited in HOUR order, not list order',
  twoPins.stops.findIndex((s) => s.farm.id === BEERSHEBA.id) <
    twoPins.stops.findIndex((s) => s.farm.id === ASHKELON.id),
  twoPins.stops.map((s) => `${s.order}. ${s.farm.name} ${hhmm(s.arriveAt)}`).join(' · '),
)
check(
  '★ the floating farm lands BETWEEN them',
  (() => {
    const i = twoPins.stops.findIndex((s) => s.farm.id === KIRYAT_GAT.id)
    const a = twoPins.stops.findIndex((s) => s.farm.id === BEERSHEBA.id)
    const b = twoPins.stops.findIndex((s) => s.farm.id === ASHKELON.id)
    return i > a && i < b
  })(),
  twoPins.stops.map((s) => `${s.order}. ${s.farm.name} ${hhmm(s.arriveAt)}`).join(' · '),
)
check(
  'the whole day is chronological',
  twoPins.stops.every(
    (s, i) => i === 0 || new Date(s.arriveAt).getTime() >= new Date(twoPins.stops[i - 1].arriveAt).getTime(),
  ),
)

// ---------------------------------------------------------------------------
section('4 — a day with no appointment is unchanged')
// ---------------------------------------------------------------------------

const free = buildDayPlan({
  dayKey: DAY,
  origin: ORIGIN,
  farms: ALL,
  tour: {
    id: 't4',
    dayKey: DAY,
    departAt: iso('08:00'),
    farmIds: [KIRYAT_GAT.id, ASHKELON.id],
  },
  events: [],
})
check(
  'the saved order is the visited order',
  free.stops.map((s) => s.farm.id).join(',') === [KIRYAT_GAT.id, ASHKELON.id].join(','),
  free.stops.map((s) => `${s.order}. ${s.farm.name} ${hhmm(s.arriveAt)}`).join(' · '),
)
check('nothing is fixed', free.stops.every((s) => !s.fixed))
check('nothing is late', free.stops.every((s) => s.lateBy === 0))
check(
  'the first stop is the drive from the origin, not the departure time',
  hhmm(free.stops[0].arriveAt) > '08:00',
  hhmm(free.stops[0].arriveAt),
)

console.log('')
console.log('  VERDICT')
console.log('  -------')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
