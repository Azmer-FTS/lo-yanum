import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDateTime, isIncoming, mailProblem, markIntakeHandled, requestForFarm } from '@core/index'
import type { Farm, IntakeRequest } from '@core/index'
import { Icon } from '../components/Icon'
import { useLocale } from '../hooks/useLocale'
import { refreshIntake, useIntakeRequests } from './intakeState'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AQ1.5 — « SUR LA FICHE ELLE-MÊME, UNE BANDE CLAIRE INDIQUE QU'ELLE VIENT
 *    D'UNE DEMANDE PUBLIQUE, AVEC SA DATE ET CE QUE L'AGRICULTEUR A DEMANDÉ. »
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ ELLE RESTE APRÈS LE TRAITEMENT, EN PLUS DISCRET. Savoir qu'une fiche est
 *   née d'une demande publique reste vrai dans six mois ; ce qui disparaît,
 *   c'est l'appel à l'action (les deux boutons « טופלה ») et la couleur.
 *
 * ★ LES DEUX BOUTONS SONT LE SEUL CHEMIN HORS DE « ENTRANTE » AVEC L'ÉDITION
 *   (AQ1.4). Ouvrir la fiche, la faire défiler, la lire : rien ne change.
 *
 * ★ AQ3.4 — L'ÉTAT DES COURRIELS SE LIT ICI. Un envoi raté ne cache rien : la
 *   demande est là, entière, et la ligne dit que le message n'est pas parti.
 */
export function IntakeStrip({ farm }: { farm: Farm }) {
  const requests = useIntakeRequests()
  const request = requestForFarm(farm.id, requests)
  const incoming = isIncoming(farm)
  if (!incoming && !request) return null
  return <Strip farm={farm} request={request} incoming={incoming} />
}

function Strip({ farm, request, incoming }: { farm: Farm; request: IntakeRequest | null; incoming: boolean }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [retried, setRetried] = useState(false)
  const docs = farm.providedDocuments?.length ?? 0

  const facts: string[] = []
  if (request) facts.push(t('intake.bandReceived', { date: formatDateTime(request.createdAt, locale) }))
  if (request?.reference) facts.push(t('intake.reference', { ref: request.reference }))

  const retry = async () => {
    if (!request) return
    const m = await import('../../data/intake')
    const ok = await m.retryIntakeMail(request.id)
    setRetried(ok)
    window.setTimeout(() => void refreshIntake(), 4000)
  }

  return (
    <div
      role="status"
      data-testid="farm-intake-strip"
      data-incoming={incoming ? 'true' : 'false'}
      className={`card card-pad flex flex-col gap-2 border-s-4 ${
        incoming
          ? 'border-s-farm-incoming-request bg-farm-incoming-request/10'
          : 'border-s-content-muted bg-surface-high'
      }`}
    >
      <p className="flex items-center gap-2 text-caption font-semibold text-farm-incoming-request-ink">
        <Icon name="user" size={16} />
        <span data-testid="farm-intake-title">{t('intake.bandTitle')}</span>
      </p>
      {facts.length > 0 && (
        <p className="text-caption text-content-primary" data-testid="farm-intake-received">
          {facts.join(' · ')}
        </p>
      )}
      <ul className="flex flex-col gap-0.5 text-caption text-content-secondary">
        {request && (
          <li data-testid="farm-intake-need">
            <span className="font-semibold text-content-primary">
              {t('intake.asked', { need: t(`intake.need.${request.need}`) })}
            </span>
          </li>
        )}
        <li data-testid="farm-intake-appointment">
          {request?.appointmentAt
            ? t('intake.appointment', { when: formatDateTime(request.appointmentAt, locale) })
            : t('intake.noAppointment')}
        </li>
        <li data-testid="farm-intake-docs">
          {docs > 0 ? t('intake.docs', { count: docs }) : t('intake.noDocs')}
        </li>
        {request && <MailLine request={request} />}
      </ul>
      {request && mailProblem(request) && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary min-h-[2.75rem]"
            data-testid="farm-intake-mail-retry"
            onClick={() => void retry()}
          >
            <Icon name="send" size={15} />
            {t('intake.mailRetry')}
          </button>
          {retried && <span className="muted">{t('intake.mailRetried')}</span>}
        </div>
      )}
      {incoming && (
        <div className="flex flex-col gap-2 pt-1">
          <p className="muted">{t('intake.handleHint')}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary min-h-[2.75rem]"
              data-testid="farm-intake-handled"
              onClick={() => markIntakeHandled(farm.id, 'contacted')}
            >
              <Icon name="check" size={16} />
              {t('intake.handleContacted')}
            </button>
            <button
              type="button"
              className="btn-secondary min-h-[2.75rem]"
              data-testid="farm-intake-handled-later"
              onClick={() => markIntakeHandled(farm.id, 'to_contact')}
            >
              {t('intake.handleLater')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MailLine({ request }: { request: IntakeRequest }) {
  const { t } = useTranslation()
  const lines: Array<{ key: string; text: string; bad: boolean }> = []
  if (request.mailPo === 'sent') lines.push({ key: 'po', text: t('intake.mailPoSent'), bad: false })
  if (request.mailFarmer === 'sent') lines.push({ key: 'farmer', text: t('intake.mailFarmerSent'), bad: false })
  if (mailProblem(request)) {
    lines.push({
      key: 'problem',
      text: request.mailPo === 'not_configured' ? t('intake.mailNotConfigured') : t('intake.mailFailed'),
      bad: true,
    })
  } else if (request.mailPo === 'pending' || request.mailPo === null) {
    lines.push({ key: 'pending', text: t('intake.mailPending'), bad: false })
  }
  return (
    <>
      {lines.map((l) => (
        <li
          key={l.key}
          data-testid={`farm-intake-mail-${l.key}`}
          className={l.bad ? 'flex items-center gap-1 font-semibold text-status-warn-ink' : 'flex items-center gap-1'}
        >
          <Icon name={l.bad ? 'alert' : 'mail'} size={13} />
          {l.text}
        </li>
      ))}
    </>
  )
}
