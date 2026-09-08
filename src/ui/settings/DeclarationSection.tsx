import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DECLARATION_TOKENS } from '@core/index'

import { Section } from '../components/primitives'
import {
  declarationTemplate,
  resetDeclarationTemplate,
  useDeclarationOverride,
  writeDeclarationTemplate,
} from './declaration'

/**
 * ★★ AF1.4 (2026-09-09) — « גבארית » DU בלוק הצהרה, MODIFIABLE.
 *
 * Même forme que `SummonsSection`, délibérément : ce sont les deux gabarits du
 * programme, ils vivent côte à côte dans la section « תבניות » d'AF7, et ils
 * se règlent de la même façon. Le refus nomme le jeton perdu, et il n'y en a
 * qu'un — `{{year}}`, voir `core/declaration.ts`.
 */
export function DeclarationSection() {
  const { t } = useTranslation()
  const shipped = t('settings.declaration.defaultTemplate')
  const override = useDeclarationOverride()
  const [text, setText] = useState(() => declarationTemplate(shipped))
  const [state, setState] = useState<'idle' | 'saved' | 'missing'>('idle')
  const [missing, setMissing] = useState<string[]>([])

  const save = () => {
    const result = writeDeclarationTemplate(text)
    if (result.ok) {
      setState('saved')
      setMissing([])
    } else {
      setState('missing')
      setMissing(result.missing)
    }
  }

  return (
    <Section
      title={t('settings.declaration.title')}
      className="mt-6"
      collapseKey="settings-declaration"
      defaultOpen={false}
      summary={
        override === null
          ? t('settings.declaration.summaryShipped')
          : t('settings.declaration.summaryChanged')
      }
    >
      <p className="muted mb-3">{t('settings.declaration.intro')}</p>
      <textarea
        dir="rtl"
        rows={7}
        className="input w-full text-caption leading-relaxed"
        data-testid="declaration-template"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setState('idle')
        }}
      />
      <p className="muted mt-2">
        {t('settings.declaration.tokens')}:{' '}
        <span dir="ltr" className="ltr-nums">
          {DECLARATION_TOKENS.map((k) => `{{${k}}}`).join(' ')}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary py-1.5"
          data-testid="declaration-save"
          onClick={save}
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="declaration-reset"
          onClick={() => {
            resetDeclarationTemplate()
            setText(shipped)
            setState('idle')
            setMissing([])
          }}
        >
          {t('settings.declaration.reset')}
        </button>
        {state === 'saved' && (
          <span className="chip bg-status-success/15 text-status-success-ink">
            {t('common.saved')}
          </span>
        )}
        {state === 'missing' && (
          <span
            data-testid="declaration-missing"
            className="chip bg-status-danger/15 text-status-danger-ink"
          >
            {t('settings.declaration.missing', { list: missing.join(', ') })}
          </span>
        )}
      </div>
    </Section>
  )
}
