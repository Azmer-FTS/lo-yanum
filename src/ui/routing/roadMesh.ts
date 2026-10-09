import { useSyncExternalStore } from 'react'

import { packPair, pairKey, unpackPair } from '@core/roadMesh'
import type { PairRoad } from '@core/roadMesh'
import type { LatLng } from '@core/types'

import { BASEMAP_URL } from '../components/basemap'
import { measureMeshPair, roadGraphStats } from './roadNetwork'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AW1.3 (2026-10-09) — LE MAILLAGE ROUTIER, CALCULÉ UNE FOIS ET GARDÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré sur le jeu réel (19 fermes × 11 institutions, `bun run awpass`) :
 * à 35 km, 129 paires passent le filtre exact du vol d'oiseau, 686 tuiles,
 * 340 000 sommets, ~6 s hors navigateur ; à 80 km, 205 paires, ~19 s. C'est
 * trop pour être refait à chaque ouverture, et inutile : ni une ferme ni une
 * institution ne bougent d'elles-mêmes. Donc :
 *
 *   1. CHAQUE PAIRE EST GARDÉE SUR L'APPAREIL (clé : les deux points au mètre,
 *      et l'archive de la carte). Une épingle déplacée change SA clé : seules
 *      ses paires sont recalculées. Une ferme ajoutée : seules les siennes.
 *   2. LE CALCUL TOURNE PAIRE PAR PAIRE, en rendant la main entre deux
 *      (`setTimeout 0`) : l'écran répond, et la PROGRESSION se voit.
 *   3. UNE FILE UNIQUE POUR LA PAGE : quitter l'écran et y revenir ne relance
 *      rien ; agrandir le rayon ajoute seulement les paires nouvelles.
 *
 * ⛔ AUCUN REPLI AU VOL D'OISEAU. Une paire non mesurée n'est PAS un lien.
 */

const STORE_KEY = 'lo-yanum:road-mesh:v1'
const archiveId = BASEMAP_URL

type Store = { archive: string; pairs: Record<string, string> }

let cache: Map<string, PairRoad> | null = null
function load(): Map<string, PairRoad> {
  if (cache) return cache
  cache = new Map()
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Store
      if (s.archive === archiveId) {
        for (const [k, v] of Object.entries(s.pairs)) {
          const p = unpackPair(v)
          if (p) cache.set(k, p)
        }
      }
    }
  } catch {
    /* une mémoire illisible se recalcule */
  }
  return cache
}
function persist(): void {
  if (!cache) return
  const pairs: Record<string, string> = {}
  for (const [k, v] of cache) pairs[k] = packPair(v)
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ archive: archiveId, pairs } satisfies Store))
  } catch {
    /* stockage plein ou interdit : la mémoire de la page suffit */
  }
}

export interface MeshProgress {
  /** Paires demandées et pas encore mesurées. */
  pending: number
  /** Paires mesurées depuis le début de ce calcul. */
  done: number
  /** done + pending : pour la barre. */
  total: number
  running: boolean
  /** L'archive n'a pas pu être lue (ni téléchargée, ni joignable). */
  unavailable: boolean
  /** Durée du dernier calcul complet, ms. */
  lastMs: number | null
}

let version = 0
let progress: MeshProgress = { pending: 0, done: 0, total: 0, running: false, unavailable: false, lastMs: null }
const queue = new Map<string, { from: LatLng; to: LatLng }>()
const listeners = new Set<() => void>()
function emit(): void {
  version++
  snapshot = { version, progress }
  for (const l of listeners) l()
}
let snapshot = { version, progress }

/** Le mesuré d'une paire ; `undefined` = pas encore mesurée. */
export function meshPair(from: LatLng, to: LatLng): PairRoad | undefined {
  return load().get(pairKey(from, to))
}

/** Demande la mesure des paires qui manquent. Idempotent. */
export function requestMeshPairs(pairs: Array<{ from: LatLng; to: LatLng }>): void {
  const known = load()
  let added = 0
  for (const p of pairs) {
    const k = pairKey(p.from, p.to)
    if (known.has(k) || queue.has(k)) continue
    queue.set(k, p)
    added++
  }
  if (added === 0) return
  progress = { ...progress, pending: queue.size, total: progress.running ? progress.total + added : queue.size, done: progress.running ? progress.done : 0 }
  emit()
  if (!progress.running) void run()
}

async function run(): Promise<void> {
  const t0 = performance.now()
  progress = { ...progress, running: true, unavailable: false }
  emit()
  let sincePersist = 0
  while (queue.size > 0) {
    const [k, p] = queue.entries().next().value as [string, { from: LatLng; to: LatLng }]
    const r = await measureMeshPair(p.from, p.to)
    queue.delete(k)
    if (r === null) {
      // L'archive ne répond pas : on arrête, on le dit, la file est vidée
      // (elle se redemandera au prochain rendu, quand l'archive sera là).
      queue.clear()
      progress = { ...progress, pending: 0, running: false, unavailable: true }
      emit()
      persist()
      return
    }
    load().set(k, r)
    progress = { ...progress, pending: queue.size, done: progress.done + 1 }
    if (++sincePersist >= 10) {
      persist()
      sincePersist = 0
    }
    emit()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  persist()
  const ms = Math.round(performance.now() - t0)
  progress = { ...progress, pending: 0, running: false, lastMs: ms }
  ;(window as unknown as { __loYanumMesh?: unknown }).__loYanumMesh = { ms, pairs: progress.done, stats: roadGraphStats() }
  emit()
}

function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** La version (une paire mesurée = +1) et la progression. */
export function useRoadMesh(): { version: number; progress: MeshProgress } {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

/** Pour les portes : oublier tout ce qui est gardé. */
export function forgetRoadMesh(): void {
  cache = new Map()
  try {
    localStorage.removeItem(STORE_KEY)
  } catch {
    /* rien */
  }
  emit()
}
