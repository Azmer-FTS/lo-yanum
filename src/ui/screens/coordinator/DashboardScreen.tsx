import { useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'

import {
  addDays,
  formatRelative,
  formatTime,
  getAgendaEvents,
  getAlerts,
  getDunamKpis,
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
import { ReportButton } from '../../report/ReportButton'
import { readReportRecipient } from '../../report/recipient'
import { Icon } from '../../components/Icon'
import { GrowthCharts } from '../../components/GrowthCharts'
import { MyDayBlock } from '../../components/MyDayBlock'
import type { IconName } from '../../components/Icon'
import { MapPanel } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import {
  FarmStatusDot,
  MissionStatusChip,
  entityMarkerKind,
  readStatusColor,
  readToken,
} from '../../components/badges'
import { EmptyState, Section } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

/**
 * D3 — THE CONTROL ROOM.
 *
 * Half map, half decisions. Reading order down the right column is the order a
 * coordinator actually works in:
 *
 *   0. THE TWO DUNAM KPIs (G14a) — how much ground the programme covers and
 *      how much is still on the table. The association's budget number: big,
 *      first, before anything operational.
 *   1. KPI strip — is the programme in a normal state? Four numbers, big.
 *   2. OPEN ALERTS — is anything wrong RIGHT NOW? Compact full-colour rows
 *      (G14b), collapsed by default; a click opens the details and actions.
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
  { icon: string; ink: string; chip: string; iconName: IconName }
> = {
  recruiting: {
    icon: 'bg-status-warn/15 text-status-warn-ink',
    ink: 'text-status-warn-ink',
    chip: 'bg-status-warn/15 text-status-warn-ink',
    iconName: 'users',
  },
  urgent_incident: {
    icon: 'bg-critical text-content-on-accent',
    ink: 'text-critical',
    chip: 'chip-critical',
    iconName: 'alert',
  },
  presence_mismatch: {
    icon: 'bg-critical/15 text-status-danger-ink',
    ink: 'text-status-danger-ink',
    chip: 'bg-critical/15 text-status-danger-ink',
    iconName: 'users',
  },
  return_not_confirmed: {
    icon: 'bg-critical/15 text-status-danger-ink',
    ink: 'text-status-danger-ink',
    chip: 'bg-critical/15 text-status-danger-ink',
    iconName: 'car',
  },
}

/** U3 — the alert's one-line reading and its severity, shared by both views. */
function alertMeta(alert: DashboardAlert, t: (k: string, o?: Record<string, unknown>) => string) {
  const critical = alert.kind !== 'recruiting' || alert.weight >= 9
  const detail =
    alert.kind === 'presence_mismatch'
      ? t('alerts.mismatchDetail', { name: alert.detail })
      : alert.kind === 'return_not_confirmed'
        ? t('alerts.returnDetail')
        : alert.kind === 'recruiting'
          ? t('alerts.recruitingDetail', { detail: alert.detail })
          : alert.detail
  return { critical, detail }
}

/**
 * U3 (2026-09-02) — THE COMPACT ALERT, in the journal's own format: a colour
 * dot, the relative time, one line. Two of them fit a view; the row swipes.
 * A tap selects it and the details and actions unfold UNDER the carousel,
 * where they have the whole width — a card that grew inside the row would
 * push its neighbour off the screen.
 *
 * F4 — the two "somebody is unaccounted for" states and an urgent incident
 * are the charter orange; a staffing gap is amber until six hours before the
 * night. Same alarm, two volumes, one colour to look for.
 */
function AlertChip({
  alert,
  selected,
  onSelect,
}: {
  alert: DashboardAlert
  selected: boolean
  onSelect: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const style = ALERT_STYLE[alert.kind]
  const { critical, detail } = alertMeta(alert, t)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      data-testid="alert-chip"
      className={`tile-interactive flex h-full min-h-[5.25rem] w-full items-center gap-3 border-s-4 px-3 py-2.5 text-start ${
        critical ? 'border-s-critical' : 'border-s-status-warn'
      } ${selected ? 'bg-accent/10 ring-2 ring-accent' : ''}`}
    >
      {/* W3.1c — the icon alone, bigger and thin, no disc. */}
      <Icon name={style.iconName} size={26} strokeWidth={1.4} className={`shrink-0 ${style.ink}`} />
      <span className="min-w-0 flex-1 leading-tight">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-pill ${critical ? 'bg-critical' : 'bg-status-warn'}`}
          />
          <span className="truncate text-caption font-semibold text-content-primary" title={t(`alerts.${alert.kind}`)}>
            {t(`alerts.${alert.kind}`)}
          </span>
          <span className="ms-auto shrink-0 text-micro text-content-muted">
            {formatRelative(alert.at, locale)}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-micro text-content-secondary" title={`${alert.farmName} · ${detail ?? ''}`}>
          {alert.farmName}
          {detail ? ` · ${detail}` : ''}
        </span>
      </span>
    </button>
  )
}

/** The selected alert's details and call list, under the carousel. */
function AlertDetail({ alert }: { alert: DashboardAlert }) {
  const { t } = useTranslation()
  const style = ALERT_STYLE[alert.kind]
  const { critical, detail } = alertMeta(alert, t)
  return (
    <div
      data-testid="alert-detail"
      className={`mt-2 flex animate-fade-in items-start gap-3 rounded-card border-s-4 bg-surface-raised p-3.5 shadow-card ${
        critical ? 'border-s-critical' : 'border-s-status-warn'
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-field ${style.icon}`}>
        <Icon name={style.iconName} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-caption font-semibold text-content-primary">
            {t(`alerts.${alert.kind}`)} · {alert.farmName}
          </p>
          {alert.kind === 'recruiting' ? (
            <span className={critical ? 'chip-critical' : `chip ${style.chip}`}>
              <span className="numeric ltr-nums">{alert.detail}</span>
            </span>
          ) : critical && alert.kind === 'urgent_incident' ? (
            <span className={style.chip}>
              <span className="live-dot" />
              {t('severity.urgent')}
            </span>
          ) : (
            <span className={`chip ${style.chip}`}>{t('alerts.needsAction')}</span>
          )}
        </div>
        {detail && <p className="mt-1 text-caption text-content-secondary">{detail}</p>}

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
            {t(alert.kind === 'recruiting' ? 'alerts.completeRecruitment' : 'common.details')}
            <Icon name="chevron" size={12} className="rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * U3 — the alerts block: the swipable carousel plus the selected detail.
 * W3.3 (2026-09-02, passe finale) — EVERY open alert is in the carousel, two
 * visible at a time, with position dots that also scroll on tap.
 */
function AlertsCarousel({ alerts }: { alerts: DashboardAlert[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const ref = useRef<HTMLDivElement>(null)
  const selected = alerts.find((a) => a.id === selectedId) ?? null
  const pages = Math.max(1, Math.ceil(alerts.length / 2))
  const onScroll = () => {
    const el = ref.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const step = first ? first.offsetWidth + 8 : el.clientWidth / 2
    setPage(Math.min(pages - 1, Math.round(Math.abs(el.scrollLeft) / (step * 2))))
  }
  const goTo = (i: number) => {
    const el = ref.current
    if (!el) return
    const first = el.firstElementChild as HTMLElement | null
    const step = first ? first.offsetWidth + 8 : el.clientWidth / 2
    const dir = getComputedStyle(el).direction === 'rtl' ? -1 : 1
    el.scrollTo({ left: dir * i * step * 2, behavior: 'smooth' })
  }
  return (
    <div>
      <div ref={ref} onScroll={onScroll} className="carousel-2 stagger" data-testid="alerts-carousel">
        {alerts.map((alert) => (
          <AlertChip
            key={alert.id}
            alert={alert}
            selected={alert.id === selectedId}
            onSelect={() => setSelectedId((cur) => (cur === alert.id ? null : alert.id))}
          />
        ))}
      </div>
      {pages > 1 && (
        <div className="carousel-dots" data-testid="alerts-dots">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-current={i === page ? 'true' : undefined}
              aria-label={`${i + 1}/${pages}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
      {selected && <AlertDetail alert={selected} />}
    </div>
  )
}

// --- KPI -------------------------------------------------------------------

/**
 * W2 (2026-09-02, passe finale) — THE FIGURE FITS ITS CARD, BY ARITHMETIC.
 * The card is a size container (`.figure-card`) and the figure (`.figure`)
 * takes the smaller of its ceiling and what its digit count allows in the
 * width available — see `index.css`. Nothing here is ever truncated or
 * stepped by hand any more; the digit count is the only input.
 */
function figureVars(text: string, max?: string, reserve?: string): CSSProperties {
  return {
    '--digits': String(Math.max(1, text.length)),
    ...(max ? { '--figure-max': max } : {}),
    ...(reserve ? { '--figure-reserve': reserve } : {}),
  } as CSSProperties
}

/** W3.1a — one of the two strategic cards at the head of the dashboard. */
function HeroFigure({
  value,
  label,
  hint,
  icon,
  tone,
  testId,
}: {
  value: string
  label: string
  hint: string
  icon: IconName
  tone: 'good' | 'accent'
  testId: string
}) {
  const ink = tone === 'good' ? 'text-status-success-ink' : 'text-accent-ink'
  const tint = tone === 'good' ? 'var(--status-success)' : 'var(--accent)'
  return (
    <Link
      to="/coordinator/farms"
      data-testid={testId}
      className="card-interactive card-wow figure-card flex flex-col p-4"
      style={{ '--wow-tint': tint } as CSSProperties}
    >
      <span className="flex items-start justify-between gap-3">
        <span className={`figure ${ink}`} style={figureVars(value, '4.75rem', '3.25rem')} data-figure title={value}>
          {value}
        </span>
        {/* W3.1c — the icon alone, thin and big: no disc behind it. */}
        <Icon name={icon} size={34} strokeWidth={1.25} className={`mt-1 shrink-0 ${ink}`} />
      </span>
      <span className="mt-2 block text-caption font-semibold leading-tight text-content-primary">{label}</span>
      <span className="muted mt-0.5 block leading-tight">{hint}</span>
    </Link>
  )
}

function Kpi({
  label,
  value,
  icon,
  tone = 'default',
  to,
  testId,
}: {
  label: string
  value: number
  icon: IconName
  tone?: 'default' | 'good' | 'alert' | 'accent'
  to: string
  testId?: string
}) {
  const toneClass = {
    default: 'text-content-primary',
    good: 'text-status-success-ink',
    alert: 'text-status-danger-ink',
    accent: 'text-accent-ink',
  }[tone]
  // N7.5 (2026-09-02) — a card may carry its tone as a tint, charter kept.
  const tintClass = {
    default: '',
    good: 'bg-status-success/[0.07]',
    alert: 'bg-status-danger/[0.07]',
    accent: 'bg-accent/[0.07]',
  }[tone]
  const text = String(value)

  // W3.1b — a COMPACT card in a swipable row: figure and a bare icon on one
  // line, the label under them. The figure fits by arithmetic (W2).
  return (
    <Link to={to} data-testid={testId} className={`card-interactive figure-card p-2.5 ${tintClass}`}>
      <span className="flex items-center justify-between gap-2">
        <span className={`figure ${toneClass}`} style={figureVars(text, '1.9rem', '2.25rem')} data-figure>
          {text}
        </span>
        <Icon name={icon} size={24} strokeWidth={1.4} className={`shrink-0 ${toneClass}`} />
      </span>
      <span className="muted mt-1 block truncate leading-tight" title={label}>{label}</span>
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
  cancelled: 'bg-content-muted',
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
    <Section
      title={t('agenda.title')}
      collapseKey="dash-agenda"
      className="mb-5"
      summary={t('blocks.events', { count: events.length })}
      action={
        <Link
          to="/coordinator/agenda"
          className="text-micro font-semibold text-accent-ink hover:underline"
        >
          {t('agenda.openAgenda')}
        </Link>
      }
    >
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
    </Section>
  )
}

// --- Screen ----------------------------------------------------------------

export function DashboardScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()

  const farms = useCoreValue(getVisibleFarms)
  const dunams = useCoreValue(getDunamKpis)
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
      kind: entityMarkerKind(farm),
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
      screenKey="dashboard"
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
        {/* PO POINT 7 — the employer's report. W4 took the "create a guard"
            button out of this header: creating is the floating "+" now, on
            every screen, so the header keeps only the paperwork. */}
        <ReportButton recipient={readReportRecipient()} />
      </header>

      {/* W3.1 (2026-09-02, passe finale) — THE ORDER OF IMPORTANCE IS THE
          PRODUCT OWNER'S: the association's budget depends on the DUNAMS, not
          on the livestock. Two big cards first, never hidden; then ONE
          swipable row of small cards — the livestock deliberately among the
          small ones. */}
      <div className="auto-cols mb-2.5 gap-2.5 [--col-min:12rem]" data-testid="hero-figures">
        <HeroFigure
          value={dunams.guardedDunams.toLocaleString(locale)}
          label={t('dashboard.guardedDunams')}
          hint={t('dashboard.guardedDunamsHint')}
          icon="shield"
          tone="good"
          testId="hero-guarded"
        />
        <HeroFigure
          value={dunams.potentialDunams.toLocaleString(locale)}
          label={t('dashboard.potentialDunams')}
          hint={t('dashboard.potentialDunamsHint')}
          icon="map"
          tone="accent"
          testId="hero-potential"
        />
      </div>

      {/* 1 — the compact KPI row: swipable sideways when the column is
          narrow, never wrapping. */}
      <div className="scroll-row kpi-row mb-5" data-testid="kpi-row">
        <Kpi
          label={t('dashboard.activeFarms')}
          value={activeFarms}
          icon="farm"
          tone="good"
          to="/coordinator/farms?status=active"
        />
        <Kpi
          label={t('livestock.totalGuarded')}
          value={dunams.guardedHeads}
          icon="cattle"
          to="/coordinator/farms"
          testId="kpi-guarded-heads"
        />
        <Kpi
          label={t('dashboard.availableVolunteers')}
          value={stats.active}
          icon="users"
          to="/coordinator/volunteers"
        />
        <Kpi
          label={t('dashboard.tonightGuards')}
          value={tonight.length}
          icon="shield"
          tone="accent"
          to="/coordinator/missions"
        />
        <Kpi
          label={t('dashboard.openAlerts')}
          value={alerts.length}
          icon="alert"
          tone={alerts.length > 0 ? 'alert' : 'default'}
          to="/coordinator/incidents"
        />
      </div>

      {/* U3 (2026-09-02) — THE PRODUCT OWNER'S ORDER: the big figures, then
          DIRECTLY under them the two growth charts one under the other, then
          the alerts as a compact swipable carousel, then the day, the agenda
          and the reference blocks. Every block folds (U1). */}
      <Section
        title={t('dashboard.growth.title')}
        collapseKey="dash-growth"
        bare
        className="mb-5"
      >
        <GrowthCharts />
      </Section>

      <Section
        title={t('dashboard.alerts')}
        collapseKey="dash-alerts"
        bare
        className="mb-5"
        summary={t('blocks.alerts', { count: alerts.length })}
        action={
          alerts.length > 0 ? (
            <span className="chip bg-status-danger/15 text-status-danger-ink">
              <span className="numeric">{alerts.length}</span>
            </span>
          ) : undefined
        }
      >
        {alerts.length === 0 ? (
          <div className="card card-pad">
            <EmptyState icon="check" title={t('dashboard.noAlerts')} />
          </div>
        ) : (
          <AlertsCarousel alerts={alerts} />
        )}
      </Section>

      {/* G9 — "היום שלי": today as the coordinator will drive it. */}
      <Section title={t('myday.title')} collapseKey="dash-myday" bare className="mb-5">
        <MyDayBlock dayKey={localDayKey(now())} />
      </Section>

      {/* 3 — Agenda. */}
      <AgendaWidget />

      {/* 4 — Tonight, then the pipeline. Reference, not decisions — and
          P0bis.3b: two reference blocks side by side once the panel can hold
          them, instead of two more screenfuls under the decisions. The wide
          threshold, not the ordinary one: both carry lists, and a 18 rem
          column of "farm · 21:00 · 4 people" wraps every row. */}
      <div className="panel-scope">
        <div className="pair-grid-wide">
      <Section
        title={t('dashboard.tonightGuards')}
        collapseKey="dash-tonight"
        className="mb-5"
        summary={t('blocks.guards', { count: tonight.length })}
      >
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
      </Section>

      <Section
        title={t('dashboard.farmsByStatus')}
        collapseKey="dash-pipeline"
        defaultOpen={false}
        className="mb-5"
        summary={t('farms.count', { count: farms.length })}
      >
          <ul className="auto-cols gap-x-4 [--col-min:12rem]">
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
      </Section>
        </div>
      </div>
    </MapPanel>
  )
}
