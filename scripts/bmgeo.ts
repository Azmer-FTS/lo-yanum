import polygonClipping from 'polygon-clipping'
import type { MultiPolygon } from 'polygon-clipping'

/**
 * ★★ BM — la géométrie de la MESURE des frontières, partagée par `bmmeasure.ts` (le rapport) et
 * `bmpass.ts` (la porte). Distances en mètres sur un plan local (cos 31,5°) : à l'échelle d'un
 * écart de frontière (quelques mètres à quelques centaines), l'erreur du plan est sans effet.
 */
export type Pt = [number, number]
export const KX = 111_320 * Math.cos((31.5 * Math.PI) / 180)
export const KY = 110_540
export const W = 34.2, E = 36.0, S = 29.35, N = 33.45
export interface Geo { zones: Record<string, MultiPolygon>; coast: Pt[][]; jordanRiver: Pt[][]; fetched: string }
/** Les masques de BM sont découpés en cases : on les réunit avant de mesurer (sinon les coutures comptent). */
export const whole = (s: MultiPolygon): MultiPolygon => polygonClipping.union(s)
export const SEGS = ['egypt', 'jordan-arava', 'jordan-deadsea', 'jordan-river', 'jordan-yarmouk', 'syria', 'lebanon', 'gaza']

function inRing(r: number[][], x: number, y: number): boolean {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c
  return c
}
export const inShape = (s: MultiPolygon, x: number, y: number) => s.some((p) => inRing(p[0], x, y) && !p.slice(1).some((h) => inRing(h, x, y)))

/** Un index de segments par cases de ~1 km, pour la distance d'un point à une ligne. */
export class Lines {
  segs: Array<[number, number, number, number]> = []
  grid = new Map<string, number[]>()
  static C = 1000
  add(a: Pt, b: Pt) {
    const s: [number, number, number, number] = [a[0] * KX, a[1] * KY, b[0] * KX, b[1] * KY]
    const k = this.segs.push(s) - 1
    const [x0, x1] = [Math.min(s[0], s[2]), Math.max(s[0], s[2])]
    const [y0, y1] = [Math.min(s[1], s[3]), Math.max(s[1], s[3])]
    for (let i = Math.floor(x0 / Lines.C); i <= Math.floor(x1 / Lines.C); i++)
      for (let j = Math.floor(y0 / Lines.C); j <= Math.floor(y1 / Lines.C); j++) {
        const key = `${i},${j}`
        const l = this.grid.get(key)
        if (l) l.push(k)
        else this.grid.set(key, [k])
      }
  }
  dist(p: Pt, max = 20_000): number {
    const x = p[0] * KX, y = p[1] * KY
    const ci = Math.floor(x / Lines.C), cj = Math.floor(y / Lines.C)
    let best = Infinity
    for (let r = 0; r * Lines.C <= Math.min(best, max) + Lines.C; r++) {
      for (let i = ci - r; i <= ci + r; i++)
        for (let j = cj - r; j <= cj + r; j++) {
          if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue
          for (const k of this.grid.get(`${i},${j}`) ?? []) {
            const [ax, ay, bx, by] = this.segs[k]
            const dx = bx - ax, dy = by - ay
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
            const d = Math.hypot(x - ax - t * dx, y - ay - t * dy)
            if (d < best) best = d
          }
        }
    }
    return best
  }
}
/** Les points d'un segment tous les `step` mètres. */
export function dense(a: Pt, b: Pt, step = 10): Pt[] {
  const n = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY) / step))
  return Array.from({ length: n }, (_, t) => [a[0] + ((b[0] - a[0]) * t) / n, a[1] + ((b[1] - a[1]) * t) / n] as Pt)
}

/**
 * La frontière TERRESTRE d'une réunion de zones : ses arêtes dont le côté extérieur (à 40 m) est la
 * terre du pays (ni mer, ni zone), hors du bord du cadre. Chaque arête est nommée par la zone qui la borde.
 */
export function frontier(zones: Record<string, MultiPolygon>, sea: MultiPolygon): Array<{ seg: string; a: Pt; b: Pt }> {
  const all = polygonClipping.union(...(Object.values(zones) as [MultiPolygon, ...MultiPolygon[]]))
  const out: Array<{ seg: string; a: Pt; b: Pt }> = []
  for (const poly of all)
    for (const ring of poly)
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = ring[i] as Pt, b = ring[i + 1] as Pt
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
        if (mx < W + 0.01 || mx > E - 0.01 || my < S + 0.01 || my > N - 0.01) continue
        const len = Math.hypot((b[0] - a[0]) * KX, (b[1] - a[1]) * KY)
        if (len === 0) continue
        /* Les deux côtés à 40 m : l'un dans la réunion, l'autre sur la terre du pays. */
        const nx = (-(b[1] - a[1]) * KY) / len, ny = ((b[0] - a[0]) * KX) / len
        const p1: Pt = [mx + (40 * nx) / KX, my + (40 * ny) / KY]
        const p2: Pt = [mx - (40 * nx) / KX, my - (40 * ny) / KY]
        const in1 = inShape(all, p1[0], p1[1]), in2 = inShape(all, p2[0], p2[1])
        if (in1 === in2) continue
        const [inner, outer] = in1 ? [p1, p2] : [p2, p1]
        if (inShape(sea, outer[0], outer[1])) continue
        const zone = Object.entries(zones).find(([, z]) => inShape(z, inner[0], inner[1]))?.[0] ?? '?'
        out.push({ seg: segOf(zone, my, mx), a, b })
      }
  return out
}
export function segOf(zone: string, lat: number, _lng: number): string {
  if (zone !== 'jordan') return zone
  if (lat < 30.95) return 'jordan-arava'
  if (lat < 31.77) return 'jordan-deadsea'
  if (lat < 32.64) return 'jordan-river'
  return 'jordan-yarmouk'
}

export interface Stat { max: number; p95: number; mean: number; at: Pt | null; km: number }
export function stat(ds: Array<{ d: number; p: Pt }>, km: number): Stat {
  if (!ds.length) return { max: NaN, p95: NaN, mean: NaN, at: null, km }
  const s = [...ds].sort((x, y) => x.d - y.d)
  const worst = s[s.length - 1]
  return { max: Math.round(worst.d), p95: Math.round(s[Math.floor(s.length * 0.95)].d), mean: Math.round(s.reduce((t, x) => t + x.d, 0) / s.length), at: [Math.round(worst.p[1] * 1e4) / 1e4, Math.round(worst.p[0] * 1e4) / 1e4], km }
}

/** Écart d'un candidat (des arêtes ou des lignes) à la vérité, segment par segment, dans les deux sens. */
export function compare(truthEdges: Array<{ seg: string; a: Pt; b: Pt }>, candEdges: Array<{ a: Pt; b: Pt }>): Record<string, { fwd: Stat; rev: Stat }> {
  const truthAll = new Lines()
  for (const e of truthEdges) truthAll.add(e.a, e.b)
  const cand = new Lines()
  for (const e of candEdges) cand.add(e.a, e.b)
  const res: Record<string, { fwd: Stat; rev: Stat }> = {}
  for (const seg of SEGS) {
    const mine = truthEdges.filter((e) => e.seg === seg)
    const truthSeg = new Lines()
    for (const e of mine) truthSeg.add(e.a, e.b)
    const ds: Array<{ d: number; p: Pt }> = []
    const rs: Array<{ d: number; p: Pt }> = []
    let km = 0
    for (const e of mine) {
      km += Math.hypot((e.b[0] - e.a[0]) * KX, (e.b[1] - e.a[1]) * KY) / 1000
      for (const p of dense(e.a, e.b)) ds.push({ d: cand.dist(p), p })
    }
    /* Le sens inverse : les points du candidat qui sont « en face » de ce segment (plus près de lui que d'un autre). */
    for (const e of candEdges)
      for (const p of dense(e.a, e.b)) {
        const d = truthSeg.dist(p, 3000)
        if (d < 3000 && d <= truthAll.dist(p, 3000) + 0.01) rs.push({ d, p })
      }
    res[seg] = { fwd: stat(ds, Math.round(km)), rev: stat(rs, Math.round(km)) }
  }
  return res
}
export const edgesOfLines = (lines: Pt[][]) => lines.flatMap((l) => l.slice(1).map((b, i) => ({ a: l[i], b })))

const coastOf = (lng: number, lat: number) =>
  lat < 29.7 ? 'eilat' : lat > 33.095 ? 'lebanon-coast' : lat > 32.4 ? 'coast-north' : lat > 31.6 ? 'coast-centre' : lat > 31.22 ? 'gaza-coast' : 'sinai-coast'
const offFrame = (p: Pt) => !(p[0] < W + 0.001 || p[0] > E - 0.001 || p[1] < S + 0.001 || p[1] > N - 0.001)
export function coastVs(coastIn: Pt[][], seaShape: MultiPolygon): Record<string, { fwd: Stat; rev: Stat }> {
  const coastLines = new Lines()
  for (const l of coastIn) for (let i = 0; i + 1 < l.length; i++) coastLines.add(l[i], l[i + 1])
  const L = new Lines()
  for (const poly of seaShape) for (const r of poly) for (let i = 0; i + 1 < r.length; i++) L.add(r[i] as Pt, r[i + 1] as Pt)
  const fw: Record<string, Array<{ d: number; p: Pt }>> = {}
  const rv: Record<string, Array<{ d: number; p: Pt }>> = {}
  for (const l of coastIn) {
    const island = l[0][0] === l[l.length - 1][0] && l[0][1] === l[l.length - 1][1]
    for (let i = 0; i + 1 < l.length; i++)
      for (const p of dense(l[i], l[i + 1])) if (offFrame(p)) (fw[island ? 'islands' : coastOf(p[0], p[1])] ??= []).push({ d: L.dist(p), p })
  }
  for (const poly of seaShape)
    for (const r of poly)
      for (let i = 0; i + 1 < r.length; i++)
        for (const p of dense(r[i] as Pt, r[i + 1] as Pt)) if (offFrame(p)) (rv[coastOf(p[0], p[1])] ??= []).push({ d: coastLines.dist(p), p })
  return Object.fromEntries(Object.keys(fw).map((k) => [k, { fwd: stat(fw[k], Math.round((fw[k].length * 10) / 1000)), rev: stat(rv[k] ?? [], 0) }]))
}

/** Le cours du Jourdain (Kinneret → mer Morte), un point tous les 10 m. */
export const riverOf = (geo: Geo): Pt[] => geo.jordanRiver.flatMap((l) => l.slice(1).flatMap((b, i) => dense(l[i], b))).filter((p) => p[1] > 31.77 && p[1] < 32.64)
export function riverVs(river: Pt[], edges: Array<{ a: Pt; b: Pt }>): Stat {
  const L = new Lines()
  for (const e of edges) L.add(e.a, e.b)
  return stat(river.map((p) => ({ d: L.dist(p), p })), Math.round((river.length * 10) / 1000))
}
