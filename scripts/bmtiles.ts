import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'

/**
 * ★★ BM — un masque à pleine résolution, découpé en cases de CELL degrés (0,1° ≈ 10 km).
 *
 * Les masques de BM (mer, au-delà) portent 40 fois plus de points que ceux de BL : soustraits d'un
 * bloc, ils rendaient `landOf` 4 fois plus lent (20 à 44 ms par région, à chaque geste du poussage).
 * Découpés en cases, `core/topology.ts` (`masksMeeting`) ne soustrait que les morceaux qui touchent
 * la boîte de la région. Le masque est le même : la réunion des morceaux.
 */
export function tile(shape: MultiPolygon, cell = 0.1): MultiPolygon {
  const pts = shape.flat(2)
  const x0 = Math.floor(Math.min(...pts.map((p) => p[0])) / cell)
  const x1 = Math.ceil(Math.max(...pts.map((p) => p[0])) / cell)
  const y0 = Math.floor(Math.min(...pts.map((p) => p[1])) / cell)
  const y1 = Math.ceil(Math.max(...pts.map((p) => p[1])) / cell)
  const out: MultiPolygon = []
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6
  for (let i = x0; i < x1; i++)
    for (let j = y0; j < y1; j++) {
      const [w, s, e, n] = [r6(i * cell), r6(j * cell), r6((i + 1) * cell), r6((j + 1) * cell)]
      const box: Polygon = [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
      for (const p of polygonClipping.intersection(shape, box)) out.push(p.map((r) => r.map(([x, y]) => [r6(x), r6(y)])) as Polygon)
    }
  return out
}
