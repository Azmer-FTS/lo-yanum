import { DAY, addDays, fromDayKey, isTonight, localDayKey, now } from './clock'
import type { AssociationInput } from './association'
import { effectiveAreas, guardedDunamsOf, weightedDunams } from './fields'
import { positionOfLocality } from './geo'
import { farmRegion, regionOfLocality } from './regions'
import type { RegionId } from './regions'
import { signatureImageOf } from './signatures'
import { _raw, getSession } from './store'
import { buildDayPlan } from './tours'
import { guardWasHeld, silenceSignals } from './vigil'
import type { VigilThresholds } from './vigil'
import type { DayPlan, Tour } from './tours'
import type {
  AgendaEvent,
  AnchorPoint,
  ConfirmationState,
  DashboardAlert,
  Driver,
  DriverStats,
  DunamKpis,
  Farm,
  FarmStatus,
  FarmStatusCount,
  FarmVisit,
  FarmZone,
  GeneralMeeting,
  Incident,
  IncidentView,
  LegConfirmation,
  Mission,
  MissionLeg,
  MissionView,
  ThreatVector,
  ThreatZone,
  Volunteer,
  VolunteerStats,
} from './types'
import { FARM_PIPELINE, resolveConfirmation, totalHeads } from './types'

/**
 * ROLE-FILTERED DATA ACCESS — the single gate between the store and the UI.
 *
 * Screens never filter by role themselves; they ask for what they are allowed
 * to see and get exactly that. Every function here maps 1:1 to a Supabase RLS
 * policy in Lot 1:
 *
 *   coordinator → full access
 *   farmer      → rows whose farm_id is the farm they are a contact of
 *   volunteer   → rows attached to a mission they are assigned to
 *   driver      → rows attached to a mission they drive
 */

// --- Session-derived identity ---------------------------------------------

/** The farm the current farmer belongs to, or null for any other role. */
export function getMyFarm(): Farm | null {
  const s = getSession()
  if (s.role !== 'farmer' || !s.entityId) return null
  return (
    _raw().farms.find((f) => f.contacts.some((c) => c.id === s.entityId)) ?? null
  )
}

export function getMyContactName(): string | null {
  const s = getSession()
  if (s.role !== 'farmer' || !s.entityId) return null
  for (const farm of _raw().farms) {
    const contact = farm.contacts.find((c) => c.id === s.entityId)
    if (contact) return contact.name
  }
  return null
}

export function getMyVolunteer(): Volunteer | null {
  const s = getSession()
  if (s.role !== 'volunteer' || !s.entityId) return null
  return _raw().volunteers.find((v) => v.id === s.entityId) ?? null
}

export function getMyDriver(): Driver | null {
  const s = getSession()
  if (s.role !== 'driver' || !s.entityId) return null
  return _raw().drivers.find((d) => d.id === s.entityId) ?? null
}

/** Display name for whoever is signed in — used by the header and in reports. */
export function getMyDisplayName(): string | null {
  const s = getSession()
  switch (s.role) {
    case 'coordinator':
      return null // resolved from config by the UI
    case 'farmer':
      return getMyContactName()
    case 'volunteer':
      return getMyVolunteer()?.name ?? null
    case 'driver':
      return getMyDriver()?.name ?? null
  }
}

// --- Missions --------------------------------------------------------------

/** Every mission the current session is allowed to see, newest start first. */
export function getVisibleMissions(): Mission[] {
  const s = getSession()
  const all = _raw().missions

  let scoped: Mission[]
  switch (s.role) {
    case 'coordinator':
      scoped = all
      break
    case 'farmer': {
      const farm = getMyFarm()
      scoped = farm ? all.filter((m) => m.farmId === farm.id) : []
      break
    }
    case 'volunteer':
      scoped = all.filter((m) =>
        m.assignments.some((a) => a.volunteerId === s.entityId),
      )
      break
    case 'driver':
      scoped = all.filter((m) =>
        m.drivers.some((dr) => dr.driverId === s.entityId),
      )
      break
  }

  return [...scoped].sort(
    (a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
  )
}

export function getMission(missionId: string): Mission | null {
  return getVisibleMissions().find((m) => m.id === missionId) ?? null
}

/** Hydrates a mission with its farm, anchor point, driver and volunteers. */
export function toMissionView(mission: Mission): MissionView | null {
  const d = _raw()
  const farm = d.farms.find((f) => f.id === mission.farmId)
  const anchorPoint = d.anchorPoints.find((a) => a.id === mission.anchorPointId)
  if (!farm || !anchorPoint) return null

  return {
    mission,
    farm,
    anchorPoint,
    // `flatMap` rather than `map(...).filter()`: an id that no longer resolves
    // must vanish, not become an `undefined` hole the screens have to guard.
    additionalAnchorPoints: mission.additionalAnchorPointIds.flatMap((id) => {
      const extra = d.anchorPoints.find((a) => a.id === id)
      return extra ? [extra] : []
    }),
    // G5.3 — hydrate each car: its driver row and its passenger rows.
    drivers: mission.drivers.flatMap((entry) => {
      const driver = d.drivers.find((dr) => dr.id === entry.driverId)
      if (!driver) return []
      const passengers = entry.passengerVolunteerIds.flatMap((id) => {
        const v = d.volunteers.find((x) => x.id === id)
        return v ? [v] : []
      })
      return [{ driver, passengers, confirmed: entry.confirmed }]
    }),
    driver:
      d.drivers.find((dr) => dr.id === mission.drivers[0]?.driverId) ?? null,
    volunteers: mission.assignments.flatMap((a) => {
      const volunteer = d.volunteers.find((v) => v.id === a.volunteerId)
      return volunteer ? [{ volunteer, isGroupPhone: a.isGroupPhone }] : []
    }),
  }
}

export function getVisibleMissionViews(): MissionView[] {
  return getVisibleMissions().flatMap((m) => toMissionView(m) ?? [])
}

export function getMissionView(missionId: string): MissionView | null {
  const mission = getMission(missionId)
  return mission ? toMissionView(mission) : null
}

/** Guards happening tonight, within the visibility scope of the session. */
export function getTonightMissionViews(): MissionView[] {
  const t = now()
  return getVisibleMissionViews()
    // G9bis — a cancelled guard is not happening: it leaves "tonight" and,
    // through it, the dashboard, the volunteer and the driver live views.
    .filter((v) => v.mission.status !== 'cancelled')
    .filter((v) => isTonight(v.mission.startAt, v.mission.endAt, t))
    .sort(
      (a, b) =>
        new Date(a.mission.startAt).getTime() -
        new Date(b.mission.startAt).getTime(),
    )
}

/**
 * The one guard the current volunteer / driver is on right now (or next up).
 * Returns null for the coordinator and the farmer — they have no single guard.
 */
export function getMyActiveMissionView(): MissionView | null {
  const s = getSession()
  if (s.role !== 'volunteer' && s.role !== 'driver') return null
  return getTonightMissionViews()[0] ?? null
}

export function getUpcomingMissionViews(): MissionView[] {
  const t = now().getTime()
  return getVisibleMissionViews()
    .filter((v) => v.mission.status !== 'cancelled')
    .filter((v) => new Date(v.mission.endAt).getTime() > t)
    .sort(
      (a, b) =>
        new Date(a.mission.startAt).getTime() -
        new Date(b.mission.startAt).getTime(),
    )
}

export function getPastMissionViews(): MissionView[] {
  const t = now().getTime()
  return getVisibleMissionViews().filter(
    (v) =>
      v.mission.status !== 'cancelled' &&
      new Date(v.mission.endAt).getTime() <= t,
  )
}

/**
 * G9bis — the cancelled guards, on their own (A45's "distinct stats").
 *
 * NOT a filter the operational lists apply themselves: upcoming, past and
 * tonight all EXCLUDE cancelled guards at the accessor level, so no screen can
 * forget to. This list is the one place they surface — the missions screen's
 * own tab, where reactivation lives — soonest night first.
 */
export function getCancelledMissionViews(): MissionView[] {
  return getVisibleMissionViews()
    .filter((v) => v.mission.status === 'cancelled')
    .sort(
      (a, b) =>
        new Date(a.mission.startAt).getTime() -
        new Date(b.mission.startAt).getTime(),
    )
}

/** True when the group phone for this mission belongs to the current session. */
export function isGroupPhoneHolder(mission: Mission): boolean {
  const s = getSession()
  if (s.role !== 'volunteer') return false
  return mission.assignments.some(
    (a) => a.volunteerId === s.entityId && a.isGroupPhone,
  )
}

// --- Farms -----------------------------------------------------------------

export function getVisibleFarms(): Farm[] {
  const s = getSession()
  const d = _raw()

  switch (s.role) {
    case 'coordinator':
      return d.farms
    case 'farmer': {
      const farm = getMyFarm()
      return farm ? [farm] : []
    }
    case 'volunteer':
    case 'driver': {
      const ids = new Set(getVisibleMissions().map((m) => m.farmId))
      return d.farms.filter((f) => ids.has(f.id))
    }
  }
}

export function getFarm(farmId: string): Farm | null {
  return getVisibleFarms().find((f) => f.id === farmId) ?? null
}

export function getFarmStatusCounts(): FarmStatusCount[] {
  const farms = getVisibleFarms()
  const statuses: FarmStatus[] = [...FARM_PIPELINE, 'declined']
  return statuses.map((status) => ({
    status,
    count: farms.filter((f) => f.status === status).length,
  }))
}

/**
 * G14 — the two strategic dunam KPIs (A52). Computed here rather than in the
 * dashboard because the accept script recomputes them from the mocks and the
 * two must be the same function, not two implementations that agree today.
 */
export function getDunamKpis(): DunamKpis {
  const guarded: FarmStatus[] = ['signed', 'active']
  let guardedDunams = 0
  let potentialDunams = 0
  // PO POINT 6 — counted over the SAME entities as `guardedDunams`, so the two
  // numbers on the dashboard are two facts about one set rather than two sets.
  let guardedHeads = 0
  // AA3.2 — the same set as `guardedDunams`, weighted. See `DunamKpis`.
  let weightedSigned = 0
  for (const f of getVisibleFarms()) {
    /* AD1.4 — « la » surface : déclarée d'abord, mesurée à défaut. */
    const dunams = effectiveAreas(f).total
    if (guarded.includes(f.status)) {
      guardedDunams += dunams
      weightedSigned += weightedDunams(f)
      guardedHeads += totalHeads(f) ?? 0
    } else if (f.status !== 'declined') potentialDunams += dunams
  }
  return { guardedDunams, potentialDunams, guardedHeads, weightedSigned }
}

/** Farms with a scheduled visit, soonest first — the coordinator's to-do. */
export function getNextFarmVisits(limit = 5): Farm[] {
  return getVisibleFarms()
    .filter((f) => f.nextVisitAt !== null)
    .sort(
      (a, b) =>
        new Date(a.nextVisitAt as string).getTime() -
        new Date(b.nextVisitAt as string).getTime(),
    )
    .slice(0, limit)
}

// --- Anchor points ---------------------------------------------------------

export function getFarmZonesForFarm(farmId: string): FarmZone[] {
  if (!getFarm(farmId)) return []
  return _raw().farmZones.filter((z) => z.farmId === farmId)
}

export function getAllVisibleFarmZones(): FarmZone[] {
  const farmIds = new Set(getVisibleFarms().map((f) => f.id))
  return _raw().farmZones.filter((z) => farmIds.has(z.farmId))
}

// --- G18: the threat layer -------------------------------------------------

/**
 * A59 — THE THREAT LAYER IS COORDINATOR-ONLY, AND THE GATE IS HERE.
 *
 * Not in a screen that happens not to render it. A farmer's phone, a
 * volunteer's guard card and a driver's trip sheet must not be able to obtain
 * "we assess this wadi as a high-intensity approach" by any route — and the
 * only way to be sure of that is for the accessor itself to return nothing.
 * The rule is one line and it is the same line for both shapes, so there is no
 * second place for it to drift.
 *
 * The consequence is deliberate: a farmer cannot be shown the threat map for
 * his OWN farm either. That is not an oversight. The assessment names patterns
 * across holdings and is the programme's to hold; a farmer who wants to know
 * what is around him is told by a human, on the phone.
 *
 * These are the two functions Lot 1 transcribes into RLS first, because they
 * are the two where getting the policy wrong leaks something that matters.
 */
function threatLayerVisible(): boolean {
  return getSession().role === 'coordinator'
}

export function getVisibleThreatZones(): ThreatZone[] {
  if (!threatLayerVisible()) return []
  return _raw().threatZones
}

export function getVisibleThreatVectors(): ThreatVector[] {
  if (!threatLayerVisible()) return []
  return _raw().threatVectors
}

/**
 * What is attached to one entity, plus everything FREE at map level.
 *
 * The free shapes are included on purpose: a threat between two holdings is
 * the one a coordinator most needs to see while looking at either of them, and
 * a screen that showed only `farmId === this` would hide exactly that.
 */
export function getThreatsForFarm(farmId: string): {
  zones: ThreatZone[]
  vectors: ThreatVector[]
} {
  if (!threatLayerVisible() || !getFarm(farmId)) return { zones: [], vectors: [] }
  return {
    zones: _raw().threatZones.filter((z) => z.farmId === farmId || z.farmId === null),
    vectors: _raw().threatVectors.filter(
      (v) => v.farmId === farmId || v.farmId === null,
    ),
  }
}

export function getAnchorPointsForFarm(farmId: string): AnchorPoint[] {
  if (!getFarm(farmId)) return []
  return _raw().anchorPoints.filter((a) => a.farmId === farmId)
}

export function getAnchorPoint(anchorPointId: string): AnchorPoint | null {
  const anchor = _raw().anchorPoints.find((a) => a.id === anchorPointId)
  if (!anchor) return null
  return getFarm(anchor.farmId) ? anchor : null
}

export function getAllVisibleAnchorPoints(): AnchorPoint[] {
  const farmIds = new Set(getVisibleFarms().map((f) => f.id))
  return _raw().anchorPoints.filter((a) => farmIds.has(a.farmId))
}

// --- Volunteers & drivers --------------------------------------------------

/** The full roster is coordinator-only. Field roles get [] by design. */
export function getVolunteers(): Volunteer[] {
  return getSession().role === 'coordinator' ? _raw().volunteers : []
}

export function getDrivers(): Driver[] {
  return getSession().role === 'coordinator' ? _raw().drivers : []
}

export function getVolunteer(volunteerId: string): Volunteer | null {
  return getVolunteers().find((v) => v.id === volunteerId) ?? null
}

export function getVolunteerStats(): VolunteerStats {
  const volunteers = getVolunteers()
  const yeshivot = [...new Set(volunteers.map((v) => v.yeshiva))]

  return {
    total: volunteers.length,
    active: volunteers.filter((v) => v.status === 'active').length,
    inactive: volunteers.filter((v) => v.status === 'inactive').length,
    smartphone: volunteers.filter((v) => v.phoneType === 'smartphone').length,
    kosher: volunteers.filter((v) => v.phoneType === 'kosher').length,
    licenseCar: volunteers.filter((v) => v.hasLicense && v.hasCar).length,
    neverGuarded: volunteers.filter((v) => v.guardsCount === 0).length,
    byYeshiva: yeshivot
      .map((yeshiva) => ({
        yeshiva,
        count: volunteers.filter((v) => v.yeshiva === yeshiva).length,
      }))
      .sort((a, b) => b.count - a.count),
  }
}

/**
 * G14d — the driver roster's four instruments. "Free tonight" reads tonight's
 * missions through the same accessor the dashboard uses, so a cancelled guard
 * releases its driver here too (G9bis excludes cancelled at the accessor).
 */
/** Driver ids booked on one of tonight's guards — the "free tonight" filter's
 *  complement, shared by the stats and the roster's own filtering. */
export function getTonightBookedDriverIds(): string[] {
  return [
    ...new Set(
      getTonightMissionViews().flatMap((v) =>
        v.mission.drivers.map((d) => d.driverId),
      ),
    ),
  ]
}

export function getDriverStats(): DriverStats {
  const drivers = getDrivers()
  const bookedTonight = new Set(getTonightBookedDriverIds())
  return {
    total: drivers.length,
    totalSeats: drivers.reduce((sum, d) => sum + d.seats, 0),
    sevenPlusSeats: drivers.filter((d) => d.seats >= 7).length,
    freeTonight: drivers.filter((d) => !bookedTonight.has(d.id)).length,
  }
}

/** Missions a given volunteer has been on — coordinator view of one person. */
export function getMissionViewsForVolunteer(volunteerId: string): MissionView[] {
  if (getSession().role !== 'coordinator') return []
  return getVisibleMissionViews().filter((v) =>
    v.mission.assignments.some((a) => a.volunteerId === volunteerId),
  )
}

// --- Incidents -------------------------------------------------------------

export function getVisibleIncidents(): Incident[] {
  const s = getSession()
  const all = _raw().incidents

  let scoped: Incident[]
  switch (s.role) {
    case 'coordinator':
      scoped = all
      break
    case 'farmer': {
      const farm = getMyFarm()
      scoped = farm ? all.filter((i) => i.farmId === farm.id) : []
      break
    }
    case 'volunteer': {
      const missionIds = new Set(getVisibleMissions().map((m) => m.id))
      scoped = all.filter(
        (i) =>
          i.reporterId === s.entityId ||
          (i.missionId !== null && missionIds.has(i.missionId)),
      )
      break
    }
    case 'driver': {
      const missionIds = new Set(getVisibleMissions().map((m) => m.id))
      scoped = all.filter((i) => i.missionId !== null && missionIds.has(i.missionId))
      break
    }
  }

  return [...scoped].sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
  )
}

export function getVisibleIncidentViews(): IncidentView[] {
  const farms = getVisibleFarms()
  return getVisibleIncidents().flatMap((incident) => {
    const farm = farms.find((f) => f.id === incident.farmId)
    return farm ? [{ incident, farm }] : []
  })
}

/** D6.2 — incidents reported during one guard, oldest first for the timeline. */
export function getIncidentsForMission(missionId: string): Incident[] {
  return getVisibleIncidents()
    .filter((i) => i.missionId === missionId)
    .sort(
      (a, b) =>
        new Date(a.reportedAt).getTime() - new Date(b.reportedAt).getTime(),
    )
}

export function getIncidentView(incidentId: string): IncidentView | null {
  return (
    getVisibleIncidentViews().find((v) => v.incident.id === incidentId) ?? null
  )
}

// --- D4: farm visits & the agenda ------------------------------------------

/** Visits on farms this session can see, soonest first. */
export function getVisibleFarmVisits(): FarmVisit[] {
  const farmIds = new Set(getVisibleFarms().map((f) => f.id))
  return _raw()
    .farmVisits.filter((v) => farmIds.has(v.farmId))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
}

export function getFarmVisitsForFarm(farmId: string): FarmVisit[] {
  if (!getFarm(farmId)) return []
  return getVisibleFarmVisits().filter((v) => v.farmId === farmId)
}

export function getFarmVisit(visitId: string): FarmVisit | null {
  return getVisibleFarmVisits().find((v) => v.id === visitId) ?? null
}

/**
 * Everything that belongs on the calendar between two instants, ordered.
 *
 * Guards and visits are flattened into ONE shape here rather than in the
 * calendar component, so the agenda screen, the dashboard widget and any future
 * export all place events by the same rules. The half-open window `[from, to)`
 * is deliberate: a guard that ends at exactly midnight belongs to the night
 * that started it, not to the next day.
 */
export function getVisibleGeneralMeetings(): GeneralMeeting[] {
  return getSession().role === 'coordinator' ? _raw().generalMeetings : []
}

export function getGeneralMeeting(meetingId: string): GeneralMeeting | null {
  return (
    getVisibleGeneralMeetings().find((m) => m.id === meetingId) ?? null
  )
}

export function getAgendaEvents(from: Date, to: Date): AgendaEvent[] {
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const events: AgendaEvent[] = []

  for (const view of getVisibleMissionViews()) {
    const at = new Date(view.mission.startAt).getTime()
    if (at < fromMs || at >= toMs) continue
    events.push({
      id: view.mission.id,
      kind: 'mission',
      at: view.mission.startAt,
      endAt: view.mission.endAt,
      title: view.farm.name,
      // G4.2 — the agenda carries the recruiting gauge too: an amber block
      // labelled 2/5 says "not staffed yet" without opening anything.
      subtitle:
        view.mission.status === 'recruiting'
          ? `${view.mission.assignments.length}/${view.mission.requiredVolunteers} · ${view.anchorPoint.name}`
          : view.anchorPoint.name,
      href: `/coordinator/missions/${view.mission.id}`,
      missionStatus: view.mission.status,
      done: false,
      farmId: view.farm.id,
      // AB3 — the anchor point, not the farm centroid: that is where the
      // group physically stands, and it is what the missions map already
      // plots (C1.4).
      position: view.anchorPoint.position,
    })
  }

  // G6 — general meetings are the coordinator's own diary: no other role
  // sees them, exactly like the visit-planning surface.
  for (const meeting of getVisibleGeneralMeetings()) {
    const at = new Date(meeting.at).getTime()
    if (at < fromMs || at >= toMs) continue
    events.push({
      id: meeting.id,
      kind: 'meeting',
      at: meeting.at,
      endAt: meeting.endAt,
      title: meeting.title,
      subtitle: [meeting.location, meeting.person].filter(Boolean).join(' · '),
      href: '/coordinator/agenda',
      missionStatus: null,
      done: false,
      farmId: null,
      /**
       * AB3.4 — a meeting's place is a line of free text, so it is read
       * through the gazetteer and left `null` when that fails. « בית הכנסת של
       * דוד » is not a locality and never will be; the entry then shows as
       * מיקום חסר, which is the truth, rather than as a pin on the nearest
       * town, which would not be.
       */
      /**
       * ★★ AF3.1 (2026-09-09) — LE POINT COLLÉ PASSE DEVANT LE GAZETTEER, ET
       *    L'ORDRE EST LE POINT.
       *
       * « Le PO reçoit des localisations par WhatsApp de fermes qui ne sont
       * pas encore dans la base. » Un point collé depuis Waze désigne une
       * parcelle au bout d'un chemin ; le gazetteer, lui, ne connaît que des
       * centres de יישוב. Résoudre le texte d'abord donnerait au rendez-vous
       * le centre du village voisin ALORS QUE la coordonnée exacte est là,
       * dans la fiche — c'est-à-dire perdrait délibérément la seule
       * information précise de l'entrée.
       */
      position:
        meeting.position ??
        (meeting.location.trim() === '' ? null : positionOfLocality(meeting.location)),
    })
  }

  const farms = getVisibleFarms()
  for (const visit of getVisibleFarmVisits()) {
    const at = new Date(visit.at).getTime()
    if (at < fromMs || at >= toMs) continue
    const farm = farms.find((f) => f.id === visit.farmId)
    if (!farm) continue
    events.push({
      id: visit.id,
      kind: 'visit',
      at: visit.at,
      endAt: visit.at,
      title: farm.name,
      subtitle: visit.note,
      href: `/coordinator/farms/${farm.id}`,
      missionStatus: null,
      done: visit.done,
      farmId: farm.id,
      // AA4.4 — a farm parked at HOME_BASE by a sheet with no coordinates is
      // not a farm anybody can drive to, so the visit is מיקום חסר too.
      position: farm.positionMissing ? null : farm.position,
    })
  }

  return events.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  )
}

/** The next few entries from now on — the dashboard's compact agenda strip. */
export function getUpcomingAgendaEvents(limit = 3, days = 30): AgendaEvent[] {
  const from = now()
  const to = new Date(from.getTime() + days * DAY)
  return getAgendaEvents(from, to).slice(0, limit)
}

// --- G9: tours & the day plan ----------------------------------------------

/** Tours are the coordinator's own diary — no other role plans field days. */
export function getTourForDay(dayKey: string): Tour | null {
  if (getSession().role !== 'coordinator') return null
  return _raw().tours.find((t) => t.dayKey === dayKey) ?? null
}

/**
 * The "היום שלי" engine, store-fed: the day's saved tour folded around the
 * day's fixed hours. The maths lives in tours.ts as a pure function so the
 * acceptance script can drive it without a browser; this wrapper only
 * assembles the inputs through the same role gate as everything else.
 */
export function getDayPlan(dayKey: string): DayPlan {
  const day = fromDayKey(dayKey)
  return buildDayPlan({
    dayKey,
    tour: getTourForDay(dayKey),
    farms: getVisibleFarms(),
    events: getAgendaEvents(day, addDays(day, 1)),
  })
}

// --- R6: nominative presence ----------------------------------------------

export interface PresenceRow {
  volunteer: Volunteer
  isGroupPhone: boolean
  leg: LegConfirmation
  state: ConfirmationState
}

/** The roster for one leg of one mission, already reconciled. */
export function getPresenceRows(
  mission: Mission,
  leg: MissionLeg,
): PresenceRow[] {
  const volunteers = _raw().volunteers
  return mission.assignments.flatMap((a) => {
    const volunteer = volunteers.find((v) => v.id === a.volunteerId)
    if (!volunteer) return []
    return [
      {
        volunteer,
        isGroupPhone: a.isGroupPhone,
        leg: a[leg],
        state: resolveConfirmation(a[leg]),
      },
    ]
  })
}

export interface PresenceMismatch {
  mission: Mission
  farm: Farm
  volunteer: Volunteer
  leg: MissionLeg
  driverName: string
  driverPhone: string
  groupHolderName: string
  groupHolderPhone: string
}

/**
 * Every driver-vs-group disagreement currently visible to this session.
 *
 * This is the alert that matters most: it means one specific named person is
 * unaccounted for, and two people who were both there disagree about it.
 */
export function getPresenceMismatches(): PresenceMismatch[] {
  const d = _raw()
  const out: PresenceMismatch[] = []
  const legs: MissionLeg[] = ['outbound', 'inbound']

  for (const mission of getVisibleMissions()) {
    const farm = d.farms.find((f) => f.id === mission.farmId)
    if (!farm) continue

    const holderId = mission.assignments.find((a) => a.isGroupPhone)?.volunteerId
    const holder = d.volunteers.find((v) => v.id === holderId)

    for (const leg of legs) {
      for (const a of mission.assignments) {
        if (resolveConfirmation(a[leg]) !== 'mismatch') continue
        const volunteer = d.volunteers.find((v) => v.id === a.volunteerId)
        if (!volunteer) continue
        // G5.3 — the answerable driver is the one whose car he rides in.
        const carEntry =
          mission.drivers.find((dr) =>
            dr.passengerVolunteerIds.includes(a.volunteerId),
          ) ?? mission.drivers[0]
        const driver = d.drivers.find((dr) => dr.id === carEntry?.driverId)
        out.push({
          mission,
          farm,
          volunteer,
          leg,
          driverName: driver?.name ?? '',
          driverPhone: driver?.phone ?? '',
          groupHolderName: holder?.name ?? '',
          groupHolderPhone: holder?.phone ?? '',
        })
      }
    }
  }

  return out
}

// --- Dashboard -------------------------------------------------------------

/**
 * Live alerts, most severe first. Scoped like everything else, so the farmer
 * view reuses it and sees only his own farm's alerts.
 *
 * Every alert carries its own call list, so the coordinator can dial from the
 * dashboard without navigating anywhere.
 */
/**
 * ⚠️ LES SEUILS SONT UN ARGUMENT, PAS UNE LECTURE D'UN ÉTAT CACHÉ — même règle
 *    qu'AD2 pour le seuil d'écart. C'est ce qui fait de « le réglage suit
 *    immédiatement » une vérité par construction, et c'est ce qui permet à
 *    `bun run aepass` de poser la question à midi comme à trois heures.
 */
export function getAlerts(
  thresholds: VigilThresholds | undefined = undefined,
): DashboardAlert[] {
  const alerts: DashboardAlert[] = []
  const d = _raw()
  const farms = getVisibleFarms()
  const farmName = (id: string) => farms.find((f) => f.id === id)?.name ?? ''

  for (const incident of getVisibleIncidents()) {
    if (incident.severity !== 'urgent' || incident.resolved) continue
    const farm = farms.find((f) => f.id === incident.farmId)
    const primary = farm?.contacts.find((c) => c.isPrimary)
    alerts.push({
      id: `alert-${incident.id}`,
      kind: 'urgent_incident',
      farmName: farmName(incident.farmId),
      at: incident.reportedAt,
      detail: incident.description,
      href: `/coordinator/incidents/${incident.id}`,
      weight: 30,
      contacts: primary
        ? [
            {
              name: primary.name,
              phone: primary.phone,
              roleKey: 'anchor.labelFarmer',
            },
          ]
        : [],
    })
  }

  for (const m of getPresenceMismatches()) {
    alerts.push({
      id: `alert-mismatch-${m.mission.id}-${m.volunteer.id}-${m.leg}`,
      kind: 'presence_mismatch',
      farmName: m.farm.name,
      at: m.mission.startAt,
      detail: m.volunteer.name,
      href: `/coordinator/missions/${m.mission.id}`,
      weight: 20,
      contacts: [
        {
          name: m.volunteer.name,
          phone: m.volunteer.phone,
          roleKey: 'roles.volunteer',
        },
        m.driverPhone && {
          name: m.driverName,
          phone: m.driverPhone,
          roleKey: 'anchor.labelDriver',
        },
        m.groupHolderPhone && {
          name: m.groupHolderName,
          phone: m.groupHolderPhone,
          roleKey: 'volunteers.groupPhoneHolder',
        },
      ].filter(Boolean) as DashboardAlert['contacts'],
    })
  }

  for (const mission of getVisibleMissions()) {
    if (mission.status !== 'return_not_confirmed') continue
    const driver = d.drivers.find(
      (dr) => dr.id === mission.drivers[0]?.driverId,
    )
    const holderId = mission.assignments.find((a) => a.isGroupPhone)?.volunteerId
    const holder = d.volunteers.find((v) => v.id === holderId)
    alerts.push({
      id: `alert-${mission.id}`,
      kind: 'return_not_confirmed',
      farmName: farmName(mission.farmId),
      at: mission.endAt,
      detail: '',
      href: `/coordinator/missions/${mission.id}`,
      weight: 10,
      contacts: [
        driver && {
          name: driver.name,
          phone: driver.phone,
          roleKey: 'anchor.labelDriver',
        },
        holder && {
          name: holder.name,
          phone: holder.phone,
          roleKey: 'volunteers.groupPhoneHolder',
        },
      ].filter(Boolean) as DashboardAlert['contacts'],
    })
  }

  // G4.3 — guards still recruiting, urgency growing as the night nears.
  // A POC of the reminder loop: real push notifications need a backend
  // (Lots 1+); until then the dashboard's alert centre IS the reminder.
  const nowMs = now().getTime()
  for (const mission of getVisibleMissions()) {
    if (mission.status !== 'recruiting') continue
    const hoursLeft = (new Date(mission.startAt).getTime() - nowMs) / 3_600_000
    alerts.push({
      id: `alert-recruit-${mission.id}`,
      kind: 'recruiting',
      farmName: farmName(mission.farmId),
      at: mission.startAt,
      detail: `${mission.assignments.length}/${mission.requiredVolunteers}`,
      href: `/coordinator/missions/new?resume=${mission.id}`,
      // <6h outranks a mismatch; <24h sits between; further out stays low.
      weight: hoursLeft < 6 ? 9 : hoursLeft < 24 ? 7 : 4,
      contacts: [],
    })
  }

  /**
   * ★★ AE3 — LES TROIS SILENCES, ET ILS SONT LES PLUS LOURDS DE LA LISTE.
   *
   * Chaque autre alerte de cet écran naît d'un geste : quelqu'un a signalé un
   * incident, quelqu'un a coché une présence, quelqu'un a créé une garde. Ces
   * trois-là naissent d'une case restée nulle à une heure qui est passée, et
   * c'est le seul cas où « personne ne nous a rien dit » veut peut-être dire
   * que personne ne PEUT rien dire. Poids 40 : au-dessus de l'incident urgent
   * (30), parce qu'un incident urgent a au moins un auteur.
   *
   * ⚠️ ET LES CONTACTS SONT CEUX QU'ON APPELLE, PAS CEUX QU'ON PRÉVIENT : le
   *    porteur du téléphone de groupe d'abord — c'est lui qu'on essaie de
   *    joindre — puis le conducteur, puis l'agriculteur, qui est à quatre
   *    minutes de la ferme quand les deux autres ne répondent pas.
   */
  for (const signal of silenceSignals(getVisibleMissions(), thresholds)) {
    const mission = d.missions.find((m) => m.id === signal.missionId)
    const farm = farms.find((f) => f.id === signal.farmId)
    const holderId = mission?.assignments.find((a) => a.isGroupPhone)?.volunteerId
    const holder = d.volunteers.find((v) => v.id === holderId)
    const driver = d.drivers.find((dr) => dr.id === mission?.drivers[0]?.driverId)
    const primary = farm?.contacts.find((c) => c.isPrimary)
    alerts.push({
      id: `alert-silence-${signal.kind}-${signal.missionId}`,
      kind: signal.kind,
      farmName: farm?.name ?? '',
      at: signal.at,
      detail: String(signal.lateMinutes),
      href: `/coordinator/missions/${signal.missionId}`,
      weight: 40,
      contacts: [
        holder && {
          name: holder.name,
          phone: holder.phone,
          roleKey: 'volunteers.groupPhoneHolder',
        },
        driver && {
          name: driver.name,
          phone: driver.phone,
          roleKey: 'anchor.labelDriver',
        },
        primary && {
          name: primary.name,
          phone: primary.phone,
          roleKey: 'anchor.labelFarmer',
        },
      ].filter(Boolean) as DashboardAlert['contacts'],
    })
  }

  return alerts.sort(
    (a, b) =>
      b.weight - a.weight || new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
}


// ---------------------------------------------------------------------------
// N6 (2026-09-02) — GROWTH, FOR THE DASHBOARD'S TWO CHARTS
// ---------------------------------------------------------------------------

export interface GrowthPoint {
  /** The bucket's label — `YYYY-MM` for a month, `YYYY-MM-DD` (its Sunday) for a week. */
  key: string
  /** New in this bucket. */
  added: number
  /** Running total up to and including this bucket. */
  cumulative: number
}

/**
 * Entities SIGNED, by month, cumulative — the funder's curve. An entity counts
 * from the date of its first agreement; an entity with a signed status but no
 * agreement row counts from nothing (it has no date to be placed at) and is
 * reported in `undated` so the chart can say so rather than hide it.
 */
export function getSignedGrowth(months = 12, from: Date = now()): { points: GrowthPoint[]; undated: number } {
  const farms = getVisibleFarms()
  const dates: number[] = []
  let undated = 0
  for (const f of farms) {
    const first = f.agreements
      .map((a) => new Date(a.signedAt).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b)[0]
    if (first === undefined) {
      if (f.status === 'signed' || f.status === 'active') undated++
      continue
    }
    dates.push(first)
  }
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  const start = new Date(from.getFullYear(), from.getMonth() - (months - 1), 1)
  let before = dates.filter((t) => t < start.getTime()).length
  const points: GrowthPoint[] = []
  for (let i = 0; i < months; i++) {
    const a = new Date(start.getFullYear(), start.getMonth() + i, 1)
    const b = new Date(start.getFullYear(), start.getMonth() + i + 1, 1)
    const added = dates.filter((t) => t >= a.getTime() && t < b.getTime()).length
    before += added
    points.push({ key: monthKey(a), added, cumulative: before })
  }
  return { points, undated }
}

/**
 * Guards COMPLETED, by week (Sunday to Saturday, the Israeli week), for the
 * last `weeks` weeks including the current one.
 */
export function getGuardsPerWeek(weeks = 12, from: Date = now()): GrowthPoint[] {
  const done = getVisibleMissions()
    .filter((m) => m.status === 'completed')
    .map((m) => new Date(m.startAt).getTime())
  const sunday = new Date(from)
  sunday.setHours(0, 0, 0, 0)
  sunday.setDate(sunday.getDate() - sunday.getDay())
  const first = new Date(sunday)
  first.setDate(first.getDate() - 7 * (weeks - 1))
  let running = done.filter((t) => t < first.getTime()).length
  const points: GrowthPoint[] = []
  for (let i = 0; i < weeks; i++) {
    const a = new Date(first)
    a.setDate(a.getDate() + 7 * i)
    const b = new Date(a)
    b.setDate(b.getDate() + 7)
    const added = done.filter((t) => t >= a.getTime() && t < b.getTime()).length
    running += added
    points.push({ key: localDayKey(a), added, cumulative: running })
  }
  return points
}

// ---------------------------------------------------------------------------
// ★★ AC4 (2026-09-08) — L'ÉQUITÉ DE RÉPARTITION DES GARDES.
// ---------------------------------------------------------------------------

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * « Ne pas toujours servir les mêmes fermes. L'association croise ses
 *   tableaux pour répartir. »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ THREE FIGURES, AND THEY ARE NOT THE SAME FIGURE — which is why they are
 *    three fields with three names rather than one called « גardes ».
 *
 *      · `guards`       — NIGHTS THIS FARM ACTUALLY RECEIVED. One per guard,
 *        whatever the size of the team. This is the equity number: « qui est
 *        servi et qui est oublié » is a question about nights, not about
 *        head-count, and a farm that had one guard of eight volunteers has
 *        been served ONCE.
 *      · `volunteering` — VOLUNTEER-NIGHTS, the association's own « כמות
 *        התנדבויות ». Four volunteers on one guard is four. It is what their
 *        funding is counted in, it is the definition AB6 settled and AC4.7
 *        confirms, and it is what goes in the export.
 *      · `regulars`     — volunteers with TWO OR MORE guards at THIS farm.
 *        This app's reading of « קבוע », printed on the export screen.
 *
 * ⚠️ CANCELLED GUARDS COUNT IN NONE OF THE THREE. « hors annulées », and G9bis
 *    keeps a called-off night on the record precisely so it is not confused
 *    with one that happened.
 *
 * ⚠️ AND A NIGHT STILL IN THE FUTURE IS NOT A NIGHT « RÉELLEMENT EFFECTUÉE ».
 *    A guard booked for next Tuesday must not make a neglected farm look
 *    served — the whole point of the signal in AC4.5 is to find the farms
 *    nobody has been to, and a plan is not a visit. The cut is the guard's
 *    START: a night that has begun counts, one that has not does not.
 *
 * ★ `lastGuardAt` IS `null` FOR « JAMAIS », NOT AN OLD DATE. The distinction
 *   is the one the distribution view is built on: « il y a longtemps » and
 *   « jamais » are different states and are shown differently.
 */
export interface FarmGuardStats {
  /** Nights received, cancelled excluded, future excluded. */
  guards: number
  /** Volunteer-nights — « כמות התנדבויות ». Same exclusions. */
  volunteering: number
  /** Volunteers with two or more guards here — « כמות מתנדבים קבועים ». */
  regulars: number
  /** ISO datetime of the most recent guard, or null when there has been none. */
  lastGuardAt: string | null
  /** Whole days since `lastGuardAt`, or null when there has been none. */
  daysSinceLastGuard: number | null
}

const REGULAR_AT_LEAST = 2

export function farmGuardStats(farmId: string, at: number = now().getTime()): FarmGuardStats {
  let guards = 0
  let volunteering = 0
  let lastAt = 0
  const perVolunteer = new Map<string, number>()
  for (const mission of getVisibleMissions()) {
    if (mission.farmId !== farmId) continue
    if (mission.status === 'cancelled') continue
    /**
     * ★★ AE3.5 — « UNE GARDE NON CONFIRMÉE N'EST PAS UNE GARDE REÇUE. »
     *
     * AC4 comptait toute nuit passée non annulée, faute de savoir si quelqu'un
     * était venu. Depuis AE3.1 une case le dit, et une nuit dont personne n'a
     * confirmé l'arrivée est une nuit qui, portée au crédit d'une ferme dans le
     * rapport de l'association, est un chiffre inventé. Les trois compteurs
     * l'excluent ensemble — la même fonction que celle qui allume l'alerte,
     * pour que le tableau de bord et la fiche ne puissent pas se contredire.
     */
    if (!guardWasHeld(mission)) continue
    const started = new Date(mission.startAt).getTime()
    if (!Number.isFinite(started) || started > at) continue
    guards++
    if (started > lastAt) lastAt = started
    for (const a of mission.assignments) {
      volunteering++
      perVolunteer.set(a.volunteerId, (perVolunteer.get(a.volunteerId) ?? 0) + 1)
    }
  }
  let regulars = 0
  for (const n of perVolunteer.values()) if (n >= REGULAR_AT_LEAST) regulars++
  return {
    guards,
    volunteering,
    regulars,
    lastGuardAt: lastAt === 0 ? null : new Date(lastAt).toISOString(),
    daysSinceLastGuard: lastAt === 0 ? null : Math.floor((at - lastAt) / DAY),
  }
}

/**
 * ★★ AC4.2 — « מתנדבים זמינים » : COMBIEN DE VOLONTAIRES SONT MOBILISABLES.
 *
 *   « Calculé à partir des volontaires actifs dont la région ou la yeshiva
 *     les rattache à cette zone. »
 *
 * ★ SO IT IS A PROPERTY OF THE REGION AND NOT OF THE FARM, AND THE PRODUCT
 *   OWNER SAID SO FIRST: « Deux fermes voisines partagent normalement le même
 *   vivier et afficheront donc le même nombre — c'est attendu, pas un bug. »
 *   Writing it as a per-farm computation that HAPPENS to agree would be a
 *   figure two neighbouring farms could drift apart on; it is one count per
 *   region, asked of the farm's region.
 *
 * ★ TWO WAYS IN, IN THIS ORDER. A volunteer's own town first — that is where
 *   he sleeps and where a driver collects him — and his YESHIVA when the town
 *   says nothing the gazetteer knows. A student registered in ירושלים who
 *   learns in a southern yeshiva is mobilisable in the south, and the second
 *   reading is the only one that says so.
 *
 * ⚠️ INACTIVE VOLUNTEERS ARE NOT MOBILISABLE. « volontaires actifs », and an
 *    archived roster entry is a person who has told us he is not coming.
 *
 * ⚠️ AND A FARM WHOSE REGION IS UNKNOWN GETS 0, NOT THE WHOLE ROSTER. There is
 *    no vivier for a place that is not on any map; answering with the national
 *    total would tell a coordinator he has ninety people for a farm he cannot
 *    even file.
 */
export function volunteerRegion(volunteer: Volunteer): RegionId | null {
  return regionOfLocality(volunteer.locality) ?? regionOfLocality(volunteer.yeshiva)
}

export function availableVolunteersByRegion(): Map<RegionId, number> {
  const out = new Map<RegionId, number>()
  for (const volunteer of getVolunteers()) {
    if (volunteer.status !== 'active') continue
    const region = volunteerRegion(volunteer)
    if (!region) continue
    out.set(region, (out.get(region) ?? 0) + 1)
  }
  return out
}

export function availableVolunteers(
  farm: { regionId?: RegionId | null; position: { lat: number; lng: number } },
  byRegion: ReadonlyMap<RegionId, number> = availableVolunteersByRegion(),
): number {
  const region = farmRegion(farm)
  return region ? (byRegion.get(region) ?? 0) : 0
}

/**
 * ★★ AC4.5 — « signal visuel sobre sur les fermes actives n'ayant reçu aucune
 *    garde depuis longtemps, ou aucune du tout ».
 *
 * ★ THE INITIAL THRESHOLD IS THIRTY DAYS, AND THE REASON IS THE ASSOCIATION'S
 *   OWN CALENDAR. It reports monthly and its יעד is a monthly figure
 *   (`WEIGHTED_DUNAM_TARGET`); a farm that has gone a whole reporting month
 *   without a night is a farm that will appear in that month's report having
 *   received nothing. Shorter — a fortnight — lights up half the roster in a
 *   programme that guards a few nights a week; longer — a quarter — is past
 *   the point where the farmer has stopped expecting anybody. It is a NAMED
 *   INITIAL VALUE and the coordinator overrides it in הגדרות, exactly as
 *   AB5a's target does.
 *
 * ⚠️ « ACTIVES » IS THE FILTER AND IT IS NOT DECORATION. A lead nobody has
 *    telephoned yet has received no guard for a very good reason, and marking
 *    it neglected would bury the four farms that signed and were then
 *    forgotten under a hundred and ninety that were never promised anything.
 */
export const NEGLECT_DAYS_INITIAL = 30

export type CoverageState = 'never' | 'stale' | 'ok' | 'notActive'

export function coverageState(
  farm: Farm,
  stats: FarmGuardStats,
  neglectDays: number = NEGLECT_DAYS_INITIAL,
): CoverageState {
  if (farm.status !== 'signed' && farm.status !== 'active') return 'notActive'
  if (stats.guards === 0) return 'never'
  if ((stats.daysSinceLastGuard ?? 0) >= neglectDays) return 'stale'
  return 'ok'
}

/**
 * The distribution view's row: one farm, everything the equity question needs,
 * computed once. The screen sorts and filters on THIS rather than re-walking
 * the missions per row — 198 farms × every guard, on every keystroke, is what
 * a list that stutters is made of.
 */
export interface FarmCoverage {
  farm: Farm
  stats: FarmGuardStats
  available: number
  state: CoverageState
}

export function farmCoverage(
  farms: readonly Farm[],
  neglectDays: number = NEGLECT_DAYS_INITIAL,
): FarmCoverage[] {
  const byRegion = availableVolunteersByRegion()
  const at = now().getTime()
  return farms.map((farm) => {
    const stats = farmGuardStats(farm.id, at)
    return {
      farm,
      stats,
      available: availableVolunteers(farm, byRegion),
      state: coverageState(farm, stats, neglectDays),
    }
  })
}


// ---------------------------------------------------------------------------
// ★★ AB6 (2026-09-08) — WHAT THE ASSOCIATION EXPORT NEEDS AND THE FARM RECORD
//    DOES NOT CARRY.
// ---------------------------------------------------------------------------

/**
 * « כמות התנדבויות » and « כמות מתנדבים קבועים » are counted from this app's
 * own guards, farm by farm, and this is the one place that counting is
 * defined. `core/association.ts` stays free of the store; the gate builds its
 * rows from literals.
 *
 * ★ « התנדבויות » IS VOLUNTEER-NIGHTS, NOT NIGHTS. Four volunteers on one
 *   guard is four acts of volunteering, and that is the figure the association
 *   reports: it is what its funding is counted in.
 *
 * ⚠️ « קבועים » IS A DEFINITION THIS APP HAS TO MAKE, AND IT IS PRINTED ON THE
 *    EXPORT SCREEN RATHER THAN BURIED HERE. The association's form asks for
 *    "regular volunteers" and does not say what regular means; a volunteer who
 *    stood once is not a fixture of the farm, and there is no other datum to
 *    lean on. TWO OR MORE guards at the SAME farm is the reading, it is stated
 *    in the export report in Hebrew, and it is one number to change here.
 *
 * ⚠️ CANCELLED GUARDS ARE NOT COUNTED. A night that was called off is a night
 *    nobody stood, and G9bis keeps it on the record precisely so it is not
 *    confused with one that happened.
 */
/**
 * ★ AC4 — THE TWO EXPORT FIGURES ARE NOW ONE READING OF `farmGuardStats`,
 *   and that is the whole change here: the definitions AB6 settled and AC4.7
 *   confirms are unchanged, but the distribution view needs the same walk over
 *   the same guards, and two walks with two exclusion rules are two walks that
 *   will one day disagree in a file handed to the State.
 */
export function associationCounts(
  farmId: string,
): { volunteering: number; regulars: number } {
  const { volunteering, regulars } = farmGuardStats(farmId)
  return { volunteering, regulars }
}

/** The rows the association export writes, in the order the farms are given. */
export function associationInputs(
  farms: readonly Farm[],
): AssociationInput[] {
  return farms.map((farm) => ({
    farm,
    ...associationCounts(farm.id),
    signature: signatureImageOf(farm),
    /**
     * ★★ AC3.3 — AND IT IS NO LONGER `null`. AB6.4 left this column empty
     *    because the programme recorded no guarded area and their own sheets
     *    filled it with a copy of « שטחים מעובדים » — which looked like a
     *    mistake. The product owner has ruled it a DECLARATION: their system
     *    fills it deliberately, and it says « we watch the whole of this ».
     *    The app now holds that declaration — מעובד + מרעה by default,
     *    overridable farm by farm — and writes it. « Elle ne sort plus vide. »
     */
    guardedDunams: guardedDunamsOf(farm),
  }))
}
