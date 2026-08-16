import { isTonight, now } from './clock'
import { _raw, getSession } from './store'
import type {
  AnchorPoint,
  ConfirmationState,
  DashboardAlert,
  Driver,
  Farm,
  FarmStatus,
  FarmStatusCount,
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
      scoped = all.filter((m) => m.driverId === s.entityId)
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
    driver: d.drivers.find((dr) => dr.id === mission.driverId) ?? null,
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
    (v) => new Date(v.mission.endAt).getTime() <= t,
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
    byYeshiva: yeshivot
      .map((yeshiva) => ({
        yeshiva,
        count: volunteers.filter((v) => v.yeshiva === yeshiva).length,
      }))
      .sort((a, b) => b.count - a.count),
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

export function getIncidentView(incidentId: string): IncidentView | null {
  return (
    getVisibleIncidentViews().find((v) => v.incident.id === incidentId) ?? null
  )
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

    const driver = d.drivers.find((dr) => dr.id === mission.driverId)
    const holderId = mission.assignments.find((a) => a.isGroupPhone)?.volunteerId
    const holder = d.volunteers.find((v) => v.id === holderId)

    for (const leg of legs) {
      for (const a of mission.assignments) {
        if (resolveConfirmation(a[leg]) !== 'mismatch') continue
        const volunteer = d.volunteers.find((v) => v.id === a.volunteerId)
        if (!volunteer) continue
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
    const driver = d.drivers.find((dr) => dr.id === mission.driverId)
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

  return alerts.sort(
    (a, b) =>
      b.weight - a.weight || new Date(b.at).getTime() - new Date(a.at).getTime(),
  )
}
