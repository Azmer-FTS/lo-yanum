/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BK — CHANTIER 2 · LE MODÈLE DU TRACÉ, PORTE PURE.   bun run bkedit
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A540  ★ une forme ancienne (sans modèle) se reprend en COINS, et rend
 *         exactement ses sommets : aucun point ne bouge
 *   A541  ★ les DEUX représentations : le modèle (nœuds, poignées) et la forme
 *         réelle densifiée ; les deux calculs de surface (tuile « מדוד » du
 *         magasin, étiquette de la carte) restent égaux sur la forme densifiée
 *   A542  ★ le modèle n'est repris que s'il redonne l'anneau enregistré ; un
 *         anneau réécrit ailleurs (build d'avant BK) gagne, repris en coins
 *   A543  les gestes : déplacer un nœud (poignées comprises), une poignée
 *         (l'autre reste alignée et garde sa longueur), la forme entière ;
 *         arrondir / remettre en coin ; ajouter un nœud sur un segment SANS
 *         changer la courbe ; retirer un nœud (jamais sous trois)
 *   A544  la plume et la main levée : un nœud posé, un nœud tiré (arrondi),
 *         fermer ; un trait → des nœuds (coins aux virages francs) ; un trait
 *         qui longe une forme remplace CETTE portion et pas l'autre
 *   A545  annuler / refaire : autant de fois qu'il le faut, exactement
 */
import * as path from '../src/core/path'
import type { LatLng } from '../src/core/types'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}

const store = await import('../src/core/store')
const access = await import('../src/core/access')
const geo = await import('../src/core/geo')

const C = { lat: 31.5, lng: 34.9 }
const circle = (n: number, rLat: number, rLng: number): LatLng[] =>
  Array.from({ length: n }, (_, i) => ({ lat: C.lat + rLat * Math.sin((i / n) * 2 * Math.PI), lng: C.lng + rLng * Math.cos((i / n) * 2 * Math.PI) }))
const square = (): LatLng[] => [
  { lat: C.lat, lng: C.lng },
  { lat: C.lat + 0.01, lng: C.lng },
  { lat: C.lat + 0.01, lng: C.lng + 0.012 },
  { lat: C.lat, lng: C.lng + 0.012 },
]
const close = (a: LatLng, b: LatLng, eps = 1e-12) => Math.abs(a.lat - b.lat) <= eps && Math.abs(a.lng - b.lng) <= eps

// ===========================================================================
section('A540 — ★ une forme ancienne se reprend en coins, sans qu’un point bouge')
{
  for (const ring of [circle(31, 0.0016, 0.0023), circle(23, 0.016, 0.018), circle(17, 0.0006, 0.0006)]) {
    const m = path.fromRing(ring)
    check(`A540 ${ring.length} sommets → ${m.nodes.length} coins, tous « corner », aucune poignée`, m.nodes.length === ring.length && m.nodes.every((n) => n.kind === 'corner' && !n.hIn && !n.hOut))
    check(`A540 … la forme réelle est EXACTEMENT l’anneau (${ring.length} sommets, même ordre)`, path.sameRing(path.densify(m), ring) && path.densify(m).every((p, i) => close(p, ring[i], 0)))
    check(`A540 … même surface au mètre près (${geo.ringAreaDunams(ring).toFixed(3)} ד׳)`, path.pathAreaDunams(m) === geo.ringAreaDunams(ring))
  }
}

// ===========================================================================
section('A541 — ★ deux représentations ; deux calculs de surface égaux sur la forme densifiée')
{
  let m = path.fromRing(square())
  m = path.setNodeKind(m, 1, 'smooth')
  m = path.setNodeKind(m, 3, 'smooth')
  const ring = path.densify(m)
  check('A541 le modèle garde 4 nœuds (2 arrondis, leurs poignées)', m.nodes.length === 4 && m.nodes.filter((n) => n.kind === 'smooth' && n.hIn && n.hOut).length === 2)
  check(`A541 la forme réelle est densifiée (${ring.length} sommets) et passe par chaque nœud`, ring.length > 8 && m.nodes.every((n) => ring.some((p) => close(p, n, 0))))
  /* Les deux calculs que `bipass` A501 compare : la tuile « מדוד » (le magasin) et l'étiquette (ringAreaDunams). */
  const farm = store._raw().farms.find((f) => access.getFarmZonesForFarm(f.id).length === 0)!
  const made = store.createFarmZone({ farmId: farm.id, kind: 'farm_boundary', ring, path: m })
  const tile = store._raw().farms.find((f) => f.id === farm.id)?.measuredFarmDunams
  const label = Math.round(geo.ringAreaDunams(ring))
  check(`A541 ★ tuile « מדוד » ${tile} = étiquette ${label} = surface du modèle ${Math.round(path.pathAreaDunams(m))}`, made !== null && tile === label && Math.round(path.pathAreaDunams(m)) === label)
  check('A541 le magasin garde le MODÈLE à côté de l’anneau', made !== null && JSON.stringify(store._raw().farmZones.find((z) => z.id === made.id)?.path) === JSON.stringify(m))
  /* Un geste qui retouche : l'anneau et le modèle partent ensemble. */
  const moved = path.moveNode(m, 0, { lat: C.lat - 0.002, lng: C.lng - 0.001 })
  store.updateFarmZoneRing(made!.id, path.densify(moved), moved)
  const tile2 = store._raw().farms.find((f) => f.id === farm.id)?.measuredFarmDunams
  check(`A541 ★ après un geste : tuile ${tile2} = étiquette ${Math.round(geo.ringAreaDunams(path.densify(moved)))}`, tile2 === Math.round(geo.ringAreaDunams(path.densify(moved))))
  const z = store._raw().farmZones.find((x) => x.id === made!.id)!
  check('A541 … et le magasin porte le modèle ET l’anneau du même geste', path.sameRing(path.densify(z.path as path.PathModel), z.ring))
  store.deleteFarmZone(made!.id)
  /* Un segment droit n'est jamais densifié : deux coins voisins = deux sommets. */
  const sq = path.densify(path.fromRing(square()))
  check('A541 un segment droit n’ajoute aucun point', sq.length === 4)
  /* Une forme de 20 nœuds arrondis reste raisonnable en base. */
  let big = path.fromRing(circle(20, 0.05, 0.06))
  for (let i = 0; i < 20; i++) big = path.setNodeKind(big, i, 'smooth')
  const bigRing = path.densify(big)
  check(`A541 vingt nœuds arrondis → ${bigRing.length} sommets (< 1 000)`, bigRing.length < 1000 && bigRing.length > 20)
  const exact = Math.PI * 0.05 * 110_574 * 0.06 * 111_320 * Math.cos((C.lat * Math.PI) / 180) / 1000
  check(`A541 la densification suit la courbe (cercle : ${path.pathAreaDunams(big).toFixed(0)} ד׳ pour ${exact.toFixed(0)} attendus, < 1 %)`, Math.abs(path.pathAreaDunams(big) - exact) / exact < 0.01)
}

// ===========================================================================
section('A542 — ★ le modèle n’est repris que s’il redonne l’anneau enregistré')
{
  let m = path.fromRing(square())
  m = path.setNodeKind(m, 2, 'smooth')
  const ring = path.densify(m)
  const roundTrip = JSON.parse(JSON.stringify({ ring, path: m })) as { ring: LatLng[]; path: unknown }
  const a = path.modelForRing(roundTrip.ring, roundTrip.path)
  check('A542 ★ aller-retour (JSON, comme la base) : le MODÈLE est repris, poignées comprises', a.source === 'model' && a.model.nodes[2].kind === 'smooth' && !!a.model.nodes[2].hOut)
  const rewritten = ring.map((p, i) => (i === 0 ? { lat: p.lat + 0.0003, lng: p.lng } : p))
  const b = path.modelForRing(rewritten, m)
  check('A542 ★ anneau réécrit ailleurs (un build d’avant BK) : l’ANNEAU gagne, repris en coins', b.source === 'ring' && path.sameRing(path.densify(b.model), rewritten))
  check('A542 pas de modèle → coins', path.modelForRing(ring, null).source === 'ring' && path.modelForRing(ring, undefined).source === 'ring')
  check('A542 modèle illisible → coins, sans erreur', path.modelForRing(ring, '{pas du json').source === 'ring' && path.modelForRing(ring, { v: 2 }).source === 'ring' && path.modelForRing(ring, { v: 1, nodes: [{ lat: 'x' }] }).source === 'ring')
  check('A542 un modèle OUVERT (brouillon) n’est jamais pris pour une forme fermée', path.modelForRing(ring, { ...m, closed: false }).source === 'ring')
}

// ===========================================================================
section('A543 — les gestes')
{
  const base = path.fromRing(square())
  const moved = path.moveNode(path.setNodeKind(base, 1, 'smooth'), 1, { lat: C.lat + 0.011, lng: C.lng - 0.001 })
  check('A543 déplacer un nœud : lui seul bouge, ses poignées le suivent (décalages inchangés)', moved.nodes[1].lat === C.lat + 0.011 && JSON.stringify(moved.nodes[1].hOut) === JSON.stringify(path.setNodeKind(base, 1, 'smooth').nodes[1].hOut) && close(moved.nodes[0], base.nodes[0], 0))
  const t = path.translatePath(base, 0.001, -0.002)
  check('A543 déplacer la forme entière : tous les nœuds du même décalage', t.nodes.every((n, i) => close(n, { lat: base.nodes[i].lat + 0.001, lng: base.nodes[i].lng - 0.002 })))
  const sm = path.setNodeKind(base, 1, 'smooth')
  check('A543 ★ arrondir un coin : deux poignées, alignées', sm.nodes[1].kind === 'smooth' && !!sm.nodes[1].hIn && !!sm.nodes[1].hOut)
  const align = (n: path.PathNode) => {
    const k = Math.cos((n.lat * Math.PI) / 180)
    const a = { x: n.hIn!.lng * k, y: n.hIn!.lat }
    const b = { x: n.hOut!.lng * k, y: n.hOut!.lat }
    return Math.abs(a.x * b.y - a.y * b.x) / (Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) < 1e-9 && a.x * b.x + a.y * b.y < 0
  }
  check('A543 … alignées et opposées (à l’écran)', align(sm.nodes[1]))
  check('A543 ★ et la forme réelle change (la courbe existe)', !path.sameRing(path.densify(sm), path.densify(base)))
  const back = path.setNodeKind(sm, 1, 'corner')
  check('A543 ★ remettre en coin : les poignées partent, la forme redevient l’anneau d’origine', back.nodes[1].kind === 'corner' && !back.nodes[1].hIn && path.sameRing(path.densify(back), square()))
  const inLen = Math.hypot(sm.nodes[1].hIn!.lat, sm.nodes[1].hIn!.lng)
  const pulled = path.moveHandle(sm, 1, 'out', { lat: sm.nodes[1].lat + 0.004, lng: sm.nodes[1].lng + 0.004 })
  check('A543 ★ tirer une poignée : l’autre reste ALIGNÉE et garde SA longueur', align(pulled.nodes[1]) && Math.abs(Math.hypot(pulled.nodes[1].hIn!.lat, pulled.nodes[1].hIn!.lng) - inLen) / inLen < 0.2)
  const fromCorner = path.moveHandle(base, 2, 'out', { lat: base.nodes[2].lat - 0.003, lng: base.nodes[2].lng + 0.001 })
  check('A543 tirer une poignée depuis un coin le rend arrondi (comme la plume)', fromCorner.nodes[2].kind === 'smooth' && !!fromCorner.nodes[2].hIn)

  /* Ajouter sur un segment droit : un coin au point voulu, la forme ne change pas. */
  const ins = path.insertNode(base, 0, 0.25)
  check('A543 ★ ajouter un nœud sur un segment droit : un coin, la surface ne bouge pas', ins.model.nodes.length === 5 && ins.index === 1 && ins.model.nodes[1].kind === 'corner' && Math.abs(path.pathAreaDunams(ins.model) - path.pathAreaDunams(base)) < 1e-9)
  /* Ajouter sur une COURBE : de Casteljau, la courbe est la même. */
  const curve = path.setNodeKind(path.setNodeKind(base, 0, 'smooth'), 1, 'smooth')
  const split = path.insertNode(curve, 0, 0.4)
  const pts = 400
  let worst = 0
  const segPts = (m: path.PathModel, s: number, k: number) => path.bezierAt(path.segmentControls(m, s), k)
  for (let k = 0; k <= pts; k++) {
    const u = k / pts
    const p = segPts(curve, 0, u)
    const q = u <= 0.4 ? segPts(split.model, 0, u / 0.4) : segPts(split.model, 1, (u - 0.4) / 0.6)
    worst = Math.max(worst, Math.abs(p.lat - q.lat), Math.abs(p.lng - q.lng))
  }
  check(`A543 ★ ajouter un nœud sur une COURBE ne la change pas (écart max ${worst.toExponential(1)}°)`, worst < 1e-12 && split.model.nodes[1].kind === 'smooth')
  const rm = path.removeNode(ins.model, 1)
  check('A543 ★ retirer un nœud', rm.ok && rm.model.nodes.length === 4 && path.sameRing(path.densify(rm.model), square()))
  const tri = path.fromRing(square().slice(0, 3))
  const refused = path.removeNode(tri, 0)
  check('A543 ★ jamais sous trois nœuds sur une forme fermée (refus dit)', !refused.ok && refused.reason === 'min-nodes')
  const near = path.nearestOnPath(base, { lat: C.lat + 0.005, lng: C.lng - 0.0004 })
  check('A543 le point de la forme le plus proche (pour ajouter là où on touche)', near !== null && near.seg === 0 && Math.abs(near.t - 0.5) < 0.01 && near.distM < 50)
}

// ===========================================================================
section('A544 — la plume et la main levée')
{
  let m = path.emptyPath()
  m = path.appendNode(m, { lat: C.lat, lng: C.lng })
  m = path.appendNode(m, { lat: C.lat + 0.01, lng: C.lng }, { lat: C.lat + 0.012, lng: C.lng + 0.003 })
  check('A544 la plume : un appui = un coin ; un appui TIRÉ = un nœud arrondi, poignée = le glissé', m.nodes[0].kind === 'corner' && m.nodes[1].kind === 'smooth' && close(m.nodes[1].hOut!, { lat: 0.002, lng: 0.003 }) && close(m.nodes[1].hIn!, { lat: -0.002, lng: -0.003 }))
  check('A544 fermer à deux nœuds : refusé', path.closePath(m) === null)
  m = path.appendNode(m, { lat: C.lat + 0.01, lng: C.lng + 0.012 })
  const closed = path.closePath(m)
  check('A544 ★ fermer à trois : une surface', closed !== null && closed.closed && path.pathAreaDunams(closed) > 0)
  check('A544 un tracé ouvert n’a pas de surface (c’est une ligne)', path.pathAreaDunams(m) === 0 && path.densify(m).length > 3)

  /* Un trait : un carré tracé à la main (avec du tremblement) → 4 coins. */
  const stroke: LatLng[] = []
  const corners = [...square(), square()[0]]
  for (let k = 0; k < 4; k++) for (let s = 0; s < 40; s++) {
    const a = corners[k]
    const b = corners[k + 1]
    stroke.push({ lat: a.lat + ((b.lat - a.lat) * s) / 40 + Math.sin(s) * 2e-6, lng: a.lng + ((b.lng - a.lng) * s) / 40 + Math.cos(s) * 2e-6 })
  }
  const fitted = path.fitStroke(stroke, 5, true)
  check(`A544 ★ un carré tracé à main levée (160 points) → ${fitted.length} nœuds, des COINS aux virages`, fitted.length >= 4 && fitted.length <= 6 && fitted.filter((n) => n.kind === 'corner').length >= 4)
  const arc = Array.from({ length: 80 }, (_, i) => ({ lat: C.lat + 0.01 * Math.sin((i / 79) * Math.PI), lng: C.lng + 0.012 * (i / 79) }))
  const arcNodes = path.fitStroke(arc, 3, false)
  check(`A544 ★ une courbe tracée à main levée → des nœuds ARRONDIS (${arcNodes.filter((n) => n.kind === 'smooth').length}/${arcNodes.length})`, arcNodes.filter((n) => n.kind === 'smooth').length >= arcNodes.length - 2)

  /* Un trait qui longe le côté EST du carré (nœuds 2 → 3) et le bombe vers l'est. */
  const sq = path.fromRing(square())
  const side = Array.from({ length: 30 }, (_, i) => ({ lat: C.lat + 0.01 - (0.01 * i) / 29, lng: C.lng + 0.012 + 0.003 * Math.sin((i / 29) * Math.PI) }))
  const redrawn = path.redrawSection(sq, side, 3, 60)
  check('A544 ★ un trait qui part d’un nœud et revient à un autre remplace CETTE portion', redrawn !== null && redrawn.nodes.length > 4)
  const kept = redrawn ? [0, 1].every((k) => redrawn.nodes.some((n) => close(n, square()[k], 1e-12))) : false
  check('A544 … et laisse l’autre côté intact (nœuds 0 et 1 inchangés)', kept)
  check('A544 … la surface a grandi (le côté est bombé vers l’extérieur)', redrawn !== null && path.pathAreaDunams(redrawn) > path.pathAreaDunams(sq))
  check('A544 un trait qui ne part pas de la forme ne la touche pas', path.redrawSection(sq, side.map((p) => ({ lat: p.lat + 0.05, lng: p.lng })), 3, 60) === null)
  /* Prolonger un tracé ouvert : la main reprend au dernier nœud. */
  const open = path.appendNode(path.appendNode(path.emptyPath(), C), { lat: C.lat + 0.01, lng: C.lng })
  const ext = path.extendWithStroke(open, [{ lat: C.lat + 0.01, lng: C.lng }, ...arc.map((p) => ({ lat: p.lat + 0.01, lng: p.lng }))], 3)
  check('A544 ★ passer de la plume à la main levée EN COURS de tracé : le trait prolonge le tracé', ext.nodes.length > open.nodes.length && close(ext.nodes[1], open.nodes[1]))
}

// ===========================================================================
section('A545 — annuler, refaire')
{
  let h = path.historyOf(path.fromRing(square()))
  const states = [h.present]
  for (let i = 0; i < 30; i++) {
    h = path.pushHistory(h, path.moveNode(h.present, i % 4, { lat: C.lat + i * 1e-4, lng: C.lng }))
    states.push(h.present)
  }
  for (let i = 0; i < 30; i++) h = path.undoHistory(h)
  check('A545 ★ trente gestes, trente annulations : l’état d’origine, exactement', JSON.stringify(h.present) === JSON.stringify(states[0]))
  for (let i = 0; i < 30; i++) h = path.redoHistory(h)
  check('A545 ★ trente « refaire » : l’état final, exactement', JSON.stringify(h.present) === JSON.stringify(states[30]))
  h = path.undoHistory(path.undoHistory(h))
  h = path.pushHistory(h, path.fromRing(square()))
  check('A545 un geste après une annulation vide « refaire » (comme partout)', h.future.length === 0)
  check('A545 annuler sans rien à annuler ne fait rien', path.undoHistory(path.historyOf(1)).present === 1)
}

console.log(`\n  ${passed} PASS · ${failed} FAIL\n`)
process.exit(failed === 0 ? 0 : 1)
