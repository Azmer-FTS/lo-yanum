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

import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { MissionStatusChip, PhoneTypeChip } from '../../components/badges'
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
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <Icon name="check" size={18} />
              {t('volunteer.arrivalDone')}
            </span>
            <span className="ltr-nums text-xs text-emerald-900/70">
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
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-sand-300 bg-sand-100 px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="check" size={18} />
              {t('volunteer.endDone')}
            </span>
            <span className="ltr-nums text-xs text-night-950/50">
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
              className="inline-flex items-center gap-1 text-xs font-medium text-night-700 hover:underline"
            >
              <Icon name="pin" size={13} />
              {t('common.openInWaze')}
            </a>
          }
        >
          <p className="mb-2 text-sm font-medium">{anchorPoint.name}</p>
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
                color: '#1c2038',
                title: anchorPoint.name,
              },
            ]}
          />
          <p className="mt-2 text-sm leading-relaxed text-night-950/70">
            {anchorPoint.accessDescription}
          </p>
        </Section>

        <Section title={t('volunteer.instructions')}>
          <ul className="flex flex-col gap-2">
            {anchorPoint.instructions.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-sm text-night-950/80">
                <span className="mt-0.5 shrink-0 text-night-700">
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
                label={t('anchor.labelFarmer')}
              />
            )}
            {driver && (
              <CallRow
                name={driver.name}
                phone={driver.phone}
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
          <ul className="divide-y divide-sand-200">
            {volunteers.map(({ volunteer, isGroupPhone }) => (
              <li
                key={volunteer.id}
                className="flex flex-wrap items-center gap-2 py-2.5"
              >
                <span className="text-sm font-medium">{volunteer.name}</span>
                <PhoneTypeChip type={volunteer.phoneType} />
                {isGroupPhone && (
                  <span className="chip bg-night-900 text-white">
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
