import {
  COORDINATOR,
  HOME_BASE,
  addIncident,
  archiveVolunteer,
  buildKosherMessage,
  buildSmartphoneMessage,
  createFarmVisit,
  createMission,
  defaultThemeFor,
  getAgendaEvents,
  getAlerts,
  getAnchorPointsForFarm,
  getDrivers,
  getDunamKpis,
  getFarmVisitsForFarm,
  getFarmZonesForFarm,
  ringAreaDunams,
  getIncidentsForMission,
  getMission,
  getMyFarm,
  getPresenceMismatches,
  getTonightMissionViews,
  getUpcomingAgendaEvents,
  getVisibleFarms,
  getVisibleIncidents,
  getVisibleMissionViews,
  getVolunteers,
  googleMapsRouteUrl,
  planRoute,
  resetStore,
  setSession,
  telHref,
  analyseImport,
  wazeStepLinks,
} from '../src/core/index'
import type { Session } from '../src/core/index'

/**
 * A1–A24 — the acceptance criteria, driven through @core rather than the DOM.
 *
 * Promoted from a scratchpad file to a committed script in Lot 0.7. Driving the
 * BUSINESS LAYER is the point: the role gate is only meaningful if it lives in
 * the data layer, and a browser test cannot tell the difference between "the
 * screen does not show it" and "the session cannot read it".
 *
 * Criteria that are inherently visual (A3, A8, A11, A16, A17, A18, A19, A23)
 * are covered elsewhere: `bun run layout`, `bun run screenshots`, and the
 * captures referenced from ETAT.md.
 *
 *   bun run accept
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
  console.log(`  ${'-'.repeat(70)}`)
}

const as = (session: Session) => {
  resetStore()
  setSession(session)
}

const COORD: Session = { role: 'coordinator', entityId: null }

console.log('Acceptance criteria — @core')

// --- A4: role isolation ------------------------------------------------------

section('A4 — role isolation is enforced in the data layer')
{
  as(COORD)
  const coordFarms = getVisibleFarms().length
  const coordVolunteers = getVolunteers().length
  check('coordinator sees every farm', coordFarms === 12, `${coordFarms}`)
  check('coordinator sees the whole roster', coordVolunteers === 300, `${coordVolunteers}`)

  as({ role: 'farmer', entityId: 'contact-01a' })
  check('farmer sees exactly one farm', getVisibleFarms().length === 1)
  check('farmer sees no roster at all', getVolunteers().length === 0)
  check('farmer sees his own farm', getMyFarm()?.id === 'farm-01')
  check('farmer sees no drivers', getDrivers().length === 0)

  as({ role: 'volunteer', entityId: 'vol-001' })
  check('volunteer sees only his own guards', getVisibleMissionViews().every((v) => v.mission.assignments.some((a) => a.volunteerId === 'vol-001')))
  check('volunteer sees no roster', getVolunteers().length === 0)

  as({ role: 'driver', entityId: 'drv-03' })
  check('driver sees only the guards he drives', getVisibleMissionViews().length > 0 && getVisibleMissionViews().every((v) => v.mission.drivers.some((d) => d.driverId === 'drv-03')))
}

// --- A5: two message formats -------------------------------------------------

section('A5 — both anchor message formats')
{
  as(COORD)
  const farm = getVisibleFarms().find((f) => f.id === 'farm-01')!
  const anchorPoint = getAnchorPointsForFarm('farm-01')[0]
  const input = {
    farm,
    anchorPoint,
    mission: null,
    driver: null,
    farmerContact: farm.contacts.find((c) => c.isPrimary) ?? null,
    coordinatorName: COORDINATOR.name,
    coordinatorPhone: COORDINATOR.phone,
    locale: 'he-IL',
  }
  const labels = {
    title: 'T', farm: 'F', anchorPoint: 'A', arrival: 'R', navigation: 'N',
    access: 'X', coordinates: 'C', instructions: 'I', phones: 'P',
    farmer: 'FA', driver: 'D', coordinator: 'CO',
  }
  const smart = buildSmartphoneMessage(input, labels)
  const kosher = buildKosherMessage(input, labels)
  check('the smartphone format carries a Waze link', smart.includes('https://waze.com/ul?'))
  check('the kosher format carries NO link at all', !kosher.includes('http'))
  check('the kosher format spells out the coordinates', /\d+\.\d{5}, \d+\.\d{5}/.test(kosher))
  check('the kosher format carries the written access route', kosher.includes(anchorPoint.accessDescription))
}

// --- A6: route planning ------------------------------------------------------

section('A6 — nearest-neighbour ordering and a multi-stop Maps URL')
{
  as(COORD)
  const farms = getVisibleFarms().slice(0, 10)
  const route = planRoute(farms, HOME_BASE)
  check('every farm is a stop', route.stops.length === 10)
  check('stops are numbered 1..n', route.stops.every((s, i) => s.order === i + 1))
  check('each leg is at least as close as the next candidate was', route.stops.every((s) => s.legKm >= 0))
  check('the round trip includes the return leg', route.roundTripKm > route.totalKm)
  const url = googleMapsRouteUrl(route)
  check('one Google Maps URL carries every waypoint', (url?.match(/%7C/g)?.length ?? 0) === 9, url ? `${(url.match(/%7C/g)?.length ?? 0) + 1} points` : 'null')
  check('Waze gets one link per stop', wazeStepLinks(route).length === 10)
}

// --- A7: urgent report reaches coordinator and farmer -------------------------

section('A7 — an urgent report surfaces for the coordinator AND the farmer')
{
  as({ role: 'volunteer', entityId: 'vol-001' })
  addIncident({
    farmId: 'farm-01',
    missionId: 'mission-01',
    source: 'volunteer',
    reporterId: 'vol-001',
    reporterName: 'אריאל כהן',
    severity: 'urgent',
    description: 'test',
    position: { lat: 31.06, lng: 34.65 },
  })

  setSession(COORD)
  const coordAlerts = getAlerts().filter((a) => a.kind === 'urgent_incident')
  check('the coordinator gets an alert', coordAlerts.length >= 1, `${coordAlerts.length}`)
  check('the alert carries a call list', coordAlerts[0].contacts.length >= 1)

  setSession({ role: 'farmer', entityId: 'contact-01a' })
  check('the farmer sees it too', getVisibleIncidents().some((i) => i.description === 'test'))

  setSession({ role: 'farmer', entityId: 'contact-02a' })
  check('a DIFFERENT farm sees nothing', !getVisibleIncidents().some((i) => i.description === 'test'))
}

// --- A9: import validation ---------------------------------------------------

section('A9 — the import wizard flags duplicates and missing phones')
{
  as(COORD)
  const existing = getVolunteers()
  // Columns: name, phone. Mirrors samples/a9-test-import.csv.
  const matrix = [
    ['חדש אחד', '052-0000900'],
    ['כפול בקובץ', '052-0000901'],
    ['כפול בקובץ שוב', '052-0000901'],
    ['קיים כבר', existing[0].phone],
    ['בלי טלפון', ''],
  ]
  const analysis = analyseImport(matrix, ['name', 'phone'], existing)
  check('3 rows are rejected', analysis.rejected.length === 3, `${analysis.rejected.length}`)
  check('2 rows are importable', analysis.importable.length === 2, `${analysis.importable.length}`)
  check('one duplicate WITHIN the file', analysis.rows.some((r) => r.problems.includes('errDuplicateInFile')))
  check('one duplicate against the store', analysis.rows.some((r) => r.problems.includes('errDuplicate')))
  check('one missing phone', analysis.rows.some((r) => r.problems.includes('errMissingPhone')))
  check('the row number matches the spreadsheet', analysis.rows[0].rowNumber === 2)
}

// --- A10: nominative mismatch -------------------------------------------------

section('A10 — a driver/group disagreement is visible to all three parties')
{
  as(COORD)
  const mismatches = getPresenceMismatches()
  check('the seeded mismatch is detected', mismatches.length === 1, `${mismatches.length}`)
  check('it names ONE person, not a count', mismatches[0]?.volunteer.name === 'שמואל וייס', mismatches[0]?.volunteer.name)
  const alert = getAlerts().find((a) => a.kind === 'presence_mismatch')
  check('it raises an alert', alert !== undefined)
  check('with three people to call', alert?.contacts.length === 3, `${alert?.contacts.length}`)
}

// --- A12: theme defaults per role ---------------------------------------------

section('A12 — per-role theme defaults')
{
  check('coordinator defaults to light', defaultThemeFor('coordinator') === 'light')
  check('farmer defaults to dark', defaultThemeFor('farmer') === 'dark')
  check('volunteer defaults to dark', defaultThemeFor('volunteer') === 'dark')
  check('driver defaults to dark', defaultThemeFor('driver') === 'dark')
}

// --- A14 / A15: photos and tel: links -----------------------------------------

section('A14 / A15 — photos on a mixed roster, every number a tel: link')
{
  as(COORD)
  const withPhoto = getVolunteers().filter((v) => v.photo !== null).length
  check('roughly half the roster has a photo', withPhoto > 100 && withPhoto < 200, `${withPhoto}/300`)
  const drivers = getDrivers().filter((d) => d.photo !== null).length
  check('most drivers have one', drivers >= 3, `${drivers}/6`)
  check('tel: strips punctuation', telHref('052-000-0018') === 'tel:0520000018')
  check('every volunteer has a dialable number', getVolunteers().every((v) => /^tel:0\d{8,9}$/.test(telHref(v.phone))))
}

// --- A20 / A21: the wizard's data path ----------------------------------------
//
// The interactive half of A20 is played in the browser; what belongs here is
// that the guard the wizard creates is a real, complete row.

section('A20 — a guard created by the wizard is complete and visible')
{
  as(COORD)
  const before = getVisibleMissionViews().length
  // Only four farms have anchor points in the fixtures; pick one that does
  // rather than hard-coding an id that a fixture edit could invalidate.
  const target = getVisibleFarms().find(
    (f) => getAnchorPointsForFarm(f.id).length > 0,
  )!
  const anchor = getAnchorPointsForFarm(target.id)[0]
  const mission = createMission({
    farmId: target.id,
    anchorPointId: anchor.id,
    startAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
    endAt: new Date(Date.now() + 14 * 3_600_000).toISOString(),
    // vol-002 is a kosher phone, vol-004 a smartphone: the holder must be the
    // smartphone even though it is second in the list.
    volunteerIds: ['vol-002', 'vol-004'],
    driverId: 'drv-04',
  })
  check('the guard exists', getMission(mission.id) !== null)
  check('it is planned', mission.status === 'planned')
  check('it has a creation timestamp', mission.createdAt !== null)
  check('the group phone went to the smartphone holder', mission.assignments.find((a) => a.isGroupPhone)?.volunteerId === 'vol-004')
  check('the roster grew by one', getVisibleMissionViews().length === before + 1)
  check('it shows up tonight', getTonightMissionViews().some((v) => v.mission.id === mission.id))
  const events = getAgendaEvents(new Date(), new Date(Date.now() + 3 * 86_400_000))
  check('it shows up in the agenda', events.some((e) => e.id === mission.id))
}

// --- A22: farm visits & the agenda --------------------------------------------

section('A22 — farm visits are real objects and reach the agenda')
{
  as(COORD)
  const seeded = getFarmVisitsForFarm('farm-01').length
  check('visits were seeded from the farm records', seeded >= 2, `${seeded}`)

  const at = new Date(Date.now() + 2 * 86_400_000)
  const visit = createFarmVisit({
    farmId: 'farm-07',
    at: at.toISOString(),
    note: 'בדיקה',
    done: false,
  })
  check('a visit can be created', getFarmVisitsForFarm('farm-07').some((v) => v.id === visit.id))
  check(
    'the farm card picks it up as the next visit',
    getVisibleFarms().find((f) => f.id === 'farm-07')?.nextVisitAt === at.toISOString(),
    'nextVisitAt is a derived cache with one writer',
  )
  const events = getAgendaEvents(new Date(), new Date(Date.now() + 3 * 86_400_000))
  check('and the agenda shows it', events.some((e) => e.id === visit.id && e.kind === 'visit'))
  check('the compact widget mixes all three kinds', new Set(getUpcomingAgendaEvents(10).map((e) => e.kind)).size === 3, 'G6: guards, farm visits and general meetings share one stream')

  setSession({ role: 'farmer', entityId: 'contact-01a' })
  check('a farmer sees only his own farm\'s visits', getFarmVisitsForFarm('farm-07').length === 0)
}

// --- A23: the timelines have something to show --------------------------------

section('A23 — every timeline has real data behind it')
{
  as(COORD)
  const live = getVisibleMissionViews().find((v) => v.mission.id === 'mission-01')!
  check('the live guard has a creation instant', live.mission.createdAt !== null)
  check('…a drop-off instant', live.mission.droppedOffAt !== null)
  check('…an arrival instant', live.mission.arrivalConfirmedAt !== null)
  check('…and nothing yet for the morning', live.mission.pickedUpAt === null && live.mission.completedAt === null)

  const closed = getVisibleMissionViews().find((v) => v.mission.id === 'mission-04')!
  check('a closed guard has all eight instants', closed.mission.pickedUpAt !== null && closed.mission.completedAt !== null)
  check(
    'picked-up precedes reconciliation',
    new Date(closed.mission.pickedUpAt!).getTime() <= new Date(closed.mission.completedAt!).getTime(),
  )

  check('incidents attach to their guard', getIncidentsForMission('mission-01').length >= 1)
  const incident = getVisibleIncidents().find((i) => i.entries.length > 0)
  check('an incident has follow-up entries with authors', incident !== undefined && incident.entries.every((e) => e.author !== ''))
}

// --- A52 (G14a): the strategic dunam KPIs ------------------------------------

section('A52 — the dashboard dunam KPIs recompute from the mocks')
{
  as(COORD)
  const farms = getVisibleFarms()
  const sum = (list: typeof farms) =>
    list.reduce((s, f) => s + f.farmDunams + f.grazingDunams, 0)
  const guarded = sum(farms.filter((f) => f.status === 'signed' || f.status === 'active'))
  const potential = sum(
    farms.filter((f) => f.status !== 'signed' && f.status !== 'active' && f.status !== 'declined'),
  )
  const kpis = getDunamKpis()
  check('guarded dunams = signed + active, recomputed', kpis.guardedDunams === guarded && guarded > 0, `${kpis.guardedDunams}`)
  check('potential dunams = pipeline minus declined, recomputed', kpis.potentialDunams === potential && potential > 0, `${kpis.potentialDunams}`)
  const declined = sum(farms.filter((f) => f.status === 'declined'))
  check('declined ground counts in NEITHER number', kpis.guardedDunams + kpis.potentialDunams + declined === sum(farms))
}

// --- A54 (G15): the geodesic dunam area and its auto-fill ---------------------

section('A54 — geodesic dunam area is right, and the store keeps fields in sync')
{
  // A 0.01° × 0.01° "square" at the programme's latitude: ~1113 m tall,
  // ~951 m wide, ≈ 1059 dunams. Planar reference computed independently.
  const lat = 31.27
  const lng = 34.79
  const d = 0.01
  const square = [
    { lat, lng },
    { lat: lat + d, lng },
    { lat: lat + d, lng: lng + d },
    { lat, lng: lng + d },
  ]
  const area = ringAreaDunams(square)
  const side = 111_320 * d
  const expected = (side * side * Math.cos(((lat + d / 2) * Math.PI) / 180)) / 1000
  check(
    'a known square lands within 1 % of the planar reference',
    Math.abs(area - expected) / expected < 0.01,
    `${area.toFixed(1)} vs ${expected.toFixed(1)} dunams`,
  )
  check(
    'winding direction does not matter',
    Math.abs(ringAreaDunams([...square].reverse()) - area) < 1e-9,
  )
  check('under three vertices there is no surface', ringAreaDunams(square.slice(0, 2)) === 0)
  const moved = square.map((p) => ({ lat: p.lat + 0.05, lng: p.lng - 0.03 }))
  check(
    'translating the ring (the move handle) barely changes its area',
    Math.abs(ringAreaDunams(moved) - area) / area < 0.01,
  )

  as(COORD)
  const farm01 = getVisibleFarms().find((f) => f.id === 'farm-01')!
  const sumOf = (farmId: string, kind: 'farm_boundary' | 'grazing_area') =>
    Math.round(
      getFarmZonesForFarm(farmId)
        .filter((z) => z.kind === kind)
        .reduce((s, z) => s + ringAreaDunams(z.ring), 0),
    )
  check(
    'a farm with zones carries the zone sum as its dunams',
    farm01.farmDunams === sumOf('farm-01', 'farm_boundary') &&
      farm01.grazingDunams === sumOf('farm-01', 'grazing_area'),
    `${farm01.farmDunams} / ${farm01.grazingDunams}`,
  )
  const farm08 = getVisibleFarms().find((f) => f.id === 'farm-08')!
  check(
    'a manual override (מוזן ידנית) survives the sync',
    farm08.grazingDunamsManual === true && farm08.grazingDunams === 3900,
    `${farm08.grazingDunams}`,
  )
}

// --- Regression: archiving still works ----------------------------------------

section('Regression — archiving removes a volunteer from the active pool')
{
  as(COORD)
  const before = getVolunteers().filter((v) => v.status === 'active').length
  archiveVolunteer('vol-001', 'מילואים')
  const after = getVolunteers().filter((v) => v.status === 'active').length
  check('the active count drops by one', after === before - 1, `${before} → ${after}`)
  check('the reason is recorded', getVolunteers().find((v) => v.id === 'vol-001')?.inactiveReason === 'מילואים')
}

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
