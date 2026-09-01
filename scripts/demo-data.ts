import { COLLECTIONS } from '../src/core/backend'
import type { Collection, StoreData } from '../src/core/backend'
import { atTime, hoursFromNow, iso, localDayKey, now, startOfDay } from '../src/core/clock'
import { DEMO_BACKEND } from '../src/core/demo'
import { ringAreaDunams } from '../src/core/geo'
import { placeholderPhoto } from '../src/core/photo'
import type { AnchorPoint, Farm, FarmZone, LatLng } from '../src/core/types'
import { MAPPINGS } from '../src/data/rows'
import type { Mapping, Row } from '../src/data/rows'

/**
 * ORDRE DE NUIT 2026-09-02 (N3) — THE DEMO DATASET, AND HOW IT IS MARKED.
 *
 * ★ EVERY DEMO ID BEGINS `demo-`. That is the marker, the whole of it, and it
 *   is documented here and in ETAT: entities `demo-farm-01`, zones
 *   `demo-zone-…`, volunteers `demo-vol-…`, guards `demo-mission-…`, and so
 *   on for all twelve aggregates. Every child row hangs off one of them by a
 *   foreign key declared `on delete cascade`, so the purge is twelve
 *   statements of the form `delete from <parent> where id like 'demo-%'` and
 *   nothing else — the product owner's own test farm (`farm-mth9x977-2`) and
 *   anything he creates from now on carry ids minted by `nextId`, which never
 *   produces that prefix.
 *
 * ★ IT IS THE POC'S OWN FIXTURES, RE-KEYED — the twelve Negev farms and two
 *   moshavim with their drawn ground, guard posts, threat layer, guards past
 *   and planned, incidents, visits and meetings, all relative to NOW so
 *   "tonight's guard" is tonight on the morning of the demo — plus what the
 *   night order asked for on top: four entities in the north for the national
 *   view (one of them at בית שאן, the town he could not type), zones on nine
 *   entities, guard posts on more of them, a volunteer roster cut to fifty-six
 *   with the right mix, portraits on every entity, and a second saved tour.
 *
 * ★ PHOTOS ARE DATA URIs, NOT BUCKET OBJECTS — the decision is written out.
 *   `core/photo.ts` has always carried "a data URI today, an object key
 *   tomorrow", and every reader passes a photo through `isObjectKey`. Putting
 *   files into the private `photos` bucket needs a coordinator SESSION (the
 *   storage API, not SQL — the bytes live in S3), and no such session exists
 *   on this machine by design (ETAT §13, §14.4). The stylised initials
 *   portraits are generated locally, are obviously synthetic, and render
 *   identically; nothing in the purge has to look into the bucket.
 *
 * `demoData()` is what both the SQL emitter (`demo-seed.ts`) and the purge
 * gate (`demo.ts`) consume, so the database and the gate's fake database
 * hold the SAME rows.
 */

export const DEMO_PREFIX = 'demo-'

const ring = (center: LatLng, offsets: Array<[number, number]>): LatLng[] =>
  offsets.map(([dLat, dLng]) => ({
    lat: +(center.lat + dLat).toFixed(6),
    lng: +(center.lng + dLng).toFixed(6),
  }))

// --- The northern entities ------------------------------------------------

const ODEM: LatLng = { lat: 33.1936, lng: 35.7561 }
const RAMOT_NAFTALI: LatLng = { lat: 33.1103, lng: 35.5556 }
const EIN_HAROD: LatLng = { lat: 32.5569, lng: 35.3908 }

function northernFarms(): Farm[] {
  const at = (d: number, h: number) => atTime(d, h)
  return [
    {
      id: 'farm-n1',
      name: 'חוות בקר אודם',
      locality: 'אודם',
      region: 'רמת הגולן',
      type: 'livestock',
      entityKind: 'farm',
      status: 'active',
      position: ODEM,
      farmDunams: 0,
      grazingDunams: 0,
      farmDunamsManual: false,
      grazingDunamsManual: false,
      contacts: [
        { id: 'contact-n1a', name: 'יואב ברקאי', phone: '052-0003101', email: 'yoav.barkai@example.co.il', role: 'בעל החווה', photo: placeholderPhoto('contact-n1a', 'person'), isPrimary: true },
        { id: 'contact-n1b', name: 'נעמה ברקאי', phone: '054-0003102', email: '', role: 'מנהלת העדר', photo: null, isPrimary: false },
      ],
      commitments: [
        { kind: 'shelter', detail: 'חדר שומרים מחומם ליד הרפת', fulfilled: true },
        { kind: 'water', detail: 'ברז ומקרר במבנה', fulfilled: true },
      ],
      livestock: [
        { kind: 'cattle', label: '', heads: 340 },
        { kind: 'other', label: 'סוסים', heads: 6 },
      ],
      agreements: [{ id: 'agr-n1', signedAt: at(-40, 11), signedBy: 'יואב ברקאי', fileName: 'הסכם — חוות בקר אודם.pdf', signature: null }],
      notes: 'עדר בקר לבשר על הרמה; גניבות בקר בחורף 2025. גישה מכביש 978.',
      lastVisitAt: at(-12, 10),
      nextVisitAt: at(9, 10),
      photo: placeholderPhoto('farm-n1', 'place'),
    },
    {
      id: 'farm-n2',
      name: 'מושב רמות נפתלי',
      locality: 'רמות נפתלי',
      region: 'הגליל העליון',
      type: 'mixed',
      entityKind: 'moshav',
      status: 'signed',
      position: RAMOT_NAFTALI,
      farmDunams: 0,
      grazingDunams: 0,
      farmDunamsManual: false,
      grazingDunamsManual: false,
      contacts: [
        { id: 'contact-n2a', name: 'אלון שגב', phone: '050-0003201', email: 'alon.segev@example.co.il', role: 'רבש"ץ', photo: placeholderPhoto('contact-n2a', 'person'), isPrimary: true },
      ],
      commitments: [{ kind: 'food', detail: 'ארוחת ערב בחדר האוכל', fulfilled: false }],
      livestock: [
        { kind: 'cattle', label: '', heads: 120 },
        { kind: 'sheep', label: '', heads: 260 },
      ],
      agreements: [{ id: 'agr-n2', signedAt: at(-6, 18), signedBy: 'אלון שגב', fileName: 'הסכם — מושב רמות נפתלי.pdf', signature: null }],
      notes: 'שטחי מרעה בין המושב לגבול. הרבש"ץ מבקש שמירה בסופי שבוע בלבד.',
      lastVisitAt: at(-6, 18),
      nextVisitAt: at(2, 17),
      photo: placeholderPhoto('farm-n2', 'place'),
    },
    {
      id: 'farm-n3',
      name: 'חוות עמק בית שאן',
      locality: 'בית שאן',
      region: 'עמק בית שאן',
      type: 'agriculture',
      entityKind: 'farm',
      status: 'visited',
      position: { lat: 32.4842, lng: 35.5217 },
      farmDunams: 610,
      grazingDunams: 0,
      farmDunamsManual: true,
      grazingDunamsManual: false,
      contacts: [
        { id: 'contact-n3a', name: 'רחל אביטן', phone: '053-0003301', email: 'rachel.avitan@example.co.il', role: 'בעלת החווה', photo: null, isPrimary: true },
        { id: 'contact-n3b', name: 'עידן אביטן', phone: '058-0003302', email: 'idan.avitan@example.co.il', role: 'בן', photo: placeholderPhoto('contact-n3b', 'person'), isPrimary: false },
      ],
      commitments: [],
      livestock: [{ kind: 'poultry', label: '', heads: 4000 }],
      agreements: [],
      notes: 'מטעי תמרים ולולים. ביקור ראשון נערך; ממתינים לתשובת המשפחה.',
      lastVisitAt: at(-3, 16),
      nextVisitAt: at(1, 16),
      photo: placeholderPhoto('farm-n3', 'place'),
    },
    {
      id: 'farm-n4',
      name: 'חוות עין חרוד',
      locality: 'עין חרוד',
      region: 'עמק יזרעאל',
      type: 'livestock',
      entityKind: 'farm',
      status: 'contacted',
      position: EIN_HAROD,
      farmDunams: 280,
      grazingDunams: 1900,
      farmDunamsManual: true,
      grazingDunamsManual: true,
      contacts: [
        { id: 'contact-n4a', name: 'גיל מור', phone: '052-0003401', email: 'gil.mor@example.co.il', role: 'מנהל הרפת', photo: placeholderPhoto('contact-n4a', 'person'), isPrimary: true },
      ],
      commitments: [],
      livestock: [{ kind: 'goats', label: '', heads: 450 }],
      agreements: [],
      notes: 'שיחת טלפון ראשונה — מעוניינים, מבקשים ביקור אחרי החגים.',
      lastVisitAt: null,
      nextVisitAt: at(12, 11),
      photo: placeholderPhoto('farm-n4', 'place'),
    },
  ]
}

function northernZones(): FarmZone[] {
  return [
    {
      id: 'zone-n1a',
      farmId: 'farm-n1',
      kind: 'farm_boundary',
      ring: ring(ODEM, [
        [0.0024, -0.0031],
        [0.0031, 0.0018],
        [0.0004, 0.0036],
        [-0.0026, 0.0022],
        [-0.0028, -0.0021],
      ]),
    },
    {
      id: 'zone-n1b',
      farmId: 'farm-n1',
      kind: 'grazing_area',
      ring: ring(ODEM, [
        [-0.0026, 0.0022],
        [0.0004, 0.0036],
        [0.0062, 0.0121],
        [0.0018, 0.0214],
        [-0.0117, 0.0176],
        [-0.0151, 0.0068],
      ]),
    },
    {
      id: 'zone-n2a',
      farmId: 'farm-n2',
      kind: 'farm_boundary',
      ring: ring(RAMOT_NAFTALI, [
        [0.0019, -0.0024],
        [0.0026, 0.0017],
        [-0.0008, 0.0029],
        [-0.0024, 0.0008],
        [-0.0017, -0.0021],
      ]),
    },
    {
      id: 'zone-n2b',
      farmId: 'farm-n2',
      kind: 'grazing_area',
      ring: ring(RAMOT_NAFTALI, [
        [0.0026, 0.0017],
        [0.0091, 0.0064],
        [0.0074, 0.0168],
        [-0.0032, 0.0151],
        [-0.0008, 0.0029],
      ]),
    },
  ]
}

/** Two more Negev farms get drawn ground, so nine entities carry zones. */
function extraNegevZones(farms: Farm[]): FarmZone[] {
  const by = (id: string) => farms.find((f) => f.id === id)!.position
  return [
    {
      id: 'zone-x1',
      farmId: 'farm-05',
      kind: 'farm_boundary',
      ring: ring(by('farm-05'), [
        [0.0021, -0.0019],
        [0.0024, 0.0016],
        [-0.0004, 0.0027],
        [-0.0022, 0.0012],
        [-0.0019, -0.0017],
      ]),
    },
    {
      id: 'zone-x2',
      farmId: 'farm-09',
      kind: 'farm_boundary',
      ring: ring(by('farm-09'), [
        [0.0035, -0.0028],
        [0.0038, 0.0029],
        [-0.0006, 0.0041],
        [-0.0033, 0.0018],
        [-0.0029, -0.0024],
      ]),
    },
    {
      id: 'zone-x3',
      farmId: 'farm-09',
      kind: 'grazing_area',
      ring: ring(by('farm-09'), [
        [-0.0033, 0.0018],
        [-0.0006, 0.0041],
        [0.0031, 0.0132],
        [-0.0064, 0.0171],
        [-0.0118, 0.0083],
      ]),
    },
  ]
}

function extraAnchors(): AnchorPoint[] {
  return [
    {
      id: 'anchor-x1',
      farmId: 'farm-04',
      name: 'שער המטע',
      position: { lat: 30.9841, lng: 34.7081 },
      instructions: ['ביגוד ארוך, נעליים סגורות.', 'פנס ראש; אין תאורה במטע.'],
      accessDescription: 'מכביש 40 פנייה מערבה בשלט "אשלים". אחרי 2 ק״מ שער ברזל ירוק; המפגש ליד מיכל המים.',
    },
    {
      id: 'anchor-x2',
      farmId: 'farm-13',
      name: 'מגדל המים — כניסה דרומית',
      position: { lat: 31.0498, lng: 34.6841 },
      instructions: ['שתי יחידות קשר.', 'דיווח מיקום לרכז בכל שעה עגולה.'],
      accessDescription: 'כניסה דרומית למושב, ימינה אחרי המזכירות עד מגדל המים.',
    },
    {
      id: 'anchor-n1',
      farmId: 'farm-n1',
      name: 'הרפת הצפונית',
      position: { lat: 33.1958, lng: 35.7589 },
      instructions: ['ביגוד חם — קר בלילה על הרמה.', 'לא להתקרב לעדר בחשכה.'],
      accessDescription: 'מכביש 978 פנייה לאודם, ישר עד הרפת הגדולה. חניה ליד הסככה.',
    },
    {
      id: 'anchor-n2',
      farmId: 'farm-n2',
      name: 'שער המרעה המזרחי',
      position: { lat: 33.1121, lng: 35.5602 },
      instructions: ['אפוד זוהר.', 'טלפון הקבוצה דלוק כל הלילה.'],
      accessDescription: 'מהשער הראשי של המושב, דרך העפר מזרחה 900 מטר עד שער הבקר.',
    },
  ]
}

// --- Re-keying ------------------------------------------------------------

/** Every id in the snapshot, parents and children alike. */
function collectIds(data: StoreData): Set<string> {
  const ids = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (k === 'id' && typeof val === 'string') ids.add(val)
        walk(val)
      }
    }
  }
  for (const c of COLLECTIONS) walk(data[c])
  return ids
}

/**
 * Prefix every id, wherever it appears — the aggregate's own `id`, and every
 * reference to it (`farmId`, `volunteerId`, `passengerVolunteerIds`,
 * `farmIds`, `missionId`, `anchorPointId`, `reporterId`, …). Done on the
 * JSON text with the ids as QUOTED tokens, so `farm-01` can never touch
 * `farm-010`; `vol-001@example.co.il` (an email, unquoted as a token) is
 * left alone and rewritten explicitly below.
 */
function rekey(data: StoreData): StoreData {
  const ids = [...collectIds(data)].sort((a, b) => b.length - a.length)
  let text = JSON.stringify(data)
  for (const id of ids) {
    text = text.split(`"${id}"`).join(`"${DEMO_PREFIX}${id}"`)
  }
  return JSON.parse(text) as StoreData
}

// --- The dataset -----------------------------------------------------------

export function demoData(): StoreData {
  const base = DEMO_BACKEND.seed()

  // 1. The north joins the Negev.
  base.farms = [...base.farms, ...northernFarms()]
  base.farmZones = [...base.farmZones, ...northernZones(), ...extraNegevZones(base.farms)]
  base.anchorPoints = [...base.anchorPoints, ...extraAnchors()]

  // Zone sums, for the entities whose ground was just drawn.
  for (const farm of base.farms) {
    const zones = base.farmZones.filter((z) => z.farmId === farm.id)
    const sum = (kind: FarmZone['kind']) => {
      const of = zones.filter((z) => z.kind === kind)
      return of.length ? Math.round(of.reduce((s, z) => s + ringAreaDunams(z.ring), 0)) : null
    }
    const b = sum('farm_boundary')
    const g = sum('grazing_area')
    if (!farm.farmDunamsManual && b !== null) farm.farmDunams = b
    if (!farm.grazingDunamsManual && g !== null) farm.grazingDunams = g
  }

  // 2. Portraits everywhere a sheet would otherwise show initials.
  for (const farm of base.farms) {
    farm.photo ??= placeholderPhoto(farm.id, 'place')
    for (const c of farm.contacts) c.photo ??= c.isPrimary ? placeholderPhoto(c.id, 'person') : c.photo
    for (const c of farm.contacts) {
      if (!c.email) c.email = `${c.id.replace(/[^a-z0-9]/gi, '')}@example.co.il`
    }
  }

  // 3. Fifty-six volunteers: everyone a guard or a driver refers to, then the
  //    next by id — the fixtures are already a mix of phones, licences, cars,
  //    yeshivot and towns, and the first rows carry the richest notes.
  const referenced = new Set<string>()
  for (const m of base.missions) {
    for (const a of m.assignments) referenced.add(a.volunteerId)
    for (const d of m.drivers) d.passengerVolunteerIds.forEach((v) => referenced.add(v))
  }
  for (const d of base.drivers) if (d.volunteerId) referenced.add(d.volunteerId)
  for (const i of base.incidents) if (i.reporterId) referenced.add(i.reporterId)
  const kept = base.volunteers.filter((v) => referenced.has(v.id))
  for (const v of base.volunteers) {
    if (kept.length >= 56) break
    if (!referenced.has(v.id)) kept.push(v)
  }
  base.volunteers = kept
  // Some northern volunteers, so the national map has people in the north.
  const northTowns: Array<[string, string]> = [
    ['קרית שמונה', 'ישיבת ההסדר קרית שמונה'],
    ['צפת', 'ישיבת צפת'],
    ['טבריה', 'ישיבת ההסדר טבריה'],
    ['מעלות', 'ישיבת מעלות'],
    ['בית שאן', 'ישיבת ההסדר בית שאן'],
    ['עפולה', 'ישיבת עפולה'],
  ]
  base.volunteers.slice(-6).forEach((v, i) => {
    v.locality = northTowns[i][0]
    v.yeshiva = northTowns[i][1]
  })
  // Two drivers in the north as well.
  base.drivers = base.drivers.slice(0, 8)
  base.drivers[6].locality = 'קרית שמונה'
  base.drivers[7].locality = 'בית שאן'

  // 4. Two more visits on the days the demo will be shown, both in the north
  //    and one of them at בית שאן — the town the product owner could not type.
  base.farmVisits.push(
    { id: 'visit-demo-1', farmId: 'farm-n3', at: atTime(1, 16, 0), note: 'ביקור שני — חתימה על ההסכם עם המשפחה', done: false },
    { id: 'visit-demo-2', farmId: 'farm-n2', at: atTime(2, 17, 30), note: 'סיור בשטחי המרעה עם הרבש"ץ', done: false },
  )
  base.generalMeetings.push({
    id: 'meet-demo-1',
    title: 'פגישה עם מנהל תוכנית הנוער — מועצה אזורית רמת נגב',
    at: atTime(1, 10, 0),
    endAt: atTime(1, 11, 0),
    location: 'משרדי המועצה, מרכז רמת נגב',
    person: 'איתי לוי',
    note: 'תיאום גיוס מתנדבים מהישיבה התיכונית',
  })

  // 5. A second saved tour, for tomorrow — three Negev stops.
  const tomorrow = startOfDay(1)
  base.tours.push({
    id: 'tour-tomorrow',
    dayKey: localDayKey(tomorrow),
    departAt: atTime(1, 8, 0),
    farmIds: ['farm-04', 'farm-13', 'farm-01'],
  })

  // 6. A guard in the north, completed last week, so the northern entities
  //    have history behind their numbers.
  const first = base.missions.find((m) => m.status === 'completed')
  if (first) {
    const clone = JSON.parse(JSON.stringify(first)) as typeof first
    clone.id = 'mission-n1'
    clone.farmId = 'farm-n1'
    clone.anchorPointId = 'anchor-n1'
    clone.additionalAnchorPointIds = []
    clone.pickupPoint = { lat: 33.2075, lng: 35.5697 }
    clone.dropoffPoint = { lat: 33.1958, lng: 35.7589 }
    clone.startAt = hoursFromNow(-24 * 6 - 3)
    clone.endAt = hoursFromNow(-24 * 6 + 5)
    clone.createdAt = hoursFromNow(-24 * 9)
    clone.assignments = clone.assignments.map((a, i) => ({ ...a, volunteerId: base.volunteers[base.volunteers.length - 1 - i].id }))
    clone.drivers = [{ driverId: base.drivers[6].id, passengerVolunteerIds: clone.assignments.map((a) => a.volunteerId), confirmed: true }]
    base.missions.push(clone)
  }

  // 6b. PHONES ARE UNIQUE PER TABLE IN THE SCHEMA (`volunteers_phone_digits`),
  //     and the fixtures — written for a mock store — reuse a few. Renumber
  //     inside the reserved 05X-000XXXX block, in roster order, and keep a
  //     dual-hat driver's number equal to his volunteer row's, which is what
  //     `updateDriver` mirrors anyway.
  const prefixes = ['052', '050', '054', '053', '058']
  base.volunteers.forEach((v, i) => {
    v.phone = `${prefixes[i % prefixes.length]}-000${String(1001 + i).padStart(4, '0')}`
  })
  base.drivers.forEach((d, i) => {
    const twin = d.volunteerId ? base.volunteers.find((v) => v.id === d.volunteerId) : null
    d.phone = twin ? twin.phone : `${prefixes[i % prefixes.length]}-000${String(2001 + i).padStart(4, '0')}`
  })

  // 7. ★ PORTRAITS AS MARKERS, NOT AS BYTES. Every photo becomes
  //    `placeholder:<person|place>:<seed>` — a 40-byte value the app turns back
  //    into the same stylised initials portrait on the device (`photoSource`
  //    in core/photo.ts). A data URI per portrait would have made the seed
  //    SQL 100 kB of SVG and put the same 1 kB in every hydration of every
  //    volunteer; the marker keeps both small and the pictures identical.
  for (const farm of base.farms) {
    farm.photo = `placeholder:place:${farm.id}`
    for (const c of farm.contacts) if (c.photo !== null) c.photo = `placeholder:person:${c.id}`
  }
  for (const v of base.volunteers) if (v.photo !== null) v.photo = `placeholder:person:${v.id}`
  for (const d of base.drivers) if (d.photo !== null) d.photo = `placeholder:person:${d.id}`

  return rekey(base)
}

// --- SQL --------------------------------------------------------------------

function literal(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (Array.isArray(v)) {
    // text[] / date[]: a Postgres array literal, each element quoted.
    return `'{${v.map((x) => `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}'`
  }
  return `'${String(v).replace(/'/g, "''")}'`
}

/** The whole dataset as INSERT statements, parents before children. */
export function demoSql(data: StoreData): string {
  const out: string[] = ['begin;']
  for (const collection of COLLECTIONS) {
    const mapping = MAPPINGS[collection] as Mapping<unknown>
    const byTable = new Map<string, Row[]>()
    for (const value of data[collection] as unknown[]) {
      for (const t of mapping.toRows(value)) {
        const list = byTable.get(t.table) ?? []
        list.push(...t.rows)
        byTable.set(t.table, list)
      }
    }
    for (const table of [mapping.table, ...mapping.children.map((c) => c.table)]) {
      const rows = byTable.get(table) ?? []
      if (rows.length === 0) continue
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
      const values = rows.map((r) => `(${columns.map((c) => literal(r[c])).join(', ')})`)
      out.push(`insert into ${table} (${columns.join(', ')}) values\n${values.join(',\n')};`)
    }
  }
  out.push('commit;')
  return out.join('\n')
}

/** The twelve statements that remove the dataset — parents only, children cascade. */
export function purgeSql(): string {
  return [...COLLECTIONS]
    .reverse()
    .map((c) => `delete from ${(MAPPINGS[c] as Mapping<unknown>).table} where id like '${DEMO_PREFIX}%';`)
    .join('\n')
}

export const DEMO_TABLES: string[] = COLLECTIONS.map((c) => (MAPPINGS[c] as Mapping<unknown>).table)

if (import.meta.main) {
  const data = demoData()
  const sql = demoSql(data)
  const target = process.argv[2] ?? 'demo-seed.sql'
  await Bun.write(target, sql)
  const counts = COLLECTIONS.map((c: Collection) => `${c}=${(data[c] as unknown[]).length}`).join(' ')
  console.log(`  ${counts}`)
  console.log(`  wrote ${target} (${sql.length} chars), generated ${iso(now())}`)
}
