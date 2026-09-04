import {
  REGIONS,
  regionById,
  regionCenter,
  regionOf,
  pointInRing,
} from '../src/core/regions'
import type { RegionId } from '../src/core/regions'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X12 (2026-09-04) — THE REGIONS ARE PURE ARITHMETIC, SO THEY ARE TESTED AS
 * ARITHMETIC.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `regionOf` takes a point and returns a bucket. No store, no browser, no
 * server — so this gate needs none of those either, which is why it runs in
 * under a second and can be run on every change.
 *
 * ★ THE FIXTURES ARE REAL PLACES, and that is the whole design of this file.
 *   Asserting "a point at 31.2, 34.8 is in polygon 11" tests the polygon
 *   against itself. Asserting "באר שבע is in הנגב" tests it against the thing
 *   the product owner is actually going to check, and it FAILS when a hand-
 *   written outline drifts — which is exactly what it caught while these
 *   outlines were being written: Tel Aviv came out as the Sharon, Yotvata as
 *   Eilat, and Ariel as Judea. All three were the polygons being wrong, and
 *   all three are pinned below so they cannot come back.
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

/** name, lat, lng, the region it must resolve to. */
const PLACES: Array<[string, number, number, RegionId]> = [
  ['ירושלים', 31.7683, 35.2137, 'judea'],
  ['חברון', 31.5326, 35.0998, 'judea'],
  // ★ Ariel came out `judea` while these outlines were being written: the
  //   Judea / Samaria line had been put at the coastal plain's latitude
  //   instead of Ramallah's.
  ['אריאל', 32.1056, 35.1878, 'samaria'],
  ['שכם', 32.2211, 35.2544, 'samaria'],
  ['בית אל', 31.944, 35.22, 'samaria'],
  // ★ Tel Aviv came out `sharon`: the Sharon starts north of it, at Herzliya.
  ['תל אביב', 32.0853, 34.7818, 'coastal-plain'],
  ['פתח תקווה', 32.084, 34.8878, 'coastal-plain'],
  ['רחובות', 31.8928, 34.8113, 'coastal-plain'],
  ['אשקלון', 31.6688, 34.5743, 'coastal-plain'],
  ['הרצליה', 32.1624, 34.8447, 'sharon'],
  ['נתניה', 32.3215, 34.8532, 'sharon'],
  ['חיפה', 32.794, 34.9896, 'carmel-coast'],
  ['עפולה', 32.6078, 35.2897, 'jezreel'],
  ['צפת', 32.9646, 35.496, 'galilee'],
  ['טבריה', 32.7959, 35.53, 'galilee'],
  ['קצרין', 32.9911, 35.6897, 'golan'],
  ['בית שאן', 32.4969, 35.4997, 'jordan-valley'],
  ['עין גדי', 31.4614, 35.3894, 'dead-sea'],
  ['באר שבע', 31.253, 34.7915, 'negev'],
  ['מיתר', 31.3239, 34.9339, 'negev'],
  ['שדה בוקר', 30.871, 34.796, 'negev'],
  ['מצפה רמון', 30.6097, 34.801, 'negev'],
  // ★ Yotvata came out `eilat`: the Eilat region is the southern tip, and
  //   Yotvata is 35 km up the Arava.
  ['יטבתה', 29.8836, 35.057, 'arava'],
  ['אילת', 29.5577, 34.9519, 'eilat'],
]

console.log('')
console.log('  X12 — THE REGIONS OF ISRAEL, RESOLVED FROM COORDINATES')
console.log('  ======================================================')
console.log('')

check(
  'every region declared in the type has an outline',
  REGIONS.length === 13,
  `${REGIONS.length} regions`,
)

for (const region of REGIONS) {
  check(
    `${region.name}: a closed outline of at least three points`,
    region.ring.length >= 3,
    `${region.ring.length} points`,
  )
}

console.log('')
console.log('  named places land in the right region')
console.log('  ------------------------------------')
for (const [name, lat, lng, expected] of PLACES) {
  const got = regionOf({ lat, lng })
  check(`${name} → ${expected}`, got === expected, got ?? 'null')
}

console.log('')
console.log('  the arithmetic itself')
console.log('  ---------------------')

/**
 * ★ OUTSIDE IS A REAL ANSWER. A point in the Mediterranean, a coordinate
 *   typed wrong, a farm across a border: `regionOf` returns null and every
 *   caller has to mean something by that rather than defaulting to a bucket.
 */
check(
  'a point in the sea is in no region',
  regionOf({ lat: 32.0, lng: 33.5 }) === null,
)
check(
  'a point in Cyprus is in no region',
  regionOf({ lat: 35.0, lng: 33.0 }) === null,
)

/**
 * ★ THE VERTEX CASE, WHICH IS WHY THE RAY TEST IS WRITTEN THE WAY IT IS. A ray
 *   that grazes a vertex must cross the ring ONCE, not twice; the `>` on one
 *   side and `>` on the other (rather than `>=` on both) is what guarantees
 *   it. A square, and a point level with two of its corners.
 */
const square: Array<[number, number]> = [
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
]
check('a point inside a square is inside', pointInRing({ lat: 1, lng: 1 }, square))
check('a point outside it is outside', pointInRing({ lat: 3, lng: 1 }, square) === false)
check(
  'a ray grazing two vertices still reads as inside',
  pointInRing({ lat: 0, lng: 1 }, square) !== pointInRing({ lat: 3, lng: 1 }, square),
)

check('regionById round-trips every id', REGIONS.every((r) => regionById(r.id)?.id === r.id))
check('regionById on null is null', regionById(null) === null)

/**
 * ★ AND EVERY REGION'S OWN CENTRE IS INSIDE IT. That is where its name is
 *   drawn on the map, and a label floating outside the wash it belongs to is
 *   worse than no label. It also catches a ring written with a lat/lng swap,
 *   which is the one mistake in this file that would look plausible.
 */
for (const region of REGIONS) {
  const centre = regionCenter(region)
  check(
    `${region.name}: its centre is inside its own outline`,
    regionOf(centre) === region.id || pointInRing(centre, region.ring),
    `${centre.lat.toFixed(2)}, ${centre.lng.toFixed(2)}`,
  )
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
