import {
  agreementValues,
  parseAgreementBlocks,
  renderAgreementTemplate,
} from '@core/index'
import type { Agreement, AgreementValues, Farm } from '@core/index'

import { agreementTemplate, readAgreementLogo } from '../settings/agreementDoc'
import type { AgreementPageInput } from './artzenu'

export type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * ★★ AF1.1 (2026-09-09) — « LE PO NE RESSAISIT RIEN DEVANT L'AGRICULTEUR ».
 * ★★ AH5.1 (2026-09-09) — ET C'EST LE SEUL ENDROIT OÙ LA FICHE, LE GABARIT ET
 *    LE LOGO SE RENCONTRENT.
 *
 * « Le même texte sert la signature en présentiel sur tablette (AF1), la
 *   signature à distance par lien (AG4), et le PDF produit. Une seule
 *   fonction. » C'est celle-ci : les trois chemins l'appellent, donc ils ne
 *   PEUVENT PAS diverger. Un quatrième chemin qui composerait son document
 *   ailleurs serait un document que le PO n'a jamais relu.
 *
 * ⚠️ L'ANNÉE EST CELLE DE LA SIGNATURE QUAND IL Y EN A UNE, ET L'ANNÉE COURANTE
 *    SINON. Un contrat signé le 3 janvier et réimprimé en décembre doit
 *    continuer de dire « בשנת 2026 » : la déclaration porte sur l'année de
 *    l'activité, pas sur la date du tirage.
 *
 * ⚠️ ET LA DATE DE SIGNATURE N'EXISTE QU'UNE FOIS SIGNÉ. Avant l'encre, la
 *    variable {{תאריך_חתימה}} est VIDE — donc sa ligne disparaît (AH5.3) plutôt
 *    que d'afficher la date d'aujourd'hui sur un document que personne n'a
 *    encore signé, ce qui serait une fausse mention sur un papier archivé.
 */
export function agreementPageInput(
  farm: Farm,
  agreement: Agreement,
  t: Translate,
  locale: string,
): AgreementPageInput {
  const signedAt = agreement.signedAt
  const when = new Date(signedAt)
  const valid = !Number.isNaN(when.getTime())
  const year = (valid ? when : new Date()).getFullYear()
  const dateText = valid
    ? when.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  const values: AgreementValues = agreementValues(farm, {
    year: String(year),
    signedAtText: agreement.signature ? dateText : '',
  })

  const rendered = renderAgreementTemplate(
    agreementTemplate(t('settings.agreementDoc.defaultTemplate')),
    values,
  )

  return {
    blocks: parseAgreementBlocks(rendered),
    logo: readAgreementLogo(),
    signatureHeading: t('agreement.signatureHeading'),
    signerLabel: t('agreement.signerLabel'),
    dateLabel: t('agreement.dateLabel'),
    signature: agreement.signature ?? null,
    /* Le nom sous le trait est celui qui a signé s'il a été saisi, sinon le
       nom de l'agriculteur de la fiche — jamais le nom de l'exploitation, qui
       n'est pas une personne et ne signe rien. */
    signedBy: (agreement.signedBy || values['שם_החקלאי'] || '').trim(),
    signedAtText: dateText,
    footer: t('agreement.footer'),
    title: t('agreement.docTitle'),
  }
}

/** Le nom du fichier produit, une fois pour toutes les sorties. */
export function agreementFileName(farm: Farm, t: Translate): string {
  return t('agreement.fileName', { name: (farm.farmName || farm.name || '').trim() || '—' })
}
