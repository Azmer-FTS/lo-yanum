import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  attachProvidedDocument,
  documentChecklist,
  documentsCompleteButRightUnproven,
  dayKeyOf,
  formatDate,
  getMyFarm,
  isReadOnly,
  now,
} from '@core/index'
import type { ExpectedDocumentId } from '@core/index'

import { fileToDataUrl, photosToPdf } from '../../documents'
import { Icon } from '../../components/Icon'
import { Callout, PageHeader, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { readOnlyProps, useReadOnly } from '../../settings/viewAs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG6 (2026-09-09) — LES DOCUMENTS À FOURNIR, DU CÔTÉ DE L'AGRICULTEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ CE QUI EST ATTENDU N'EST PAS ÉCRIT ICI. La liste vient de
 *   `documentChecklist`, qui la déduit du סוג פעילות de la fiche : voir
 *   `core/documents.ts` pour pourquoi c'est une déduction et jamais une saisie.
 *   Cet écran ne fait que la RENDRE et recevoir les fichiers.
 *
 * ★★ DEUX VOIES, ET LA SECONDE EST CELLE QUI SERT (AG6.2). « Il téléverse un
 *    PDF, OU PHOTOGRAPHIE ses papiers et l'app en compose un PDF ». Le PDF
 *    tout prêt est le cas du kibboutz qui a un secrétariat ; la photo est le
 *    cas de tout le monde d'autre. C'est pourquoi le bouton photo accepte
 *    PLUSIEURS fichiers dès le premier appui : un contrat de l'État fait trois
 *    pages, et un écran qui n'en accepte qu'une oblige à recommencer trois
 *    fois — après quoi personne ne recommence.
 */
export function FarmerDocumentsScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const farm = useCoreValue(getMyFarm)
  const readOnly = useReadOnly()
  const [busy, setBusy] = useState<ExpectedDocumentId | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!farm) return null

  const todayKey = dayKeyOf(now())
  const checklist = documentChecklist(farm)
  const rightUnproven = documentsCompleteButRightUnproven(farm, todayKey)

  const accept = async (
    id: ExpectedDocumentId,
    files: FileList | null,
  ): Promise<void> => {
    if (!files || files.length === 0 || readOnly || isReadOnly()) return
    setBusy(id)
    setError(null)
    try {
      const list = Array.from(files)
      const pdfs = list.filter((f) => f.type === 'application/pdf')
      const fileName = t('documents.fileName', {
        name: (farm.farmName || farm.name || '').trim() || '—',
        kind: t(`documents.${id}`),
      })
      /**
       * ⚠️ UN PDF DÉPOSÉ EST PRIS TEL QUEL ET N'EST JAMAIS RECOMPOSÉ. Le
       *    repasser par un canevas en ferait une image de lui-même : trois
       *    fois plus lourd, illisible à la loupe, et il perdrait son texte
       *    sélectionnable — c'est-à-dire qu'on dégraderait le seul cas où le
       *    document arrive déjà parfait.
       */
      const file =
        pdfs.length === 1 && list.length === 1
          ? pdfs[0]
          : await photosToPdf(
              list.filter((f) => f.type.startsWith('image/')),
              fileName,
              { title: fileName, author: 'לא ינום' },
            )
      attachProvidedDocument(farm.id, {
        id,
        providedAt: new Date().toISOString(),
        fileName,
        file: await fileToDataUrl(file),
        pages: list.length,
      })
    } catch {
      /* Un fichier illisible, un HEIC qu'un vieux navigateur ne décode pas.
         On le dit, on ne perd rien, et le coordinateur reste joignable. */
      setError(t('documents.failed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title={t('documents.title')} subtitle={farm.name} />

      <p className="muted mb-3">{t('documents.hint')}</p>

      {error && (
        <Callout tone="danger" title={t('documents.failedTitle')}>
          {error}
        </Callout>
      )}

      <div className="flex flex-col gap-4">
        {checklist.map((line) => (
          <Section
            key={line.id}
            title={t(`documents.${line.id}`)}
            collapseKey={`documents-${line.id}`}
          >
            <p
              data-testid={`document-state-${line.id}`}
              className={`chip ${
                line.provided
                  ? 'bg-status-success/15 text-status-success-ink'
                  : 'bg-status-warn/15 text-status-warn-ink'
              }`}
            >
              <Icon name={line.provided ? 'check' : 'upload'} size={13} />
              {line.provided
                ? t('documents.providedOn', {
                    date: formatDate(line.provided.providedAt, locale),
                  })
                : t('documents.missing')}
            </p>

            <label className="label mt-3" htmlFor={`doc-photo-${line.id}`}>
              {t('documents.photograph')}
            </label>
            <input
              id={`doc-photo-${line.id}`}
              data-testid={`document-photos-${line.id}`}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              disabled={readOnly || busy !== null}
              {...readOnlyProps(readOnly, t('viewAs.blocked'))}
              className="input"
              onChange={(e) => void accept(line.id, e.target.files)}
            />
            <p className="muted mt-1">{t('documents.photographHint')}</p>

            <label className="label mt-3" htmlFor={`doc-pdf-${line.id}`}>
              {t('documents.uploadPdf')}
            </label>
            <input
              id={`doc-pdf-${line.id}`}
              data-testid={`document-pdf-${line.id}`}
              type="file"
              accept="application/pdf"
              disabled={readOnly || busy !== null}
              {...readOnlyProps(readOnly, t('viewAs.blocked'))}
              className="input"
              onChange={(e) => void accept(line.id, e.target.files)}
            />

            {busy === line.id && (
              <p className="muted mt-2">{t('documents.composing')}</p>
            )}
          </Section>
        ))}
      </div>

      {/* ★★ AG6.4 — ET LE DOSSIER COMPLET NE RÉPOND PAS À LA QUESTION D'AA2bis.
          Voir `documentsCompleteButRightUnproven` : « tout est fourni » et
          « le droit sur la terre est établi » sont deux questions, et c'est la
          seconde qui décide si une garde peut avoir lieu. */}
      {rightUnproven && (
        <Callout tone="warn" title={t('landRight.title')}>
          <span data-testid="documents-right-unproven">{t('landRight.unprovenBody')}</span>
        </Callout>
      )}
    </>
  )
}
