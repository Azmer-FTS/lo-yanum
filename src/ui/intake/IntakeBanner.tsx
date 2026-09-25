import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { formatDateTime, getVisibleFarms, requestForFarm, unseenIncoming } from '@core/index'
import { Icon } from '../components/Icon'
import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { useStackBelow } from '../hooks/useStackBelow'
import { markIntakeSeen, useForegroundRefresh, useIntakeRequests, useSeenIntake } from './intakeState'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AQ2 — « LE PO OUVRE L'APP PLUSIEURS FOIS PAR JOUR. ELLE DOIT LUI DIRE CE
 *    QUI EST ARRIVÉ DEPUIS LA DERNIÈRE FOIS. »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ IL NE DISPARAÎT PAS TOUT SEUL (AQ2.2). Aucun minuteur : c'est « סגירה »
 *   ou « לפתיחה ». À la différence de la confirmation de mise à jour d'AM6.2,
 *   qui est une confirmation — ceci est une chose à faire.
 *
 * ★ IL NE REVIENT PAS POUR LA MÊME DEMANDE (AQ2.3). Les deux gestes inscrivent
 *   les fiches montrées comme « vues » ; une demande arrivée APRÈS le geste
 *   rouvre un bandeau, qui ne parle que d'elle.
 *
 * ⚠️ ET IL NE SE SUPERPOSE JAMAIS (AM6). Il flotte comme le bandeau de mise à
 *    jour et s'empile SOUS lui et sous tout bandeau de page ; la pastille
 *    réseau, qui évite tous les flottants, s'empile sous lui à son tour. Une
 *    priorité fixe — page, mise à jour, demandes, réseau — sinon deux
 *    flottants se repousseraient sans fin (`useStackBelow`).
 *
 * Coordinateur seulement : le rôle est vérifié par l'appelant (App.tsx).
 */
export function IntakeBanner({ enabled }: { enabled: boolean }) {
  useForegroundRefresh(enabled)
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const farms = useCoreValue(getVisibleFarms)
  const requests = useIntakeRequests()
  const seen = useSeenIntake()
  const fresh = enabled ? unseenIncoming(farms, seen, requests) : []
  const stripRef = useRef<HTMLDivElement | null>(null)
  const below = useStackBelow(
    stripRef,
    fresh.length > 0,
    'intake',
    '[data-top-banner], [data-top-banner-float="update"]',
  )
  if (fresh.length === 0) return null

  const first = fresh[0]
  const request = requestForFarm(first.id, requests)
  const who = first.farmerName || request?.fullName || ''
  const ids = fresh.map((f) => f.id)
  const open = () => {
    markIntakeSeen(ids)
    navigate(fresh.length === 1 ? `/coordinator/farms/${first.id}` : '/coordinator/farms?intake=1')
  }

  return (
    <div
      ref={stripRef}
      className="fixed start-0 end-0 z-50 flex justify-center px-3"
      style={{ insetBlockStart: `calc(var(--shell-top) + 0.5rem + ${below}px)` }}
      data-top-banner-float="intake"
      data-overlay=""
      data-testid="intake-banner"
      data-count={fresh.length}
      role="status"
      aria-live="polite"
    >
      <div
        className="flex w-full max-w-lg flex-wrap items-center gap-x-3 gap-y-2 rounded-card border-s-4
                   border-s-farm-incoming-request bg-surface-overlay px-4 py-3 shadow-card"
      >
        <div className="min-w-0 flex-1 basis-64">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-farm-incoming-request-ink">
            <Icon name="bell" size={15} />
            <span data-testid="intake-banner-title">{t('intake.newTitle', { count: fresh.length })}</span>
          </p>
          <p className="mt-0.5 truncate text-caption text-content-primary" data-testid="intake-banner-body">
            {who ? t('intake.newBody', { name: who, farm: first.name }) : first.name}
          </p>
          {request?.appointmentAt && (
            <p className="muted mt-0.5" data-testid="intake-banner-appointment">
              {t('intake.newAppt', { when: formatDateTime(request.appointmentAt, locale) })}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="btn-secondary"
            data-testid="intake-banner-dismiss"
            onClick={() => markIntakeSeen(ids)}
          >
            {t('intake.dismiss')}
          </button>
          <button type="button" className="btn-primary" data-testid="intake-banner-open" onClick={open}>
            {t('intake.open')}
          </button>
        </div>
      </div>
    </div>
  )
}
