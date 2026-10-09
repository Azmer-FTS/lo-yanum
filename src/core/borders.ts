import lines from './borders.json'
import type { LatLng } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AW1.6 (2026-10-09) — LA LIGNE VERTE ET LES FRONTIÈRES, POUR LA ROUTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AI3 l'avait dit franchement : le réseau d'OpenStreetMap ne connaît ni les
 * zones A et B ni les points de contrôle. Un plus court chemin peut donc
 * passer par la Judée-Samarie (Nehusha → Amatzia) ou, près de Sderot, par
 * une route de la bande de Gaza : ROULABLE pour la carte, pas pour le PO.
 *
 * Les lignes viennent de l'archive de la carte elle-même (couche
 * `boundaries`, `kind = country`, extraites par `scripts/awborders.ts`) :
 *   `greenLine` — les lignes disputées (Ligne verte, Golan) ;
 *   `border`    — les frontières reconnues (Gaza, Égypte, Jordanie, Liban).
 *
 * ★ FRANCHIR UNE LIGNE = UN SEGMENT DU TRAJET COUPE UN SEGMENT DE LA LIGNE.
 *   Tous les points du PO sont en Israël : un trajet qui va au-delà coupe la
 *   ligne à l'aller. Le test d'orientation se fait en degrés bruts (le signe
 *   d'un déterminant ne change pas quand on étire un axe).
 */

export type BorderKind = 'greenLine' | 'border'

interface Seg {
  a: number
  b: number
  c: number
  d: number
  kind: BorderKind
}

const CELL = 0.02
const grid = new Map<number, Seg[]>()
const cellKey = (i: number, j: number) => i * 100_000 + j

function indexLines(raw: number[][], kind: BorderKind): void {
  for (const flat of raw) {
    for (let k = 0; k + 3 < flat.length; k += 2) {
      const s: Seg = { a: flat[k], b: flat[k + 1], c: flat[k + 2], d: flat[k + 3], kind }
      const i0 = Math.floor(Math.min(s.a, s.c) / CELL)
      const i1 = Math.floor(Math.max(s.a, s.c) / CELL)
      const j0 = Math.floor(Math.min(s.b, s.d) / CELL)
      const j1 = Math.floor(Math.max(s.b, s.d) / CELL)
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const key = cellKey(i, j)
          const list = grid.get(key)
          if (list) list.push(s)
          else grid.set(key, [s])
        }
      }
    }
  }
}
indexLines((lines as { greenLine: number[][] }).greenLine, 'greenLine')
indexLines((lines as { border: number[][] }).border, 'border')

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) =>
  Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax))

function cuts(aLat: number, aLng: number, bLat: number, bLng: number, s: Seg): boolean {
  const o1 = orient(aLat, aLng, bLat, bLng, s.a, s.b)
  const o2 = orient(aLat, aLng, bLat, bLng, s.c, s.d)
  const o3 = orient(s.a, s.b, s.c, s.d, aLat, aLng)
  const o4 = orient(s.a, s.b, s.c, s.d, bLat, bLng)
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o3 !== 0
}

/** La ligne que coupe le segment [a, b], ou `null`. La Ligne verte l'emporte. */
export function segmentCrossing(aLat: number, aLng: number, bLat: number, bLng: number): BorderKind | null {
  const i0 = Math.floor(Math.min(aLat, bLat) / CELL)
  const i1 = Math.floor(Math.max(aLat, bLat) / CELL)
  const j0 = Math.floor(Math.min(aLng, bLng) / CELL)
  const j1 = Math.floor(Math.max(aLng, bLng) / CELL)
  let found: BorderKind | null = null
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const list = grid.get(cellKey(i, j))
      if (!list) continue
      for (const s of list) {
        if (!cuts(aLat, aLng, bLat, bLng, s)) continue
        if (s.kind === 'greenLine') return 'greenLine'
        found = 'border'
      }
    }
  }
  return found
}

/** La ligne que franchit un trajet, ou `null`. */
export function routeCrossing(coords: readonly LatLng[]): BorderKind | null {
  let found: BorderKind | null = null
  for (let k = 1; k < coords.length; k++) {
    const hit = segmentCrossing(coords[k - 1].lat, coords[k - 1].lng, coords[k].lat, coords[k].lng)
    if (hit === 'greenLine') return hit
    if (hit) found = hit
  }
  return found
}
