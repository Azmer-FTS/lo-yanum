import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@core/index'

import { Icon } from '../components/Icon'
import { KeyValue, Section } from '../components/primitives'
import { isStandalone } from '../standalone'
import { RUNNING, checkAndApply, isolate, useUpdateState } from '../update'
import type { CheckOutcome } from '../update'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AJ0 · A190 — SUR QUELLE VERSION SUIS-JE, DIT PAR L'APP ELLE-MÊME.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO déduisait sa version des écrans (« ce bouton existe, donc j'ai la
 * dernière »). Ici elle est imprimée : l'identifiant du commit, la date du
 * build, et le mode d'ouverture — parce que « Safari a la nouvelle version,
 * l'app installée non » était précisément la confusion à trancher.
 *
 * ★ LE BOUTON DIT CE QU'IL A TROUVÉ, ET « À JOUR » EST UN RÉSULTAT. Trouvé :
 *   il applique aussitôt, et après le rechargement la ligne « עדכון אחרון »
 *   dit si la version active est bien la cible. Pas de réseau, serveur muet,
 *   réponse illisible : chacun a sa phrase — jamais un bouton qui ne fait rien.
 */
export function AppVersionSection() {
  const { t, i18n } = useTranslation()
  const update = useUpdateState()
  const [asked, setAsked] = useState<CheckOutcome | null>(null)
  const when = (iso: string) => isolate(formatDateTime(iso, i18n.language))

  const onCheck = async () => {
    setAsked(null)
    setAsked(await checkAndApply())
  }

  // The answer to THIS tap; before any tap, the last automatic check.
  const outcome = asked ?? update.lastCheck?.outcome ?? null
  const busy = update.checking || update.applying

  const resultText = (o: CheckOutcome): string => {
    switch (o.kind) {
      case 'current':
        return t('settings.version.result.current', { id: isolate(o.remote.id) })
      case 'available':
        return t('settings.version.result.available', { id: isolate(o.remote.id), date: when(o.remote.builtAt) })
      case 'unsupported':
        return t('settings.version.result.unsupported')
      case 'error':
        return t(`settings.version.result.${o.reason}`, { status: o.status ?? 0 })
    }
  }

  return (
    <Section title={t('settings.version.title')} className="mt-6" collapseKey="settings-version">
      <dl data-testid="app-version">
        <KeyValue
          label={t('settings.version.installed')}
          value={<span data-testid="app-version-id">{RUNNING.id}</span>}
          ltr
        />
        <KeyValue
          label={t('settings.version.builtAt')}
          value={<span data-testid="app-version-date">{when(RUNNING.builtAt)}</span>}
          ltr
        />
        <KeyValue
          label={t('settings.version.mode')}
          value={t(isStandalone() ? 'settings.version.standalone' : 'settings.version.browser')}
        />
        <KeyValue
          label={t('settings.version.worker')}
          value={t(
            !update.worker.supported
              ? 'settings.version.workerNone'
              : update.worker.controlled
                ? 'settings.version.workerOn'
                : 'settings.version.workerOff',
          )}
        />
        {update.applied && (
          <KeyValue
            label={t('settings.version.applied')}
            value={
              <span data-testid="app-version-applied" data-ok={update.applied.ok ? '1' : '0'}>
                {t(update.applied.ok ? 'settings.version.appliedOk' : 'settings.version.appliedFailed', {
                  from: isolate(update.applied.from),
                  to: isolate(update.applied.to),
                  date: when(new Date(update.applied.at).toISOString()),
                })}
              </span>
            }
          />
        )}
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-primary"
          data-testid="app-version-check"
          disabled={busy}
          onClick={() => void onCheck()}
        >
          <Icon name="history" size={16} />
          {update.applying
            ? t('settings.version.applying')
            : update.checking
              ? t('settings.version.checking')
              : t('settings.version.check')}
        </button>
      </div>

      {outcome && (
        <p
          className={`mt-2 text-caption ${
            outcome.kind === 'error'
              ? 'text-status-warn-ink'
              : outcome.kind === 'current'
                ? 'text-status-success-ink'
                : 'text-content-primary'
          }`}
          data-testid="app-version-result"
          data-kind={outcome.kind}
          role={outcome.kind === 'error' ? 'alert' : 'status'}
        >
          {resultText(outcome)}
        </p>
      )}
      {update.lastCheck && (
        <p className="muted mt-0.5" data-testid="app-version-last-check">
          {t('settings.version.lastCheck')}: {when(new Date(update.lastCheck.at).toISOString())}
        </p>
      )}
    </Section>
  )
}
