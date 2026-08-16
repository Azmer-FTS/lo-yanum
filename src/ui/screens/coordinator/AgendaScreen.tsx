import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  MONTH_GRID_DAYS,
  addDays,
  addMonths,
  atTimeOn,
  formatDate,
  formatMonthYear,
  formatTime,
  formatWeekdayShort,
  getAgendaEvents,
  isSameDay,
  localDayKey,
  monthGridStart,
  now,
  startOfWeek,
} from '@core/index'
import type { AgendaEvent, MissionStatus } from '@core/index'

import { CreateGuardButton } from '../../components/CreateGuardFab'
import { Icon } from '../../components/Icon'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

/**
 * D4 — THE AGENDA.
 *
 * Two views over one event stream (@core/access `getAgendaEvents`): a week of
 * seven day columns, and a fixed 6×7 month grid.
 *
 * Direction: the grid is NOT direction-flipped by hand. In an RTL document a
 * CSS grid already lays its first cell out on the right, which is where Sunday
 * belongs in a Hebrew calendar. This is the opposite of the map (D2), and
 * deliberately so — a calendar is read like text, a map is not.
 *
 * Empty slots are interactive. Clicking a day with nothing in it is the fastest
 * path a coordinator has to "put something here", so it opens the same two
 * actions the dashboard offers: staff a guard, or plan a visit.
 */

type View = 'week' | 'month'

/** Event colour, resolved from the same status tokens the rest of the app uses. */
const MISSION_TONE: Record<MissionStatus, string> = {
  planned: 'border-s-status-info bg-status-info/10 text-status-info-ink',
  in_progress:
    'border-s-status-success bg-status-success/10 text-status-success-ink',
  completed: 'border-s-content-muted bg-content-muted/10 text-content-muted',
  return_not_confirmed:
    'border-s-status-danger bg-status-danger/10 text-status-danger-ink',
}

const VISIT_TONE =
  'border-s-status-violet bg-status-violet/10 text-status-violet-ink'

const DOT_TONE: Record<MissionStatus, string> = {
  planned: 'bg-status-info',
  in_progress: 'bg-status-success',
  completed: 'bg-content-muted',
  return_not_confirmed: 'bg-status-danger',
}

function toneOf(event: AgendaEvent): string {
  return event.missionStatus ? MISSION_TONE[event.missionStatus] : VISIT_TONE
}

function dotOf(event: AgendaEvent): string {
  return event.missionStatus
    ? DOT_TONE[event.missionStatus]
    : 'bg-status-violet'
}

function EventPill({
  event,
  onOpen,
}: {
  event: AgendaEvent
  onOpen: (event: AgendaEvent) => void
}) {
  const locale = useLocale()
  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      className={`w-full rounded-sm border-s-[3px] px-1.5 py-1 text-start
                  transition-all duration-fast ease-out hover:brightness-95 ${toneOf(event)}`}
    >
      <span className="flex items-center gap-1">
        <Icon name={event.kind === 'mission' ? 'shield' : 'pin'} size={10} />
        <span className="ltr-nums text-micro font-semibold">
          {formatTime(event.at, locale)}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-micro font-medium">
        {event.title}
      </span>
    </button>
  )
}

/** The two things a coordinator can put on an empty slot. */
function SlotMenu({
  day,
  onClose,
  onPlanVisit,
}: {
  day: Date
  onClose: () => void
  onPlanVisit: (day: Date) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div
      className="absolute inset-x-1 top-full z-30 mt-1 animate-fade-in rounded-md border
                 border-edge-strong bg-surface-overlay p-1 shadow-lift"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-micro
                   font-medium text-content-primary hover:bg-surface-high"
        onClick={() => {
          onClose()
          navigate(`/coordinator/missions/new?date=${localDayKey(day)}`)
        }}
      >
        <Icon name="shield" size={13} className="text-accent-ink" />
        {t('missions.create')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-start text-micro
                   font-medium text-content-primary hover:bg-surface-high"
        onClick={() => {
          onClose()
          onPlanVisit(day)
        }}
      >
        <Icon name="pin" size={13} className="text-status-violet-ink" />
        {t('agenda.planVisit')}
      </button>
    </div>
  )
}

export function AgendaScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()

  const [view, setView] = useState<View>('week')
  const [anchor, setAnchor] = useState(() => now())
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [visitDay, setVisitDay] = useState<Date | null>(null)
  const [editVisitId, setEditVisitId] = useState<string | null>(null)

  const today = now()

  const { days, from, to } = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(anchor)
      return {
        days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
        from: start,
        to: addDays(start, 7),
      }
    }
    const start = monthGridStart(anchor)
    return {
      days: Array.from({ length: MONTH_GRID_DAYS }, (_, i) => addDays(start, i)),
      from: start,
      to: addDays(start, MONTH_GRID_DAYS),
    }
  }, [view, anchor])

  const events = useCoreValue(() => getAgendaEvents(from, to))

  /** Events bucketed by local day key — one pass instead of one filter per cell. */
  const byDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const event of events) {
      const key = localDayKey(new Date(event.at))
      const list = map.get(key)
      if (list) list.push(event)
      else map.set(key, [event])
    }
    return map
  }, [events])

  const step = (direction: number) =>
    setAnchor((d) => (view === 'week' ? addDays(d, 7 * direction) : addMonths(d, direction)))

  const openEvent = (event: AgendaEvent) => {
    if (event.kind === 'visit') setEditVisitId(event.id)
    else navigate(event.href)
  }

  const periodLabel =
    view === 'week'
      ? `${formatMonthYear(days[0], locale)}`
      : formatMonthYear(addDays(from, 10), locale)

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title text-content-primary">{t('agenda.title')}</h1>
          <p className="muted mt-1">{t('agenda.subtitle')}</p>
        </div>
        <CreateGuardButton className="btn-primary hidden lg:inline-flex" />
      </header>

      {/* One control row: period navigation on one side, view switch on the
          other. Sticky so paging through months never scrolls it away. */}
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border
                      border-edge-subtle bg-surface-overlay/95 p-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('agenda.previous')}
            onClick={() => step(-1)}
            className="rounded-sm p-1.5 text-content-secondary hover:bg-surface-high hover:text-content-primary"
          >
            <Icon name="chevron" size={16} className="ltr:-scale-x-100" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(now())}
            className="filter-pill"
          >
            {t('common.today')}
          </button>
          <button
            type="button"
            aria-label={t('agenda.next')}
            onClick={() => step(1)}
            className="rounded-sm p-1.5 text-content-secondary hover:bg-surface-high hover:text-content-primary"
          >
            <Icon name="chevron" size={16} className="rtl:-scale-x-100" />
          </button>
        </div>

        <p className="text-caption font-semibold text-content-primary">
          {periodLabel}
        </p>

        <div className="ms-auto flex items-center gap-1.5">
          {(['week', 'month'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`filter-pill ${view === v ? 'filter-pill-active' : ''}`}
            >
              {t(`agenda.${v}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Legend — an event's colour is its type, and that has to be stated. */}
      <ul className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {(
          [
            ['planned', 'missionStatus.planned'],
            ['in_progress', 'missionStatus.in_progress'],
            ['return_not_confirmed', 'missionStatus.return_not_confirmed'],
          ] as const
        ).map(([status, key]) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-pill ${DOT_TONE[status]}`}
            />
            <span className="text-micro text-content-secondary">{t(key)}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-pill bg-status-violet" />
          <span className="text-micro text-content-secondary">
            {t('agenda.visit')}
          </span>
        </li>
      </ul>

      <div
        className={`grid gap-1.5 ${
          view === 'week' ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7' : 'grid-cols-7'
        }`}
      >
        {/* Month view needs a weekday header row; the week view carries the
            weekday on each column, because its columns wrap on a phone. */}
        {view === 'month' &&
          days.slice(0, 7).map((d) => (
            <div
              key={`head-${d.toISOString()}`}
              className="pb-1 text-center text-micro font-semibold uppercase tracking-wide text-content-muted"
            >
              {formatWeekdayShort(d, locale)}
            </div>
          ))}

        {days.map((day) => {
          const key = localDayKey(day)
          const dayEvents = byDay.get(key) ?? []
          const isToday = isSameDay(day, today)
          const outside =
            view === 'month' && day.getMonth() !== addDays(from, 10).getMonth()

          return (
            <div
              key={key}
              className={`relative flex flex-col rounded-md border p-1.5 transition-colors duration-fast ${
                isToday
                  ? 'border-accent bg-accent/5'
                  : 'border-edge-subtle bg-surface-raised'
              } ${outside ? 'opacity-45' : ''} ${
                view === 'week' ? 'min-h-40' : 'min-h-24'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                <span
                  className={`numeric text-caption font-bold ${
                    isToday ? 'text-accent-ink' : 'text-content-primary'
                  }`}
                >
                  {day.getDate()}
                </span>
                {view === 'week' && (
                  <span className="text-micro text-content-muted">
                    {formatWeekdayShort(day, locale)}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1">
                {/* Month cells show at most two pills plus a counter: past that
                    the grid stops being scannable, which is the only thing a
                    month view is for. */}
                {(view === 'week' ? dayEvents : dayEvents.slice(0, 2)).map(
                  (event) => (
                    <EventPill key={event.id} event={event} onOpen={openEvent} />
                  ),
                )}
                {view === 'month' && dayEvents.length > 2 && (
                  <span className="numeric text-micro text-content-muted">
                    +{dayEvents.length - 2}
                  </span>
                )}
              </div>

              <button
                type="button"
                aria-label={t('agenda.addOn', { date: formatDate(day.toISOString(), locale) })}
                onClick={() => setOpenSlot(openSlot === key ? null : key)}
                className={`mt-1 flex items-center justify-center gap-1 rounded-sm border border-dashed
                            border-edge-subtle py-1 text-micro text-content-muted transition-all duration-fast
                            hover:border-accent hover:text-accent-ink ${
                              dayEvents.length > 0 ? 'opacity-0 focus:opacity-100 hover:opacity-100' : ''
                            }`}
              >
                <Icon name="plus" size={11} />
                {dayEvents.length === 0 && t('common.add')}
              </button>

              {openSlot === key && (
                <>
                  {/* Click-away target, below the menu and above everything
                      else, so the menu closes without a document listener. */}
                  <button
                    type="button"
                    aria-label={t('common.close')}
                    className="fixed inset-0 z-20 cursor-default"
                    onClick={() => setOpenSlot(null)}
                  />
                  <SlotMenu
                    day={day}
                    onClose={() => setOpenSlot(null)}
                    onPlanVisit={(d) => setVisitDay(d)}
                  />
                </>
              )}

              {dayEvents.length > 0 && (
                <span className="mt-1 flex items-center gap-0.5">
                  {dayEvents.slice(0, 6).map((event) => (
                    <span
                      key={`dot-${event.id}`}
                      className={`inline-block h-1.5 w-1.5 rounded-pill ${dotOf(event)}`}
                    />
                  ))}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {visitDay && (
        <FarmVisitModal
          defaultAt={atTimeOn(visitDay, 10, 0)}
          onClose={() => setVisitDay(null)}
        />
      )}
      {editVisitId && (
        <FarmVisitModal
          visitId={editVisitId}
          onClose={() => setEditVisitId(null)}
        />
      )}
    </>
  )
}
