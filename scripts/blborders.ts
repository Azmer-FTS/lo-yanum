import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

import { REGIONS } from '../src/core/regions'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BL (chantier 3.2) — CE QUE COUPERAIT UNE FRONTIÈRE TERRESTRE. LECTURE SEULE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Ce point est politique et tu ne l'appliques pas de ta propre autorité. »
 *
 * RIEN N'EST APPLIQUÉ ICI : ce script MESURE, sur les 13 régions, ce que
 * retirerait chaque jeu de lignes, et dessine où. Les lignes sont celles de
 * l'archive de la carte (`src/core/borders.json`, AW1.6 : OpenStreetMap via
 * Protomaps, couche `boundaries`, `kind = country`) :
 *   · `border`    — `disputed` absent : Égypte, Jordanie (Arava, mer Morte, ET le
 *                   Jourdain le long de la Judée-Samarie), Liban, Syrie (au-delà
 *                   du Golan, côté Liban/Jordanie), et le pourtour de Gaza ;
 *   · `greenLine` — `disputed = true` : la Ligne verte autour de la
 *                   Judée-Samarie (Jérusalem comprise), ET les deux lignes du
 *                   Golan (l'ancienne frontière le long du Jourdain et du
 *                   Kinneret, à l'ouest ; la ligne de cessez-le-feu, à l'est).
 *
 * MÉTHODE : une grille de 0,004° (~400 m) sur le cadre de l'archive ; les lignes
 * choisies (et la mer) sont des murs ; on remplit depuis Tel-Aviv. Ce qui n'est
 * pas atteint est « au-delà ». Chaque zone au-delà est NOMMÉE par un point
 * témoin. Une estimation à la maille près (±1 cellule le long des lignes).
 *
 *   bun run scripts/blborders.ts
 *   REAL=private/bl/real-region-rings.json bun run scripts/blborders.ts
 */
const STEP = 0.004
const W = 34.2, E = 36.0, S = 29.35, N = 33.45
const NX = Math.ceil((E - W) / STEP)
const NY = Math.ceil((N - S) / STEP)
const idx = (i: number, j: number) => j * NX + i
const ci = (lng: number) => Math.floor((lng - W) / STEP)
const cj = (lat: number) => Math.floor((N - lat) / STEP)
const lngOf = (i: number) => W + (i + 0.5) * STEP
const latOf = (j: number) => N - (j + 0.5) * STEP
const cellKm2 = (j: number) => STEP * 111.32 * Math.cos((latOf(j) * Math.PI) / 180) * STEP * 110.57

const borders = JSON.parse(readFileSync('src/core/borders.json', 'utf8')) as { greenLine: number[][]; border: number[][] }
const sea = JSON.parse(readFileSync('src/core/sea.json', 'utf8')) as { sea: number[][][][] }
const real: Record<string, Array<[number, number]>> = process.env.REAL && existsSync(process.env.REAL) ? JSON.parse(readFileSync(process.env.REAL, 'utf8')) : {}

/** Remplir un polygone (anneaux [lng, lat], pair-impair) sur la grille. */
function fill(rings: number[][][], set: (k: number) => void): void {
  for (let j = 0; j < NY; j++) {
    const y = latOf(j)
    const xs: number[] = []
    for (const r of rings)
      for (let k = 0; k < r.length; k++) {
        const [x1, y1] = r[k]
        const [x2, y2] = r[(k + 1) % r.length]
        if (y1 > y !== y2 > y) xs.push(x1 + ((y - y1) * (x2 - x1)) / (y2 - y1))
      }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let i = Math.max(0, Math.ceil((xs[k] - W) / STEP - 0.5)); i < NX && lngOf(i) <= xs[k + 1]; i++) set(idx(i, j))
    }
  }
}
const seaMask = new Uint8Array(NX * NY)
for (const p of sea.sea) fill(p, (k) => (seaMask[k] = 1))

type Seg = { a: number; b: number; c: number; d: number }
const segsOf = (lines: number[][]): Seg[] => lines.flatMap((f) => Array.from({ length: f.length / 2 - 1 }, (_, k) => ({ a: f[2 * k], b: f[2 * k + 1], c: f[2 * k + 2], d: f[2 * k + 3] })))
const black = segsOf(borders.border)
const red = segsOf(borders.greenLine)
function wallsOf(segs: Seg[]): Uint8Array {
  const m = new Uint8Array(NX * NY)
  for (const s of segs) {
    const n = Math.max(2, Math.ceil(Math.hypot(s.c - s.a, s.d - s.b) / (STEP / 4)))
    for (let t = 0; t <= n; t++) {
      const lat = s.a + ((s.c - s.a) * t) / n
      const lng = s.b + ((s.d - s.b) * t) / n
      const i = ci(lng)
      const j = cj(lat)
      if (i >= 0 && i < NX && j >= 0 && j < NY) m[idx(i, j)] = 1
    }
  }
  return m
}
function flood(walls: Uint8Array, seedLat: number, seedLng: number): Uint8Array {
  const seen = new Uint8Array(NX * NY)
  const start = idx(ci(seedLng), cj(seedLat))
  const stack = [start]
  seen[start] = 1
  while (stack.length) {
    const k = stack.pop()!
    const i = k % NX
    const j = (k - i) / NX
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di
      const b = j + dj
      if (a < 0 || b < 0 || a >= NX || b >= NY) continue
      const q = idx(a, b)
      if (seen[q] || walls[q] || seaMask[q]) continue
      seen[q] = 1
      stack.push(q)
    }
  }
  return seen
}

const TEL_AVIV = { lat: 32.08, lng: 34.8 }
/* Les zones au-delà, nommées par un point témoin chacune. */
const WITNESS: Array<{ key: string; label: string; lat: number; lng: number; south: boolean }> = [
  { key: 'egypt', label: 'Égypte (Sinaï)', lat: 30.6, lng: 34.35, south: true },
  { key: 'jordan', label: 'Jordanie', lat: 30.6, lng: 35.6, south: true },
  { key: 'gaza', label: 'bande de Gaza', lat: 31.45, lng: 34.4, south: false },
  { key: 'lebanon', label: 'Liban', lat: 33.35, lng: 35.4, south: false },
  { key: 'syria', label: 'Syrie', lat: 33.0, lng: 35.97, south: false },
  { key: 'westbank', label: 'Judée-Samarie (au-delà de la Ligne verte)', lat: 32.0, lng: 35.25, south: false },
  { key: 'golan', label: 'Golan (entre les deux lignes disputées)', lat: 33.0, lng: 35.75, south: false },
]

/**
 * UNE grille, TOUTES les lignes comme murs : chaque zone au-delà est une
 * composante séparée (Sinaï, Jordanie, Gaza, Liban, Syrie, Judée-Samarie,
 * Golan). Les OPTIONS ne diffèrent que par les zones qu'elles gardent dedans.
 * ⚠️ Pourquoi pas « certaines lignes seulement » : dans ce jeu de données, la
 *    ligne du Jourdain le long de la Judée-Samarie et la ligne Golan-Liban sont
 *    marquées `disputed` comme la Ligne verte ; ne garder que les lignes non
 *    disputées laisse fuir la Jordanie et le Liban (vu sur la grille).
 * L'Égypte et la Jordanie se rejoignent au sud du cadre (autour du golfe) : la
 * composante est partagée au méridien 34,96° (Taba–Eilat).
 */
const WALLS = wallsOf([...black, ...red])
/** Pour le dessin de l'option A : une ligne rouge qui ne borde QUE des zones gardées n'est pas une limite. */
function insideKept(g: Seg, keep: Set<string>): boolean {
  const lat = (g.a + g.c) / 2
  const lng = (g.b + g.d) / 2
  const sides: string[] = []
  for (const [dl, dn] of [[STEP * 3, 0], [-STEP * 3, 0], [0, STEP * 3], [0, -STEP * 3], [STEP * 3, STEP * 3], [-STEP * 3, -STEP * 3], [STEP * 3, -STEP * 3], [-STEP * 3, STEP * 3]]) {
    const i = ci(lng + dn)
    const j = cj(lat + dl)
    if (i < 0 || j < 0 || i >= NX || j >= NY) continue
    const k = idx(i, j)
    if (WALLS[k] || seaMask[k]) continue
    sides.push(BASE_INSIDE[k] ? 'in' : ZONE[k] >= 0 ? WITNESS[ZONE[k]].key : '?')
  }
  return sides.length > 0 && sides.every((x) => x === 'in' || keep.has(x))
}
const OPTIONS = [
  { key: 'A', label: 'A — Égypte, Jordanie, Liban, Syrie (cessez-le-feu du Golan) et pourtour de Gaza ; la Judée-Samarie et le Golan restent DEDANS', keep: new Set(['westbank', 'golan']) },
  { key: 'B', label: 'B — les mêmes, plus la Ligne verte et les lignes du Golan : la Judée-Samarie et le Golan sont DEHORS', keep: new Set<string>() },
]
const rings = REGIONS.map((r) => ({ id: r.id, name: r.name, rgb: r.rgb, drawn: r.id in real, ring: (real[r.id] ?? r.ring) as number[][] }))
const regionMask = rings.map((r) => {
  const m = new Uint8Array(NX * NY)
  fill([r.ring], (k) => (m[k] = 1))
  return m
})

const report: Record<string, unknown> = {}
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
const BASE_INSIDE = flood(WALLS, TEL_AVIV.lat, TEL_AVIV.lng)
const ZONE = new Int8Array(NX * NY).fill(-1)
WITNESS.forEach((w, n) => {
  const k = idx(ci(w.lng), cj(w.lat))
  if (BASE_INSIDE[k] || WALLS[k] || seaMask[k] || ZONE[k] !== -1) return
  const comp = flood(WALLS, w.lat, w.lng)
  for (let q = 0; q < comp.length; q++) if (comp[q] && ZONE[q] === -1) ZONE[q] = n
})
/* Égypte et Jordanie : une seule composante, partagée au méridien de Taba–Eilat. */
const EG = WITNESS.findIndex((w) => w.key === 'egypt')
const JO = WITNESS.findIndex((w) => w.key === 'jordan')
for (let q = 0; q < ZONE.length; q++) if (ZONE[q] === EG && lngOf(q % NX) >= 34.96) ZONE[q] = JO

for (const opt of OPTIONS) {
  const inside = new Uint8Array(BASE_INSIDE)
  for (let q = 0; q < inside.length; q++) if (ZONE[q] >= 0 && opt.keep.has(WITNESS[ZONE[q]].key)) inside[q] = 1
  const zoneOf = ZONE
  const rows = rings.map((r, ri) => {
    const by: Record<string, number> = {}
    let land = 0
    let out = 0
    for (let k = 0; k < NX * NY; k++) {
      if (!regionMask[ri][k] || seaMask[k] || WALLS[k]) continue
      const j = Math.floor(k / NX)
      const a = cellKm2(j)
      land += a
      if (!inside[k]) {
        out += a
        const z = zoneOf[k] >= 0 ? WITNESS[zoneOf[k]].key : 'autre'
        by[z] = (by[z] ?? 0) + a
      }
    }
    return { id: r.id, name: r.name, drawn: r.drawn, land, out, by }
  })
  report[opt.key] = { label: opt.label, rows }
  console.log(`\n${opt.label}`)
  for (const r of rows) {
    const parts = Object.entries(r.by).sort((a, b) => b[1] - a[1]).map(([z, a]) => `${WITNESS.find((w) => w.key === z)?.label ?? z} ${Math.round(a)}`)
    console.log(`  ${r.name} (${r.id}${r.drawn ? ', redessinée' : ''}) : ${Math.round(r.out)} km² sur ${Math.round(r.land)} (${((r.out / Math.max(1, r.land)) * 100).toFixed(1)} %)${parts.length ? ' — ' + parts.join(', ') : ''}`)
  }
  const tot = rows.reduce((s, r) => s + r.out, 0)
  const south = rows.reduce((s, r) => s + (r.by.egypt ?? 0) + (r.by.jordan ?? 0), 0)
  console.log(`  TOTAL retiré : ${Math.round(tot)} km² — dont Égypte + Jordanie (le sud) : ${Math.round(south)} km²`)

  if (process.env.BMP) {
    /* Débogage : la grille elle-même (mer bleue, murs noirs, dedans clair, zones au-delà colorées). */
    const pal = [[200, 60, 60], [60, 140, 60], [160, 60, 200], [220, 140, 30], [30, 150, 160], [120, 120, 220], [200, 200, 60]]
    const rowBytes = Math.ceil((NX * 3) / 4) * 4
    const buf = Buffer.alloc(54 + rowBytes * NY)
    buf.write('BM', 0)
    buf.writeUInt32LE(buf.length, 2)
    buf.writeUInt32LE(54, 10)
    buf.writeUInt32LE(40, 14)
    buf.writeInt32LE(NX, 18)
    buf.writeInt32LE(-NY, 22)
    buf.writeUInt16LE(1, 26)
    buf.writeUInt16LE(24, 28)
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const k = idx(i, j)
        const c = seaMask[k] ? [190, 214, 238] : WALLS[k] ? [0, 0, 0] : inside[k] ? [245, 240, 225] : zoneOf[k] >= 0 ? pal[zoneOf[k]] : [255, 0, 255]
        const o = 54 + j * rowBytes + i * 3
        buf[o] = c[2]
        buf[o + 1] = c[1]
        buf[o + 2] = c[0]
      }
    writeFileSync(`private/bl/grid-${opt.key}.bmp`, buf)
    continue
  }
  /* L'image : les régions, la mer, les lignes-murs, et ce qui serait retiré (hachuré rouge). */
  const K = Math.cos((31.5 * Math.PI) / 180)
  const sx = 720 / ((E - W) * K)
  const X = (lng: number) => ((lng - W) * K * sx).toFixed(1)
  const Y = (lat: number) => ((N - lat) * sx).toFixed(1)
  const H = Math.round((N - S) * sx)
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${H}" viewBox="0 0 720 ${H}" style="background:#f6f3ea;font-family:sans-serif">`
  for (const p of sea.sea) svg += `<path d="${p.map((r) => 'M' + r.map(([x, y]) => `${X(x)},${Y(y)}`).join('L') + 'Z').join('')}" fill="#bcd6ee" fill-rule="evenodd"/>`
  for (const r of rings) svg += `<path d="M${r.ring.map(([x, y]) => `${X(x)},${Y(y)}`).join('L')}Z" fill="rgb(${r.rgb} / 0.16)" stroke="rgb(${r.rgb})" stroke-width="1.4"/>`
  const cw = (STEP * K * sx).toFixed(2)
  const chh = (STEP * sx).toFixed(2)
  let cut = ''
  for (let k = 0; k < NX * NY; k++) {
    if (inside[k] || seaMask[k] || WALLS[k]) continue
    if (!regionMask.some((m) => m[k])) continue
    const i = k % NX
    const j = (k - i) / NX
    cut += `M${X(W + i * STEP)},${Y(N - j * STEP)}h${cw}v${chh}h-${cw}z`
  }
  svg += `<path d="${cut}" fill="#d11" fill-opacity="0.55"/>`
  const wallSegs = opt.key === 'A' ? [...black, ...red.filter((g) => !insideKept(g, opt.keep))] : [...black, ...red]
  svg += `<path d="${wallSegs.map((s) => `M${X(s.b)},${Y(s.a)}L${X(s.d)},${Y(s.c)}`).join('')}" stroke="#111" stroke-width="1.6" fill="none"/>`
  for (const r of rings) {
    const cx = r.ring.reduce((s, p) => s + p[0], 0) / r.ring.length
    const cy = r.ring.reduce((s, p) => s + p[1], 0) / r.ring.length
    svg += `<text x="${X(cx)}" y="${Y(cy)}" font-size="13" text-anchor="middle" fill="#222" direction="rtl">${r.name}</text>`
  }
  svg += `<rect x="0" y="0" width="720" height="44" fill="#fff" fill-opacity="0.85"/><text x="10" y="18" font-size="13">${opt.key === 'A' ? 'A — limites extérieures : Égypte, Jordanie, Liban, Syrie (cessez-le-feu), Gaza' : 'B — A + la Ligne verte et les lignes du Golan'}</text><text x="10" y="36" font-size="12" fill="#a00">rouge : ce qui serait retiré des régions · trait noir : les lignes utilisées comme limite</text></svg>`
  browser ??= await chromium.launch()
  const pg = await browser.newPage({ viewport: { width: 720, height: H } })
  await pg.setContent(svg)
  await pg.screenshot({ path: `${process.env.IMG_DIR ?? 'private/bl'}/frontieres-${opt.key}${Object.keys(real).length ? '-reel' : ''}.png` })
  await pg.close()
}
await browser?.close()
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(report, null, 1))
