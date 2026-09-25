import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { formatDateTime, formatRelative, getVisibleFarms, incomingFarms, mailProblem, requestForFarm } from '@core/index'
import type { Farm, IntakeRequest } from '@core/index'
import { ChevronForward, Icon } from '../components/Icon'
import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { useIntakeRequests } from './intakeState'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AQ1.1 — « SUR LE TABLEAU DE BORD, EN TÊTE : UN BLOC « בקשות נכנסות » AVEC
 *    LEUR NOMBRE, VISIBLE AVANT TOUT LE RESTE. ABSENT QUAND IL N'Y EN A AUCUNE. »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ AU-DESSUS DU TITRE DE LA PAGE, ET C'EST LA LECTURE LITTÉRALE DU BRIEF.
 *    « Avant tout le reste » : avant « לוח בקרה », avant les deux grands
 *    chiffres des dounams. À 402 px la carte reste au-dessus (c'est la forme
 *    de toutes les pages), mais le bloc est la première chose du panneau, dans
 *    l'écran au repos.
 *
 * ⚠️ CHAQUE LIGNE OUVRE SA FICHE, ET L'OUVRIR NE LA TRAITE PAS (AQ1.4). Le
 *    bloc reste tant que le PO n'a pas touché « טופלה » sur la fiche.
 *
 * Trois lignes au plus : au-delà, « לכל הבקשות » ouvre la liste filtrée. Un
 * tableau de bord qui s'allonge d'une ligne par demande pousserait les
 * dounams hors de l'écran le jour où l'association diffuse la page.
 */
const SHOWN = 3

export function IntakeDashboardBlock() {
  const { t } = useTranslation()
  const locale = useLocale()
  const farms = useCoreValue(getVisibleFarms)
  const requests = useIntakeRequests()
  const incoming = incomingFarms(farms, requests)
  if (incoming.length === 0) return null

  return (
    <section
      data-testid="dash-intake"
      data-count={incoming.length}
      aria-labelledby="dash-intake-title"
      className="card mb-4 border-s-4 border-s-farm-incoming-request bg-farm-incoming-request/10 p-3.5"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-farm-incoming-request/20 text-farm-incoming-request-ink">
          <Icon name="user" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="dash-intake-title" className="text-section text-content-primary">
            {t('intake.dashTitle')}
          </h2>
          <p className="text-caption font-semibold text-farm-incoming-request-ink" data-testid="dash-intake-count-line">
            {t('intake.dashCount', { count: incoming.length })}
          </p>
        </div>
        <span className="numeric text-display leading-none text-farm-incoming-request-ink" data-testid="dash-intake-count">
          {incoming.length}
        </span>
      </header>
      <ul className="mt-3 flex flex-col gap-2">
        {incoming.slice(0, SHOWN).map((farm) => (
          <IntakeRow key={farm.id} farm={farm} request={requestForFarm(farm.id, requests)} locale={locale} />
        ))}
      </ul>
      {incoming.length > SHOWN && (
        <Link
          to="/coordinator/farms?intake=1"
          data-testid="dash-intake-all"
          className="btn-secondary mt-3 w-full justify-center"
        >
          {t('intake.openAll')} ({incoming.length})
        </Link>
      )}
    </section>
  )
}

function IntakeRow({ farm, request, locale }: { farm: Farm; request: IntakeRequest | null; locale: string }) {
  const { t } = useTranslation()
  const who = farm.farmerName || request?.fullName || ''
  const parts: string[] = []
  if (request) parts.push(t(`intake.need.${request.need}`))
  if (request) parts.push(t('intake.received', { when: formatRelative(request.createdAt, locale) }))
  const appointment = request?.appointmentAt ?? null
  return (
    <li>
      <Link
        to={`/coordinator/farms/${farm.id}`}
        data-testid="dash-intake-row"
        data-farm-id={farm.id}
        className="tile-interactive flex min-h-[3.25rem] items-center gap-3 rounded-card bg-surface-overlay px-3 py-2"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-caption font-semibold text-content-primary">
            {who ? `${who} · ${farm.name}` : farm.name}
          </span>
          {parts.length > 0 && <span className="muted block truncate">{parts.join(' · ')}</span>}
          {appointment && (
            <span className="block truncate text-micro font-semibold text-content-secondary">
              {t('intake.appointment', { when: formatDateTime(appointment, locale) })}
            </span>
          )}
          {request && mailProblem(request) && (
            <span className="flex items-center gap-1 text-micro font-semibold text-status-warn-ink" data-testid="dash-intake-mail-problem">
              <Icon name="alert" size={12} />
              {request.mailPo === 'not_configured' ? t('intake.mailNotConfigured') : t('intake.mailFailed')}
            </span>
          )}
        </span>
        <ChevronForward size={16} />
      </Link>
    </li>
  )
}
