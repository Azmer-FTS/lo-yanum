import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { purgeTestData, seedTestData, testDataCount } from '@core/index'

import { SUPABASE_CONFIGURED } from '../../data/config'
import { Icon } from '../components/Icon'
import { Callout, Section } from '../components/primitives'
import { useCoreValue, useCoreVersion } from '../hooks/useCore'
import { stopViewAs, useViewAs } from './viewAs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI8 (2026-09-14) — הגדרות → נתוני הדגמה ובדיקה. UNE SECTION, UN BOUTON.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Remplace `DemoDataSection` (N3) et `TestDataSection` (AH3). Les deux vivaient
 * côte à côte, la seconde repliée, et le bouton « tout supprimer » de la
 * première ne prenait que `demo-` — c'est ce qui a laissé au PO une ferme, un
 * volontaire et un conducteur d'origine inconnue. Voir `data/demo.ts`.
 *
 * ★ LA SECTION S'OUVRE D'ELLE-MÊME QUAND IL Y A QUELQUE CHOSE À RETIRER. Des
 *   données marquées présentes ne doivent pas se cacher derrière un titre
 *   replié ; absentes, la section n'a rien à dire et reste fermée.
 *
 * ⚠️ LES DEUX CONFIRMATIONS DISENT CE QUI SURVIT — ce que le PO a créé, son
 *    compte, ses réglages — et la seconde dit que le cache de l'appareil part
 *    avec. C'est la seule phrase qui compte pour quelqu'un dont les vraies
 *    fermes sont dans la même liste.
 */
export function SampleDataSection() {
  const { t } = useTranslation()
  const tests = useCoreValue(testDataCount)
  const viewing = useViewAs()
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [demo, setDemo] = useState<{ entities: number; volunteers: number; missions: number; total: number } | null>(
    null,
  )

  // Re-read whenever the store changes, through the lazily loaded module so a
  // demo build never fetches the data layer.
  const version = useCoreVersion()
  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return
    let live = true
    void import('../../data/demo').then((m) => {
      if (live) setDemo(m.demoCounts())
    })
    return () => {
      live = false
    }
  }, [version])

  const demoTotal = demo?.total ?? 0
  const total = demoTotal + tests
  /* Le verdict d'une suppression reste lisible : la section ne se replie pas
     sous le message qui dit ce qui vient de partir. */
  const open = total > 0 || state !== 'idle'

  const seed = () => {
    const { added } = seedTestData()
    setMessage(t('testData.seeded', { count: added }))
    setState('done')
  }

  const purge = async () => {
    if (!window.confirm(t('settings.sample.confirm1'))) return
    if (!window.confirm(t('settings.sample.confirm2'))) return
    setState('busy')
    try {
      /* Une visite « voir comme » d'une personne qui va disparaître n'a plus
         d'objet ; on revient au rôle de rekaz avant de vider. */
      if (viewing) stopViewAs()
      const { removed, remaining } = SUPABASE_CONFIGURED
        ? await (await import('../../data/demo')).purgeSampleData()
        : { removed: purgeTestData().removed, remaining: testDataCount() }
      if (remaining > 0) {
        setMessage(t('settings.sample.remaining', { count: remaining }))
        setState('error')
        return
      }
      setMessage(t('settings.sample.done', { count: removed }))
      setState('done')
    } catch (error: unknown) {
      setMessage(t('settings.sample.failed', { message: error instanceof Error ? error.message : String(error) }))
      setState('error')
    }
  }

  return (
    <Section
      /* ⚠️ La clé remonte la section quand des données marquées apparaissent :
         `defaultOpen` n'est lu qu'au montage, et les comptes du jeu de
         démonstration arrivent après (import paresseux, hydratation). */
      key={open ? 'open' : 'folded'}
      title={t('settings.sample.title')}
      className="mt-6"
      collapseKey="settings-sample-data"
      defaultOpen={open}
      summary={total > 0 ? t('settings.sample.summary', { count: total }) : t('settings.sample.summaryNone')}
    >
      <p className="muted">{t('settings.sample.intro')}</p>

      <ul className="mt-3 space-y-1 text-caption font-medium text-content-primary">
        {SUPABASE_CONFIGURED && (
          <li data-testid="demo-data-status">
            {demoTotal === 0
              ? t('settings.demo.none')
              : t('settings.demo.count', {
                  entities: demo?.entities ?? 0,
                  volunteers: demo?.volunteers ?? 0,
                  missions: demo?.missions ?? 0,
                  total: demoTotal,
                })}
          </li>
        )}
        <li data-testid="test-data-status">
          {tests > 0 ? t('testData.count', { count: tests }) : t('testData.none')}
        </li>
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" data-testid="test-data-seed" onClick={seed}>
          <Icon name="plus" size={16} />
          {t('testData.seed')}
        </button>
        {total > 0 && (
          <button
            type="button"
            className="btn-secondary border-status-danger/40 text-status-danger-ink"
            data-testid="sample-data-purge"
            disabled={state === 'busy'}
            onClick={() => void purge()}
          >
            <Icon name="trash" size={16} />
            {state === 'busy' ? t('settings.demo.busy') : t('settings.sample.purge')}
          </button>
        )}
      </div>

      {state === 'done' && (
        <div className="mt-4" data-testid="sample-data-verdict" data-verdict="done">
          <Callout tone="success" icon="check" title={message} />
        </div>
      )}
      {state === 'error' && (
        <div className="mt-4" data-testid="sample-data-verdict" data-verdict="error">
          <Callout tone="danger" title={message} />
        </div>
      )}
    </Section>
  )
}
