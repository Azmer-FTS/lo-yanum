import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ROUTE_MARGIN_INITIAL } from '@core/index'

import { Section } from '../components/primitives'
import { ROUTE_MARGIN_MAX, useRouteMargin, writeRouteMargin } from './routeMargin'

/**
 * ★★ AI3.2 — « מרווח ביטחון » : la marge des durées de l'itinéraire libre.
 * Sous « נקודת מוצא », dans « מפה ואזורים » : les deux réglages décident de
 * l'heure qu'annonce une tournée.
 */
export function RouteMarginSection() {
  const { t } = useTranslation()
  const margin = useRouteMargin()
  const [value, setValue] = useState(String(margin))
  const [state, setState] = useState<'idle' | 'saved' | 'bad'>('idle')

  const save = () => {
    const n = Number(value)
    if (value.trim() === '' || !Number.isFinite(n) || n < 0 || n > ROUTE_MARGIN_MAX) {
      setState('bad')
      return
    }
    writeRouteMargin(n)
    setValue(String(Math.round(n)))
    setState('saved')
  }

  return (
    <Section
      title={t('settings.routeMargin.title')}
      className="mt-6"
      collapseKey="settings-route-margin"
      defaultOpen={false}
      summary={`${margin}%`}
    >
      <p className="muted mb-3">{t('settings.routeMargin.intro')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="route-margin">
            {t('settings.routeMargin.label')}
          </label>
          <input
            id="route-margin"
            type="number"
            min={0}
            max={ROUTE_MARGIN_MAX}
            dir="ltr"
            inputMode="numeric"
            className="input w-28"
            data-testid="route-margin"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setState('idle')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
        </div>
        <button type="button" className="btn-primary py-1.5" data-testid="route-margin-save" onClick={save}>
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="route-margin-reset"
          onClick={() => {
            writeRouteMargin(null)
            setValue(String(ROUTE_MARGIN_INITIAL))
            setState('idle')
          }}
        >
          {t('settings.routeMargin.reset', { percent: ROUTE_MARGIN_INITIAL })}
        </button>
        {state === 'saved' && (
          <span className="chip bg-status-success/15 text-status-success-ink">{t('common.saved')}</span>
        )}
        {state === 'bad' && (
          <span className="chip bg-status-danger/15 text-status-danger-ink">{t('common.invalid')}</span>
        )}
      </div>
      <p className="muted mt-2">{t('settings.routeMargin.why', { percent: ROUTE_MARGIN_INITIAL })}</p>
    </Section>
  )
}
