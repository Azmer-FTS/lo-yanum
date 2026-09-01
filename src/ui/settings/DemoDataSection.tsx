import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPABASE_CONFIGURED } from '../../data/config'
import { Icon } from '../components/Icon'
import { Callout, Section } from '../components/primitives'
import { useCoreVersion } from '../hooks/useCore'

/**
 * ORDRE DE NUIT 2026-09-02 (N3) — הגדרות → נתוני הדגמה.
 *
 * Says how much of the programme on screen is the demo dataset, and offers
 * the one button that removes all of it — behind TWO confirmations, because
 * the button sits next to the coordinator's real farms and a purge is not
 * something an outbox can bring back. It removes the `demo-` rows and nothing
 * else (`data/demo.ts`); the product owner's own entity survives it by
 * construction, and the gate `bun run demo` proves that on the real bundle.
 */
export function DemoDataSection() {
  const { t } = useTranslation()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [counts, setCounts] = useState<{ entities: number; volunteers: number; missions: number; total: number } | null>(null)

  // Re-read whenever the store changes, through the lazily loaded module so a
  // demo build never fetches the data layer.
  const version = useCoreVersion()
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return
    let live = true
    void import('../../data/demo').then((m) => {
      if (live) setCounts(m.demoCounts())
    })
    return () => {
      live = false
    }
  }, [version])

  const purge = async () => {
    if (!window.confirm(t('settings.demo.confirm1'))) return
    if (!window.confirm(t('settings.demo.confirm2'))) return
    setState('busy')
    try {
      const m = await import('../../data/demo')
      const { removed } = await m.purgeDemoData()
      setMessage(t('settings.demo.done', { count: removed }))
      setState('done')
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error))
      setState('error')
    }
  }

  if (!SUPABASE_CONFIGURED) return null
  const total = counts?.total ?? 0

  return (
    <Section title={t('settings.demo.title')} className="mt-6">
      <p className="muted">{t('settings.demo.intro')}</p>
      <p className="mt-3 text-caption font-medium text-content-primary" data-testid="demo-data-status">
        {total === 0
          ? t('settings.demo.none')
          : t('settings.demo.count', {
              entities: counts?.entities ?? 0,
              volunteers: counts?.volunteers ?? 0,
              missions: counts?.missions ?? 0,
              total,
            })}
      </p>
      {total > 0 && (
        <button
          type="button"
          className="btn-secondary mt-4 border-status-danger/40 text-status-danger-ink"
          data-testid="demo-data-purge"
          disabled={state === 'busy'}
          onClick={() => void purge()}
        >
          <Icon name="trash" size={16} />
          {state === 'busy' ? t('settings.demo.busy') : t('settings.demo.purge')}
        </button>
      )}
      {state === 'done' && (
        <div className="mt-4">
          <Callout tone="success" icon="check" title={message} />
        </div>
      )}
      {state === 'error' && (
        <div className="mt-4">
          <Callout tone="danger" title={t('settings.demo.failed', { message })} />
        </div>
      )}
    </Section>
  )
}
