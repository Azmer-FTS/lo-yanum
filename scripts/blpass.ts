/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BL — CHANTIER 3 · LA TOPOLOGIE DES RÉGIONS, PORTE PURE.   bun run blpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A585  ★ la mer (3.1) : ce qui sort dans la Méditerranée ou le golfe
 *         d'Eilat est retiré de la MESURE ; l'intérieur et les lacs
 *         (Kinneret, mer Morte) ne bougent pas ; le tracé n'est pas réécrit
 *   A586  découper un anneau : un anneau en sort, ou un REFUS motivé (deux
 *         morceaux, un trou, presque rien) ; les éclats d'arithmétique ignorés
 *   A587  les recouvrements : la surface en litige, sur terre ; deux régions
 *         qui partagent un bord ne se recouvrent pas
 *   A588  ★ la règle de partage (3.3) : la région dessinée par le PO gagne ;
 *         entre égales, la plus petite ; rien n'est écrit par le plan ; un
 *         partage refusé reste tel quel ; un partage impossible est dit
 *   A589  ★ les 13 régions livrées : après le plan, AUCUN recouvrement, chaque
 *         région reste UN anneau, et la surface totale est conservée (la
 *         somme des régions = leur union d'avant : rien ne disparaît)
 *   A590  ★ le poussage (3.4) : la région éditée gagne ; la voisine perd
 *         EXACTEMENT ce qu'elle a gagné ; le recouvrement d'avant n'est pas
 *         touché ; reculer ne fait PAS repousser la voisine ; le vide se mesure
 *         et se comble jusqu'à la nouvelle limite
 *   A591  ★ le poussage s'arrête : une voisine coupée en deux, ou réduite à
 *         moins du dixième, n'est pas recoupée — et l'on sait laquelle
 *   A592  gagner sur la mer ne pousse personne
 */
import * as topo from '../src/core/topology'
import { REGIONS } from '../src/core/regions'
import { ringAreaDunams } from '../src/core/geo'
import type { LatLng } from '../src/core/types'
import polygonClipping from 'polygon-clipping'

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
const rect = (s: number, w: number, n: number, e: number): LatLng[] => [
  { lat: s, lng: w },
  { lat: s, lng: e },
  { lat: n, lng: e },
  { lat: n, lng: w },
]
const area = (r: LatLng[]) => ringAreaDunams(r)
const near = (a: number, b: number, rel = 0.005) => Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * rel)
const overlapDunams = (a: LatLng[], b: LatLng[]) => topo.shapeDunams(polygonClipping.intersection(topo.toPolygon(a), topo.toPolygon(b)))

// ===========================================================================
section('A585 — ★ la mer : retirée de la mesure, pas du tracé')
{
  /* Un carré à cheval sur la côte de Tel-Aviv : de 34,60° (la mer) à 34,90° (la terre). */
  const coast = rect(32.0, 34.6, 32.1, 34.9)
  const sea = topo.seaDunams(coast)
  check(`A585 ★ à cheval sur la côte : une part est en mer (${Math.round(sea / 1000)} km² sur ${Math.round(area(coast) / 1000)})`, sea > area(coast) * 0.2 && sea < area(coast) * 0.8)
  check('A585 surface sur terre + surface en mer = surface tracée', near(topo.landDunams(coast) + sea, area(coast), 1e-6))
  const before = JSON.stringify(coast)
  topo.landOf(coast)
  check('A585 ★ le tracé n’est pas réécrit (masque, pas découpe)', JSON.stringify(coast) === before)
  const inland = rect(31.7, 34.95, 31.8, 35.05)
  check('A585 un carré à l’intérieur des terres : rien en mer, surface identique au dounam', topo.seaDunams(inland) === 0 && topo.landDunams(inland) === area(inland))
  const kinneret = rect(32.75, 35.55, 32.88, 35.65)
  check(`A585 ★ le Kinneret est un LAC, pas la mer : rien n’est retiré (${Math.round(topo.seaDunams(kinneret))} ד׳)`, topo.seaDunams(kinneret) < 1)
  const deadSea = rect(31.3, 35.4, 31.6, 35.55)
  check(`A585 ★ la mer Morte aussi (${Math.round(topo.seaDunams(deadSea))} ד׳)`, topo.seaDunams(deadSea) < 1)
  const eilat = REGIONS.find((r) => r.id === 'eilat')!.ring.map(([lng, lat]) => ({ lat, lng }))
  check(`A585 ★ le golfe d’Eilat est la mer : la région d’Eilat y perd ${Math.round(topo.seaDunams(eilat) / 1000)} km²`, topo.seaDunams(eilat) > 10_000)
  const deadSeaRegion = REGIONS.find((r) => r.id === 'dead-sea')!.ring.map(([lng, lat]) => ({ lat, lng }))
  check('A585 la région « ים המלח » garde son lac', topo.seaDunams(deadSeaRegion) < 1)
}

// ===========================================================================
section('A586 — découper un anneau, ou refuser en disant pourquoi')
{
  const sq = rect(31.6, 34.95, 31.7, 35.05)
  const east = topo.toPolygon(rect(31.55, 35.0, 31.75, 35.2))
  const r = topo.cutRing(sq, [east])
  check('A586 couper la moitié est : UN anneau, la moitié de la surface', r.ok && near(area(r.ring), area(sq) / 2, 0.01), r.ok ? `${Math.round(area(r.ring))} / ${Math.round(area(sq))}` : r.reason)
  check('A586 … et la perte est dite', r.ok && near(r.lostDunams, area(sq) / 2, 0.01))
  const strip = topo.toPolygon(rect(31.55, 34.99, 31.75, 35.01))
  const s = topo.cutRing(sq, [strip])
  check('A586 ★ une bande au milieu : DEUX morceaux → refusé (« split »)', !s.ok && s.reason === 'split' && s.pieces === 2)
  const hole = topo.toPolygon(rect(31.64, 34.99, 31.66, 35.01))
  const h = topo.cutRing(sq, [hole])
  check('A586 ★ un trou au milieu → refusé (« hole »)', !h.ok && h.reason === 'hole')
  const most = topo.toPolygon(rect(31.55, 34.951, 31.75, 35.2))
  const t = topo.cutRing(sq, [most], 0.1 * area(sq))
  check('A586 ★ presque tout → refusé (« tiny », sous le dixième)', !t.ok && t.reason === 'tiny')
  const all = topo.toPolygon(rect(31.5, 34.9, 31.8, 35.1))
  const e = topo.cutRing(sq, [all])
  check('A586 tout → refusé (« empty »)', !e.ok && e.reason === 'empty')
  const same = topo.cutRing(sq, [topo.toPolygon(rect(31.6, 35.05, 31.7, 35.1))])
  check('A586 un voisin qui partage SEULEMENT un bord : rien ne change (la surface, au dounam)', same.ok && near(area(same.ring), area(sq), 1e-6))
}

// ===========================================================================
section('A587 — les recouvrements')
{
  const a = { id: 'a', ring: rect(31.6, 34.95, 31.7, 35.05), drawn: false }
  const b = { id: 'b', ring: rect(31.65, 35.0, 31.75, 35.1), drawn: false }
  const c = { id: 'c', ring: rect(31.6, 35.05, 31.7, 35.15), drawn: false }
  const ov = topo.overlapsOf([a, b, c])
  const ab = ov.find((o) => o.a === 'a' && o.b === 'b')
  check(`A587 a ↔ b : un quart de a en litige (${Math.round(ab?.dunams ?? 0)} ד׳)`, !!ab && near(ab.dunams, area(a.ring) / 4, 0.01))
  check('A587 a et c partagent un bord : pas de recouvrement', !ov.some((o) => (o.a === 'a' && o.b === 'c') || (o.a === 'c' && o.b === 'a')))
  check('A587 b ↔ c se recouvrent aussi (un quart)', ov.some((o) => o.a === 'b' && o.b === 'c'))
  const s1 = { id: 's1', ring: rect(32.0, 34.5, 32.1, 34.62), drawn: false }
  const s2 = { id: 's2', ring: rect(32.0, 34.55, 32.1, 34.65), drawn: false }
  check('A587 ★ deux régions qui ne se recouvrent qu’EN MER : pas de conflit', topo.overlapsOf([s1, s2]).length === 0)
}

// ===========================================================================
section('A588 — ★ la règle de partage, et le plan qui n’écrit rien')
{
  const big = { id: 'big', ring: rect(31.5, 34.9, 31.8, 35.2), drawn: false }
  const small = { id: 'small', ring: rect(31.7, 35.1, 31.75, 35.3), drawn: false }
  const area0 = (id: string) => topo.landDunams(id === 'big' ? big.ring : small.ring)
  check('A588 ★ entre deux régions non redessinées : la PLUS PETITE garde le terrain', topo.winnerOf(big, small, area0) === 'small')
  const drawnBig = { ...big, drawn: true }
  check('A588 ★ la région que le PO a dessinée garde le terrain, même grande', topo.winnerOf(drawnBig, small, area0) === 'big')
  check('A588 deux régions dessinées : la plus petite', topo.winnerOf(drawnBig, { ...small, drawn: true }, area0) === 'small')
  const input = [big, small]
  const snap = JSON.stringify(input)
  const plan = topo.planResolutions(input)
  check('A588 ★ le plan N’ÉCRIT RIEN (les anneaux reçus sont intacts)', JSON.stringify(input) === snap)
  check('A588 un conflit, le perdant est « big », il reste UN anneau', plan.steps.length === 1 && plan.steps[0].loser === 'big' && plan.steps[0].result.ok)
  check('A588 après le plan : plus de recouvrement', overlapDunams(plan.rings.big, plan.rings.small) < topo.MIN_OVERLAP_DUNAMS)
  check('A588 le gagnant n’a pas bougé d’un point', JSON.stringify(plan.rings.small) === JSON.stringify(small.ring))
  const refused = topo.planResolutions(input, new Set([topo.pairKey('big', 'small')]))
  check('A588 ★ un partage REFUSÉ : les deux restent tels quels (le PO ajustera à la main)', refused.steps[0].refused && JSON.stringify(refused.rings.big) === JSON.stringify(big.ring))
  /* Impossible : la petite traverse la grande de part en part → la grande serait coupée en deux. */
  const bar = { id: 'bar', ring: rect(31.6, 34.8, 31.62, 35.3), drawn: true }
  const imp = topo.planResolutions([big, bar])
  check('A588 ★ un partage IMPOSSIBLE (la grande serait coupée en deux) est dit, et rien n’est appliqué', !imp.steps[0].result.ok && (imp.steps[0].result as { reason: string }).reason === 'split' && JSON.stringify(imp.rings.big) === JSON.stringify(big.ring))
}

// ===========================================================================
section('A589 — ★ les 13 régions livrées : plus aucun recouvrement, rien ne disparaît')
{
  const regions = REGIONS.map((r) => ({ id: r.id, ring: r.ring.map(([lng, lat]) => ({ lat, lng })), drawn: false }))
  const before = topo.overlapsOf(regions)
  check(`A589 avant : ${before.length} recouvrements, ${Math.round(before.reduce((s, o) => s + o.dunams, 0) / 1000)} km²`, before.length > 5)
  const plan = topo.planResolutions(regions)
  check('A589 ★ chaque partage est possible (aucune région coupée en deux ni réduite à rien)', plan.steps.every((s) => s.result.ok), plan.steps.filter((s) => !s.result.ok).map((s) => `${s.a}/${s.b}`).join(', '))
  const after = topo.overlapsOf(regions.map((r) => ({ ...r, ring: plan.rings[r.id] })))
  check(`A589 ★ après : ${after.length} recouvrement`, after.length === 0, after.map((o) => `${o.a}/${o.b} ${Math.round(o.dunams)}`).join(', '))
  const unionBefore = topo.shapeDunams(polygonClipping.union(...(regions.map((r) => topo.landOf(r.ring)) as [topo.Shape, ...topo.Shape[]])))
  const sumAfter = regions.reduce((s, r) => s + topo.landDunams(plan.rings[r.id]), 0)
  check(`A589 ★ conservation : somme des régions après = leur union avant (${Math.round(sumAfter / 1000)} / ${Math.round(unionBefore / 1000)} km²)`, near(sumAfter, unionBefore, 0.001))
  check('A589 chaque région garde au moins la moitié de sa surface', regions.every((r) => topo.landDunams(plan.rings[r.id]) >= 0.5 * topo.landDunams(r.ring)))
}

// ===========================================================================
section('A590 — ★ le poussage, le recul, le vide')
{
  const active0 = rect(31.6, 34.95, 31.7, 35.05)
  const neighbor0 = rect(31.6, 35.05, 31.7, 35.15)
  const N = (ring: LatLng[]) => [{ id: 'n', ring, startDunams: topo.landDunams(neighbor0) }]
  /* La région active avance de 0,02° dans la voisine. */
  const active1 = rect(31.6, 34.95, 31.7, 35.07)
  const p1 = topo.pushNeighbors(active0, active1, N(neighbor0))
  check('A590 ★ la voisine est recoupée, et elle seule', !p1.blocked && Object.keys(p1.rings).join() === 'n')
  check('A590 ★ plus de recouvrement entre les deux', overlapDunams(active1, p1.rings.n) < topo.SLIVER_DUNAMS)
  const lost = area(neighbor0) - area(p1.rings.n)
  const gained = area(active1) - area(active0)
  check(`A590 ★ la voisine perd EXACTEMENT ce que l’active a gagné (${Math.round(lost)} / ${Math.round(gained)} ד׳)`, near(lost, gained, 0.002))
  /* Un recouvrement d'AVANT n'est pas touché : c'est le travail de 3.3. */
  const overlapped = rect(31.6, 35.04, 31.7, 35.15)
  const p0 = topo.pushNeighbors(active0, active0, N(overlapped))
  check('A590 ★ sans geste, un recouvrement d’avant n’est PAS recoupé en silence', Object.keys(p0.rings).length === 0)
  /* Reculer : la voisine ne repousse pas toute seule. */
  const active2 = rect(31.6, 34.95, 31.7, 35.03)
  const p2 = topo.pushNeighbors(active0, active2, N(p1.rings.n))
  check('A590 ★ reculer ne fait PAS repousser la voisine (aucun recoupage, aucune croissance)', Object.keys(p2.rings).length === 0)
  const gaps = topo.gapsOf(active2, { n: neighbor0 }, { n: p1.rings.n })
  const gapArea = gaps[0]?.dunams ?? 0
  check(`A590 ★ le vide entre les deux se MESURE (${Math.round(gapArea)} ד׳ = la bande perdue par la voisine)`, gaps.length === 1 && near(gapArea, area(rect(31.6, 35.05, 31.7, 35.07)), 0.01))
  const filled = topo.fillGap(p1.rings.n, gaps[0])
  check('A590 ★ combler : la voisine s’étend jusqu’à la NOUVELLE limite (sa surface d’avant, pas plus)', filled.ok && near(area(filled.ring), area(neighbor0), 0.002))
  check('A590 … sans recouvrir l’active', filled.ok && overlapDunams(active2, filled.ring) < topo.SLIVER_DUNAMS)
  check('A590 … et le vide a disparu', filled.ok && topo.gapsOf(active2, { n: neighbor0 }, { n: filled.ring }).length === 0)
  /* Le recul partiel : l'active est revenue à 35,06 ; le vide est la bande 35,06 → 35,07. */
  const active3 = rect(31.6, 34.95, 31.7, 35.06)
  const g3 = topo.gapsOf(active3, { n: neighbor0 }, { n: p1.rings.n })
  check('A590 un recul partiel : le vide est la seule bande abandonnée', g3.length === 1 && near(g3[0].dunams, area(rect(31.6, 35.06, 31.7, 35.07)), 0.02))
}

// ===========================================================================
section('A591 — ★ le poussage s’arrête, et dit où')
{
  const active0 = rect(31.6, 34.95, 31.7, 35.05)
  const neighbor = rect(31.6, 35.05, 31.7, 35.15)
  /* Une langue qui traverse la voisine de part en part. */
  const tongue: LatLng[] = [
    { lat: 31.6, lng: 34.95 },
    { lat: 31.6, lng: 35.05 },
    { lat: 31.64, lng: 35.05 },
    { lat: 31.64, lng: 35.2 },
    { lat: 31.66, lng: 35.2 },
    { lat: 31.66, lng: 35.05 },
    { lat: 31.7, lng: 35.05 },
    { lat: 31.7, lng: 34.95 },
  ]
  const p = topo.pushNeighbors(active0, tongue, [{ id: 'n', ring: neighbor, startDunams: topo.landDunams(neighbor) }])
  check('A591 ★ couper la voisine en deux : ARRÊTÉ, et l’on sait laquelle et pourquoi', p.blocked?.id === 'n' && p.blocked.reason === 'split')
  const swallow = rect(31.6, 34.95, 31.7, 35.145)
  const q = topo.pushNeighbors(active0, swallow, [{ id: 'n', ring: neighbor, startDunams: topo.landDunams(neighbor) }])
  check('A591 ★ la réduire à moins du dixième : ARRÊTÉ (« tiny »)', q.blocked?.id === 'n' && q.blocked.reason === 'tiny')
  const ok = rect(31.6, 34.95, 31.7, 35.12)
  const r = topo.pushNeighbors(active0, ok, [{ id: 'n', ring: neighbor, startDunams: topo.landDunams(neighbor) }])
  check('A591 un grand pas qui laisse plus du dixième : accepté', !r.blocked && !!r.rings.n)
}

// ===========================================================================
section('A592 — gagner sur la mer ne pousse personne')
{
  /* Deux régions côtières de Tel-Aviv qui débordent toutes deux en mer ; l'active avance EN MER sur la voisine. */
  const active0 = rect(32.0, 34.6, 32.05, 34.85)
  const neighbor = rect(32.05, 34.6, 32.1, 34.85)
  const activeSea = [...rect(32.0, 34.6, 32.05, 34.85).slice(0, 2), { lat: 32.05, lng: 34.85 }, { lat: 32.05, lng: 34.7 }, { lat: 32.07, lng: 34.62 }, { lat: 32.05, lng: 34.6 }]
  const p = topo.pushNeighbors(active0, activeSea, [{ id: 'n', ring: neighbor, startDunams: topo.landDunams(neighbor) }])
  check(`A592 ★ une avancée dans la mer ne recoupe pas la voisine (${Object.keys(p.rings).length} recoupée)`, Object.keys(p.rings).length === 0 && !p.blocked)
  const activeLand = [...rect(32.0, 34.6, 32.05, 34.85).slice(0, 2), { lat: 32.07, lng: 34.85 }, { lat: 32.05, lng: 34.6 }]
  const q = topo.pushNeighbors(active0, activeLand, [{ id: 'n', ring: neighbor, startDunams: topo.landDunams(neighbor) }])
  check('A592 … la même avancée qui mord sur la TERRE, elle, la recoupe', !!q.rings.n && !q.blocked)
}

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
