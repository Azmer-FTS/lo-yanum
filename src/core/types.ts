/**
 * Domain types for "Lo Yanum".
 *
 * PURE TypeScript — no React, no DOM. This file (and everything under /src/core)
 * must stay portable to React Native / Capacitor / a Node worker.
 *
 * Field names mirror the future Postgres schema (snake_case) so that Lot 1 can
 * map rows to these types with no translation layer.
 */

// ---------------------------------------------------------------------------
// Identity & session
// ---------------------------------------------------------------------------

export type Role = 'coordinator' | 'farmer' | 'volunteer' | 'driver'

/**
 * The single object that drives every access decision.
 * In Lot 1 this becomes the Supabase JWT claims; `entityId` becomes the row id
 * that RLS policies compare against.
 */
export interface Session {
  role: Role
  /** farm contact id / volunteer id / driver id. `null` for the coordinator. */
  entityId: string | null
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

export interface LatLng {
  lat: number
  lng: number
}

// ---------------------------------------------------------------------------
// Farms
// ---------------------------------------------------------------------------

export type FarmStatus =
  | 'to_contact'
  | 'contacted'
  | 'visited'
  | 'verbal_ok'
  | 'signed'
  | 'active'
  | 'declined'

export type FarmType = 'agriculture' | 'livestock' | 'mixed'

/** Ordered pipeline used by the status stepper. `declined` is off-pipeline. */
export const FARM_PIPELINE: readonly FarmStatus[] = [
  'to_contact',
  'contacted',
  'visited',
  'verbal_ok',
  'signed',
  'active',
] as const

export type CommitmentKind = 'shelter' | 'water' | 'food' | 'other'

export interface FarmCommitment {
  kind: CommitmentKind
  /** Free-text detail, e.g. "מבנה קרוואן ליד הלול, 2 מיטות". */
  detail: string
  fulfilled: boolean
}

export interface FarmContact {
  id: string
  name: string
  phone: string
  role: string
  /** Data URI in Lot 0.6; a Supabase Storage key from Lot 1 (see core/photo.ts). */
  photo: string | null
  /** The contact that may sign in as FARMER for this farm. */
  isPrimary: boolean
}

export interface Agreement {
  id: string
  signedAt: string
  signedBy: string
  /** Mock document reference — no real file in Lot 0. */
  fileName: string
}

export interface Farm {
  id: string
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
  lastVisitAt: string | null
  nextVisitAt: string | null
  /** Photo of the place itself. */
  photo: string | null
}

// ---------------------------------------------------------------------------
// Farm zones — the two kinds of ground a farm is made of
// ---------------------------------------------------------------------------

/**
 * G1 — what a drawn polygon MEANS. The farm boundary is the holding itself
 * (buildings, pens, cultivated plots); the grazing area is where the herd
 * actually roams at night, which is routinely an order of magnitude larger
 * and is where the guards and the incidents are. They are separate kinds
 * rather than one list with a flag because every consumer treats them
 * differently: colour, legend, and eventually alert rules.
 */
export type FarmZoneKind = 'farm_boundary' | 'grazing_area'

export interface FarmZone {
  id: string
  farmId: string
  kind: FarmZoneKind
  /** Vertex ring, implicitly closed — the last vertex joins the first. */
  ring: LatLng[]
}

// ---------------------------------------------------------------------------
// Anchor points (עמדות שמירה in the UI) — where a guard group is dropped off
// ---------------------------------------------------------------------------

export interface AnchorPoint {
  id: string
  farmId: string
  name: string
  position: LatLng
  /** Dress code, equipment, briefing. Shown to volunteers. */
  instructions: string[]
  /**
   * Plain-language driving/access description, written so it can be read on a
   * kosher phone with no map: "מכביש 40 פנייה מזרחה אחרי תחנת הדלק…".
   */
  accessDescription: string
}

// ---------------------------------------------------------------------------
// Volunteers & drivers
// ---------------------------------------------------------------------------

export type PhoneType = 'smartphone' | 'kosher'

export type VolunteerStatus = 'active' | 'inactive'

export interface Volunteer {
  id: string
  name: string
  age: number
  phone: string
  phoneType: PhoneType
  yeshiva: string
  locality: string
  guardsCount: number
  status: VolunteerStatus
  /** Required when status is 'inactive'. */
  inactiveReason: string | null
  notes: string
  /** ISO datetime of the last guard served — the roster's "last activity". */
  lastActivityAt: string | null
  photo: string | null
}

export interface Driver {
  id: string
  name: string
  phone: string
  vehicle: string
  seats: number
  locality: string
  photo: string | null
}

// ---------------------------------------------------------------------------
// Missions (שמירות)
// ---------------------------------------------------------------------------

export type MissionStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'return_not_confirmed'

// --- Nominative presence confirmation (R6) ---------------------------------

/** What someone asserted about one person on one leg of the journey. */
export type PresenceMark = 'present' | 'absent'

/** Who asserted it. Three independent channels, deliberately not merged. */
export type PresenceSource = 'driver' | 'group' | 'self'

/**
 * One journey leg for one volunteer.
 *
 * Counters were replaced by per-person marks because "5 of 6" tells the
 * coordinator that someone is missing but not *who* — and at 05:00 in the
 * desert that distinction is the whole point.
 *
 * `driver` and `group` are the two authoritative channels and are compared
 * against each other. `self` exists only for volunteers who carry a smartphone;
 * kosher-phone holders physically cannot self-confirm, which is exactly why the
 * group-phone holder confirms nominatively on their behalf.
 */
export interface LegConfirmation {
  driver: PresenceMark | null
  group: PresenceMark | null
  self: PresenceMark | null
}

export type ConfirmationState = 'present' | 'absent' | 'pending' | 'mismatch'

/**
 * Reconcile one leg into a single state.
 * Driver and group disagreeing is a `mismatch` — it raises an alert rather
 * than silently picking a winner.
 */
export function resolveConfirmation(leg: LegConfirmation): ConfirmationState {
  const { driver, group } = leg
  if (driver !== null && group !== null && driver !== group) return 'mismatch'
  const decided = driver ?? group
  if (decided === null) return 'pending'
  return decided
}

export const EMPTY_LEG: LegConfirmation = {
  driver: null,
  group: null,
  self: null,
}

export interface MissionAssignment {
  volunteerId: string
  /** Exactly one assignment per mission carries the group's smartphone. */
  isGroupPhone: boolean
  /** Evening trip out to the farm. */
  outbound: LegConfirmation
  /** Morning trip home. */
  inbound: LegConfirmation
}

export interface Mission {
  id: string
  farmId: string
  /**
   * THE RENDEZVOUS. Where the driver drops the group and where every generated
   * message points. Exactly one, always.
   */
  anchorPointId: string
  /**
   * F2 — the other positions this guard covers during the night.
   *
   * A group of four regularly splits, or moves from the gate to the water tower
   * at 01:00, and the coordinator needs the guard to say so. Kept SEPARATE from
   * `anchorPointId` rather than collapsing both into a list, because the two
   * facts are different: the rendezvous is a logistics commitment the driver and
   * the messages depend on, the rest are places to be. Empty for most guards.
   */
  additionalAnchorPointIds: string[]
  /**
   * G8 — THE CAR STOPS WHERE THE CAR CAN GO, WHICH IS NOT THE GUARD POST.
   *
   * `pickupPoint` is where the group boards in town before the night;
   * `dropoffPoint` is where the private car actually stops at the farm end —
   * the gate, the track head — from which the farmer's 4×4 or a walk covers
   * the rest. Null `dropoffPoint` means the farm's own pin. The return legs
   * default to the same two points, inverted: `returnPickupPoint` /
   * `returnDropoffPoint` are only non-null when the coordinator overrides
   * that.
   */
  pickupPoint: LatLng | null
  dropoffPoint: LatLng | null
  returnPickupPoint: LatLng | null
  returnDropoffPoint: LatLng | null
  /** ISO datetime of the expected arrival at the anchor point. */
  startAt: string
  /** ISO datetime of the expected morning pick-up. */
  endAt: string
  status: MissionStatus
  assignments: MissionAssignment[]
  driverId: string | null
  arrivalConfirmedAt: string | null
  endConfirmedAt: string | null

  // --- D6.2: the night's timeline ------------------------------------------
  //
  // Four instants the guard actually passes through. They exist because a
  // timeline built only from `arrivalConfirmedAt` / `endConfirmedAt` had to
  // print "—" against steps that had demonstrably happened. Each is stamped by
  // exactly one transition in store.ts and by nothing else.

  /** When the coordinator created the guard. */
  createdAt: string
  /** Every volunteer marked on the OUTBOUND leg — the group is on site. */
  droppedOffAt: string | null
  /** Every volunteer marked on the INBOUND leg — the driver has them. */
  pickedUpAt: string | null
  /**
   * The inbound reconciliation closed with no disagreement.
   *
   * Distinct from `pickedUpAt` on purpose: "the driver says he has everyone"
   * and "the driver and the group holder agree he has everyone" are different
   * claims, and the gap between them is precisely what this programme exists
   * to catch.
   */
  completedAt: string | null
}

export type MissionLeg = 'outbound' | 'inbound'

// ---------------------------------------------------------------------------
// Farm visits (ביקורי חווה) — D4
// ---------------------------------------------------------------------------

/**
 * A planned or completed visit by the coordinator to a farm.
 *
 * Introduced in Lot 0.7 because the agenda needed something to put in the
 * calendar besides guards, and "the coordinator is driving to Har Amasa on
 * Tuesday" was previously representable only as a bare date on the farm record.
 *
 * `Farm.nextVisitAt` still exists and still drives the route planner and the
 * dashboard, but it is now a DERIVED CACHE of these rows — recomputed by the
 * store after every visit mutation, and written by nothing else. See
 * `syncNextVisit` in store.ts.
 */
export interface FarmVisit {
  id: string
  farmId: string
  /** ISO datetime of the visit. */
  at: string
  note: string
  done: boolean
}

// ---------------------------------------------------------------------------
// Incidents (אירועים)
// ---------------------------------------------------------------------------

export type IncidentSeverity = 'observation' | 'suspicious' | 'urgent'

export type IncidentSource = 'volunteer' | 'farmer' | 'coordinator'

export interface IncidentEntry {
  id: string
  at: string
  author: string
  text: string
}

export interface Incident {
  id: string
  farmId: string
  missionId: string | null
  source: IncidentSource
  /** Id of the volunteer / farm contact / coordinator who reported it. */
  reporterId: string | null
  reporterName: string
  severity: IncidentSeverity
  description: string
  position: LatLng | null
  reportedAt: string
  resolved: boolean
  entries: IncidentEntry[]
}

// ---------------------------------------------------------------------------
// Derived view-models returned by the role-filtered accessors
// ---------------------------------------------------------------------------

export interface MissionView {
  mission: Mission
  farm: Farm
  /** The rendezvous. */
  anchorPoint: AnchorPoint
  /** F2 — the other positions covered, in the order they were checked. */
  additionalAnchorPoints: AnchorPoint[]
  driver: Driver | null
  volunteers: Array<{ volunteer: Volunteer; isGroupPhone: boolean }>
}

export interface IncidentView {
  incident: Incident
  farm: Farm
}

export interface FarmStatusCount {
  status: FarmStatus
  count: number
}

export type AlertKind =
  | 'urgent_incident'
  | 'return_not_confirmed'
  | 'presence_mismatch'

export interface DashboardAlert {
  id: string
  kind: AlertKind
  farmName: string
  at: string
  detail: string
  /** In-app route to open when the alert is tapped. */
  href: string
  /** Severity ordering for the dashboard: higher sorts first. */
  weight: number
  /**
   * People to reach immediately, rendered as one-tap call buttons on the alert
   * itself — the coordinator should never have to navigate to place the call.
   */
  contacts: Array<{ name: string; phone: string; roleKey: string }>
}

/** D4 — one entry in the agenda, whatever kind of thing it is. */
export type AgendaEventKind = 'mission' | 'visit'

export interface AgendaEvent {
  id: string
  kind: AgendaEventKind
  /** ISO datetime the entry starts. */
  at: string
  /** ISO datetime it ends. Equal to `at` for point events like a visit. */
  endAt: string
  /** Farm name — the thing a coordinator scans for. */
  title: string
  /** Anchor point, or the visit note. */
  subtitle: string
  /** Route to open on click. */
  href: string
  /** Present only for `kind: 'mission'`; the UI colours the entry by it. */
  missionStatus: MissionStatus | null
  /** Present only for `kind: 'visit'`. */
  done: boolean
  farmId: string
}

export interface VolunteerStats {
  total: number
  active: number
  inactive: number
  smartphone: number
  kosher: number
  byYeshiva: Array<{ yeshiva: string; count: number }>
}
