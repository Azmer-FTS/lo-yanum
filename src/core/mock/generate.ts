import { DAY, iso, now } from '../clock'
import type { PhoneType, Volunteer, VolunteerStatus } from '../types'

/**
 * Deterministic mock generation.
 *
 * The roster must reach 300 rows to prove the virtualised table (R4/A8), and it
 * must be IDENTICAL on every reload — otherwise screenshots drift, "row 214"
 * means nothing between two sessions, and a scroll-position bug becomes
 * impossible to reproduce. So: a seeded PRNG, never Math.random().
 */

/** mulberry32 — small, fast, good enough distribution for fixture data. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const FIRST_NAMES = [
  'אריאל', 'נתנאל', 'שמואל', 'איתמר', 'יהודה', 'אלחנן', 'דביר', 'מאיר',
  'עמיחי', 'ישי', 'הלל', 'שילה', 'אורי', 'רועי', 'בניה', 'תומר', 'ידידיה',
  'אבישי', 'ראובן', 'נדב', 'עידו', 'צבי', 'מנחם', 'אלישע', 'שמעון', 'יונתן',
  'אליהו', 'משה', 'דוד', 'יוסף', 'בנימין', 'נחמן', 'אהרן', 'יעקב', 'יצחק',
  'עמית', 'רפאל', 'גלעד', 'אסף', 'עוזיה', 'מתן', 'טוביה', 'חנן', 'זכריה',
  'אבנר', 'ברוך', 'גדעון', 'הראל', 'יאיר', 'כפיר', 'לביא', 'מרדכי', 'נריה',
  'סיני', 'עדיאל', 'פנחס', 'קובי', 'שלמה', 'תמיר', 'אמיתי', 'בועז', 'גור',
  'דניאל', 'הודיה', 'זאב', 'חיים', 'טל', 'יהונתן', 'ליאור', 'מיכאל',
]

const SURNAMES = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אזולאי', 'דהן', 'אוחנה', 'חדד',
  'גבאי', 'שטרן', 'פרידמן', 'ברקוביץ', 'הרשקוביץ', 'קליין', 'רוזן', 'גולד',
  'אברהמי', 'מלכה', 'סבן', 'אליהו', 'כרמי', 'בוזגלו', 'טולדנו', 'שפירא',
  'בר־און', 'וייס', 'אשל', 'קדוש', 'אלמליח', 'שגיא', 'דרור', 'אוחיון',
  'ורדי', 'שרעבי', 'נחמיאס', 'סויסה', 'אמסלם', 'זילברמן', 'בן־דוד', 'דרעי',
  'אלבז', 'רביבו', 'עמר', 'טל', 'שמעוני', 'יוספי', 'נגר', 'בן־שושן',
  'אדרי', 'חזן', 'מימון', 'צדוק', 'אטיאס', 'לוגסי', 'בן־חמו', 'שוורץ',
  'גרינברג', 'רוטשילד', 'אפשטיין', 'זהבי', 'ברנע', 'אלקיים', 'שלו',
]

const LOCALITIES = [
  'ירושלים', 'אלון שבות', 'אפרת', 'מעלה אדומים', 'בית שמש', 'מודיעין עילית',
  'שדרות', 'נתיבות', 'אופקים', 'באר שבע', 'להבים', 'עומר', 'מיתר',
  'אשקלון', 'אשדוד', 'ניצן', 'קרית גת', 'ירוחם', 'דימונה', 'רחובות',
]

const NOTE_POOL = [
  '',
  '',
  '',
  '',
  'חובש מוסמך.',
  'אחראי קבוצה.',
  'רישיון נהיגה, יכול לשמש נהג מלווה.',
  'מכיר היטב את נקודות העיגון ברמת נגב.',
  'זמין בעיקר בימי חמישי.',
  'לא זמין בשבתות מסיבות משפחתיות.',
  'התנדבות ראשונה בחודש שעבר.',
  'מבקש שיבוץ יחד עם החברותא שלו.',
]

const INACTIVE_REASONS = [
  'גיוס לשירות מילואים ממושך',
  'סיים לימודים ועבר לישיבה אחרת',
  'פציעה, בתהליך שיקום',
  'אילוצי לימודים — זמין שוב בזמן קיץ',
  'נסיעה לחו״ל',
]

const pick = <T>(rng: () => number, list: readonly T[]): T =>
  list[Math.floor(rng() * list.length)]

const int = (rng: () => number, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1))

/**
 * Generate volunteers `startIndex+1 … startIndex+count`.
 *
 * Phone numbers continue the sanitised `05X-000NNNN` convention: the `000`
 * body is unallocated by every Israeli operator, so no generated number can
 * ever collide with a real person's.
 */
export function generateVolunteers(
  count: number,
  yeshivot: readonly string[],
  startIndex: number,
  seed = 0x10ff1e,
): Volunteer[] {
  const rng = makeRng(seed)
  const today = now().getTime()
  const out: Volunteer[] = []
  const usedNames = new Set<string>()

  for (let i = 0; i < count; i++) {
    const n = startIndex + i + 1

    // Keep names unique so search results are unambiguous while demoing.
    let name = `${pick(rng, FIRST_NAMES)} ${pick(rng, SURNAMES)}`
    let guard = 0
    while (usedNames.has(name) && guard < 40) {
      name = `${pick(rng, FIRST_NAMES)} ${pick(rng, SURNAMES)}`
      guard++
    }
    usedNames.add(name)

    // ~45% kosher phones — the real programme skews that way, and it keeps the
    // "one smartphone per group" constraint meaningful.
    const phoneType: PhoneType = rng() < 0.45 ? 'kosher' : 'smartphone'
    const prefix = pick(rng, ['050', '052', '053', '054', '058'])

    const inactive = rng() < 0.14
    const status: VolunteerStatus = inactive ? 'inactive' : 'active'
    const guardsCount = inactive ? int(rng, 0, 18) : int(rng, 0, 42)

    // Active volunteers were out recently; inactive ones long ago; brand-new
    // recruits (no guards yet) have never been out at all.
    const lastActivityAt =
      guardsCount === 0
        ? null
        : iso(
            new Date(
              today -
                (inactive ? int(rng, 60, 400) : int(rng, 1, 55)) * DAY -
                int(rng, 0, 23) * 3_600_000,
            ),
          )

    out.push({
      id: `vol-${String(n).padStart(3, '0')}`,
      name,
      age: int(rng, 18, 26),
      phone: `${prefix}-000${String(n).padStart(4, '0')}`,
      phoneType,
      yeshiva: pick(rng, yeshivot),
      locality: pick(rng, LOCALITIES),
      guardsCount,
      status,
      inactiveReason: inactive ? pick(rng, INACTIVE_REASONS) : null,
      notes: pick(rng, NOTE_POOL),
      lastActivityAt,
      photo: null,
    })
  }

  return out
}
