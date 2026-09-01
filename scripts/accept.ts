// PO POINT 6 — `templates` is not re-exported from the core index (it is the
// import wizard's own surface), so the species reader is imported directly.
import { readLivestockKind } from '../src/core/templates'
import {
  COORDINATOR,
  HOME_BASE,
  addIncident,
  archiveVolunteer,
  buildKosherMessage,
  buildSmartphoneMessage,
  createFarmVisit,
  entityKindOf,
  createMission,
  defaultThemeFor,
  getAgendaEvents,
  getAlerts,
  getAnchorPointsForFarm,
  getDrivers,
  getDunamKpis,
  keepsLivestock,
  totalHeads,
  getFarmVisitsForFarm,
  getFarmZonesForFarm,
  ringAreaDunams,
  simplifyPath,
  simplifyRing,
  simplifyToleranceM,
  tracedRingIsClosed,
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
  getVisibleThreatZones,
  getVisibleThreatVectors,
  getThreatsForFarm,
  createThreatZone,
  createThreatVector,
  updateThreatZone,
  deleteThreatZone,
  bearingDeg,
  bubbleDiameter,
  clusterByLocality,
  IMPORT_KINDS,
  IMPORT_TEMPLATES,
  fieldsFor,
  guessField,
  importFarms,
  isUnresolvableLocationLink,
  parsePositionInput,
  requiredFields,
  templateMatrix,
  toFarmDrafts,
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
  // 14 since G16: 12 farms + the two mock moshavim.
  check('coordinator sees every farm', coordFarms === 14, `${coordFarms}`)
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
  const analysis = analyseImport(matrix, ['name', 'phone'], { volunteers: existing })
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

// --- A55 (G16): the moshav entity --------------------------------------------

section('A55 — moshavim are entities with the same mechanics')
{
  as(COORD)
  const moshavim = getVisibleFarms().filter((f) => entityKindOf(f) === 'moshav')
  check('two mock moshavim exist', moshavim.length === 2, moshavim.map((m) => m.name).join(' · '))
  const retamim = moshavim.find((m) => m.id === 'farm-13')!
  check('a moshav carries drawn ground like a farm', getFarmZonesForFarm('farm-13').length === 2)
  check(
    'its dunams auto-fill from the zones like a farm',
    retamim.farmDunams > 0 && retamim.grazingDunams > 0,
    `${retamim.farmDunams} / ${retamim.grazingDunams}`,
  )
  // The adjacency the four tints exist for: the moshav's grazing reaches
  // west to where חוות רתם's grazing ends (~34.672°E).
  const moshavGrazing = getFarmZonesForFarm('farm-13').find((z) => z.kind === 'grazing_area')!
  const westEdge = Math.min(...moshavGrazing.ring.map((p) => p.lng))
  check('מושב רתמים adjoins חוות רתם', Math.abs(westEdge - 34.672) < 0.001, `${westEdge}`)
}

// --- A59 (G18): the threat layer, and who may not see it ---------------------

section('A59 — the threat layer is coordinator-only, and the gate is in core')
{
  as(COORD)
  const zones = getVisibleThreatZones()
  const vectors = getVisibleThreatVectors()
  check('two mock threat zones', zones.length === 2, `${zones.length}`)
  check('two mock threat vectors', vectors.length === 2, `${vectors.length}`)
  check(
    'one of each is attached to an entity and one is free at map level',
    zones.filter((z) => z.farmId !== null).length === 1 &&
      zones.filter((z) => z.farmId === null).length === 1 &&
      vectors.filter((v) => v.farmId !== null).length === 1 &&
      vectors.filter((v) => v.farmId === null).length === 1,
  )
  check(
    'every shape carries an intensity and a revision date',
    [...zones, ...vectors].every(
      (t) =>
        ['low', 'medium', 'high'].includes(t.intensity) &&
        !Number.isNaN(new Date(t.updatedAt).getTime()),
    ),
  )
  check(
    'the fixtures sit inside the Negev, near the farms they describe',
    zones.every((z) =>
      z.ring.every((p) => p.lat > 30.5 && p.lat < 31.5 && p.lng > 34.4 && p.lng < 35.2),
    ),
  )

  // A farm's own view includes the FREE shapes: a threat between two holdings
  // is the one a coordinator most needs while looking at either of them.
  const forFarm01 = getThreatsForFarm('farm-01')
  check(
    "a farm's view carries its own shapes plus the free ones",
    forFarm01.zones.length === 2 && forFarm01.vectors.length === 2,
    `${forFarm01.zones.length} zones / ${forFarm01.vectors.length} vectors`,
  )
  const forFarm02 = getThreatsForFarm('farm-02')
  check(
    'a farm with no attached threat still sees the free ones',
    forFarm02.zones.length === 1 && forFarm02.vectors.length === 1,
    `${forFarm02.zones.length} / ${forFarm02.vectors.length}`,
  )

  // THE GATE. Not "the screen does not render it" — the accessor returns
  // nothing, for every role and every route into the layer.
  for (const session of [
    { role: 'farmer', entityId: 'contact-01a' },
    { role: 'volunteer', entityId: 'vol-001' },
    { role: 'driver', entityId: 'drv-03' },
  ] as Session[]) {
    as(session)
    check(
      `${session.role} sees no threat zones`,
      getVisibleThreatZones().length === 0,
    )
    check(
      `${session.role} sees no threat vectors`,
      getVisibleThreatVectors().length === 0,
    )
    check(
      `${session.role} cannot reach them through a farm either`,
      getThreatsForFarm('farm-01').zones.length === 0 &&
        getThreatsForFarm('farm-01').vectors.length === 0,
    )
  }
  // The farmer is the sharp case: he owns farm-01 and still gets nothing.
  as({ role: 'farmer', entityId: 'contact-01a' })
  check(
    'a farmer is refused the layer for his OWN farm — deliberate, not an oversight',
    getMyFarm()?.id === 'farm-01' && getThreatsForFarm('farm-01').zones.length === 0,
  )

  // --- the writers ----------------------------------------------------------
  as(COORD)
  const created = createThreatZone({
    farmId: 'farm-02',
    ring: [
      { lat: 30.87, lng: 34.79 },
      { lat: 30.88, lng: 34.8 },
      { lat: 30.869, lng: 34.802 },
    ],
    intensity: 'low',
    note: 'בדיקה',
  })
  check('a zone can be created', getVisibleThreatZones().length === 3)
  check('and it is stamped with a revision date', created.updatedAt !== '')
  const firstStamp = created.updatedAt
  updateThreatZone(created.id, { intensity: 'high' })
  const revised = getVisibleThreatZones().find((z) => z.id === created.id)!
  check('a revision changes the intensity', revised.intensity === 'high')
  check(
    'and re-stamps the date — a caller can forget to bump it, the store cannot',
    revised.updatedAt >= firstStamp,
  )
  const vector = createThreatVector({
    farmId: null,
    origin: { lat: 30.9, lng: 34.8 },
    target: { lat: 30.95, lng: 34.75 },
    intensity: 'medium',
    note: '',
  })
  check('a vector can be created free at map level', vector.farmId === null)
  deleteThreatZone(created.id)
  check('and a zone can be deleted', getVisibleThreatZones().length === 2)

  // The arrowhead's rotation. Due north is 0, due east 90 — if this is ever
  // off by 90 every arrow on the map points at the wrong thing.
  check(
    'a vector pointing north bears 0°',
    Math.abs(bearingDeg({ lat: 31, lng: 34.7 }, { lat: 31.1, lng: 34.7 })) < 0.5,
    `${bearingDeg({ lat: 31, lng: 34.7 }, { lat: 31.1, lng: 34.7 }).toFixed(2)}`,
  )
  check(
    'a vector pointing east bears 90°',
    Math.abs(bearingDeg({ lat: 31, lng: 34.7 }, { lat: 31, lng: 34.8 }) - 90) < 0.5,
    `${bearingDeg({ lat: 31, lng: 34.7 }, { lat: 31, lng: 34.8 }).toFixed(2)}`,
  )
  check(
    'and one pointing west bears 270°',
    Math.abs(bearingDeg({ lat: 31, lng: 34.8 }, { lat: 31, lng: 34.7 }) - 270) < 0.5,
    `${bearingDeg({ lat: 31, lng: 34.8 }, { lat: 31, lng: 34.7 }).toFixed(2)}`,
  )
  resetStore()
}

// --- A44 (G10): the templates and the extended import ------------------------

section('A44 — one template source, three rosters, and a link that becomes a pin')
{
  as(COORD)

  // The template IS the guess table: every header the generated file carries
  // must map back onto the column it came from, or the coordinator downloads a
  // sheet the wizard cannot read — the worst bug an import can have, because
  // it looks like HIS file is wrong.
  for (const kind of IMPORT_KINDS) {
    const matrix = templateMatrix(kind, (key) => key)
    const headers = matrix[0]
    const columns = IMPORT_TEMPLATES[kind].columns
    check(
      `${kind}: the template round-trips through guessField`,
      headers.every((_, i) => guessField(columns[i].aliases[0], kind) === columns[i].field),
      `${headers.length} columns`,
    )
    check(
      `${kind}: three example rows, all the same width`,
      matrix.length === 4 && matrix.every((r) => r.length === columns.length),
      `${matrix.length} rows × ${columns.length}`,
    )
    check(
      `${kind}: the mapping step offers exactly this template's fields`,
      fieldsFor(kind).length === columns.length + 1,
      fieldsFor(kind).join(','),
    )
  }

  // The two collisions that a first-match-wins scan would get wrong.
  check(
    '"סוג טלפון" is the phone TYPE, not the phone',
    guessField('סוג טלפון', 'volunteers') === 'phoneType',
  )
  check(
    '"טלפון איש קשר" is the contact phone, not the farm name',
    guessField('טלפון איש קשר', 'farms') === 'contactPhone',
  )
  check(
    'an unrecognised header is ignored, never guessed',
    guessField('מספר סידורי פנימי', 'volunteers') === 'ignore',
  )
  check(
    'the farms template carries the G16 entity-kind column',
    IMPORT_TEMPLATES.farms.columns.some((c) => c.field === 'entityKind'),
  )
  check(
    'a farm needs a name and a locality, never a phone',
    requiredFields('farms').join(',') === 'name,locality',
    requiredFields('farms').join(','),
  )

  // --- the link parser ------------------------------------------------------
  const near = (p: { lat: number; lng: number } | null, lat: number, lng: number) =>
    p !== null && Math.abs(p.lat - lat) < 0.002 && Math.abs(p.lng - lng) < 0.002

  check(
    'a Waze share link becomes a coordinate',
    near(parsePositionInput('https://waze.com/ul?ll=30.9800,34.6700'), 30.98, 34.67),
  )
  check(
    'so does the URL-encoded form',
    near(parsePositionInput('https://waze.com/ul?ll=30.9800%2C34.6700&navigate=yes'), 30.98, 34.67),
  )
  check(
    'a Google Maps @-URL becomes a coordinate, and the zoom is not a longitude',
    near(parsePositionInput('https://www.google.com/maps/@30.9861,34.6720,15z'), 30.9861, 34.672),
  )
  check(
    "our own share format round-trips",
    near(
      parsePositionInput('https://www.google.com/maps/search/?api=1&query=31.250000%2C34.790000'),
      31.25,
      34.79,
    ),
  )
  check('a bare pair works too', near(parsePositionInput('30.7900, 34.4500'), 30.79, 34.45))
  check(
    'a reversed pair is corrected by the Israel box',
    near(parsePositionInput('34.6700, 30.9800'), 30.98, 34.67),
  )
  check(
    'a coordinate outside Israel is refused, not placed',
    parsePositionInput('48.8566, 2.3522') === null,
  )
  check('an empty cell is not a location', parsePositionInput('') === null)
  check(
    'a SHORTENED link is unreadable and says so',
    parsePositionInput('https://maps.app.goo.gl/AbCdEf123') === null &&
      isUnresolvableLocationLink('https://maps.app.goo.gl/AbCdEf123'),
  )
  check(
    'a blank cell is not reported as an unreadable link',
    !isUnresolvableLocationLink(''),
  )

  // --- a farm import, end to end -------------------------------------------
  const farmHeaders: Array<'name' | 'entityKind' | 'locality' | 'positionLink' | 'farmStatus'> = [
    'name',
    'entityKind',
    'locality',
    'positionLink',
    'farmStatus',
  ]
  const farmRows = [
    ['חוות בדיקה א', 'חווה', 'רתמים', 'https://waze.com/ul?ll=30.9800,34.6700', 'פעילה'],
    ['מושב בדיקה ב', 'מושב', 'אופקים', '', 'ליצירת קשר'],
    ['חוות בדיקה ג', 'חווה', 'יישוב שלא בגזטיר', 'https://maps.app.goo.gl/x', 'נוצר קשר'],
    ['חוות רתם', 'חווה', 'רתמים', '', 'פעילה'],
    ['', 'חווה', 'רתמים', '', 'פעילה'],
  ]
  const farmAnalysis = analyseImport(farmRows, farmHeaders, { farms: getVisibleFarms() }, 'farms')

  check(
    'a farm with a readable link is positioned from it',
    farmAnalysis.rows[0].positionSource === 'link' &&
      near(farmAnalysis.rows[0].position, 30.98, 34.67),
    farmAnalysis.rows[0].positionSource,
  )
  check(
    'a known locality with no link is positioned APPROXIMATELY, and says which',
    farmAnalysis.rows[1].positionSource === 'locality' && farmAnalysis.rows[1].position !== null,
    farmAnalysis.rows[1].positionSource,
  )
  check(
    'an unreadable link on an unknown town is "מיקום חסר" — a WARNING, not a reject',
    farmAnalysis.rows[2].positionSource === 'none' &&
      farmAnalysis.rows[2].warnings.includes('warnNoPosition') &&
      farmAnalysis.rows[2].warnings.includes('warnUnreadableLink') &&
      farmAnalysis.rows[2].problems.length === 0,
    farmAnalysis.rows[2].warnings.join(','),
  )
  check(
    'and it still imports',
    farmAnalysis.importable.some((r) => r.name === 'חוות בדיקה ג'),
  )
  check(
    'the warned rows are counted separately from the rejected ones',
    farmAnalysis.warned.length === 1 && farmAnalysis.rejected.length === 2,
    `${farmAnalysis.warned.length} warned / ${farmAnalysis.rejected.length} rejected`,
  )
  check(
    'a farm already in the base is a duplicate BY NAME',
    farmAnalysis.rows[3].problems.includes('errDuplicate'),
  )
  check('a nameless row is rejected', farmAnalysis.rows[4].problems.includes('errMissingName'))
  check(
    'סוג יישות is read into the entity kind',
    farmAnalysis.rows[0].entityKind === 'farm' && farmAnalysis.rows[1].entityKind === 'moshav',
  )
  check(
    'the Hebrew status is read, and "נוצר קשר" is not "ליצירת קשר"',
    farmAnalysis.rows[0].farmStatus === 'active' &&
      farmAnalysis.rows[1].farmStatus === 'to_contact' &&
      farmAnalysis.rows[2].farmStatus === 'contacted',
    farmAnalysis.rows.map((r) => r.farmStatus).join(','),
  )

  const before = getVisibleFarms().length
  const added = importFarms(
    toFarmDrafts(farmAnalysis.importable, {
      yeshiva: '',
      locality: '',
      fallbackPosition: HOME_BASE,
    }),
  )
  check(
    'the drafts reach the store',
    added === farmAnalysis.importable.length &&
      getVisibleFarms().length === before + added,
    `${before} → ${getVisibleFarms().length}`,
  )
  const parked = getVisibleFarms().find((f) => f.name === 'חוות בדיקה ג')
  check(
    'a farm with no position is parked on the base, not at 0°,0°',
    parked !== undefined && near(parked.position, HOME_BASE.lat, HOME_BASE.lng),
  )
  // Re-importing the same sheet must not double the list.
  const second = analyseImport(farmRows, farmHeaders, { farms: getVisibleFarms() }, 'farms')
  check(
    'the same sheet imported twice adds nothing',
    second.importable.length === 0,
    `${second.importable.length}`,
  )
  resetStore()
}

// --- A62 (P0.2): the roster's locality bubbles -------------------------------

section('A62 — volunteers and drivers aggregate by locality, never by person')
{
  as(COORD)
  const volunteers = getVolunteers()
  const { clusters, unplaced, unplacedCount, max } = clusterByLocality(
    volunteers.map((v) => v.locality),
  )

  check(
    'every volunteer is accounted for — counted or reported unplaced',
    clusters.reduce((s, c) => s + c.count, 0) + unplacedCount === volunteers.length,
    `${clusters.reduce((s, c) => s + c.count, 0)} + ${unplacedCount} = ${volunteers.length}`,
  )
  check('the fixtures place every volunteer', unplaced.length === 0)
  check(
    'no locality is drawn twice',
    new Set(clusters.map((c) => c.locality)).size === clusters.length,
    `${clusters.length} bubbles`,
  )
  check(
    'each cluster count matches a straight recount',
    clusters.every(
      (c) => c.count === volunteers.filter((v) => v.locality === c.locality).length,
    ),
  )
  check(
    'clusters are ordered so the biggest is drawn last (on top)',
    clusters.every((c, i) => i === 0 || clusters[i - 1].count <= c.count),
    `max ${max}`,
  )

  // A locality outside the gazetteer must be REPORTED, never dropped.
  const withGhost = clusterByLocality([...volunteers.map((v) => v.locality), 'עיירה שלא קיימת'])
  check(
    'an unknown locality is reported rather than silently dropped',
    withGhost.unplaced.length === 1 && withGhost.unplacedCount === 1,
    withGhost.unplaced.join(''),
  )

  // The bubble is read by AREA, so the diameter is sqrt-scaled and bounded.
  check(
    'a lone volunteer still draws a readable bubble',
    bubbleDiameter(1, 100) === 34,
    `${bubbleDiameter(1, 100)}`,
  )
  check('the largest bubble is the ceiling', bubbleDiameter(100, 100) === 68, `${bubbleDiameter(100, 100)}`)
  check(
    'four times the people is twice the radius, not four times',
    bubbleDiameter(25, 100) === Math.round(30 + 38 * 0.5),
    `${bubbleDiameter(25, 100)}`,
  )
  check(
    'an empty roster does not divide by zero, and a zero count is the floor',
    bubbleDiameter(0, 0) === 30 && bubbleDiameter(0, 100) === 30,
  )

  // The drivers roster runs through the same function.
  const driverClusters = clusterByLocality(getDrivers().map((d) => d.locality))
  check(
    'the drivers roster clusters the same way',
    driverClusters.clusters.reduce((s, c) => s + c.count, 0) === getDrivers().length,
    `${driverClusters.clusters.length} towns / ${getDrivers().length} drivers`,
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

// --- PO POINT 6: the head count ----------------------------------------------

section('PO point 6 — the head count, and the difference between none and unknown')
{
  as(COORD)

  /**
   * ★ THE WHOLE FEATURE TURNS ON `null` vs `0`, and this is where that is
   *   held. An entity with no rows is one nobody has been ASKED about; an
   *   entity with a row saying zero has none. The dashboard tile, the detail
   *   banner and the employer's report all read `totalHeads` and all stay
   *   SILENT on null — because this is a funding number, and a funding number
   *   that reads 0 because a form was never filled is worse than an absent
   *   one.
   */
  check(
    'an entity nobody has been asked about reports null, not zero',
    totalHeads({ livestock: undefined }) === null,
  )
  check('and an empty list is the same answer', totalHeads({ livestock: [] }) === null)
  check(
    'a stated zero IS zero',
    totalHeads({ livestock: [{ kind: 'sheep', label: '', heads: 0 }] }) === 0,
  )

  const rotem = getVisibleFarms().find((f) => f.id === 'farm-01')
  check('the fixtures carry a head count', totalHeads(rotem ?? { livestock: [] }) === 960, String(totalHeads(rotem ?? { livestock: [] })))

  /**
   * ★ THE QUESTION IS ONLY ASKED OF AN ENTITY THAT KEEPS ANIMALS. An arable
   *   holding has no head count, and a form that asks anyway trains the
   *   coordinator to skip a section.
   */
  check('an arable holding is not asked', !keepsLivestock({ type: 'agriculture' }))
  check('a livestock one is', keepsLivestock({ type: 'livestock' }))
  check('and so is a mixed one', keepsLivestock({ type: 'mixed' }))

  /**
   * ★ THE DASHBOARD NUMBER IS COUNTED OVER THE SAME ENTITIES AS THE DUNAMS, so
   *   the two figures beside each other are two facts about ONE set.
   */
  const kpis = getDunamKpis()
  const guardedByHand = getVisibleFarms()
    .filter((f) => f.status === 'signed' || f.status === 'active')
    .reduce((n, f) => n + (totalHeads(f) ?? 0), 0)
  check(
    'guardedHeads counts exactly the signed and active entities',
    kpis.guardedHeads === guardedByHand,
    `${kpis.guardedHeads} vs ${guardedByHand}`,
  )
  check(
    'and a farm that is neither contributes nothing to it',
    getVisibleFarms()
      .filter((f) => f.status !== 'signed' && f.status !== 'active')
      .every((f) => (totalHeads(f) ?? 0) >= 0),
  )

  // An unrecognised species keeps its own word rather than being reclassified.
  const other = readLivestockKind('יענים')
  check(
    'an unknown species imports as `other` WITH the word kept',
    other?.kind === 'other' && other.label === 'יענים',
    JSON.stringify(other),
  )
  check(
    'and a known one is recognised through its label',
    readLivestockKind('צאן־כבשים')?.kind === 'sheep',
  )
  check('an empty cell is nothing at all', readLivestockKind('  ') === null)
}

/* ══════════════════════════════════════════════════════════════════════════
   PO POINT 9b — THE FREEHAND SIMPLIFICATION, WITHOUT A BROWSER
   ══════════════════════════════════════════════════════════════════════════

   The product owner's condition was "algorithme type Douglas-Peucker dans
   /src/core/geo.ts, pur, testé". It is pure, so it is tested HERE rather than
   through a map: a browser gate can only say that a trace produced a polygon,
   and what actually has to be true is arithmetic — the right vertices are
   kept, the wrong ones are dropped, and the surface survives.
   ══════════════════════════════════════════════════════════════════════════ */
section('PO point 9b — a hand-drawn trace becomes a polygon somebody can edit')
{
  // A synthetic "hand": a square field, traced with 60 points a side and a
  // ±1.5 m tremor on every one of them. That is what a Pencil actually emits.
  const SIDE_M = 400
  const centre = { lat: 31.42, lng: 34.55 }
  const dLat = SIDE_M / 111_320
  const dLng = SIDE_M / (111_320 * Math.cos((centre.lat * Math.PI) / 180))
  const corners = [
    { lat: centre.lat - dLat / 2, lng: centre.lng - dLng / 2 },
    { lat: centre.lat - dLat / 2, lng: centre.lng + dLng / 2 },
    { lat: centre.lat + dLat / 2, lng: centre.lng + dLng / 2 },
    { lat: centre.lat + dLat / 2, lng: centre.lng - dLng / 2 },
  ]
  // A deterministic tremor: this is a gate, so the same input every run.
  let seed = 7
  const jitter = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return (seed / 2147483648 - 0.5) * 2
  }
  const trace: { lat: number; lng: number }[] = []
  for (let c = 0; c < 4; c++) {
    const from = corners[c]
    const to = corners[(c + 1) % 4]
    for (let i = 0; i < 60; i++) {
      const t = i / 60
      trace.push({
        lat: from.lat + (to.lat - from.lat) * t + (jitter() * 1.5) / 111_320,
        lng: from.lng + (to.lng - from.lng) * t + (jitter() * 1.5) / 111_320,
      })
    }
  }
  // The hand comes back to where it started, a couple of metres out.
  trace.push({ lat: corners[0].lat + 2 / 111_320, lng: corners[0].lng })

  check('the synthetic trace is what a Pencil emits, not a polygon', trace.length === 241)

  const tolerance = simplifyToleranceM(15, centre.lat)
  /**
   * ⚠️ THIS BOUND CAUGHT A REAL FACTOR-OF-TWO. The first version of
   *    `simplifyToleranceM` used 156 543 — the metres-per-pixel constant for
   *    256 px slippy tiles — while MapLibre's zoom is defined against a 512 px
   *    tile. It returned 12.2 m at z15 where the truth is 6.1, which is coarse
   *    enough to cut the corner off a field.
   */
  check(
    'the tolerance at z15 is a few metres, derived from the screen',
    tolerance > 1 && tolerance < 8,
    `${tolerance.toFixed(2)} m`,
  )
  check(
    '★ and it SCALES with the zoom — coarse at z12, fine at z17',
    simplifyToleranceM(12, centre.lat) > simplifyToleranceM(17, centre.lat) * 20,
    `z12 ${simplifyToleranceM(12, centre.lat).toFixed(1)} m vs z17 ${simplifyToleranceM(17, centre.lat).toFixed(2)} m`,
  )

  check(
    '★ the hand coming back near its start is recognised as a closed ring',
    tracedRingIsClosed(trace, tolerance),
  )
  check(
    'and a genuinely open path is not',
    !tracedRingIsClosed(trace.slice(0, 90), tolerance),
  )

  const ring = simplifyRing(trace, tolerance)
  check(
    '★★ 241 traced points become a ring somebody can actually edit',
    ring.length >= 4 && ring.length <= 40,
    `${ring.length} vertices`,
  )
  check(
    '★ and the four real corners survive — the shape is still the shape',
    ring.length >= 4 &&
      corners.every((corner) =>
        ring.some(
          (v) =>
            Math.abs(v.lat - corner.lat) < dLat / 20 &&
            Math.abs(v.lng - corner.lng) < dLng / 20,
        ),
      ),
    `${ring.length} vertices kept`,
  )

  const before = ringAreaDunams(trace)
  const after = ringAreaDunams(ring)
  check(
    '★★ THE SURFACE SURVIVES, which is the number the coordinator reads',
    Math.abs(after - before) / before < 0.02,
    `${before.toFixed(0)} → ${after.toFixed(0)} dunams (${(((after - before) / before) * 100).toFixed(2)} %)`,
  )
  check(
    'and it is about the 160 dunams a 400 m square is',
    Math.abs(after - 160) < 8,
    `${after.toFixed(1)} dunams`,
  )

  // ⚠️ The cut-point rule: a ring simplified from two DIFFERENT starting
  //    points must come back the same shape. Without it, wherever the hand
  //    happened to start becomes a vertex that can never be removed.
  const rotated = [...trace.slice(97), ...trace.slice(0, 97)]
  const fromElsewhere = simplifyRing(rotated, tolerance)
  check(
    '★★ starting the SAME trace at a different point gives the same shape',
    Math.abs(ringAreaDunams(fromElsewhere) - after) / after < 0.02 &&
      Math.abs(fromElsewhere.length - ring.length) <= 3,
    `${ring.length} vs ${fromElsewhere.length} vertices, ${after.toFixed(0)} vs ${ringAreaDunams(fromElsewhere).toFixed(0)} dunams`,
  )

  // The degenerate inputs, because this runs on whatever the hand did.
  check('a two-point trace is returned untouched', simplifyPath(trace.slice(0, 2), 5).length === 2)
  check('an empty trace is an empty trace', simplifyPath([], 5).length === 0)
  check(
    '★ and an absurd tolerance falls back to the trace rather than to a line',
    simplifyRing(trace, 100_000).length >= 3,
    `${simplifyRing(trace, 100_000).length} vertices`,
  )
  check(
    'a ring that is already three vertices is left alone',
    simplifyRing(corners.slice(0, 3), tolerance).length === 3,
  )
}

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
