import { readFileSync } from 'node:fs'

import { COLLECTIONS } from '../src/core/backend'
import type { Collection, StoreBackend, StoreChange } from '../src/core/backend'
import { DEMO_BACKEND, emptyData } from '../src/core/demo'
import {
  addIncident,
  addIncidentEntry,
  archiveVolunteer,
  backendName,
  cancelMission,
  confirmArrival,
  confirmGuardEnd,
  createAnchorPoint,
  createDriver,
  createFarm,
  createFarmVisit,
  createFarmZone,
  createGeneralMeeting,
  createMission,
  createThreatVector,
  createThreatZone,
  createVolunteer,
  clearMissionMeetingPoints,
  deleteAnchorPoint,
  deleteDriver,
  deleteFarm,
  deleteFarmContact,
  deleteFarmVisit,
  deleteFarmVisitChecked,
  deleteFarmZone,
  deleteFarmZoneChecked,
  deleteMission,
  deleteTourById,
  deleteVolunteer,
  deleteGeneralMeeting,
  deleteThreatVector,
  deleteThreatZone,
  deleteTour,
  importDrivers,
  importFarms,
  importVolunteers,
  installBackend,
  patchAnchorPoint,
  reactivateMission,
  reactivateVolunteer,
  replaceSnapshot,
  resetStore,
  saveTour,
  setCommitmentFulfilled,
  setIncidentResolved,
  setMissionDriverConfirmed,
  setOutreachSent,
  setPresence,
  setSession,
  updateAnchorPoint,
  updateDriver,
  updateFarm,
  updateFarmVisit,
  updateFarmZoneRing,
  updateGeneralMeeting,
  updateMissionStaffing,
  updateThreatVector,
  updateThreatZone,
  updateVolunteer,
  _raw,
} from '../src/core/store'
import { DEFAULT_AVAILABILITY } from '../src/core/types'

/**
 * A73 — THE WRITE-THROUGH IS DERIVED, AND THIS IS WHAT KEEPS IT HONEST (P2.6).
 *
 * P2.6 put the store behind an interface with two implementations. The demo one
 * persists nothing; the Supabase one has to turn each of the 53 mutations into
 * rows. It learns WHAT to write from a structural diff of the snapshot rather
 * than from 53 hand-written declarations — see the long note on `indexOf`.
 *
 * That decision buys correctness that nobody has to remember, and it buys it on
 * one condition: the diff must actually be structural. The day somebody
 * replaces `JSON.stringify` with a reference comparison "because it is faster",
 * every mutation that writes IN PLACE — `setIncidentResolved`, every
 * `withMission` caller, `archiveVolunteer`, `setCommitmentFulfilled` — starts
 * persisting NOTHING, silently, and the failure surfaces a week later as a
 * night of presence marks that never left the iPad.
 *
 * So this gate drives EVERY exported mutation through a recording backend and
 * asserts what each one emits. It needs no browser, no dev server, no network
 * and no password.
 *
 *   bun run persist
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

// --- The recording backend -------------------------------------------------

let recorded: StoreChange[] = []

const RECORDING: StoreBackend = {
  name: 'recording',
  persists: true,
  seed: () => DEMO_BACKEND.seed(),
  onChange: (changes) => {
    recorded.push(...changes)
  },
}

/** Names actually driven below, cross-checked against @core/index at the end. */
const driven = new Set<string>()

function drive(name: string, fn: () => void): StoreChange[] {
  recorded = []
  fn()
  driven.add(name)
  return recorded
}

const hit = (
  changes: StoreChange[],
  collection: Collection,
  id: string,
): StoreChange | undefined =>
  changes.find((c) => c.collection === collection && c.id === id)

/** One mutation, and exactly the aggregates it must have touched. */
function emits(
  name: string,
  fn: () => void,
  expected: Array<[Collection, string]>,
  gone: Array<[Collection, string]> = [],
): void {
  const changes = drive(name, fn)
  const missing = expected.filter(([c, id]) => {
    const found = hit(changes, c, id)
    return !found || found.json === null
  })
  const notGone = gone.filter(([c, id]) => hit(changes, c, id)?.json !== null)
  const ok = missing.length === 0 && notGone.length === 0
  const detail = ok
    ? changes.map((c) => `${c.collection}/${c.id}${c.json === null ? ' ✗' : ''}`).join(' ')
    : `missing ${missing.map(([c, i]) => `${c}/${i}`).join(' ')}${
        notGone.length ? ` not-deleted ${notGone.map(([c, i]) => `${c}/${i}`).join(' ')}` : ''
      }`
  check(name, ok, detail.slice(0, 120))
}

// ===========================================================================

console.log('\n  A73 — the store interface and its derived write-through (P2.6)')

// --- 1. The default is the demo backend, and it persists nothing -----------

section('1 — the default implementation is DEMO, and it costs nothing')

check('the default backend is the demo one', backendName() === 'demo', backendName())
check(
  'it seeds the fixtures, not an empty app',
  _raw().volunteers.length > 100 && _raw().farms.length > 5,
  `${_raw().farms.length} farms, ${_raw().volunteers.length} volunteers`,
)
check('the demo backend declares no persistence', DEMO_BACKEND.persists === false)
check(
  'and therefore has no onChange to call',
  DEMO_BACKEND.onChange === undefined,
)
{
  // The proof that demo mode is byte-for-byte the pre-P2.6 path: with no
  // recorder installed, a mutation cannot deliver a change to anybody.
  const before = recorded.length
  archiveVolunteer(_raw().volunteers[0].id, 'A73')
  check('a mutation on the demo backend emits nothing', recorded.length === before)
  resetStore()
}

// --- 2. COLLECTIONS covers the snapshot ------------------------------------

section('2 — every array in the snapshot is a persisted collection')

{
  const keys = Object.keys(emptyData()).filter((k) => k !== 'session')
  const listed = new Set<string>(COLLECTIONS)
  const unpersisted = keys.filter((k) => !listed.has(k))
  check(
    'no collection is missing from COLLECTIONS',
    unpersisted.length === 0,
    unpersisted.length ? unpersisted.join(', ') : `${keys.length} collections`,
  )
  const phantom = [...listed].filter((c) => !keys.includes(c))
  check('and none is listed that does not exist', phantom.length === 0, phantom.join(', '))
  check(
    'session is NOT a collection — it is who is looking',
    !listed.has('session' as Collection),
  )
}

// --- 3. Every mutation, through the recorder -------------------------------

section('3 — every exported mutation emits the aggregates it changed')

installBackend(RECORDING)
check('the recording backend is installed', backendName() === 'recording')
check(
  'installing re-seeded the snapshot',
  _raw().farms.length > 5,
  `${_raw().farms.length} farms`,
)

const farmId = _raw().farms[0].id
const volunteerId = _raw().volunteers[0].id
const driverId = _raw().drivers[0].id
const missionId = _raw().missions[0].id
const incidentId = _raw().incidents[0].id
const anchorId = _raw().anchorPoints.find((a) => a.farmId === farmId)!.id
const zoneId = _raw().farmZones.find((z) => z.farmId === farmId)!.id
const threatZoneId = _raw().threatZones[0].id
const threatVectorId = _raw().threatVectors[0].id
const meetingId = _raw().generalMeetings[0].id
const visitId = _raw().farmVisits[0].id
const tourDayKey = _raw().tours[0].dayKey

// Incidents ----------------------------------------------------------------
let newIncidentId = ''
emits(
  'addIncident',
  () => {
    newIncidentId = addIncident({
      farmId,
      missionId: null,
      source: 'coordinator',
      reporterId: null,
      reporterName: 'A73',
      severity: 'observation',
      description: 'gate left open',
      position: null,
    }).id
  },
  [],
)
check('addIncident emitted the new incident', hit(recorded, 'incidents', newIncidentId) !== undefined)

emits('addIncidentEntry', () => addIncidentEntry(incidentId, 'A73', 'note'), [
  ['incidents', incidentId],
])
emits('setIncidentResolved', () => setIncidentResolved(incidentId, true), [
  ['incidents', incidentId],
])

// Missions -----------------------------------------------------------------
emits('confirmArrival', () => confirmArrival(missionId), [['missions', missionId]])
emits(
  'setPresence',
  () => setPresence(missionId, _raw().missions[0].assignments[0].volunteerId, 'inbound', 'driver', 'present'),
  [['missions', missionId]],
)
emits('confirmGuardEnd', () => confirmGuardEnd(missionId), [['missions', missionId]])
emits(
  'setMissionDriverConfirmed',
  () => setMissionDriverConfirmed(missionId, _raw().missions[0].drivers[0].driverId, false),
  [['missions', missionId]],
)
emits(
  'updateMissionStaffing',
  () => updateMissionStaffing(missionId, [volunteerId], [], 'planned', 4),
  [['missions', missionId]],
)
emits('cancelMission', () => cancelMission(missionId, 'weather', 'חול'), [
  ['missions', missionId],
])
emits(
  'setOutreachSent',
  () => setOutreachSent(missionId, 'cancelled', 'volunteer', volunteerId, true),
  [['missions', missionId]],
)
emits('reactivateMission', () => reactivateMission(missionId), [['missions', missionId]])

let createdMissionId = ''
emits(
  'createMission',
  () => {
    createdMissionId = createMission({
      farmId,
      anchorPointId: anchorId,
      startAt: new Date().toISOString(),
      endAt: new Date().toISOString(),
      volunteerIds: [volunteerId],
    }).id
  },
  [],
)
check('createMission emitted the new guard', hit(recorded, 'missions', createdMissionId) !== undefined)

// Volunteers and drivers ---------------------------------------------------
emits('archiveVolunteer', () => archiveVolunteer(volunteerId, 'מילואים'), [
  ['volunteers', volunteerId],
])
emits('reactivateVolunteer', () => reactivateVolunteer(volunteerId), [
  ['volunteers', volunteerId],
])

let createdVolunteerId = ''
emits(
  'createVolunteer',
  () => {
    createdVolunteerId = createVolunteer({
      photo: null,
      name: 'א73',
      age: 20,
      phone: '050-9999901',
      phoneType: 'smartphone',
      yeshiva: '',
      locality: 'באר שבע',
      status: 'active',
      inactiveReason: null,
      notes: '',
      availability: { ...DEFAULT_AVAILABILITY },
    }).id
  },
  [],
)
check(
  'createVolunteer emitted the new volunteer',
  hit(recorded, 'volunteers', createdVolunteerId) !== undefined,
)

let createdDriverId = ''
emits(
  'createDriver',
  () => {
    createdDriverId = createDriver({
      photo: null,
      name: 'נ73',
      phone: '050-9999902',
      vehicle: '',
      seats: 4,
      locality: 'באר שבע',
      availabilityNote: '',
      notes: '',
    }).id
  },
  [],
)
check('createDriver emitted the new driver', hit(recorded, 'drivers', createdDriverId) !== undefined)

emits(
  'updateDriver',
  () =>
    updateDriver(driverId, {
      photo: null,
      name: 'נ73ב',
      phone: '050-9999903',
      vehicle: 'טרנזיט',
      seats: 8,
      locality: 'אופקים',
      availabilityNote: '',
      notes: '',
    }),
  [['drivers', driverId]],
)

// Farms --------------------------------------------------------------------
const farmDraft = () => {
  const f = _raw().farms.find((x) => x.id === farmId)!
  return {
    photo: f.photo,
    name: f.name,
    locality: f.locality,
    region: f.region,
    type: f.type,
    status: f.status,
    position: f.position,
    farmDunams: f.farmDunams,
    grazingDunams: f.grazingDunams,
    contacts: f.contacts,
    commitments: f.commitments,
    agreements: f.agreements,
    notes: 'A73',
  }
}
emits('updateFarm', () => updateFarm(farmId, farmDraft()), [['farms', farmId]])

let createdFarmId = ''
emits(
  'createFarm',
  () => {
    createdFarmId = createFarm({ ...farmDraft(), name: 'חוות א73' }).id
  },
  [],
)
check('createFarm emitted the new entity', hit(recorded, 'farms', createdFarmId) !== undefined)

{
  const withCommitment = _raw().farms.find((f) => f.commitments.length > 0)!
  emits(
    'setCommitmentFulfilled',
    () => setCommitmentFulfilled(withCommitment.id, 0, !withCommitment.commitments[0].fulfilled),
    [['farms', withCommitment.id]],
  )
}

// Zones, anchors, threats --------------------------------------------------
let createdZoneId = ''
emits(
  'createFarmZone',
  () => {
    createdZoneId = createFarmZone({
      farmId,
      kind: 'grazing_area',
      ring: [
        { lat: 31.0, lng: 34.6 },
        { lat: 31.01, lng: 34.6 },
        { lat: 31.01, lng: 34.61 },
      ],
    }).id
  },
  [['farms', farmId]],
)
check('createFarmZone emitted the zone too', hit(recorded, 'farmZones', createdZoneId) !== undefined)

emits(
  'updateFarmZoneRing',
  () =>
    updateFarmZoneRing(zoneId, [
      { lat: 31.05, lng: 34.65 },
      { lat: 31.07, lng: 34.65 },
      { lat: 31.07, lng: 34.67 },
    ]),
  [['farmZones', zoneId], ['farms', farmId]],
)
emits('deleteFarmZone', () => deleteFarmZone(createdZoneId), [['farms', farmId]], [
  ['farmZones', createdZoneId],
])

let createdAnchorId = ''
emits(
  'createAnchorPoint',
  () => {
    createdAnchorId = createAnchorPoint({
      farmId,
      name: 'עמדה א73',
      position: { lat: 31.06, lng: 34.65 },
      instructions: [],
      accessDescription: '',
    }).id
  },
  [],
)
check('createAnchorPoint emitted the post', hit(recorded, 'anchorPoints', createdAnchorId) !== undefined)

emits(
  'updateAnchorPoint',
  () =>
    updateAnchorPoint(anchorId, {
      farmId,
      name: 'עמדה א73ב',
      position: { lat: 31.061, lng: 34.651 },
      instructions: ['אפוד'],
      accessDescription: 'מכביש 40',
    }),
  [['anchorPoints', anchorId]],
)
emits(
  'patchAnchorPoint',
  () => patchAnchorPoint(anchorId, { position: { lat: 31.062, lng: 34.652 } }),
  [['anchorPoints', anchorId]],
)
emits('deleteAnchorPoint', () => void deleteAnchorPoint(createdAnchorId), [], [
  ['anchorPoints', createdAnchorId],
])

let createdThreatId = ''
emits(
  'createThreatZone',
  () => {
    createdThreatId = createThreatZone({
      farmId: null,
      ring: [
        { lat: 31.0, lng: 34.6 },
        { lat: 31.01, lng: 34.6 },
        { lat: 31.01, lng: 34.61 },
      ],
      intensity: 'high',
      note: '',
    }).id
  },
  [],
)
check('createThreatZone emitted it', hit(recorded, 'threatZones', createdThreatId) !== undefined)
emits('updateThreatZone', () => updateThreatZone(threatZoneId, { intensity: 'low' }), [
  ['threatZones', threatZoneId],
])
emits('deleteThreatZone', () => deleteThreatZone(createdThreatId), [], [
  ['threatZones', createdThreatId],
])

let createdVectorId = ''
emits(
  'createThreatVector',
  () => {
    createdVectorId = createThreatVector({
      farmId: null,
      origin: { lat: 31.0, lng: 34.6 },
      target: { lat: 31.05, lng: 34.65 },
      intensity: 'medium',
      note: '',
    }).id
  },
  [],
)
check('createThreatVector emitted it', hit(recorded, 'threatVectors', createdVectorId) !== undefined)
emits('updateThreatVector', () => updateThreatVector(threatVectorId, { intensity: 'high' }), [
  ['threatVectors', threatVectorId],
])
emits('deleteThreatVector', () => deleteThreatVector(createdVectorId), [], [
  ['threatVectors', createdVectorId],
])

// Visits, meetings, tours --------------------------------------------------
let createdVisitId = ''
emits(
  'createFarmVisit',
  () => {
    createdVisitId = createFarmVisit({
      farmId,
      at: new Date(Date.now() + 86_400_000).toISOString(),
      note: 'A73',
      done: false,
    }).id
  },
  [['farms', farmId]],
)
check('createFarmVisit emitted the visit too', hit(recorded, 'farmVisits', createdVisitId) !== undefined)

emits(
  'updateFarmVisit',
  () =>
    updateFarmVisit(visitId, {
      farmId: _raw().farmVisits.find((v) => v.id === visitId)!.farmId,
      at: new Date(Date.now() + 172_800_000).toISOString(),
      note: 'A73b',
      done: false,
    }),
  [['farmVisits', visitId]],
)
emits('deleteFarmVisit', () => deleteFarmVisit(createdVisitId), [['farms', farmId]], [
  ['farmVisits', createdVisitId],
])

let createdMeetingId = ''
emits(
  'createGeneralMeeting',
  () => {
    createdMeetingId = createGeneralMeeting({
      title: 'A73',
      at: new Date().toISOString(),
      endAt: new Date().toISOString(),
      location: '',
      person: '',
      note: '',
    }).id
  },
  [],
)
check('createGeneralMeeting emitted it', hit(recorded, 'generalMeetings', createdMeetingId) !== undefined)
emits('updateGeneralMeeting', () => updateGeneralMeeting(meetingId, { title: 'A73b' }), [
  ['generalMeetings', meetingId],
])
emits('deleteGeneralMeeting', () => deleteGeneralMeeting(createdMeetingId), [], [
  ['generalMeetings', createdMeetingId],
])

emits(
  'saveTour (new day)',
  () => saveTour({ dayKey: '2027-01-01', departAt: new Date().toISOString(), farmIds: [farmId] }),
  [],
)
check('saveTour created a tour', recorded.some((c) => c.collection === 'tours' && c.json !== null))
emits(
  'saveTour',
  () =>
    saveTour({
      dayKey: tourDayKey,
      departAt: new Date().toISOString(),
      farmIds: [farmId],
    }),
  [['tours', _raw().tours.find((t) => t.dayKey === tourDayKey)!.id]],
)
emits('deleteTour', () => deleteTour('2027-01-01'), [], [
  ['tours', _raw().tours.find((t) => t.dayKey === '2027-01-01')?.id ?? 'gone'],
])

/**
 * PO POINT 8 (2026-08-31) — the deletions, driven through the recorder like
 * everything else.
 *
 * ★ THEY ARE HERE BECAUSE THIS GATE PUT THEM HERE. Section 7 below cross-checks
 *   the names @core exports against the names actually driven, and it failed
 *   the moment `core/deletion.ts` landed — nine new mutations, none exercised.
 *   That is precisely the failure mode it exists for, and it caught it on the
 *   first run rather than in the field.
 *
 * ★ AND WHAT `emits` PROVES HERE IS THE THING P2.5b's OUTBOX DEPENDS ON: a
 *   deletion reaches the backend as `json: null`, for the CASCADE as well as
 *   for the row. `bun run deletion` asserts the policy; this asserts the wire.
 */
{
  // ★ `agreements: []` IS LOAD-BEARING. `farmDraft()` copies the fixture
  //   farm's SIGNED AGREEMENT, and a signed agreement is one of point 8's
  //   blockers — so a doomed farm cloned from it is refused, correctly, and
  //   this gate would be asserting the wrong thing.
  const doomed = createFarm({ ...farmDraft(), name: 'A73 למחיקה', agreements: [] })
  const doomedZone = createFarmZone({
    farmId: doomed.id,
    kind: 'grazing_area',
    ring: [
      { lat: 31.2, lng: 34.7 },
      { lat: 31.21, lng: 34.7 },
      { lat: 31.21, lng: 34.71 },
    ],
  })
  emits('deleteFarmZoneChecked', () => void deleteFarmZoneChecked(doomedZone.id), [], [
    ['farmZones', doomedZone.id],
  ])

  const doomedVisit = createFarmVisit({
    farmId: doomed.id,
    at: '2027-06-01T09:00:00.000Z',
    note: 'A73',
    done: false,
  })
  emits('deleteFarmVisitChecked', () => void deleteFarmVisitChecked(doomedVisit.id), [], [
    ['farmVisits', doomedVisit.id],
  ])

  const doomedTour = saveTour({
    dayKey: '2027-04-04',
    departAt: '2027-04-04T07:00:00.000Z',
    farmIds: [doomed.id],
  })
  emits('deleteTourById', () => void deleteTourById(doomedTour.id), [], [
    ['tours', doomedTour.id],
  ])

  // The entity last, so its cascade has something to take with it.
  const doomedAnchor = createAnchorPoint({
    farmId: doomed.id,
    name: 'A73 עמדה',
    position: { lat: 31.205, lng: 34.705 },
    instructions: [],
    accessDescription: '',
  })
  emits('deleteFarm', () => void deleteFarm(doomed.id), [], [
    ['farms', doomed.id],
    ['anchorPoints', doomedAnchor.id],
  ])

  const doomedVolunteer = createVolunteer({
    photo: null,
    name: 'A73 למחיקה',
    age: 21,
    phone: '0500000073',
    phoneType: 'smartphone',
    yeshiva: 'A73',
    locality: 'באר שבע',
    status: 'active',
    inactiveReason: null,
    notes: '',
    hasLicense: true,
    hasCar: true,
    canDrive: true,
  })
  const dualDriver = _raw().drivers.find((d) => d.volunteerId === doomedVolunteer.id)!
  // The DRIVER first: deleting it also writes `canDrive: false` back onto the
  // volunteer, which is a fan-out this gate exists to catch.
  emits(
    'deleteDriver',
    () => void deleteDriver(dualDriver.id),
    [['volunteers', doomedVolunteer.id]],
    [['drivers', dualDriver.id]],
  )
  emits('deleteVolunteer', () => void deleteVolunteer(doomedVolunteer.id), [], [
    ['volunteers', doomedVolunteer.id],
  ])

  // A contact off a farm that stays: the FARM is what changes, not a row of
  // its own — contacts are embedded, which is why this looks different.
  {
    const host = _raw().farms.find((f) => f.contacts.length > 1)!
    const victim = host.contacts[host.contacts.length - 1]
    emits('deleteFarmContact', () => void deleteFarmContact(victim.id), [['farms', host.id]])
  }

  // A guard that was abandoned in the wizard, and one that was not.
  {
    const live = _raw().missions.find((m) => m.status !== 'cancelled')!
    const changes = drive('deleteMission (refused)', () => void deleteMission(live.id))
    check(
      'deleteMission REFUSES a real guard and writes nothing',
      changes.length === 0 && _raw().missions.some((m) => m.id === live.id),
      `${changes.length} change(s)`,
    )
  }
  {
    const abandoned = createMission({
      farmId: _raw().farms[0].id,
      anchorPointId: _raw().anchorPoints[0].id,
      additionalAnchorPointIds: [],
      startAt: '2027-05-01T20:00:00.000Z',
      endAt: '2027-05-02T05:00:00.000Z',
      requiredVolunteers: 3,
      volunteerIds: [],
      drivers: [],
      // `recruiting` IS the draft in this model — there is no `draft` status
      // (G4). `createMission` defaults to `planned`, which is a guard somebody
      // scheduled, and point 8 refuses those.
      status: 'recruiting',
      pickupPoint: { lat: 31.25, lng: 34.79 },
      dropoffPoint: { lat: 31.26, lng: 34.8 },
      returnPickupPoint: null,
      returnDropoffPoint: null,
      notes: '',
    })
    emits('clearMissionMeetingPoints', () => void clearMissionMeetingPoints(abandoned.id), [
      ['missions', abandoned.id],
    ])
    emits('deleteMission', () => void deleteMission(abandoned.id), [], [
      ['missions', abandoned.id],
    ])
  }
}

// Imports ------------------------------------------------------------------
{
  const before = _raw().farms.length
  const changes = drive('importFarms', () =>
    importFarms([{ ...farmDraft(), name: 'ייבוא א73' }]),
  )
  check(
    'importFarms emits one change per imported entity',
    _raw().farms.length === before + 1 &&
      changes.filter((c) => c.collection === 'farms' && c.json !== null).length >= 1,
    `${changes.length} changes`,
  )
}
{
  const changes = drive('importDrivers', () =>
    importDrivers([
      {
        photo: null,
        name: 'ייבוא נ',
        phone: '050-9999904',
        vehicle: '',
        seats: 4,
        locality: '',
        availabilityNote: '',
        notes: '',
      },
    ]),
  )
  check(
    'importDrivers emits the imported driver',
    changes.some((c) => c.collection === 'drivers' && c.json !== null),
    `${changes.length} changes`,
  )
}
{
  const changes = drive('importVolunteers', () =>
    importVolunteers([
      {
        photo: null,
        name: 'ייבוא מ',
        age: 21,
        phone: '050-9999905',
        phoneType: 'kosher',
        yeshiva: '',
        locality: '',
        status: 'active',
        inactiveReason: null,
        notes: '',
      },
    ]),
  )
  check(
    'importVolunteers emits the imported volunteer',
    changes.some((c) => c.collection === 'volunteers' && c.json !== null),
    `${changes.length} changes`,
  )
}

// --- 4. The fan-outs a hand-written declaration would have missed ----------

section('4 — the fan-outs: one mutation, two aggregates')

{
  const changes = drive('zone → farm dunams', () =>
    createFarmZone({
      farmId,
      kind: 'farm_boundary',
      ring: [
        { lat: 31.2, lng: 34.7 },
        { lat: 31.25, lng: 34.7 },
        { lat: 31.25, lng: 34.75 },
      ],
    }),
  )
  check(
    'G15 — drawing a polygon also rewrites the farm it belongs to',
    hit(changes, 'farms', farmId) !== undefined,
    changes.map((c) => c.collection).join(' + '),
  )
}
{
  const v = _raw().volunteers.find((x) => !x.canDrive)!
  const changes = drive('updateVolunteer', () =>
    updateVolunteer(v.id, {
      photo: v.photo,
      name: v.name,
      age: v.age,
      phone: v.phone,
      phoneType: v.phoneType,
      yeshiva: v.yeshiva,
      locality: v.locality,
      status: v.status,
      inactiveReason: v.inactiveReason,
      notes: v.notes,
      hasLicense: true,
      hasCar: true,
      canDrive: true,
    }),
  )
  check(
    'G5.2 — the dual hat materialises a driver row, and it is persisted',
    hit(changes, 'volunteers', v.id) !== undefined &&
      changes.some((c) => c.collection === 'drivers' && c.json !== null),
    changes.map((c) => c.collection).join(' + '),
  )
  const off = drive('volunteer → driver (off)', () =>
    updateVolunteer(v.id, {
      photo: v.photo,
      name: v.name,
      age: v.age,
      phone: v.phone,
      phoneType: v.phoneType,
      yeshiva: v.yeshiva,
      locality: v.locality,
      status: v.status,
      inactiveReason: v.inactiveReason,
      notes: v.notes,
      canDrive: false,
    }),
  )
  check(
    'and un-ticking it DELETES that row rather than orphaning it',
    off.some((c) => c.collection === 'drivers' && c.json === null),
    off.map((c) => `${c.collection}${c.json === null ? '✗' : ''}`).join(' + '),
  )
}
{
  const linked = _raw().drivers.find((d) => d.volunteerId !== null)
  if (linked) {
    const changes = drive('driver → volunteer mirror', () =>
      updateDriver(linked.id, {
        photo: linked.photo,
        name: `${linked.name}׳`,
        phone: linked.phone,
        vehicle: linked.vehicle,
        seats: linked.seats,
        locality: linked.locality,
        availabilityNote: linked.availabilityNote,
        notes: linked.notes,
      }),
    )
    check(
      'G5.2 — editing the driver half writes the volunteer half back',
      hit(changes, 'volunteers', linked.volunteerId as string) !== undefined,
      changes.map((c) => c.collection).join(' + '),
    )
  } else {
    check('G5.2 — editing the driver half writes the volunteer half back', false, 'no linked driver in the fixtures')
  }
}
{
  const changes = drive('visit → farm nextVisitAt', () =>
    createFarmVisit({
      farmId,
      at: new Date(Date.now() + 3_600_000).toISOString(),
      note: '',
      done: false,
    }),
  )
  check(
    'decision 35 — a visit rewrites the farm cache that reads it',
    hit(changes, 'farms', farmId) !== undefined,
    changes.map((c) => c.collection).join(' + '),
  )
}

// --- 5. The in-place mutations an identity diff would lose -----------------

section('5 — the mutations that write IN PLACE are still seen')

for (const [label, fn, collection, id] of [
  ['setIncidentResolved', () => setIncidentResolved(incidentId, false), 'incidents', incidentId],
  ['confirmArrival', () => confirmArrival(missionId), 'missions', missionId],
  ['archiveVolunteer', () => archiveVolunteer(volunteerId, 'שוב'), 'volunteers', volunteerId],
] as Array<[string, () => void, Collection, string]>) {
  const changes = drive(`in-place: ${label}`, fn)
  check(
    `${label} — an object mutated behind an unchanged reference`,
    hit(changes, collection, id) !== undefined,
    `${changes.length} change(s)`,
  )
}
{
  // Its own block, because by this point `updateMissionStaffing` has emptied
  // mission-01's car list: the check has to find a guard that still has one.
  const withCar = _raw().missions.find((m) => m.drivers.length > 0)
  if (withCar) {
    const changes = drive('in-place: setMissionDriverConfirmed', () =>
      setMissionDriverConfirmed(withCar.id, withCar.drivers[0].driverId, !withCar.drivers[0].confirmed),
    )
    check(
      'setMissionDriverConfirmed — a nested object mutated in place',
      hit(changes, 'missions', withCar.id) !== undefined,
      `${changes.length} change(s)`,
    )
  } else {
    check('setMissionDriverConfirmed — a nested object mutated in place', false, 'no guard with a car left')
  }
}
{
  // The one that proves it is structural rather than "something changed":
  // re-running an identical mutation must emit NOTHING.
  setIncidentResolved(incidentId, true)
  const again = drive('idempotent', () => setIncidentResolved(incidentId, true))
  check(
    'setting the same value twice emits nothing at all',
    again.length === 0,
    `${again.length} change(s)`,
  )
}

// --- 6. What must NOT be written ------------------------------------------

section('6 — three things that must never reach the database')

{
  const changes = drive('setSession', () => setSession({ role: 'farmer', entityId: 'contact-01a' }))
  check('changing who is looking writes nothing', changes.length === 0, `${changes.length} change(s)`)
  setSession({ role: 'coordinator', entityId: null })
}
{
  const changes = drive('resetStore', () => resetStore())
  check(
    'resetStore does not turn the seed into a wave of deletes',
    changes.length === 0,
    `${changes.length} change(s)`,
  )
}
{
  const incoming = DEMO_BACKEND.seed()
  incoming.farms = incoming.farms.slice(0, 3)
  const changes = drive('replaceSnapshot', () => replaceSnapshot(incoming))
  check(
    'hydration is not echoed back to the server it came from',
    changes.length === 0,
    `${changes.length} change(s)`,
  )
  check(
    'and it really did replace the snapshot',
    _raw().farms.length === 3,
    `${_raw().farms.length} farms`,
  )
  check(
    'while keeping the session — identity is not hydrated data',
    _raw().session.role === 'coordinator',
    _raw().session.role,
  )
}

// --- 7. Coverage: no mutation added without a line in this file ------------

section('7 — every mutation @core exports is driven above')

{
  const index = readFileSync('src/core/index.ts', 'utf8')
  const block = index.slice(
    index.indexOf('export {'),
    index.indexOf("} from './store'"),
  )
  const exported = block
    .split('\n')
    .map((l) => l.trim().replace(/,$/, ''))
    .filter((l) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(l))

  /** Exported from the store but not mutations: plumbing and id minters. */
  const NOT_MUTATIONS = new Set([
    'subscribe',
    'getVersion',
    'getSession',
    'setSession',
    'resetStore',
    'newContactId',
    'newAgreementId',
  ])
  const mutations = exported.filter((n) => !NOT_MUTATIONS.has(n))
  const uncovered = mutations.filter((n) => !driven.has(n))
  check(
    'every mutation is exercised by this gate',
    uncovered.length === 0,
    uncovered.length ? `NOT DRIVEN: ${uncovered.join(', ')}` : `${mutations.length} mutations`,
  )
  check(
    'the export block was actually found and parsed',
    mutations.length > 40,
    `${mutations.length} names`,
  )
}

// ===========================================================================

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
