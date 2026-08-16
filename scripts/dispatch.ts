import {
  DISTANCE_WEIGHT,
  EQUITY_WEIGHT,
  PAIR_BONUS,
  busyVolunteerIds,
  rankCandidates,
  rankDrivers,
  shortlistSize,
} from '../src/core/dispatch'
import { haversineKm, positionOfLocality } from '../src/core/geo'
import type { Driver, Mission, Volunteer } from '../src/core/types'

/**
 * A21 — verification of the dispatch scoring.
 *
 * Drives @core/dispatch with HAND-BUILT fixtures rather than the mock roster:
 * the point is to prove the RULES, and a rule proved against 300 generated
 * people only proves that the generator did not happen to break it. Each case
 * isolates one component of the score and asserts the order it must produce.
 *
 * Exits non-zero on the first failure so it can gate a build.
 *   bun run dispatch
 */

let failures = 0
let checks = 0

function check(label: string, ok: boolean, detail = ''): void {
  checks++
  if (!ok) failures++
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`,
  )
}

function section(title: string): void {
  console.log(`\n  ${title}`)
  console.log(`  ${'-'.repeat(68)}`)
}

// --- Fixtures --------------------------------------------------------------

const volunteer = (over: Partial<Volunteer> & { id: string }): Volunteer => ({
  name: over.id,
  age: 21,
  phone: '050-0000000',
  phoneType: 'smartphone',
  yeshiva: 'ישיבת שדרות',
  locality: 'באר שבע',
  guardsCount: 10,
  status: 'active',
  inactiveReason: null,
  notes: '',
  lastActivityAt: null,
  photo: null,
  ...over,
})

/** Farm-01 (חוות רתם), the reference destination for every case below. */
const RATEM = { lat: 31.0583, lng: 34.6531 }

const NIGHT = {
  startAt: '2026-09-01T21:00:00.000Z',
  endAt: '2026-09-02T05:00:00.000Z',
}

const rank = (volunteers: Volunteer[], extra: Partial<Parameters<typeof rankCandidates>[0]> = {}) =>
  rankCandidates({
    volunteers,
    destination: RATEM,
    ...NIGHT,
    missions: [],
    ...extra,
  })

const ids = (rows: ReturnType<typeof rankCandidates>): string[] =>
  rows.map((r) => r.volunteer.id)

console.log('Dispatch scoring — @core/dispatch')

// --- 1. Distance -----------------------------------------------------------

section('1. Distance: everything else equal, the nearer locality wins')
{
  const near = volunteer({ id: 'v-near', locality: 'אופקים' }) // ~35 km
  const far = volunteer({ id: 'v-far', locality: 'ירושלים' }) // ~100 km
  const rows = rank([far, near])

  check('nearest first', ids(rows)[0] === 'v-near', ids(rows).join(' > '))

  const dNear = haversineKm(positionOfLocality('אופקים')!, RATEM)
  const dFar = haversineKm(positionOfLocality('ירושלים')!, RATEM)
  const expectedGap = (dFar - dNear) * DISTANCE_WEIGHT
  const actualGap = rows[0].score - rows[1].score
  check(
    'gap equals the distance weight exactly',
    Math.abs(actualGap - expectedGap) < 1e-9,
    `${actualGap.toFixed(3)} vs ${expectedGap.toFixed(3)}`,
  )
  check(
    'distanceKm is reported, not just consumed',
    Math.abs((rows[0].distanceKm ?? 0) - dNear) < 1e-9,
    `${rows[0].distanceKm?.toFixed(1)} km`,
  )
}

// --- 2. Equity -------------------------------------------------------------

section('2. Equity: same locality, the volunteer with fewer guards wins')
{
  const veteran = volunteer({ id: 'v-veteran', guardsCount: 40 })
  const fresh = volunteer({ id: 'v-fresh', guardsCount: 2 })
  const rows = rank([veteran, fresh])

  check('fewest guards first', ids(rows)[0] === 'v-fresh', ids(rows).join(' > '))
  check(
    'gap equals the equity weight exactly',
    Math.abs(rows[0].score - rows[1].score - 38 * EQUITY_WEIGHT) < 1e-9,
    `${(rows[0].score - rows[1].score).toFixed(2)}`,
  )
}

section('2b. Equity does not override a large distance advantage')
{
  // 38 guards of "seniority" is worth 45.6 points; Jerusalem→Ratem is ~100 km
  // further than Ofakim, worth ~29 points. The nearer veteran should still lose.
  const nearVeteran = volunteer({
    id: 'v-near-veteran',
    locality: 'אופקים',
    guardsCount: 40,
  })
  const farFresh = volunteer({
    id: 'v-far-fresh',
    locality: 'ירושלים',
    guardsCount: 2,
  })
  const rows = rank([nearVeteran, farFresh])
  check(
    'the two components are commensurable, not lexicographic',
    ids(rows)[0] === 'v-far-fresh',
    ids(rows).join(' > '),
  )
}

// --- 3. Yeshiva pairing ----------------------------------------------------

section('3. Pairing: sharing a yeshiva with an already-chosen candidate helps')
{
  const chosen = volunteer({ id: 'v-chosen', yeshiva: 'ישיבת הר עציון' })
  const mate = volunteer({ id: 'v-mate', yeshiva: 'ישיבת הר עציון' })
  const stranger = volunteer({ id: 'v-stranger', yeshiva: 'ישיבת שדרות' })

  const before = rank([mate, stranger])
  check(
    'without a chosen candidate the two are tied and break on id',
    ids(before).join(',') === 'v-mate,v-stranger',
    ids(before).join(' > '),
  )

  const after = rank([chosen, mate, stranger], { chosenIds: ['v-chosen'] })
  check('the chosen candidate is removed from the list', !ids(after).includes('v-chosen'))
  check('the yeshiva mate rises', ids(after)[0] === 'v-mate', ids(after).join(' > '))
  check(
    'the bonus is exactly PAIR_BONUS',
    Math.abs(after[0].score - after[1].score - PAIR_BONUS) < 1e-9,
    `${(after[0].score - after[1].score).toFixed(2)}`,
  )
  check('and it is flagged for the UI', after[0].sameYeshivaAsChosen === true)
}

// --- 4. Availability is a filter, not a penalty ----------------------------

section('4. Availability: inactive, busy and declined are removed outright')
{
  const active = volunteer({ id: 'v-active' })
  const inactive = volunteer({
    id: 'v-inactive',
    status: 'inactive',
    inactiveReason: 'מילואים',
    guardsCount: 0,
  })
  const busy = volunteer({ id: 'v-busy', guardsCount: 0 })
  const declined = volunteer({ id: 'v-declined', guardsCount: 0 })

  const conflicting: Mission = {
    id: 'm-conflict',
    farmId: 'farm-02',
    anchorPointId: 'anchor-03',
    // Overlaps the tail of our night by four hours.
    startAt: '2026-09-02T01:00:00.000Z',
    endAt: '2026-09-02T09:00:00.000Z',
    status: 'planned',
    assignments: [
      {
        volunteerId: 'v-busy',
        isGroupPhone: true,
        outbound: { driver: null, group: null, self: null },
        inbound: { driver: null, group: null, self: null },
      },
    ],
    driverId: 'drv-01',
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
  }

  const rows = rank([active, inactive, busy, declined], {
    missions: [conflicting],
    excludedIds: ['v-declined'],
  })

  check('only the available candidate remains', ids(rows).join(',') === 'v-active', ids(rows).join(' > '))
  check(
    'the busy set names the double-booked volunteer',
    busyVolunteerIds([conflicting], NIGHT.startAt, NIGHT.endAt).has('v-busy'),
  )

  const noOverlap: Mission = {
    ...conflicting,
    startAt: '2026-09-03T21:00:00.000Z',
    endAt: '2026-09-04T05:00:00.000Z',
  }
  check(
    'a guard on another night is not a conflict',
    ids(rank([busy], { missions: [noOverlap] })).join(',') === 'v-busy',
  )
}

// --- 5. Refusal promotes the next candidate --------------------------------

section('5. A refusal promotes whoever was next (A20)')
{
  const pool = [
    volunteer({ id: 'v-1', locality: 'אופקים', guardsCount: 1 }),
    volunteer({ id: 'v-2', locality: 'אופקים', guardsCount: 5 }),
    volunteer({ id: 'v-3', locality: 'אופקים', guardsCount: 9 }),
  ]
  const first = ids(rank(pool))
  check('initial order is by equity', first.join(',') === 'v-1,v-2,v-3', first.join(' > '))

  const afterRefusal = ids(rank(pool, { excludedIds: ['v-1'] }))
  check(
    'the refuser is gone and the next one leads',
    afterRefusal.join(',') === 'v-2,v-3',
    afterRefusal.join(' > '),
  )
}

// --- 6. Determinism --------------------------------------------------------

section('6. Determinism: identical input, identical output')
{
  const pool = [
    volunteer({ id: 'v-b', locality: 'עומר', guardsCount: 7 }),
    volunteer({ id: 'v-a', locality: 'עומר', guardsCount: 7 }),
    volunteer({ id: 'v-c', locality: 'מיתר', guardsCount: 7 }),
  ]
  const a = ids(rank(pool)).join(',')
  const b = ids(rank([...pool].reverse())).join(',')
  check('order is independent of input order', a === b, `${a} vs ${b}`)
  check('exact ties break on id', a.startsWith('v-a,v-b'), a)
}

section('7. An unknown locality is charged, not ignored')
{
  const known = volunteer({ id: 'v-known', locality: 'ירושלים' }) // ~100 km
  const unknown = volunteer({ id: 'v-unknown', locality: 'כפר שאינו במאגר' })
  const rows = rank([known, unknown])
  check(
    'the unknown town does not out-rank a real far one by scoring zero km',
    rows.find((r) => r.volunteer.id === 'v-unknown')!.breakdown.distance < 0,
  )
  check('and it reports no distance rather than a fake one', rows.find((r) => r.volunteer.id === 'v-unknown')!.distanceKm === null)
}

// --- 8. Drivers ------------------------------------------------------------

section('8. Drivers: ranked on proximity, seat shortfalls flagged not hidden')
{
  const driver = (id: string, locality: string, seats: number): Driver => ({
    id,
    name: id,
    phone: '050-0000000',
    vehicle: 'רכב',
    seats,
    locality,
    photo: null,
  })

  const rows = rankDrivers({
    drivers: [
      driver('d-far', 'ירושלים', 8),
      driver('d-near', 'אופקים', 4),
    ],
    destination: RATEM,
    ...NIGHT,
    missions: [],
    groupSize: 6,
  })

  check('nearest driver first', rows[0].driver.id === 'd-near')
  check('the small vehicle is flagged', rows[0].tooFewSeats === true)
  check('the large vehicle is not', rows[1].tooFewSeats === false)
  check('but the small one is still offered', rows.length === 2)
}

// --- 9. Shortlist size -----------------------------------------------------

section('9. The shortlist is longer than the requirement')
{
  check('2 seats → 4 names', shortlistSize(2) === 4, String(shortlistSize(2)))
  check('3 seats → 6 names', shortlistSize(3) === 6, String(shortlistSize(3)))
  check('6 seats → 10 names', shortlistSize(6) === 10, String(shortlistSize(6)))
}

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
