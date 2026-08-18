import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  addDays,
  formatRelative,
  formatTime,
  getAgendaEvents,
  getAlerts,
  getFarmStatusCounts,
  getTonightMissionViews,
  getUpcomingAgendaEvents,
  getVisibleFarms,
  getVisibleIncidents,
  getVolunteerStats,
  isSameDay,
  localDayKey,
  now,
  startOfWeek,
  telHref,
} from '@core/index'
import type { AgendaEvent, DashboardAlert, MissionStatus } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { CreateGuardButton } from '../../components/CreateGuardFab'
import { Icon } from '../../components/Icon'
import { MyDayBlock } from '../../components/MyDayBlock'
import type { IconName } from '../../components/Icon'
import { MapPanel } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import {
  FarmStatusDot,
  MissionStatusChip,
  readStatusColor,
  readToken,
} from '../../components/badges'
import { EmptyState } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

/**
 * D3 — THE CONTROL ROOM.
 *
 * Half map, half decisions. Reading order down the right column is the order a
 * coordinator actually works in:
 *
 *   1. KPI strip — is the programme in a normal state? Four numbers, big.
 *   2. OPEN ALERTS — is anything wrong RIGHT NOW? This block is deliberately
 *      the loudest thing on the screen. In Lot 0.6 an urgent incident was a
 *      small tag competing with five other cards; an emergency has to dominate,
 *      or the layout is lying about priority.
 *   3. AGENDA — what is coming. Seven days of dots plus the next three entries.
 *   4. Tonight's guards, then the pipeline. Reference, not decisions.
 *
 * The map carries every farm coloured by status, urgent incidents pulsing, and
 * tonight's guards ringed on their anchor points — the three things worth
 * knowing geographically. It sits on the physical left in both directions (D2).
 */

// --- Alerts ----------------------------------------------------------------

/**
 * A thick inline-start bar rather than a tinted card: the bar survives being
 * skimmed at arm's length, a background wash does not. Severity is carried by
 * the bar, the icon and the chip together, never by colour alone.
 *
 * F4 — ALL THREE ALERT KINDS ARE THE CHARTER ORANGE, AT TWO INTENSITIES.
 *
 * Every alert that reaches this block is one of the states F4 names critical:
 * an unresolved urgent incident, a driver and a group holder who disagree, or a
 * group that has not confirmed it got home. So the hue is the same for all
 * three and the INTENSITY carries the difference — an urgent incident takes the
 * full `.card-critical` (solid orange icon, solid badge, orange-tinted drop),
 * the two "somebody is unaccounted for" states take the bar and the tint on an
 * ordinary card. Same alarm, two volumes, one colour to look for.
 */
const ALERT_STYLE: Record<
  DashboardAlert['kind'],
  { icon: string; chip: string; iconName: IconName }
> = {
  recruiting: {
    icon: 'bg-status-warn/15 text-status-warn-ink',
    chip: 'bg-status-warn/15 text-status-warn-ink',
    iconName: 'users',
  },
  urgent_incident: {
    icon: 'bg-critical text-content-on-accent',
    chip: 'chip-critical',
    iconName: 'alert',
  },
  presence_mismatch: {
    icon: 'bg-critical/15 text-status-danger-ink',
    chip: 'bg-critical/15 text-status-danger-ink',
    iconName: 'users',
  },
  return_not_confirmed: {
    icon: 'bg-critical/15 text-status-danger-ink',
    chip: 'bg-critical/15 text-status-danger-ink',
    iconName: 'car',
  },
}

function AlertCard({ alert }: { alert: DashboardAlert }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const style = ALERT_STYLE[alert.kind]
  // G4.3 — a recruiting guard ESCALATES: amber while the night is far,
  // critical orange inside six hours (weight 9 is set by access.ts). The
  // urgent-incident treatment is reused so "loud" stays one language.
  const critical =
    alert.kind === 'urgent_incident' ||
    (alert.kind === 'recruiting' && alert.weight >= 9)
  const urgent = critical

  const detail =
    alert.kind === 'presence_mismatch'
      ? t('alerts.mismatchDetail', { name: alert.detail })
      : alert.kind === 'return_not_confirmed'
        ? t('alerts.returnDetail')
        : alert.kind === 'recruiting'
          ? t('alerts.recruitingDetail', { detail: alert.detail })
          : alert.detail

  return (
    <li
      className={`overflow-hidden transition-all duration-base ease-out hover:shadow-lift ${
        urgent
          ? 'card-critical'
          : 'rounded-card border border-s-4 border-critical/35 border-s-critical bg-surface-raised shadow-card'
      }`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-field ${style.icon}`}
        >
          <Icon name={style.iconName} size={20} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-caption font-bold text-content-primary">
              {t(`alerts.${alert.kind}`)}
            </span>
            {alert.kind === 'recruiting' ? (
              <span
                className={
                  critical ? 'chip-critical' : `chip ${style.chip}`
                }
              >
                <span className="numeric ltr-nums">{alert.detail}</span>
              </span>
            ) : urgent ? (
              <span className={style.chip}>
                <span className="live-dot" />
                {t('severity.urgent')}
              </span>
            ) : (
              <span className={`chip ${style.chip}`}>
                {t('alerts.needsAction')}
              </span>
            )}
            {/* Relative time, not a clock reading: "25 minutes ago" is the
                question a coordinator is actually asking. */}
            <span className="ms-auto text-micro text-content-muted">
              {formatRelative(alert.at, locale)}
            </span>
          </div>

          <p className="mt-0.5 text-caption font-medium text-content-secondary">
            {alert.farmName}
          </p>
          {detail && (
            <p className="mt-1 line-clamp-2 text-caption text-content-secondary">
              {detail}
            </p>
          )}

          {/* Every alert carries its own call list: the coordinator should
              never have to navigate in order to place the call. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {alert.contacts.map((c) => (
              <a
                key={`${c.phone}-${c.roleKey}`}
                href={telHref(c.phone)}
                className="inline-flex items-center gap-1.5 rounded-pill bg-surface-high px-3 py-1.5
                           text-micro font-semibold text-content-primary transition-all duration-fast ease-out
                           hover:bg-gradient-accent hover:text-content-on-accent active:scale-95"
              >
                <Icon name="phone" size={13} />
                {c.name}
                <span className="font-normal opacity-70">{t(c.roleKey)}</span>
              </a>
            ))}
            <Link
              to={alert.href}
              className="ms-auto inline-flex items-center gap-1 text-micro font-semibold text-accent-ink hover:underline"
            >
              {t(
                alert.kind === 'recruiting'
                  ? 'alerts.completeRecruitment'
                  : 'common.details',
              )}
              <Icon name="chevron" size={12} className="rtl:-scale-x-100" />
            </Link>
          </div>
        </div>
      </div>
    </li>
  )
}

// --- KPI -------------------------------------------------------------------

function Kpi({
  label,
  value,
  icon,
  tone = 'default',
  to,
}: {
  label: string
  value: number
  icon: IconName
  tone?: 'default' | 'good' | 'alert' | 'accent'
  to: string
}) {
  const toneClass = {
    default: 'text-content-primary',
    good: 'text-status-success-ink',
    alert: 'text-status-danger-ink',
    accent: 'text-accent-ink',
  }[tone]

  return (
    <Link to={to} className="card-interactive min-w-0 p-3">
      {/* Figure and icon on one line, label underneath on its own full width.
          Side by side, a four-word Hebrew label had ~90 px and truncated to
          "התראות …", which is not a label. */}
      <span className="flex items-center justify-between gap-2">
        <span className={`numeric text-metric ${toneClass}`}>{value}</span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-field bg-surface-high ${toneClass}`}
        >
          <Icon name={icon} size={16} />
        </span>
      </span>
      <span className="muted mt-1 block leading-tight">{label}</span>
    </Link>
  )
}

// --- Agenda widget ---------------------------------------------------------

const EVENT_DOT: Record<MissionStatus | 'visit' | 'meeting', string> = {
  recruiting: 'bg-status-warn',
  planned: 'bg-status-info',
  in_progress: 'bg-status-success',
  completed: 'bg-content-muted',
  return_not_confirmed: 'bg-critical',
  visit: 'bg-status-violet',
  meeting: 'bg-farm-visited',
}

const dotOf = (e: AgendaEvent) =>
  EVENT_DOT[e.missionStatus ?? (e.kind === 'meeting' ? 'meeting' : 'visit')]

/** D4 — the compact agenda: a seven-day strip plus the next three entries. */
function AgendaWidget() {
  const { t } = useTranslation()
  const locale = useLocale()
  const today = now()
  const todayKey = localDayKey(today)

  const week = useMemo(
    () => {
      const start = startOfWeek(today)
      return Array.from({ length: 7 }, (_, i) => addDays(start, i))
    },
    // `today` is a new Date on every render, so keying on the DAY is what keeps
    // this stable — and the day is the only thing that can change the week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayKey],
  )

  const events = useCoreValue(() =>
    getAgendaEvents(week[0], addDays(week[0], 7)),
  )
  const upcoming = useCoreValue(() => getUpcomingAgendaEvents(3))

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const e of events) {
      const key = localDayKey(new Date(e.at))
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return map
  }, [events])

  return (
    <section className="mb-5">
      <div className="flex items-end justify-between gap-3 pb-2">
        <h2 className="text-section text-content-primary">
          {t('agenda.title')}
        </h2>
        <Link
          to="/coordinator/agenda"
          className="text-micro font-semibold text-accent-ink hover:underline"
        >
          {t('agenda.openAgenda')}
        </Link>
      </div>

      <div className="card card-pad">
        <ol className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const key = localDayKey(day)
            const dayEvents = byDay.get(key) ?? []
            const isToday = isSameDay(day, today)
            return (
              <li key={key}>
                <Link
                  to="/coordinator/agenda"
                  className={`flex flex-col items-center gap-1 rounded-field py-1.5 transition-colors duration-fast ${
                    isToday
                      ? 'bg-accent/15 ring-1 ring-accent'
                      : 'hover:bg-surface-high'
                  }`}
                >
                  <span
                    className={`numeric text-caption font-bold ${
                      isToday ? 'text-accent-ink' : 'text-content-primary'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {/* Fixed-height dot row so the strip never jitters between
                      a day with events and a day without. */}
                  <span className="flex h-1.5 items-center gap-0.5">
                    {dayEvents.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className={`inline-block h-1.5 w-1.5 rounded-pill ${dotOf(e)}`}
                      />
                    ))}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>

        <ul className="mt-3 flex flex-col gap-0.5 border-t border-edge-subtle pt-2.5">
          {upcoming.length === 0 ? (
            <li className="muted py-1">{t('agenda.noUpcoming')}</li>
          ) : (
            upcoming.map((e) => (
              <li key={e.id}>
                <Link
                  to={e.kind === 'visit' ? '/coordinator/agenda' : e.href}
                  className="flex items-center gap-2 rounded-field px-1.5 py-1.5 transition-colors duration-fast hover:bg-surface-high"
                >
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-pill ${dotOf(e)}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                    {e.title}
                  </span>
                  <span className="shrink-0 text-micro text-content-muted">
                    {formatRelative(e.at, locale)}
                  </span>
                  <span className="ltr-nums shrink-0 text-micro text-content-muted">
                    {formatTime(e.at, locale)}
                  </span>
                </Link>
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  )
}

// --- Screen ----------------------------------------------------------------

export function DashboardScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()

  const farms = useCoreValue(getVisibleFarms)
  const statusCounts = useCoreValue(getFarmStatusCounts)
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

    // Tonight's guards sit on their ANCHOR POINT — where the group physically
    // stands — not on the farm centroid.
    const tonightMarkers = tonight.map((view) => ({
      id: `mission-${view.mission.id}`,
      position: view.anchorPoint.position,
      color: readToken('--accent'),
      title: view.farm.name,
      subtitle: view.anchorPoint.name,
      kind: 'mission' as const,
      emphasis: true,
      onSelect: () => navigate(`/coordinator/missions/${view.mission.id}`),
    }))

    const urgentMarkers = openIncidents
      .filter((i) => i.severity === 'urgent' && i.position !== null)
      .map((incident) => ({
        id: `inc-${incident.id}`,
        position: incident.position as { lat: number; lng: number },
        // F4 — an unresolved urgent incident is the charter orange on the map
        // too, so the marker and its dashboard card are the same object.
        color: readToken('--critical'),
        title: t('severity.urgent'),
        subtitle: incident.reporterName,
        kind: 'incident' as const,
        pulse: true,
        onSelect: () => navigate(`/coordinator/incidents/${incident.id}`),
      }))

    return [...farmMarkers, ...tonightMarkers, ...urgentMarkers]
  }, [farms, tonight, openIncidents, hoveredId, navigate, t])

  return (
    <MapPanel
      ariaLabel={t('map.farmsMap')}
      markers={markers}
      contentWidth="half"
      legend={
        <ul className="flex flex-col gap-1.5">
          {statusCounts.map(({ status, count }) => (
            <li key={status} className="flex items-center gap-2">
              <FarmStatusDot status={status} />
              <span className="text-caption text-content-secondary">
                {t(`farmStatus.${status}`)}
              </span>
              <span className="numeric ms-auto ps-3 text-caption text-content-muted">
                {count}
              </span>
            </li>
          ))}
        </ul>
      }
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title text-content-primary">
            {t('dashboard.title')}
          </h1>
          <p className="muted mt-1">{t('app.tagline')}</p>
        </div>
        {/* Desktop half of the persistent action; the phone gets the FAB. */}
        <CreateGuardButton className="btn-primary hidden lg:inline-flex" />
      </header>

      {/* 1 — KPI strip. */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        <Kpi
          label={t('dashboard.activeFarms')}
          value={activeFarms}
          icon="farm"
          tone="good"
          to="/coordinator/farms?status=active"
        />
        <Kpi
          label={t('dashboard.tonightGuards')}
          value={tonight.length}
          icon="shield"
          tone="accent"
          to="/coordinator/missions"
        />
        <Kpi
          label={t('dashboard.availableVolunteers')}
          value={stats.active}
          icon="users"
          to="/coordinator/volunteers"
        />
        <Kpi
          label={t('dashboard.openAlerts')}
          value={alerts.length}
          icon="alert"
          tone={alerts.length > 0 ? 'alert' : 'default'}
          to="/coordinator/incidents"
        />
      </div>

      {/* 2 — Open alerts. The loudest block on the screen when it is not empty. */}
      <section className="mb-5">
        <div className="flex items-end justify-between gap-3 pb-2">
          <h2 className="text-section text-content-primary">
            {t('dashboard.alerts')}
          </h2>
          {alerts.length > 0 && (
            <span className="chip bg-status-danger/15 text-status-danger-ink">
              <span className="numeric">{alerts.length}</span>
            </span>
          )}
        </div>
        {alerts.length === 0 ? (
          <div className="card card-pad">
            <EmptyState icon="check" title={t('dashboard.noAlerts')} />
          </div>
        ) : (
          <ul className="stagger flex flex-col gap-2.5">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </ul>
        )}
      </section>

      {/* G9 — "היום שלי": today as the coordinator will drive it. Between the
          alerts (what is wrong) and the agenda (what is coming), because the
          field day is what they actually do between the two. */}
      <section className="mb-5">
        <h2 className="pb-2 text-section text-content-primary">
          {t('myday.title')}
        </h2>
        <MyDayBlock dayKey={localDayKey(now())} />
      </section>

      {/* 3 — Agenda. */}
      <AgendaWidget />

      {/* 4 — Tonight, then the pipeline. Reference, not decisions. */}
      <section className="mb-5">
        <h2 className="pb-2 text-section text-content-primary">
          {t('dashboard.tonightGuards')}
        </h2>
        <div className="card card-pad">
          {tonight.length === 0 ? (
            <EmptyState title={t('dashboard.noTonightGuards')} />
          ) : (
            <ul className="stagger flex flex-col gap-1">
              {tonight.map((view) => (
                <li key={view.mission.id}>
                  <Link
                    to={`/coordinator/missions/${view.mission.id}`}
                    className="flex items-center gap-3 rounded-field px-2 py-2 transition-colors duration-fast hover:bg-surface-high"
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

      <section className="mb-5">
        <h2 className="pb-2 text-section text-content-primary">
          {t('dashboard.farmsByStatus')}
        </h2>
        <div className="card card-pad">
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {statusCounts.map(({ status, count }) => (
              <li key={status}>
                <Link
                  to={`/coordinator/farms?status=${status}`}
                  className="flex items-center gap-2.5 rounded-field px-1.5 py-1.5 transition-colors duration-fast hover:bg-surface-high"
                >
                  <FarmStatusDot status={status} />
                  <span className="flex-1 truncate text-caption text-content-secondary">
                    {t(`farmStatus.${status}`)}
                  </span>
                  <span className="numeric text-caption font-bold text-content-primary">
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
    </MapPanel>
  )
}
