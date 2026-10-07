import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@core/index'
import type { Farm, LandDocument } from '@core/index'
import { AGREEMENTS_BUCKET, signedUrl } from '../../data/storage'
import { Icon } from '../components/Icon'
import { Section } from '../components/primitives'
import { useLocale } from '../hooks/useLocale'

/**
 * ★★ AS1.5 — LES CONTRATS DE DROIT SUR LA TERRE (הסכם רעיה/חכירה), RATTACHÉS.
 *
 * Venus du portail : le PDF est recopié par la fonction Edge `portal-document`
 * dans le seau privé `agreements` ; il s'ouvre par une adresse SIGNÉE, à durée
 * limitée (le seau n'est lisible que du coordinateur). Tant qu'il est en file,
 * ou s'il a échoué, le lien d'origine du portail reste offert.
 */
export function LandDocumentsSection({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const docs = farm.landDocuments ?? []
  const [busy, setBusy] = useState<string | null>(null)

  const open = async (doc: LandDocument): Promise<void> => {
    /* La fenêtre s'ouvre DANS le geste (Safari bloque une fenêtre ouverte
       après une attente) ; on lui donne l'adresse quand elle arrive. */
    const win = window.open('', '_blank', 'noopener')
    setBusy(doc.id)
    try {
      const url = doc.status === 'stored' && doc.storageKey ? await signedUrl(AGREEMENTS_BUCKET, doc.storageKey) : null
      const target = url ?? doc.url
      if (target && win) win.location.href = target
      else if (target) window.location.href = target
      else win?.close()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Section
      title={t('landDocs.title')}
      collapseKey="entity-land-docs"
      summary={t('landDocs.summary', { count: docs.length })}
    >
      {docs.length === 0 ? (
        <p className="muted" data-testid="land-docs-empty">
          {t('landDocs.none')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="land-docs">
          {docs.map((doc) => (
            <li
              key={doc.id}
              data-testid={`land-doc-${doc.id}`}
              data-status={doc.status}
              className="flex flex-wrap items-center gap-3 rounded-field border border-edge-subtle bg-surface-raised px-3 py-2"
            >
              <Icon name="document" size={18} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-caption font-semibold text-content-primary" dir="ltr">
                  {doc.fileName}
                </p>
                <p className="muted">
                  {t(`landDocs.status.${doc.status}`)} · {t(`landDocs.source.${doc.source}`)} ·{' '}
                  {formatDate(doc.addedAt, locale)}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary min-h-[2.75rem]"
                data-testid={`land-doc-open-${doc.id}`}
                disabled={busy === doc.id || (!doc.storageKey && !doc.url)}
                onClick={() => void open(doc)}
              >
                <Icon name="external" size={15} />
                {t('landDocs.open')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
