/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — LA NATURE DE L'EXPLOITATION (« ענפים »).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le responsable veut savoir, sur chaque poste, ce qui s'y trouve : bovins,
 * ovins, vergers, grandes cultures. Ça change ce qu'on demande au volontaire
 * et ce qu'on explique à la yeshiva. »
 *
 * ★ PLUSIEURS VALEURS PAR FICHE, CHACUNE AVEC SON DRAPEAU « À CONFIRMER ».
 *   Une valeur déduite (du nom que l'agriculteur a donné à son exploitation,
 *   de son logo) entre drapeau levé ; le drapeau tombe quand le PO valide.
 *   Une valeur que le PO ajoute lui-même entre validée : il vient de le dire.
 *
 * ★ L'ORDRE EST CELUI DE LA NOMENCLATURE, pas celui de la saisie : deux fiches
 *   qui portent les mêmes natures les écrivent pareil (aller-retour stable,
 *   colonne lisible d'une ligne à l'autre).
 *
 * ⚠️ DISTINCTE DE `type` (חקלאות · מרעה, AK2), qui dit la nature des SURFACES
 *    et commande la pondération des dounams. Celle-ci dit ce qu'on trouve sur
 *    place ; elle ne pèse dans aucun compteur.
 *
 * PUR : ni DOM, ni React.
 */

export const FARM_BRANCHES = [
  'cattle', // בקר
  'sheep', // צאן
  'orchards', // מטעים
  'vineyard', // כרם
  'fieldCrops', // גד״ש
  'vegetables', // ירקות
  'therapeutic', // חווה טיפולית
  'poultry', // לול
  'other', // אחר
] as const

export type FarmBranchKind = (typeof FARM_BRANCHES)[number]

export interface FarmBranch {
  kind: FarmBranchKind
  /** Déduite, pas encore validée par le PO. Absent = validée. */
  toConfirm?: boolean
}

export const isFarmBranchKind = (v: unknown): v is FarmBranchKind =>
  typeof v === 'string' && (FARM_BRANCHES as readonly string[]).includes(v)

const rank = (k: FarmBranchKind): number => FARM_BRANCHES.indexOf(k)

/**
 * Une liste propre : valeurs connues seulement, une fois chacune (une valeur
 * validée l'emporte sur la même « à confirmer »), dans l'ordre de la
 * nomenclature. Une cellule abîmée rend `[]`, jamais une exception.
 */
export function normalizeBranches(raw: unknown): FarmBranch[] {
  if (!Array.isArray(raw)) return []
  const byKind = new Map<FarmBranchKind, FarmBranch>()
  for (const item of raw) {
    const kind = typeof item === 'string' ? item : (item as { kind?: unknown } | null)?.kind
    if (!isFarmBranchKind(kind)) continue
    const toConfirm = typeof item === 'object' && item !== null && (item as { toConfirm?: unknown }).toConfirm === true
    const prior = byKind.get(kind)
    if (prior && !prior.toConfirm) continue
    byKind.set(kind, toConfirm ? { kind, toConfirm: true } : { kind })
  }
  return [...byKind.values()].sort((a, b) => rank(a.kind) - rank(b.kind))
}

export const branchesOf = (e: { branches?: readonly FarmBranch[] }): FarmBranch[] => normalizeBranches(e.branches ?? [])

export const hasBranch = (e: { branches?: readonly FarmBranch[] }, kind: FarmBranchKind): boolean =>
  branchesOf(e).some((b) => b.kind === kind)

export const branchesToConfirm = (e: { branches?: readonly FarmBranch[] }): FarmBranch[] =>
  branchesOf(e).filter((b) => b.toConfirm)

/**
 * Le geste du PO sur une pastille :
 *   absente      → ajoutée, VALIDÉE (il vient de le dire) ;
 *   à confirmer  → validée (il l'affirme) ;
 *   validée      → retirée.
 */
export function toggleBranch(list: readonly FarmBranch[], kind: FarmBranchKind): FarmBranch[] {
  const cur = normalizeBranches(list)
  const found = cur.find((b) => b.kind === kind)
  if (!found) return normalizeBranches([...cur, { kind }])
  if (found.toConfirm) return cur.map((b) => (b.kind === kind ? { kind } : b))
  return cur.filter((b) => b.kind !== kind)
}

/** « אישור הכל » : toutes les valeurs déduites deviennent validées. */
export function confirmBranches(list: readonly FarmBranch[]): FarmBranch[] {
  return normalizeBranches(list).map((b) => ({ kind: b.kind }))
}

/** Combien de fiches portent chaque nature (le filtre affiche le compte). */
export function branchCounts(rows: ReadonlyArray<{ branches?: readonly FarmBranch[] }>): Record<FarmBranchKind, number> {
  const out = Object.fromEntries(FARM_BRANCHES.map((k) => [k, 0])) as Record<FarmBranchKind, number>
  for (const r of rows) for (const b of branchesOf(r)) out[b.kind] += 1
  return out
}

/**
 * Le filtre des fermes : une fiche passe si elle porte L'UNE des natures
 * choisies — « בקר » + « צאן » = les fermes d'élevage. C'est la règle des
 * feuilles de filtres (Airbnb, Booking) : OU dans une famille, ET entre les
 * familles.
 */
export function matchesBranches(e: { branches?: readonly FarmBranch[] }, wanted: readonly FarmBranchKind[]): boolean {
  if (wanted.length === 0) return true
  const own = new Set(branchesOf(e).map((b) => b.kind))
  return wanted.some((k) => own.has(k))
}
