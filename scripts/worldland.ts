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

/** Generous around Israel: Cyprus and the Nile delta in, the Gulf and Anatolia in. */
const BOX = { w: 24, s: 21, e: 46, n: 41 }

type Ring = [number, number][]

/** Sutherland–Hodgman against one edge of the box. */
function clipEdge(ring: Ring, keep: (p: [number, number]) => boolean, cut: (a: [number, number], b: [number, number]) => [number, number]): Ring {
  const out: Ring = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const ain = keep(a)
    const bin = keep(b)
    if (ain) out.push(a)
    if (ain !== bin) out.push(cut(a, b))
  }
  return out
}

function clipRing(ring: Ring): Ring {
  const at = (a: [number, number], b: [number, number], t: number): [number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ]
  let r = ring
  r = clipEdge(r, (p) => p[0] >= BOX.w, (a, b) => at(a, b, (BOX.w - a[0]) / (b[0] - a[0])))
  if (!r.length) return r
  r = clipEdge(r, (p) => p[0] <= BOX.e, (a, b) => at(a, b, (BOX.e - a[0]) / (b[0] - a[0])))
  if (!r.length) return r
  r = clipEdge(r, (p) => p[1] >= BOX.s, (a, b) => at(a, b, (BOX.s - a[1]) / (b[1] - a[1])))
  if (!r.length) return r
  r = clipEdge(r, (p) => p[1] <= BOX.n, (a, b) => at(a, b, (BOX.n - a[1]) / (b[1] - a[1])))
  return r
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
    const clipped = rings.map((ring) => round(clipRing(ring))).filter((ring) => ring.length >= 4)
    if (clipped.length) polygons.push(clipped)
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
console.log(`  box lon ${BOX.w}..${BOX.e}, lat ${BOX.s}..${BOX.n} — Natural Earth 50 m land, public domain`)
