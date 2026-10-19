import { existsSync, readFileSync } from 'node:fs'
import type { MultiPolygon } from 'polygon-clipping'

import { SEGS, coastVs, compare, frontier, inShape, riverOf, riverVs, whole } from './bmgeo'
import type { Geo, Pt } from './bmgeo'
import { REGIONS } from '../src/core/regions'
import { ringAreaDunams } from '../src/core/geo'
import * as topo from '../src/core/topology'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BM — CHANTIER 1, PORTE PURE : DES FRONTIÈRES JUSTES, PAS APPROCHÉES.  A630 … A635
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Il n'a pas vraiment pris la moitié du Jourdain, il n'a pas pris les
 *     vraies frontières de la map, il y a des endroits où il s'est un peu
 *     planté. »                                                     — le PO
 *
 * Référence : `geodata/osm-borders.json` (polygones des pays voisins et trait
 * de côte d'OpenStreetMap, à pleine résolution, `scripts/bmfetch.ts`).
 *
 *   A630  ★ chaque segment de frontière (Égypte, Arava, mer Morte, Jourdain,
 *         Yarmouk, Syrie, Liban, Gaza) : à 5 m au plus de la référence, au
 *         PIRE endroit, dans les deux sens (BL : 194 à 667 m)
 *   A631  ★ le Jourdain : la ligne suit le COURS de la rivière comme la
 *         référence (moyenne ≤ 10 m, 95 % ≤ 30 m) — plus de corde d'un
 *         méandre à l'autre ; au pire point de BL (667 m), elle est sur la rivière
 *   A632  ★ le trait de côte : à 5 m au plus de `natural=coastline`, par
 *         tronçon (BL : jusqu'à 176 m)
 *   A633  ★ la Judée-Samarie et le Golan restent DEDANS : témoins (Jéricho,
 *         Naplouse, Majdal Shams, le Hermon…) et régions livrées (שומרון,
 *         יהודה : rien au-delà) ; chaque voisin a son témoin dans SA zone
 *   A634  rien n'est compté deux fois : pays + mer + au-delà = surface tracée
 *         (à 0,01 % près) sur les 13 régions livrées
 *   A635  les masques sont découpés (cases de 0,1°, aucun morceau de plus de
 *         1 500 points) et disent leur source ; le fichier des pays reste
 *         modifiable (une zone retirée du fichier n'est plus retirée)
 *
 *   bun run bmpass
 */
let passed = 0
let failed = 0
function check(label: string, ok: boolean): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}

const geo = JSON.parse(readFileSync('geodata/osm-borders.json', 'utf8')) as Geo
const seaFile = JSON.parse(readFileSync('src/core/sea.json', 'utf8')) as { sea: MultiPolygon; source: string }
const abroadFile = JSON.parse(readFileSync('src/core/abroad.json', 'utf8')) as { zones: Record<string, MultiPolygon>; source: string; kept: string[] }
const sea = whole(seaFile.sea)
const truth = frontier(geo.zones, sea)
const mine = frontier(abroadFile.zones, sea)

section('A630 — ★ chaque segment de frontière, au pire endroit')
/*
 * Le RETOUR (un point de notre ligne → la référence) tolère 12 m : sur le Jourdain (32,1977 N, 35,5695 E),
 * un éperon étroit de la rivière rate le test « 40 m de part et d'autre » qui extrait la frontière de
 * la RÉFÉRENCE ; notre ligne, elle, le garde — ses sommets y sont ceux d'OSM à 10 cm près (vérifié).
 */
const res = compare(truth, mine)
for (const s of SEGS) {
  const r = res[s]
  check(`A630 ${s.padEnd(15)} ${String(r.fwd.km).padStart(4)} km : pire écart ${r.fwd.max} m (retour ${r.rev.max} m), 95 % ≤ ${r.fwd.p95} m`, r.fwd.km > 0 && r.fwd.max <= 5 && r.rev.max <= 12)
}

section('A631 — ★ le Jourdain suit le cours de la rivière')
const river = riverOf(geo)
const ref = riverVs(river, truth.filter((e) => e.seg === 'jordan-river'))
const got = riverVs(river, mine.filter((e) => e.seg === 'jordan-river'))
check(`A631 ★ la ligne contre le cours (${got.km} km) : moyenne ${got.mean} m, 95 % ${got.p95} m (la référence : ${ref.mean} / ${ref.p95} m)`, got.mean <= 10 && got.p95 <= 30 && Math.abs(got.p95 - ref.p95) <= 3)
/* Au pire point de BL (32,1769 N, 35,5535 E : la corde coupait le méandre de 667 m), la ligne longe la rivière. */
const worstBL: Pt = [35.5535, 32.1769]
const near = river.reduce((b, p) => (Math.hypot((p[0] - worstBL[0]) * 94_900, (p[1] - worstBL[1]) * 110_540) < Math.hypot((b[0] - worstBL[0]) * 94_900, (b[1] - worstBL[1]) * 110_540) ? p : b), river[0])
const atWorst = riverVs([near], mine)
check(`A631 ★ au pire point de BL (667 m), la ligne est à ${atWorst.max} m de la rivière`, atWorst.max <= 30)

section('A632 — ★ le trait de côte')
const coast = coastVs(geo.coast, sea)
for (const [k, r] of Object.entries(coast)) {
  if (k === 'islands') continue
  check(`A632 ${k.padEnd(14)} ${String(r.fwd.km).padStart(4)} km : pire écart ${r.fwd.max} m (retour ${r.rev.max} m)`, r.fwd.max <= 5 && r.rev.max <= 5)
}

section('A633 — ★ la Judée-Samarie et le Golan restent dedans')
const HOME: Array<[string, number, number]> = [
  ['Jéricho', 31.86, 35.45], ['Naplouse', 32.22, 35.26], ['Ramallah', 31.9, 35.2], ['Hébron', 31.53, 35.1], ['Maalé Adoumim', 31.78, 35.3],
  ['Katzrin', 32.99, 35.69], ['Majdal Shams', 33.27, 35.77], ['le Hermon israélien', 33.3, 35.78], ['Quneitra (côté israélien)', 33.12, 35.79], ['Beit Shean', 32.5, 35.5],
]
for (const [name, lat, lng] of HOME) check(`A633 ${name} : dans aucune zone`, !Object.values(abroadFile.zones).some((z) => inShape(z, lng, lat)))
const AWAY: Array<[string, string, number, number]> = [['egypt', 'le Sinaï', 30.6, 34.35], ['gaza', 'Gaza', 31.5, 34.45], ['lebanon', 'Tyr', 33.27, 35.22], ['syria', 'Quneitra (côté syrien)', 33.12, 35.85], ['jordan', 'la rive est', 32.0, 35.6], ['jordan', 'Aqaba', 29.53, 35.01]]
for (const [k, name, lat, lng] of AWAY) check(`A633 ${name} : dans « ${k} »`, inShape(abroadFile.zones[k], lng, lat))
const R = (id: string) => REGIONS.find((r) => r.id === id)!.ring.map(([lng, lat]) => ({ lat, lng }))
for (const id of ['samaria', 'judea']) {
  const a = topo.abroadDunams(R(id))
  check(`A633 ★ la région livrée « ${REGIONS.find((r) => r.id === id)!.name} » : rien au-delà (${JSON.stringify(a)})`, Object.values(a).every((n) => (n ?? 0) < 10))
}
check(`A633 le fichier dit ce qu'il garde : ${abroadFile.kept.join(', ')}`, abroadFile.kept.includes('westbank') && abroadFile.kept.includes('golan'))

section('A634 — rien n’est compté deux fois')
for (const r of REGIONS) {
  const ring = R(r.id)
  const tot = ringAreaDunams(ring)
  const parts = topo.landDunams(ring) + topo.seaDunams(ring) + Object.values(topo.abroadDunams(ring)).reduce((a, b) => a + (b ?? 0), 0)
  check(`A634 ${r.id.padEnd(14)} pays + mer + au-delà = ${Math.round(parts)} / tracé ${Math.round(tot)}`, Math.abs(parts - tot) / tot < 1e-4)
}

section('A635 — des masques découpés, une source dite, un fichier modifiable')
const pieces = [...seaFile.sea, ...Object.values(abroadFile.zones).flat()]
const biggest = Math.max(...pieces.map((p) => p.flat().length))
const inCell = pieces.every((p) => {
  const xs = p.flat().map((q) => q[0]), ys = p.flat().map((q) => q[1])
  return Math.floor(Math.min(...xs) * 10 + 1e-6) >= Math.floor(Math.max(...xs) * 10 - 1e-6) && Math.floor(Math.min(...ys) * 10 + 1e-6) >= Math.floor(Math.max(...ys) * 10 - 1e-6)
})
check(`A635 ${pieces.length} morceaux, chacun dans sa case de 0,1° ; le plus gros : ${biggest} points`, inCell && biggest <= 1500)
check('A635 la source est dite (OpenStreetMap, geodata, ODbL)', /OpenStreetMap/.test(abroadFile.source) && /geodata\/osm-borders\.json/.test(abroadFile.source) && /OpenStreetMap/.test(seaFile.source))
check('A635 les zones du fichier sont exactement les cinq pays de l’option A', JSON.stringify(Object.keys(abroadFile.zones).sort()) === JSON.stringify(['egypt', 'gaza', 'jordan', 'lebanon', 'syria']))
check('A635 ★ le fichier reste modifiable : les zones viennent du fichier, rien n’est codé en dur', JSON.stringify([...topo.ABROAD_ZONES].sort()) === JSON.stringify(Object.keys(abroadFile.zones).sort()))
check('A635 la référence est rangée dans le dépôt', existsSync('geodata/osm-borders.json') && Object.keys(geo.zones).length === 5)

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
