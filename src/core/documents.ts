import { landRightIssue } from './fields'
import type { Farm, FarmType, ProvidedDocument } from './types'

export type { ProvidedDocument }

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG6 (2026-09-09) — LA LISTE DES DOCUMENTS SE DÉDUIT DU סוג פעילות.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « La liste se déduit du סוג פעילות de la fiche, sans que le PO ait à
 *     l'expliquer. Pâturage seul → un document. Cultures seules → un document.
 *     Les deux → deux documents. »
 *
 * ★★ DÉDUITE, ET DONC JAMAIS SAISIE — C'EST TOUTE LA DEMANDE. Le PO coche
 *    déjà « מעובד / מרעה / מעורב » sur la fiche parce que c'est ce que le
 *    classeur de l'association demande (AA4). Lui faire cocher une SECONDE
 *    fois « quels documents attendre » serait lui demander de tenir deux
 *    champs d'accord entre eux, et le jour où ils divergeraient c'est
 *    l'agriculteur qui téléverserait le mauvais papier.
 *
 * ★ ET C'EST UNE FONCTION PURE DU TYPE, PAS UNE TABLE EN BASE. Corriger le
 *   סוג פעילות d'une fiche corrige la liste attendue au même instant, sur les
 *   deux écrans qui la lisent, sans migration et sans recalcul.
 *
 * ⚠️ CE QUE CE MODULE NE FAIT PAS : il ne stocke pas les fichiers. Ce qui est
 *    fourni vit sur la fiche (`Farm.providedDocuments`), et la composition de
 *    plusieurs photos en un PDF est dans `ui/report/pdf.ts`, réutilisé tel
 *    quel — voir AG6.2.
 */

/**
 * Les deux documents que l'État attend, et il n'y en a pas de troisième.
 *
 * ⚠️ LES IDENTIFIANTS SONT STABLES ET LES LIBELLÉS NE LE SONT PAS. `id` est
 *    écrit dans les fiches ; le texte hébreu vit dans les traductions, sous
 *    `documents.<id>`. C'est la même séparation que `LAND_AGREEMENT_OPTIONS`.
 */
export type ExpectedDocumentId = 'crops' | 'grazing'

export const EXPECTED_DOCUMENT_IDS: readonly ExpectedDocumentId[] = [
  'crops',
  'grazing',
]

/**
 * Les documents attendus d'une exploitation, dans l'ordre où on les demande.
 *
 *   agriculture (מעובד)  → un : celui des cultures
 *   livestock   (מרעה)   → un : celui du pâturage
 *   mixed       (מעורב)  → les deux
 */
export function expectedDocuments(type: FarmType): ExpectedDocumentId[] {
  switch (type) {
    case 'agriculture':
      return ['crops']
    case 'livestock':
      return ['grazing']
    case 'mixed':
      return ['crops', 'grazing']
  }
}

export interface DocumentChecklistLine {
  id: ExpectedDocumentId
  provided: ProvidedDocument | null
}

/** Ce qui est attendu et ce qui est là, ligne par ligne. */
export function documentChecklist(
  farm: Pick<Farm, 'type' | 'providedDocuments'>,
): DocumentChecklistLine[] {
  const provided = farm.providedDocuments ?? []
  return expectedDocuments(farm.type).map((id) => ({
    id,
    provided: provided.find((p) => p.id === id) ?? null,
  }))
}

/** Combien manquent. Zéro veut dire complète, et c'est ce qui sort de la file. */
export function missingDocumentCount(
  farm: Pick<Farm, 'type' | 'providedDocuments'>,
): number {
  return documentChecklist(farm).filter((l) => l.provided === null).length
}

/**
 * ★★ AG6.4 — ET LE DOCUMENT FOURNI NE RÉPOND PAS À LA QUESTION D'AA2bis.
 *
 *   « Quand le document fourni est un סוג הסכם קרקע faible — הצהרת חקלאים
 *     בלבד, אין מסמך, לא ידוע — l'avertissement d'AA2bis s'applique : le droit
 *     du signataire sur la terre n'est pas établi. »
 *
 * ⚠️ LES DEUX QUESTIONS SE RESSEMBLENT ET NE SONT PAS LA MÊME, ET C'EST LE
 *    PIÈGE QUE CETTE FONCTION EXISTE POUR NOMMER. « Le dossier est-il
 *    complet ? » se répond en comptant des fichiers. « Cet homme a-t-il le
 *    droit sur cette terre ? » se répond en lisant CE QUE DIT le papier. Une
 *    exploitation peut avoir déposé ses deux PDF — dossier complet, plus rien
 *    dans la file — et n'avoir pour tout titre qu'une הצהרת חקלאים, c'est-à-dire
 *    sa propre parole. La complétude ne doit donc jamais faire taire AA2bis, et
 *    cette fonction est ce qu'un écran appelle pour poser la deuxième question
 *    après la première.
 */
export function documentsCompleteButRightUnproven(
  farm: Pick<Farm, 'type' | 'providedDocuments' | 'landAgreement' | 'landAgreementUntil'>,
  todayKey: string,
): boolean {
  if (missingDocumentCount(farm) > 0) return false
  return landRightIssue(farm, todayKey) !== 'none'
}
