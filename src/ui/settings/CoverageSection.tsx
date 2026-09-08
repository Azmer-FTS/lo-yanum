import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { NEGLECT_DAYS_INITIAL } from '@core/index'

import { Section } from '../components/primitives'
import { resetCoverage, useCoverageSettings, writeCoverage } from './coverage'

/**
 * ★★ AC4.5 (2026-09-08) — « פריסת שמירות » DANS LES RÉGLAGES.
 *
 * One number: after how many days without a night an ACTIVE farm is marked as
 * forgotten on the חוות screen. See `coverage.ts` for why it is stored on the
 * device, and `core/access.ts` for why the initial value is thirty.
 *
 * ⚠️ THE INITIAL VALUE IS NAMED IN THE RESET BUTTON, not hidden behind it. A
 *    « חזרה לערך ההתחלתי » that does not say what it returns to is a button
 *    nobody presses; AB5a's target section learnt the same thing.
 */
export function CoverageSection() {
  const { t } = useTranslation()
  const { neglectDays } = useCoverageSettings()
  const [days, setDays] = useState(String(neglectDays))
  const [saved, setSaved] = useState<'idle' | 'saved' | 'bad'>('idle')

  const save = () => {
    const n = Number(days)
    /* A zero or a negative would flag the whole roster for ever, which is the
       same as flagging nothing. Refused, and said so. */
    if (!Number.isFinite(n) || n <= 0) {
      setSaved('bad')
      return
    }
    writeCoverage({ neglectDays: Math.round(n) })
    setSaved('saved')
  }

  return (
    <Section
      title={t('settings.coverageTitle')}
      className="mt-6"
      collapseKey="settings-coverage"
      summary={String(neglectDays)}
    >
      <p className="muted mb-3">{t('settings.coverageIntro')}</p>
      <div className="auto-cols gap-3 [--col-min:11rem]">
        <div>
          <label className="label" htmlFor="coverage-days">
            {t('settings.coverageDays')}
          </label>
          <input
            id="coverage-days"
            type="number"
            dir="ltr"
            inputMode="numeric"
            className="input w-full"
            data-testid="coverage-days"
            value={days}
            onChange={(e) => {
              setDays(e.target.value)
              setSaved('idle')
            }}
          />
        </div>
      </div>
      <p className="muted mt-2">{t('settings.coverageWhy')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary py-1.5"
          data-testid="coverage-save"
          onClick={save}
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="coverage-reset"
          onClick={() => {
            resetCoverage()
            setDays(String(NEGLECT_DAYS_INITIAL))
            setSaved('idle')
          }}
        >
          {t('settings.coverageReset', { days: NEGLECT_DAYS_INITIAL })}
        </button>
        {saved === 'saved' && (
          <span className="chip bg-status-success/15 text-status-success-ink">
            {t('common.saved')}
          </span>
        )}
        {saved === 'bad' && (
          <span className="chip bg-status-danger/15 text-status-danger-ink">
            {t('common.invalid')}
          </span>
        )}
      </div>
    </Section>
  )
}
