import type { Collection, StoreData } from '@core/backend'
import type { Tour } from '@core/tours'
import type {
  Agreement,
  AnchorPoint,
  Driver,
  Farm,
  FarmCommitment,
  LivestockLine,
  FarmContact,
  FarmVisit,
  FarmZone,
  GeneralMeeting,
  Incident,
  IncidentEntry,
  LatLng,
  LegConfirmation,
  Mission,
  MissionAssignment,
  MissionDriver,
  OutreachNotice,
  PresenceMark,
  Volunteer,
} from '@core/types'
import { DEFAULT_AVAILABILITY, EMPTY_LEG } from '@core/types'

/**
 * P2.6b — THE ONE PLACE THAT KNOWS BOTH SHAPES.
 *
 * `@core/types` is a NESTED domain model: a `Farm` carries its contacts,
 * commitments and agreements; a `Mission` carries its assignments, their
 * presence marks, its cars and their passengers. Postgres holds the same facts
 * as 26 flat tables. This file is the whole of the translation, in both
 * directions, and nothing else in the app is allowed to know a column name.
 *
 * ★ IT IS WRITTEN AS AN AGGREGATE MAPPING, NOT A TABLE MAPPING, AND THAT
 *   DECIDES THE WRITE PATH. `store.ts` reports what changed as whole
 *   aggregates (see the note on `indexOf`), because that is what a mutation
 *   actually produces and what an offline outbox can replay a week later
 *   without holding a reference into a store that has moved on. So an upsert
 *   here is: write the parent row, then for each child table delete what
 *   belongs to this parent and insert the new set. That is aggregate-level
 *   last-write-wins, it is a handful of statements rather than a field-level
 *   diff nobody could debug at 02:00, and it is exactly the granularity the
 *   change record already has.
 *
 * ★ THE CHILD LISTS ARE IN INSERT ORDER AND ARE DELETED IN REVERSE. Not a
 *   style choice: `presence_marks` has a foreign key onto
 *   `mission_assignments`, and `mission_driver_passengers` onto
 *   `mission_drivers`. Insert a mark before its assignment, or delete an
 *   assignment before its marks, and Postgres refuses — correctly.
 *
 * `bun run mapping` drives every fixture aggregate through `toRows` and back
 * through `fromRows` and fails on any difference, so "lossless" is a checked
 * claim about 12 farms, 300 volunteers and every guard in the fixtures rather
 * than a hope about 26 hand-written column lists.
 */

export type Row = Record<string, unknown>

/** One table's worth of an aggregate's rows. */
export interface TableRows {
  table: string
  rows: Row[]
}

export interface Mapping<T> {
  /** The parent table; its primary key IS the aggregate's id. */
  readonly table: string
  /**
   * Child tables in INSERT order, each with the column naming the parent.
   * Deletes run in reverse; see the note above.
   */
  readonly children: ReadonlyArray<{ table: string; fk: string }>
  toRows(value: T): TableRows[]
  fromRows(parent: Row, children: Record<string, Row[]>): T
}

// --- Small readers ---------------------------------------------------------
//
// Postgres answers a `timestamptz` as `2026-08-31 12:00:00+00`, the app writes
// `iso(now())` which is `2026-08-31T12:00:00.000Z`. Both parse to the same
// instant and every reader in @core goes through `new Date(...)`, so nothing
// would visibly break — but two spellings of one timestamp in one snapshot is
// exactly the kind of difference that makes a structural diff report a change
// that did not happen. Normalising on the way in costs nothing and keeps the
// write-through quiet.

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback)
const bool = (v: unknown): boolean => v === true
const nullableStr = (v: unknown): string | null => (typeof v === 'string' ? v : null)

const ts = (v: unknown): string => (v == null ? '' : new Date(v as string).toISOString())
const tsOrNull = (v: unknown): string | null =>
  v == null ? null : new Date(v as string).toISOString()

/** A day key stays a day key: `date` comes back as YYYY-MM-DD already. */
const day = (v: unknown): string => str(v).slice(0, 10)

const point = (lat: unknown, lng: unknown): LatLng => ({ lat: num(lat), lng: num(lng) })
const pointOrNull = (lat: unknown, lng: unknown): LatLng | null =>
  lat == null || lng == null ? null : point(lat, lng)

/** Child rows, in the `position` order they were written with. */
const ordered = (rows: Row[] | undefined): Row[] =>
  [...(rows ?? [])].sort((a, b) => num(a.position) - num(b.position))

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

// --- Vertex rings ----------------------------------------------------------

const ringRows = (fk: string, id: string, ring: LatLng[]): Row[] =>
  ring.map((p, position) => ({ [fk]: id, position, lat: p.lat, lng: p.lng }))

const ringOf = (rows: Row[] | undefined): LatLng[] =>
  ordered(rows).map((r) => point(r.lat, r.lng))

// ===========================================================================
// Farms — `entities` + contacts + commitments + agreements
// ===========================================================================
//
// A `FarmCommitment` has NO id in the domain model; the table needs one. It is
// minted from the parent and the position — `farm-01:c0` — which is stable
// across writes (the same commitment keeps the same row) and needs nothing
// stored to reproduce. `position` is what actually orders them on the way
// back, and it is load-bearing: `setCommitmentFulfilled` addresses a
// commitment by its INDEX.

const farmMapping: Mapping<Farm> = {
  table: 'entities',
  children: [
    { table: 'entity_contacts', fk: 'entity_id' },
    { table: 'entity_commitments', fk: 'entity_id' },
    // PO POINT 6 — the same shape as commitments, and for the same reason:
    // the domain object has no id, the row needs one, and `position` is what
    // orders them on the way back.
    { table: 'entity_livestock', fk: 'entity_id' },
    { table: 'agreements', fk: 'entity_id' },
  ],
  toRows: (f) => [
    {
      table: 'entities',
      rows: [
        {
          id: f.id,
          name: f.name,
          locality: f.locality,
          region: f.region,
          type: f.type,
          entity_kind: f.entityKind ?? 'farm',
          status: f.status,
          lat: f.position.lat,
          lng: f.position.lng,
          farm_dunams: f.farmDunams,
          grazing_dunams: f.grazingDunams,
          farm_dunams_manual: f.farmDunamsManual ?? false,
          grazing_dunams_manual: f.grazingDunamsManual ?? false,
          notes: f.notes,
          last_visit_at: f.lastVisitAt,
          next_visit_at: f.nextVisitAt,
          photo: f.photo,
        },
      ],
    },
    {
      table: 'entity_contacts',
      rows: f.contacts.map((c, position) => ({
        id: c.id,
        entity_id: f.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        role: c.role,
        photo: c.photo,
        is_primary: c.isPrimary,
        position,
      })),
    },
    {
      table: 'entity_commitments',
      rows: f.commitments.map((c, position) => ({
        id: `${f.id}:c${position}`,
        entity_id: f.id,
        kind: c.kind,
        detail: c.detail,
        fulfilled: c.fulfilled,
        position,
      })),
    },
    {
      table: 'entity_livestock',
      rows: (f.livestock ?? []).map((l, position) => ({
        id: `${f.id}:l${position}`,
        entity_id: f.id,
        kind: l.kind,
        label: l.label,
        heads: l.heads,
        position,
      })),
    },
    {
      table: 'agreements',
      rows: f.agreements.map((a, position) => ({
        id: a.id,
        entity_id: f.id,
        signed_at: a.signedAt,
        signed_by: a.signedBy,
        file_name: a.fileName,
        position,
      })),
    },
  ],
  fromRows: (p, kids): Farm => ({
    id: str(p.id),
    name: str(p.name),
    locality: str(p.locality),
    region: str(p.region),
    type: str(p.type, 'mixed') as Farm['type'],
    entityKind: str(p.entity_kind, 'farm') as Farm['entityKind'],
    status: str(p.status, 'to_contact') as Farm['status'],
    position: point(p.lat, p.lng),
    farmDunams: num(p.farm_dunams),
    grazingDunams: num(p.grazing_dunams),
    farmDunamsManual: bool(p.farm_dunams_manual),
    grazingDunamsManual: bool(p.grazing_dunams_manual),
    contacts: ordered(kids.entity_contacts).map(
      (r): FarmContact => ({
        id: str(r.id),
        name: str(r.name),
        phone: str(r.phone),
        email: str(r.email),
        role: str(r.role),
        photo: nullableStr(r.photo),
        isPrimary: bool(r.is_primary),
      }),
    ),
    commitments: ordered(kids.entity_commitments).map(
      (r): FarmCommitment => ({
        kind: str(r.kind, 'other') as FarmCommitment['kind'],
        detail: str(r.detail),
        fulfilled: bool(r.fulfilled),
      }),
    ),
    /**
     * ★ `undefined` WHEN THERE ARE NO ROWS, NOT `[]`, and it is the same
     *   distinction the whole feature turns on: absent means nobody has been
     *   asked, and `totalHeads` returns null for it so the dashboard and the
     *   report can stay silent rather than state a zero nobody established.
     *   An empty array would round-trip as "asked, and the answer was none".
     */
    livestock:
      ordered(kids.entity_livestock).length === 0
        ? undefined
        : ordered(kids.entity_livestock).map(
            (r): LivestockLine => ({
              kind: str(r.kind, 'other') as LivestockLine['kind'],
              label: str(r.label),
              heads: num(r.heads),
            }),
          ),
    agreements: ordered(kids.agreements).map(
      (r): Agreement => ({
        id: str(r.id),
        signedAt: ts(r.signed_at),
        signedBy: str(r.signed_by),
        fileName: str(r.file_name),
      }),
    ),
    notes: str(p.notes),
    lastVisitAt: tsOrNull(p.last_visit_at),
    nextVisitAt: tsOrNull(p.next_visit_at),
    photo: nullableStr(p.photo),
  }),
}

// ===========================================================================
// Ground
// ===========================================================================

const farmZoneMapping: Mapping<FarmZone> = {
  table: 'zones',
  children: [{ table: 'zone_vertices', fk: 'zone_id' }],
  toRows: (z) => [
    { table: 'zones', rows: [{ id: z.id, entity_id: z.farmId, kind: z.kind }] },
    { table: 'zone_vertices', rows: ringRows('zone_id', z.id, z.ring) },
  ],
  fromRows: (p, kids): FarmZone => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    kind: str(p.kind, 'farm_boundary') as FarmZone['kind'],
    ring: ringOf(kids.zone_vertices),
  }),
}

const anchorMapping: Mapping<AnchorPoint> = {
  table: 'guard_posts',
  children: [],
  toRows: (a) => [
    {
      table: 'guard_posts',
      rows: [
        {
          id: a.id,
          entity_id: a.farmId,
          name: a.name,
          lat: a.position.lat,
          lng: a.position.lng,
          instructions: a.instructions,
          access_description: a.accessDescription,
        },
      ],
    },
  ],
  fromRows: (p): AnchorPoint => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    name: str(p.name),
    position: point(p.lat, p.lng),
    instructions: strings(p.instructions),
    accessDescription: str(p.access_description),
  }),
}

// --- G18: the sensitive layer ---------------------------------------------

const threatZoneMapping: Mapping<StoreData['threatZones'][number]> = {
  table: 'threat_zones',
  children: [{ table: 'threat_zone_vertices', fk: 'threat_zone_id' }],
  toRows: (z) => [
    {
      table: 'threat_zones',
      rows: [
        {
          id: z.id,
          entity_id: z.farmId,
          intensity: z.intensity,
          note: z.note,
          updated_at: z.updatedAt,
        },
      ],
    },
    { table: 'threat_zone_vertices', rows: ringRows('threat_zone_id', z.id, z.ring) },
  ],
  fromRows: (p, kids) => ({
    id: str(p.id),
    farmId: nullableStr(p.entity_id),
    ring: ringOf(kids.threat_zone_vertices),
    intensity: str(p.intensity, 'medium') as 'low' | 'medium' | 'high',
    note: str(p.note),
    updatedAt: ts(p.updated_at),
  }),
}

const threatVectorMapping: Mapping<StoreData['threatVectors'][number]> = {
  table: 'threat_vectors',
  children: [],
  toRows: (v) => [
    {
      table: 'threat_vectors',
      rows: [
        {
          id: v.id,
          entity_id: v.farmId,
          origin_lat: v.origin.lat,
          origin_lng: v.origin.lng,
          target_lat: v.target.lat,
          target_lng: v.target.lng,
          intensity: v.intensity,
          note: v.note,
          updated_at: v.updatedAt,
        },
      ],
    },
  ],
  fromRows: (p) => ({
    id: str(p.id),
    farmId: nullableStr(p.entity_id),
    origin: point(p.origin_lat, p.origin_lng),
    target: point(p.target_lat, p.target_lng),
    intensity: str(p.intensity, 'medium') as 'low' | 'medium' | 'high',
    note: str(p.note),
    updatedAt: ts(p.updated_at),
  }),
}

// ===========================================================================
// People
// ===========================================================================

const volunteerMapping: Mapping<Volunteer> = {
  table: 'volunteers',
  children: [],
  toRows: (v) => [
    {
      table: 'volunteers',
      rows: [
        {
          id: v.id,
          name: v.name,
          age: v.age,
          phone: v.phone,
          phone_type: v.phoneType,
          email: v.email,
          yeshiva: v.yeshiva,
          locality: v.locality,
          guards_count: v.guardsCount,
          status: v.status,
          inactive_reason: v.inactiveReason,
          notes: v.notes,
          last_activity_at: v.lastActivityAt,
          photo: v.photo,
          has_license: v.hasLicense,
          has_car: v.hasCar,
          can_drive: v.canDrive,
          avail_nights: v.availability.nights,
          avail_days: v.availability.days,
          avail_weekends: v.availability.weekends,
          avail_excluded: v.availability.excludedDates,
        },
      ],
    },
  ],
  fromRows: (p): Volunteer => ({
    id: str(p.id),
    name: str(p.name),
    age: num(p.age, 20),
    phone: str(p.phone),
    phoneType: str(p.phone_type, 'smartphone') as Volunteer['phoneType'],
    email: str(p.email),
    yeshiva: str(p.yeshiva),
    locality: str(p.locality),
    guardsCount: num(p.guards_count),
    status: str(p.status, 'active') as Volunteer['status'],
    inactiveReason: nullableStr(p.inactive_reason),
    notes: str(p.notes),
    lastActivityAt: tsOrNull(p.last_activity_at),
    photo: nullableStr(p.photo),
    hasLicense: bool(p.has_license),
    hasCar: bool(p.has_car),
    canDrive: bool(p.can_drive),
    availability: {
      nights: p.avail_nights === undefined ? DEFAULT_AVAILABILITY.nights : bool(p.avail_nights),
      days: p.avail_days === undefined ? DEFAULT_AVAILABILITY.days : bool(p.avail_days),
      weekends:
        p.avail_weekends === undefined ? DEFAULT_AVAILABILITY.weekends : bool(p.avail_weekends),
      excludedDates: strings(p.avail_excluded).map((d) => d.slice(0, 10)),
    },
  }),
}

const driverMapping: Mapping<Driver> = {
  table: 'drivers',
  children: [],
  toRows: (d) => [
    {
      table: 'drivers',
      rows: [
        {
          id: d.id,
          name: d.name,
          phone: d.phone,
          email: d.email,
          vehicle: d.vehicle,
          seats: d.seats,
          locality: d.locality,
          photo: d.photo,
          availability_note: d.availabilityNote,
          notes: d.notes,
          volunteer_id: d.volunteerId,
        },
      ],
    },
  ],
  fromRows: (p): Driver => ({
    id: str(p.id),
    name: str(p.name),
    phone: str(p.phone),
    email: str(p.email),
    vehicle: str(p.vehicle),
    seats: num(p.seats, 4),
    locality: str(p.locality),
    photo: nullableStr(p.photo),
    availabilityNote: str(p.availability_note),
    notes: str(p.notes),
    volunteerId: nullableStr(p.volunteer_id),
  }),
}

// ===========================================================================
// Missions — the deep one
// ===========================================================================
//
// R6's presence marks are ROWS, one per person per leg per channel, and the
// `null` in a `LegConfirmation` is the ABSENCE of a row rather than a row
// holding null. That is what makes a mark an append the outbox can replay
// without read-modify-writing a record two other people are also touching —
// so the mapping back has to reconstitute the three-slot object from however
// few rows arrived.

const LEGS = ['outbound', 'inbound'] as const
const SOURCES = ['driver', 'group', 'self'] as const

const missionMapping: Mapping<Mission> = {
  table: 'missions',
  children: [
    { table: 'mission_guard_posts', fk: 'mission_id' },
    { table: 'mission_assignments', fk: 'mission_id' },
    { table: 'presence_marks', fk: 'mission_id' },
    { table: 'mission_drivers', fk: 'mission_id' },
    { table: 'mission_driver_passengers', fk: 'mission_id' },
    { table: 'cancel_notices', fk: 'mission_id' },
  ],
  toRows: (m) => {
    const marks: Row[] = []
    for (const a of m.assignments) {
      for (const leg of LEGS) {
        for (const source of SOURCES) {
          const mark = a[leg][source]
          if (mark === null) continue
          marks.push({
            mission_id: m.id,
            volunteer_id: a.volunteerId,
            leg,
            source,
            mark,
          })
        }
      }
    }
    const passengers: Row[] = []
    for (const d of m.drivers) {
      d.passengerVolunteerIds.forEach((volunteerId, position) => {
        passengers.push({
          mission_id: m.id,
          driver_id: d.driverId,
          volunteer_id: volunteerId,
          position,
        })
      })
    }
    return [
      {
        table: 'missions',
        rows: [
          {
            id: m.id,
            entity_id: m.farmId,
            guard_post_id: m.anchorPointId,
            start_at: m.startAt,
            end_at: m.endAt,
            status: m.status,
            required_volunteers: m.requiredVolunteers,
            pickup_lat: m.pickupPoint?.lat ?? null,
            pickup_lng: m.pickupPoint?.lng ?? null,
            dropoff_lat: m.dropoffPoint?.lat ?? null,
            dropoff_lng: m.dropoffPoint?.lng ?? null,
            return_pickup_lat: m.returnPickupPoint?.lat ?? null,
            return_pickup_lng: m.returnPickupPoint?.lng ?? null,
            return_dropoff_lat: m.returnDropoffPoint?.lat ?? null,
            return_dropoff_lng: m.returnDropoffPoint?.lng ?? null,
            arrival_confirmed_at: m.arrivalConfirmedAt,
            end_confirmed_at: m.endConfirmedAt,
            dropped_off_at: m.droppedOffAt,
            picked_up_at: m.pickedUpAt,
            completed_at: m.completedAt,
            cancelled_at: m.cancelledAt,
            cancel_reason: m.cancelReason,
            cancel_note: m.cancelNote,
            reactivated_at: m.reactivatedAt,
            created_at: m.createdAt,
          },
        ],
      },
      {
        table: 'mission_guard_posts',
        rows: m.additionalAnchorPointIds.map((guardPostId, position) => ({
          mission_id: m.id,
          guard_post_id: guardPostId,
          position,
          starts_at: null,
          ends_at: null,
        })),
      },
      {
        table: 'mission_assignments',
        rows: m.assignments.map((a, position) => ({
          mission_id: m.id,
          volunteer_id: a.volunteerId,
          is_group_phone: a.isGroupPhone,
          position,
        })),
      },
      { table: 'presence_marks', rows: marks },
      {
        table: 'mission_drivers',
        rows: m.drivers.map((d, position) => ({
          mission_id: m.id,
          driver_id: d.driverId,
          confirmed: d.confirmed,
          position,
        })),
      },
      { table: 'mission_driver_passengers', rows: passengers },
      {
        table: 'cancel_notices',
        rows: m.outreach.map((n) => ({
          mission_id: m.id,
          event: n.event,
          recipient_kind: n.recipientKind,
          recipient_id: n.recipientId,
          sent_at: n.sentAt,
        })),
      },
    ]
  },
  fromRows: (p, kids): Mission => {
    const missionId = str(p.id)

    const legs = new Map<string, { outbound: LegConfirmation; inbound: LegConfirmation }>()
    const legsFor = (volunteerId: string) => {
      let entry = legs.get(volunteerId)
      if (!entry) {
        entry = { outbound: { ...EMPTY_LEG }, inbound: { ...EMPTY_LEG } }
        legs.set(volunteerId, entry)
      }
      return entry
    }
    for (const r of kids.presence_marks ?? []) {
      const leg = str(r.leg) as (typeof LEGS)[number]
      const source = str(r.source) as (typeof SOURCES)[number]
      if (!LEGS.includes(leg) || !SOURCES.includes(source)) continue
      legsFor(str(r.volunteer_id))[leg][source] = str(r.mark) as PresenceMark
    }

    const passengersByDriver = new Map<string, Row[]>()
    for (const r of kids.mission_driver_passengers ?? []) {
      const key = str(r.driver_id)
      passengersByDriver.set(key, [...(passengersByDriver.get(key) ?? []), r])
    }

    return {
      id: missionId,
      farmId: str(p.entity_id),
      anchorPointId: str(p.guard_post_id),
      additionalAnchorPointIds: ordered(kids.mission_guard_posts).map((r) =>
        str(r.guard_post_id),
      ),
      pickupPoint: pointOrNull(p.pickup_lat, p.pickup_lng),
      dropoffPoint: pointOrNull(p.dropoff_lat, p.dropoff_lng),
      returnPickupPoint: pointOrNull(p.return_pickup_lat, p.return_pickup_lng),
      returnDropoffPoint: pointOrNull(p.return_dropoff_lat, p.return_dropoff_lng),
      startAt: ts(p.start_at),
      endAt: ts(p.end_at),
      status: str(p.status, 'recruiting') as Mission['status'],
      requiredVolunteers: num(p.required_volunteers, 2),
      assignments: ordered(kids.mission_assignments).map((r): MissionAssignment => {
        const volunteerId = str(r.volunteer_id)
        const entry = legsFor(volunteerId)
        return {
          volunteerId,
          isGroupPhone: bool(r.is_group_phone),
          outbound: entry.outbound,
          inbound: entry.inbound,
        }
      }),
      drivers: ordered(kids.mission_drivers).map((r): MissionDriver => {
        const driverId = str(r.driver_id)
        return {
          driverId,
          passengerVolunteerIds: ordered(passengersByDriver.get(driverId)).map((x) =>
            str(x.volunteer_id),
          ),
          confirmed: bool(r.confirmed),
        }
      }),
      arrivalConfirmedAt: tsOrNull(p.arrival_confirmed_at),
      endConfirmedAt: tsOrNull(p.end_confirmed_at),
      createdAt: ts(p.created_at),
      droppedOffAt: tsOrNull(p.dropped_off_at),
      pickedUpAt: tsOrNull(p.picked_up_at),
      completedAt: tsOrNull(p.completed_at),
      cancelledAt: tsOrNull(p.cancelled_at),
      cancelReason: (nullableStr(p.cancel_reason) as Mission['cancelReason']) ?? null,
      cancelNote: str(p.cancel_note),
      outreach: (kids.cancel_notices ?? []).map(
        (r): OutreachNotice => ({
          event: str(r.event, 'cancelled') as OutreachNotice['event'],
          recipientKind: str(r.recipient_kind, 'volunteer') as OutreachNotice['recipientKind'],
          recipientId: str(r.recipient_id),
          sentAt: tsOrNull(r.sent_at),
        }),
      ),
      reactivatedAt: tsOrNull(p.reactivated_at),
    }
  },
}

// ===========================================================================
// Incidents, visits, meetings, tours
// ===========================================================================

const incidentMapping: Mapping<Incident> = {
  table: 'incidents',
  children: [{ table: 'incident_entries', fk: 'incident_id' }],
  toRows: (i) => [
    {
      table: 'incidents',
      rows: [
        {
          id: i.id,
          entity_id: i.farmId,
          mission_id: i.missionId,
          source: i.source,
          reporter_id: i.reporterId,
          reporter_name: i.reporterName,
          severity: i.severity,
          description: i.description,
          lat: i.position?.lat ?? null,
          lng: i.position?.lng ?? null,
          reported_at: i.reportedAt,
          resolved: i.resolved,
        },
      ],
    },
    {
      table: 'incident_entries',
      rows: i.entries.map((e, position) => ({
        id: e.id,
        incident_id: i.id,
        at: e.at,
        author: e.author,
        text: e.text,
        position,
      })),
    },
  ],
  fromRows: (p, kids): Incident => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    missionId: nullableStr(p.mission_id),
    source: str(p.source, 'coordinator') as Incident['source'],
    reporterId: nullableStr(p.reporter_id),
    reporterName: str(p.reporter_name),
    severity: str(p.severity, 'observation') as Incident['severity'],
    description: str(p.description),
    position: pointOrNull(p.lat, p.lng),
    reportedAt: ts(p.reported_at),
    resolved: bool(p.resolved),
    entries: ordered(kids.incident_entries).map(
      (r): IncidentEntry => ({
        id: str(r.id),
        at: ts(r.at),
        author: str(r.author),
        text: str(r.text),
      }),
    ),
  }),
}

const farmVisitMapping: Mapping<FarmVisit> = {
  table: 'farm_visits',
  children: [],
  toRows: (v) => [
    {
      table: 'farm_visits',
      rows: [{ id: v.id, entity_id: v.farmId, at: v.at, note: v.note, done: v.done }],
    },
  ],
  fromRows: (p): FarmVisit => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    at: ts(p.at),
    note: str(p.note),
    done: bool(p.done),
  }),
}

const generalMeetingMapping: Mapping<GeneralMeeting> = {
  table: 'general_meetings',
  children: [],
  toRows: (m) => [
    {
      table: 'general_meetings',
      rows: [
        {
          id: m.id,
          title: m.title,
          at: m.at,
          end_at: m.endAt,
          location: m.location,
          person: m.person,
          note: m.note,
        },
      ],
    },
  ],
  fromRows: (p): GeneralMeeting => ({
    id: str(p.id),
    title: str(p.title),
    at: ts(p.at),
    endAt: ts(p.end_at),
    location: str(p.location),
    person: str(p.person),
    note: str(p.note),
  }),
}

const tourMapping: Mapping<Tour> = {
  table: 'tours',
  children: [{ table: 'tour_stops', fk: 'tour_id' }],
  toRows: (t) => [
    {
      table: 'tours',
      rows: [{ id: t.id, day_key: t.dayKey, depart_at: t.departAt }],
    },
    {
      table: 'tour_stops',
      rows: t.farmIds.map((entityId, position) => ({
        tour_id: t.id,
        entity_id: entityId,
        position,
      })),
    },
  ],
  fromRows: (p, kids): Tour => ({
    id: str(p.id),
    dayKey: day(p.day_key),
    departAt: ts(p.depart_at),
    farmIds: ordered(kids.tour_stops).map((r) => str(r.entity_id)),
  }),
}

// ===========================================================================

/**
 * The registry, keyed by the collection names `store.ts` reports changes in.
 * Its iteration order is `COLLECTIONS`' order, which is FK-safe for hydration
 * and for a first write into an empty database.
 */
export const MAPPINGS: { [K in Collection]: Mapping<StoreData[K][number]> } = {
  farms: farmMapping,
  farmZones: farmZoneMapping,
  anchorPoints: anchorMapping,
  threatZones: threatZoneMapping,
  threatVectors: threatVectorMapping,
  volunteers: volunteerMapping,
  drivers: driverMapping,
  missions: missionMapping,
  incidents: incidentMapping,
  farmVisits: farmVisitMapping,
  generalMeetings: generalMeetingMapping,
  tours: tourMapping,
}

/** Every table an aggregate of this collection lives in, parent first. */
export function tablesOf(collection: Collection): string[] {
  const mapping = MAPPINGS[collection] as Mapping<unknown>
  return [mapping.table, ...mapping.children.map((c) => c.table)]
}
