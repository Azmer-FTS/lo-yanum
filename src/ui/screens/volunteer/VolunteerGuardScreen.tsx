import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  COORDINATOR,
  confirmArrival,
  confirmGuardEnd,
  formatDateTime,
  formatTime,
  getMyActiveMissionView,
  isGroupPhoneHolder,
  wazeUrl,
} from '@core/index'

import { Avatar } from '../../components/Avatar'
import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import {
  MissionStatusChip,
  PhoneTypeChip,
  readToken,
} from '../../components/badges'
import {
  Callout,
  EmptyState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

export function VolunteerGuardScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const view = useCoreValue(getMyActiveMissionView)
  const isHolder = useCoreValue(() =>
    view ? isGroupPhoneHolder(view.mission) : false,
  )

  if (!view) {
    return (
      <>
        <PageHeader title={t('volunteer.title')} />
        <EmptyState
          icon="moon"
          title={t('volunteer.noMission')}
          hint={t('volunteer.noMissionHint')}
        />
      </>
    )
  }

  const { mission, farm, anchorPoint, driver, volunteers } = view
  const holder = volunteers.find((v) => v.isGroupPhone)?.volunteer
  const farmerContact = farm.contacts.find((c) => c.isPrimary)

  return (
    <>
      <PageHeader
        title={farm.name}
        subtitle={`${anchorPoint.name} · ${formatTime(mission.startAt, locale)}`}
        actions={<MissionStatusChip status={mission.status} />}
      />

      {/* The confirmation buttons come first: in the dark, at 21:00, this is
          the only thing the group phone holder needs to reach. */}
      <div className="mb-4 flex flex-col gap-2">
        {mission.arrivalConfirmedAt ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-status-success/40 bg-status-success/10 px-4 py-3.5">
            <span className="flex items-center gap-2 text-caption font-semibold text-status-success">
              <Icon name="check" size={18} />
              {t('volunteer.arrivalDone')}
            </span>
            <span className="ltr-nums text-micro text-status-success/70">
              {formatTime(mission.arrivalConfirmedAt, locale)}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => confirmArrival(mission.id)}
            disabled={!isHolder}
            className="btn-primary btn-big"
          >
            <Icon name="pin" size={19} />
            {t('volunteer.confirmArrival')}
          </button>
        )}

        {mission.endConfirmedAt ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-edge-strong bg-surface-high px-4 py-3.5">
            <span className="flex items-center gap-2 text-caption font-semibold">
              <Icon name="check" size={18} />
              {t('volunteer.endDone')}
            </span>
            <span className="ltr-nums text-micro text-content-muted">
              {formatTime(mission.endConfirmedAt, locale)}
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => confirmGuardEnd(mission.id)}
            disabled={!isHolder || mission.arrivalConfirmedAt === null}
            className="btn-secondary btn-big"
          >
            <Icon name="shield" size={19} />
            {t('volunteer.confirmEnd')}
          </button>
        )}

        <p className="muted px-1 text-center">
          {isHolder
            ? t('volunteer.groupPhoneNote')
            : t('volunteer.notGroupPhoneNote', { name: holder?.name ?? '' })}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Section
          title={t('volunteer.anchorTitle')}
          action={
            <a
              href={wazeUrl(anchorPoint.position)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-micro font-medium text-accent-ink hover:underline"
            >
              <Icon name="pin" size={13} />
              {t('common.openInWaze')}
            </a>
          }
        >
          <p className="mb-2 text-caption font-medium">{anchorPoint.name}</p>
          <MapView
            ariaLabel={t('a11y.map')}
            className="h-44 w-full"
            interactive={false}
            center={anchorPoint.position}
            zoom={13}
            markers={[
              {
                id: anchorPoint.id,
                position: anchorPoint.position,
                color: readToken('--accent'),
                  emphasis: true,
                title: anchorPoint.name,
              },
            ]}
          />
          <p className="mt-2 text-caption leading-relaxed text-content-secondary">
            {anchorPoint.accessDescription}
          </p>
        </Section>

        <Section title={t('volunteer.instructions')}>
          <ul className="flex flex-col gap-2">
            {anchorPoint.instructions.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-caption text-content-secondary">
                <span className="mt-0.5 shrink-0 text-accent-ink">
                  <Icon name="check" size={15} />
                </span>
                {line}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t('volunteer.contactsTitle')}>
          <div className="flex flex-col gap-2">
            {farmerContact && (
              <CallRow
                name={farmerContact.name}
                phone={farmerContact.phone}
                photo={farmerContact.photo}
                label={t('anchor.labelFarmer')}
              />
            )}
            {driver && (
              <CallRow
                name={driver.name}
                phone={driver.phone}
                photo={driver.photo}
                label={t('anchor.labelDriver')}
              />
            )}
            <CallRow
              name={COORDINATOR.name}
              phone={COORDINATOR.phone}
              label={t('anchor.labelCoordinator')}
            />
          </div>
        </Section>

        <Section title={t('volunteer.team')}>
          <ul className="divide-y divide-edge-subtle">
            {volunteers.map(({ volunteer, isGroupPhone }) => (
              <li key={volunteer.id} className="flex items-center gap-3 py-2.5">
                <Avatar
                  photo={volunteer.photo}
                  name={volunteer.name}
                  size="sm"
                  ring={isGroupPhone}
                />
                <span className="text-caption font-medium">{volunteer.name}</span>
                <PhoneTypeChip type={volunteer.phoneType} />
                {isGroupPhone && (
                  <span className="chip bg-accent text-content-on-accent">
                    <Icon name="phone" size={11} />
                    {t('volunteers.groupPhoneHolder')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Section>

        {mission.status === 'return_not_confirmed' && (
          <Callout tone="warn" title={t('alerts.return_not_confirmed')}>
            {t('alerts.returnDetail')}
          </Callout>
        )}
      </div>

      <Link to="/volunteer/report" className="btn-primary btn-big mt-4">
        <Icon name="alert" size={18} />
        {t('volunteer.reportCta')}
      </Link>

      <p className="ltr-nums muted mt-3 text-center">
        {formatDateTime(mission.startAt, locale)}
      </p>
    </>
  )
}
