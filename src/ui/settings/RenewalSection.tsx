import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { RENEWAL_WINDOW_DAYS_DEFAULT } from '@core/index'

import { Section } from '../components/primitives'
import {
  RENEWAL_WINDOW_MAX,
  RENEWAL_WINDOW_MIN,
  renewalWindowDays,
  requiresIdPhoto,
  subscribeRenewal,
  writeRenewalWindowDays,
  writeRequiresIdPhoto,
} from './renewal'

/**
 * ★★ AG5.1 · AG4.1 (2026-09-09) — LES DEUX SEULS RÉGLAGES QUE CETTE PASSE
 *    AJOUTE, ET LEUR NOMBRE EST UN RÉSULTAT.
 *
 * La règle de la passe — « chaque champ ajouté est un abandon possible » —
 * vaut pour le formulaire de l'agriculteur. Pour l'écran de réglages du
 * coordinateur, la règle voisine est celle d'A30 : cet écran a un plafond de
 * hauteur, et AF7 vient de le ranger en sept sections précisément parce qu'il
 * l'avait atteint. Deux lignes, dans « ספים והתראות » où vivent déjà tous les
 * délais, et pas une section de plus dans le sommaire.
 */
export function RenewalSection() {
  const { t } = useTranslation()
  const current = useSyncExternalStore(
    subscribeRenewal,
    renewalWindowDays,
    renewalWindowDays,
  )
  const photo = useSyncExternalStore(subscribeRenewal, requiresIdPhoto, requiresIdPhoto)
  const [value, setValue] = useState(String(current))
  const [state, setState] = useState<'idle' | 'saved' | 'bad'>('idle')

  const save = (): void => {
    const n = Number(value)
    /* ⚠️ LES BORNES SONT REFUSÉES PLUTÔT QUE PINCÉES SILENCIEUSEMENT. Écrire
       « 0 » et voir le champ afficher « 7 » sans un mot est la façon la plus
       sûre de faire croire à quelqu'un que le réglage ne marche pas. */
    if (!Number.isFinite(n) || n < RENEWAL_WINDOW_MIN || n > RENEWAL_WINDOW_MAX) {
      setState('bad')
      return
    }
    writeRenewalWindowDays(n)
    setState('saved')
  }

  return (
    <Section
      title={t('renewal.settingsTitle')}
      collapseKey="settings-renewal"
      summary={t('renewal.windowLabel')}
    >
      <label className="label" htmlFor="renewal-window">
        {t('renewal.windowLabel')}
      </label>
      <input
        id="renewal-window"
        data-testid="renewal-window"
        type="number"
        dir="ltr"
        inputMode="numeric"
        min={RENEWAL_WINDOW_MIN}
        max={RENEWAL_WINDOW_MAX}
        className="input ltr-nums"
        value={value}
        onChange={(e) => {
          setValue(e.target.value)
          setState('idle')
        }}
        onBlur={save}
      />
      <p className="muted mt-1">
        {t('renewal.windowHint', { n: RENEWAL_WINDOW_DAYS_DEFAULT })}
      </p>
      {state === 'bad' && (
        <p role="alert" className="chip mt-2 bg-status-danger/15 text-status-danger-ink">
          {t('common.invalidRange', { min: RENEWAL_WINDOW_MIN, max: RENEWAL_WINDOW_MAX })}
        </p>
      )}
      {state === 'saved' && (
        <p className="chip mt-2 bg-status-success/15 text-status-success-ink">
          {t('common.saved')}
        </p>
      )}

      {/* ★★ AG4.1 · A147 — LA PHOTO DE LA CARTE, FACULTATIVE PAR DÉFAUT. Voir
          `settings/renewal.ts` pour pourquoi le défaut est celui-là et non
          l'inverse : un champ obligatoire de plus est un formulaire de moins
          qui se termine. */}
      <div className="mt-4">
        {/* ⚠️ UNE CASE ET NON LE `Toggle` DES PRIMITIVES : celui-ci est un
            sélecteur à plusieurs options (voir sa signature), pas un
            interrupteur. Emprunter un composant pour le dessin qu'il produit
            est ce qui a rendu la rangée de rôles fausse en AB5b. */}
        <label className="flex items-center gap-2.5">
          <input
            type="checkbox"
            data-testid="require-id-photo"
            checked={photo}
            onChange={(e) => writeRequiresIdPhoto(e.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-caption">{t('sign.idPhotoRequired')}</span>
        </label>
        <p className="muted mt-1">{t('sign.idPhotoHint')}</p>
      </div>
    </Section>
  )
}
