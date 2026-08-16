import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  formatDate,
  formatTime,
  getAlerts,
  getFarmStatusCounts,
  getNextFarmVisits,
  getTonightMissionViews,
  getVisibleFarms,
  getVisibleIncidents,
  getVolunteerStats,
  telHref,
} from '@core/index'
import type { DashboardAlert } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import {
  FarmStatusChip,
  FarmStatusDot,
  MissionStatusChip,
  readStatusColor,
  readToken,
} from '../../components/badges'
import { EmptyState, Stat } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

const ALERT_TONE: Record<DashboardAlert['kind'], string> = {
  urgent_incident: 'border-status-danger/50 bg-status-danger/10',
  presence_mismatch: 'border-status-warn/50 bg-status-warn/10',
  return_not_confirmed: 'border-status-warn/35 bg-status-warn/5',
}

const ALERT_ICON_TONE: Record<DashboardAlert['kind'], string> = {
  urgent_incident: 'text-status-danger',
  presence_mismatch: 'text-status-warn',
  return_not_confirmed: 'text-status-warn',
}

/** An alert carries its own call list, so the coordinator dials without navigating. */
function AlertCard({ alert }: { alert: DashboardAlert }) {
  const { t } = useTranslation()
  const locale = useLocale()

  const detail =
    alert.kind === 'presence_mismatch'
      ? t('alerts.mismatchDetail', { name: alert.detail })
      : alert.kind === 'return_not_confirmed'
        ? t('alerts.returnDetail')
        : alert.detail

  return (
    <li className={`rounded-md border p-3.5 ${ALERT_TONE[alert.kind]}`}>
      <Link to={alert.href} className="block">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 shrink-0 ${ALERT_ICON_TONE[alert.kind]}`}>
            <Icon name="alert" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-caption font-semibold text-content-primary">
                {t(`alerts.${alert.kind}`)}
              </span>
              <span className="text-micro text-content-muted">
                {alert.farmName}
              </span>
              <span className="ltr-nums ms-auto text-micro text-content-muted">
                {formatTime(alert.at, locale)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-caption text-content-secondary">
              {detail}
            </p>
          </div>
        </div>
      </Link>

      {alert.contacts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-edge-subtle pt-3">
          {alert.contacts.map((c) => (
            <a
              key={`${c.phone}-${c.roleKey}`}
              href={telHref(c.phone)}
              className="inline-flex items-center gap-2 rounded-pill bg-surface-high px-3 py-1.5
                         text-micro font-medium text-content-primary
                         transition-all duration-fast ease-out hover:bg-accent hover:text-content-on-accent active:scale-95"
            >
              <Icon name="phone" size={13} />
              {c.name}
              <span className="opacity-60">{t(c.roleKey)}</span>
            </a>
          ))}
        </div>
      )}
    </li>
  )
}

/**
 * C4 — the dashboard is a map plus a single column of decisions.
 *
 * Desktop: the map is a full-height column on the visual left (~1/3), carrying
 * every farm coloured by status plus the open urgent incidents. The rest is one
 * KPI row, then alerts, then what to do next — no statistics stranded at the
 * bottom of the page where nobody scrolls.
 */
export function DashboardScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()

  const farms = useCoreValue(getVisibleFarms)
  const statusCounts = useCoreValue(getFarmStatusCounts)
  const nextVisits = useCoreValue(() => getNextFarmVisits(5))
  const alerts = useCoreValue(getAlerts)
  const tonight = useCoreValue(getTonightMissionViews)
  const stats = useCoreValue(getVolunteerStats)
  const openIncidents = useCoreValue(() =>
    getVisibleIncidents().filter((i) => !i.resolved),
  )

  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const activeFarms = farms.filter((f) => f.status === 'active').length

  const markers: MapMarker[] = useMemo(() => {
    const farmMarkers = farms.map((farm) => ({
      id: farm.id,
      position: farm.position,
      color: readStatusColor(farm.status),
      title: farm.name,
      subtitle: farm.locality,
      kind: 'farm' as const,
      emphasis: farm.id === hoveredId,
      onHover: setHoveredId,
      onSelect: () => navigate(`/coordinator/farms/${farm.id}`),
    }))

    const urgentMarkers = openIncidents
      .filter((i) => i.severity === 'urgent' && i.position !== null)
      .map((incident) => ({
        id: `inc-${incident.id}`,
        position: incident.position as { lat: number; lng: number },
        color: readToken('--status-danger'),
        title: t('severity.urgent'),
        subtitle: incident.reporterName,
        kind: 'incident' as const,
        pulse: true,
        onSelect: () => navigate(`/coordinator/incidents/${incident.id}`),
      }))

    return [...farmMarkers, ...urgentMarkers]
  }, [farms, openIncidents, hoveredId, navigate, t])

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-3rem)] lg:flex-row-reverse">
      {/* Decisions column, 2/3 */}
      <div className="min-w-0 flex-1 overflow-y-auto pe-0.5">
        <header className="mb-4">
          <h1 className="text-title text-content-primary">
            {t('dashboard.title')}
          </h1>
          <p className="muted mt-1">{t('app.tagline')}</p>
        </header>

        {/* ONE KPI row — nothing statistical is left stranded at the bottom. */}
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Stat label={t('dashboard.totalFarms')} value={farms.length} icon="farm" />
          <Stat
            label={t('dashboard.activeFarms')}
            value={activeFarms}
            tone="good"
            icon="shield"
          />
          <Stat label={t('volunteers.title')} value={stats.active} icon="users" />
          <Stat
            label={t('dashboard.openIncidents')}
            value={openIncidents.length}
            tone={openIncidents.length > 0 ? 'alert' : 'default'}
            icon="alert"
          />
        </div>

        <section className="mb-6">
          <h2 className="pb-2.5 text-section text-content-primary">
            {t('dashboard.alerts')}
          </h2>
          {alerts.length === 0 ? (
            <div className="card card-pad">
              <EmptyState icon="check" title={t('dashboard.noAlerts')} />
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </ul>
          )}
        </section>

        <section className="mb-6">
          <h2 className="pb-2.5 text-section text-content-primary">
            {t('dashboard.tonightGuards')}
          </h2>
          <div className="card card-pad">
            {tonight.length === 0 ? (
              <EmptyState title={t('dashboard.noTonightGuards')} />
            ) : (
              <ul className="flex flex-col gap-2">
                {tonight.map((view) => (
                  <li key={view.mission.id}>
                    <Link
                      to={`/coordinator/missions/${view.mission.id}`}
                      className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-fast hover:bg-surface-high"
                    >
                      <span className="flex -space-x-2 rtl:space-x-reverse">
                        {view.volunteers.slice(0, 3).map(({ volunteer }) => (
                          <Avatar
                            key={volunteer.id}
                            photo={volunteer.photo}
                            name={volunteer.name}
                            size="xs"
                          />
                        ))}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-caption font-medium text-content-primary">
                            {view.farm.name}
                          </span>
                          <MissionStatusChip status={view.mission.status} />
                        </span>
                        <span className="muted mt-0.5 block truncate">
                          {view.anchorPoint.name} ·{' '}
                          <span className="ltr-nums">
                            {formatTime(view.mission.startAt, locale)}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <section>
            <div className="flex items-end justify-between gap-3 pb-2.5">
              <h2 className="text-section text-content-primary">
                {t('dashboard.nextVisits')}
              </h2>
              <Link
                to="/coordinator/route"
                className="text-micro font-medium text-accent-ink hover:underline"
              >
                {t('nav.route')}
              </Link>
            </div>
            <div className="card card-pad">
              {nextVisits.length === 0 ? (
                <EmptyState title={t('dashboard.noNextVisits')} />
              ) : (
                <ul className="flex flex-col gap-1">
                  {nextVisits.map((farm) => (
                    <li key={farm.id}>
                      <Link
                        to={`/coordinator/farms/${farm.id}`}
                        onMouseEnter={() => setHoveredId(farm.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        className={`flex items-center gap-3 rounded-md px-2 py-2 transition-colors duration-fast ${
                          hoveredId === farm.id
                            ? 'bg-accent/10'
                            : 'hover:bg-surface-high'
                        }`}
                      >
                        <Avatar
                          photo={farm.photo}
                          name={farm.name}
                          size="sm"
                          shape="square"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-caption font-medium text-content-primary">
                              {farm.name}
                            </span>
                            <FarmStatusChip status={farm.status} />
                          </span>
                          <span className="muted mt-0.5 block">
                            {farm.locality} ·{' '}
                            <span className="ltr-nums">
                              {formatDate(farm.nextVisitAt as string, locale)}
                            </span>
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section>
            <h2 className="pb-2.5 text-section text-content-primary">
              {t('dashboard.farmsByStatus')}
            </h2>
            <div className="card card-pad">
              <ul className="flex flex-col gap-0.5">
                {statusCounts.map(({ status, count }) => (
                  <li key={status}>
                    <Link
                      to={`/coordinator/farms?status=${status}`}
                      className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 transition-colors duration-fast hover:bg-surface-high"
                    >
                      <FarmStatusDot status={status} />
                      <span className="flex-1 text-caption text-content-secondary">
                        {t(`farmStatus.${status}`)}
                      </span>
                      <span className="numeric text-caption font-semibold text-content-primary">
                        {count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-edge-subtle pt-3">
                <div>
                  <p className="muted">{t('volunteers.statsSmartphone')}</p>
                  <p className="numeric text-heading text-content-primary">
                    {stats.smartphone}
                  </p>
                </div>
                <div>
                  <p className="muted">{t('volunteers.statsKosher')}</p>
                  <p className="numeric text-heading text-accent-ink">
                    {stats.kosher}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Map column, 1/3, full height on desktop; a prominent block on mobile. */}
      <div className="order-first h-64 shrink-0 sm:h-80 lg:order-none lg:h-auto lg:w-[32%] lg:max-w-md">
        <MapView
          ariaLabel={t('map.farmsMap')}
          className="h-full w-full"
          markers={markers}
          fit
        />
      </div>
    </div>
  )
}
