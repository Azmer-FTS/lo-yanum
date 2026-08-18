import { DAY, addDays, fromDayKey, isTonight, now } from './clock'
import { _raw, getSession } from './store'
import { buildDayPlan } from './tours'
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
  Volunteer,
  VolunteerStats,
} from './types'
import { FARM_PIPELINE, resolveConfirmation } from './types'

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
  for (const f of getVisibleFarms()) {
    const dunams = f.farmDunams + f.grazingDunams
    if (guarded.includes(f.status)) guardedDunams += dunams
    else if (f.status !== 'declined') potentialDunams += dunams
  }
  return { guardedDunams, potentialDunams }
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
export function getAlerts(): DashboardAlert[] {
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

  return alerts.sort(
    (a, b) =>
      b.weight - a.weight || new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
}
