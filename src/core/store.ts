import { iso, now } from './clock'
import { ANCHOR_POINTS } from './mock/anchors'
import { FARMS } from './mock/farms'
import { INCIDENTS } from './mock/incidents'
import { MISSIONS } from './mock/missions'
import { DRIVERS, VOLUNTEERS } from './mock/people'
import type {
  AnchorPoint,
  Driver,
  Farm,
  Incident,
  IncidentSeverity,
  IncidentSource,
  LatLng,
  Mission,
  Session,
  Volunteer,
} from './types'

/**
 * In-memory store for the POC.
 *
 * Deliberately NOT a React context: it is a plain observable so that /src/core
 * stays framework-free. The UI binds to it with `useSyncExternalStore`, and in
 * Lot 1 the same surface is re-implemented on top of Supabase queries +
 * realtime subscriptions without the screens changing.
 */

interface StoreData {
  farms: Farm[]
  volunteers: Volunteer[]
  drivers: Driver[]
  anchorPoints: AnchorPoint[]
  missions: Mission[]
  incidents: Incident[]
  session: Session
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const initial = (): StoreData => ({
  farms: clone(FARMS),
  volunteers: clone(VOLUNTEERS),
  drivers: clone(DRIVERS),
  anchorPoints: clone(ANCHOR_POINTS),
  missions: clone(MISSIONS),
  incidents: clone(INCIDENTS),
  session: { role: 'coordinator', entityId: null },
})

let data: StoreData = initial()

// --- Observable plumbing ---------------------------------------------------

let version = 0
const listeners = new Set<() => void>()

function commit(): void {
  version += 1
  for (const fn of listeners) fn()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Monotonic snapshot token — changes whenever any store data changes. */
export function getVersion(): number {
  return version
}

/**
 * Raw, UNFILTERED data. Only /src/core/access.ts may call this; screens must go
 * through the role-aware accessors so the filtering rules live in one place.
 */
export function _raw(): StoreData {
  return data
}

export function getSession(): Session {
  return data.session
}

export function setSession(session: Session): void {
  data.session = session
  commit()
}

export function resetStore(): void {
  data = initial()
  commit()
}

// --- Mutations -------------------------------------------------------------

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export interface NewIncidentInput {
  farmId: string
  missionId: string | null
  source: IncidentSource
  reporterId: string | null
  reporterName: string
  severity: IncidentSeverity
  description: string
  position: LatLng | null
}

export function addIncident(input: NewIncidentInput): Incident {
  const incident: Incident = {
    id: nextId('inc'),
    ...input,
    reportedAt: iso(now()),
    resolved: false,
    entries: [],
  }
  data.incidents = [incident, ...data.incidents]
  commit()
  return incident
}

export function addIncidentEntry(
  incidentId: string,
  author: string,
  text: string,
): void {
  const incident = data.incidents.find((i) => i.id === incidentId)
  if (!incident) return
  incident.entries = [
    ...incident.entries,
    { id: nextId('ent'), at: iso(now()), author, text },
  ]
  commit()
}

export function setIncidentResolved(incidentId: string, resolved: boolean): void {
  const incident = data.incidents.find((i) => i.id === incidentId)
  if (!incident) return
  incident.resolved = resolved
  commit()
}

function withMission(missionId: string, fn: (m: Mission) => void): void {
  const mission = data.missions.find((m) => m.id === missionId)
  if (!mission) return
  fn(mission)
  commit()
}

/** Volunteer action: the group has reached the anchor point. */
export function confirmArrival(missionId: string): void {
  withMission(missionId, (m) => {
    m.arrivalConfirmedAt = iso(now())
    m.status = 'in_progress'
  })
}

/** Volunteer action: the guard is over for the whole group. */
export function confirmGuardEnd(missionId: string): void {
  withMission(missionId, (m) => {
    m.endConfirmedAt = iso(now())
    m.status =
      m.pickupConfirmedCount === null ? 'return_not_confirmed' : 'completed'
  })
}

/** Driver action: this many volunteers were dropped at the anchor point. */
export function confirmDropoff(missionId: string, count: number): void {
  withMission(missionId, (m) => {
    m.dropoffConfirmedCount = count
    if (m.status === 'planned') m.status = 'in_progress'
  })
}

/** Driver action: this many volunteers were picked up in the morning. */
export function confirmPickup(missionId: string, count: number): void {
  withMission(missionId, (m) => {
    m.pickupConfirmedCount = count
    if (m.endConfirmedAt) m.status = 'completed'
  })
}

export function archiveVolunteer(volunteerId: string, reason: string): void {
  const volunteer = data.volunteers.find((v) => v.id === volunteerId)
  if (!volunteer) return
  volunteer.status = 'inactive'
  volunteer.inactiveReason = reason
  commit()
}

export function reactivateVolunteer(volunteerId: string): void {
  const volunteer = data.volunteers.find((v) => v.id === volunteerId)
  if (!volunteer) return
  volunteer.status = 'active'
  volunteer.inactiveReason = null
  commit()
}

export function setCommitmentFulfilled(
  farmId: string,
  index: number,
  fulfilled: boolean,
): void {
  const farm = data.farms.find((f) => f.id === farmId)
  if (!farm || !farm.commitments[index]) return
  farm.commitments[index].fulfilled = fulfilled
  commit()
}
