import { normalizeLocality } from './gazetteer'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF2.2 (2026-09-09) — « TOLÉRANTES AUX FAUTES DE FRAPPE ».
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les autocomplétions du programme cherchaient en PRÉFIXE puis en SOUS-CHAÎNE.
 * C'est exact et c'est insuffisant : le PO tape debout, sur un iPad, sous le
 * soleil, devant quelqu'un qui attend. Une lettre à côté et la liste est vide
 * — c'est-à-dire que le gazetteer national de 1 174 localités se comporte comme
 * les dix entrées qu'il avait avant N4.
 *
 * ★★ TROIS RANGS, ET L'ORDRE EST L'ORDRE DE CERTITUDE :
 *
 *   1. PRÉFIXE — ce que la personne est en train d'écrire. Toujours en tête,
 *      jamais départagé par autre chose : quelqu'un qui a tapé « בא » veut
 *      « באר שבע » avant « רהט », même si רהט est plus proche au sens des
 *      distances d'édition.
 *   2. SOUS-CHAÎNE — le mot est dedans, mais pas au début (« עין » dans
 *      « מעין ברוך »).
 *   3. APPROCHANT — à une ou deux corrections près. C'est le rang neuf.
 *
 * ⚠️ LE SEUIL DÉPEND DE LA LONGUEUR, ET C'EST CE QUI L'EMPÊCHE DE MENTIR. À
 *    une correction près, « רתם » et « רהט » sont voisins de tout ; à deux
 *    corrections près, une requête de trois lettres rejoint la moitié du pays.
 *    Le seuil est donc 0 sous quatre caractères, 1 jusqu'à sept, 2 au-delà —
 *    de sorte qu'une faute de frappe est rattrapée sur un nom long, où elle
 *    est probable, et jamais sur un fragment court, où elle est indécidable.
 *
 * ★ ET LA DISTANCE EST CALCULÉE SUR LE MOT LE PLUS PROCHE, PAS SUR LA CHAÎNE
 *   ENTIÈRE. « מעלה עבדת » comparé à « עבדט » a une distance de six si l'on
 *   compare les chaînes, et de une si l'on compare mot à mot — et c'est la
 *   seconde qui décrit ce que la personne vient de faire.
 *
 * PURE : ni DOM, ni React.
 */

/**
 * Distance de Damerau–Levenshtein plafonnée.
 *
 * ★ PLAFONNÉE, ET C'EST CE QUI REND LE BALAYAGE GRATUIT. On abandonne dès
 *   qu'une ligne entière dépasse `max` : sur 1 174 noms dont la quasi-totalité
 *   n'a rien à voir avec la requête, l'immense majorité sort après deux ou
 *   trois colonnes. Sans le plafond ce serait 1 174 matrices complètes par
 *   frappe, ce qui se sent sur un iPad.
 *
 * ★ ET LA TRANSPOSITION EST COMPTÉE POUR UNE, parce que c'est la faute de
 *   frappe la plus fréquente au clavier — « רתמים » → « רתמים » avec deux
 *   lettres inversées est UNE erreur pour la personne qui l'a faite.
 */
export function boundedDistance(a: string, b: string, max: number): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let previous2: number[] = []
  let previous: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  let current: number[] = new Array(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    let best = current[0]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, previous2[j - 2] + 1)
      }
      current[j] = v
      if (v < best) best = v
    }
    if (best > max) return max + 1
    previous2 = previous
    previous = current
    current = new Array(b.length + 1)
  }
  return previous[b.length]
}

/** Le seuil de tolérance pour une requête de cette longueur. Voir l'en-tête. */
export function typoBudget(query: string): number {
  if (query.length < 4) return 0
  if (query.length <= 7) return 1
  return 2
}

/** Distance du mot le plus proche de `candidate` à `query`. */
function wordDistance(query: string, candidate: string, max: number): number {
  let best = boundedDistance(query, candidate, max)
  if (best <= max) return best
  for (const word of candidate.split(' ')) {
    if (word === '') continue
    const d = boundedDistance(query, word, max)
    if (d < best) best = d
    if (best === 0) break
  }
  return best
}

export interface RankedOption<T> {
  item: T
  /** 0 = préfixe, 1 = sous-chaîne, 2 = approchant. */
  rank: 0 | 1 | 2
  distance: number
}

/**
 * Les `limit` meilleures propositions pour ce qui a été tapé.
 *
 * ⚠️ LE RANG APPROCHANT N'EST CALCULÉ QUE S'IL RESTE DE LA PLACE. Un préfixe
 *    qui remplit déjà la liste rend la boucle coûteuse inutile — ce qui est le
 *    cas dès la deuxième lettre, c'est-à-dire presque toujours.
 */
export function rankOptions<T>(
  query: string,
  items: readonly T[],
  key: (item: T) => string,
  limit = 8,
): Array<RankedOption<T>> {
  const q = normalizeLocality(query)
  if (q === '') {
    return items.slice(0, limit).map((item) => ({ item, rank: 0 as const, distance: 0 }))
  }

  const prefix: Array<RankedOption<T>> = []
  const inside: Array<RankedOption<T>> = []
  const near: Array<RankedOption<T>> = []
  const budget = typoBudget(q)

  for (const item of items) {
    const n = normalizeLocality(key(item))
    if (n === '') continue
    if (n.startsWith(q)) {
      prefix.push({ item, rank: 0, distance: 0 })
      if (prefix.length >= limit) break
      continue
    }
    if (n.includes(q)) {
      inside.push({ item, rank: 1, distance: 0 })
      continue
    }
    if (budget > 0) {
      const d = wordDistance(q, n, budget)
      if (d <= budget) near.push({ item, rank: 2, distance: d })
    }
  }

  near.sort((a, b) => a.distance - b.distance)
  return [...prefix, ...inside, ...near].slice(0, limit)
}

/**
 * ★★ AF2.2 — LA MÊME TOLÉRANCE POUR LES BARRES DE RECHERCHE DES LISTES.
 *
 * « Les autocomplétions doivent fonctionner partout où elles existent :
 * recherche de ferme, de localité, de lieu. » Les trois listes filtraient en
 * `toLowerCase().includes()`, ce qui rate DEUX choses distinctes en hébreu :
 *
 *   · la PONCTUATION — `ק״ש` et `ק"ש` sont deux chaînes différentes pour
 *     `includes` et le même endroit pour un humain ; idem le maqaf, les
 *     traits d'union et le niqqud. `normalizeLocality` les réconcilie déjà
 *     depuis N4, et la recherche ne s'en servait pas ;
 *   · la FAUTE DE FRAPPE, avec le même budget que l'autocomplétion, de sorte
 *     qu'une lettre à côté donne le même résultat dans une liste et dans un
 *     champ.
 *
 * ⚠️ LA TOLÉRANCE EST TENTÉE EN DERNIER, et seulement si rien ne contient la
 *    requête. Une recherche qui rend des à-peu-près ALORS QU'IL EXISTE des
 *    correspondances exactes est une recherche qui dilue sa propre réponse.
 */
export function looseMatch(query: string, values: readonly string[]): boolean {
  const q = normalizeLocality(query)
  if (q === '') return true
  const budget = typoBudget(q)
  let near = false
  for (const value of values) {
    const n = normalizeLocality(value ?? '')
    if (n === '') continue
    if (n.includes(q)) return true
    if (budget > 0 && !near && wordDistance(q, n, budget) <= budget) near = true
  }
  return near
}
