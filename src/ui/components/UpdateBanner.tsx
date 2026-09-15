import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@core/index'

import { Icon } from './Icon'
import { useOnline } from '../offline'
import {
  RUNNING,
  applyUpdate,
  acknowledgeApplied,
  dismissUpdate,
  isolate,
  useUpdateState,
} from '../update'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AJ0 · A189 — « UNE VERSION EST PRÊTE », AVEC LE BOUTON QUI L'APPLIQUE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ CE QUI EXISTAIT : une phrase qui disait de recharger, dans une app
 *    installée qui n'a ni barre d'adresse ni geste de rechargement. Un conseil
 *    qu'on ne peut pas suivre est un message d'erreur déguisé.
 *
 * ★ UN BANDEAU, PAS UN TOAST. Il reste tant que la version n'est pas appliquée ;
 *   « אחר כך » le range jusqu'au prochain retour dans l'app, pas plus — c'est
 *   le moment réel où le PO revient, donc le moment où la question se repose.
 *
 * ★ ET IL DIT CE QUI S'EST PASSÉ APRÈS LE RECHARGEMENT. Réussi : la version
 *   active, nommée. Raté : que la page tourne toujours sur l'ancienne. Ce
 *   second cas n'est pas théorique — un cache HTTP de dix minutes chez GitHub
 *   Pages a été mesuré en train de resservir l'ancien document.
 *
 * Monté UNE fois, dans `main.tsx`, au-dessus de l'app : il doit exister sur
 * l'écran de connexion comme sur la carte, et sur les rôles qui n'ont pas de
 * réglages.
 */
export function UpdateBanner() {
  const { t, i18n } = useTranslation()
  const online = useOnline()
  const update = useUpdateState()
  const when = (iso: string) => isolate(formatDateTime(iso, i18n.language))

  let tone: 'info' | 'success' | 'warn'
  let title: string
  let body: string
  let action: 'apply' | 'close'

  const verdict = update.applied && !update.applied.seen ? update.applied : null
  if (update.available && update.available.id !== update.dismissed && online) {
    // The previous tap aimed at THIS build and did not land: say so.
    tone = verdict && !verdict.ok && verdict.to === update.available.id ? 'warn' : 'info'
    title = tone === 'warn' ? t('update.failedTitle') : t('update.title')
    body =
      tone === 'warn'
        ? t('update.failedBody', { id: isolate(RUNNING.id) })
        : t('update.body', {
            id: isolate(update.available.id),
            date: when(update.available.builtAt),
            running: isolate(RUNNING.id),
          })
    action = 'apply'
  } else if (verdict && Date.now() - verdict.at < 10 * 60 * 1000) {
    // Right after the reload that did it, until closed. הגדרות keeps the record.
    tone = verdict.ok ? 'success' : 'warn'
    title = verdict.ok ? t('update.appliedTitle') : t('update.failedTitle')
    body = verdict.ok
      ? t('update.appliedBody', { id: isolate(RUNNING.id), date: when(RUNNING.builtAt) })
      : t('update.failedBody', { id: isolate(RUNNING.id) })
    action = 'close'
  } else {
    return null
  }

  const skin = {
    info: 'border-s-status-info',
    success: 'border-s-status-success',
    warn: 'border-s-status-warn',
  }[tone]
  const ink = {
    info: 'text-status-info-ink',
    success: 'text-status-success-ink',
    warn: 'text-status-warn-ink',
  }[tone]

  return (
    <div
      className="fixed start-0 end-0 z-50 flex justify-center px-3"
      style={{ insetBlockStart: 'calc(var(--shell-top) + 0.5rem)' }}
      // Floats over the header on purpose, like `NetworkStatus`.
      data-overlay=""
      data-testid="update-banner"
      data-tone={tone}
      data-state={action === 'apply' ? 'available' : verdict?.ok ? 'applied' : 'failed'}
      role={tone === 'warn' ? 'alert' : 'status'}
    >
      <div
        className={`flex w-full max-w-lg flex-wrap items-center gap-x-3 gap-y-2 rounded-card border-s-4
                    bg-surface-overlay px-4 py-3 shadow-card ${skin}`}
      >
        {/* A 16 rem basis, not `flex-1` alone: with a zero basis the text never
            forced the buttons onto their own line, and at phone width the
            sentence was crushed into a column one word wide (capture ajpass). */}
        <div className="min-w-0 flex-1 basis-64">
          <p className={`flex items-center gap-1.5 text-caption font-semibold ${ink}`}>
            <Icon name={tone === 'success' ? 'check' : tone === 'warn' ? 'alert' : 'download'} size={15} />
            {title}
          </p>
          <p className="muted mt-0.5" data-testid="update-banner-body">
            {body}
          </p>
        </div>
        {action === 'apply' ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="btn-secondary"
              data-testid="update-later"
              disabled={update.applying}
              onClick={dismissUpdate}
            >
              {t('update.later')}
            </button>
            <button
              type="button"
              className="btn-primary"
              data-testid="update-apply"
              disabled={update.applying}
              onClick={() => void applyUpdate()}
            >
              <Icon name="download" size={16} />
              {update.applying ? t('update.applying') : t('update.apply')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-secondary shrink-0"
            data-testid="update-close"
            onClick={acknowledgeApplied}
          >
            {t('update.close')}
          </button>
        )}
      </div>
    </div>
  )
}
