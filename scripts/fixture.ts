import { COLLECTIONS } from '../src/core/backend'
import type { Collection, StoreChange, StoreData } from '../src/core/backend'
import { emptyData } from '../src/core/demo'

/**
 * A76's DATA — a whole programme in miniature, every id prefixed `a76-`.
 *
 * ★ WHY NOT THE DEMO FIXTURES. They are the right data for a round trip in
 *   MEMORY (A74 uses all 380 of them) and the wrong data for a round trip
 *   through a shared database: their ids are `farm-01`, `vol-001`, `mission-01`
 *   — exactly the ids a real import would use — so a gate that wrote them would
 *   be indistinguishable from real records the moment there are any, and a
 *   cleanup that deleted them would be indistinguishable from a catastrophe.
 *   Every id here begins `a76-`, which is what makes the cleanup at the end of
 *   the run a statement rather than a hope.
 *
 * ★ WHAT IT IS CHOSEN TO CONTAIN. Not "some data" — one instance of every shape
 *   that has its own table, its own column, or its own ordering rule:
 *     · a farm with TWO contacts (one primary), THREE commitments (whose ORDER
 *       is addressable data — `setCommitmentFulfilled` uses the index) and an
 *       agreement;
 *     · both kinds of zone, each a real ring;
 *     · two guard posts, so the mission can carry a rendezvous AND an extra
 *       position (F2);
 *     · a threat zone attached to a farm and a vector attached to NOTHING —
 *       the nullable FK that only G18 uses;
 *     · a volunteer who also drives (G5.2's dual hat) and one with a kosher
 *       phone (who cannot self-confirm, which is why the group phone exists);
 *     · a guard with TWO cars and their passenger lists (G5.3), presence marks
 *       on both legs from all three channels, and one deliberate DISAGREEMENT
 *       between driver and group — the mismatch the programme exists to catch;
 *     · all three outreach events, one of them not yet sent;
 *     · an incident with two entries, whose ids do not sort chronologically;
 *     · a tour with two stops in an order that is not alphabetical.
 */

const AT = '2026-08-31T04:58:00.000Z'
const LATER = '2026-08-31T05:12:00.000Z'

export function fixtureData(): StoreData {
  const data = emptyData()

  data.farms = [
    {
      id: 'a76-farm',
      name: 'חוות א76',
      locality: 'ירוחם',
      region: 'נגב מזרחי',
      type: 'livestock',
      entityKind: 'moshav',
      status: 'active',
      position: { lat: 30.9876, lng: 34.9321 },
      farmDunams: 412,
      grazingDunams: 3100,
      farmDunamsManual: true,
      grazingDunamsManual: false,
      contacts: [
        {
          id: 'a76-contact-1',
          name: 'משה כהן',
          phone: '052-0000001',
          email: 'moshe@example.test',
          role: 'בעל החווה',
          photo: 'entities/a76-farm/moshe.jpg',
          isPrimary: true,
        },
        {
          id: 'a76-contact-2',
          name: 'רות כהן',
          phone: '052-0000002',
          // '' means "no address", not "unknown" — P0bis.5a.
          email: '',
          role: 'רעייתו',
          photo: null,
          isPrimary: false,
        },
      ],
      commitments: [
        { kind: 'shelter', detail: 'קרוואן ליד הלול, 2 מיטות', fulfilled: true },
        { kind: 'water', detail: 'ברז בכניסה', fulfilled: false },
        { kind: 'food', detail: 'ארוחת בוקר', fulfilled: false },
      ],
      agreements: [
        {
          id: 'a76-agreement',
          signedAt: AT,
          signedBy: 'משה כהן',
          fileName: 'a76-farm/a76-agreement.pdf',
        },
      ],
      notes: 'שתי כניסות, הצפונית נעולה בלילה.',
      lastVisitAt: AT,
      nextVisitAt: LATER,
      photo: 'entities/a76-farm/gate.jpg',
    },
  ]

  data.farmZones = [
    {
      id: 'a76-zone-boundary',
      farmId: 'a76-farm',
      kind: 'farm_boundary',
      ring: [
        { lat: 30.985, lng: 34.93 },
        { lat: 30.99, lng: 34.93 },
        { lat: 30.99, lng: 34.936 },
        { lat: 30.985, lng: 34.936 },
      ],
    },
    {
      id: 'a76-zone-grazing',
      farmId: 'a76-farm',
      kind: 'grazing_area',
      ring: [
        { lat: 30.98, lng: 34.94 },
        { lat: 31.0, lng: 34.94 },
        { lat: 31.0, lng: 34.96 },
      ],
    },
  ]

  data.anchorPoints = [
    {
      id: 'a76-post-gate',
      farmId: 'a76-farm',
      name: 'השער הצפוני',
      position: { lat: 30.9895, lng: 34.9312 },
      instructions: ['אפוד זוהר', 'פנס', 'מים'],
      accessDescription: 'מכביש 204, פנייה מזרחה אחרי תחנת הדלק, 1.2 ק״מ.',
    },
    {
      id: 'a76-post-tower',
      farmId: 'a76-farm',
      name: 'מגדל המים',
      position: { lat: 30.9861, lng: 34.9348 },
      instructions: [],
      accessDescription: '',
    },
  ]

  data.threatZones = [
    {
      id: 'a76-threat',
      farmId: 'a76-farm',
      ring: [
        { lat: 30.975, lng: 34.945 },
        { lat: 30.982, lng: 34.945 },
        { lat: 30.982, lng: 34.955 },
      ],
      intensity: 'high',
      note: 'ואדי מזרחי — כניסות חוזרות.',
      updatedAt: AT,
    },
  ]
  data.threatVectors = [
    {
      // G18 — attached to NOTHING. The nullable foreign key, exercised.
      id: 'a76-vector',
      farmId: null,
      origin: { lat: 30.97, lng: 34.96 },
      target: { lat: 30.986, lng: 34.935 },
      intensity: 'medium',
      note: '',
      updatedAt: LATER,
    },
  ]

  data.volunteers = [
    {
      id: 'a76-vol-1',
      name: 'שמואל לוי',
      age: 21,
      phone: '053-0000001',
      phoneType: 'smartphone',
      email: 'shmuel@example.test',
      yeshiva: 'ישיבת ירוחם',
      locality: 'ירוחם',
      guardsCount: 14,
      status: 'active',
      inactiveReason: null,
      notes: '',
      lastActivityAt: AT,
      photo: 'volunteers/a76-vol-1/face.jpg',
      hasLicense: true,
      hasCar: true,
      // G5.2 — the dual hat; a76-drv-2 below is his driver row.
      canDrive: true,
      availability: { nights: true, days: false, weekends: true, excludedDates: ['2026-09-03'] },
    },
    {
      id: 'a76-vol-2',
      name: 'יוסי אברהם',
      age: 19,
      phone: '053-0000002',
      // A kosher phone cannot self-confirm, which is why a76-vol-1 carries the
      // group phone below.
      phoneType: 'kosher',
      email: '',
      yeshiva: 'ישיבת ירוחם',
      locality: 'דימונה',
      guardsCount: 0,
      status: 'active',
      inactiveReason: null,
      notes: '',
      lastActivityAt: null,
      photo: null,
      hasLicense: false,
      hasCar: false,
      canDrive: false,
      availability: { nights: true, days: true, weekends: true, excludedDates: [] },
    },
    {
      id: 'a76-vol-3',
      name: 'אליהו מזרחי',
      age: 24,
      phone: '053-0000003',
      phoneType: 'smartphone',
      email: '',
      yeshiva: '',
      locality: 'באר שבע',
      guardsCount: 3,
      status: 'inactive',
      inactiveReason: 'מילואים',
      notes: 'חוזר בחודש הבא',
      lastActivityAt: AT,
      photo: null,
      hasLicense: true,
      hasCar: false,
      canDrive: false,
      availability: { nights: false, days: true, weekends: false, excludedDates: [] },
    },
  ]

  data.drivers = [
    {
      id: 'a76-drv-1',
      name: 'אבי נהג',
      phone: '054-0000001',
      email: 'avi@example.test',
      vehicle: 'טרנזיט',
      seats: 8,
      locality: 'באר שבע',
      photo: null,
      availabilityNote: 'א׳–ה׳ בערב',
      notes: '',
      volunteerId: null,
    },
    {
      id: 'a76-drv-2',
      name: 'שמואל לוי',
      phone: '053-0000001',
      email: 'shmuel@example.test',
      vehicle: '',
      seats: 4,
      locality: 'ירוחם',
      photo: 'volunteers/a76-vol-1/face.jpg',
      availabilityNote: '',
      notes: '',
      // G5.2 — one human, two roster rows.
      volunteerId: 'a76-vol-1',
    },
  ]

  data.missions = [
    {
      id: 'a76-mission',
      farmId: 'a76-farm',
      anchorPointId: 'a76-post-gate',
      // F2 — the group moves to the water tower for the second half.
      additionalAnchorPointIds: ['a76-post-tower'],
      pickupPoint: { lat: 31.2591, lng: 34.7938 },
      dropoffPoint: { lat: 30.9901, lng: 34.9299 },
      returnPickupPoint: null,
      returnDropoffPoint: null,
      startAt: AT,
      endAt: LATER,
      status: 'in_progress',
      requiredVolunteers: 4,
      assignments: [
        {
          volunteerId: 'a76-vol-1',
          isGroupPhone: true,
          outbound: { driver: 'present', group: 'present', self: 'present' },
          inbound: { driver: 'present', group: 'present', self: null },
        },
        {
          volunteerId: 'a76-vol-2',
          isGroupPhone: false,
          // ★ THE DISAGREEMENT. The driver says he has him, the group holder
          //   says he does not. R6 stores both and raises a mismatch rather
          //   than picking a winner — so the two rows must not merge on the way
          //   through Postgres, which is what this asserts.
          outbound: { driver: 'present', group: 'absent', self: null },
          inbound: { driver: null, group: null, self: null },
        },
        {
          volunteerId: 'a76-vol-3',
          isGroupPhone: false,
          outbound: { driver: null, group: 'present', self: null },
          inbound: { driver: null, group: null, self: null },
        },
      ],
      drivers: [
        {
          driverId: 'a76-drv-1',
          passengerVolunteerIds: ['a76-vol-2', 'a76-vol-3'],
          confirmed: true,
        },
        {
          driverId: 'a76-drv-2',
          passengerVolunteerIds: ['a76-vol-1'],
          confirmed: false,
        },
      ],
      arrivalConfirmedAt: AT,
      endConfirmedAt: null,
      createdAt: AT,
      droppedOffAt: AT,
      pickedUpAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelReason: null,
      cancelNote: '',
      outreach: [
        { event: 'created', recipientKind: 'volunteer', recipientId: 'a76-vol-1', sentAt: AT },
        { event: 'updated', recipientKind: 'driver', recipientId: 'a76-drv-1', sentAt: LATER },
        // Not yet sent: `sentAt: null` is a legal, meaningful row.
        { event: 'cancelled', recipientKind: 'farmer', recipientId: 'a76-contact-1', sentAt: null },
      ],
      reactivatedAt: null,
    },
  ]

  data.incidents = [
    {
      id: 'a76-incident',
      farmId: 'a76-farm',
      missionId: 'a76-mission',
      source: 'volunteer',
      reporterId: 'a76-vol-1',
      reporterName: 'שמואל לוי',
      severity: 'urgent',
      description: 'שני רכבים על הדרך החקלאית המזרחית.',
      position: { lat: 30.9812, lng: 34.9441 },
      reportedAt: AT,
      resolved: false,
      entries: [
        // The ids deliberately do NOT sort chronologically: `a76-ent-11` sorts
        // before `a76-ent-2` lexicographically, which is why the row carries a
        // position and the reader uses it.
        { id: 'a76-ent-11', at: AT, author: 'שמואל לוי', text: 'דיווח ראשוני' },
        { id: 'a76-ent-2', at: LATER, author: 'דוד לוי', text: 'הועבר למוקד' },
      ],
    },
  ]

  data.farmVisits = [
    { id: 'a76-visit-past', farmId: 'a76-farm', at: AT, note: 'סיור ראשון', done: true },
    { id: 'a76-visit-next', farmId: 'a76-farm', at: LATER, note: '', done: false },
  ]

  data.generalMeetings = [
    {
      id: 'a76-meeting',
      title: 'פגישה עם המועצה',
      at: AT,
      endAt: LATER,
      location: 'ירוחם',
      person: 'ראש המועצה',
      note: '',
    },
  ]

  data.tours = [
    {
      id: 'a76-tour',
      dayKey: '2026-09-01',
      departAt: AT,
      // Not alphabetical: the stop order is the route, and it is data.
      farmIds: ['a76-farm'],
    },
  ]

  return data
}

/** The whole fixture as the changes the app's own writer takes. */
export function fixtureChanges(): StoreChange[] {
  const data = fixtureData()
  const changes: StoreChange[] = []
  for (const collection of COLLECTIONS) {
    for (const row of data[collection] as Array<{ id: string }>) {
      changes.push({ collection, id: row.id, json: JSON.stringify(row) })
    }
  }
  return changes
}

/** The same aggregates, as deletions. */
export function fixtureDeletions(): StoreChange[] {
  return fixtureChanges().map((c) => ({ ...c, json: null }))
}

/** Everything with an `a76-` id in a snapshot — the gate's own footprint. */
export function ownRows(data: StoreData): Record<Collection, unknown[]> {
  const out = {} as Record<Collection, unknown[]>
  for (const collection of COLLECTIONS) {
    out[collection] = (data[collection] as Array<{ id: string }>).filter((r) =>
      r.id.startsWith('a76-'),
    )
  }
  return out
}
