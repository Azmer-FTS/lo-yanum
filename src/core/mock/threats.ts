import type { LatLng, ThreatVector, ThreatZone } from '../types'

/**
 * G18 — two threat zones and two approach vectors, placed against the
 * existing Negev fixtures rather than scattered.
 *
 * The point of the fixtures is to exercise the two facts the layer exists to
 * carry, so one of each is ATTACHED to an entity and one is FREE:
 *
 *   · `threat-01` sits on חוות רתם's eastern grazing (farm-01) — the case the
 *     farm detail screen shows;
 *   · `threat-02` straddles the ground BETWEEN חוות מעלה עבדת and
 *     חוות נאות חלוצה and belongs to neither, which is the case a per-farm
 *     model could not express and the reason `farmId` is nullable;
 *   · `vector-01` runs from the wadi east of חוות רתם onto its grazing — the
 *     one the wizard's step 1 has to show so a post faces it;
 *   · `vector-02` is free, running north-west off the border road toward the
 *     cluster around Ashalim.
 *
 * The dates are deliberately a few weeks apart and deliberately in the past:
 * an assessment carries its age on screen, and a fixture where everything was
 * "revised today" would hide the fact that the UI prints it.
 */

const FARM_01: LatLng = { lat: 31.0583, lng: 34.6531 }
const FARM_04: LatLng = { lat: 30.9824, lng: 34.7063 }

const ring = (center: LatLng, offsets: Array<[number, number]>): LatLng[] =>
  offsets.map(([dLat, dLng]) => ({
    lat: +(center.lat + dLat).toFixed(6),
    lng: +(center.lng + dLng).toFixed(6),
  }))

/**
 * P2.6b — the `updatedAt` literals are UTC with milliseconds, like every
 * timestamp the app itself produces (`iso()` is `Date.toISOString()`).
 *
 * They were `+03:00` offset literals until A74 caught it. Nothing was wrong
 * with the INSTANTS — they render identically in Israel — but they were the
 * only two spellings of a timestamp in the whole store, and a snapshot holding
 * two spellings is a snapshot whose structural diff reports changes that did
 * not happen the moment the same value comes back from Postgres in the other
 * one. One spelling, everywhere.
 */
export const THREAT_ZONES: ThreatZone[] = [
  {
    id: 'threat-01',
    farmId: 'farm-01',
    intensity: 'high',
    note: 'ואדי מזרחית לחוות רתם — כניסות חוזרות בשעות הלילה המאוחרות, בעיקר בסופי שבוע. הרכב נעצר על הדרך החקלאית ומשם רגלית.',
    updatedAt: '2026-08-11T06:00:00.000Z',
    ring: ring(FARM_01, [
      [0.0041, 0.0062],
      [0.0018, 0.0121],
      [-0.0036, 0.0134],
      [-0.0071, 0.0088],
      [-0.0048, 0.0031],
      [0.0002, 0.0018],
    ]),
  },
  {
    // Free at map level: it covers the open ground between two holdings and
    // belongs to neither.
    id: 'threat-02',
    farmId: null,
    intensity: 'medium',
    note: 'שטח פתוח בין מעלה עבדת לנאות חלוצה — תנועת רכבים לא מזוהים לאורך הדרך הלא־סלולה. אין דיווח על חדירה, אך התדירות עלתה.',
    updatedAt: '2026-07-28T15:30:00.000Z',
    ring: ring(FARM_04, [
      [-0.0402, 0.0281],
      [-0.0511, 0.0464],
      [-0.0698, 0.0492],
      [-0.0772, 0.0338],
      [-0.0651, 0.0182],
      [-0.0478, 0.0161],
    ]),
  },
]

export const THREAT_VECTORS: ThreatVector[] = [
  {
    id: 'vector-01',
    farmId: 'farm-01',
    // From the wadi's mouth, west onto the grazing — the arrow a guard post
    // should be placed to face.
    origin: { lat: 31.0561, lng: 34.6668 },
    target: { lat: 31.0596, lng: 34.6572 },
    intensity: 'high',
    note: 'ציר הכניסה העיקרי — מהוואדי מערבה אל שטח המרעה.',
    updatedAt: '2026-08-11T06:00:00.000Z',
  },
  {
    id: 'vector-02',
    farmId: null,
    origin: { lat: 30.9012, lng: 34.8231 },
    target: { lat: 30.9418, lng: 34.7702 },
    intensity: 'medium',
    note: 'מכביש הגבול צפונה־מערבה לכיוון אשלים.',
    updatedAt: '2026-08-02T18:10:00.000Z',
  },
]
