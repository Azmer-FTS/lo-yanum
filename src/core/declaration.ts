import type { Farm } from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF1 (2026-09-09) — « הסכם התנדבות- ארצנו » : LE DOCUMENT QUE
 *    L'AGRICULTEUR SIGNE, ET SES QUATRE CASES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO a fourni la capture du formulaire de l'association il y a plusieurs
 * jours et rien ne l'avait repris : la signature ouvrait un cadre vide et
 * produisait un PDF générique, sans le contenu de l'association, sans son
 * logo, et sans reprendre le nom du signataire ni celui de la ferme.
 *
 * ★★ CE FICHIER EST LA MOITIÉ QUI NE SAIT PAS DESSINER, et c'est délibéré.
 *    `src/ui/agreement/artzenu.ts` pose l'encre sur le canevas ; ici il n'y a
 *    que les VALEURS — quelles cases porte le document, d'où chacune vient de
 *    la fiche, et ce qu'un gabarit de הצהרה doit contenir pour être acceptable.
 *    C'est la règle du dépôt (`core/report.ts` : le domaine décide des
 *    chiffres, le rendu décide de leur place) et ici elle paie deux fois : une
 *    porte peut interroger le contenu du document sans lancer Chromium.
 *
 * ⚠️ AUCUNE CASE N'EST OBLIGATOIRE, ET C'EST UNE DÉCISION DE TERRAIN. Le PO
 *    est debout devant l'agriculteur ; refuser de produire le document parce
 *    que le ת״ז manque, c'est renvoyer les deux hommes à un carnet papier. Une
 *    case vide sort comme une LIGNE VIDE à remplir à la main — exactement ce
 *    que le formulaire de l'association fait déjà sur ses propres exemplaires.
 *
 * PURE : ni DOM, ni React, ni hébreu de copie — comme tout /src/core.
 */

/** Une case du bloc d'en-tête, dans l'ordre du formulaire de l'association. */
export type AgreementFieldKey = 'place' | 'farmerName' | 'farmerId' | 'phone'

export const AGREEMENT_FIELDS: readonly AgreementFieldKey[] = [
  'place',
  'farmerName',
  'farmerId',
  'phone',
] as const

export interface AgreementFieldValues {
  /** מקום התנדבות — le lieu, tel qu'on le dit au téléphone. */
  place: string
  /** שם החקלאי. */
  farmerName: string
  /** תז/חפ. */
  farmerId: string
  /** נייד. */
  phone: string
}

/**
 * Les quatre valeurs, prises sur la fiche.
 *
 * ⚠️ CHAQUE REPLI EST UNE DÉCISION, PAS UNE COMMODITÉ :
 *
 *   · `place` — le nom de l'exploitation ET la localité quand les deux sont
 *     connus et différents. « חוות רתם » seul ne dit pas à un lecteur de
 *     l'association où c'est ; « רתמים » seul ne dit pas laquelle des quatre
 *     exploitations du יישוב (AC1) est concernée.
 *   · `farmerName` — `farmerName` (« שם החקלאי », AA2), et à défaut le contact
 *     PRINCIPAL. Le contact secondaire n'est jamais pris : c'est le מזכיר de
 *     l'אגודה qui vous oriente, pas celui qui signe.
 *   · `phone` — le portable du CHCLAI d'abord, celui du contact principal
 *     ensuite. Même raison, et dans le même ordre.
 */
export function agreementFieldValues(farm: Farm): AgreementFieldValues {
  const primary = farm.contacts.find((c) => c.isPrimary) ?? farm.contacts[0] ?? null
  /* `farmName` est le nom du HOLDING (AC1) ; `name` est le libellé de la
     fiche. L'un des deux est toujours là, et c'est celui-là qu'on nomme. */
  const holding = (farm.farmName ?? '').trim() || (farm.name ?? '').trim()
  const locality = (farm.locality ?? '').trim()

  const place =
    holding && locality && holding !== locality
      ? `${holding}, ${locality}`
      : holding || locality

  return {
    place,
    farmerName: (farm.farmerName ?? '').trim() || (primary?.name ?? '').trim(),
    farmerId: (farm.farmerId ?? '').trim(),
    phone: (farm.farmerPhone ?? '').trim() || (primary?.phone ?? '').trim(),
  }
}

// ---------------------------------------------------------------------------
// Le gabarit du הצהרה (AF1.4)
// ---------------------------------------------------------------------------

/**
 * ★ UN SEUL JETON, ET IL EST OBLIGATOIRE.
 *
 * « Le texte du הצהרה est un GABARIT modifiable dans les réglages, l'année
 * s'insérant automatiquement. » L'année est le seul élément du paragraphe qui
 * change sans qu'on y pense — et c'est précisément celui qu'un coordinateur
 * oublierait de mettre à jour le 1er janvier. Un gabarit qui l'a perdu est
 * refusé à l'enregistrement, exactement comme le gabarit du SMS (AE4).
 */
export type DeclarationToken = 'year'

export const DECLARATION_TOKENS: readonly DeclarationToken[] = ['year'] as const

const PATTERN = /\{\{\s*([a-zA-Z]+)\s*\}\}/g

/** Les jetons obligatoires qu'un gabarit a perdus. Vide = complet. */
export function missingDeclarationTokens(template: string): DeclarationToken[] {
  const present = new Set<string>()
  for (const m of template.matchAll(PATTERN)) present.add(m[1])
  return DECLARATION_TOKENS.filter((tok) => !present.has(tok))
}

/**
 * Le rendu. Un jeton inconnu est laissé TEL QUEL plutôt qu'effacé — même
 * règle que `renderSummons`, et pour la même raison : le coordinateur doit
 * voir sa faute de frappe dans l'aperçu plutôt qu'un trou dans le document.
 */
export function renderDeclaration(
  template: string,
  values: Record<DeclarationToken, string>,
): string {
  return template.replace(PATTERN, (whole, name: string) =>
    (DECLARATION_TOKENS as readonly string[]).includes(name)
      ? values[name as DeclarationToken]
      : whole,
  )
}
