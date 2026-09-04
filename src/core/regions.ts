import { positionOfLocality } from './geo'
import type { LatLng, RegionId } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * X12 (2026-09-04) — THE COUNTRY, IN THE PIECES THE ASSOCIATION THINKS IN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner brought photographs of the teaching maps the association
 * uses and asked to be able to reason and filter by those big regions. This is
 * that division, as data.
 *
 * ★ WHERE THE OUTLINES COME FROM, SAID PLAINLY.
 *
 *   They are APPROXIMATE POLYGONS WRITTEN HERE BY HAND. They are not survey
 *   data, they are not an administrative boundary, and they carry no legal or
 *   political claim whatsoever. The brief allowed either a free GeoJSON source
 *   with its licence noted, or documented approximations; the second is what
 *   is here, for two reasons worth writing down:
 *
 *     · Every readily available "regions of Israel" GeoJSON either encodes a
 *       specific political reading of the boundaries or carries a licence this
 *       repository cannot grant onward. Vendoring one would put a claim in the
 *       repository that nobody here is entitled to make.
 *     · What the feature actually needs is a coarse bucket — "is this farm in
 *       the Negev or in the Galilee" — for a filter, a colour and a total.
 *       A hand-written polygon is accurate enough for that AND is auditable in
 *       one file, which a 2 MB vendored blob is not.
 *
 *   ⚠️ SO THEY MUST NEVER BE USED AS A BOUNDARY. Nothing in this app decides
 *      anything from them except which bucket to count a farm in and which
 *      wash to paint. If a real outline is ever needed — a report to a
 *      ministry, a legal document — this file is the wrong source and the
 *      comment above is why.
 *
 * ★ THE PARTITION IS ORDERED, AND THE ORDER IS THE TIE-BREAK. The polygons
 *   below overlap slightly at their seams, because writing thirteen exactly
 *   adjacent rings by hand is a false precision. `regionOf` returns the FIRST
 *   match in declaration order, so the order below IS the arbitration: the
 *   narrow, unambiguous regions (Eilat, the Dead Sea, the Arava, the Jordan
 *   valley, the Golan) come before the broad ones they border.
 *
 * ★ AND `regionOf` IS PURE. No store, no locale, no DOM: a point in, a region
 *   id or null out. `bun run regions` exercises it against named places.
 */

export type { RegionId }

export interface Region {
  id: RegionId
  /** The Hebrew name, which is the only one the app shows. */
  name: string
  /**
   * The wash colour, as `r g b`.
   *
   * ⚠️ THIRTEEN HUES THAT ARE NOT THE PROGRAMME'S. The zone colours mean "the
   *    edge of a holding we work with" (`--zone-*`) and the threat colours
   *    mean an assessment (`--status-warn` / `--status-danger`); a region is
   *    neither, and a region wash that borrowed either would be read as one.
   *    So the palette is its own: desaturated, evenly spaced round the wheel,
   *    and painted at low opacity under everything else the map draws.
   */
  rgb: string
  /** Approximate outline, `[lng, lat]`, closed implicitly. */
  ring: Array<[number, number]>
}

/**
 * ★ ORDER MATTERS — see the note above. Narrow and unambiguous first.
 *
 * The rings are written as `[lng, lat]` (GeoJSON's order) so they can be handed
 * straight to MapLibre without a transform, which is the one place a lat/lng
 * swap would be silent and wrong.
 */
export const REGIONS: readonly Region[] = [
  {
    id: 'eilat',
    name: 'אילת',
    rgb: '236 112 99',
    /* The southern tip only: Eilat and its bay. Yotvata, 35 km north, is
       the Arava — checked against the named places in `bun run regions`. */
    ring: [
      [34.87, 29.47],
      [35.05, 29.47],
      [35.06, 29.72],
      [34.9, 29.72],
    ],
  },
  {
    id: 'arava',
    name: 'הערבה',
    rgb: '230 176 90',
    ring: [
      [34.9, 29.72],
      [35.06, 29.72],
      [35.4, 30.9],
      [35.32, 31.1],
      [35.1, 31.05],
      [34.96, 30.5],
    ],
  },
  {
    id: 'dead-sea',
    name: 'ים המלח',
    rgb: '120 178 200',
    ring: [
      [35.32, 31.1],
      [35.57, 31.1],
      [35.6, 31.82],
      [35.42, 31.82],
      [35.3, 31.5],
    ],
  },
  {
    id: 'jordan-valley',
    name: 'בקעת הירדן',
    rgb: '150 190 140',
    ring: [
      [35.42, 31.82],
      [35.62, 31.82],
      [35.68, 32.72],
      [35.45, 32.72],
      [35.38, 32.2],
    ],
  },
  {
    id: 'golan',
    name: 'רמת הגולן',
    rgb: '138 154 210',
    ring: [
      [35.62, 32.72],
      [35.95, 32.78],
      [35.9, 33.32],
      [35.62, 33.28],
      [35.58, 33.0],
    ],
  },
  {
    id: 'galilee',
    name: 'הגליל',
    rgb: '124 190 160',
    ring: [
      [35.02, 32.72],
      [35.62, 32.72],
      [35.62, 33.28],
      [35.28, 33.34],
      [35.1, 33.09],
      [34.99, 32.9],
    ],
  },
  {
    id: 'jezreel',
    name: 'עמק יזרעאל',
    rgb: '196 176 120',
    ring: [
      [35.05, 32.45],
      [35.55, 32.5],
      [35.6, 32.72],
      [35.02, 32.72],
      [34.97, 32.6],
    ],
  },
  {
    id: 'carmel-coast',
    name: 'חוף הכרמל',
    rgb: '110 186 196',
    ring: [
      [34.84, 32.4],
      [35.05, 32.45],
      [34.99, 32.9],
      [34.9, 32.86],
      [34.8, 32.62],
    ],
  },
  {
    id: 'sharon',
    name: 'השרון',
    rgb: '146 172 214',
    /* The Sharon starts north of Tel Aviv, around Herzliya — Tel Aviv itself
       is the coastal plain, which is where `bun run regions` expects it. */
    ring: [
      [34.78, 32.15],
      [35.02, 32.18],
      [35.05, 32.45],
      [34.84, 32.4],
      [34.79, 32.3],
    ],
  },
  {
    id: 'coastal-plain',
    name: 'מישור החוף',
    rgb: '176 200 150',
    ring: [
      [34.45, 31.5],
      [34.95, 31.5],
      [35.02, 32.18],
      [34.78, 32.15],
      [34.5, 31.75],
    ],
  },
  {
    id: 'samaria',
    name: 'שומרון',
    rgb: '200 160 190',
    /* The Judea / Samaria line sits around the Ramallah latitude, not at the
       coastal plain's: Ariel (32.11) is Samaria and Jerusalem (31.77) is
       Judea, which is what `bun run regions` pins down. */
    ring: [
      [34.98, 31.95],
      [35.45, 31.93],
      [35.45, 32.55],
      [35.05, 32.45],
      [35.02, 32.18],
    ],
  },
  {
    id: 'judea',
    name: 'יהודה',
    rgb: '190 150 130',
    ring: [
      [34.95, 31.35],
      [35.45, 31.35],
      [35.45, 31.93],
      [34.98, 31.95],
      [34.95, 31.7],
    ],
  },
  {
    id: 'negev',
    name: 'הנגב',
    rgb: '214 186 132',
    ring: [
      [34.27, 30.4],
      [34.98, 30.6],
      [35.1, 31.05],
      [35.3, 31.5],
      [34.95, 31.55],
      [34.45, 31.5],
      [34.3, 31.2],
    ],
  },
] as const

const BY_ID = new Map<RegionId, Region>(REGIONS.map((r) => [r.id, r]))

export function regionById(id: RegionId | null | undefined): Region | null {
  return id ? (BY_ID.get(id) ?? null) : null
}

/**
 * ★ RAY CASTING, THE TEXTBOOK ONE, AND THE EDGE CASES ARE THE POINT.
 *
 * A point is inside a ring when a ray cast from it crosses the ring an odd
 * number of times. The `(yi > y) !== (yj > y)` form counts a vertex exactly
 * once — the naive `>=` on both sides counts it twice for a ray that grazes a
 * vertex, which puts a farm on a seam in neither region or in both depending
 * on which way the polygon happens to wind.
 *
 * Plane coordinates, not spherical: over a country 400 km tall the difference
 * is metres, and these outlines are approximate by construction (see above).
 */
export function pointInRing(point: LatLng, ring: Array<[number, number]>): boolean {
  const x = point.lng
  const y = point.lat
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

/**
 * The region a point falls in, or null when it falls outside every outline —
 * which is a real answer and not a failure: a farm across a border, a
 * coordinate typed wrong, a point in the sea.
 */
export function regionOf(point: LatLng): RegionId | null {
  for (const region of REGIONS) {
    if (pointInRing(point, region.ring)) return region.id
  }
  return null
}

/** The centre of a region's outline — where its name is drawn on the map. */
export function regionCenter(region: Region): LatLng {
  let lat = 0
  let lng = 0
  for (const [x, y] of region.ring) {
    lng += x
    lat += y
  }
  return { lat: lat / region.ring.length, lng: lng / region.ring.length }
}

/**
 * ★ X12.2 — THE ONE PLACE THE MANUAL OVERRIDE AND THE AUTOMATIC ANSWER ARE
 *   ARBITRATED. Nothing else may read `farm.regionId` or call `regionOf` on a
 *   farm: a second arbitration is how a filter and a total come to disagree.
 *
 *   The override wins because somebody typed it, and a person who has looked
 *   at a map knows something the polygon does not — a holding that straddles a
 *   seam, a recorded point that is a gate on the wrong side of a line. Absent
 *   an override the position decides, so a farm that is moved re-files itself
 *   and there is nothing to maintain.
 */
export function farmRegion(farm: {
  regionId?: RegionId | null
  position: LatLng
}): RegionId | null {
  return farm.regionId ?? regionOf(farm.position)
}

/**
 * ★ X12.4 — THE REGION OF A PERSON, WHICH IS THE REGION OF HIS TOWN.
 *
 * A volunteer has no coordinates — he has a locality, and the roster's map
 * already turns that into a point through `LOCALITY_POSITIONS`. So the region
 * of a volunteer is the region of that point, and a town the gazetteer does
 * not know resolves to null rather than to a guess.
 */
export function regionOfLocality(locality: string): RegionId | null {
  const point = positionOfLocality(locality)
  return point ? regionOf(point) : null
}

/**
 * ★ X12.4 — DUNAMS PER REGION, ONE FUNCTION, TWO READERS.
 *
 * The dashboard block and the PDF report both print this distribution, and
 * the association's funding is built on the dunam figures — so the two must
 * be one computation rather than two that agree today. Same reasoning, and
 * the same shape, as `getDunamKpis` in `access.ts`.
 *
 * Sorted heaviest first, and regions holding nothing are dropped: a bar chart
 * of thirteen rows where nine are zero is a chart nobody reads.
 */
export function dunamsByRegion(
  farms: ReadonlyArray<{
    regionId?: RegionId | null
    position: LatLng
    farmDunams: number
    grazingDunams: number
  }>,
): Array<{ id: RegionId | null; name: string; dunams: number; count: number }> {
  const totals = new Map<RegionId | null, { dunams: number; count: number }>()
  for (const farm of farms) {
    const id = farmRegion(farm)
    const cell = totals.get(id) ?? { dunams: 0, count: 0 }
    cell.dunams += farm.farmDunams + farm.grazingDunams
    cell.count += 1
    totals.set(id, cell)
  }
  return [...totals.entries()]
    .filter(([, cell]) => cell.dunams > 0 || cell.count > 0)
    .map(([id, cell]) => ({
      id,
      // A farm outside every outline is counted and named, never dropped: a
      // total that silently omits rows is worse than one that says "elsewhere".
      name: regionById(id)?.name ?? 'מחוץ לאזורים',
      dunams: cell.dunams,
      count: cell.count,
    }))
    .sort((a, b) => b.dunams - a.dunams)
}
