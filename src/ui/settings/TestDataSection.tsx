import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { purgeTestData, seedTestData, testDataCount } from '@core/index'

import { Icon } from '../components/Icon'
import { Callout, Section } from '../components/primitives'
import { useCoreValue } from '../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH3 (2026-09-09) — LE JEU D'ESSAI : LE POSER, ET LE RETIRER.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ DEUX BOUTONS ET UN COMPTE, PAS DAVANTAGE. Le brief ne demande qu'une
 *   chose de cet écran : « מחיקת נתוני בדיקה, qui supprime ce jeu et LUI SEUL,
 *   confirmation avant, compte des lignes supprimées après ». Le bouton de
 *   pose est l'autre moitié inévitable — un jeu qu'on ne peut pas remettre est
 *   un jeu qu'on ne supprime jamais.
 *
 * ⚠️ LA CONFIRMATION DIT CE QUI SURVIT, PAS SEULEMENT CE QUI PART. C'est la
 *    seule phrase qui compte pour quelqu'un dont les vraies fermes sont dans
 *    la même liste.
 */
export function TestDataSection() {
  const { t } = useTranslation()
  const count = useCoreValue(testDataCount)
  const [message, setMessage] = useState<string | null>(null)

  const seed = () => {
    const { added } = seedTestData()
    setMessage(t('testData.seeded', { count: added }))
  }

  const purge = () => {
    if (!window.confirm(t('testData.confirm'))) return
    const { removed } = purgeTestData()
    setMessage(t('testData.purged', { count: removed }))
  }

  return (
    <Section
      title={t('testData.title')}
      className="mt-6"
      collapseKey="settings-test-data"
      defaultOpen={false}
      summary={count > 0 ? t('testData.present') : t('testData.absent')}
    >
      <p className="muted">{t('testData.intro')}</p>
      <p
        className="mt-3 text-caption font-medium text-content-primary"
        data-testid="test-data-status"
      >
        {count > 0 ? t('testData.count', { count }) : t('testData.none')}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary"
          data-testid="test-data-seed"
          onClick={seed}
        >
          <Icon name="plus" size={16} />
          {t('testData.seed')}
        </button>
        {count > 0 && (
          <button
            type="button"
            className="btn-secondary border-status-danger/40 text-status-danger-ink"
            data-testid="test-data-purge"
            onClick={purge}
          >
            <Icon name="trash" size={16} />
            {t('testData.purge')}
          </button>
        )}
      </div>

      {message && (
        <div className="mt-4">
          <Callout tone="success" icon="check" title={message}>
            <span data-testid="test-data-message">{message}</span>
          </Callout>
        </div>
      )}
    </Section>
  )
}
