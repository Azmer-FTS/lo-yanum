import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPABASE_CONFIGURED } from '../../data/config'
import type { StoredObject } from '../../data/storage'
import {
  agreementDocument,
  removeTemplate,
  templateInfo,
  uploadTemplate,
} from '../agreement/document'
import { Icon } from '../components/Icon'
import { Callout, Section } from '../components/primitives'
import { useLocale } from '../hooks/useLocale'
import { megabytes } from '../offline'

/**
 * ORDRE DE NUIT 2026-09-02 (N2) — הגדרות → תבנית הסכם.
 *
 * The association's real contract is ONE PDF, uploaded here once, and from
 * then on every entity's "view / download / share" opens it instead of the
 * marked placeholder. The section says which of the two is live right now,
 * because "which contract will the farmer be shown" is a thing the
 * coordinator must be able to read off the screen rather than remember.
 *
 * ★ THE FILE INPUT IS THE UPLOAD. No form, no second step: choosing the file
 *   sends it, and the status line changes when the bucket has it. A 20 MB
 *   cap is the bucket's own (`agreements`, P2.4), restated here only so the
 *   refusal is in Hebrew rather than a storage error code.
 */
export function AgreementTemplateSection() {
  const { t } = useTranslation()
  const locale = useLocale()
  const input = useRef<HTMLInputElement>(null)
  const [info, setInfo] = useState<StoredObject | null | 'unknown'>('unknown')
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const refresh = async () => {
    if (!SUPABASE_CONFIGURED) {
      setInfo(null)
      return
    }
    setInfo(await templateInfo().catch(() => null))
  }

  useEffect(() => {
    void refresh()
  }, [])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setState('error')
      setMessage(t('settings.agreement.onlyPdf'))
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setState('error')
      setMessage(t('settings.agreement.tooBig'))
      return
    }
    setState('uploading')
    setMessage('')
    try {
      await uploadTemplate(file)
      await refresh()
      setState('done')
    } catch (error: unknown) {
      setState('error')
      setMessage(
        t('settings.agreement.failed', {
          message: error instanceof Error ? error.message : String(error),
        }),
      )
    } finally {
      if (input.current) input.current.value = ''
    }
  }

  const onRemove = async () => {
    if (!window.confirm(t('settings.agreement.removeConfirm'))) return
    setState('uploading')
    try {
      await removeTemplate()
      await refresh()
      setState('idle')
    } catch (error: unknown) {
      setState('error')
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  const view = async () => {
    const doc = await agreementDocument()
    // The current document, in a NEW tab and never in this window: the
    // trap N2 fixes was a PDF replacing the app with no way back.
    window.open(doc.url, '_blank', 'noopener,noreferrer')
  }

  const uploaded = info !== 'unknown' && info !== null

  return (
    <Section title={t('settings.agreement.title')} className="mt-6">
      <p className="muted">{t('settings.agreement.intro')}</p>

      <p className="mt-3 text-caption font-medium text-content-primary" data-testid="agreement-template-status">
        {uploaded
          ? t('settings.agreement.uploaded', {
              size: megabytes(info.size),
              date: info.updatedAt
                ? new Date(info.updatedAt).toLocaleDateString(locale)
                : '—',
            })
          : t('settings.agreement.placeholder')}
      </p>

      {SUPABASE_CONFIGURED ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            data-testid="agreement-template-file"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn-primary"
            data-testid="agreement-template-upload"
            disabled={state === 'uploading'}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" size={16} />
            {state === 'uploading'
              ? t('settings.agreement.uploading')
              : uploaded
                ? t('settings.agreement.replace')
                : t('settings.agreement.upload')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => void view()}>
            <Icon name="eye" size={16} />
            {t('settings.agreement.view')}
          </button>
          {uploaded && (
            <button
              type="button"
              className="btn-secondary"
              data-testid="agreement-template-remove"
              disabled={state === 'uploading'}
              onClick={() => void onRemove()}
            >
              <Icon name="trash" size={16} />
              {t('settings.agreement.remove')}
            </button>
          )}
        </div>
      ) : (
        <p className="muted mt-3">{t('settings.agreement.demo')}</p>
      )}

      {state === 'done' && (
        <div className="mt-4">
          <Callout tone="success" icon="check" title={t('settings.agreement.uploadedNow')} />
        </div>
      )}
      {state === 'error' && (
        <div className="mt-4">
          <Callout tone="danger" title={message} />
        </div>
      )}
    </Section>
  )
}
