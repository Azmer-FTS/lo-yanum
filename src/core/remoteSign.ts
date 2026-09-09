import type { Farm } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG4 (2026-09-09) — LE FORMULAIRE QUE L'AGRICULTEUR REMPLIT SEUL, ET LA
 *    RÈGLE QUI GOUVERNE TOUTE LA PASSE EST ÉCRITE ICI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le formulaire que remplit l'agriculteur doit rester SIMPLE. Il le remplit
 *     seul, sur son téléphone, sans personne pour l'aider. Chaque champ ajouté
 *     est un abandon possible. En cas de doute, retire. »
 *
 * ★★ IL Y A EXACTEMENT SEPT CHOSES, ET LA LISTE EST FERMÉE. Quatre champs de
 *    texte dont un facultatif, une photo facultative, une case, une signature.
 *    Ce fichier est l'endroit où cette fermeture est écrite : ajouter un champ
 *    ici doit coûter un débat, pas un `useState`.
 *
 * ⛔ CE QUI N'EST PAS DEMANDÉ, ET C'EST UNE DÉCISION EXPLICITE DU PO, PAS UN
 *    OUBLI — écrit en négatif parce que c'est la seule forme qu'une absence
 *    peut prendre dans du code :
 *
 *    · ⛔ AUCUNE SURFACE (AG4.2). Ni מעובד, ni מרעה, ni שטחים שמירה. Le PO les
 *      saisit lui-même, et il a raison : un agriculteur qui doit répondre
 *      « combien de dounams » ouvre un tiroir, cherche un vieux contrat, et
 *      revient une semaine plus tard — ou jamais. La porte A145 vérifie qu'il
 *      n'existe AUCUN champ de surface sur cet écran, plutôt que de faire
 *      confiance à cette phrase.
 *
 *    · ⛔ AUCUNE LECTURE AUTOMATIQUE DE LA CARTE D'IDENTITÉ (AG4.3). Pas d'OCR,
 *      pas de reconnaissance de la bande MRZ, rien. La photo est une PIÈCE
 *      JOINTE et le numéro est TAPÉ. Deux raisons, et la seconde suffirait :
 *      un OCR qui se trompe d'un chiffre produit un contrat au nom de
 *      quelqu'un d'autre, parfaitement lisible et parfaitement faux ; et la
 *      moindre bibliothèque de reconnaissance pèse plusieurs mégaoctets sur un
 *      téléphone qui a une barre de réseau. A145 vérifie qu'aucun traitement
 *      de l'image n'est déclenché.
 */

// ---------------------------------------------------------------------------
// Les champs, et rien de plus
// ---------------------------------------------------------------------------

/**
 * Les quatre champs de texte du formulaire, dans l'ordre où on les demande.
 *
 * ★ L'ORDRE EST CELUI DU DOCUMENT DE L'ASSOCIATION (AF1) : שם החקלאי · תז/חפ ·
 *   נייד, puis le nom de l'exploitation. Un formulaire qui ne suit pas l'ordre
 *   du papier qu'il produit oblige à faire des allers-retours entre les deux.
 */
export type SignFieldId = 'farmerName' | 'farmerId' | 'farmerPhone' | 'farmName'

export const SIGN_FIELDS: readonly SignFieldId[] = [
  'farmerName',
  'farmerId',
  'farmerPhone',
  'farmName',
]

/** Les trois obligatoires. `farmName` est le seul facultatif (AG4.1). */
export const SIGN_REQUIRED: readonly SignFieldId[] = [
  'farmerName',
  'farmerId',
  'farmerPhone',
]

export interface SignDraft {
  farmerName: string
  farmerId: string
  farmerPhone: string
  farmName: string
  /** AG4.1 — l'image de la carte, en URL de données. Facultative par défaut. */
  idPhoto: string | null
  accepted: boolean
  /** L'encre, en URL de données PNG. */
  signature: string | null
}

export const EMPTY_SIGN_DRAFT: SignDraft = {
  farmerName: '',
  farmerId: '',
  farmerPhone: '',
  farmName: '',
  idPhoto: null,
  accepted: false,
  signature: null,
}

// ---------------------------------------------------------------------------
// AG4.6 — le nom de ferme proposé
// ---------------------------------------------------------------------------

/**
 * ★★ AG4.1 · A146 — « proposé automatiquement "החווה של <prénom>" quand il est
 *    vide, format déjà utilisé par l'association ; modifiable ».
 *
 * ★ LE PRÉNOM ET NON LE NOM COMPLET, parce que c'est le format que
 *   l'association emploie déjà dans son classeur : « החווה של יוסי », pas
 *   « החווה של יוסי כהן ». Un nom d'exploitation est ce qu'on dit au
 *   téléphone.
 *
 * ⚠️ ET C'EST UNE PROPOSITION, JAMAIS UNE ÉCRITURE SILENCIEUSE. La valeur est
 *    posée dans le CHAMP, où l'agriculteur la voit et peut la remplacer par le
 *    vrai nom de sa ferme. La calculer au moment d'enregistrer produirait un
 *    nom qu'il n'a jamais vu — et il le découvrirait sur un contrat.
 */
export function proposedFarmName(farmerName: string, pattern: string): string {
  const first = (farmerName ?? '').trim().split(/\s+/)[0] ?? ''
  if (first === '') return ''
  return pattern.replace('{{first}}', first)
}

// ---------------------------------------------------------------------------
// Ce que le PO a déjà rempli, et ce qui reste à demander
// ---------------------------------------------------------------------------

/**
 * ★★ AG4.4 — « Les champs déjà remplis par le PO s'affichent en lecture et ne
 *    sont pas redemandés. Seuls les champs manquants sont saisissables. »
 *
 * ★ POURQUOI EN LECTURE ET NON EN CHAMP PRÉ-REMPLI, qui est l'autre solution
 *   évidente : un champ pré-rempli invite à corriger, et une correction faite
 *   par l'agriculteur sur un téléphone au milieu d'une soirée écrase une
 *   valeur que le coordinateur a saisie depuis le classeur de l'association.
 *   La correction existe — c'est le bouton « ce n'est pas moi / c'est faux »
 *   de l'écran — mais elle est un GESTE, pas un accident de clavier.
 */
export function givenFields(farm: Farm): Record<SignFieldId, string> {
  return {
    farmerName: (farm.farmerName ?? '').trim(),
    farmerId: (farm.farmerId ?? '').trim(),
    farmerPhone: (farm.farmerPhone ?? '').trim(),
    farmName: (farm.farmName ?? '').trim(),
  }
}

export interface SignFormState {
  /** Ce que la fiche porte déjà — affiché, jamais redemandé. */
  given: Record<SignFieldId, string>
  /** Ce qu'il reste à saisir : les champs vides sur la fiche. */
  asked: SignFieldId[]
  /** La valeur finale de chaque champ : la fiche, ou la saisie. */
  values: Record<SignFieldId, string>
  /** Les obligatoires encore vides. Vide = on peut signer. */
  missing: SignFieldId[]
  /** AG4.5 — pourquoi la signature est bloquée, ou `null`. */
  blocked: SignBlockReason | null
}

/**
 * ★ TROIS RAISONS DE BLOQUER, ET ELLES SONT NOMMÉES SÉPARÉMENT.
 *
 * « La signature est bloquée tant qu'un champ obligatoire est vide, AVEC UN
 *   MESSAGE QUI NOMME CE QUI MANQUE. » Un unique « formulaire incomplet »
 *   oblige à chercher, et sur un téléphone chercher veut dire faire défiler.
 */
export type SignBlockReason =
  | { kind: 'fields'; fields: SignFieldId[] }
  | { kind: 'photo' }
  | { kind: 'accept' }

export function signFormState(
  farm: Farm,
  draft: SignDraft,
  options: { requireIdPhoto: boolean },
): SignFormState {
  const given = givenFields(farm)
  const asked = SIGN_FIELDS.filter((id) => given[id] === '')

  const values = {} as Record<SignFieldId, string>
  for (const id of SIGN_FIELDS) {
    values[id] = given[id] !== '' ? given[id] : (draft[id] ?? '').trim()
  }

  const missing = SIGN_REQUIRED.filter((id) => values[id] === '')

  /**
   * ⚠️ L'ORDRE DES TROIS BLOCAGES EST L'ORDRE DE L'ÉCRAN, ET IL COMPTE. Dire
   *    « cochez la case » à quelqu'un dont la ת״ז manque encore l'enverrait
   *    cocher, réessayer, et découvrir un second refus. Un refus à la fois, et
   *    le plus haut de l'écran d'abord.
   */
  let blocked: SignBlockReason | null = null
  if (missing.length > 0) blocked = { kind: 'fields', fields: missing }
  else if (options.requireIdPhoto && draft.idPhoto === null) blocked = { kind: 'photo' }
  else if (!draft.accepted) blocked = { kind: 'accept' }

  return { given, asked, values, missing, blocked }
}

/** La signature est-elle permise en l'état ? */
export function canSign(state: SignFormState): boolean {
  return state.blocked === null
}
