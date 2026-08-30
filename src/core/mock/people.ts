import { DAY, iso, now } from '../clock'
import { placeholderPhoto, seedHasPhoto } from '../photo'
import type { Driver, Volunteer } from '../types'
import { generateVolunteers } from './generate'

export const YESHIVOT = [
  'ישיבת הר עציון',
  'ישיבת שדרות',
  'ישיבת ההסדר באר שבע',
  'ישיבת נווה דקלים',
] as const

/**
 * Last-activity stamp for the 25 hand-written volunteers. Spread over the
 * last ~7 weeks so the roster's "last activity" column sorts meaningfully.
 */
const seedActivity = (n: number): string =>
  iso(new Date(now().getTime() - (n * 2 + 1) * DAY - n * 3_600_000))

/**
 * The 25 hand-written volunteers. These are the ones missions reference by
 * id, so their details are authored rather than generated — a demo needs
 * believable people at the centre of it.
 */
/** Literal fixtures predate G5/G3; the new fields are hydrated below. */
type VolunteerSeed = Omit<
  Volunteer,
  'hasLicense' | 'hasCar' | 'canDrive' | 'availability' | 'email'
>

const NAMED_SEEDS: VolunteerSeed[] = [
  {
    id: 'vol-001',
    name: 'אריאל כהן',
    age: 21,
    phone: '052-0000018',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[0],
    locality: 'אלון שבות',
    guardsCount: 24,
    status: 'active',
    inactiveReason: null,
    notes: 'אחראי קבוצה ותיק. מכיר את כל עמדות השמירה ברמת נגב.',
    lastActivityAt: seedActivity(1),
    photo: null,
  },
  {
    id: 'vol-002',
    name: 'נתנאל בר־און',
    age: 20,
    phone: '053-0000019',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[0],
    locality: 'אלון שבות',
    guardsCount: 17,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(2),
    photo: null,
  },
  {
    id: 'vol-003',
    name: 'שמואל וייס',
    age: 22,
    phone: '050-0000020',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[0],
    locality: 'אפרת',
    guardsCount: 31,
    status: 'active',
    inactiveReason: null,
    notes: 'חובש מוסמך.',
    lastActivityAt: seedActivity(3),
    photo: null,
  },
  {
    id: 'vol-004',
    name: 'איתמר לוי',
    age: 19,
    phone: '054-0000021',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[0],
    locality: 'ירושלים',
    guardsCount: 8,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(4),
    photo: null,
  },
  {
    id: 'vol-005',
    name: 'יהודה מזרחי',
    age: 23,
    phone: '058-0000022',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[0],
    locality: 'ירושלים',
    guardsCount: 12,
    status: 'inactive',
    inactiveReason: 'גיוס לשירות מילואים ממושך',
    notes: 'לחזור אליו בסוף הזמן.',
    lastActivityAt: seedActivity(5),
    photo: null,
  },
  {
    id: 'vol-006',
    name: 'אלחנן שפירא',
    age: 20,
    phone: '052-0000023',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[0],
    locality: 'מעלה אדומים',
    guardsCount: 15,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(6),
    photo: null,
  },
  {
    id: 'vol-007',
    name: 'דביר אזולאי',
    age: 21,
    phone: '050-0000024',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[1],
    locality: 'שדרות',
    guardsCount: 28,
    status: 'active',
    inactiveReason: null,
    notes: 'אחראי קבוצה. נהג מלווה בשעת הצורך.',
    lastActivityAt: seedActivity(7),
    photo: null,
  },
  {
    id: 'vol-008',
    name: 'מאיר בוזגלו',
    age: 22,
    phone: '053-0000025',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[1],
    locality: 'שדרות',
    guardsCount: 19,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(8),
    photo: null,
  },
  {
    id: 'vol-009',
    name: 'עמיחי דהן',
    age: 19,
    phone: '054-0000026',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[1],
    locality: 'נתיבות',
    guardsCount: 6,
    status: 'active',
    inactiveReason: null,
    notes: 'התנדבות ראשונה בחודש שעבר.',
    lastActivityAt: seedActivity(9),
    photo: null,
  },
  {
    id: 'vol-010',
    name: 'ישי אוחנה',
    age: 24,
    phone: '052-0000027',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[1],
    locality: 'אופקים',
    guardsCount: 22,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(10),
    photo: null,
  },
  {
    id: 'vol-011',
    name: 'הלל טולדנו',
    age: 20,
    phone: '058-0000028',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[1],
    locality: 'שדרות',
    guardsCount: 9,
    status: 'inactive',
    inactiveReason: 'סיים לימודים ועבר לישיבה אחרת',
    notes: '',
    lastActivityAt: seedActivity(11),
    photo: null,
  },
  {
    id: 'vol-012',
    name: 'שילה אברהמי',
    age: 21,
    phone: '050-0000029',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[1],
    locality: 'נתיבות',
    guardsCount: 14,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(12),
    photo: null,
  },
  {
    id: 'vol-013',
    name: 'אורי מלכה',
    age: 22,
    phone: '052-0000030',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[2],
    locality: 'באר שבע',
    guardsCount: 35,
    status: 'active',
    inactiveReason: null,
    notes: 'הוותיק בקבוצה. איש קשר מול נהגים.',
    lastActivityAt: seedActivity(13),
    photo: null,
  },
  {
    id: 'vol-014',
    name: 'רועי סבן',
    age: 20,
    phone: '054-0000031',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[2],
    locality: 'באר שבע',
    guardsCount: 21,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(14),
    photo: null,
  },
  {
    id: 'vol-015',
    name: 'בניה חדד',
    age: 19,
    phone: '053-0000032',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[2],
    locality: 'להבים',
    guardsCount: 5,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(15),
    photo: null,
  },
  {
    id: 'vol-016',
    name: 'תומר אליהו',
    age: 23,
    phone: '050-0000033',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[2],
    locality: 'עומר',
    guardsCount: 27,
    status: 'active',
    inactiveReason: null,
    notes: 'רישיון לנשק, מאושר על ידי קב״ט האזור.',
    lastActivityAt: seedActivity(16),
    photo: null,
  },
  {
    id: 'vol-017',
    name: 'ידידיה כרמי',
    age: 21,
    phone: '058-0000034',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[2],
    locality: 'באר שבע',
    guardsCount: 11,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(17),
    photo: null,
  },
  {
    id: 'vol-018',
    name: 'אבישי גבאי',
    age: 20,
    phone: '052-0000035',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[2],
    locality: 'מיתר',
    guardsCount: 16,
    status: 'inactive',
    inactiveReason: 'פציעה בברך, בשיקום',
    notes: 'ביקש לחזור בעוד חודשיים.',
    lastActivityAt: seedActivity(18),
    photo: null,
  },
  {
    id: 'vol-019',
    name: 'ראובן שטרן',
    age: 22,
    phone: '054-0000036',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[3],
    locality: 'אשקלון',
    guardsCount: 20,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(19),
    photo: null,
  },
  {
    id: 'vol-020',
    name: 'נדב פרידמן',
    age: 21,
    phone: '050-0000037',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[3],
    locality: 'אשקלון',
    guardsCount: 26,
    status: 'active',
    inactiveReason: null,
    notes: 'אחראי קבוצה.',
    lastActivityAt: seedActivity(20),
    photo: null,
  },
  {
    id: 'vol-021',
    name: 'עידו ברקוביץ',
    age: 19,
    phone: '053-0000038',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[3],
    locality: 'ניצן',
    guardsCount: 4,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(21),
    photo: null,
  },
  {
    id: 'vol-022',
    name: 'צבי הרשקוביץ',
    age: 24,
    phone: '052-0000039',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[3],
    locality: 'אשדוד',
    guardsCount: 30,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(22),
    photo: null,
  },
  {
    id: 'vol-023',
    name: 'מנחם קליין',
    age: 20,
    phone: '058-0000040',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[3],
    locality: 'אשקלון',
    guardsCount: 13,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(23),
    photo: null,
  },
  {
    id: 'vol-024',
    name: 'אלישע רוזן',
    age: 22,
    phone: '054-0000041',
    phoneType: 'kosher',
    yeshiva: YESHIVOT[3],
    locality: 'ניצן',
    guardsCount: 7,
    status: 'inactive',
    inactiveReason: 'אילוצי לימודים — זמין שוב בזמן קיץ',
    notes: '',
    lastActivityAt: seedActivity(24),
    photo: null,
  },
  {
    id: 'vol-025',
    name: 'שמעון גולד',
    age: 21,
    phone: '050-0000042',
    phoneType: 'smartphone',
    yeshiva: YESHIVOT[0],
    locality: 'אפרת',
    guardsCount: 18,
    status: 'active',
    inactiveReason: null,
    notes: '',
    lastActivityAt: seedActivity(25),
    photo: null,
  },
]

/**
 * 300 volunteers total: the 25 above plus 275 generated (R4).
 * The roster has to be big enough to prove the virtualised table stays
 * smooth, and deterministic so it is identical on every reload.
 */
/**
 * G5.2 — three of the named volunteers double as drivers (licence + car +
 * agreement), so the dual hat is visible on people the demo actually shows.
 */
const CAN_DRIVE_IDS = new Set(['vol-004', 'vol-009', 'vol-014'])
const HAS_LICENSE_IDS = new Set([
  ...CAN_DRIVE_IDS,
  'vol-002',
  'vol-006',
  'vol-011',
  'vol-017',
])

/**
 * P0bis.5a — WHO HAS AN EMAIL ADDRESS, AND WHY IT MATTERS THAT SOME DO NOT.
 *
 * The sending centre picks a channel per person, and its whole point is that
 * the three channels are not interchangeable. A fixture where everybody has an
 * address would demo beautifully and hide the case that actually occurs: a
 * yeshiva student with a kosher phone, no smartphone, and no address either —
 * for whom the only channel is an SMS, grouped with the other kosher phones.
 *
 * So: smartphone holders nearly all have one, kosher-phone holders rarely do.
 * Deterministic from the id, because a fixture that changes between runs makes
 * a verification script flaky rather than thorough.
 */
const seedEmail = (id: string, phoneType: string): string => {
  const n = Number(id.replace(/\D/g, '')) || 0
  const has = phoneType === 'smartphone' ? n % 8 !== 0 : n % 5 === 0
  return has ? `${id}@example.co.il` : ''
}

const NAMED_VOLUNTEERS: Volunteer[] = NAMED_SEEDS.map((seed) => ({
  ...seed,
  email: seedEmail(seed.id, seed.phoneType),
  hasLicense: HAS_LICENSE_IDS.has(seed.id),
  hasCar: CAN_DRIVE_IDS.has(seed.id),
  canDrive: CAN_DRIVE_IDS.has(seed.id),
  availability: {
    nights: true,
    days: true,
    weekends: seed.id !== 'vol-006',
    excludedDates: [],
  },
}))

export const VOLUNTEERS: Volunteer[] = [
  ...NAMED_VOLUNTEERS,
  ...generateVolunteers(275, YESHIVOT, NAMED_VOLUNTEERS.length),
]

export const DRIVERS: Driver[] = [
  {
    id: 'drv-01',
    email: 'drv-01@example.co.il',
    name: 'חיים סויסה',
    phone: '052-0000043',
    vehicle: 'טרנזיט לבן, 88-441-02',
    seats: 8,
    locality: 'באר שבע',
    photo: null,
    availabilityNote: 'זמין רוב הערבים, עדיף תיאום יום מראש.',
    notes: '',
    volunteerId: null,
  },
  {
    id: 'drv-02',
    email: 'drv-02@example.co.il',
    name: 'ניסים אמסלם',
    phone: '050-0000044',
    vehicle: 'קאדי אפור, 61-903-77',
    seats: 6,
    locality: 'אופקים',
    photo: null,
    availabilityNote: "א׳–ה׳ בערב בלבד.",
    notes: '',
    volunteerId: null,
  },
  {
    id: 'drv-03',
    email: 'drv-03@example.co.il',
    name: 'ברוך זילברמן',
    phone: '054-0000045',
    vehicle: 'ספרינטר כחול, 24-118-90',
    seats: 12,
    locality: 'ירושלים',
    photo: null,
    availabilityNote: 'גם נסיעות ארוכות מירושלים.',
    notes: '',
    volunteerId: null,
  },
  {
    id: 'drv-04',
    email: '',
    name: 'עופר בן־דוד',
    phone: '053-0000046',
    vehicle: 'טריטון 4×4, 70-556-31',
    seats: 4,
    locality: 'ירוחם',
    photo: null,
    availabilityNote: 'בעיקר סופי שבוע.',
    notes: '',
    volunteerId: null,
  },
  {
    id: 'drv-05',
    email: 'drv-05@example.co.il',
    name: 'שלומי דרעי',
    phone: '052-0000047',
    vehicle: 'ויאנו שחור, 39-882-15',
    seats: 7,
    locality: 'נתיבות',
    photo: null,
    availabilityNote: 'זמין בהתראה קצרה.',
    notes: '',
    volunteerId: null,
  },
  {
    id: 'drv-06',
    email: 'drv-06@example.co.il',
    name: 'יעקב אלבז',
    phone: '058-0000048',
    vehicle: 'טרנספורטר לבן, 15-334-88',
    seats: 8,
    locality: 'אשקלון',
    photo: null,
    availabilityNote: 'לא זמין בחגים.',
    notes: '',
    volunteerId: null,
  },
]

// G5.2 — the dual hats: one Driver row per canDrive volunteer, linked by
// volunteerId. Same human, both rosters, seats of a private car.
const VOLUNTEER_DRIVERS: Driver[] = NAMED_VOLUNTEERS.filter(
  (v) => v.canDrive,
).map((v, i) => ({
  id: `drv-v${String(i + 1).padStart(2, '0')}`,
  name: v.name,
  phone: v.phone,
  // The dual hat is ONE human: the same address, not a second one.
  email: v.email,
  vehicle: '',
  seats: 4,
  locality: v.locality,
  photo: v.photo,
    availabilityNote: '',
  notes: '',
  volunteerId: v.id,
}))

DRIVERS.push(...VOLUNTEER_DRIVERS)

// Deterministic mixed state: ~45% of volunteers and ~65% of drivers have a
// picture, the rest fall back to initials.
for (const volunteer of VOLUNTEERS) {
  if (seedHasPhoto(volunteer.id, 0.45)) {
    volunteer.photo = placeholderPhoto(volunteer.id, 'person')
  }
}
for (const driver of DRIVERS) {
  if (seedHasPhoto(driver.id, 0.65)) {
    driver.photo = placeholderPhoto(driver.id, 'person')
  }
}
