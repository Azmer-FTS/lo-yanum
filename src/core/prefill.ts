import { proposedFarmName } from './remoteSign'
import type { FarmContact } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH1 (2026-09-09) — ON NE REDEMANDE JAMAIS CE QUI EST DÉJÀ ÉCRIT.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le constat du PO en créant une ferme devant un agriculteur : « les mêmes
 * informations sont demandées à plusieurs endroits, et je ne sais plus si je
 * parle de la même personne. » Il a nommé trois redondances ; le recensement
 * en a trouvé sept (voir le rapport d'AH1). Elles ont toutes la même forme —
 * DEUX CHAMPS POUR UNE SEULE VÉRITÉ — et donc le même remède.
 *
 * ★★ LA RÈGLE, ÉCRITE UNE FOIS : quand une information est déjà connue
 *    ailleurs dans le formulaire, le champ suivant la PROPOSE en gris. Taper
 *    la remplace ; ne rien taper l'accepte. `inherited()` est l'endroit — le
 *    seul — où « ne rien taper l'accepte » est décidé.
 *
 * ⚠️ POURQUOI UNE PROPOSITION GRISE ET NON UNE VALEUR ÉCRITE DANS L'ÉTAT.
 *    Une valeur écrite se met à courir après sa source : le PO corrige le
 *    prénom de l'agriculteur, et le nom de la ferme qu'il avait tapé à la main
 *    trois minutes plus tôt se fait écraser. Une proposition ne s'écrase pas
 *    elle-même : elle n'existe que tant que le champ est vide. C'est la même
 *    prudence qu'AG4.1 sur `proposedFarmName`, appliquée à sept champs au lieu
 *    d'un.
 *
 * ⚠️ ET LES PROPOSITIONS NE SE CHAÎNENT PAS, SAUF UNE, NOMMÉE. Elles se
 *    calculent toutes sur les valeurs TAPÉES, jamais sur une autre
 *    proposition — sinon un prénom saisi ferait apparaître un nom de fiche
 *    déduit d'un nom de ferme déduit, et le PO enregistrerait trois valeurs
 *    dont il n'aurait vu qu'une. La seule exception est `name` ← `farmName`,
 *    parce que le PO l'a demandée nommément (« le nom de la ferme redemandé
 *    alors qu'il se déduit ») et parce qu'elle est visible : les deux champs
 *    sont l'un sous l'autre.
 *
 * PURE : ni DOM, ni React, ni hébreu de copie — comme tout /src/core. Le
 * gabarit « החווה של {{first}} » arrive en argument, comme en AG4.
 */

/**
 * Ce que le formulaire retiendra pour un champ : ce qui est tapé, sinon ce qui
 * est proposé. Les deux vides donnent la chaîne vide, jamais `undefined` — un
 * champ de texte n'a pas d'état « pas de valeur ».
 */
export function inherited(
  typed: string | null | undefined,
  suggested: string | null | undefined,
): string {
  const t = (typed ?? '').trim()
  if (t !== '') return t
  return (suggested ?? '').trim()
}

/** L'état brut du formulaire dont dépendent les propositions. */
export interface FarmFormSources {
  name: string
  locality: string
  farmName: string
  farmerName: string
  farmerPhone: string
  farmerEmail: string
  contacts: readonly Pick<FarmContact, 'name' | 'phone' | 'email' | 'isPrimary'>[]
}

/**
 * Les propositions, un champ à la fois. Une chaîne vide veut dire « rien à
 * proposer » et le champ reste nu.
 */
export interface FarmFormSuggestions {
  /** שם החווה ← « החווה של <prénom> » (AH1.5 · AG4.1, la même fonction). */
  farmName: string
  /** שם הרשומה ← le nom de l'exploitation, à défaut le יישוב. */
  name: string
  /** שם החקלאי ← le contact PRINCIPAL, jamais un secondaire. */
  farmerName: string
  /** נייד החקלאי ← le portable du contact principal. */
  farmerPhone: string
  /** דוא״ל החקלאי ← le courriel du contact principal. */
  farmerEmail: string
  /** Le premier contact ← l'agriculteur, dans l'autre sens. */
  primaryContactName: string
  primaryContactPhone: string
  primaryContactEmail: string
}

/**
 * ★ LE CONTACT PRINCIPAL, ET LA MÊME DÉFINITION QU'AILLEURS. `isPrimary`
 *   d'abord, le premier de la liste à défaut — c'est ce que fait déjà
 *   `agreementFieldValues` (core/declaration.ts), et deux définitions du mot
 *   « principal » finiraient par désigner deux personnes.
 */
export function primaryContactOf<T extends { isPrimary: boolean }>(
  contacts: readonly T[],
): T | null {
  return contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null
}

export function farmFormSuggestions(
  s: FarmFormSources,
  farmNamePattern: string,
): FarmFormSuggestions {
  const primary = primaryContactOf(s.contacts)
  const farmerName = s.farmerName.trim()
  const farmName = s.farmName.trim()

  /* AH1.5 — la proposition d'AG4.1, la même fonction, écrite une seule fois. */
  const proposedFarm = proposedFarmName(farmerName, farmNamePattern)

  /* La seule proposition chaînée, et elle est nommée dans l'en-tête. */
  const effectiveFarmName = farmName !== '' ? farmName : proposedFarm

  return {
    farmName: farmName === '' ? proposedFarm : '',
    name:
      s.name.trim() === ''
        ? effectiveFarmName || s.locality.trim()
        : '',
    farmerName: farmerName === '' ? (primary?.name ?? '').trim() : '',
    farmerPhone: s.farmerPhone.trim() === '' ? (primary?.phone ?? '').trim() : '',
    farmerEmail: s.farmerEmail.trim() === '' ? (primary?.email ?? '').trim() : '',
    primaryContactName:
      (primary?.name ?? '').trim() === '' ? farmerName : '',
    primaryContactPhone:
      (primary?.phone ?? '').trim() === '' ? s.farmerPhone.trim() : '',
    primaryContactEmail:
      (primary?.email ?? '').trim() === '' ? s.farmerEmail.trim() : '',
  }
}

// ---------------------------------------------------------------------------
// AH1.3 — « le contact de terrain est la même personne »
// ---------------------------------------------------------------------------

/**
 * ★★ UNE CASE À COCHER QUI RECOPIE, PAS UNE DEUXIÈME SAISIE.
 *
 * Le PO : « le contact du dossier et le contact de terrain sont souvent la
 * même personne. » Sur cette fiche, le contact du dossier est l'agriculteur
 * qui signe (`farmerName` / `farmerPhone`, AA2) et le contact de terrain est
 * le מזכיר qui vous oriente (`liaisonName` / `liaisonPhone`). Quand c'est le
 * même homme, il était saisi deux fois — et corrigé une fois sur deux.
 *
 * ⚠️ L'ÉTAT DE LA CASE N'EST PAS UN CHAMP DE PLUS EN BASE, IL SE DÉDUIT. Une
 *    colonne `liaisonIsFarmer` serait une seconde vérité, et c'est elle qui
 *    finirait fausse le jour où quelqu'un corrige le nom du מזכיר par l'import.
 *    La case est cochée quand les deux paires sont identiques, ce qui est
 *    exactement ce que la case veut dire.
 */
export function liaisonIsFarmer(f: {
  farmerName: string
  farmerPhone: string
  liaisonName: string
  liaisonPhone: string
}): boolean {
  const fn = f.farmerName.trim()
  const fp = f.farmerPhone.trim()
  if (fn === '' && fp === '') return false
  return fn === f.liaisonName.trim() && fp === f.liaisonPhone.trim()
}
