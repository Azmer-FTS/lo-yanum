import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  COORDINATOR,
  formatDateTime,
  formatTime,
  getMyFarm,
  getTonightMissionViews,
  getVisibleIncidents,
  wazeUrl,
} from '@core/index'

import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { MissionStatusChip } from '../../components/badges'
import {
  Callout,
  EmptyState,
  PageHeader,
  Section,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

export function FarmerTonightScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const farm = useCoreValue(getMyFarm)
  const tonight = useCoreValue(getTonightMissionViews)
  // Urgent, still-open events on this farm — including one a volunteer filed
  // minutes ago from the guard currently under way.
  const urgent = useCoreValue(() =>
    getVisibleIncidents().filter((i) => i.severity === 'urgent' && !i.resolved),
  )

  if (!farm) return null

  return (
    <>
      <PageHeader title={t('farmer.tonightTitle')} subtitle={farm.name} />

      {urgent.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {urgent.map((incident) => (
            <Callout
              key={incident.id}
              tone="danger"
              title={`${t('severity.urgent')} · ${formatTime(
                incident.reportedAt,
                locale,
              )}`}
            >
              {incident.description}
            </Callout>
          ))}
        </div>
      )}

      {tonight.length === 0 ? (
        <EmptyState
          icon="moon"
          title={t('farmer.noGuardTonight')}
          hint={t('farmer.noGuardTonightHint')}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {tonight.map(({ mission, anchorPoint, driver, volunteers }) => (
            <div key={mission.id} className="flex flex-col gap-4">
              <Section
                title={t('farmer.guardTeam')}
                action={<MissionStatusChip status={mission.status} />}
              >
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5 text-night-950/70">
                    <Icon name="clock" size={15} />
                    {t('farmer.expectedArrival')}{' '}
                    <span className="ltr-nums font-medium text-night-950">
                      {formatTime(mission.startAt, locale)}
                    </span>
                  </span>
                  <span
                    className={`chip ${
                      mission.endConfirmedAt
                        ? 'bg-slate-100 text-slate-700'
                        : mission.arrivalConfirmedAt
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {t(
                      mission.endConfirmedAt
                        ? 'farmer.guardEnded'
                        : mission.arrivalConfirmedAt
                          ? 'farmer.arrived'
                          : 'farmer.notArrivedYet',
                    )}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {volunteers.map(({ volunteer, isGroupPhone }) => (
                    <CallRow
                      key={volunteer.id}
                      name={volunteer.name}
                      phone={volunteer.phone}
                      label={
                        isGroupPhone
                          ? t('volunteers.groupPhoneHolder')
                          : t('roles.volunteer')
                      }
                    />
                  ))}
                </div>
              </Section>

              {driver && (
                <Section title={t('farmer.driverTitle')}>
                  <CallRow
                    name={driver.name}
                    phone={driver.phone}
                    label={driver.vehicle}
                  />
                </Section>
              )}

              <Section
                title={t('farmer.anchorTitle')}
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
              </Section>
            </div>
          ))}
        </div>
      )}

      <Section title={t('anchor.labelCoordinator')} className="mt-4">
        <CallRow
          name={COORDINATOR.name}
          phone={COORDINATOR.phone}
          label={COORDINATOR.role}
        />
      </Section>

      <Link to="/farmer/report" className="btn-primary btn-big mt-4">
        <Icon name="alert" size={18} />
        {t('farmer.reportCta')}
      </Link>

      {urgent.length === 0 && tonight.length > 0 && (
        <p className="ltr-nums muted mt-3 text-center">
          {formatDateTime(tonight[0].mission.startAt, locale)}
        </p>
      )}
    </>
  )
}
