import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { AREA_GAP_THRESHOLD_INITIAL } from '@core/index'

import { Section } from '../components/primitives'
import { resetAreaGap, useAreaGapSettings, writeAreaGap } from './areaGap'

/**
 * ★★ AD2.3 (2026-09-08) — « פער בין הצהרה לתיחום » DANS LES RÉGLAGES.
 *
 * Un nombre : à partir de quel écart entre la surface déclarée et la surface
 * mesurée la fiche affiche sa note. Voir `areaGap.ts` pour pourquoi il est
 * stocké sur l'appareil, et `core/fields.ts` pour pourquoi la valeur initiale
 * est dix pour cent plutôt que trois.
 *
 * ⚠️ LA VALEUR INITIALE EST NOMMÉE DANS LE BOUTON, pas cachée derrière — même
 *    règle qu'AB5a et AC4.5, et pour la même raison : un « חזרה לערך ההתחלתי »
 *    qui ne dit pas à quoi il revient est un bouton que personne n'appuie.
 */
export function AreaGapSection() {
  const { t } = useTranslation()
  const initial = Math.round(AREA_GAP_THRESHOLD_INITIAL * 100)
  const { gapPercent } = useAreaGapSettings()
  const [percent, setPercent] = useState(String(gapPercent))
  const [saved, setSaved] = useState<'idle' | 'saved' | 'bad'>('idle')

  const save = () => {
    const n = Number(percent)
    /* Un zéro allumerait la note sur le moindre dounam de différence, ce qui
       revient à ne rien signaler du tout. Refusé, et dit. */
    if (!Number.isFinite(n) || n <= 0) {
      setSaved('bad')
      return
    }
    writeAreaGap({ gapPercent: Math.round(n) })
    setSaved('saved')
  }

  return (
    <Section
      title={t('settings.areaGapTitle')}
      className="mt-6"
      /* ★★ AH12 — REPLIÉE PAR DÉFAUT, ET `bun run layout` EST POURQUOI. L'écran
         des réglages faisait 6,6 hauteurs d'écran à 390 px contre un plafond
         de six (A30) — il était au-dessus AVANT cette passe, et une passe qui
         ajoute une section sans regarder le plafond est celle qui le fera
         crever. Ce réglage est un SEUIL : on le pose une fois et on le relit
         dans le résumé, qui reste à l'écran. */
      collapseKey="settings-area-gap"
      defaultOpen={false}
      summary={`${gapPercent}%`}
    >
      <p className="muted mb-3">{t('settings.areaGapIntro')}</p>
      <div className="auto-cols gap-3 [--col-min:11rem]">
        <div>
          <label className="label" htmlFor="area-gap-percent">
            {t('settings.areaGapPercent')}
          </label>
          <input
            id="area-gap-percent"
            type="number"
            dir="ltr"
            inputMode="numeric"
            className="input w-full"
            data-testid="area-gap-percent"
            value={percent}
            onChange={(e) => {
              setPercent(e.target.value)
              setSaved('idle')
            }}
          />
        </div>
      </div>
      <p className="muted mt-2">{t('settings.areaGapWhy')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary py-1.5"
          data-testid="area-gap-save"
          onClick={save}
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="area-gap-reset"
          onClick={() => {
            resetAreaGap()
            setPercent(String(initial))
            setSaved('idle')
          }}
        >
          {t('settings.areaGapReset', { percent: initial })}
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
