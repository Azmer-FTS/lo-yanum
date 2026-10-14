/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — LIER ET DÉLIER UNE FERME À UNE INSTITUTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « C'est le vrai sujet de cette passe, et il touche la base. »
 *
 * ★ LE MODÈLE ACCEPTE PLUSIEURS INSTITUTIONS SUR UNE MÊME FERME, ET C'EST
 *   DÉLIBÉRÉ : on bascule une ferme d'une institution à l'autre en milieu de
 *   saison, et une grosse ferme peut être couverte par deux institutions sur
 *   des nuits différentes. ⛔ Aucune contrainte d'unicité en base.
 *
 * ★ MAIS LE PARRAINAGE EST LA RÈGLE DE TRAVAIL : une ferme a UNE institution.
 *   C'est ce module qui le fait respecter, pas le schéma. Lier une ferme déjà
 *   liée ailleurs ne fait RIEN tant que le PO n'a pas choisi (`planLink` rend
 *   `conflict`, avec le nom de ce qui est en place) ; les trois choix sont,
 *   dans cet ordre, « להחליף » (le plus fréquent), « להוסיף », « ביטול ».
 *
 * PUR : ni DOM, ni React, ni magasin (`bgpass` le rejoue).
 */

export interface FarmInstitutionLink {
  id: string
  farmId: string
  institutionId: string
  createdAt: string
  /**
   * Qui a créé le lien : l'utilisateur authentifié, posé PAR LA BASE
   * (`auth.uid()`, déclencheur) — le client ne le connaît pas et ne l'invente
   * pas. `null` dans le jumeau de démonstration et avant la première lecture.
   */
  createdBy: string | null
}

/** Les trois réponses de la boîte, dans l'ordre où elle les présente. */
export type LinkChoice = 'replace' | 'add' | 'cancel'
export const LINK_CHOICES: readonly LinkChoice[] = ['replace', 'add', 'cancel'] as const

export type LinkPlan =
  /** Déjà liée à CETTE institution : rien à faire. */
  | { kind: 'already' }
  /** Liée à personne : le lien se crée d'un geste. */
  | { kind: 'create' }
  /** ★ Déjà liée AILLEURS : rien ne se fait sans un choix du PO. */
  | { kind: 'conflict'; others: string[] }

/** Les liens d'une ferme (un lien en double compte une fois). */
export function institutionsOfFarm(links: readonly FarmInstitutionLink[], farmId: string): string[] {
  const out: string[] = []
  for (const l of links) if (l.farmId === farmId && !out.includes(l.institutionId)) out.push(l.institutionId)
  return out
}

export function farmsOfInstitution(links: readonly FarmInstitutionLink[], institutionId: string): string[] {
  const out: string[] = []
  for (const l of links) if (l.institutionId === institutionId && !out.includes(l.farmId)) out.push(l.farmId)
  return out
}

export function isFarmLinked(links: readonly FarmInstitutionLink[], farmId: string, institutionId: string): boolean {
  return links.some((l) => l.farmId === farmId && l.institutionId === institutionId)
}

/** ★ 5.4 — l'EXCEPTION que le PO doit repérer : une ferme liée à plus d'une institution. */
export function isMultiLinked(links: readonly FarmInstitutionLink[], farmId: string): boolean {
  return institutionsOfFarm(links, farmId).length > 1
}

/** Ce qu'un toucher sur un chaînon OUVERT ferait. */
export function planLink(links: readonly FarmInstitutionLink[], farmId: string, institutionId: string): LinkPlan {
  if (isFarmLinked(links, farmId, institutionId)) return { kind: 'already' }
  const others = institutionsOfFarm(links, farmId).filter((id) => id !== institutionId)
  return others.length === 0 ? { kind: 'create' } : { kind: 'conflict', others }
}

/**
 * Les liens après le geste. `choice` n'est lu QUE sur un conflit ; sans choix
 * (`null`), un conflit ne change rien — c'est la garde de 5.3.
 *
 *   create             → + 1 lien
 *   conflict, replace  → les liens de la ferme ailleurs sont retirés, + 1 lien
 *                        (il en reste EXACTEMENT un : le nouveau)
 *   conflict, add      → + 1 lien (la ferme est liée aux deux)
 *   conflict, cancel   → inchangé
 *   already            → inchangé
 */
export function applyLink(
  links: readonly FarmInstitutionLink[],
  farmId: string,
  institutionId: string,
  choice: LinkChoice | null,
  make: () => FarmInstitutionLink,
): FarmInstitutionLink[] {
  const plan = planLink(links, farmId, institutionId)
  if (plan.kind === 'already') return [...links]
  if (plan.kind === 'create') return [...links, make()]
  if (choice === 'replace') return [...links.filter((l) => l.farmId !== farmId), make()]
  if (choice === 'add') return [...links, make()]
  return [...links]
}

/** Délier : CE lien (cette ferme, cette institution) et uniquement lui. */
export function applyUnlink(links: readonly FarmInstitutionLink[], farmId: string, institutionId: string): FarmInstitutionLink[] {
  return links.filter((l) => !(l.farmId === farmId && l.institutionId === institutionId))
}
