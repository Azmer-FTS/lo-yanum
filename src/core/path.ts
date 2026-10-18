import { haversineKm, ringAreaDunams, simplifyPath } from './geo'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★★ BK (2026-10-18) — LE TRACÉ ÉDITABLE, ET LA FORME RÉELLE QU'ON EN TIRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Je n'arrive tout simplement pas à modifier un tracé. »       — le PO
 *
 * Le PO a un passé de designer industriel : la référence est l'outil plume
 * d'Illustrator. Un tracé est une suite de NŒUDS ; un nœud est un COIN (aucune
 * poignée : l'arête arrive et repart en ligne droite) ou un nœud ARRONDI (deux
 * poignées alignées qui règlent la courbe de part et d'autre, pour épouser le
 * tracé d'une route).
 *
 * ★ DEUX REPRÉSENTATIONS LIÉES, ET C'EST LA CONTRAINTE DE LA PASSE.
 *   Une carte stocke des coordonnées, pas des courbes. Si l'on densifiait une
 *   courbe en points rapprochés et qu'on ne gardait que cela, le PO perdrait
 *   ses poignées en rouvrant la forme — pour toujours. Donc :
 *     · LE MODÈLE (`PathModel`) : les nœuds, leur nature, leurs poignées. C'est
 *       ce que le PO manipule, et c'est ce qui est enregistré à côté de la
 *       forme (`zones.path`, `lo-yanum:region-paths`) ;
 *     · LA FORME RÉELLE (`densify`) : l'anneau de coordonnées calculé à partir
 *       du modèle. C'est ce que la carte dessine, et ce que TOUTES les mesures
 *       de surface lisent (`ringAreaDunams`) — la tuile « מדוד » et
 *       l'étiquette de la carte restent égales (`bipass` A501).
 *   Une arête entre deux coins n'est PAS densifiée : une forme faite de coins
 *   rend exactement ses sommets. Une forme ancienne (sans modèle) se reprend
 *   donc comme une suite de coins (`fromRing`) sans qu'un seul point bouge.
 *
 * ★ LE MODÈLE EST-IL ENCORE CELUI DE L'ANNEAU ? (`modelForRing`) Un build
 *   d'avant BK, ou un autre écran, peut réécrire l'anneau sans toucher au
 *   modèle. Le modèle n'est repris que s'il redonne EXACTEMENT l'anneau
 *   enregistré ; sinon l'anneau gagne, repris en coins. Jamais l'inverse : la
 *   forme réelle est la donnée, le modèle est sa manière d'être éditée.
 *
 * Les poignées sont des DÉCALAGES (en degrés) depuis leur nœud : déplacer le
 * nœud les emporte. Les angles et les longueurs sont jugés dans un plan
 * local en MÈTRES (la longitude rétrécit avec le cosinus de la latitude) :
 * « alignées » veut dire alignées à l'écran, pas dans les degrés.
 *
 * ⚠️ CE FICHIER EST PUR : `bkedit` le rejoue sans navigateur.
 */

export type NodeKind = 'corner' | 'smooth'

export interface PathNode {
  lat: number
  lng: number
  kind: NodeKind
  /** Poignée d'entrée (vers le nœud précédent), en décalage de degrés. Absente = coin de ce côté. */
  hIn?: LatLng
  /** Poignée de sortie (vers le nœud suivant). */
  hOut?: LatLng
}

export interface PathModel {
  v: 1
  closed: boolean
  nodes: PathNode[]
}

export const MIN_CLOSED_NODES = 3

// ---------------------------------------------------------------------------
// Le plan local en mètres
// ---------------------------------------------------------------------------

const M_PER_DEG_LAT = 110_574
const mPerDegLng = (lat: number): number => 111_320 * Math.cos((lat * Math.PI) / 180)

/** Un décalage en degrés → en mètres (x vers l'est, y vers le nord), autour de `lat`. */
function toM(d: LatLng, lat: number): { x: number; y: number } {
  return { x: d.lng * mPerDegLng(lat), y: d.lat * M_PER_DEG_LAT }
}
function fromM(v: { x: number; y: number }, lat: number): LatLng {
  return { lat: v.y / M_PER_DEG_LAT, lng: v.x / mPerDegLng(lat) }
}
const len = (v: { x: number; y: number }): number => Math.hypot(v.x, v.y)

export function distanceM(a: LatLng, b: LatLng): number {
  return haversineKm(a, b) * 1000
}

// ---------------------------------------------------------------------------
// Construire, lire, valider
// ---------------------------------------------------------------------------

const point = (n: LatLng): LatLng => ({ lat: n.lat, lng: n.lng })
const add = (a: LatLng, b: LatLng): LatLng => ({ lat: a.lat + b.lat, lng: a.lng + b.lng })
const sub = (a: LatLng, b: LatLng): LatLng => ({ lat: a.lat - b.lat, lng: a.lng - b.lng })
const scale = (a: LatLng, k: number): LatLng => ({ lat: a.lat * k, lng: a.lng * k })
const lerp = (a: LatLng, b: LatLng, t: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })

/** Une forme ancienne, sans modèle : chaque sommet devient un coin. Rien ne bouge. */
export function fromRing(ring: readonly LatLng[], closed = true): PathModel {
  return { v: 1, closed, nodes: ring.map((p) => ({ lat: p.lat, lng: p.lng, kind: 'corner' as const })) }
}

export function emptyPath(): PathModel {
  return { v: 1, closed: false, nodes: [] }
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
function sanePoint(v: unknown): LatLng | undefined {
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  return finite(o.lat) && finite(o.lng) ? { lat: o.lat, lng: o.lng } : undefined
}

/** Une valeur venue de la base ou du stockage : un modèle lisible, ou `null`. */
export function parsePath(raw: unknown): PathModel | null {
  let v = raw
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v) as unknown
    } catch {
      return null
    }
  }
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (o.v !== 1 || !Array.isArray(o.nodes)) return null
  const nodes: PathNode[] = []
  for (const n of o.nodes) {
    const p = sanePoint(n)
    if (!p) return null
    const kind = (n as Record<string, unknown>).kind === 'smooth' ? 'smooth' : 'corner'
    const hIn = sanePoint((n as Record<string, unknown>).hIn)
    const hOut = sanePoint((n as Record<string, unknown>).hOut)
    nodes.push({ ...p, kind, ...(hIn ? { hIn } : {}), ...(hOut ? { hOut } : {}) })
  }
  return { v: 1, closed: o.closed === true, nodes }
}

// ---------------------------------------------------------------------------
// La forme réelle : la densification
// ---------------------------------------------------------------------------

/** Les quatre points de contrôle du segment `i` (du nœud `i` au suivant). */
export function segmentControls(m: PathModel, i: number): [LatLng, LatLng, LatLng, LatLng] {
  const a = m.nodes[i]
  const b = m.nodes[(i + 1) % m.nodes.length]
  const p0 = point(a)
  const p3 = point(b)
  const p1 = a.hOut ? add(p0, a.hOut) : p0
  const p2 = b.hIn ? add(p3, b.hIn) : p3
  return [p0, p1, p2, p3]
}

export function segmentIsStraight(m: PathModel, i: number): boolean {
  const a = m.nodes[i]
  const b = m.nodes[(i + 1) % m.nodes.length]
  return !a.hOut && !b.hIn
}

export const segmentCount = (m: PathModel): number => (m.nodes.length < 2 ? 0 : m.closed ? m.nodes.length : m.nodes.length - 1)

export function bezierAt(c: readonly [LatLng, LatLng, LatLng, LatLng], t: number): LatLng {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const cc = 3 * u * t * t
  const d = t * t * t
  return {
    lat: a * c[0].lat + b * c[1].lat + cc * c[2].lat + d * c[3].lat,
    lng: a * c[0].lng + b * c[1].lng + cc * c[2].lng + d * c[3].lng,
  }
}

/**
 * Combien de points pour une courbe : assez pour que l'écart à la vraie courbe
 * reste sous ~0,5 % de sa corde (et sous 25 cm pour un enclos), jamais plus de
 * 48 — une forme de vingt nœuds arrondis reste sous mille sommets en base.
 */
function stepsFor(c: readonly [LatLng, LatLng, LatLng, LatLng]): number {
  const lat = c[0].lat
  const poly = len(toM(sub(c[1], c[0]), lat)) + len(toM(sub(c[2], c[1]), lat)) + len(toM(sub(c[3], c[2]), lat))
  const chord = len(toM(sub(c[3], c[0]), lat))
  const bulge = Math.max(0, poly - chord)
  if (bulge < 1e-6) return 1
  /* L'écart d'une corde de N pas à la courbe décroît en 1/N² ; viser ~0,5 %. */
  const n = Math.ceil(Math.sqrt(bulge / Math.max(0.25, chord * 0.005)) * 4)
  return Math.max(4, Math.min(48, n))
}

/**
 * ★ LA FORME RÉELLE. Pour un tracé fermé : l'anneau, ouvert (le dernier
 * sommet rejoint le premier, comme `FarmZone.ring`). Pour un tracé ouvert : la
 * ligne. Un segment droit ne rend que son nœud de départ.
 */
export function densify(m: PathModel): LatLng[] {
  const out: LatLng[] = []
  const n = m.nodes.length
  if (n === 0) return out
  const segs = segmentCount(m)
  for (let i = 0; i < segs; i++) {
    out.push(point(m.nodes[i]))
    if (segmentIsStraight(m, i)) continue
    const c = segmentControls(m, i)
    const steps = stepsFor(c)
    for (let k = 1; k < steps; k++) out.push(bezierAt(c, k / steps))
  }
  if (!m.closed) out.push(point(m.nodes[n - 1]))
  return out
}

/** La surface de la forme réelle — le même calcul que partout ailleurs. */
export function pathAreaDunams(m: PathModel): number {
  return m.closed ? ringAreaDunams(densify(m)) : 0
}

/** Deux anneaux identiques à un milliardième de degré près (un aller-retour Postgres). */
export function sameRing(a: readonly LatLng[], b: readonly LatLng[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].lat - b[i].lat) > 1e-9 || Math.abs(a[i].lng - b[i].lng) > 1e-9) return false
  }
  return true
}

/**
 * ★ LE MODÈLE À ÉDITER POUR UN ANNEAU ENREGISTRÉ. Le modèle n'est repris que
 * s'il redonne exactement cet anneau ; sinon (pas de modèle, modèle illisible,
 * ou anneau réécrit ailleurs) l'anneau est repris en coins.
 */
export function modelForRing(ring: readonly LatLng[], stored: unknown): { model: PathModel; source: 'model' | 'ring' } {
  const parsed = parsePath(stored)
  if (parsed && parsed.closed && parsed.nodes.length >= MIN_CLOSED_NODES && sameRing(densify(parsed), ring)) return { model: parsed, source: 'model' }
  return { model: fromRing(ring, true), source: 'ring' }
}

/** Le modèle a-t-il au moins une courbe ? (Sinon l'anneau suffit à le décrire.) */
export const hasCurves = (m: PathModel): boolean => m.nodes.some((n) => n.hIn || n.hOut)

// ---------------------------------------------------------------------------
// Les gestes — chacun rend un NOUVEAU modèle
// ---------------------------------------------------------------------------

const clone = (m: PathModel): PathModel => ({ v: 1, closed: m.closed, nodes: m.nodes.map((n) => ({ ...n })) })

/** Déplacer le nœud `i` : ses poignées le suivent. */
export function moveNode(m: PathModel, i: number, to: LatLng): PathModel {
  const out = clone(m)
  out.nodes[i] = { ...out.nodes[i], lat: to.lat, lng: to.lng }
  return out
}

/** Déplacer toute la forme. */
export function translatePath(m: PathModel, dLat: number, dLng: number): PathModel {
  const out = clone(m)
  out.nodes = out.nodes.map((n) => ({ ...n, lat: n.lat + dLat, lng: n.lng + dLng }))
  return out
}

/**
 * Tirer une poignée jusqu'à `to` (position ABSOLUE). Sur un nœud arrondi,
 * l'autre poignée tourne pour rester alignée et GARDE SA LONGUEUR — c'est ce
 * que fait Illustrator, et c'est ce qui permet de régler une seule moitié de
 * la courbe sans défaire l'autre.
 */
export function moveHandle(m: PathModel, i: number, which: 'in' | 'out', to: LatLng): PathModel {
  const out = clone(m)
  const n = out.nodes[i]
  const off = sub(to, n)
  const tooShort = len(toM(off, n.lat)) < 0.01
  const node: PathNode = { ...n, kind: 'smooth' }
  if (which === 'out') node.hOut = tooShort ? undefined : off
  else node.hIn = tooShort ? undefined : off
  const other = which === 'out' ? 'hIn' : 'hOut'
  if (!tooShort) {
    const dir = toM(off, n.lat)
    const d = len(dir)
    const keep = node[other] ? len(toM(node[other] as LatLng, n.lat)) : d
    node[other] = fromM({ x: (-dir.x / d) * keep, y: (-dir.y / d) * keep }, n.lat)
  }
  if (!node.hIn && !node.hOut) node.kind = 'corner'
  out.nodes[i] = node
  return out
}

/**
 * Les poignées automatiques d'un nœud qu'on arrondit : alignées sur la
 * direction précédent → suivant, d'un tiers de la distance à chaque voisin.
 * C'est la courbe qui passe « naturellement » par le nœud.
 */
function autoHandles(m: PathModel, i: number): { hIn?: LatLng; hOut?: LatLng } {
  const n = m.nodes.length
  const node = m.nodes[i]
  const hasPrev = m.closed || i > 0
  const hasNext = m.closed || i < n - 1
  const prev = hasPrev ? m.nodes[(i - 1 + n) % n] : node
  const next = hasNext ? m.nodes[(i + 1) % n] : node
  const dir = toM(sub(next, prev), node.lat)
  const d = len(dir)
  if (d < 1e-9) return {}
  const u = { x: dir.x / d, y: dir.y / d }
  const lp = len(toM(sub(node, prev), node.lat)) / 3
  const ln = len(toM(sub(next, node), node.lat)) / 3
  return {
    ...(hasPrev && lp > 0 ? { hIn: fromM({ x: -u.x * lp, y: -u.y * lp }, node.lat) } : {}),
    ...(hasNext && ln > 0 ? { hOut: fromM({ x: u.x * ln, y: u.y * ln }, node.lat) } : {}),
  }
}

/** ★ Passer un nœud de coin en arrondi (poignées automatiques), ou l'inverse (poignées retirées). */
export function setNodeKind(m: PathModel, i: number, kind: NodeKind): PathModel {
  const out = clone(m)
  const n = out.nodes[i]
  if (kind === 'corner') out.nodes[i] = { lat: n.lat, lng: n.lng, kind: 'corner' }
  else out.nodes[i] = { lat: n.lat, lng: n.lng, kind: 'smooth', ...autoHandles(m, i) }
  return out
}

export const toggleNodeKind = (m: PathModel, i: number): PathModel => setNodeKind(m, i, m.nodes[i].kind === 'smooth' ? 'corner' : 'smooth')

/**
 * ★ AJOUTER UN NŒUD SUR UN SEGMENT, SANS CHANGER LA COURBE. Sur un segment
 * droit, un coin au point `t`. Sur une courbe, la découpe de de Casteljau : les
 * deux moitiés redonnent exactement la courbe d'avant, et le nouveau nœud est
 * arrondi, ses poignées alignées.
 */
export function insertNode(m: PathModel, seg: number, t: number): { model: PathModel; index: number } {
  const out = clone(m)
  const n = out.nodes.length
  const ia = seg
  const ib = (seg + 1) % n
  const at = seg + 1
  if (segmentIsStraight(m, seg)) {
    const p = lerp(m.nodes[ia], m.nodes[ib], t)
    out.nodes.splice(at, 0, { lat: p.lat, lng: p.lng, kind: 'corner' })
    return { model: out, index: at }
  }
  const [p0, p1, p2, p3] = segmentControls(m, seg)
  const a = lerp(p0, p1, t)
  const b = lerp(p1, p2, t)
  const c = lerp(p2, p3, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const mid = lerp(d, e, t)
  const A = out.nodes[ia]
  const B = out.nodes[ib]
  out.nodes[ia] = { ...A, ...(A.hOut ? { hOut: sub(a, p0) } : {}) }
  out.nodes[ib] = { ...B, ...(B.hIn ? { hIn: sub(c, p3) } : {}) }
  out.nodes.splice(at, 0, { lat: mid.lat, lng: mid.lng, kind: 'smooth', hIn: sub(d, mid), hOut: sub(e, mid) })
  return { model: out, index: at }
}

export type RemoveNodeResult = { ok: true; model: PathModel } | { ok: false; reason: 'min-nodes' }

/** Retirer un nœud. Une forme fermée en garde trois au moins (sinon ce n'est plus une surface). */
export function removeNode(m: PathModel, i: number): RemoveNodeResult {
  if (m.closed && m.nodes.length <= MIN_CLOSED_NODES) return { ok: false, reason: 'min-nodes' }
  const out = clone(m)
  out.nodes.splice(i, 1)
  return { ok: true, model: out }
}

/** La plume : un nœud au bout du tracé ouvert. Avec `drag`, il est arrondi (poignée de sortie = le glissé). */
export function appendNode(m: PathModel, p: LatLng, dragTo?: LatLng): PathModel {
  const out = clone(m)
  if (dragTo && len(toM(sub(dragTo, p), p.lat)) > 0.5) {
    const hOut = sub(dragTo, p)
    out.nodes.push({ lat: p.lat, lng: p.lng, kind: 'smooth', hOut, hIn: scale(hOut, -1) })
  } else out.nodes.push({ lat: p.lat, lng: p.lng, kind: 'corner' })
  return out
}

/** Fermer le tracé (trois nœuds au moins). */
export function closePath(m: PathModel): PathModel | null {
  if (m.nodes.length < MIN_CLOSED_NODES) return null
  return { ...clone(m), closed: true }
}

/** Le point de la forme le plus proche de `p` : segment, paramètre, distance en mètres. */
export function nearestOnPath(m: PathModel, p: LatLng): { seg: number; t: number; point: LatLng; distM: number } | null {
  const segs = segmentCount(m)
  let best: { seg: number; t: number; point: LatLng; distM: number } | null = null
  for (let s = 0; s < segs; s++) {
    const straight = segmentIsStraight(m, s)
    const c = segmentControls(m, s)
    const steps = straight ? 1 : Math.max(16, stepsFor(c) * 2)
    for (let k = 0; k < steps; k++) {
      const a = straight ? c[0] : bezierAt(c, k / steps)
      const b = straight ? c[3] : bezierAt(c, (k + 1) / steps)
      const v = toM(sub(b, a), p.lat)
      const w = toM(sub(p, a), p.lat)
      const L2 = v.x * v.x + v.y * v.y
      const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, (w.x * v.x + w.y * v.y) / L2))
      const q = lerp(a, b, u)
      const dist = len(toM(sub(p, q), p.lat))
      if (!best || dist < best.distM) best = { seg: s, t: straight ? u : (k + u) / steps, point: q, distM: dist }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// La main levée : un trait → des nœuds
// ---------------------------------------------------------------------------

/**
 * ★ UN TRAIT DE MAIN LEVÉE DEVIENT UN TRACÉ DE NŒUDS. Le trait est d'abord
 * simplifié (Douglas–Peucker, tolérance tirée du zoom comme pour BI) ; chaque
 * point gardé devient un nœud : un COIN là où la main a tourné franchement
 * (plus de 55°), un nœud ARRONDI ailleurs, ses poignées calées sur ses voisins
 * (Catmull–Rom) — la courbe repasse par où la main est passée, et chaque nœud
 * reste réglable à la poignée.
 */
export function fitStroke(stroke: readonly LatLng[], toleranceM: number, closed: boolean): PathNode[] {
  const pts = stroke.length > 2 ? simplifyPath([...stroke], toleranceM) : [...stroke]
  if (closed && pts.length > 3 && distanceM(pts[0], pts[pts.length - 1]) < toleranceM * 4) pts.pop()
  const n = pts.length
  const nodes: PathNode[] = []
  for (let i = 0; i < n; i++) {
    const p = pts[i]
    const hasPrev = closed || i > 0
    const hasNext = closed || i < n - 1
    if (!hasPrev || !hasNext) {
      nodes.push({ lat: p.lat, lng: p.lng, kind: 'corner' })
      continue
    }
    const prev = pts[(i - 1 + n) % n]
    const next = pts[(i + 1) % n]
    const a = toM(sub(p, prev), p.lat)
    const b = toM(sub(next, p), p.lat)
    const turn = Math.abs(Math.atan2(a.x * b.y - a.y * b.x, a.x * b.x + a.y * b.y)) * (180 / Math.PI)
    if (turn > 55) {
      nodes.push({ lat: p.lat, lng: p.lng, kind: 'corner' })
      continue
    }
    const tan = scale(sub(next, prev), 1 / 6)
    nodes.push({ lat: p.lat, lng: p.lng, kind: 'smooth', hIn: scale(tan, -1), hOut: tan })
  }
  return nodes
}

/**
 * ★ LA MAIN LEVÉE SUR UNE FORME EXISTANTE (le crayon d'Illustrator). Un trait
 * qui part PRÈS de la forme et y revient remplace la portion entre ces deux
 * endroits — celle que le trait a longée, pas l'autre. Un trait qui ne part
 * pas de la forme ne la touche pas : `null`, et l'écran le dit.
 */
export function redrawSection(m: PathModel, stroke: readonly LatLng[], toleranceM: number, snapM: number): PathModel | null {
  if (!m.closed || stroke.length < 2) return null
  const near = (p: LatLng) => {
    let bi = -1
    let bd = Infinity
    m.nodes.forEach((n, i) => {
      const d = distanceM(n, p)
      if (d < bd) {
        bd = d
        bi = i
      }
    })
    return { i: bi, d: bd }
  }
  const s = near(stroke[0])
  const e = near(stroke[stroke.length - 1])
  if (s.d > snapM || e.d > snapM || s.i === e.i) return null
  const n = m.nodes.length
  /* Les deux arcs entre s et e ; on remplace celui dont le milieu est le plus proche du trait. */
  const arc = (from: number, to: number) => {
    const out: number[] = []
    for (let k = (from + 1) % n; k !== to; k = (k + 1) % n) out.push(k)
    return out
  }
  const fwd = arc(s.i, e.i)
  const bwd = arc(e.i, s.i)
  const mid = stroke[Math.floor(stroke.length / 2)]
  /* La distance du milieu du trait à l'arc (ses cordes, extrémités comprises) : un arc vide est le segment direct. */
  const toSeg = (p: LatLng, a: LatLng, b: LatLng) => {
    const v = toM(sub(b, a), p.lat)
    const w = toM(sub(p, a), p.lat)
    const L2 = v.x * v.x + v.y * v.y
    const u = L2 === 0 ? 0 : Math.max(0, Math.min(1, (w.x * v.x + w.y * v.y) / L2))
    return len({ x: w.x - u * v.x, y: w.y - u * v.y })
  }
  const score = (chain: number[]) => {
    let best = Infinity
    for (let k = 0; k + 1 < chain.length; k++) best = Math.min(best, toSeg(mid, m.nodes[chain[k]], m.nodes[chain[k + 1]]))
    return best
  }
  const fwdChain = [s.i, ...fwd, e.i]
  const bwdChain = [e.i, ...bwd, s.i]
  const inner = fitStroke(stroke, toleranceM, false).slice(1, -1)
  const nodes = m.nodes.map((x) => ({ ...x }))
  const startNode = { ...nodes[s.i], ...{ hOut: undefined } }
  const endNode = { ...nodes[e.i], ...{ hIn: undefined } }
  let next: PathNode[]
  if (score(fwdChain) <= score(bwdChain)) {
    /* s → (trait) → e, puis le reste de e à s. */
    const rest: PathNode[] = []
    for (let k = (e.i + 1) % n; k !== s.i; k = (k + 1) % n) rest.push(nodes[k])
    next = [startNode, ...inner, endNode, ...rest]
  } else {
    /* le trait va de s vers e en passant par l'autre côté : on le parcourt à l'envers. */
    const rest: PathNode[] = []
    for (let k = (s.i + 1) % n; k !== e.i; k = (k + 1) % n) rest.push(nodes[k])
    const back = [...inner].reverse().map((x) => ({ ...x, hIn: x.hOut, hOut: x.hIn }))
    next = [{ ...endNode, hOut: undefined, hIn: nodes[e.i].hIn }, ...back, { ...startNode, hIn: undefined, hOut: nodes[s.i].hOut }, ...rest]
  }
  const clean = next.map((x) => {
    const o: PathNode = { lat: x.lat, lng: x.lng, kind: x.kind }
    if (x.hIn) o.hIn = x.hIn
    if (x.hOut) o.hOut = x.hOut
    if (!o.hIn && !o.hOut) o.kind = 'corner'
    return o
  })
  if (clean.length < MIN_CLOSED_NODES) return null
  return { v: 1, closed: true, nodes: clean }
}

/** Prolonger un tracé OUVERT par un trait : le trait part du dernier nœud. */
export function extendWithStroke(m: PathModel, stroke: readonly LatLng[], toleranceM: number): PathModel {
  const fitted = fitStroke(stroke, toleranceM, false)
  const out = clone(m)
  const first = fitted[0]
  /* Le premier point du trait est l'endroit où la main s'est posée : s'il touche le dernier nœud, il est ce nœud. */
  const start = out.nodes.length > 0 && first && distanceM(out.nodes[out.nodes.length - 1], first) < toleranceM * 4 ? 1 : 0
  out.nodes.push(...fitted.slice(start))
  return out
}

// ---------------------------------------------------------------------------
// L'historique : annuler, refaire, autant de fois qu'il le faut
// ---------------------------------------------------------------------------

export interface History<T> {
  past: T[]
  present: T
  future: T[]
}

/** Assez pour une longue séance ; au-delà, le plus ancien geste tombe. */
export const HISTORY_DEPTH = 500

export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] })

export function pushHistory<T>(h: History<T>, next: T): History<T> {
  const past = [...h.past, h.present]
  return { past: past.length > HISTORY_DEPTH ? past.slice(past.length - HISTORY_DEPTH) : past, present: next, future: [] }
}
export function undoHistory<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}
export function redoHistory<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}
