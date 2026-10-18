import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { REGIONS } from '../src/core/regions'
import { landDunams, overlapsOf, planResolutions, seaDunams } from '../src/core/topology'
import type { RegionGeom } from '../src/core/topology'
import { ringAreaDunams } from '../src/core/geo'

/**
 * BL — les 13 régions telles qu'elles sont : surfaces, mer, recouvrements, et
 * ce que donnerait la règle de partage. Lecture seule.
 *
 *   bun run scripts/blregions.ts                       # les tracés livrés (X12)
 *   REAL=private/bl/real-region-rings.json bun run …   # + les régions redessinées du PO (hors dépôt)
 */
const real: Record<string, Array<[number, number]>> = process.env.REAL && existsSync(process.env.REAL) ? JSON.parse(readFileSync(process.env.REAL, 'utf8')) : {}
const regions: RegionGeom[] = REGIONS.map((r) => {
  const ring = (real[r.id] ?? r.ring).map(([lng, lat]) => ({ lat, lng }))
  return { id: r.id, ring, drawn: r.id in real }
})
const name = (id: string) => REGIONS.find((r) => r.id === id)?.name ?? id
const km2 = (d: number) => Math.round(d / 1000).toLocaleString('fr-FR')
console.log('région | redessinée | surface tracée km² | dans la mer km² | sur terre km²')
for (const r of regions) console.log(`${name(r.id)} (${r.id}) | ${r.drawn ? 'oui' : 'non'} | ${km2(ringAreaDunams(r.ring))} | ${km2(seaDunams(r.ring))} | ${km2(landDunams(r.ring))}`)
const ov = overlapsOf(regions)
const totalLand = regions.reduce((s, r) => s + landDunams(r.ring), 0)
const totalOv = ov.reduce((s, o) => s + o.dunams, 0)
console.log(`\nrecouvrements sur terre : ${ov.length} paires, ${km2(totalOv)} km² (${((totalOv / totalLand) * 100).toFixed(1)} % de la somme des surfaces)`)
const plan = planResolutions(regions)
for (const s of plan.steps) {
  console.log(`${name(s.a)} ↔ ${name(s.b)} : ${km2(s.dunams)} km² → à ${name(s.winner)} ; ${name(s.loser)} ${s.result.ok ? `perd ${km2(s.result.lostDunams)} km²` : `REFUS (${s.result.reason})`}`)
}
const after = regions.map((r) => ({ ...r, ring: plan.rings[r.id] }))
const ov2 = overlapsOf(after)
console.log(`\naprès résolution : ${ov2.length} recouvrement(s), ${km2(ov2.reduce((s, o) => s + o.dunams, 0))} km²`)
console.log('région | avant km² (terre) | après km² (terre)')
for (const r of regions) console.log(`${name(r.id)} | ${km2(landDunams(r.ring))} | ${km2(landDunams(plan.rings[r.id]))}`)
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ regions: regions.map((r) => ({ id: r.id, drawn: r.drawn, sea: seaDunams(r.ring), land: landDunams(r.ring), after: landDunams(plan.rings[r.id]) })), overlaps: ov.map((o) => ({ a: o.a, b: o.b, dunams: o.dunams })), steps: plan.steps.map((s) => ({ a: s.a, b: s.b, dunams: s.dunams, winner: s.winner, loser: s.loser, ok: s.result.ok, reason: s.result.ok ? null : s.result.reason, lost: s.result.ok ? s.result.lostDunams : 0 })), after: ov2.length }, null, 1))
