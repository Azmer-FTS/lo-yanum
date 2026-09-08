import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SUMMONS_TOKENS } from '@core/index'

import { Section } from '../components/primitives'
import {
  resetSummonsTemplate,
  summonsTemplate,
  useSummonsOverride,
  writeSummonsTemplate,
} from './summons'

/**
 * ★★ AE4 (2026-09-08) — « גבארית » DU SMS DE CONVOCATION, MODIFIABLE.
 *
 * ⚠️ ET L'ENREGISTREMENT PEUT ÊTRE REFUSÉ, ce qui est la moitié qui compte.
 *    Un gabarit libre est un gabarit dont on peut effacer le numéro du
 *    coordinateur sans s'en apercevoir — et le SMS partirait quand même, tous
 *    les jours, à tout le monde. La liste des jetons obligatoires est dans
 *    @core (`SUMMONS_TOKENS`), le refus nomme ceux qui manquent, et A128 pose
 *    la question au gabarit livré ET à un gabarit mutilé.
 *
 * ⚠️ LES JETONS SONT AFFICHÉS, PAS SEULEMENT VÉRIFIÉS. Un coordinateur à qui
 *    l'on refuse un enregistrement sans lui dire quoi écrire réécrit le
 *    gabarit au hasard.
 */
export function SummonsSection() {
  const { t } = useTranslation()
  const shipped = t('settings.summons.defaultTemplate')
  const override = useSummonsOverride()
  const [text, setText] = useState(() => summonsTemplate(shipped))
  const [state, setState] = useState<'idle' | 'saved' | 'missing'>('idle')
  const [missing, setMissing] = useState<string[]>([])

  const save = () => {
    const result = writeSummonsTemplate(text)
    if (result.ok) {
      setState('saved')
      setMissing([])
    } else {
      setState('missing')
      setMissing(result.missing)
    }
  }

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
      title={t('settings.summons.title')}
      className="mt-6"
      collapseKey="settings-summons"
      defaultOpen={false}
      summary={override === null ? undefined : t('common.edited')}
    >
      <p className="muted mb-3">{t('settings.summons.intro')}</p>
      <textarea
        dir="rtl"
        rows={12}
        className="input w-full font-mono text-caption leading-relaxed"
        data-testid="summons-template"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setState('idle')
        }}
      />
      <p className="muted mt-2">
        {t('settings.summons.tokens')}:{' '}
        <span dir="ltr" className="ltr-nums">
          {SUMMONS_TOKENS.map((k) => `{{${k}}}`).join(' ')}
        </span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary py-1.5"
          data-testid="summons-save"
          onClick={save}
        >
          {t('common.save')}
        </button>
        <button
          type="button"
          className="btn-ghost py-1.5"
          data-testid="summons-reset"
          onClick={() => {
            resetSummonsTemplate()
            setText(shipped)
            setState('idle')
            setMissing([])
          }}
        >
          {t('settings.summons.reset')}
        </button>
        {state === 'saved' && (
          <span className="chip bg-status-success/15 text-status-success-ink">
            {t('common.saved')}
          </span>
        )}
        {state === 'missing' && (
          <span
            data-testid="summons-missing"
            className="chip bg-status-danger/15 text-status-danger-ink"
          >
            {t('settings.summons.missing', { list: missing.join(', ') })}
          </span>
        )}
      </div>
    </Section>
  )
}
