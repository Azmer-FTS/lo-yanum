import { atTime } from '../clock'
import type { FarmVisit, GeneralMeeting } from '../types'
import { FARMS } from './farms'

/**
 * D4 — planned and completed farm visits.
 *
 * Seeded FROM the farm records rather than authored separately: every farm that
 * already carried a `nextVisitAt` gets an open visit on that date, and every
 * farm with a `lastVisitAt` gets a closed one. Authoring a second, independent
 * list would have let the agenda and the farm cards disagree on day one.
 *
 * After this point the direction reverses — the visits become the source and
 * `Farm.nextVisitAt` becomes the derived cache (see `syncNextVisit` in
 * store.ts).
 */

const NOTES = [
  'סבב ביקור תקופתי — לוודא שהתנאים למתנדבים עומדים בהסכם.',
  'פגישה עם בעל החווה בנוגע לעמדת שמירה נוספת.',
  'ביקור ראשון — הצגת התוכנית וחתימה על ההסכם.',
  'בדיקת גישה בדרך העפר אחרי הגשמים.',
  'מעקב אחרי אירוע שדווח בשמירה האחרונה.',
]

/** Deterministic note per farm — same fixture on every reload. */
const noteFor = (index: number): string => NOTES[index % NOTES.length]

export const FARM_VISITS: FarmVisit[] = FARMS.flatMap((farm, i) => {
  const rows: FarmVisit[] = []

  if (farm.lastVisitAt) {
    rows.push({
      id: `visit-past-${farm.id}`,
      farmId: farm.id,
      at: farm.lastVisitAt,
      note: noteFor(i + 2),
      done: true,
    })
  }

  if (farm.nextVisitAt) {
    rows.push({
      id: `visit-next-${farm.id}`,
      farmId: farm.id,
      at: farm.nextVisitAt,
      note: noteFor(i),
      done: false,
    })
  }

  return rows
})

/**
 * G6 — a few general meetings so the third event type exists on first load:
 * one today-ish, one later this week, one next week.
 */
export const GENERAL_MEETINGS: GeneralMeeting[] = [
  {
    id: 'meet-01',
    title: 'פגישה עם קרן התורמים',
    at: atTime(1, 11, 0),
    endAt: atTime(1, 12, 30),
    location: 'משרדי ארצנו, ירושלים',
    person: 'שרה גולדשטיין',
    note: 'עדכון רבעוני על תוכנית השמירה.',
  },
  {
    id: 'meet-02',
    title: 'תיאום עם מוקד המשטרה',
    at: atTime(3, 9, 30),
    endAt: atTime(3, 10, 15),
    location: 'תחנת באר שבע',
    person: 'רס"ר יואב כהן',
    note: 'נוהל דיווח אירועים חמורים.',
  },
  {
    id: 'meet-03',
    title: 'איסוף ציוד — פנסי ראש',
    at: atTime(8, 16, 0),
    endAt: atTime(8, 16, 45),
    location: 'מחסן החירום, עומר',
    person: 'עמותת ציוד לחיילים',
    note: '',
  },
]
