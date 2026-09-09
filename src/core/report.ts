import {
  NEGLECT_DAYS_INITIAL,
  coverageState,
  farmGuardStats,
  getDriverStats,
  getDunamKpis,
  getFarmStatusCounts,
  getPastMissionViews,
  getUpcomingMissionViews,
  getCountableFarms,
  getVisibleFarmVisits,
  getVisibleIncidents,
  getVisibleMissions,
  getVolunteerStats,
} from './access'
import { now } from './clock'
import { WEIGHTED_DUNAM_TARGET, effectiveAreas } from './fields'
import { dunamsByRegion } from './regions'
import { isTestId } from './testData'
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

  /**
   * X12.4 — the ground, BY REGION. The two dunam totals above say how much;
   * this says where, which is the question the association's own maps ask.
   * Heaviest first, regions holding nothing dropped — `dunamsByRegion`, the
   * same function the dashboard's block calls, so a printed page and a screen
   * can never disagree about a funding figure.
   */
  dunamsByRegion: Array<{ name: string; dunams: number; count: number }>
  /**
   * The same distribution, already folded to what fits on ONE line of A4: the
   * six heaviest, then a single "אחר" row carrying the rest.
   *
   * ⚠️ FOLDED HERE AND NOT IN THE RENDERER, and that is a rule this report has
   *    been built under from the start: `bun run report` greps the drawing
   *    code for arithmetic and fails it. A page that sums its own rows is a
   *    page that can disagree with the screen — so the domain decides what the
   *    numbers are and the renderer only decides where they sit.
   */
  dunamsByRegionTop: Array<{ name: string; dunams: number }>

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

  /**
   * ★★ AF5.4 (2026-09-09) — « UNE SECTION ÉVÉNEMENTS DANS LE DOCUMENT », ET
   *    C'EST UNE LISTE, PAS TROIS NOMBRES.
   *
   * Les trois compteurs par gravité au-dessus disent COMBIEN ; ils ne disent
   * pas ce qui s'est passé, et « 2 urgents » sur une page qu'un directeur
   * transmet à un bailleur est une phrase qui appelle immédiatement un coup de
   * téléphone. Les entrées sont les plus RÉCENTES d'abord et plafonnées à ce
   * qui tient sur la page ; `incidentsWindowTotal` porte le reste, de sorte
   * que la liste ne puisse jamais être lue comme exhaustive quand elle ne
   * l'est pas.
   */
  incidentsList: Array<{
    at: string
    farm: string
    severity: IncidentSeverity
    text: string
  }>

  // --- what is next -------------------------------------------------------
  visitsUpcoming: number

  // -------------------------------------------------------------------------
  // ★★ AF5.3 (2026-09-09) — « C'EST UN RÉCAPITULATIF DE TOUTE L'ACTIVITÉ, PAS
  //    UN EXTRAIT. »
  // -------------------------------------------------------------------------

  /** Les deux états qui comptent pour l'association, nommés plutôt que déduits. */
  farmsSigned: number
  farmsActive: number

  /**
   * ★ « DOUNAMS DÉCLARÉS » N'EST PAS « DOUNAMS EN SHMIRA », ET LES CONFONDRE
   *   DOUBLE LE CHIFFRE. Celui-ci est la surface de TOUT le fichier — signé,
   *   en cours, jamais contacté — c'est-à-dire le potentiel du programme ;
   *   `guardedDunams` est ce qui est effectivement sous garde. Les deux
   *   figurent, et le rapport dit lequel est lequel.
   */
  declaredDunams: number
  /** AA3.2 — la même surface sous garde, pondérée par type de terrain. */
  weightedGuardedDunams: number
  /** L'objectif en vigueur, et le pourcentage atteint. */
  targetWeighted: number
  targetPercent: number

  /**
   * ★ FERMES SANS GARDE RÉCENTE — DEUX NOMBRES ET NON UN, parce que les deux
   *   situations n'appellent pas le même geste : « jamais » veut dire qu'une
   *   ferme a signé et n'a rien reçu, « ancienne » qu'elle a été servie puis
   *   oubliée. Le seuil utilisé est porté avec eux, sinon le chiffre ne veut
   *   rien dire hors de l'appareil qui l'a produit.
   */
  neglectDays: number
  farmsNeverGuarded: number
  farmsStaleGuard: number
}

export interface ReportOptions {
  /**
   * L'objectif en dounams pondérés. Le PO le règle dans הגדרות (AB5a) et ce
   * réglage vit dans le navigateur ; @core ne lit pas `localStorage`, donc
   * l'appelant le passe. Absent = la constante de l'association.
   */
  targetWeighted?: number
  /** Le seuil d'oubli d'AC4.5, même raison. Absent = la valeur initiale. */
  neglectDays?: number
}

const isWithin = (iso: string, from: number): boolean => {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t >= from
}

/** Combien d'événements le document liste. Voir `incidentsList`. */
const INCIDENTS_ON_PAGE = 8

export function buildProgrammeReport(
  windowDays: number = REPORT_WINDOW_DAYS,
  options: ReportOptions = {},
): ProgrammeReport {
  const at = now()
  const from = at.getTime() - windowDays * 24 * 60 * 60 * 1000

  const dunams = getDunamKpis()
  const volunteers = getVolunteerStats()
  const drivers = getDriverStats()
  const byStatus = getFarmStatusCounts()
  /* AH3.5 — le compte rendu que l'association envoie ne porte jamais le jeu
     d'essai. Voir `getCountableFarms`. */
  const entities = getCountableFarms()

  /**
   * ★ COMPLETED GUARDS ARE COUNTED OFF `getPastMissionViews`, WHICH ALREADY
   *   EXCLUDES THE CANCELLED ONES. Counting raw missions would put every night
   *   that was called off into a figure a funder reads as work delivered.
   */
  const past = getPastMissionViews().filter((v) => !isTestId(v.mission.id))
  const completed = past.filter((v) => v.mission.status === 'completed')

  const incidents = getVisibleIncidents().filter(
    (i) => !isTestId(i.id) && isWithin(i.reportedAt, from),
  )
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
  /**
   * X12.4 — computed once, published twice: the full distribution for the
   * dashboard's bars and the folded six-plus-rest for the printed line.
   */
  const regionRows = dunamsByRegion(entities)
  const REGION_ROWS_ON_PAGE = 6
  const regionRest = regionRows
    .slice(REGION_ROWS_ON_PAGE)
    .reduce((sum, r) => sum + r.dunams, 0)
  const regionTop: Array<{ name: string; dunams: number }> = [
    ...regionRows
      .slice(0, REGION_ROWS_ON_PAGE)
      .map((r) => ({ name: r.name, dunams: r.dunams })),
    ...(regionRest > 0 ? [{ name: 'אחר', dunams: regionRest }] : []),
  ]

  const anyoneAsked = entities.some(
    (f) => (f.status === 'signed' || f.status === 'active') && totalHeads(f) !== null,
  )

  /* AF5.3 — les fermes sans garde récente, avec le seuil qui les définit. */
  const neglectDays = options.neglectDays ?? NEGLECT_DAYS_INITIAL
  let farmsNeverGuarded = 0
  let farmsStaleGuard = 0
  let declaredDunams = 0
  for (const farm of entities) {
    declaredDunams += effectiveAreas(farm).total
    const state = coverageState(farm, farmGuardStats(farm.id, at.getTime()), neglectDays)
    if (state === 'never') farmsNeverGuarded++
    else if (state === 'stale') farmsStaleGuard++
  }

  const targetWeighted = options.targetWeighted ?? WEIGHTED_DUNAM_TARGET

  return {
    generatedAt: at.toISOString(),
    windowDays,

    guardedDunams: dunams.guardedDunams,
    potentialDunams: dunams.potentialDunams,
    guardedHeads: anyoneAsked ? dunams.guardedHeads : null,
    dunamsByRegion: regionRows.map(({ name, dunams: d, count }) => ({
      name,
      dunams: d,
      count,
    })),
    dunamsByRegionTop: regionTop,

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
    // AH3.5 — moins le jeu d'essai, comme les gardes passées juste au-dessus.
    guardsUpcoming: getUpcomingMissionViews().filter((v) => !isTestId(v.mission.id)).length,

    incidentsWindow,
    incidentsWindowTotal: incidents.length,
    incidentsList: [...incidents]
      .sort(
        (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
      )
      .slice(0, INCIDENTS_ON_PAGE)
      .map((i) => ({
        at: i.reportedAt,
        farm: entities.find((f) => f.id === i.farmId)?.name ?? '',
        severity: i.severity,
        text: i.description,
      })),

    visitsUpcoming: getVisibleFarmVisits().filter(
      (v) => !v.done && new Date(v.at).getTime() >= at.getTime(),
    ).length,

    farmsSigned: entities.filter((f) => f.status === 'signed').length,
    farmsActive: entities.filter((f) => f.status === 'active').length,
    declaredDunams,
    weightedGuardedDunams: dunams.weightedSigned,
    targetWeighted,
    targetPercent:
      targetWeighted > 0
        ? Math.round((dunams.weightedSigned / targetWeighted) * 100)
        : 0,
    neglectDays,
    farmsNeverGuarded,
    farmsStaleGuard,
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
