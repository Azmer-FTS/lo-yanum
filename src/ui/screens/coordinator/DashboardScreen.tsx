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
  telHref,
} from '@core/index'
import type { DashboardAlert } from '@core/index'

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

const ALERT_TONE: Record<DashboardAlert['kind'], string> = {
  urgent_incident: 'border-status-danger/40 bg-status-danger/10 text-status-danger',
  presence_mismatch: 'border-status-warn/40 bg-status-warn/10 text-status-warn',
  return_not_confirmed: 'border-status-warn/30 bg-status-warn/5 text-status-warn',
}

/**
 * An alert carries its own call list, so the coordinator can dial the people
 * involved straight from the dashboard rather than navigating first (R6).
 */
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
    <li className={`rounded-lg border p-4 ${ALERT_TONE[alert.kind]}`}>
      <Link to={alert.href} className="block">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0">
            <Icon name="alert" size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-caption font-semibold">
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
        <div className="mt-3 flex flex-wrap gap-2 border-t border-current/15 pt-3">
          {alert.contacts.map((c) => (
            <a
              key={`${c.phone}-${c.roleKey}`}
              href={telHref(c.phone)}
              className="inline-flex items-center gap-2 rounded-pill bg-surface-overlay px-3 py-1.5
                         text-micro font-medium text-content-primary
                         transition-all duration-fast ease-out hover:bg-surface-high active:scale-95"
            >
              <Icon name="phone" size={13} />
              {c.name}
              <span className="text-content-muted">{t(c.roleKey)}</span>
            </a>
          ))}
        </div>
      )}
    </li>
  )
}

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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          value={openIncidents}
          tone={openIncidents > 0 ? 'alert' : 'default'}
          icon="alert"
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
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </ul>
          )}
        </Section>

        <Section title={t('dashboard.farmsByStatus')}>
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
        </Section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Section title={t('dashboard.tonightGuards')} className="xl:col-span-2">
          {tonight.length === 0 ? (
            <EmptyState title={t('dashboard.noTonightGuards')} />
          ) : (
            <ul className="divide-y divide-edge-subtle">
              {tonight.map((view) => (
                <li key={view.mission.id}>
                  <RowLink to={`/coordinator/missions/${view.mission.id}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-caption font-medium text-content-primary">
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
              className="text-micro font-medium text-accent hover:underline"
            >
              {t('nav.route')}
            </Link>
          }
        >
          {nextVisits.length === 0 ? (
            <EmptyState title={t('dashboard.noNextVisits')} />
          ) : (
            <ul className="divide-y divide-edge-subtle">
              {nextVisits.map((farm) => (
                <li key={farm.id}>
                  <RowLink to={`/coordinator/farms/${farm.id}`}>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-caption font-medium text-content-primary">
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
          {[
            { label: t('volunteerStatus.active'), value: stats.active },
            { label: t('volunteerStatus.inactive'), value: stats.inactive },
            { label: t('volunteers.statsSmartphone'), value: stats.smartphone },
            { label: t('volunteers.statsKosher'), value: stats.kosher },
          ].map((row) => (
            <div
              key={row.label}
              className="rounded-md bg-surface-high px-3.5 py-3"
            >
              <p className="muted">{row.label}</p>
              <p className="numeric mt-1 text-title text-content-primary">
                {row.value}
              </p>
            </div>
          ))}
        </div>

        <ul className="mt-3 flex flex-wrap gap-2">
          {stats.byYeshiva.map((row) => (
            <li
              key={row.yeshiva}
              className="chip border border-edge-subtle bg-surface-high text-content-secondary"
            >
              {row.yeshiva}
              <span className="numeric font-semibold text-content-primary">
                {row.count}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  )
}
