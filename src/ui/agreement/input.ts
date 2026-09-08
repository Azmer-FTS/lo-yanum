import { agreementFieldValues, renderDeclaration } from '@core/index'
import type { Agreement, Farm } from '@core/index'

import { declarationTemplate } from '../settings/declaration'
import type { AgreementPageInput } from './artzenu'

export type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * ★★ AF1.1 (2026-09-09) — « LE PO NE RESSAISIT RIEN DEVANT L'AGRICULTEUR ».
 *
 * Le seul endroit où la fiche devient un document. Les VALEURS viennent de
 * @core (`agreementFieldValues`), la COPIE vient des traductions, le GABARIT
 * vient des réglages — et l'année est posée ici parce qu'elle est la seule
 * chose du paragraphe qui dépende du moment où l'on imprime.
 *
 * ⚠️ L'ANNÉE EST CELLE DE LA SIGNATURE QUAND IL Y EN A UNE, ET L'ANNÉE COURANTE
 *    SINON. Un contrat signé le 3 janvier et réimprimé en décembre doit
 *    continuer de dire « בשנת 2026 » : la déclaration porte sur l'année de
 *    l'activité, pas sur la date du tirage. Avant signature il n'y a pas
 *    d'autre réponse que « cette année », qui est la bonne dans les deux cas
 *    où l'on regarde le document avant de le signer.
 */
export function agreementPageInput(
  farm: Farm,
  agreement: Agreement,
  t: Translate,
  locale: string,
): AgreementPageInput {
  const fields = agreementFieldValues(farm)
  const signedAt = agreement.signedAt
  const when = new Date(signedAt)
  const year = (Number.isNaN(when.getTime()) ? new Date() : when).getFullYear()

  return {
    fields,
    title: t('agreement.docTitle'),
    labels: {
      place: t('agreement.fieldPlace'),
      farmerName: t('agreement.fieldFarmerName'),
      farmerId: t('agreement.fieldFarmerId'),
      phone: t('agreement.fieldPhone'),
    },
    declarationHeading: t('agreement.declarationHeading'),
    declarationText: renderDeclaration(
      declarationTemplate(t('settings.declaration.defaultTemplate')),
      { year: String(year) },
    ),
    signatureHeading: t('agreement.signatureHeading'),
    signerLabel: t('agreement.signerLabel'),
    dateLabel: t('agreement.dateLabel'),
    signature: agreement.signature ?? null,
    /* Le nom sous le trait est celui qui a signé s'il a été saisi, sinon le
       nom de l'agriculteur de la fiche — jamais le nom de l'exploitation, qui
       n'est pas une personne et ne signe rien. */
    signedBy: (agreement.signedBy || fields.farmerName || '').trim(),
    signedAt,
    locale,
    footer: t('agreement.footer'),
  }
}

/** Le nom du fichier produit, une fois pour toutes les sorties. */
export function agreementFileName(farm: Farm, t: Translate): string {
  return t('agreement.fileName', { name: (farm.farmName || farm.name || '').trim() || '—' })
}
