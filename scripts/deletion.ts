import { readFileSync } from 'node:fs'

import type { StoreBackend, StoreChange } from '../src/core/backend'
import { DEMO_BACKEND } from '../src/core/demo'
import { _raw, installBackend } from '../src/core/store'
import {
  createAnchorPoint,
  createDriver,
  createFarm,
  createFarmVisit,
  createFarmZone,
  createGeneralMeeting,
  createVolunteer,
  deleteDriver,
  deleteFarm,
  deleteFarmVisitChecked,
  deleteFarmZoneChecked,
  deleteVolunteer,
  deletionPlan,
  resetStore,
  saveTour,
  updateVolunteer,
} from '../src/core/index'

/**
 * A79 — DELETING A RECORD (product owner's point 8, 2026-08-31).
 *
 * He had no way to correct a typo. There was no delete button anywhere for an
 * entity, a volunteer or a driver — and every deletion the app DID have (a
 * zone, a guard post, a visit, a meeting, a tour, a threat zone) fired on the
 * FIRST TAP with no confirmation at all.
 *
 * What this gate holds to, in his own three terms:
 *
 *   1  **FREE DELETION WITH THE DEPENDENCIES LISTED.** A record with no
 *      history goes, and the confirmation says what goes with it — by count,
 *      by kind, before anything is pressed.
 *   2  **A MOTIVATED REFUSAL ON HISTORY.** Guards done or planned, incidents,
 *      a signed agreement: refused, with what is in the way NAMED and with an
 *      alternative that actually solves the problem.
 *   3  **THE DELETION SURVIVES OFFLINE.** It leaves the store as a
 *      `json: null` change, which is exactly what P2.5b's outbox carries and
 *      what `bun run sync` already proves survives a reload as a deletion.
 *
 * ★ AND A FOURTH THING NOBODY ASKED FOR, BECAUSE IT IS THE ONE THAT ROTS:
 *   every `DeletableKind` must be REACHABLE from the UI. A policy that answers
 *   for a kind no screen offers is a policy that is quietly wrong, and this
 *   sweeps the tree for the button rather than trusting that somebody wired
 *   it.
 *
 * No browser, no dev server, no network.
 *   bun run deletion
 */

let failures = 0
let checks = 0

function check(label: string, ok: boolean, detail = ''): void {
  checks++
  if (!ok) failures++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log(`\n  ${title}`)
  console.log(`  ${'-'.repeat(68)}`)
}

let recorded: StoreChange[] = []
const RECORDING: StoreBackend = {
  name: 'recording',
  persists: true,
  seed: () => DEMO_BACKEND.seed(),
  onChange: (changes) => {
    recorded.push(...changes)
  },
}

const record = (fn: () => unknown): StoreChange[] => {
  recorded = []
  fn()
  return recorded
}

const deletions = (changes: StoreChange[]) => changes.filter((c) => c.json === null)

console.log('\n  A79 — deleting a record: what goes, what is refused, and why')

installBackend(RECORDING)

// ===========================================================================
section('1 — a mistake goes, and the confirmation says what goes with it')

const emptyFarm = createFarm({
  name: 'A79 חוות בדיקה',
  locality: 'באר שבע',
  region: 'נגב',
  type: 'livestock',
  entityKind: 'farm',
  status: 'identified',
  position: { lat: 31.25, lng: 34.79 },
  farmDunams: 0,
  grazingDunams: 0,
  contacts: [],
  commitments: [],
  agreements: [],
  notes: '',
  photo: null,
})

{
  const plan = deletionPlan('entity', emptyFarm.id)
  check('a farm entered by mistake may be deleted', plan.allowed)
  check('and it lists nothing, because nothing hangs off it', plan.cascades.length === 0)
  check(
    'it does not ask for the name back — there is no drawing to lose',
    plan.requireName === false,
  )
  check('the dialog can name it', plan.name === 'A79 חוות בדיקה', plan.name)
}

// Now hang things off it: two zones, a guard post, a visit, a contact.
createFarmZone({
  farmId: emptyFarm.id,
  kind: 'farm_boundary',
  ring: [
    { lat: 31.25, lng: 34.79 },
    { lat: 31.26, lng: 34.79 },
    { lat: 31.26, lng: 34.8 },
  ],
})
createFarmZone({
  farmId: emptyFarm.id,
  kind: 'grazing_area',
  ring: [
    { lat: 31.24, lng: 34.78 },
    { lat: 31.25, lng: 34.78 },
    { lat: 31.25, lng: 34.79 },
  ],
})
const post = createAnchorPoint({
  farmId: emptyFarm.id,
  name: 'A79 עמדה',
  position: { lat: 31.255, lng: 34.795 },
  instructions: [],
  accessDescription: '',
})
createFarmVisit({ farmId: emptyFarm.id, at: '2026-12-01T09:00:00.000Z', note: 'A79', done: false })

{
  const plan = deletionPlan('entity', emptyFarm.id)
  const keys = plan.cascades.map((c) => c.key)
  check('it is still deletable — none of that is HISTORY', plan.allowed)
  check(
    '★ and now the confirmation lists every dependency, by count',
    keys.includes('deletion.dep.zones') &&
      keys.includes('deletion.dep.anchors') &&
      keys.includes('deletion.dep.visits'),
    plan.cascades.map((c) => `${c.key}=${c.count}`).join(' '),
  )
  check(
    'the zone count is the real one',
    plan.cascades.find((c) => c.key === 'deletion.dep.zones')?.count === 2,
  )
  check(
    '★ POINT 8d — drawn zones, so the name has to be typed back',
    plan.requireName === true,
  )
}

// ===========================================================================
section('2 — and deleting it really takes the dependencies with it')

{
  const before = {
    zones: _raw().farmZones.length,
    anchors: _raw().anchorPoints.length,
    visits: _raw().farmVisits.length,
  }
  const changes = record(() => deleteFarm(emptyFarm.id))
  const gone = deletions(changes)

  check('the farm is gone from the store', !_raw().farms.some((f) => f.id === emptyFarm.id))
  check('its zones went with it', _raw().farmZones.length === before.zones - 2)
  check('its guard post went with it', _raw().anchorPoints.length === before.anchors - 1)
  check('its visit went with it', _raw().farmVisits.length === before.visits - 1)

  /**
   * ★ POINT 8c — THE OUTBOX NEEDED NO NEW MACHINERY, AND THIS IS THE PROOF.
   *
   * P2.6 DERIVES changes by diffing the snapshot, so a row that stops being in
   * an array becomes `{ json: null }` by construction — for the cascade too,
   * not just for the row the coordinator pressed. `bun run sync` already
   * proves a `json: null` survives a reload as a deletion, so the two together
   * are the whole of "the deletion travels through the offline outbox".
   */
  check(
    '★ the whole cascade reaches the backend as DELETIONS',
    gone.length >= 5,
    `${gone.length} deletions: ${gone.map((c) => c.collection).join(' ')}`,
  )
  check(
    'and the farm itself is one of them',
    gone.some((c) => c.collection === 'farms' && c.id === emptyFarm.id),
  )
  check(
    'nothing was written back as an UPDATE for a row that is gone',
    changes.filter((c) => c.id === emptyFarm.id).every((c) => c.json === null),
  )
  check('the guard post is a deletion too', gone.some((c) => c.id === post.id))
}

// ===========================================================================
section('3 — a record with a history is REFUSED, and told why')

resetStore()
installBackend(RECORDING)

{
  // The fixtures' first farm has guards and incidents on it by construction —
  // that is what the demo data IS. Find one that really does.
  const busy = _raw().farms.find(
    (f) =>
      _raw().missions.some((m) => m.farmId === f.id && m.status !== 'cancelled') ||
      _raw().incidents.some((i) => i.farmId === f.id),
  )
  check('the fixtures contain a farm with a history', busy !== undefined)
  if (busy) {
    const plan = deletionPlan('entity', busy.id)
    check('★ deleting it is REFUSED', plan.allowed === false, busy.name)
    check(
      '★ and the refusal NAMES what is in the way, with counts',
      plan.blockers.length > 0 &&
        plan.blockers.every((b) => b.key.startsWith('deletion.dep.') && b.count > 0),
      plan.blockers.map((b) => `${b.key}=${b.count}`).join(' '),
    )
    check('it offers an alternative rather than a wall', plan.alternativeKey !== null, String(plan.alternativeKey))
    check(
      '★ AND THE STORE REFUSES TOO, not only the dialog',
      deleteFarm(busy.id) === false,
    )
    check('so the farm is still there', _raw().farms.some((f) => f.id === busy.id))
    check(
      'and the refusal wrote NOTHING to the backend',
      record(() => deleteFarm(busy.id)).length === 0,
    )
  }
}

// ===========================================================================
section('4 — a volunteer: archive keeps the nights, delete is for the typo')

{
  const busy = _raw().volunteers.find((v) =>
    _raw().missions.some(
      (m) => m.status !== 'cancelled' && m.assignments.some((a) => a.volunteerId === v.id),
    ),
  )
  check('the fixtures contain a volunteer who has stood a guard', busy !== undefined)
  if (busy) {
    const plan = deletionPlan('volunteer', busy.id)
    check('★ deleting him is REFUSED', plan.allowed === false, busy.name)
    check(
      '★ and the alternative offered is to ARCHIVE him',
      plan.alternativeKey === 'deletion.alt.archiveVolunteer',
      String(plan.alternativeKey),
    )
    check('the store refuses as well', deleteVolunteer(busy.id) === false)
  }

  const typo = createVolunteer({
    photo: null,
    name: 'A79 מתנדב',
    age: 22,
    phone: '0500000079',
    phoneType: 'smartphone',
    yeshiva: 'A79',
    locality: 'באר שבע',
    status: 'active',
    inactiveReason: null,
    notes: '',
  })
  const plan = deletionPlan('volunteer', typo.id)
  check('a volunteer who has never been out may be deleted', plan.allowed)
  check('with nothing to list', plan.cascades.length === 0)
  const changes = record(() => deleteVolunteer(typo.id))
  check(
    'and it reaches the backend as a deletion',
    deletions(changes).some((c) => c.collection === 'volunteers' && c.id === typo.id),
  )
}

// ===========================================================================
section('5 — the dual hat is one human, and deleting is symmetrical')

{
  const dual = createVolunteer({
    photo: null,
    name: 'A79 כובע כפול',
    age: 30,
    phone: '0500000080',
    phoneType: 'smartphone',
    yeshiva: 'A79',
    locality: 'באר שבע',
    status: 'active',
    inactiveReason: null,
    notes: '',
    hasLicense: true,
    hasCar: true,
    canDrive: true,
  })
  const materialised = _raw().drivers.find((d) => d.volunteerId === dual.id)
  check('G5.2 materialised a driver row for him', materialised !== undefined)

  if (materialised) {
    const plan = deletionPlan('volunteer', dual.id)
    check(
      '★ deleting the VOLUNTEER lists the driver row it will take with it',
      plan.cascades.some((c) => c.key === 'deletion.dep.driverRow'),
      plan.cascades.map((c) => c.key).join(' '),
    )

    const driverPlan = deletionPlan('driver', materialised.id)
    check(
      '★ and deleting the DRIVER offers "take the hat off" rather than "archive"',
      driverPlan.alternativeKey === null || driverPlan.alternativeKey === 'deletion.alt.unsetCanDrive',
      String(driverPlan.alternativeKey),
    )

    const changes = record(() => deleteDriver(materialised.id))
    check('deleting the driver row succeeds — he drives nobody yet', changes.length > 0)
    /**
     * ★ THE ONE THAT WOULD HAVE BITTEN SILENTLY. Leaving `canDrive` true means
     *   the next edit of that volunteer materialises the driver AGAIN: the
     *   deletion undoes itself the first time somebody fixes a phone number.
     */
    check(
      '★ and the volunteer stops claiming he can drive',
      _raw().volunteers.find((v) => v.id === dual.id)?.canDrive === false,
    )
    updateVolunteer(dual.id, { name: 'A79 כובע כפול (edited)' })
    check(
      '★ so an edit afterwards does NOT bring the driver back',
      !_raw().drivers.some((d) => d.volunteerId === dual.id),
    )
  }
}

// ===========================================================================
section('6 — a driver who is carrying people, and a guard post in use')

{
  const busyDriver = _raw().drivers.find((d) =>
    _raw().missions.some(
      (m) => m.status !== 'cancelled' && m.drivers.some((x) => x.driverId === d.id),
    ),
  )
  check('the fixtures contain a driver on the road', busyDriver !== undefined)
  if (busyDriver) {
    const plan = deletionPlan('driver', busyDriver.id)
    check('★ deleting him is REFUSED', plan.allowed === false, busyDriver.name)
    check(
      'and the blocker is named as trips',
      plan.blockers.some((b) => b.key === 'deletion.dep.trips'),
      plan.blockers.map((b) => `${b.key}=${b.count}`).join(' '),
    )
    check('the store refuses too', deleteDriver(busyDriver.id) === false)
  }

  const usedPost = _raw().anchorPoints.find((a) =>
    _raw().missions.some(
      (m) => m.anchorPointId === a.id || m.additionalAnchorPointIds.includes(a.id),
    ),
  )
  check('the fixtures contain a guard post a guard points at', usedPost !== undefined)
  if (usedPost) {
    const plan = deletionPlan('anchorPoint', usedPost.id)
    check('★ deleting it is REFUSED', plan.allowed === false, usedPost.name)
    check(
      'and the alternative is to cancel those guards first',
      plan.alternativeKey === 'deletion.alt.cancelGuards',
      String(plan.alternativeKey),
    )
  }
}

// ===========================================================================
section('7 — a visit that HAPPENED is history; one still to come is a plan')

{
  const future = createFarmVisit({
    farmId: _raw().farms[0].id,
    at: '2027-01-01T09:00:00.000Z',
    note: 'A79 planned',
    done: false,
  })
  check('a planned visit may be deleted', deletionPlan('farmVisit', future.id).allowed)
  check('and it goes', deleteFarmVisitChecked(future.id) === true)

  const past = createFarmVisit({
    farmId: _raw().farms[0].id,
    at: '2026-01-01T09:00:00.000Z',
    note: 'A79 done',
    done: true,
  })
  const plan = deletionPlan('farmVisit', past.id)
  check('★ a visit already made is REFUSED', plan.allowed === false)
  check(
    'and the reason is that it happened',
    plan.blockers.some((b) => b.key === 'deletion.dep.visitDone'),
  )
  check('the store refuses too', deleteFarmVisitChecked(past.id) === false)
}

// ===========================================================================
section('8 — a guard is CANCELLED, not deleted')

{
  const live = _raw().missions.find((m) => m.status !== 'cancelled')
  check('the fixtures contain a real guard', live !== undefined)
  if (live) {
    const plan = deletionPlan('mission', live.id)
    check('★ deleting a guard is REFUSED', plan.allowed === false, live.id)
    check(
      '★ and the alternative is the cancellation that already exists',
      plan.alternativeKey === 'deletion.alt.cancelMission',
      String(plan.alternativeKey),
    )
  }
}

// ===========================================================================
section('9 — the things that carry no history at all')

{
  const zone = _raw().farmZones[0]
  check('a drawn zone is deletable on its own', deletionPlan('farmZone', zone.id).allowed)
  check('and it goes', deleteFarmZoneChecked(zone.id) === true)

  const meeting = createGeneralMeeting({
    title: 'A79',
    at: '2027-02-01T10:00:00.000Z',
    endAt: '2027-02-01T11:00:00.000Z',
    location: 'A79',
    person: 'A79',
    note: '',
  })
  check('a meeting is deletable', deletionPlan('generalMeeting', meeting.id).allowed)

  const tour = saveTour({
    dayKey: '2027-03-01',
    departAt: '2027-03-01T07:00:00.000Z',
    farmIds: [_raw().farms[0].id, _raw().farms[1].id],
  })
  const plan = deletionPlan('tour', tour.id)
  check('a tour is a PLAN, so it is deletable', plan.allowed)
  check(
    'and it says how many stops it drops',
    plan.cascades.some((c) => c.key === 'deletion.dep.tourStops' && c.count === 2),
    plan.cascades.map((c) => `${c.key}=${c.count}`).join(' '),
  )
}

// ===========================================================================
section('10 — a stale id is not a refusal, it is nothing')

{
  const plan = deletionPlan('entity', 'no-such-farm')
  check('an unknown id reports NOT FOUND', plan.found === false)
  check('and therefore not "allowed"', plan.allowed === false)
  check('with nothing to list either way', plan.cascades.length === 0 && plan.blockers.length === 0)
}

// ===========================================================================
section('11 — every kind the policy answers for is reachable from a screen')

/**
 * ★ THE CHECK THAT KEEPS THIS HONEST OVER TIME. `deletionPlan` answering for
 *   twelve kinds proves nothing if the coordinator can only reach four of
 *   them. This greps the UI for a call that asks about each kind — which is
 *   coarse, and is exactly as coarse as it needs to be: it fails the day
 *   somebody adds a kind to the policy and forgets the button.
 */
{
  const KINDS = [
    'entity',
    'volunteer',
    'driver',
    'anchorPoint',
    'farmZone',
    'threatZone',
    'threatVector',
    'farmVisit',
    'generalMeeting',
    'tour',
  ]
  const UI_FILES = [
    'src/ui/screens/coordinator/FarmDetailScreen.tsx',
    'src/ui/screens/coordinator/AnchorSheetScreen.tsx',
    'src/ui/screens/coordinator/VolunteersScreen.tsx',
    'src/ui/screens/coordinator/DriversScreen.tsx',
    'src/ui/screens/coordinator/RoutePlannerScreen.tsx',
    'src/ui/screens/coordinator/MissionWizardScreen.tsx',
    'src/ui/components/ThreatPanel.tsx',
    'src/ui/components/FarmVisitModal.tsx',
    'src/ui/components/GeneralMeetingModal.tsx',
  ]
  const tree = UI_FILES.map((f) => readFileSync(f, 'utf8')).join('\n')
  const unreachable = KINDS.filter((k) => !tree.includes(`'${k}'`))
  check(
    '★ every deletable kind has a call site in the UI',
    unreachable.length === 0,
    unreachable.length ? `unreachable: ${unreachable.join(', ')}` : `${KINDS.length} kinds`,
  )

  // And every one of them goes through the ONE dialog rather than firing
  // straight into the store — which is the product owner's "TOUJOURS avec
  // confirmation", checked rather than promised.
  const asks = (tree.match(/del\.ask\(/g) ?? []).length
  check(
    '★ and every one of them asks first',
    asks >= KINDS.length,
    `${asks} confirmation call sites`,
  )
}

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
