import { iso, now } from './clock'
import { ringAreaDunams } from './geo'
import { ANCHOR_POINTS } from './mock/anchors'
import { FARMS } from './mock/farms'
import { FARM_ZONES } from './mock/zones'
import { THREAT_VECTORS, THREAT_ZONES } from './mock/threats'
import { INCIDENTS } from './mock/incidents'
import { MISSIONS } from './mock/missions'
import { DRIVERS, VOLUNTEERS } from './mock/people'
import { FARM_VISITS, GENERAL_MEETINGS } from './mock/visits'
import { TOURS } from './mock/tours'
import type { Tour } from './tours'
import type {
  Agreement,
  AnchorPoint,
  OutreachNotice,
  CancelReason,
  Driver,
  Farm,
  FarmCommitment,
  FarmContact,
  FarmStatus,
  EntityKind,
  FarmType,
  FarmVisit,
  FarmZone,
  FarmZoneKind,
  GeneralMeeting,
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
  ThreatIntensity,
  ThreatVector,
  ThreatZone,
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
  generalMeetings: GeneralMeeting[]
  farmZones: FarmZone[]
  /** G18 — the coordinator-only threat layer. */
  threatZones: ThreatZone[]
  threatVectors: ThreatVector[]
  volunteers: Volunteer[]
  drivers: Driver[]
  anchorPoints: AnchorPoint[]
  missions: Mission[]
  incidents: Incident[]
  farmVisits: FarmVisit[]
  tours: Tour[]
  session: Session
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const initial = (): StoreData => seedZoneDunams({
  farms: clone(FARMS),
  generalMeetings: clone(GENERAL_MEETINGS),
  farmZones: clone(FARM_ZONES),
  threatZones: clone(THREAT_ZONES),
  threatVectors: clone(THREAT_VECTORS),
  volunteers: clone(VOLUNTEERS),
  drivers: clone(DRIVERS),
  anchorPoints: clone(ANCHOR_POINTS),
  missions: clone(MISSIONS),
  incidents: clone(INCIDENTS),
  farmVisits: clone(FARM_VISITS),
  tours: clone(TOURS),
  session: { role: 'coordinator', entityId: null },
})

/**
 * G15 — the fixtures' dunam figures were hand-estimated before the polygons
 * existed; at seed the drawn ground wins (unless a farm is flagged manual),
 * so the map, the form and the dashboard KPIs agree from the first render.
 */
function seedZoneDunams(seed: StoreData): StoreData {
  const sums = new Map<string, { boundary: number; grazing: number }>()
  for (const z of seed.farmZones) {
    const entry = sums.get(z.farmId) ?? { boundary: 0, grazing: 0 }
    if (z.kind === 'farm_boundary') entry.boundary += ringAreaDunams(z.ring)
    else entry.grazing += ringAreaDunams(z.ring)
    sums.set(z.farmId, entry)
  }
  seed.farms = seed.farms.map((f) => {
    const s = sums.get(f.id)
    if (!s) return f
    return {
      ...f,
      farmDunams:
        !f.farmDunamsManual && s.boundary > 0 ? Math.round(s.boundary) : f.farmDunams,
      grazingDunams:
        !f.grazingDunamsManual && s.grazing > 0 ? Math.round(s.grazing) : f.grazingDunams,
    }
  })
  return seed
}

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
  /** G16 — חווה / מושב / אחר; absent = farm. */
  entityKind?: EntityKind
  status: FarmStatus
  position: LatLng
  farmDunams: number
  grazingDunams: number
  /** G15 — see Farm: true = the coordinator typed the value. */
  farmDunamsManual?: boolean
  grazingDunamsManual?: boolean
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
  // G15 — a submit that RELEASES an override (manual flag back to false)
  // gets the zone sum back immediately, through the one writer.
  syncZoneDunams(farmId)
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

/**
 * G15 — ONE WRITER for the auto-filled dunam fields, same pattern as
 * `syncNextVisit` (decision 35): every zone mutation funnels through here, so
 * "the map says 430 dunams" and "the form says 430 dunams" cannot disagree.
 * A field the coordinator typed (its `*Manual` flag) is never overwritten,
 * and a kind with NO zones left says nothing — deleting the last polygon
 * must not zero a number that predates the drawing.
 */
function syncZoneDunams(farmId: string): void {
  const farm = data.farms.find((f) => f.id === farmId)
  if (!farm) return
  const zones = data.farmZones.filter((z) => z.farmId === farmId)
  const sumOf = (kind: FarmZoneKind): number | null => {
    const of = zones.filter((z) => z.kind === kind)
    if (of.length === 0) return null
    return Math.round(of.reduce((s, z) => s + ringAreaDunams(z.ring), 0))
  }
  const boundary = sumOf('farm_boundary')
  const grazing = sumOf('grazing_area')
  const next = { ...farm }
  if (!farm.farmDunamsManual && boundary !== null) next.farmDunams = boundary
  if (!farm.grazingDunamsManual && grazing !== null) next.grazingDunams = grazing
  data.farms = data.farms.map((f) => (f.id === farmId ? next : f))
}

export function createFarmZone(draft: FarmZoneDraft): FarmZone {
  const zone: FarmZone = { id: nextId('zone'), ...draft }
  data.farmZones = [...data.farmZones, zone]
  syncZoneDunams(draft.farmId)
  commit()
  return zone
}

/** A drag knows the whole ring it produced; replacing it is the mutation. */
export function updateFarmZoneRing(zoneId: string, ring: LatLng[]): void {
  const index = data.farmZones.findIndex((z) => z.id === zoneId)
  if (index === -1) return
  data.farmZones[index] = { ...data.farmZones[index], ring }
  syncZoneDunams(data.farmZones[index].farmId)
  commit()
}

export function deleteFarmZone(zoneId: string): void {
  const zone = data.farmZones.find((z) => z.id === zoneId)
  data.farmZones = data.farmZones.filter((z) => z.id !== zoneId)
  if (zone) syncZoneDunams(zone.farmId)
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
  /** P0bis.5a — optional; '' means "no address", not "unknown". */
  email?: string
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
    email: '',
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
        // The dual hat is ONE human: the same address, kept in step below.
        email: volunteer.email,
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
    linked.email = volunteer.email
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
  /** P0bis.5a — optional; '' means "no address". */
  email?: string
  vehicle: string
  seats: number
  locality: string
  availabilityNote: string
  notes: string
}

// ---------------------------------------------------------------------------
// G18 — the threat layer's writers
// ---------------------------------------------------------------------------

/**
 * Both shapes carry `updatedAt`, and it is stamped HERE rather than passed in.
 *
 * A threat assessment's age is the second thing a coordinator needs to know
 * about it (the first is what it says), and a date a caller supplies is a date
 * a caller can forget to bump. Every write refreshes it — including a vertex
 * drag, because moving a zone IS revising the assessment.
 */
export interface ThreatZoneDraft {
  farmId: string | null
  ring: LatLng[]
  intensity: ThreatIntensity
  note: string
}

export function createThreatZone(draft: ThreatZoneDraft): ThreatZone {
  const zone: ThreatZone = {
    id: nextId('threat'),
    ...draft,
    updatedAt: iso(now()),
  }
  data.threatZones = [...data.threatZones, zone]
  commit()
  return zone
}

export function updateThreatZone(
  zoneId: string,
  patch: Partial<Omit<ThreatZone, 'id' | 'updatedAt'>>,
): void {
  const index = data.threatZones.findIndex((z) => z.id === zoneId)
  if (index === -1) return
  data.threatZones[index] = {
    ...data.threatZones[index],
    ...patch,
    updatedAt: iso(now()),
  }
  data.threatZones = [...data.threatZones]
  commit()
}

export function deleteThreatZone(zoneId: string): void {
  data.threatZones = data.threatZones.filter((z) => z.id !== zoneId)
  commit()
}

export interface ThreatVectorDraft {
  farmId: string | null
  origin: LatLng
  target: LatLng
  intensity: ThreatIntensity
  note: string
}

export function createThreatVector(draft: ThreatVectorDraft): ThreatVector {
  const vector: ThreatVector = {
    id: nextId('vector'),
    ...draft,
    updatedAt: iso(now()),
  }
  data.threatVectors = [...data.threatVectors, vector]
  commit()
  return vector
}

export function updateThreatVector(
  vectorId: string,
  patch: Partial<Omit<ThreatVector, 'id' | 'updatedAt'>>,
): void {
  const index = data.threatVectors.findIndex((v) => v.id === vectorId)
  if (index === -1) return
  data.threatVectors[index] = {
    ...data.threatVectors[index],
    ...patch,
    updatedAt: iso(now()),
  }
  data.threatVectors = [...data.threatVectors]
  commit()
}

export function deleteThreatVector(vectorId: string): void {
  data.threatVectors = data.threatVectors.filter((v) => v.id !== vectorId)
  commit()
}

export function createDriver(draft: DriverDraft): Driver {
  const driver: Driver = {
    id: nextId('driver'),
    volunteerId: null,
    email: '',
    ...draft,
  }
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

// --- G9bis: cancellation ----------------------------------------------------

/**
 * Call a guard off.
 *
 * The reason is REQUIRED by the signature — a cancellation without a why is
 * not recordable here, which is the whole point (A45). The notice list is
 * snapshotted NOW, from the people booked at this moment: every assigned
 * volunteer, every driver with a car on the night, and the farm's primary
 * contact — the three audiences who are otherwise standing in the dark at
 * 21:00 for a night that is not happening.
 */
export function cancelMission(
  missionId: string,
  reason: CancelReason,
  note: string,
): void {
  withMission(missionId, (m) => {
    m.status = 'cancelled'
    m.cancelledAt = iso(now())
    m.cancelReason = reason
    m.cancelNote = note.trim()
    m.reactivatedAt = null
    // P0bis.5b — the recipient LIST is no longer snapshotted here: it is
    // derived from the mission by `outreachRecipients` every time the sending
    // centre renders, so a driver added after the cancellation is on the list
    // instead of silently missing from it. Only the ticks are stored, and a
    // cancellation starts with none.
    m.outreach = m.outreach.filter((n) => n.event !== 'cancelled')
  })
}

/**
 * A45/P0bis.5b — the coordinator ticking off "this person has been told".
 *
 * An UPSERT, because the tick is the only record that exists: there is no
 * pre-populated row to find. Un-ticking removes the entry rather than nulling
 * it, so "no entry" means exactly one thing.
 */
export function setOutreachSent(
  missionId: string,
  event: OutreachNotice['event'],
  recipientKind: OutreachNotice['recipientKind'],
  recipientId: string,
  sent: boolean,
): void {
  withMission(missionId, (m) => {
    const rest = m.outreach.filter(
      (n) =>
        !(
          n.event === event &&
          n.recipientKind === recipientKind &&
          n.recipientId === recipientId
        ),
    )
    m.outreach = sent
      ? [...rest, { event, recipientKind, recipientId, sentAt: iso(now()) }]
      : rest
  })
}

/**
 * A46 — a cancelled guard comes back as a RECRUITMENT, not as a plan.
 *
 * Everyone's yes was for a night that was then called off; assuming it still
 * stands is exactly the mistake this flow exists to prevent. So the roster is
 * kept (the coordinator should not redial from a blank list) but every
 * confirmation is reset: drivers to unconfirmed, and the status to
 * 'recruiting' so the wizard's resume flow and the escalating dashboard
 * alerts take over. The cancellation chapter stays on the record for the
 * timeline.
 */
export function reactivateMission(missionId: string): void {
  withMission(missionId, (m) => {
    if (m.status !== 'cancelled') return
    m.status = 'recruiting'
    m.reactivatedAt = iso(now())
    for (const d of m.drivers) d.confirmed = false
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

export interface GeneralMeetingDraft {
  title: string
  at: string
  endAt: string
  location: string
  person: string
  note: string
}

export function createGeneralMeeting(draft: GeneralMeetingDraft): GeneralMeeting {
  const meeting: GeneralMeeting = { id: nextId('meet'), ...draft }
  data.generalMeetings = [...data.generalMeetings, meeting]
  commit()
  return meeting
}

export function updateGeneralMeeting(
  meetingId: string,
  draft: Partial<GeneralMeetingDraft>,
): void {
  const index = data.generalMeetings.findIndex((m) => m.id === meetingId)
  if (index === -1) return
  data.generalMeetings[index] = { ...data.generalMeetings[index], ...draft }
  commit()
}

export function deleteGeneralMeeting(meetingId: string): void {
  data.generalMeetings = data.generalMeetings.filter((m) => m.id !== meetingId)
  commit()
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

// --- G9: tours — the saved field day ----------------------------------------

export interface TourDraft {
  dayKey: string
  departAt: string
  farmIds: string[]
}

/**
 * Save a tour — an UPSERT keyed on the day, because a tour IS a calendar day:
 * "the route for Tuesday" is one object however many times it is re-planned,
 * and two tours on one day would make the "היום שלי" block ambiguous about
 * which one the coordinator is actually driving.
 */
export function saveTour(draft: TourDraft): Tour {
  const existing = data.tours.find((t) => t.dayKey === draft.dayKey)
  if (existing) {
    existing.departAt = draft.departAt
    existing.farmIds = [...draft.farmIds]
    commit()
    return existing
  }
  const tour: Tour = { id: nextId('tour'), ...draft, farmIds: [...draft.farmIds] }
  data.tours = [...data.tours, tour]
  commit()
  return tour
}

export function deleteTour(dayKey: string): void {
  data.tours = data.tours.filter((t) => t.dayKey !== dayKey)
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
    cancelledAt: null,
    cancelReason: null,
    cancelNote: '',
    outreach: [],
    reactivatedAt: null,
  }

  data.missions = [mission, ...data.missions]
  commit()
  return mission
}

/**
 * G10 — bulk append from the import wizard, for the two other rosters.
 *
 * Deliberately NOT `drafts.map(createFarm)`: each `create*` commits, and 300
 * commits is 300 renders of a screen nobody is looking at yet. One splice, one
 * commit, one paint — the same shape `importVolunteers` has had since R5.4.
 *
 * A farm gets its zone sums recomputed on the way in: an import carries no
 * polygons, so `syncZoneDunams` is what makes an imported farm's numbers obey
 * the same one-writer rule as a drawn one (G15) — the manual flag the draft
 * sets is what protects a number the farmer actually stated.
 */
export function importFarms(drafts: FarmDraft[]): number {
  const created: Farm[] = drafts.map((draft, i) => ({
    id: `${nextId('farm')}-${i}`,
    lastVisitAt: null,
    nextVisitAt: null,
    ...draft,
  }))
  data.farms = [...data.farms, ...created]
  for (const farm of created) syncZoneDunams(farm.id)
  commit()
  return created.length
}

export function importDrivers(drafts: DriverDraft[]): number {
  const created: Driver[] = drafts.map((draft, i) => ({
    id: `${nextId('driver')}-${i}`,
    volunteerId: null,
    email: '',
    ...draft,
  }))
  data.drivers = [...data.drivers, ...created]
  commit()
  return created.length
}

/** Bulk append from the CSV/XLSX import wizard (R5.4). */
export function importVolunteers(drafts: VolunteerDraft[]): number {
  const created: Volunteer[] = drafts.map((draft, i) => ({
    id: `${nextId('vol')}-${i}`,
    guardsCount: 0,
    lastActivityAt: null,
    email: '',
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
