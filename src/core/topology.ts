import polygonClipping from 'polygon-clipping'
import type { MultiPolygon, Polygon } from 'polygon-clipping'

import { ringAreaDunams } from './geo'
import abroadData from './abroad.json'
import seaData from './sea.json'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BL (chantier 3) — LES RÉGIONS SE TIENNENT ENTRE ELLES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Celle qui dépasse dans la mer, aucun intérêt. Et entre elles, il ne faut
 *     pas qu'il y ait de superposition. Un secteur ne peut pas en superposer
 *     un autre. »                                                    — le PO
 *
 * La géométrie des régions, PURE (`blpass` la rejoue sans navigateur). Les
 * opérations booléennes sont celles de `polygon-clipping` (balayage de
 * Martinez, robuste aux arêtes confondues — précisément le cas de deux
 * régions qui partagent une frontière). On calcule en degrés bruts : sur un
 * pays de 400 km, l'écart avec un plan en mètres est sans effet sur une
 * différence ou une intersection (les SURFACES, elles, sont mesurées par
 * `ringAreaDunams`, sur la sphère).
 *
 * ★ 3.1 — LA MER EST UN MASQUE, PAS UNE RÉÉCRITURE. `sea.json` (la mer des
 *   tuiles de la carte, `scripts/blsea.ts`) est retirée de chaque région
 *   quand on la MESURE ou qu'on la COMPARE (`landOf`) : surfaces, recouvrements,
 *   poussage, aplats de l'écran d'édition. Le tracé enregistré du PO n'est pas
 *   réécrit — comme un masque d'écrêtage d'Illustrator : ce qui dépasse dans
 *   la mer ne compte pas et ne se voit pas, et rien n'est perdu.
 *
 * ★ 3.2 — L'AU-DELÀ DES FRONTIÈRES, OPTION A (DÉCIDÉE PAR LE PO, 2026-10-19) :
 *   « le sud, plus la Jordanie le long du Jourdain, la Syrie, le Liban et
 *   Gaza ; la Judée-Samarie et le Golan restent dedans ». `abroad.json`
 *   (`scripts/blabroad.ts`, depuis les lignes de la carte) est retiré EXACTEMENT
 *   comme la mer : un masque de mesure et d'affichage, jamais une réécriture
 *   du tracé — revenir sur la décision, c'est retirer une zone du fichier.
 *
 * ★ 3.3 — LA RÈGLE DE PARTAGE, EN UNE PHRASE (`winnerOf`) :
 *     « Le terrain que deux régions se disputent reste à celle que vous avez
 *       dessinée vous-même ; si les deux le sont, ou aucune, à la plus petite. »
 *   Votre tracé n'est jamais rogné au profit d'une approximation d'X12 ; et
 *   entre égales, la plus petite est la plus précise (la mer Morte dans la
 *   Judée, la vallée dans la Samarie) et la plus grande perd la plus petite
 *   part d'elle-même.
 *
 * ★ 3.4 — LE POUSSAGE (`pushNeighbors`) : la région en cours d'édition gagne.
 *   Ce qu'elle a GAGNÉ depuis l'ouverture (et pas ce qu'elle recouvrait déjà —
 *   ça, c'est le travail de 3.3, que le PO déclenche) est retiré de ses
 *   voisines. Une voisine qui serait coupée en deux, percée, ou réduite à
 *   moins de `minShare` de sa surface d'ouverture n'est PAS recoupée : le
 *   poussage s'arrête là, et l'appelant le dit.
 *
 * ⚠️ UNE RÉGION EST UN ANNEAU, UN SEUL. Une découpe qui rendrait deux morceaux
 *    ou un trou n'est donc jamais appliquée : refusée, avec sa raison. Les
 *    éclats de moins d'un demi-dounam (le bruit de l'arithmétique sur deux
 *    bords confondus) sont ignorés, et comptés.
 */

export type Shape = MultiPolygon

/** Un éclat d'arithmétique : sous ce seuil, un morceau ou un trou n'existe pas. */
export const SLIVER_DUNAMS = 0.5
/** Un recouvrement de moins d'un dounam (1 000 m²) n'est pas un conflit. */
export const MIN_OVERLAP_DUNAMS = 1
/** Le poussage s'arrête avant qu'une voisine ne tombe sous le dixième de sa surface d'ouverture. */
export const MIN_SHARE = 0.1

const SEA = (seaData as { sea: number[][][][] }).sea as unknown as MultiPolygon

/** ★★ BL (3.2, option A) — les zones au-delà des frontières retenues, chacune nommée. */
export type AbroadZone = 'egypt' | 'jordan' | 'syria' | 'lebanon' | 'gaza'
const ABROAD = (abroadData as unknown as { zones: Record<AbroadZone, MultiPolygon> }).zones
export const ABROAD_ZONES = Object.keys(ABROAD) as AbroadZone[]

// ---------------------------------------------------------------------------
// Conversions et mesures
// ---------------------------------------------------------------------------

export function toPolygon(ring: readonly LatLng[]): Polygon {
  const r = ring.map((p) => [p.lng, p.lat] as [number, number])
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]])
  return [r]
}

const ringLatLng = (r: ReadonlyArray<readonly [number, number] | number[]>): LatLng[] => {
  const pts = r.map((q) => ({ lat: q[1], lng: q[0] }))
  /* L'anneau de polygon-clipping est fermé (dernier = premier) ; le nôtre ne l'est pas. */
  if (pts.length > 1 && pts[0].lat === pts[pts.length - 1].lat && pts[0].lng === pts[pts.length - 1].lng) pts.pop()
  return pts
}

/** La surface d'une forme : ses extérieurs moins ses trous, en dounams. */
export function shapeDunams(s: Shape): number {
  let sum = 0
  for (const poly of s) {
    poly.forEach((r, i) => {
      const a = ringAreaDunams(ringLatLng(r))
      sum += i === 0 ? a : -a
    })
  }
  return sum
}

/** Les anneaux extérieurs d'une forme, en `LatLng` (pour la dessiner). */
export function shapeRings(s: Shape): LatLng[][] {
  return s.map((poly) => ringLatLng(poly[0]))
}

interface Box {
  w: number
  s: number
  e: number
  n: number
}
function boxOf(rings: ReadonlyArray<ReadonlyArray<readonly [number, number] | number[]>>): Box {
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const r of rings)
    for (const q of r) {
      if (q[0] < w) w = q[0]
      if (q[0] > e) e = q[0]
      if (q[1] < s) s = q[1]
      if (q[1] > n) n = q[1]
    }
  return { w, s, e, n }
}
const meets = (a: Box, b: Box) => a.w <= b.e && b.w <= a.e && a.s <= b.n && b.s <= a.n
const SEA_BOXES = SEA.map((p) => boxOf(p))
/** Tout ce qui n'est pas « le pays » : la mer, puis chaque zone au-delà. */
const MASKS: Array<{ kind: 'sea' | AbroadZone; poly: Polygon; box: Box }> = [
  ...SEA.map((poly, i) => ({ kind: 'sea' as const, poly, box: SEA_BOXES[i] })),
  ...ABROAD_ZONES.flatMap((k) => ABROAD[k].map((poly) => ({ kind: k, poly, box: boxOf(poly) }))),
]
const masksMeeting = (b: Box, kinds?: ReadonlySet<string>) => MASKS.filter((m) => (!kinds || kinds.has(m.kind)) && meets(b, m.box)).map((m) => m.poly)

// ---------------------------------------------------------------------------
// 3.1 — la mer
// ---------------------------------------------------------------------------

/** La région sans ce qui sort dans la mer (la Méditerranée, le golfe d'Eilat) ni au-delà des frontières (3.2, option A). */
export function landOf(ring: readonly LatLng[]): Shape {
  if (ring.length < 3) return []
  const poly = toPolygon(ring)
  const masks = masksMeeting(boxOf(poly))
  if (masks.length === 0) return [poly]
  return polygonClipping.difference(poly, ...masks)
}

/** `landOf`, gardé en mémoire par anneau : la couche des régions de TOUTES les cartes le redemande à chaque style. */
const landCache = new Map<string, Shape>()
export function landOfCached(ring: readonly LatLng[]): Shape {
  const key = ring.map((p) => `${p.lng},${p.lat}`).join(';')
  let v = landCache.get(key)
  if (!v) {
    v = landOf(ring)
    if (landCache.size > 200) landCache.clear()
    landCache.set(key, v)
  }
  return v
}

/** Ce qu'une région perd dans la mer, en dounams. */
export function seaDunams(ring: readonly LatLng[]): number {
  if (ring.length < 3) return 0
  const poly = toPolygon(ring)
  const seas = masksMeeting(boxOf(poly), new Set(['sea']))
  if (seas.length === 0) return 0
  return shapeDunams(polygonClipping.intersection(poly, seas))
}

/** ★★ BL (3.2) — ce qu'une région perd au-delà de chaque frontière, en dounams (zones touchées seulement). */
export function abroadDunams(ring: readonly LatLng[]): Partial<Record<AbroadZone, number>> {
  const out: Partial<Record<AbroadZone, number>> = {}
  if (ring.length < 3) return out
  const poly = toPolygon(ring)
  const b = boxOf(poly)
  for (const k of ABROAD_ZONES) {
    const ms = masksMeeting(b, new Set([k]))
    if (ms.length === 0) continue
    const d = shapeDunams(polygonClipping.intersection(poly, ms))
    if (d >= SLIVER_DUNAMS) out[k] = d
  }
  return out
}

/** La surface d'une région SUR TERRE : ce que l'application affiche et compare. */
export const landDunams = (ring: readonly LatLng[]): number => shapeDunams(landOf(ring))

// ---------------------------------------------------------------------------
// Découper un anneau
// ---------------------------------------------------------------------------

export type CutResult =
  | { ok: true; ring: LatLng[]; lostDunams: number; slivers: number }
  | { ok: false; reason: 'split' | 'hole' | 'tiny' | 'empty'; pieces: number }

/**
 * Retirer `cutter` de l'anneau `target`. Un anneau doit en sortir : deux
 * morceaux (`split`), un trou (`hole`), rien (`empty`) ou moins de
 * `minDunams` (`tiny`) — refusé, l'anneau d'avant reste.
 */
export function cutRing(target: readonly LatLng[], cutter: Shape, minDunams = 0): CutResult {
  if (cutter.length === 0) return { ok: true, ring: [...target], lostDunams: 0, slivers: 0 }
  const before = landDunams(target)
  const diff = polygonClipping.difference(toPolygon(target), cutter)
  /**
   * ★★ BL (3.2) — UN MORCEAU SE JUGE À SA TERRE. Un bout de tracé resté dans
   *   la mer ou au-delà d'une frontière (masqués) n'est pas un morceau de la
   *   région : le compter coupait « en deux » une région qui ne l'était pas sur
   *   le pays (attrapé par `blpass` A589 : עמק יזרעאל gardait une langue en
   *   Jordanie). Il est abandonné, et compté avec les éclats.
   */
  const raw = diff.filter((p) => ringAreaDunams(ringLatLng(p[0])) >= SLIVER_DUNAMS)
  /* (La terre ne se mesure que s'il y a plusieurs morceaux : c'est le cas rare, et la mesure coûte.) */
  const pieces = raw.length > 1 ? raw.filter((p) => landDunams(ringLatLng(p[0])) >= SLIVER_DUNAMS) : raw
  const slivers = diff.length - pieces.length
  if (pieces.length === 0) return { ok: false, reason: 'empty', pieces: 0 }
  if (pieces.length > 1) return { ok: false, reason: 'split', pieces: pieces.length }
  const holes = pieces[0].slice(1).filter((h) => landDunams(ringLatLng(h)) >= SLIVER_DUNAMS)
  if (holes.length > 0) return { ok: false, reason: 'hole', pieces: 1 }
  const ring = ringLatLng(pieces[0][0])
  const after = landDunams(ring)
  if (after < minDunams) return { ok: false, reason: 'tiny', pieces: 1 }
  return { ok: true, ring, lostDunams: Math.max(0, before - after), slivers }
}

/** Ajouter `extra` à l'anneau `target` (combler un vide) : un seul anneau sans trou, sinon refusé. */
export function growRing(target: readonly LatLng[], extra: Shape): CutResult {
  const u = polygonClipping.union(toPolygon(target), ...(extra.length ? [extra] : []))
  const pieces = u.filter((p) => ringAreaDunams(ringLatLng(p[0])) >= SLIVER_DUNAMS)
  if (pieces.length !== 1) return { ok: false, reason: pieces.length === 0 ? 'empty' : 'split', pieces: pieces.length }
  const holes = pieces[0].slice(1).filter((h) => ringAreaDunams(ringLatLng(h)) >= SLIVER_DUNAMS)
  if (holes.length > 0) return { ok: false, reason: 'hole', pieces: 1 }
  return { ok: true, ring: ringLatLng(pieces[0][0]), lostDunams: 0, slivers: u.length - pieces.length }
}

// ---------------------------------------------------------------------------
// 3.3 — les recouvrements, et la règle de partage
// ---------------------------------------------------------------------------

export interface RegionGeom {
  id: string
  ring: LatLng[]
  /** Redessinée par le PO (sinon : le tracé livré d'X12). */
  drawn: boolean
}

export interface Overlap {
  a: string
  b: string
  /** La surface en litige, sur terre. */
  dunams: number
  shape: Shape
}

/** Tous les recouvrements SUR TERRE de plus d'un dounam, le plus grand d'abord. */
export function overlapsOf(regions: readonly RegionGeom[]): Overlap[] {
  const lands = regions.map((r) => ({ id: r.id, land: landOf(r.ring) }))
  const boxes = lands.map((l) => boxOf(l.land.flat()))
  const out: Overlap[] = []
  for (let i = 0; i < lands.length; i++)
    for (let j = i + 1; j < lands.length; j++) {
      if (lands[i].land.length === 0 || lands[j].land.length === 0 || !meets(boxes[i], boxes[j])) continue
      const shape = polygonClipping.intersection(lands[i].land, lands[j].land)
      const dunams = shapeDunams(shape)
      if (dunams >= MIN_OVERLAP_DUNAMS) out.push({ a: lands[i].id, b: lands[j].id, dunams, shape })
    }
  return out.sort((x, y) => y.dunams - x.dunams)
}

/**
 * ★ LA RÈGLE, EN UNE PHRASE : le terrain disputé reste à la région que le PO a
 *   dessinée lui-même ; si les deux le sont, ou aucune, à la plus petite.
 */
export function winnerOf(a: RegionGeom, b: RegionGeom, landArea: (id: string) => number): string {
  if (a.drawn !== b.drawn) return a.drawn ? a.id : b.id
  return landArea(a.id) <= landArea(b.id) ? a.id : b.id
}

export const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`)

export interface PlannedStep {
  key: string
  a: string
  b: string
  dunams: number
  shape: Shape
  winner: string
  loser: string
  /** Ce que deviendrait le perdant — ou pourquoi on ne peut pas. */
  result: CutResult
  /** Le PO a refusé ce partage : il ajustera la frontière à la main. */
  refused: boolean
}

/**
 * Le plan de résolution, SANS RIEN ÉCRIRE : chaque conflit, son gagnant, et ce
 * que deviendrait le perdant. Les partages acceptés sont appliqués à la suite
 * (le plus grand d'abord), sur les anneaux déjà recoupés ; un partage refusé,
 * ou impossible (le perdant serait coupé en deux, percé, ou réduit à moins du
 * dixième de sa surface), laisse les deux régions telles quelles.
 */
export function planResolutions(regions: readonly RegionGeom[], refused: ReadonlySet<string> = new Set()): { steps: PlannedStep[]; rings: Record<string, LatLng[]> } {
  const byId = new Map(regions.map((r) => [r.id, r]))
  const startArea = new Map(regions.map((r) => [r.id, landDunams(r.ring)]))
  const rings: Record<string, LatLng[]> = Object.fromEntries(regions.map((r) => [r.id, r.ring]))
  const steps: PlannedStep[] = []
  for (const o of overlapsOf(regions)) {
    const key = pairKey(o.a, o.b)
    const winner = winnerOf(byId.get(o.a)!, byId.get(o.b)!, (id) => startArea.get(id) ?? 0)
    const loser = winner === o.a ? o.b : o.a
    const isRefused = refused.has(key)
    /* Le perdant perd le TRACÉ du gagnant : ce qui en dépasse dans la mer ou au-delà est masqué de toute façon. */
    const result = cutRing(rings[loser], [toPolygon(rings[winner])], MIN_SHARE * (startArea.get(loser) ?? 0))
    if (result.ok && !isRefused) rings[loser] = result.ring
    steps.push({ key, a: o.a, b: o.b, dunams: o.dunams, shape: o.shape, winner, loser, result, refused: isRefused })
  }
  return { steps, rings }
}

// ---------------------------------------------------------------------------
// 3.4 — le poussage en direct, et les vides qu'il laisse
// ---------------------------------------------------------------------------

export interface PushNeighbor {
  id: string
  /** L'anneau de la voisine MAINTENANT (déjà recoupé par les gestes d'avant). */
  ring: LatLng[]
  /** Sa surface sur terre à l'ouverture de la session : le dixième en dessous duquel on s'arrête. */
  startDunams: number
}

export interface PushResult {
  /** Les voisines recoupées par CE geste (les autres ne bougent pas). */
  rings: Record<string, LatLng[]>
  /** Le poussage s'arrête : cette voisine serait coupée en deux, percée, ou presque effacée. */
  blocked: { id: string; reason: 'split' | 'hole' | 'tiny' | 'empty' } | null
}

/**
 * La région éditée gagne : ce qu'elle a gagné depuis l'ouverture (`start` →
 * `now`), sur terre, est retiré de chaque voisine qu'il touche. Jamais l'inverse
 * (une voisine ne repousse pas quand on recule : `gapsOf`).
 */
export function pushNeighbors(start: readonly LatLng[], now: readonly LatLng[], neighbors: readonly PushNeighbor[], minShare = MIN_SHARE): PushResult {
  const rings: Record<string, LatLng[]> = {}
  if (now.length < 3) return { rings, blocked: null }
  const gainedAll = start.length >= 3 ? polygonClipping.difference(toPolygon(now), toPolygon(start)) : [toPolygon(now)]
  if (shapeDunams(gainedAll) < SLIVER_DUNAMS) return { rings, blocked: null }
  const gb = boxOf(gainedAll.flat())
  const masks = masksMeeting(gb)
  const gained = masks.length ? polygonClipping.difference(gainedAll, ...masks) : gainedAll
  if (gained.length === 0) return { rings, blocked: null }
  for (const n of neighbors) {
    if (n.ring.length < 3 || !meets(gb, boxOf(toPolygon(n.ring)))) continue
    const inter = polygonClipping.intersection(toPolygon(n.ring), gained)
    if (shapeDunams(inter) < SLIVER_DUNAMS) continue
    const r = cutRing(n.ring, gained, minShare * n.startDunams)
    if (!r.ok) return { rings, blocked: { id: n.id, reason: r.reason } }
    rings[n.id] = r.ring
  }
  return { rings, blocked: null }
}

export interface Gap {
  id: string
  shape: Shape
  dunams: number
}

/**
 * ★ LE VIDE QUE LAISSE UN RECUL. Ce que la voisine a perdu pendant la session
 *   (`start` − `now`) et que la région éditée ne couvre plus : il n'appartient
 *   plus à personne. Il se VOIT (l'éditeur le hachure) et se comble d'un geste
 *   (`fillGap`), jamais tout seul.
 */
export function gapsOf(active: readonly LatLng[], neighborStart: Readonly<Record<string, LatLng[]>>, neighborNow: Readonly<Record<string, LatLng[]>>): Gap[] {
  const out: Gap[] = []
  for (const [id, now] of Object.entries(neighborNow)) {
    const start = neighborStart[id]
    if (!start || start.length < 3 || now.length < 3) continue
    const taken = polygonClipping.difference(toPolygon(start), toPolygon(now))
    if (shapeDunams(taken) < MIN_OVERLAP_DUNAMS) continue
    const free = active.length >= 3 ? polygonClipping.difference(taken, toPolygon(active)) : taken
    const shape = free.filter((p) => ringAreaDunams(ringLatLng(p[0])) >= SLIVER_DUNAMS)
    const dunams = shapeDunams(shape)
    if (dunams >= MIN_OVERLAP_DUNAMS) out.push({ id, shape, dunams })
  }
  return out
}

/** Combler le vide : la voisine s'étend jusqu'à la nouvelle limite. */
export const fillGap = (neighborNow: readonly LatLng[], gap: Gap): CutResult => growRing(neighborNow, gap.shape)
