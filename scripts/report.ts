import { readFileSync } from 'node:fs'

import { installBackend, _raw } from '../src/core/store'
import { DEMO_BACKEND } from '../src/core/demo'
import {
  REPORT_WINDOW_DAYS,
  addIncident,
  buildProgrammeReport,
  createFarm,
  createFarmVisit,
  createVolunteer,
  getDriverStats,
  getDunamKpis,
  getFarmStatusCounts,
  getPastMissionViews,
  getUpcomingMissionViews,
  getVisibleFarmVisits,
  getVisibleFarms,
  getVisibleIncidents,
  getVolunteerStats,
  entityKindOf,
  reportHeadline,
  setSession,
  totalHeads,
} from '../src/core/index'

/**
 * A80 — POINT 7c: THE PDF AND THE DASHBOARD CANNOT DISAGREE.
 *
 * The product owner's condition, in his own words: *the PDF's figures are the
 * SAME core accessors as the dashboard, with no parallel recalculation*, and
 * *a script proving the equality on a test set*.
 *
 * ★ THE FAILURE THIS PREVENTS IS SPECIFIC AND IT IS NOT HYPOTHETICAL. A report
 *   is written months after the screen it summarises, by somebody reading the
 *   dashboard and re-deriving what he sees. The two then agree on the day it
 *   is written and drift the first time a status is added, a cancellation rule
 *   changes, or "active" comes to mean something slightly different. **Two
 *   numbers with one name is worse than one number**, because the director
 *   quotes whichever he has and the coordinator defends the other.
 *
 * So every field of `ProgrammeReport` is compared against the accessor the
 * dashboard itself renders — and where the report legitimately derives
 * something no accessor exposes yet (completed guards in the window, incidents
 * by severity), the derivation is re-done here INDEPENDENTLY, off `_raw()`, so
 * the check is not the report agreeing with itself.
 *
 * ★ AND IT RUNS ON THREE STORES, NOT ONE: the fixtures, an EMPTY programme, and
 *   the fixtures plus a farm and an incident added under it. An equality that
 *   only holds on the demo data is an equality that holds by coincidence.
 *
 * No browser, no dev server, no network.
 *   bun run report
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

const eq = (label: string, a: number | null, b: number | null) =>
  check(label, a === b, `report ${a} vs dashboard ${b}`)

/**
 * Every field, against the accessor the DASHBOARD uses — independently
 * re-derived where there is no accessor yet.
 */
function compareAgainstDashboard(what: string): void {
  const r = buildProgrammeReport()
  const dunams = getDunamKpis()
  const volunteers = getVolunteerStats()
  const drivers = getDriverStats()
  const farms = getVisibleFarms()

  section(`${what} — every figure against the dashboard's own accessor`)

  eq('guarded dunams', r.guardedDunams, dunams.guardedDunams)
  eq('potential dunams', r.potentialDunams, dunams.potentialDunams)
  eq('entities', r.entitiesTotal, farms.length)
  eq('farms', r.farms, farms.filter((f) => entityKindOf(f) === 'farm').length)
  eq('moshavim', r.moshavim, farms.filter((f) => entityKindOf(f) === 'moshav').length)
  eq('other entities', r.otherEntities, farms.filter((f) => entityKindOf(f) === 'other').length)
  eq('active volunteers', r.volunteersActive, volunteers.active)
  eq('total volunteers', r.volunteersTotal, volunteers.total)
  eq('smartphone', r.volunteersSmartphone, volunteers.smartphone)
  eq('kosher', r.volunteersKosher, volunteers.kosher)
  eq('drivers', r.driversTotal, drivers.total)
  eq('seats', r.driverSeats, drivers.totalSeats)
  eq('guards upcoming', r.guardsUpcoming, getUpcomingMissionViews().length)

  check(
    'the status breakdown is the dashboard’s, entry for entry',
    JSON.stringify(r.byStatus) === JSON.stringify(getFarmStatusCounts()),
  )
  check(
    'and it sums to the entity count',
    r.byStatus.reduce((n, s) => n + s.count, 0) === r.entitiesTotal,
    `${r.byStatus.reduce((n, s) => n + s.count, 0)} vs ${r.entitiesTotal}`,
  )

  // --- the ones with no accessor yet, re-derived independently -------------
  const from = Date.now() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000
  const completedByHand = getPastMissionViews().filter(
    (v) => v.mission.status === 'completed',
  )
  eq('guards completed (total)', r.guardsCompletedTotal, completedByHand.length)
  eq(
    'guards completed (window)',
    r.guardsCompletedWindow,
    completedByHand.filter(
      (v) => new Date(v.mission.completedAt ?? v.mission.endAt).getTime() >= from,
    ).length,
  )

  const recent = getVisibleIncidents().filter(
    (i) => new Date(i.reportedAt).getTime() >= from,
  )
  eq('incidents in the window', r.incidentsWindowTotal, recent.length)
  eq('urgent', r.incidentsWindow.urgent, recent.filter((i) => i.severity === 'urgent').length)
  eq(
    'suspicious',
    r.incidentsWindow.suspicious,
    recent.filter((i) => i.severity === 'suspicious').length,
  )
  eq(
    'observation',
    r.incidentsWindow.observation,
    recent.filter((i) => i.severity === 'observation').length,
  )
  check(
    'and the three severities sum to the total',
    r.incidentsWindow.urgent + r.incidentsWindow.suspicious + r.incidentsWindow.observation ===
      r.incidentsWindowTotal,
  )

  eq(
    'visits upcoming',
    r.visitsUpcoming,
    getVisibleFarmVisits().filter((v) => !v.done && new Date(v.at).getTime() >= Date.now())
      .length,
  )

  /**
   * ★ POINT 6's RULE HAS TO SURVIVE ONTO THE PAGE. `guardedHeads` is null when
   *   no guarded entity has been asked, and the drawing skips the tile rather
   *   than printing a zero — this is the funding figure a director forwards.
   */
  const anyoneAsked = farms.some(
    (f) => (f.status === 'signed' || f.status === 'active') && totalHeads(f) !== null,
  )
  check(
    anyoneAsked
      ? '★ the head count is present and equals the dashboard'
      : '★ nobody has been asked, so the head count is NULL and not 0',
    anyoneAsked ? r.guardedHeads === dunams.guardedHeads : r.guardedHeads === null,
    String(r.guardedHeads),
  )
}

console.log('\n  A80 — the report and the dashboard say the same thing (PO point 7c)')

installBackend(DEMO_BACKEND)
setSession({ role: 'coordinator', personId: null, entityId: null })

// --- 1. the fixtures ---------------------------------------------------------
compareAgainstDashboard('1 — the fixtures')

// --- 2. a programme that has just started ------------------------------------
section('2 — an EMPTY programme, because zero is where a report lies most easily')
{
  const empty = {
    farms: [],
    generalMeetings: [],
    farmZones: [],
    threatZones: [],
    threatVectors: [],
    volunteers: [],
    drivers: [],
    anchorPoints: [],
    missions: [],
    incidents: [],
    farmVisits: [],
    tours: [],
    session: _raw().session,
  }
  installBackend({ name: 'empty', persists: false, seed: () => empty })
  setSession({ role: 'coordinator', personId: null, entityId: null })

  const r = buildProgrammeReport()
  check('everything is zero', r.entitiesTotal === 0 && r.guardedDunams === 0)
  check(
    '★ and the head count is NULL, not zero — nobody has been asked',
    r.guardedHeads === null,
    String(r.guardedHeads),
  )
  check(
    'the headline still reads as a sentence',
    reportHeadline(r).includes('דונם בשמירה'),
    reportHeadline(r),
  )
  check(
    'and it does NOT claim a head count',
    !reportHeadline(r).includes('ראשים'),
    reportHeadline(r),
  )
}
compareAgainstDashboard('2 — the empty programme')

// --- 3. the fixtures, moved --------------------------------------------------
section('3 — and again after the store has been changed under it')
installBackend(DEMO_BACKEND)
setSession({ role: 'coordinator', personId: null, entityId: null })
{
  const before = buildProgrammeReport()
  const farm = createFarm({
    photo: null,
    name: 'A80',
    locality: 'באר שבע',
    region: 'נגב',
    type: 'livestock',
    entityKind: 'moshav',
    status: 'active',
    position: { lat: 31.25, lng: 34.79 },
    farmDunams: 1000,
    grazingDunams: 500,
    contacts: [],
    commitments: [],
    livestock: [{ kind: 'sheep', label: '', heads: 77 }],
    agreements: [],
    notes: '',
  })
  createVolunteer({
    photo: null,
    name: 'A80',
    age: 20,
    phone: '0500000080',
    phoneType: 'kosher',
    yeshiva: 'A80',
    locality: 'באר שבע',
    status: 'active',
    inactiveReason: null,
    notes: '',
  })
  createFarmVisit({
    farmId: farm.id,
    at: new Date(Date.now() + 86_400_000).toISOString(),
    note: 'A80',
    done: false,
  })
  addIncident({
    farmId: farm.id,
    missionId: null,
    severity: 'urgent',
    description: 'A80',
    position: null,
  })

  const after = buildProgrammeReport()
  check('the new entity is counted', after.entitiesTotal === before.entitiesTotal + 1)
  check('it lands in the moshav column', after.moshavim === before.moshavim + 1)
  check('its dunams are guarded, not potential', after.guardedDunams === before.guardedDunams + 1500)
  check(
    '★ and its head count joins the guarded total',
    after.guardedHeads !== null &&
      before.guardedHeads !== null &&
      after.guardedHeads === before.guardedHeads + 77,
    `${before.guardedHeads} → ${after.guardedHeads}`,
  )
  check('the kosher volunteer is counted as kosher', after.volunteersKosher === before.volunteersKosher + 1)
  check('the planned visit is counted', after.visitsUpcoming === before.visitsUpcoming + 1)
  check(
    'and the urgent incident lands in the urgent column',
    after.incidentsWindow.urgent === before.incidentsWindow.urgent + 1,
  )
}
compareAgainstDashboard('3 — the changed store')

// --- 4. no parallel arithmetic in the drawing --------------------------------
section('4 — the DRAWING contains no arithmetic of its own')

/**
 * ★ THE CHECK THAT KEEPS 7c TRUE WHEN NOBODY IS LOOKING. Everything above
 *   compares the report BUILDER to the dashboard; none of it can see what the
 *   canvas actually prints. So the drawing code is read and required to
 *   contain no accessor call and no `.filter(` / `.reduce(` over programme
 *   data: it may format and position what `ProgrammeReport` already holds, and
 *   nothing else. The day somebody computes a total in the renderer, this
 *   fails.
 */
{
  const draw = readFileSync('src/ui/report/draw.ts', 'utf8')

  /**
   * ★ THE INSTRUMENT IS THE IMPORT LIST, NOT A REGEX OVER CALL SITES. A first
   *   draft grepped for `get…(` and flagged `getComputedStyle`, `getContext`
   *   and `getPropertyValue` — the three DOM calls a canvas renderer cannot do
   *   without. What actually matters is narrower and exact: **the renderer may
   *   import a TYPE from the domain and nothing executable.** With no value
   *   imported from `@core`, it CANNOT read the store, so there is nothing to
   *   recompute even by accident.
   */
  const coreImports = [...draw.matchAll(/^import\s+(type\s+)?\{[^}]*\}\s+from\s+'@core[^']*'/gm)]
  check(
    '★ the renderer imports only TYPES from the domain — it cannot read the store',
    coreImports.length > 0 && coreImports.every((m) => m[1] !== undefined),
    coreImports.map((m) => m[0].replace(/\s+/g, ' ')).join(' | ') || 'no @core import at all',
  )
  const arithmetic = draw.match(/\.reduce\(|\.filter\(\(\w+\) => \w+\.(status|severity)/g) ?? []
  check(
    '★ and it aggregates nothing',
    arithmetic.length === 0,
    arithmetic.join(' ') || 'none',
  )
  check(
    'it does draw the head count conditionally, not as a zero',
    draw.includes('report.guardedHeads !== null'),
  )
}

console.log('')
if (failures > 0) {
  console.log(`  ${failures} of ${checks} checks FAILED.`)
  process.exit(1)
}
console.log(`  All ${checks} checks passed.`)
