import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  MONTH_GRID_DAYS,
  updateFarmVisit,
  updateGeneralMeeting,
  getFarmVisit,
  getGeneralMeeting,
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
import { GeneralMeetingModal } from '../../components/GeneralMeetingModal'
import { Icon } from '../../components/Icon'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { MyDayBlock } from '../../components/MyDayBlock'
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

type View = 'week' | 'month' | 'day'

/** Event colour, resolved from the same status tokens the rest of the app uses. */
const MISSION_TONE: Record<MissionStatus, string> = {
  // G4 — a guard still being staffed reads amber wherever it appears.
  recruiting: 'border-s-status-warn bg-status-warn/10 text-status-warn-ink',
  planned: 'border-s-status-info bg-status-info/10 text-status-info-ink',
  in_progress:
    'border-s-status-success bg-status-success/10 text-status-success-ink',
  completed: 'border-s-content-muted bg-content-muted/10 text-content-muted',
  // F4 — critical state: a group that has not confirmed it got home.
  return_not_confirmed:
    'border-s-critical bg-critical/10 text-status-danger-ink',
  // G9bis — struck through and muted, but still ON the calendar: the night
  // was planned, and an empty slot would say it never was.
  cancelled: 'border-s-content-muted bg-content-muted/10 text-content-muted',
}

const VISIT_TONE =
  'border-s-status-violet bg-status-violet/10 text-status-violet-ink'

/** G6 — the third event type, in the magenta the palette already audits. */
const MEETING_TONE =
  'border-s-farm-visited bg-farm-visited/10 text-farm-visited-ink'

const DOT_TONE: Record<MissionStatus, string> = {
  recruiting: 'bg-status-warn',
  planned: 'bg-status-info',
  in_progress: 'bg-status-success',
  completed: 'bg-content-muted',
  return_not_confirmed: 'bg-critical',
  cancelled: 'bg-content-muted',
}

function toneOf(event: AgendaEvent): string {
  if (event.missionStatus) return MISSION_TONE[event.missionStatus]
  return event.kind === 'meeting' ? MEETING_TONE : VISIT_TONE
}

function dotOf(event: AgendaEvent): string {
  if (event.missionStatus) return DOT_TONE[event.missionStatus]
  return event.kind === 'meeting' ? 'bg-farm-visited' : 'bg-status-violet'
}

const KIND_ICON = {
  mission: 'shield',
  visit: 'pin',
  meeting: 'users',
} as const

function EventPill({
  event,
  onOpen,
}: {
  event: AgendaEvent
  onOpen: (event: AgendaEvent) => void
}) {
  const locale = useLocale()
  // G6.4 — visits and meetings drag to another day; guards do not (a staffed
  // night is a commitment, not a block to slide).
  const draggable = event.kind !== 'mission'
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData('text/plain', `${event.kind}:${event.id}`)
              e.dataTransfer.effectAllowed = 'move'
            }
          : undefined
      }
      onClick={() => onOpen(event)}
      className={`w-full rounded-field border-s-[3px] px-1.5 py-1 text-start
                  transition-all duration-fast ease-out hover:brightness-95 ${toneOf(event)}`}
    >
      <span className="flex items-center gap-1">
        <Icon name={KIND_ICON[event.kind]} size={10} />
        <span className="ltr-nums text-micro font-semibold">
          {formatTime(event.at, locale)}
        </span>
      </span>
      {/* G9bis — a cancelled guard stays on the calendar, struck through:
          the slot was planned, and erasing it would say it never was. */}
      <span
        className={`mt-0.5 block truncate text-micro font-medium ${
          event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''
        }`}
      >
        {event.title}
      </span>
    </button>
  )
}

/** G6.2 — the three things a coordinator can put on an empty slot. */
function SlotMenu({
  day,
  onClose,
  onPlanVisit,
  onPlanMeeting,
}: {
  day: Date
  onClose: () => void
  onPlanVisit: (day: Date) => void
  onPlanMeeting: (day: Date) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div
      className="absolute inset-x-1 top-full z-30 mt-1 animate-fade-in rounded-field border
                 border-edge-strong bg-surface-overlay p-1 shadow-lift"
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-micro
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
        className="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-micro
                   font-medium text-content-primary hover:bg-surface-high"
        onClick={() => {
          onClose()
          onPlanVisit(day)
        }}
      >
        <Icon name="pin" size={13} className="text-status-violet-ink" />
        {t('agenda.planVisit')}
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-micro
                   font-medium text-content-primary hover:bg-surface-high"
        onClick={() => {
          onClose()
          onPlanMeeting(day)
        }}
      >
        <Icon name="users" size={13} className="text-farm-visited-ink" />
        {t('meeting.new')}
      </button>
      {/* G7bis.4 / A50 — from any day, in any view, straight to that day's
          route: the planner opens parameterised on the date and shows the
          day's fixed hours as constraints. */}
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-micro
                   font-medium text-content-primary hover:bg-surface-high"
        onClick={() => {
          onClose()
          navigate(`/coordinator/route?date=${localDayKey(day)}`)
        }}
      >
        <Icon name="route" size={13} className="text-accent-ink" />
        {t('myday.createRoute')}
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
  const [visitAt, setVisitAt] = useState<string | null>(null)
  const [editVisitId, setEditVisitId] = useState<string | null>(null)
  const [meetingAt, setMeetingAt] = useState<string | null>(null)
  const [editMeetingId, setEditMeetingId] = useState<string | null>(null)
  const [headerMenu, setHeaderMenu] = useState(false)

  const today = now()

  const { days, from, to } = useMemo(() => {
    if (view === 'day') {
      const start = new Date(
        anchor.getFullYear(),
        anchor.getMonth(),
        anchor.getDate(),
      )
      return { days: [start], from: start, to: addDays(start, 1) }
    }
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
    setAnchor((d) =>
      view === 'day'
        ? addDays(d, direction)
        : view === 'week'
          ? addDays(d, 7 * direction)
          : addMonths(d, direction),
    )

  const openEvent = (event: AgendaEvent) => {
    if (event.kind === 'visit') setEditVisitId(event.id)
    else if (event.kind === 'meeting') setEditMeetingId(event.id)
    else navigate(event.href)
  }

  /**
   * G6.4 — moving an event, desktop half: HTML drag-and-drop onto another
   * day keeps the time of day and changes the date. Guards are deliberately
   * NOT draggable — a staffed night is a commitment with volunteers and a
   * driver attached, not a block to slide. The mobile half is the date field
   * in each event's own modal.
   */
  const dropOnDay = (payload: string, day: Date) => {
    const [kind, id] = payload.split(':')
    const moveTo = (iso: string) => {
      const src = new Date(iso)
      return atTimeOn(day, src.getHours(), src.getMinutes())
    }
    if (kind === 'visit') {
      const visit = getFarmVisit(id)
      if (visit) updateFarmVisit(id, { ...visit, at: moveTo(visit.at) })
    } else if (kind === 'meeting') {
      const meeting = getGeneralMeeting(id)
      if (meeting) {
        const delta =
          new Date(meeting.endAt).getTime() - new Date(meeting.at).getTime()
        const at = moveTo(meeting.at)
        updateGeneralMeeting(id, {
          at,
          endAt: new Date(new Date(at).getTime() + delta).toISOString(),
        })
      }
    }
  }

  const periodLabel =
    view === 'day'
      ? formatDate(days[0].toISOString(), locale)
      : view === 'week'
        ? `${formatMonthYear(days[0], locale)}`
        : formatMonthYear(addDays(from, 10), locale)

  return (
    <>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title text-content-primary">{t('agenda.title')}</h1>
          <p className="muted mt-1">{t('agenda.subtitle')}</p>
        </div>
        <div className="relative flex items-center gap-2">
          {/* G6.2 — one button, three event types. */}
          <button
            type="button"
            className="btn-primary"
            onClick={() => setHeaderMenu((v) => !v)}
          >
            <Icon name="plus" size={15} />
            {t('agenda.addEvent')}
          </button>
          {headerMenu && (
            <>
              <button
                type="button"
                aria-label={t('common.close')}
                className="fixed inset-0 z-20 cursor-default"
                onClick={() => setHeaderMenu(false)}
              />
              <div className="absolute end-0 top-full z-30">
                <div className="relative w-56">
                  <SlotMenu
                    day={anchor}
                    onClose={() => setHeaderMenu(false)}
                    onPlanVisit={(d) => setVisitAt(atTimeOn(d, 10, 0))}
                    onPlanMeeting={(d) => setMeetingAt(atTimeOn(d, 10, 0))}
                  />
                </div>
              </div>
            </>
          )}
          <CreateGuardButton className="btn-secondary hidden lg:inline-flex" />
        </div>
      </header>

      {/* One control row: period navigation on one side, view switch on the
          other. Sticky so paging through months never scrolls it away. */}
      <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-card border
                      border-edge-subtle bg-surface-overlay/95 p-2 backdrop-blur">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={t('agenda.previous')}
            onClick={() => step(-1)}
            className="rounded-field p-1.5 text-content-secondary hover:bg-surface-high hover:text-content-primary"
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
            className="rounded-field p-1.5 text-content-secondary hover:bg-surface-high hover:text-content-primary"
          >
            <Icon name="chevron" size={16} className="rtl:-scale-x-100" />
          </button>
        </div>

        <p className="text-caption font-semibold text-content-primary">
          {periodLabel}
        </p>

        <div className="ms-auto flex items-center gap-1.5">
          {(['day', 'week', 'month'] as const).map((v) => (
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
            ['cancelled', 'missionStatus.cancelled'],
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
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-pill bg-farm-visited" />
          <span className="text-micro text-content-secondary">
            {t('meeting.title')}
          </span>
        </li>
      </ul>

      {/* G9 — the day as it will be DRIVEN, above the day as it is booked.
          Same block as the dashboard, keyed on the viewed date (G7bis.4): a
          future day shows its own itinerary, or the "צור מסלול ליום זה" CTA. */}
      {view === 'day' && (
        <div className="mb-3">
          <MyDayBlock dayKey={localDayKey(days[0])} />
        </div>
      )}

      {/* G6.3 — THE DAY VIEW: an hour ladder from 06:00 to 23:00. Every hour
          row is also a quick-create target, because "put something at 15:00
          tomorrow" is the whole reason to open a day. */}
      {view === 'day' && (
        <div className="card divide-y divide-edge-subtle">
          {Array.from({ length: 18 }, (_, i) => i + 6).map((hour) => {
            const key = localDayKey(days[0])
            const hourEvents = (byDay.get(key) ?? []).filter(
              (e) => new Date(e.at).getHours() === hour,
            )
            const slotKey = `${key}-${hour}`
            return (
              <div key={hour} className="relative flex min-h-12 gap-3 px-3 py-1.5">
                <span className="numeric ltr-nums w-12 shrink-0 pt-1 text-micro text-content-muted">
                  {String(hour).padStart(2, '0')}:00
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  {hourEvents.map((event) => (
                    <EventPill key={event.id} event={event} onOpen={openEvent} />
                  ))}
                  <button
                    type="button"
                    aria-label={t('agenda.addOn', {
                      date: `${String(hour).padStart(2, '0')}:00`,
                    })}
                    onClick={() =>
                      setOpenSlot(openSlot === slotKey ? null : slotKey)
                    }
                    className={`flex items-center gap-1 rounded-field border border-dashed border-edge-subtle
                                px-2 py-0.5 text-micro text-content-muted transition-all duration-fast
                                hover:border-accent hover:text-accent-ink ${
                                  hourEvents.length > 0
                                    ? 'opacity-0 hover:opacity-100 focus:opacity-100'
                                    : ''
                                }`}
                  >
                    <Icon name="plus" size={11} />
                  </button>
                </div>
                {openSlot === slotKey && (
                  <>
                    <button
                      type="button"
                      aria-label={t('common.close')}
                      className="fixed inset-0 z-20 cursor-default"
                      onClick={() => setOpenSlot(null)}
                    />
                    <SlotMenu
                      day={days[0]}
                      onClose={() => setOpenSlot(null)}
                      onPlanVisit={(d) => setVisitAt(atTimeOn(d, hour, 0))}
                      onPlanMeeting={(d) => setMeetingAt(atTimeOn(d, hour, 0))}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {view !== 'day' && (
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
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                dropOnDay(e.dataTransfer.getData('text/plain'), day)
              }}
              className={`relative flex flex-col rounded-field border p-1.5 transition-colors duration-fast ${
                isToday
                  ? 'border-accent bg-accent/5'
                  : 'border-edge-subtle bg-surface-raised'
              } ${outside ? 'opacity-45' : ''} ${
                view === 'week' ? 'min-h-40' : 'min-h-24'
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-1">
                {/* G6.3 — the day number opens the day view. */}
                <button
                  type="button"
                  onClick={() => {
                    setAnchor(day)
                    setView('day')
                  }}
                  className={`numeric rounded-field px-1 text-caption font-bold transition-colors duration-fast hover:bg-surface-high ${
                    isToday ? 'text-accent-ink' : 'text-content-primary'
                  }`}
                >
                  {day.getDate()}
                </button>
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
                className={`mt-1 flex items-center justify-center gap-1 rounded-field border border-dashed
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
                    onPlanVisit={(d) => setVisitAt(atTimeOn(d, 10, 0))}
                    onPlanMeeting={(d) => setMeetingAt(atTimeOn(d, 10, 0))}
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
      )}

      {visitAt && (
        <FarmVisitModal defaultAt={visitAt} onClose={() => setVisitAt(null)} />
      )}
      {editVisitId && (
        <FarmVisitModal
          visitId={editVisitId}
          onClose={() => setEditVisitId(null)}
        />
      )}
      {meetingAt && (
        <GeneralMeetingModal
          defaultAt={meetingAt}
          onClose={() => setMeetingAt(null)}
        />
      )}
      {editMeetingId && (
        <GeneralMeetingModal
          meetingId={editMeetingId}
          onClose={() => setEditMeetingId(null)}
        />
      )}
    </>
  )
}
