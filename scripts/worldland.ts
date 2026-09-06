/**
 * Y1 — THE GROUND THAT IS NOT IN THE ARCHIVE.
 *
 *   bun run worldland
 *
 * The national PMTiles archive is a COUNTRY EXTRACT, and a country extract has
 * an edge. Measured on the shipped file (`bun run vector`, section A): the
 * tiles it holds span lon 33.75–39.38 at z6, and only 33.75–36.56 from z7 up.
 * An iPad in landscape at z6 is 32 768 px of world, of which the archive can
 * paint 512 — so the product owner's "bandes blanches à droite et à gauche" is
 * not a fault in the file, it is the file's own extent seen at a zoom where it
 * does not reach the edges of the screen. No amount of re-cutting Israel fixes
 * it, because what is missing is NOT Israel.
 *
 * ★ SO THE VOID GETS A GROUND OF ITS OWN, and it is a COASTLINE and nothing
 *   else. Natural Earth's 50 m land polygons are public domain, they are the
 *   shape of the sea against the land, and a coastline states nothing that
 *   anybody disputes. There is NO boundary layer in this file and there must
 *   never be one: ETAT's standing rule is that this project does not draw
 *   lines it cannot source, and every land border in this frame is exactly the
 *   kind of line that rule is about.
 *
 * The output is clipped to a generous box around the programme, rounded to
 * four decimals (≈ 11 m — far past what a backdrop at z≤10 can show), and
 * committed as JSON so the map carries its own ground with no fetch, no cache
 * entry and no service-worker question.
 */
const SOURCE =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson'
const OUT = 'src/ui/components/world-land.json'

/**
 * ⚠️⚠️ THE FIRST VERSION OF THIS SCRIPT CLIPPED, AND CLIPPING WAS WRONG.
 *
 * It ran Sutherland–Hodgman on each ring against a box around the programme —
 * which is correct for a CONVEX polygon and produces, for a concave one, a
 * degenerate edge along the clip boundary that joins pieces which are not
 * joined. Natural Earth's Afro-Eurasia ring is about as concave as a polygon
 * gets. `earcut` then filled the corridor: on the deployed build, a rectangle
 * of LAND in the Mediterranean west of Ashkelon, with a straight vertical edge
 * where the archive's own tiles took over. Probed on the served URL,
 * `queryRenderedFeatures` at 33.39 E / 31.73 N — open sea — answered
 * `lo-world-land`.
 *
 * ★ SO NOTHING IS CLIPPED. A ring is kept WHOLE when its bounding box meets
 *   the frame, and dropped otherwise; what makes the result small is
 *   SIMPLIFICATION, which cannot invent a coastline that is not there. The
 *   tolerance is chosen for a backdrop that is only ever seen at z ≤ 10: about
 *   0.03° is 3 km, well under a pixel at that zoom.
 *
 * ★ AND `bun run vector` NOW ASKS THE MAP whether a known sea point is sea.
 *   The unpainted-pixel check could not catch this — spilled land is a
 *   legitimate map colour, and the defect was a shape rather than a hole.
 */

/** Which rings are kept: those whose bounding box meets this frame. */
const BOX = { w: 24, s: 21, e: 46, n: 41 }

/** ≈3 km. A backdrop under a country extract, seen at z ≤ 10. */
const TOLERANCE_DEG = 0.03

type Ring = [number, number][]

function meetsBox(ring: Ring): boolean {
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  for (const [x, y] of ring) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return e >= BOX.w && w <= BOX.e && n >= BOX.s && s <= BOX.n
}

/** Douglas–Peucker, iterative so a 10 000-point ring cannot blow the stack. */
function simplify(ring: Ring, tolerance: number): Ring {
  if (ring.length < 4) return ring
  const keep = new Uint8Array(ring.length)
  keep[0] = 1
  keep[ring.length - 1] = 1
  const stack: [number, number][] = [[0, ring.length - 1]]
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number]
    let index = -1
    let worst = tolerance
    const [ax, ay] = ring[first]
    const [bx, by] = ring[last]
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    for (let i = first + 1; i < last; i++) {
      const [px, py] = ring[i]
      const d =
        len === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len
      if (d > worst) {
        worst = d
        index = i
      }
    }
    if (index !== -1) {
      keep[index] = 1
      stack.push([first, index], [index, last])
    }
  }
  const out: Ring = []
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i])
  return out
}

const round = (r: Ring): Ring => r.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4])

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`Natural Earth 50 m land: HTTP ${response.status}`)
const source = (await response.json()) as {
  features: { geometry: { type: string; coordinates: unknown } }[]
}

const polygons: Ring[][] = []
for (const feature of source.features) {
  const geom = feature.geometry
  const parts: Ring[][] =
    geom.type === 'Polygon'
      ? [geom.coordinates as Ring[]]
      : geom.type === 'MultiPolygon'
        ? (geom.coordinates as Ring[][])
        : []
  for (const rings of parts) {
    // The OUTER ring decides whether this piece of land is in frame at all.
    if (!meetsBox(rings[0] as Ring)) continue
    const kept = rings
      .map((ring) => round(simplify(ring as Ring, TOLERANCE_DEG)))
      .filter((ring) => ring.length >= 4)
    if (kept.length) polygons.push(kept)
  }
}

const out = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: polygons },
    },
  ],
}

await Bun.write(OUT, `${JSON.stringify(out)}\n`)
const bytes = (await Bun.file(OUT).arrayBuffer()).byteLength
console.log(`  ${OUT}: ${polygons.length} polygons, ${bytes} bytes`)
console.log(`  frame lon ${BOX.w}..${BOX.e}, lat ${BOX.s}..${BOX.n} — Natural Earth 50 m land, public domain, whole rings, simplified at ${TOLERANCE_DEG}°`)
