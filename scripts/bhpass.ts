import { readFileSync } from 'node:fs'

import {
  MIN_RING_VERTICES,
  UNDO_DEPTH,
  applyGesture,
  canUndo,
  edgeMidpoint,
  insertVertex,
  isDirty,
  isValidRing,
  moveVertex,
  openSession,
  removeVertex,
  translateRing,
  undoGesture,
} from '../src/core/zoneEdit'
import type { LatLng } from '../src/core/types'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BH — PORTE PURE.   bun run bhpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A482  déplacer un sommet ne change que lui
 *   A483  ajouter un sommet l'insère au bon rang du contour
 *   A484  retirer un sommet est refusé à trois sommets
 *   A485  annuler restitue EXACTEMENT l'état précédent, dix fois de suite (et plus)
 *   A486  une forme à deux sommets est rejetée à l'enregistrement (le magasin
 *         n'écrit rien)
 *   A487  la forme fait l'aller-retour en base sommet pour sommet (lignes
 *         `zones` + `zone_vertices`, rangées par `position`)
 *   A488  le chemin d'écriture : la mutation du tracé est une collection du
 *         magasin, dans la file, au même titre que les champs de la ferme
 */

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
const same = (a: readonly LatLng[], b: readonly LatLng[]) => a.length === b.length && a.every((p, i) => p.lat === b[i].lat && p.lng === b[i].lng)

const square: LatLng[] = [
  { lat: 31.0, lng: 34.0 },
  { lat: 31.0, lng: 34.1 },
  { lat: 31.1, lng: 34.1 },
  { lat: 31.1, lng: 34.0 },
]

section('A482 — déplacer un sommet')
{
  const to = { lat: 31.05, lng: 34.2 }
  const r = moveVertex(square, 1, to)
  check('A482 le sommet déplacé est là où on l’a lâché', r[1].lat === to.lat && r[1].lng === to.lng)
  check('A482 … et LUI SEUL a changé', r.every((p, i) => i === 1 || (p.lat === square[i].lat && p.lng === square[i].lng)) && r.length === square.length)
  check('A482 l’anneau d’origine n’est pas modifié en place', square[1].lng === 34.1)
}

section('A483 — ajouter un sommet')
{
  const mid = edgeMidpoint(square, 2)
  check('A483 la demi-poignée est au milieu de l’arête 2 → 3', mid.lat === 31.1 && Math.abs(mid.lng - 34.05) < 1e-12)
  const r = insertVertex(square, 2, { lat: 31.12, lng: 34.05 })
  check('A483 inséré au rang 3, entre les sommets 2 et 3', r.length === 5 && r[3].lat === 31.12 && same([r[0], r[1], r[2], r[4]], square))
  const last = insertVertex(square, 3, { lat: 31.05, lng: 33.98 })
  check('A483 sur la dernière arête (qui rejoint le premier) : en fin de contour', last.length === 5 && last[4].lng === 33.98 && same(last.slice(0, 4), square))
}

section('A484 — retirer un sommet')
{
  const r = removeVertex(square, 0)
  check('A484 à quatre sommets : retiré, les autres dans l’ordre', r.ok && r.ring.length === 3 && same(r.ring, square.slice(1)))
  const tri = square.slice(0, 3)
  const refused = removeVertex(tri, 1)
  check('A484 à trois sommets : REFUSÉ, avec sa raison', !refused.ok && refused.reason === 'min-vertices' && MIN_RING_VERTICES === 3)
}

section('A485 — annuler')
{
  let s = openSession('z1', square)
  const states: LatLng[][] = [s.ring]
  for (let k = 0; k < 12; k++) {
    s = applyGesture(s, k % 3 === 0 ? moveVertex(s.ring, k % s.ring.length, { lat: 31 + k / 100, lng: 34 + k / 100 }) : k % 3 === 1 ? insertVertex(s.ring, 0, { lat: 31.01 * (1 + k / 1000), lng: 34.01 }) : translateRing(s.ring, 0.001, -0.001))
    states.push(s.ring)
  }
  check('A485 douze gestes posés, douze sur la pile', s.past.length === 12 && isDirty(s))
  let ok = true
  for (let k = 11; k >= 0; k--) {
    s = undoGesture(s)
    if (!same(s.ring, states[k])) ok = false
  }
  check('A485 douze annulations de suite : chaque fois EXACTEMENT l’état d’avant', ok)
  check('A485 … jusqu’à la forme d’ouverture, qui n’est plus « modifiée »', same(s.ring, square) && !isDirty(s) && !canUndo(s))
  check('A485 annuler à vide ne fait rien', undoGesture(s) === s)
  let deep = openSession('z2', square)
  for (let k = 0; k < UNDO_DEPTH + 20; k++) deep = applyGesture(deep, translateRing(deep.ring, 0.0001, 0))
  check(`A485 la pile garde ${UNDO_DEPTH} gestes (au moins dix)`, deep.past.length === UNDO_DEPTH && UNDO_DEPTH >= 10)
}

section('A486 — deux sommets : refusé à l’enregistrement')
{
  check('A486 deux sommets : invalide', !isValidRing(square.slice(0, 2)))
  check('A486 trois sommets dont deux confondus : invalide', !isValidRing([square[0], square[0], square[1]]))
  check('A486 trois sommets distincts : valide', isValidRing(square.slice(0, 3)))
  const store = await import('../src/core/store')
  const access = await import('../src/core/access')
  const farm = store._raw().farms[0]
  const before = access.getFarmZonesForFarm(farm.id).length
  const made = store.createFarmZone({ farmId: farm.id, kind: 'farm_boundary', ring: square.slice(0, 2) })
  check('A486 le magasin REFUSE de créer une forme à deux sommets (rien d’écrit)', made === null && access.getFarmZonesForFarm(farm.id).length === before)
  const ok = store.createFarmZone({ farmId: farm.id, kind: 'grazing_area', ring: square })
  check('A486 … et crée une forme valide', ok !== null && access.getFarmZonesForFarm(farm.id).length === before + 1)
  const refused = ok ? store.updateFarmZoneRing(ok.id, square.slice(0, 2)) : true
  check('A486 … et refuse de la réduire à deux sommets', refused === false && ok !== null && access.getFarmZonesForFarm(farm.id).find((z) => z.id === ok.id)?.ring.length === 4)
}

section('A487 — l’aller-retour en base')
{
  const zone = { id: 'zone-bh-x', farmId: 'farm-x', kind: 'grazing_area' as const, ring: insertVertex(square, 1, { lat: 31.03, lng: 34.12 }) }
  const rows = MAPPINGS.farmZones.toRows(zone)
  const parent = rows.find((r) => r.table === 'zones')!.rows[0]
  const vertices = rows.find((r) => r.table === 'zone_vertices')!.rows
  /* La base rend les sommets dans N'IMPORTE QUEL ordre (pas d'`order by`) : on les mélange. */
  const shuffled = [...vertices].reverse()
  const back = MAPPINGS.farmZones.fromRows(parent, { zone_vertices: shuffled })
  check('A487 une ligne `zones`, une ligne `zone_vertices` par sommet, avec son rang', parent.entity_id === 'farm-x' && vertices.length === 5 && vertices.every((v, i) => v.position === i))
  check('A487 relue (même mélangée), la forme est IDENTIQUE, sommet pour sommet', back.id === zone.id && back.kind === zone.kind && back.farmId === zone.farmId && same(back.ring, zone.ring))
}

section('A488 — le chemin d’écriture du tracé')
{
  const backend = readFileSync('src/core/backend.ts', 'utf8')
  const store = readFileSync('src/core/store.ts', 'utf8')
  check('A488 `farmZones` est une collection du magasin (donc dans la file d’écriture)', /COLLECTIONS = \[[\s\S]*'farmZones'/.test(backend))
  check('A488 créer, modifier, supprimer une forme passent par `commit()` (comme les champs de la ferme)', ['export function createFarmZone', 'export function updateFarmZoneRing', 'export function deleteFarmZone('].every((h) => {
    const i = store.indexOf(h)
    return i >= 0 && store.slice(i, i + 900).includes('commit()')
  }))
  check('A488 aucune copie de la forme ailleurs que dans le magasin (pas de brouillon local persistant)', !/localStorage|sessionStorage|indexedDB/.test(readFileSync('src/ui/components/AnchorMap.tsx', 'utf8')))
}

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
