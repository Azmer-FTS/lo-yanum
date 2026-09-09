import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Callout, Section } from '../components/primitives'
import { Icon } from '../components/Icon'
import { askNotificationPermission, notificationSupport } from '../reminders'
import type { NotificationSupport } from '../reminders'

/**
 * ★★ AF4.2 (2026-09-09) — LE RÉGLAGE DIT CE QU'IL DÉCLENCHE, ET CE QU'IL NE
 *    DÉCLENCHE PAS.
 *
 * Le brief est explicite sur la façon d'échouer : « si une limite technique
 * empêche la notification, DIS-LE dans le rapport au lieu de livrer un réglage
 * qui ne déclenche rien ». Alors cet écran ne propose PAS un interrupteur
 * « recevoir des rappels » : il propose l'autorisation du navigateur, il dit à
 * quelle condition elle sert — l'app ouverte — et il nomme la seconde voie,
 * qui est la seule à réveiller un appareil dont l'app est fermée.
 *
 * ⚠️ ET L'AUTORISATION EST DEMANDÉE ICI ET NULLE PART AILLEURS. Une invite de
 *    notification posée au moment où l'on enregistre un rendez-vous arrive
 *    pendant que le coordinateur parle à quelqu'un ; posée dans les réglages,
 *    elle arrive quand il s'occupe de ses réglages.
 */
export function RemindersSection() {
  const { t } = useTranslation()
  const [state, setState] = useState<NotificationSupport>('unsupported')

  useEffect(() => {
    setState(notificationSupport())
  }, [])

  const label =
    state === 'granted'
      ? t('reminder.granted')
      : state === 'denied'
        ? t('reminder.denied')
        : state === 'unsupported'
          ? t('reminder.unsupported')
          : t('reminder.enable')

  return (
    <Section
      title={t('reminder.title')}
      className="mt-6"
      collapseKey="settings-reminders"
      defaultOpen={false}
      summary={label}
    >
      <Callout tone="info" title={t('reminder.openApp')}>
        {t('reminder.openAppHint')}
      </Callout>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          data-testid="reminder-state"
          className={`chip ${
            state === 'granted'
              ? 'bg-status-success/15 text-status-success-ink'
              : state === 'denied'
                ? 'bg-status-danger/15 text-status-danger-ink'
                : 'bg-surface-high text-content-secondary'
          }`}
        >
          {label}
        </span>
        {state === 'prompt' && (
          <button
            type="button"
            className="btn-primary py-1.5"
            data-testid="reminder-enable"
            onClick={() => void askNotificationPermission().then(setState)}
          >
            <Icon name="bell" size={15} />
            {t('reminder.enable')}
          </button>
        )}
      </div>
    </Section>
  )
}
