import {
  getDriverStats,
  getDunamKpis,
  getFarmStatusCounts,
  getPastMissionViews,
  getUpcomingMissionViews,
  getVisibleFarms,
  getVisibleFarmVisits,
  getVisibleIncidents,
  getVisibleMissions,
  getVolunteerStats,
} from './access'
import { now } from './clock'
import { entityKindOf, totalHeads } from './types'
import type { FarmStatusCount, IncidentSeverity } from './types'

/**
 * PO POINT 7 (2026-08-31) — THE REPORT FOR THE EMPLOYER, AS DATA.
 *
 * The association's director needs one page he can read in thirty seconds and
 * forward to whoever funds the programme. This file is that page's NUMBERS and
 * nothing else — no layout, no PDF, no DOM. `src/ui/report/` draws it.
 *
 * ★★ POINT 7c IS THE WHOLE REASON THIS FILE EXISTS RATHER THAN A FUNCTION
 *    INSIDE THE PDF WRITER. The product owner's condition, in his words: the
 *    PDF's figures must be the SAME core accessors as the dashboard, with no
 *    parallel recalculation. So every field below is `getDunamKpis()`,
 *    `getVolunteerStats()`, `getDriverStats()`, `getFarmStatusCounts()` — the
 *    functions the dashboard already renders — and where a number genuinely
 *    has no accessor yet (guards in the last 30 days, incidents by severity),
 *    it is derived HERE, once, so the dashboard could adopt it rather than the
 *    report growing a second arithmetic.
 *
 *    `bun run report` drives the dashboard's accessors and this builder over
 *    the same store and fails on any disagreement. A report that quietly
 *    disagrees with the screen the coordinator was looking at is worse than no
 *    report: it is two numbers with one name.
 *
 * ★ EVERYTHING IS ROLE-FILTERED BY CONSTRUCTION, because it reads the same
 *   `getVisible*` accessors. A report is a coordinator's document; if a
 *   farmer's session ever reached this, it would produce his own farm's row
 *   and nothing else rather than leaking the programme.
 */

/** Days back the "recent" figures look. One month, because funders ask monthly. */
export const REPORT_WINDOW_DAYS = 30

export interface ProgrammeReport {
  /** ISO datetime the report was built — printed on it, always. */
  generatedAt: string
  windowDays: number

  // --- the ground ---------------------------------------------------------
  guardedDunams: number
  potentialDunams: number
  /** PO POINT 6 — null when no guarded entity has been asked. Never rendered as 0. */
  guardedHeads: number | null

  // --- the entities -------------------------------------------------------
  entitiesTotal: number
  byStatus: FarmStatusCount[]
  farms: number
  moshavim: number
  otherEntities: number

  // --- the people ---------------------------------------------------------
  volunteersActive: number
  volunteersTotal: number
  volunteersSmartphone: number
  volunteersKosher: number
  driversTotal: number
  driverSeats: number

  // --- the nights ---------------------------------------------------------
  guardsCompletedTotal: number
  guardsCompletedWindow: number
  guardsUpcoming: number

  // --- what went wrong ----------------------------------------------------
  incidentsWindow: Record<IncidentSeverity, number>
  incidentsWindowTotal: number

  // --- what is next -------------------------------------------------------
  visitsUpcoming: number
}

const isWithin = (iso: string, from: number): boolean => {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= from
}

export function buildProgrammeReport(
  windowDays: number = REPORT_WINDOW_DAYS,
): ProgrammeReport {
  const at = now()
  const from = at.getTime() - windowDays * 24 * 60 * 60 * 1000

  const dunams = getDunamKpis()
  const volunteers = getVolunteerStats()
  const drivers = getDriverStats()
  const byStatus = getFarmStatusCounts()
  const entities = getVisibleFarms()

  /**
   * ★ COMPLETED GUARDS ARE COUNTED OFF `getPastMissionViews`, WHICH ALREADY
   *   EXCLUDES THE CANCELLED ONES. Counting raw missions would put every night
   *   that was called off into a figure a funder reads as work delivered.
   */
  const past = getPastMissionViews()
  const completed = past.filter((v) => v.mission.status === 'completed')

  const incidents = getVisibleIncidents().filter((i) => isWithin(i.reportedAt, from))
  const incidentsWindow: Record<IncidentSeverity, number> = {
    observation: incidents.filter((i) => i.severity === 'observation').length,
    suspicious: incidents.filter((i) => i.severity === 'suspicious').length,
    urgent: incidents.filter((i) => i.severity === 'urgent').length,
  }

  /**
   * ★ "GUARDED HEADS" IS NULL, NOT ZERO, WHEN NOBODY HAS BEEN ASKED — the same
   *   rule as `totalHeads` and for the same reason. This is a funding figure,
   *   and the one thing worse than not knowing is printing a zero on a page a
   *   director forwards to a funder.
   */
  const anyoneAsked = entities.some(
    (f) => (f.status === 'signed' || f.status === 'active') && totalHeads(f) !== null,
  )

  return {
    generatedAt: at.toISOString(),
    windowDays,

    guardedDunams: dunams.guardedDunams,
    potentialDunams: dunams.potentialDunams,
    guardedHeads: anyoneAsked ? dunams.guardedHeads : null,

    entitiesTotal: entities.length,
    byStatus,
    farms: entities.filter((f) => entityKindOf(f) === 'farm').length,
    moshavim: entities.filter((f) => entityKindOf(f) === 'moshav').length,
    otherEntities: entities.filter((f) => entityKindOf(f) === 'other').length,

    volunteersActive: volunteers.active,
    volunteersTotal: volunteers.total,
    volunteersSmartphone: volunteers.smartphone,
    volunteersKosher: volunteers.kosher,
    driversTotal: drivers.total,
    driverSeats: drivers.totalSeats,

    guardsCompletedTotal: completed.length,
    guardsCompletedWindow: completed.filter((v) =>
      isWithin(v.mission.completedAt ?? v.mission.endAt, from),
    ).length,
    // `getUpcomingMissionViews` is the dashboard's own "what is coming", so the
    // two cannot disagree about what "upcoming" means.
    guardsUpcoming: getUpcomingMissionViews().length,

    incidentsWindow,
    incidentsWindowTotal: incidents.length,

    visitsUpcoming: getVisibleFarmVisits().filter(
      (v) => !v.done && new Date(v.at).getTime() >= at.getTime(),
    ).length,
  }
}

/**
 * The one line a funder actually quotes, and the reason the report exists.
 *
 * Kept here rather than in the drawing code so `bun run report` can assert it
 * against the same store the dashboard rendered.
 */
export function reportHeadline(r: ProgrammeReport): string {
  const parts = [`${r.guardedDunams.toLocaleString('he-IL')} דונם בשמירה`]
  if (r.guardedHeads !== null) {
    parts.push(`${r.guardedHeads.toLocaleString('he-IL')} ראשים`)
  }
  parts.push(`${r.entitiesTotal.toLocaleString('he-IL')} יישויות`)
  parts.push(`${r.volunteersActive.toLocaleString('he-IL')} מתנדבים פעילים`)
  return parts.join(' · ')
}

/** Guard against a silent regression: `getVisibleMissions` is the whole set. */
export function reportMissionUniverse(): number {
  return getVisibleMissions().length
}
