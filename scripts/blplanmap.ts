import { existsSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

import { REGIONS } from '../src/core/regions'
import { landOf, overlapsOf, planResolutions, shapeRings } from '../src/core/topology'
import type { RegionGeom } from '../src/core/topology'

/**
 * BL (3.3) — les 13 régions AVANT (recouvrements hachurés) et APRÈS la règle
 * de partage. Lecture seule : dessine, n'écrit rien.
 *   IMG_DIR=docs/bl/img bun run scripts/blplanmap.ts
 *   REAL=private/bl/real-region-rings.json IMG_DIR=private/bl bun run …
 */
const real: Record<string, Array<[number, number]>> = process.env.REAL && existsSync(process.env.REAL) ? JSON.parse(readFileSync(process.env.REAL, 'utf8')) : {}
const sea = JSON.parse(readFileSync('src/core/sea.json', 'utf8')) as { sea: number[][][][] }
const regions: RegionGeom[] = REGIONS.map((r) => ({ id: r.id, ring: (real[r.id] ?? r.ring).map(([lng, lat]) => ({ lat, lng })), drawn: r.id in real }))
const plan = planResolutions(regions)
const W = 34.2, E = 36.0, S = 29.4, N = 33.45
const K = Math.cos((31.5 * Math.PI) / 180)
const sx = 560 / ((E - W) * K)
const X = (lng: number) => ((lng - W) * K * sx).toFixed(1)
const Y = (lat: number) => ((N - lat) * sx + 40).toFixed(1)
const H = Math.round((N - S) * sx) + 40
const d = (ring: Array<{ lat: number; lng: number }>) => `M${ring.map((p) => `${X(p.lng)},${Y(p.lat)}`).join('L')}Z`
function panel(title: string, rings: Record<string, Array<{ lat: number; lng: number }>>, hatch: boolean): string {
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="560" height="${H}" style="background:#f6f3ea;font-family:sans-serif">`
  s += `<defs><pattern id="h" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(220,38,38,.18)"/><line x1="0" y1="0" x2="0" y2="7" stroke="#dc2626" stroke-width="2"/></pattern></defs>`
  for (const p of sea.sea) s += `<path d="${p.map((r) => 'M' + r.map(([x, y]) => `${X(x)},${Y(y)}`).join('L') + 'Z').join('')}" fill="#bcd6ee"/>`
  for (const r of REGIONS) for (const ring of shapeRings(landOf(rings[r.id]))) s += `<path d="${d(ring)}" fill="rgb(${r.rgb} / .35)" stroke="rgb(${r.rgb})" stroke-width="1.4"/>`
  if (hatch) for (const o of overlapsOf(regions)) for (const ring of shapeRings(o.shape)) s += `<path d="${d(ring)}" fill="url(#h)" stroke="#dc2626" stroke-width="1"/>`
  for (const r of REGIONS) {
    const ring = rings[r.id]
    const cx = ring.reduce((a, p) => a + p.lng, 0) / ring.length
    const cy = ring.reduce((a, p) => a + p.lat, 0) / ring.length
    s += `<text x="${X(cx)}" y="${Y(cy)}" font-size="12" text-anchor="middle" fill="#222">${r.name}</text>`
  }
  s += `<text x="10" y="24" font-size="15" font-weight="600">${title}</text></svg>`
  return s
}
const before = panel(`Avant — ${overlapsOf(regions).length} recouvrements (hachurés)`, Object.fromEntries(regions.map((r) => [r.id, r.ring])), true)
const after = panel(`Après la règle — ${overlapsOf(regions.map((r) => ({ ...r, ring: plan.rings[r.id] }))).length} recouvrement`, plan.rings, false)
const html = `<div style="display:flex;gap:8px;background:#fff">${before}${after}</div>`
const br = await chromium.launch()
const pg = await br.newPage({ viewport: { width: 1128, height: H } })
await pg.setContent(html)
await pg.screenshot({ path: `${process.env.IMG_DIR ?? 'private/bl'}/regions-avant-apres${Object.keys(real).length ? '-reel' : ''}.png` })
await br.close()
console.log('ok')
