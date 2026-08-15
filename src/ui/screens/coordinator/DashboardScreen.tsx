import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

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
} from '@core/index'

import { Icon } from '../../components/Icon'
import {
  FarmStatusChip,
  FarmStatusDot,
  MissionStatusChip,
} from '../../components/badges'
import {
  EmptyState,
  PageHeader,
  RowLink,
  Section,
  Stat,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

export function DashboardScreen() {
  const { t } = useTranslation()
  const locale = useLocale()

  const farms = useCoreValue(getVisibleFarms)
  const statusCounts = useCoreValue(getFarmStatusCounts)
  const nextVisits = useCoreValue(() => getNextFarmVisits(5))
  const alerts = useCoreValue(getAlerts)
  const tonight = useCoreValue(getTonightMissionViews)
  const stats = useCoreValue(getVolunteerStats)
  const openIncidents = useCoreValue(
    () => getVisibleIncidents().filter((i) => !i.resolved).length,
  )

  const activeFarms = farms.filter((f) => f.status === 'active').length

  return (
    <>
      <PageHeader title={t('dashboard.title')} subtitle={t('app.tagline')} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('dashboard.totalFarms')} value={farms.length} />
        <Stat
          label={t('dashboard.activeFarms')}
          value={activeFarms}
          tone="good"
        />
        <Stat label={t('volunteers.title')} value={stats.active} />
        <Stat
          label={t('dashboard.openIncidents')}
          value={openIncidents}
          tone={openIncidents > 0 ? 'alert' : 'default'}
        />
      </div>

      {/* Alerts first: they are the reason the coordinator opens the app. */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Section title={t('dashboard.alerts')} className="xl:col-span-2">
          {alerts.length === 0 ? (
            <EmptyState icon="check" title={t('dashboard.noAlerts')} />
          ) : (
            <ul className="flex flex-col gap-2">
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link
                    to={alert.href}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                      alert.kind === 'urgent_incident'
                        ? 'border-rose-200 bg-rose-50 hover:bg-rose-100/70'
                        : 'border-amber-200 bg-amber-50 hover:bg-amber-100/70'
                    }`}
                  >
                    <span
                      className={
                        alert.kind === 'urgent_incident'
                          ? 'mt-0.5 text-rose-600'
                          : 'mt-0.5 text-amber-600'
                      }
                    >
                      <Icon name="alert" size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-semibold text-night-950">
                          {t(`alerts.${alert.kind}`)}
                        </span>
                        <span className="text-xs text-night-950/50">
                          {alert.farmName}
                        </span>
                        <span className="ltr-nums ms-auto text-xs text-night-950/40">
                          {formatTime(alert.at, locale)}
                        </span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-night-950/70">
                        {alert.detail || t('alerts.returnDetail')}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('dashboard.farmsByStatus')}>
          <ul className="flex flex-col gap-1">
            {statusCounts.map(({ status, count }) => (
              <li key={status}>
                <Link
                  to={`/coordinator/farms?status=${status}`}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-sand-100"
                >
                  <FarmStatusDot status={status} />
                  <span className="flex-1 text-sm text-night-950/75">
                    {t(`farmStatus.${status}`)}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Section title={t('dashboard.tonightGuards')} className="xl:col-span-2">
          {tonight.length === 0 ? (
            <EmptyState title={t('dashboard.noTonightGuards')} />
          ) : (
            <ul className="divide-y divide-sand-200">
              {tonight.map((view) => (
                <li key={view.mission.id}>
                  <RowLink to={`/coordinator/missions/${view.mission.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {view.farm.name}
                      </span>
                      <MissionStatusChip status={view.mission.status} />
                    </div>
                    <p className="muted mt-0.5">
                      {view.anchorPoint.name} ·{' '}
                      <span className="ltr-nums">
                        {formatTime(view.mission.startAt, locale)}
                      </span>{' '}
                      · {view.volunteers.map((v) => v.volunteer.name).join(', ')}
                    </p>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={t('dashboard.nextVisits')}
          action={
            <Link
              to="/coordinator/route"
              className="text-xs font-medium text-night-700 hover:underline"
            >
              {t('nav.route')}
            </Link>
          }
        >
          {nextVisits.length === 0 ? (
            <EmptyState title={t('dashboard.noNextVisits')} />
          ) : (
            <ul className="divide-y divide-sand-200">
              {nextVisits.map((farm) => (
                <li key={farm.id}>
                  <RowLink to={`/coordinator/farms/${farm.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {farm.name}
                      </span>
                      <FarmStatusChip status={farm.status} />
                    </div>
                    <p className="muted mt-0.5">
                      {farm.locality} ·{' '}
                      <span className="ltr-nums">
                        {formatDate(farm.nextVisitAt as string, locale)}
                      </span>
                    </p>
                  </RowLink>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={t('dashboard.volunteerStats')} className="mt-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-sand-100 px-3.5 py-3">
            <p className="muted">{t('volunteerStatus.active')}</p>
            <p className="text-xl font-semibold tabular-nums">{stats.active}</p>
          </div>
          <div className="rounded-xl bg-sand-100 px-3.5 py-3">
            <p className="muted">{t('volunteerStatus.inactive')}</p>
            <p className="text-xl font-semibold tabular-nums">{stats.inactive}</p>
          </div>
          <div className="rounded-xl bg-sand-100 px-3.5 py-3">
            <p className="muted">{t('volunteers.statsSmartphone')}</p>
            <p className="text-xl font-semibold tabular-nums">
              {stats.smartphone}
            </p>
          </div>
          <div className="rounded-xl bg-sand-100 px-3.5 py-3">
            <p className="muted">{t('volunteers.statsKosher')}</p>
            <p className="text-xl font-semibold tabular-nums">{stats.kosher}</p>
          </div>
        </div>

        <ul className="mt-3 flex flex-wrap gap-2">
          {stats.byYeshiva.map((row) => (
            <li
              key={row.yeshiva}
              className="chip border border-sand-200 bg-white text-night-950/70"
            >
              {row.yeshiva}
              <span className="font-semibold tabular-nums">{row.count}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
