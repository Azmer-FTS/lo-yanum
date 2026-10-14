import { linkMinutes } from './coverage'
import type { PairRoad } from './roadMesh'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — L'ORDRE DES FERMES DANS LA FICHE D'UNE INSTITUTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * D'abord les fermes DANS le seuil que le PO a fixé, sans mélange, triées
 * selon SON critère : minutes croissantes s'il a choisi le temps, kilomètres
 * croissants s'il a choisi la distance. Le tri suit le critère, il ne le
 * contredit jamais (avant BG la liste était triée en kilomètres même quand le
 * seuil était en minutes, et les fermes hors seuil s'y mêlaient, grisées).
 *
 * Ensuite, à part, le COMPLÉMENT exact : tout ce qui n'est pas dans le seuil
 * (au-delà par la route, sans route, pas encore mesuré) — la section repliée
 * « מעבר לטווח שבחרת (N) ».
 *
 * ⚠️ Une ferme dont la seule route franchit la Ligne verte (`beyondOnly`) mais
 *    tient dans la borne EST dans le seuil : la borne parle de distance et de
 *    temps. Elle y garde sa pastille rouge, et la couverture ne la compte
 *    toujours pas (`computeCoverage`).
 *
 * PUR (`bgpass` le rejoue sur un jeu où les deux ordres diffèrent).
 */

export type ReachUnit = 'km' | 'min'

export interface ReachCriterion {
  unit: ReachUnit
  radiusKm: number
  minutes: number
  /** route × marge × nuit (`useTimeFactor`). */
  factor: number
}

export interface ReachRow<F> {
  farm: F
  /** Vol d'oiseau, en km : il ne départage que ce qui n'est pas mesuré. */
  air: number
  /** `undefined` = pas encore mesurée. */
  road: PairRoad | undefined
}

/** La route mesurée d'une ligne, ou `null`. */
export function measuredRoad(road: PairRoad | undefined): Exclude<PairRoad, { kind: 'none' }> | null {
  return road && road.kind !== 'none' ? road : null
}

export function isInside(road: PairRoad | undefined, c: ReachCriterion): boolean {
  const m = measuredRoad(road)
  if (!m) return false
  return c.unit === 'min' ? linkMinutes(m.seconds, c.factor) <= c.minutes : m.km <= c.radiusKm
}

/** La valeur que le critère compare : minutes (avec marge et nuit) ou kilomètres. */
export function criterionValue(road: PairRoad | undefined, c: ReachCriterion): number | null {
  const m = measuredRoad(road)
  if (!m) return null
  return c.unit === 'min' ? linkMinutes(m.seconds, c.factor) : m.km
}

/**
 * Les deux sections. `key` départage à valeur égale (le nom, puis l'id :
 * l'ordre ne dépend jamais de celui du magasin — voir BF).
 */
export function splitReach<F>(rows: ReadonlyArray<ReachRow<F>>, c: ReachCriterion, key: (f: F) => string): { inside: Array<ReachRow<F>>; outside: Array<ReachRow<F>> } {
  const byCriterion = (a: ReachRow<F>, b: ReachRow<F>): number => {
    const va = criterionValue(a.road, c)
    const vb = criterionValue(b.road, c)
    if (va !== null && vb !== null && va !== vb) return va - vb
    if (va !== null && vb === null) return -1
    if (va === null && vb !== null) return 1
    /* À valeur égale : l'autre grandeur, puis le vol d'oiseau, puis le nom. */
    const ma = measuredRoad(a.road)
    const mb = measuredRoad(b.road)
    if (ma && mb) {
      const other = c.unit === 'min' ? ma.km - mb.km : ma.seconds - mb.seconds
      if (other !== 0) return other
    }
    if (a.air !== b.air) return a.air - b.air
    return key(a.farm).localeCompare(key(b.farm), 'he')
  }
  const inside: Array<ReachRow<F>> = []
  const outside: Array<ReachRow<F>> = []
  for (const r of rows) (isInside(r.road, c) ? inside : outside).push(r)
  return { inside: inside.sort(byCriterion), outside: outside.sort(byCriterion) }
}
