import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Section } from '../components/primitives'
import { defaultVigil, resetVigil, useVigil, writeVigil } from './vigil'

/**
 * ★★ AE3.2 · AE3.3 (2026-09-08) — « סימני חיים » DANS LES RÉGLAGES.
 *
 * Trois nombres, en minutes. Même forme qu'AB5a, AC4.5 et AD2.3, et le bouton
 * de retour NOMME les trois valeurs auxquelles il revient — un « חזרה לערך
 * ההתחלתי » qui ne dit pas à quoi il revient est un bouton que personne
 * n'appuie.
 *
 * ⚠️ ET LA PHRASE SOUS LES CHAMPS EST LA MISE EN GARDE, PAS UNE EXPLICATION.
 *    C'est le seul de ces réglages dont la mauvaise valeur casse la
 *    fonctionnalité au lieu de la dégrader : un point de contrôle toutes les
 *    vingt minutes produit un volontaire qui coupe les notifications, et alors
 *    les trois signaux se taisent ensemble.
 */
export function VigilSection() {
  const { t } = useTranslation()
  const initial = defaultVigil()
  const current = useVigil()
  const [arrival, setArrival] = useState(String(current.arrivalGraceMinutes))
  const [checkpoint, setCheckpoint] = useState(String(current.checkpointIntervalMinutes))
  const [close, setClose] = useState(String(current.closeGraceMinutes))
  const [saved, setSaved] = useState<'idle' | 'saved' | 'bad'>('idle')

  const save = () => {
    const a = Number(arrival)
    const c = Number(checkpoint)
    const z = Number(close)
    if (![a, c, z].every((n) => Number.isFinite(n) && n > 0)) {
      setSaved('bad')
      return
    }
    writeVigil({
      arrivalGraceMinutes: Math.round(a),
      checkpointIntervalMinutes: Math.round(c),
      closeGraceMinutes: Math.round(z),
    })
    setSaved('saved')
  }

  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
  ) => (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        dir="ltr"
        inputMode="numeric"
        className="input w-full"
        data-testid={id}
        value={value}
        onChange={(e) => {
          set(e.target.value)
          setSaved('idle')
        }}
      />
    </div>
  )

  /**
   * ⚠️ REPLIÉE PAR DÉFAUT, ET `bun run layout` EST POURQUOI : הגדרות est
   *    plafonné à six hauteurs d'écran à 390 px (A30), et les deux sections
   *    neuves de cette passe l'ont poussé à 6,2.
   *
   *    Le RÉSUMÉ porte le fait — les trois délais, ou « modifié » pour le
   *    gabarit — donc rien n'est caché : seule l'ÉDITION se replie. C'est
   *    exactement la règle des sections pliables de la fiche ferme, et c'est
   *    aussi la bonne pour ces deux-là, qu'on règle une fois par saison.
   */
  return (
    <Section
      title={t('settings.vigil.title')}
      className="mt-6"
      collapseKey="settings-vigil"
      defaultOpen={false}
      summary={`${current.arrivalGraceMinutes} / ${current.checkpointIntervalMinutes} / ${current.closeGraceMinutes}`}
    >
      <p className="muted mb-3">{t('settings.vigil.intro')}</p>
      <div className="auto-cols gap-3 [--col-min:11rem]">
        {field('vigil-arrival', t('settings.vigil.arrival'), arrival, setArrival)}
        {field('vigil-checkpoint', t('settings.vigil.checkpoint'), checkpoint, setCheckpoint)}
        {field('vigil-close', t('settings.vigil.close'), close, setClose)}
      </div>
      <p className="muted mt-2">{t('settings.vigil.why')}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary py-1.5" data-testid="vigil-save" onClick={save}>
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="vigil-reset"
          onClick={() => {
            resetVigil()
            setArrival(String(initial.arrivalGraceMinutes))
            setCheckpoint(String(initial.checkpointIntervalMinutes))
            setClose(String(initial.closeGraceMinutes))
            setSaved('idle')
          }}
        >
          {t('settings.vigil.reset', {
            arrival: initial.arrivalGraceMinutes,
            checkpoint: initial.checkpointIntervalMinutes,
            close: initial.closeGraceMinutes,
          })}
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
