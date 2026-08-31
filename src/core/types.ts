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

/**
 * G16 — what KIND of entity the record is (field-expert feedback): the
 * programme guards moshavim too, and a moshav is not a farm — different
 * marker, different zone tints, "גבול היישוב" instead of "גבול החווה".
 * Same mechanics everywhere else (zones, guards, posts), which is why it is
 * a field on Farm rather than a parallel type. Optional: absent = 'farm',
 * so fixtures and imports predating the field stay valid.
 */
export type EntityKind = 'farm' | 'moshav' | 'other'

/** The read side of the optional field: absent means a plain farm. */
export const entityKindOf = (farm: { entityKind?: EntityKind }): EntityKind =>
  farm.entityKind ?? 'farm'

/** Ordered pipeline used by the status stepper. `declined` is off-pipeline. */
export const FARM_PIPELINE: readonly FarmStatus[] = [
  'to_contact',
  'contacted',
  'visited',
  'verbal_ok',
  'signed',
  'active',
] as const

/**
 * PO POINT 6 (2026-08-31) — HOW MANY HEAD, AND OF WHAT.
 *
 * ★ THE FUNDING DEPENDS ON IT. The programme is paid partly on the livestock
 *   it protects, and the association's director is asked for that number by
 *   people who do not care how many dunams a wadi covers. Until now the app
 *   could say how much GROUND was under guard and nothing at all about the
 *   animals standing on it.
 *
 * ★ IT IS A LIST, NOT A NUMBER, because "500 head" answers nothing: 500 sheep
 *   and 500 head of cattle are different sums of money, different night risks
 *   and different pens. The field expert names the species; the app does not
 *   invent a unit that averages them.
 *
 * ★ AND `other` CARRIES ITS OWN LABEL rather than being a bucket. A closed
 *   list keeps the totals addable; the free label keeps the coordinator from
 *   having to lie about an ostrich farm.
 *
 * Optional on `Farm`, like `entityKind` before it: absent means nobody has
 * been asked yet, which is NOT the same as zero and must never be rendered as
 * a zero.
 */
export type LivestockKind =
  | 'cattle'
  | 'sheep'
  | 'goats'
  | 'camels'
  | 'horses'
  | 'poultry'
  | 'other'

export const LIVESTOCK_KINDS: readonly LivestockKind[] = [
  'cattle',
  'sheep',
  'goats',
  'camels',
  'horses',
  'poultry',
  'other',
] as const

export interface LivestockLine {
  kind: LivestockKind
  /** Free text, and only meaningful for `other`. */
  label: string
  heads: number
}

/**
 * Total head on an entity, or null when nobody has been asked.
 *
 * ★ `null` AND NOT `0`, and the distinction is the whole reason this returns
 *   a nullable. A farm with no livestock row is a farm nobody has asked about
 *   the animals on; a farm with a row saying `0` is a farm that has none. A
 *   banner that renders "0 ראשים" for the first is a banner that states a fact
 *   nobody has established, and the funding number is built out of these.
 */
export function totalHeads(farm: { livestock?: LivestockLine[] }): number | null {
  const lines = farm.livestock
  if (!lines || lines.length === 0) return null
  return lines.reduce((sum, l) => sum + (Number.isFinite(l.heads) ? l.heads : 0), 0)
}

/**
 * Whether an entity is one the livestock question is even asked of.
 *
 * The product owner's own wording: `בעלי חיים` or `משולב`. An arable holding
 * has no head count, and a form that asks it anyway is a form that trains the
 * coordinator to skip a section.
 */
export const keepsLivestock = (farm: { type: FarmType }): boolean =>
  farm.type === 'livestock' || farm.type === 'mixed'

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
  /** P0bis.5a — optional; see the note on `Volunteer.email`. */
  email: string
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
  /**
   * P3.3 — the signature itself, drawn on the device.
   *
   * A PNG data URI today, exactly as `photo` is (`core/photo.ts`), and a
   * Storage object key in the `agreements` bucket the day the real PDF is
   * generated. Optional: every agreement recorded before this field existed is
   * a real agreement, signed on paper, and must not be shown as unsigned.
   */
  signature?: string | null
}

export interface Farm {
  id: string
  name: string
  locality: string
  region: string
  type: FarmType
  /** G16 — חווה / מושב / אחר. Absent = 'farm' (see entityKindOf). */
  entityKind?: EntityKind
  status: FarmStatus
  position: LatLng
  farmDunams: number
  grazingDunams: number
  /**
   * G15 — true when the coordinator TYPED the value ("מוזן ידנית"); false or
   * absent means the number is the zone sum and the store keeps it in sync
   * with the drawn polygons (see syncZoneDunams). Optional so fixtures and
   * imports predating the flag stay valid — absent reads as automatic.
   */
  farmDunamsManual?: boolean
  grazingDunamsManual?: boolean
  contacts: FarmContact[]
  commitments: FarmCommitment[]
  /**
   * PO POINT 6 — the head count, per species. Optional: absent means nobody
   * has been asked, which is not zero. Only meaningful on a `livestock` or
   * `mixed` entity (`keepsLivestock`).
   */
  livestock?: LivestockLine[]
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
// G18 — the threat layer. COORDINATOR ONLY.
// ---------------------------------------------------------------------------

/**
 * Where trouble comes from, and how hard.
 *
 * This is the one part of the model that is genuinely SENSITIVE. A farm's
 * boundary is a fact about the ground; "we assess this wadi as a high-intensity
 * approach" is an assessment about people, and it must not reach a farmer's
 * phone, a volunteer's guard screen or a driver's trip sheet. `access.ts`
 * therefore returns an empty list for every role but the coordinator, and A59
 * tests exactly that — the gate lives in the data layer, not in a screen that
 * happens not to render it.
 *
 * Two shapes, because the field expert describes two different things:
 *
 *   · a ZONE is an area under pressure — a wadi, a stretch of the border road,
 *     the eastern grazing beyond the ridge;
 *   · a VECTOR is a direction of approach — an arrow from where they come to
 *     where they arrive. Its whole purpose is to let a coordinator place guard
 *     posts FACING it, which is why it appears on wizard step 1.
 *
 * Both may be attached to an entity (`farmId`) or free at map level
 * (`farmId: null`): a threat does not respect a fence line, and the ones that
 * matter most sit BETWEEN holdings.
 *
 * `updatedAt` is shown, always. A threat map with no date is worse than none:
 * it invites a coordinator to act in 2027 on an assessment made in 2025.
 */
export type ThreatIntensity = 'low' | 'medium' | 'high'

export const THREAT_INTENSITIES: readonly ThreatIntensity[] = [
  'low',
  'medium',
  'high',
] as const

export interface ThreatZone {
  id: string
  /** null = free at map level, attached to no entity. */
  farmId: string | null
  /** Vertex ring, implicitly closed — same convention as FarmZone. */
  ring: LatLng[]
  intensity: ThreatIntensity
  note: string
  /** ISO datetime of the last revision. Displayed, never hidden. */
  updatedAt: string
}

export interface ThreatVector {
  id: string
  farmId: string | null
  /** Where the approach comes FROM — the first click. */
  origin: LatLng
  /** Where it points TO — the second. */
  target: LatLng
  intensity: ThreatIntensity
  note: string
  updatedAt: string
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
  /**
   * P0bis.5a — OPTIONAL, AND IT WILL STAY OPTIONAL. Email is the one channel
   * this programme can send AUTOMATICALLY (P3.3bis): no third-party app may
   * send a WhatsApp or an SMS on a user's behalf, so those stay one-tap
   * hand-offs while email becomes a server-side send. But a yeshiva student
   * with a kosher phone frequently has no address at all, and a required
   * field would either block his import or invite a fake one — which is worse
   * than no address, because it looks like a channel that works.
   */
  email: string
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
  /** G5.2 — driving licence + own car; both true makes him markable as a driver. */
  hasLicense: boolean
  hasCar: boolean
  /** G5.2 — "יכול לשמש כנהג": maintains a linked Driver row while true. */
  canDrive: boolean
  /**
   * G3.4 — slot preferences, applied as a SOFT signal in scoring, never as a
   * hard filter: an empty object means "whenever needed", which is the common
   * case and must stay the cheap one.
   */
  availability: VolunteerAvailability
}

export interface VolunteerAvailability {
  nights: boolean
  days: boolean
  weekends: boolean
  /** Day keys (YYYY-MM-DD) the volunteer has excluded. */
  excludedDates: string[]
}

export const DEFAULT_AVAILABILITY: VolunteerAvailability = {
  nights: true,
  days: true,
  weekends: true,
  excludedDates: [],
}

export interface Driver {
  id: string
  name: string
  phone: string
  /** P0bis.5a — optional; see the note on `Volunteer.email`. */
  email: string
  vehicle: string
  seats: number
  locality: string
  photo: string | null
  /** Free-text availability ("א׳–ה׳ בערב, לא שישי"). */
  availabilityNote: string
  notes: string
  /**
   * G5.2 — THE DUAL HAT IS ONE HUMAN. A volunteer with a licence and a car
   * can be marked "יכול לשמש כנהג"; that materialises a Driver row LINKED to
   * the volunteer through this id, so he appears in both rosters without
   * existing twice. Null for career drivers.
   */
  volunteerId: string | null
}

/**
 * G5.3 — one driver's slice of a mission's transport. Confirmation is PER
 * DRIVER, and covers exactly HIS passengers: with two cars on the road,
 * "the driver confirmed" is not a fact, it is two facts.
 */
export interface MissionDriver {
  driverId: string
  /** The volunteers this driver carries, in boarding order. */
  passengerVolunteerIds: string[]
  confirmed: boolean
}

// ---------------------------------------------------------------------------
// Missions (שמירות)
// ---------------------------------------------------------------------------

export type MissionStatus =
  /**
   * G4 — the guard exists but its team does not, yet. A coordinator can
   * always leave the wizard with a partial roster and keep recruiting from
   * anywhere the mission shows; the status is what makes that state VISIBLE
   * instead of a silent gap.
   */
  | 'recruiting'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'return_not_confirmed'
  /**
   * G9bis — the guard was called off. NOT deleted: people were already
   * booked, messages already went out, and "we cancelled Tuesday at Retem"
   * is a fact the programme must remember. A cancelled guard leaves every
   * operational view, shows struck-through in the agenda, and can be
   * reactivated into 'recruiting' with every confirmation reset.
   */
  | 'cancelled'

// --- G9bis: cancellation ----------------------------------------------------

/**
 * Why a guard was called off — a CLOSED list, because "cancelled" without a
 * why is useless in the retrospective ("how many nights did we lose to
 * missing drivers?"). 'other' exists so the list can stay short; it demands
 * the free-text note instead.
 */
export type CancelReason =
  | 'no_volunteers'
  | 'no_driver'
  | 'farmer_request'
  | 'weather'
  | 'security_forces'
  | 'other'

export const CANCEL_REASONS: readonly CancelReason[] = [
  'no_volunteers',
  'no_driver',
  'farmer_request',
  'weather',
  'security_forces',
  'other',
] as const

/**
 * One person to inform that the night is off, with the "did I actually tell
 * them" mark. The RECIPIENTS are stored (they are the people who were booked
 * at the moment of cancellation); the message TEXT is not — it is rebuilt by
 * `buildOutreachMessage` so the wording lives in the locale files.
 */
/**
 * P0bis.5b — ONE "HAS THIS PERSON BEEN TOLD" MARK, FOR THREE EVENTS.
 *
 * G9bis stored a `CancelNotice[]` — a SNAPSHOT of who existed at cancel time,
 * pre-populated by `cancelMission`. Two things were wrong with that and both
 * matter on the screen whose whole job is "who still has to be told": a driver
 * added after the cancellation never appeared, and the creation and update
 * events had no mechanism at all.
 *
 * So the recipient LIST is derived from the mission every time
 * (`outreachRecipients`), and only the ticks are stored. An entry exists here
 * only once somebody has been ticked; its absence means "not yet", which is
 * also the default for a person who did not exist an hour ago.
 */
export interface OutreachNotice {
  event: 'created' | 'updated' | 'cancelled'
  recipientKind: 'volunteer' | 'driver' | 'farmer'
  /** Volunteer id / driver id / farm-contact id. */
  recipientId: string
  /** When the coordinator marked this notice as sent; null = not yet. */
  sentAt: string | null
}

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
  /** G4 — how many volunteers this night NEEDS; the gauge's denominator. */
  requiredVolunteers: number
  assignments: MissionAssignment[]
  /**
   * G5.3 — the night's transport, one entry per car. Empty means no driver
   * arranged (a volunteer self-drives, or the farmer collects). Replaces the
   * single `driverId` of Lots 0–0.9, because one car frequently is not enough
   * and "which driver has whom" must be a stored fact, not an inference.
   */
  drivers: MissionDriver[]
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

  // --- G9bis: cancellation ---------------------------------------------------
  //
  // The cancellation is a chapter of the mission's history, not a tombstone:
  // `cancelledAt` + reason survive a reactivation so the timeline can show
  // both "called off Tuesday 14:02" and "back on Wednesday 09:15".

  /** When the guard was called off; null = never cancelled. */
  cancelledAt: string | null
  /** Required at cancellation — see CancelReason. */
  cancelReason: CancelReason | null
  /** Free-text detail; the REQUIRED half when the reason is 'other'. */
  cancelNote: string
  /** Everyone to inform, snapshotted at cancellation, with sent tracking. */
  /** P0bis.5b — the sent ticks, for all three events. */
  outreach: OutreachNotice[]
  /** When the guard was put back into recruitment; null = still off / never. */
  reactivatedAt: string | null
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
  /** G5.3 — hydrated transport, one entry per car. */
  drivers: Array<{
    driver: Driver
    passengers: Volunteer[]
    confirmed: boolean
  }>
  /** The first car's driver — most guards have exactly one. */
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

/**
 * G14 — the association's two budget numbers, in dunams. "Guarded" is the
 * ground the programme actually covers (signed or active entities); the
 * "potential" is everything still in the pipeline that has not refused.
 * Declined entities count in neither: they are not coming.
 */
export interface DunamKpis {
  /** farm + grazing dunams over entities whose status is signed or active. */
  guardedDunams: number
  /** farm + grazing dunams over non-signed, non-declined entities. */
  potentialDunams: number
  /**
   * PO POINT 6 — head of livestock on the entities actually under guard.
   *
   * ★ ZERO MEANS "NOBODY HAS BEEN ASKED", and the dashboard tile is hidden at
   *   zero rather than showing it. The same reasoning as `totalHeads`: this is
   *   a funding number, and a funding number that reads 0 because a form was
   *   never filled is worse than one that is absent.
   */
  guardedHeads: number
}

export type AlertKind =
  | 'urgent_incident'
  | 'return_not_confirmed'
  | 'presence_mismatch'
  /** G4.3 — a guard still recruiting, urgency growing as the night nears. */
  | 'recruiting'

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

/**
 * G6 — a general meeting: not tied to a farm, not a guard. A call with a
 * donor, a municipality sit-down, a supplier pickup. Free-text location
 * because these happen anywhere.
 */
export interface GeneralMeeting {
  id: string
  title: string
  at: string
  endAt: string
  location: string
  /** Who the meeting is with — person or organisation, free text. */
  person: string
  note: string
}

/** D4 — one entry in the agenda, whatever kind of thing it is. */
export type AgendaEventKind = 'mission' | 'visit' | 'meeting'

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
  /** Null for general meetings — they belong to no farm. */
  farmId: string | null
}

/** G14d — the driver roster's KPI-filters, computed at the accessor. */
export interface DriverStats {
  total: number
  /** Sum of seats over the whole roster: the fleet's carrying capacity. */
  totalSeats: number
  /** Vans and minibuses — seats ≥ 7, the vehicles that move a whole group. */
  sevenPlusSeats: number
  /** Not booked on any of tonight's guards. */
  freeTonight: number
}

export interface VolunteerStats {
  total: number
  active: number
  inactive: number
  smartphone: number
  kosher: number
  /** G14d — holds a licence AND has a car: can self-transport to a guard. */
  licenseCar: number
  /** G14d — never guarded yet: the outreach list. */
  neverGuarded: number
  byYeshiva: Array<{ yeshiva: string; count: number }>
}
