import { atTime, hoursFromNow } from '../clock'
import type { Incident } from '../types'

/** 5 incidents across the three active farms, all severities and all sources. */
export const INCIDENTS: Incident[] = [
  // Reported from tonight's live guard — appears as an alert on the
  // coordinator dashboard and in the farmer's view of farm-01.
  {
    id: 'inc-01',
    farmId: 'farm-01',
    missionId: 'mission-01',
    source: 'volunteer',
    reporterId: 'vol-001',
    reporterName: 'אריאל כהן',
    severity: 'urgent',
    description:
      'שני רכבים ללא לוחיות נכנסו בדרך העפר המזרחית וכיבו אורות. נשמעים קולות ליד מכלאות הצאן. אנחנו מרוכזים ליד הקרוואן ולא יוצאים.',
    position: { lat: 31.0604, lng: 34.6569 },
    reportedAt: hoursFromNow(-0.6),
    resolved: false,
    entries: [
      {
        id: 'ent-01a',
        at: hoursFromNow(-0.55),
        author: 'רכז',
        text: 'התקבל דיווח. יוצר קשר עם בעל החווה.',
      },
      {
        id: 'ent-01b',
        at: hoursFromNow(-0.45),
        author: 'רכז',
        text: 'משטרה עודכנה, ניידת בדרך מירוחם.',
      },
      {
        id: 'ent-01c',
        at: hoursFromNow(-0.2),
        author: 'אריאל כהן',
        text: 'הרכבים יצאו לכיוון כביש 222. כולם כאן, אין נפגעים.',
      },
    ],
  },

  {
    id: 'inc-02',
    farmId: 'farm-01',
    missionId: null,
    source: 'farmer',
    reporterId: 'contact-01a',
    reporterName: 'אליהו בן־חמו',
    severity: 'suspicious',
    description:
      'נמצא חתך בגדר המערבית בבוקר, כ־40 מטר מהשער הצפוני. לא נגנב דבר, אבל זו הפעם השנייה החודש.',
    position: { lat: 31.0567, lng: 34.6488 },
    reportedAt: atTime(-5, 7, 40),
    resolved: true,
    entries: [
      {
        id: 'ent-02a',
        at: atTime(-5, 9, 10),
        author: 'רכז',
        text: 'תועד. הועבר לקב״ט המועצה.',
      },
      {
        id: 'ent-02b',
        at: atTime(-4, 16, 0),
        author: 'רכז',
        text: 'הגדר תוקנה. הוספנו סבב שמירה בחלקה המערבית.',
      },
    ],
  },

  {
    id: 'inc-03',
    farmId: 'farm-02',
    missionId: 'mission-04',
    source: 'volunteer',
    reporterId: 'vol-013',
    reporterName: 'אורי מלכה',
    severity: 'observation',
    description:
      'תאורת הביטחון במטע המזרחי לא נדלקת. עברנו עם פנסים, הכול תקין. שווה לתקן לפני השמירה הבאה.',
    position: { lat: 30.8741, lng: 34.7998 },
    reportedAt: hoursFromNow(-50),
    resolved: false,
    entries: [
      {
        id: 'ent-03a',
        at: hoursFromNow(-44),
        author: 'רכז',
        text: 'הועבר ליונתן אשל. חשמלאי מגיע השבוע.',
      },
    ],
  },

  {
    id: 'inc-04',
    farmId: 'farm-03',
    missionId: null,
    source: 'coordinator',
    reporterId: null,
    reporterName: 'רכז',
    severity: 'suspicious',
    description:
      'דיווח ממשטרת חבל שלום על תנועת רכבים חריגה בכביש 211 בשעות הלילה. להעביר תדריך מוגבר לקבוצות שיוצאות השבוע.',
    position: { lat: 30.9302, lng: 34.3915 },
    reportedAt: atTime(-2, 18, 20),
    resolved: false,
    entries: [
      {
        id: 'ent-04a',
        at: atTime(-2, 18, 45),
        author: 'רכז',
        text: 'תדריך נשלח לאחראי הקבוצות של ישיבת שדרות ונווה דקלים.',
      },
    ],
  },

  {
    id: 'inc-05',
    farmId: 'farm-03',
    missionId: null,
    source: 'farmer',
    reporterId: 'contact-03a',
    reporterName: 'משה קדוש',
    severity: 'urgent',
    description:
      'פריצה למחסן הכלים בלילה שבו לא הייתה שמירה. נגנבו שני מנועי השקיה ומשאבה.',
    position: { lat: 30.9366, lng: 34.3833 },
    reportedAt: atTime(-13, 5, 50),
    resolved: true,
    entries: [
      {
        id: 'ent-05a',
        at: atTime(-13, 6, 30),
        author: 'רכז',
        text: 'משטרה הוזמנה, נפתחה תלונה.',
      },
      {
        id: 'ent-05b',
        at: atTime(-13, 11, 0),
        author: 'רכז',
        text: 'החווה הועלתה לעדיפות גבוהה בשיבוץ השמירות.',
      },
      {
        id: 'ent-05c',
        at: atTime(-9, 14, 15),
        author: 'רכז',
        text: 'הותקן מנעול חדש ותאורה נוספת. האירוע נסגר.',
      },
    ],
  },
]
