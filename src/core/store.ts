import { iso, now } from './clock'
import { ANCHOR_POINTS } from './mock/anchors'
import { FARMS } from './mock/farms'
import { FARM_ZONES } from './mock/zones'
import { INCIDENTS } from './mock/incidents'
import { MISSIONS } from './mock/missions'
import { DRIVERS, VOLUNTEERS } from './mock/people'
import { FARM_VISITS } from './mock/visits'
import type {
  Agreement,
  AnchorPoint,
  Driver,
  Farm,
  FarmCommitment,
  FarmContact,
  FarmStatus,
  FarmType,
  FarmVisit,
  FarmZone,
  FarmZoneKind,
  Incident,
  IncidentSeverity,
  IncidentSource,
  LatLng,
  Mission,
  MissionAssignment,
  MissionDriver,
  MissionLeg,
  PhoneType,
  PresenceMark,
  PresenceSource,
  Session,
  Volunteer,
  VolunteerAvailability,
  VolunteerStatus,
} from './types'
import { DEFAULT_AVAILABILITY, EMPTY_LEG } from './types'

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
  farmZones: FarmZone[]
  volunteers: Volunteer[]
  drivers: Driver[]
  anchorPoints: AnchorPoint[]
  missions: Mission[]
  incidents: Incident[]
  farmVisits: FarmVisit[]
  session: Session
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const initial = (): StoreData => ({
  farms: clone(FARMS),
  farmZones: clone(FARM_ZONES),
  volunteers: clone(VOLUNTEERS),
  drivers: clone(DRIVERS),
  anchorPoints: clone(ANCHOR_POINTS),
  missions: clone(MISSIONS),
  incidents: clone(INCIDENTS),
  farmVisits: clone(FARM_VISITS),
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

/** True once every assignment has at least one mark on the given leg. */
function legFullyMarked(mission: Mission, leg: MissionLeg): boolean {
  return mission.assignments.every(
    (a) => a[leg].driver !== null || a[leg].group !== null,
  )
}

/**
 * D6.2 — stamp the timeline instants a leg transition implies.
 *
 * Called from every path that can change a leg's completeness, so a timestamp
 * can never be missed by one caller and set by another. Each stamp is
 * write-once: re-marking a volunteer must not rewrite the moment the group
 * actually got on site.
 */
function stampLegTimestamps(mission: Mission): void {
  if (mission.droppedOffAt === null && legFullyMarked(mission, 'outbound')) {
    mission.droppedOffAt = iso(now())
  }
  if (mission.pickedUpAt === null && legFullyMarked(mission, 'inbound')) {
    mission.pickedUpAt = iso(now())
  }
  if (mission.completedAt === null && mission.status === 'completed') {
    mission.completedAt = iso(now())
  }
}

/** Volunteer action: the guard is over for the whole group. */
export function confirmGuardEnd(missionId: string): void {
  withMission(missionId, (m) => {
    m.endConfirmedAt = iso(now())
    m.status = legFullyMarked(m, 'inbound')
      ? 'completed'
      : 'return_not_confirmed'
    stampLegTimestamps(m)
  })
}

/**
 * R6: record one nominative presence mark.
 *
 * Marks are never merged or overwritten across sources — the driver's answer
 * and the group holder's answer are stored side by side precisely so a
 * disagreement can be detected instead of silently resolved.
 */
export function setPresence(
  missionId: string,
  volunteerId: string,
  leg: MissionLeg,
  source: PresenceSource,
  mark: PresenceMark | null,
): void {
  withMission(missionId, (m) => {
    const assignment = m.assignments.find((a) => a.volunteerId === volunteerId)
    if (!assignment) return
    assignment[leg][source] = mark

    if (leg === 'outbound' && m.status === 'planned') {
      m.status = 'in_progress'
    }
    if (leg === 'inbound' && m.endConfirmedAt && legFullyMarked(m, 'inbound')) {
      m.status = 'completed'
    }
    stampLegTimestamps(m)
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

// --- R5: create / edit -----------------------------------------------------
//
// These write straight into the in-memory store, so edits persist for the
// session and disappear on reload. In Lot 1 each becomes a Supabase mutation;
// the signatures are shaped to survive that swap unchanged.

export interface FarmDraft {
  photo: string | null
  name: string
  locality: string
  region: string
  type: FarmType
  status: FarmStatus
  position: LatLng
  farmDunams: number
  grazingDunams: number
  contacts: FarmContact[]
  commitments: FarmCommitment[]
  agreements: Agreement[]
  notes: string
}

export function createFarm(draft: FarmDraft): Farm {
  const farm: Farm = {
    id: nextId('farm'),
    ...draft,
    lastVisitAt: null,
    nextVisitAt: null,
  }
  data.farms = [farm, ...data.farms]
  commit()
  return farm
}

export function updateFarm(farmId: string, draft: FarmDraft): void {
  const index = data.farms.findIndex((f) => f.id === farmId)
  if (index === -1) return
  data.farms[index] = { ...data.farms[index], ...draft }
  commit()
}

export function newContactId(): string {
  return nextId('contact')
}

export function newAgreementId(): string {
  return nextId('agr')
}

// --- Farm zones (G1) -------------------------------------------------------

export interface FarmZoneDraft {
  farmId: string
  kind: FarmZoneKind
  ring: LatLng[]
}

export function createFarmZone(draft: FarmZoneDraft): FarmZone {
  const zone: FarmZone = { id: nextId('zone'), ...draft }
  data.farmZones = [...data.farmZones, zone]
  commit()
  return zone
}

/** A drag knows the whole ring it produced; replacing it is the mutation. */
export function updateFarmZoneRing(zoneId: string, ring: LatLng[]): void {
  const index = data.farmZones.findIndex((z) => z.id === zoneId)
  if (index === -1) return
  data.farmZones[index] = { ...data.farmZones[index], ring }
  commit()
}

export function deleteFarmZone(zoneId: string): void {
  data.farmZones = data.farmZones.filter((z) => z.id !== zoneId)
  commit()
}

export interface AnchorDraft {
  farmId: string
  name: string
  position: LatLng
  instructions: string[]
  accessDescription: string
}

export function createAnchorPoint(draft: AnchorDraft): AnchorPoint {
  const anchor: AnchorPoint = { id: nextId('anchor'), ...draft }
  data.anchorPoints = [...data.anchorPoints, anchor]
  commit()
  return anchor
}

export function updateAnchorPoint(anchorId: string, draft: AnchorDraft): void {
  const index = data.anchorPoints.findIndex((a) => a.id === anchorId)
  if (index === -1) return
  data.anchorPoints[index] = { ...data.anchorPoints[index], ...draft }
  commit()
}

/**
 * F2 — a partial update, because dragging a pin must not need a whole draft.
 *
 * `updateAnchorPoint` takes the full `AnchorDraft`, which is right for a form
 * and wrong for a map: the map knows a new latitude and nothing else, and
 * routing a drag through the form's shape means every drag rewrites the access
 * description with whatever the caller happened to be holding.
 */
export function patchAnchorPoint(
  anchorId: string,
  patch: Partial<Omit<AnchorPoint, 'id' | 'farmId'>>,
): void {
  const index = data.anchorPoints.findIndex((a) => a.id === anchorId)
  if (index === -1) return
  data.anchorPoints[index] = { ...data.anchorPoints[index], ...patch }
  commit()
}

/**
 * Remove an anchor point — the undo for a pin dropped by accident.
 *
 * REFUSES if any guard still points at it, and says so by returning false. A
 * mission whose rendezvous no longer resolves is invisible: `toMissionView`
 * returns null for it and the guard silently disappears from every screen. The
 * caller is expected to surface the refusal rather than swallow it.
 */
export function deleteAnchorPoint(anchorId: string): boolean {
  const used = data.missions.some(
    (m) =>
      m.anchorPointId === anchorId ||
      m.additionalAnchorPointIds.includes(anchorId),
  )
  if (used) return false
  data.anchorPoints = data.anchorPoints.filter((a) => a.id !== anchorId)
  commit()
  return true
}

export interface VolunteerDraft {
  photo: string | null
  name: string
  age: number
  phone: string
  phoneType: PhoneType
  yeshiva: string
  locality: string
  status: VolunteerStatus
  inactiveReason: string | null
  notes: string
  /** G5.2 — licence / car / dual-hat flags. Default false. */
  hasLicense?: boolean
  hasCar?: boolean
  canDrive?: boolean
  /** G3.4 — slot preferences. Defaults to "whenever needed". */
  availability?: VolunteerAvailability
}

export function createVolunteer(draft: VolunteerDraft): Volunteer {
  const volunteer: Volunteer = {
    id: nextId('vol'),
    guardsCount: 0,
    lastActivityAt: null,
    hasLicense: false,
    hasCar: false,
    canDrive: false,
    availability: { ...DEFAULT_AVAILABILITY },
    ...draft,
  }
  data.volunteers = [volunteer, ...data.volunteers]
  syncVolunteerDriver(volunteer)
  commit()
  return volunteer
}

export function updateVolunteer(
  volunteerId: string,
  draft: VolunteerDraft,
): void {
  const index = data.volunteers.findIndex((v) => v.id === volunteerId)
  if (index === -1) return
  data.volunteers[index] = { ...data.volunteers[index], ...draft }
  syncVolunteerDriver(data.volunteers[index])
  commit()
}

/**
 * G5.2 — keep the dual hat honest: ONE human, two roster rows, one source of
 * truth. While `canDrive` is true a linked Driver row exists and mirrors the
 * volunteer's identity fields; when it goes false the row goes with it. The
 * mirrored row keeps its own vehicle/seats/notes once created — those are
 * driver facts, not volunteer facts.
 */
function syncVolunteerDriver(volunteer: Volunteer): void {
  const linked = data.drivers.find((d) => d.volunteerId === volunteer.id)
  if (volunteer.canDrive && !linked) {
    data.drivers = [
      ...data.drivers,
      {
        id: nextId('driver'),
        name: volunteer.name,
        phone: volunteer.phone,
        // Vehicle description is the driver's to fill in; empty renders as
        // the UI's "private car" fallback.
        vehicle: '',
        seats: 4,
        locality: volunteer.locality,
        photo: volunteer.photo,
        availabilityNote: '',
        notes: '',
        volunteerId: volunteer.id,
      },
    ]
  } else if (volunteer.canDrive && linked) {
    linked.name = volunteer.name
    linked.phone = volunteer.phone
    linked.locality = volunteer.locality
    linked.photo = volunteer.photo
  } else if (!volunteer.canDrive && linked) {
    data.drivers = data.drivers.filter((d) => d.id !== linked.id)
  }
}

// --- G5.1: driver create/edit ----------------------------------------------

export interface DriverDraft {
  photo: string | null
  name: string
  phone: string
  vehicle: string
  seats: number
  locality: string
  availabilityNote: string
  notes: string
}

export function createDriver(draft: DriverDraft): Driver {
  const driver: Driver = { id: nextId('driver'), volunteerId: null, ...draft }
  data.drivers = [driver, ...data.drivers]
  commit()
  return driver
}

export function updateDriver(driverId: string, draft: DriverDraft): void {
  const index = data.drivers.findIndex((d) => d.id === driverId)
  if (index === -1) return
  data.drivers[index] = { ...data.drivers[index], ...draft }
  // The mirror runs both ways for identity fields — the human is one.
  const linkedVolunteerId = data.drivers[index].volunteerId
  if (linkedVolunteerId) {
    const volunteer = data.volunteers.find((v) => v.id === linkedVolunteerId)
    if (volunteer) {
      volunteer.name = draft.name
      volunteer.phone = draft.phone
      volunteer.locality = draft.locality
      volunteer.photo = draft.photo
    }
  }
  commit()
}

/**
 * G4 — resuming a recruitment: the mission's team is REPLACED with the new
 * roster, keeping the presence marks of anyone who survived the reshuffle.
 * Also the path that turns 'recruiting' into 'planned' when the gauge fills.
 */
export function updateMissionStaffing(
  missionId: string,
  volunteerIds: string[],
  drivers: MissionDriver[],
  status: 'planned' | 'recruiting',
  requiredVolunteers?: number,
): void {
  withMission(missionId, (m) => {
    const chosen = volunteerIds
      .map((id) => data.volunteers.find((v) => v.id === id))
      .filter((v): v is Volunteer => v !== undefined)
    const holderId =
      chosen.find((v) => v.phoneType === 'smartphone')?.id ?? chosen[0]?.id
    m.assignments = chosen.map((v) => {
      const existing = m.assignments.find((a) => a.volunteerId === v.id)
      return {
        volunteerId: v.id,
        isGroupPhone: v.id === holderId,
        outbound: existing?.outbound ?? { ...EMPTY_LEG },
        inbound: existing?.inbound ?? { ...EMPTY_LEG },
      }
    })
    m.drivers = drivers
    m.status = status
    if (requiredVolunteers !== undefined) {
      m.requiredVolunteers = requiredVolunteers
    }
  })
}

/** G5.3 — one driver confirming HIS car's passengers. */
export function setMissionDriverConfirmed(
  missionId: string,
  driverId: string,
  confirmed: boolean,
): void {
  withMission(missionId, (m) => {
    const entry = m.drivers.find((d) => d.driverId === driverId)
    if (entry) entry.confirmed = confirmed
  })
}

// --- D4: farm visits -------------------------------------------------------

export interface FarmVisitDraft {
  farmId: string
  at: string
  note: string
  done: boolean
}

/**
 * Recompute `Farm.nextVisitAt` from the visit rows.
 *
 * `nextVisitAt` predates FarmVisit and is read by the route planner, the
 * dashboard and the farm card. Rather than leave two independent sources of
 * truth, it is now a DERIVED CACHE with exactly one writer: this function,
 * called after every visit mutation. Nothing else in the codebase assigns to
 * it, which is what keeps "the agenda says Tuesday" and "the farm card says
 * Tuesday" from ever disagreeing.
 */
function syncNextVisit(farmId: string): void {
  const farm = data.farms.find((f) => f.id === farmId)
  if (!farm) return

  const t = now().getTime()
  const upcoming = data.farmVisits
    .filter(
      (v) => v.farmId === farmId && !v.done && new Date(v.at).getTime() >= t,
    )
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  farm.nextVisitAt = upcoming[0]?.at ?? null
}

export function createFarmVisit(draft: FarmVisitDraft): FarmVisit {
  const visit: FarmVisit = { id: nextId('visit'), ...draft }
  data.farmVisits = [...data.farmVisits, visit]
  syncNextVisit(visit.farmId)
  commit()
  return visit
}

export function updateFarmVisit(visitId: string, draft: FarmVisitDraft): void {
  const index = data.farmVisits.findIndex((v) => v.id === visitId)
  if (index === -1) return
  const previousFarmId = data.farmVisits[index].farmId
  data.farmVisits[index] = { ...data.farmVisits[index], ...draft }
  syncNextVisit(previousFarmId)
  if (draft.farmId !== previousFarmId) syncNextVisit(draft.farmId)
  commit()
}

export function deleteFarmVisit(visitId: string): void {
  const visit = data.farmVisits.find((v) => v.id === visitId)
  if (!visit) return
  data.farmVisits = data.farmVisits.filter((v) => v.id !== visitId)
  syncNextVisit(visit.farmId)
  commit()
}

// --- D5: create a guard ----------------------------------------------------

export interface MissionDraft {
  farmId: string
  anchorPointId: string
  /** F2 — other positions covered during the night. Defaults to none. */
  additionalAnchorPointIds?: string[]
  /** G8 — meeting points; see the Mission type. All default to null. */
  pickupPoint?: LatLng | null
  dropoffPoint?: LatLng | null
  returnPickupPoint?: LatLng | null
  returnDropoffPoint?: LatLng | null
  startAt: string
  endAt: string
  /** In shortlist order. The first one carries the group phone by default. */
  volunteerIds: string[]
  /** G5.3 — one entry per car; [] means no driver arranged. */
  drivers?: MissionDriver[]
  /** G4 — the requested team size (gauge denominator). */
  requiredVolunteers?: number
  /** G4 — 'recruiting' when leaving the wizard with a partial team. */
  status?: 'planned' | 'recruiting'
}

/**
 * Create a guard from the wizard's result.
 *
 * The group phone goes to the first SMARTPHONE holder in the list, falling back
 * to the first volunteer. That fallback is a deliberate visible compromise: a
 * group of kosher-phone holders with no smartphone between them is a real
 * scheduling problem, and the mission should exist so the coordinator can SEE
 * it, not be silently rejected by a form.
 */
export function createMission(draft: MissionDraft): Mission {
  const chosen = draft.volunteerIds
    .map((id) => data.volunteers.find((v) => v.id === id))
    .filter((v): v is Volunteer => v !== undefined)

  const holderId =
    chosen.find((v) => v.phoneType === 'smartphone')?.id ?? chosen[0]?.id ?? null

  const assignments: MissionAssignment[] = chosen.map((v) => ({
    volunteerId: v.id,
    isGroupPhone: v.id === holderId,
    outbound: { ...EMPTY_LEG },
    inbound: { ...EMPTY_LEG },
  }))

  const mission: Mission = {
    id: nextId('mission'),
    farmId: draft.farmId,
    anchorPointId: draft.anchorPointId,
    // Never let the rendezvous appear twice: it is already `anchorPointId`, and
    // a duplicate would render the same pin twice on every map.
    additionalAnchorPointIds: (draft.additionalAnchorPointIds ?? []).filter(
      (id) => id !== draft.anchorPointId,
    ),
    pickupPoint: draft.pickupPoint ?? null,
    dropoffPoint: draft.dropoffPoint ?? null,
    returnPickupPoint: draft.returnPickupPoint ?? null,
    returnDropoffPoint: draft.returnDropoffPoint ?? null,
    startAt: draft.startAt,
    endAt: draft.endAt,
    status: draft.status ?? 'planned',
    assignments,
    drivers: draft.drivers ?? [],
    requiredVolunteers: draft.requiredVolunteers ?? assignments.length,
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    createdAt: iso(now()),
    droppedOffAt: null,
    pickedUpAt: null,
    completedAt: null,
  }

  data.missions = [mission, ...data.missions]
  commit()
  return mission
}

/** Bulk append from the CSV/XLSX import wizard (R5.4). */
export function importVolunteers(drafts: VolunteerDraft[]): number {
  const created: Volunteer[] = drafts.map((draft, i) => ({
    id: `${nextId('vol')}-${i}`,
    guardsCount: 0,
    lastActivityAt: null,
    hasLicense: false,
    hasCar: false,
    canDrive: false,
    availability: { ...DEFAULT_AVAILABILITY },
    ...draft,
  }))
  data.volunteers = [...created, ...data.volunteers]
  commit()
  return created.length
}
