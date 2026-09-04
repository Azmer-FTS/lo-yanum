import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  readCoordinator,
  formatDateTime,
  formatTime,
  getFarmZonesForFarm,
  getMyFarm,
  getTonightMissionViews,
  getVisibleIncidents,
  wazeUrl,
} from '@core/index'

import { CallRow } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import { ZoneLegend, zonePolygons } from '../../components/zones'
import { meetColor } from '../../components/meet'
import { MissionStatusChip, postColor } from '../../components/badges'
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
  const zones = useCoreValue(() => (farm ? getFarmZonesForFarm(farm.id) : []))
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
          collapseKey="farmer-team"
                action={<MissionStatusChip status={mission.status} />}
              >
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption">
                  <span className="flex items-center gap-1.5 text-content-secondary">
                    <Icon name="clock" size={15} />
                    {t('farmer.expectedArrival')}{' '}
                    <span className="ltr-nums font-medium text-content-primary">
                      {formatTime(mission.startAt, locale)}
                    </span>
                  </span>
                  <span
                    className={`chip ${
                      mission.endConfirmedAt
                        ? 'bg-content-muted/15 text-content-muted'
                        : mission.arrivalConfirmedAt
                          ? 'bg-status-success/15 text-status-success-ink'
                          : 'bg-status-warn/15 text-status-warn-ink'
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
                      photo={volunteer.photo}
                      whatsapp={volunteer.phoneType === 'smartphone'}
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
                <Section title={t('farmer.driverTitle')}
          collapseKey="farmer-driver">
                  <CallRow
                    name={driver.name}
                    phone={driver.phone}
                    photo={driver.photo}
                    label={driver.vehicle}
                  />
                </Section>
              )}

              <Section
                title={t('farmer.anchorTitle')}
          collapseKey="farmer-anchor"
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
                <div className="relative">
                  <MapView
                    ariaLabel={t('a11y.map')}
                    className="h-64 w-full"
                    cooperative
                    center={anchorPoint.position}
                    zoom={13}
                    polygons={zonePolygons(zones)}
                    markers={[
                      {
                        id: anchorPoint.id,
                        position: anchorPoint.position,
                        color: postColor(),
                        kind: 'anchor',
                        emphasis: true,
                        title: anchorPoint.name,
                      },
                      // G8 — the farmer finishes the trip: he needs to know
                      // where the car will actually stop.
                      {
                        id: 'dropoff',
                        position: mission.dropoffPoint ?? farm.position,
                        color: meetColor(),
                        kind: 'car' as const,
                        title: t('meet.dropoff'),
                      },
                    ]}
                  />
                  <ZoneLegend
                    zones={zones}
                    className="absolute bottom-2 start-2 z-10"
                  />
                </div>
              </Section>
            </div>
          ))}
        </div>
      )}

      <Section title={t('anchor.labelCoordinator')}
          collapseKey="farmer-coordinator" className="mt-4">
        <CallRow
          name={readCoordinator().name}
          phone={readCoordinator().phone}
          label={readCoordinator().role}
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
