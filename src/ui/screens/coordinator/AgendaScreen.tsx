import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

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
import type { AgendaEvent, LatLng, MissionStatus } from '@core/index'

import { AgendaGrid } from '../../components/agendaGrid'
import type { AgendaTone } from '../../components/agendaGrid'
import { GeneralMeetingModal } from '../../components/GeneralMeetingModal'
import { Icon } from '../../components/Icon'
import { FarmVisitModal } from '../../components/FarmVisitModal'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { readToken } from '../../components/badges'
import { MyDayBlock } from '../../components/MyDayBlock'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'

/**
 * D4 · ★★ AB3 · AB4 (2026-09-08) — THE AGENDA, WITH ITS GEOGRAPHY AND ITS
 * HOURS.
 *
 * Two things the product owner asked for in the same breath:
 *
 *   « j'aimerais voir où se situent géographiquement mes rendez-vous. »   AB3
 *   « la vue semaine est juste, mais mal exploitée en surface. »          AB4
 *
 * ★ AB3.1 — IT IS THE SAME GABARIT AS EVERY OTHER SCREEN, NOT A NEW ONE. Map
 *   physically left, content right, the three remembered modes, the draggable
 *   seam, and « סנכרון פריסה » applying here as everywhere — all of that comes
 *   from `MapPanel` / `MapSplit` and none of it is written again here. The
 *   agenda was the last major coordinator screen outside the gabarit.
 *
 * ★ AB3.2 — THE MARKERS ARE NUMBERED PER DAY, IN THE ORDER OF THAT DAY. « en
 *   marqueurs numérotés dans l'ordre chronologique de la journée » — so the
 *   first appointment of Tuesday is 1 and so is the first of Wednesday. A
 *   single running number over a whole week would be a number nobody could
 *   read off the calendar, and the number's job is to say « you drive to 1,
 *   then to 2 » on the day being looked at.
 *
 * ★ AB3.3 — AND THE LINK IS BOTH WAYS. Pressing a day's heading frames the map
 *   on that day's points (`frameTo`, W6's own box-fitting); pressing a marker
 *   selects the appointment, which rings it in the grid and scrolls it into
 *   view; pressing an appointment selects it too, which is what emphasises its
 *   marker. One `selectedId`, read by both sides.
 *
 * ⚠️ AB3.4 — AN APPOINTMENT WITH NO KNOWN PLACE IS IN THE LIST AND NOT ON THE
 *    MAP. `AgendaEvent.position` is `null` for it (see the note on the type),
 *    and the panel carries a « מיקום חסר » block naming each one. The
 *    alternative — a pin on the farm's council, or on HOME_BASE — is a claim
 *    about where somebody has to drive, made up by the app.
 */

type View = 'day' | 'week' | 'month'

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

/** The marker's colour, from the same tokens the block is tinted with. */
const MISSION_TOKEN: Record<MissionStatus, string> = {
  recruiting: '--status-warn',
  planned: '--status-info',
  in_progress: '--status-success',
  completed: '--text-muted',
  return_not_confirmed: '--critical',
  cancelled: '--text-muted',
}

const KIND_ICON = {
  mission: 'shield',
  visit: 'pin',
  meeting: 'users',
} as const

function toneOf(event: AgendaEvent): AgendaTone {
  return {
    block: event.missionStatus
      ? MISSION_TONE[event.missionStatus]
      : event.kind === 'meeting'
        ? MEETING_TONE
        : VISIT_TONE,
    dot: event.missionStatus
      ? DOT_TONE[event.missionStatus]
      : event.kind === 'meeting'
        ? 'bg-farm-visited'
        : 'bg-status-violet',
    icon: KIND_ICON[event.kind],
  }
}

function markerColour(event: AgendaEvent): string {
  if (event.missionStatus) return readToken(MISSION_TOKEN[event.missionStatus])
  return readToken(event.kind === 'meeting' ? '--farm-visited' : '--status-violet')
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

  const row = (icon: 'shield' | 'pin' | 'users' | 'route', tint: string, label: string, act: () => void) => (
    <button
      type="button"
      className="flex min-h-11 w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-micro
                 font-medium text-content-primary hover:bg-surface-high"
      onClick={() => {
        onClose()
        act()
      }}
    >
      <Icon name={icon} size={13} className={tint} />
      {label}
    </button>
  )

  return (
    <div
      data-testid="agenda-slot-menu"
      className="absolute inset-x-1 top-full z-30 mt-1 animate-fade-in rounded-field border
                 border-edge-strong bg-surface-overlay p-1 shadow-lift"
    >
      {row('shield', 'text-accent-ink', t('missions.create'), () =>
        navigate(`/coordinator/missions/new?date=${localDayKey(day)}`),
      )}
      {row('pin', 'text-status-violet-ink', t('agenda.planVisit'), () => onPlanVisit(day))}
      {row('users', 'text-farm-visited-ink', t('meeting.new'), () => onPlanMeeting(day))}
      {/* G7bis.4 / A50 — from any day, in any view, straight to that day's
          route: the planner opens parameterised on the date. */}
      {row('route', 'text-accent-ink', t('myday.createRoute'), () =>
        navigate(`/coordinator/route?date=${localDayKey(day)}`),
      )}
    </div>
  )
}

export function AgendaScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()

  /**
   * ★ AB4.4 — « Sur téléphone, la vue jour est le défaut ; la semaine reste
   *   accessible. » Seven columns on 402 px are seven 50 px columns, which is
   *   a grid nobody can read a title in. The initial value only — switching to
   *   the week on a phone is one tap and is never fought by a re-render.
   */
  const [view, setView] = useState<View>(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
      ? 'day'
      : 'week',
  )
  const [anchor, setAnchor] = useState(() => now())
  const [openSlot, setOpenSlot] = useState<string | null>(null)
  const [visitAt, setVisitAt] = useState<string | null>(null)
  const [editVisitId, setEditVisitId] = useState<string | null>(null)
  const [meetingAt, setMeetingAt] = useState<string | null>(null)
  const [editMeetingId, setEditMeetingId] = useState<string | null>(null)
  /** AB3.3 — the one selection both the grid and the map read. */
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedDay, setFocusedDay] = useState<string | null>(null)
  const [unplacedOpen, setUnplacedOpen] = useState(false)
  const [frame, setFrame] = useState<{ points: LatLng[]; key: string } | null>(null)

  const today = now()

  /**
   * ★★ AB1.1 — `?new=visit` / `?new=meeting`, THE SEAM THE "+" ASKS THROUGH.
   *
   * Both appointments open a modal this screen owns, so the shell's floating
   * button cannot call their setter. It navigates here with a parameter, this
   * reads it once and clears it — the same seam the two rosters have used
   * since W4, and it works from the dashboard as well as from here.
   */
  const [params, setParams] = useSearchParams()
  const asked = params.get('new')
  useEffect(() => {
    if (asked !== 'visit' && asked !== 'meeting') return
    const at = atTimeOn(now(), 10, 0)
    if (asked === 'visit') setVisitAt(at)
    else setMeetingAt(at)
    const next = new URLSearchParams(params)
    next.delete('new')
    setParams(next, { replace: true })
  }, [asked, params, setParams])

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
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    }
    return map
  }, [events])

  /**
   * ★★ AB3.2 — THE NUMBER IS THE RANK WITHIN ITS OWN DAY.
   * `byDay` is already in start order, so the index in that list IS the
   * chronological rank, and it is computed once for the whole period.
   */
  const rankOf = useMemo(() => {
    const rank = new Map<string, number>()
    for (const list of byDay.values()) {
      let n = 0
      for (const event of list) {
        if (event.position === null) continue
        n++
        rank.set(event.id, n)
      }
    }
    return rank
  }, [byDay])

  /** AB3.4 — the entries the map cannot show, named rather than dropped. */
  const unplaced = useMemo(
    () => events.filter((e) => e.position === null),
    [events],
  )

  const openEvent = (event: AgendaEvent) => {
    if (event.kind === 'visit') setEditVisitId(event.id)
    else if (event.kind === 'meeting') setEditMeetingId(event.id)
    else navigate(event.href)
  }

  /**
   * ★★ AB3.3 — THE FIRST PRESS SELECTS, THE SECOND OPENS.
   *
   * « Cliquer un marqueur met en évidence le rendez-vous dans la liste. La
   *   liaison marche dans les deux sens. »
   *
   * ⚠️ AND SELECTING CANNOT ALSO OPEN, WHICH IS WHAT THE FIRST ATTEMPT DID.
   *    A guard's `href` is another screen: pressing its block selected it and
   *    then navigated away, so the emphasis on its marker existed for one
   *    frame on a page nobody was looking at any more — measured by `bun run
   *    abpass` as « nothing selected ». The link the product owner asked for
   *    only exists if the gesture that makes it STAYS on the agenda.
   *
   * ★ SO IT IS THE CALENDAR GESTURE, which is also what he already knows from
   *   every other calendar: one press to look at it — the block is ringed, its
   *   marker grows, the map is framed on it — and a second press on the SAME
   *   block to open the record. Nothing else on the screen changed meaning:
   *   the day heading still frames the day, the hour bands still create.
   */
  const selectAndOpen = (event: AgendaEvent) => {
    if (selectedId === event.id) {
      openEvent(event)
      return
    }
    setSelectedId(event.id)
    if (event.position) setFrame({ points: [event.position], key: `${event.id}-${Date.now()}` })
  }

  const markers: MapMarker[] = useMemo(
    () =>
      events
        .filter((e) => e.position !== null)
        .map((event) =>
          withInteraction(
            {
              id: event.id,
              position: event.position as LatLng,
              color: markerColour(event),
              title: event.title,
              subtitle: `${formatTime(event.at, locale)} · ${event.subtitle}`,
              kind: event.kind === 'mission' ? 'mission' : 'farm',
              badge: String(rankOf.get(event.id) ?? ''),
            },
            { hoveredId, selectedId },
            {
              onHover: setHoveredId,
              /* AB3.3, the map → list direction: selecting is all it does. The
                 grid rings the block and scrolls it into view; opening the
                 record from here would take the coordinator off the map he is
                 reading. */
              onSelect: () => setSelectedId(event.id),
            },
          ),
        ),
    [events, rankOf, hoveredId, selectedId, locale],
  )

  /** AB3.3 — the selected block is scrolled into view in the grid. */
  const gridBox = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!selectedId) return
    const el = gridBox.current?.querySelector(
      `[data-event-id="${CSS.escape(selectedId)}"]`,
    )
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedId, view])

  /** AB3.3 — pressing a day frames the map on that day's own points. */
  const focusDay = (day: Date) => {
    const key = localDayKey(day)
    setFocusedDay(key)
    const points = (byDay.get(key) ?? [])
      .map((e) => e.position)
      .filter((p): p is LatLng => p !== null)
    if (points.length > 0) setFrame({ points, key: `${key}-${Date.now()}` })
  }

  const step = (direction: number) =>
    setAnchor((d) =>
      view === 'day'
        ? addDays(d, direction)
        : view === 'week'
          ? addDays(d, 7 * direction)
          : addMonths(d, direction),
    )

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

  const controls = (
    /* Z1 — mb-4 IS `--list-rhythm`, and it is a plain margin rather than
       `.filters-gap` because this bar is itself a flex row: the class's
       zero-height guard would become a flex item and buy an extra `gap-2`. */
    <div
      data-testid="agenda-controls"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-card bg-surface-overlay p-2 shadow-card"
    >
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

      <p className="text-caption font-semibold text-content-primary">{periodLabel}</p>

      {/* AA1.2 — pills under the same thumb as every other row of pills.
          AB4.2 — three views, and the week is the default everywhere but on a
          phone (AB4.4). */}
      <div className="pill-row ms-auto" data-testid="agenda-views">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            aria-pressed={view === v}
            data-view={v}
            className={`filter-pill ${view === v ? 'filter-pill-active' : ''}`}
          >
            {t(`agenda.${v}`)}
          </button>
        ))}
      </div>
    </div>
  )

  const legend = (
    <ul className="flex flex-col gap-1.5">
      {(
        [
          ['planned', 'missionStatus.planned'],
          ['in_progress', 'missionStatus.in_progress'],
          ['return_not_confirmed', 'missionStatus.return_not_confirmed'],
        ] as const
      ).map(([status, key]) => (
        <li key={status} className="flex items-center gap-2">
          <span className={`inline-block h-2.5 w-2.5 rounded-pill ${DOT_TONE[status]}`} />
          <span className="text-caption text-content-secondary">{t(key)}</span>
        </li>
      ))}
      <li className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-pill bg-status-violet" />
        <span className="text-caption text-content-secondary">{t('agenda.visit')}</span>
      </li>
      <li className="flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-pill bg-farm-visited" />
        <span className="text-caption text-content-secondary">{t('meeting.title')}</span>
      </li>
    </ul>
  )

  const monthGrid = (
    <div className="grid grid-cols-7 gap-1.5">
      {days.slice(0, 7).map((d) => (
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
        const outside = day.getMonth() !== addDays(from, 10).getMonth()

        return (
          <div
            key={key}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              dropOnDay(e.dataTransfer.getData('text/plain'), day)
            }}
            className={`relative flex min-h-24 flex-col rounded-field border p-1.5 transition-colors duration-fast ${
              isToday ? 'border-accent bg-accent/5' : 'border-edge-subtle bg-surface-raised'
            } ${outside ? 'opacity-45' : ''}`}
          >
            <div className="mb-1 flex items-center justify-between gap-1">
              <button
                type="button"
                data-testid="agenda-day-head"
                data-day={key}
                data-today={isToday ? '1' : undefined}
                onClick={() => {
                  focusDay(day)
                  setAnchor(day)
                }}
                className={`numeric rounded-field px-1 text-caption font-bold transition-colors duration-fast hover:bg-surface-high ${
                  isToday ? 'text-accent-ink' : 'text-content-primary'
                }`}
              >
                {day.getDate()}
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-1">
              {dayEvents.slice(0, 2).map((event) => {
                const tone = toneOf(event)
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-testid="agenda-event"
                    data-event-id={event.id}
                    data-selected={selectedId === event.id ? '1' : undefined}
                    title={selectedId === event.id ? t('agenda.openEvent') : event.title}
                    onClick={() => selectAndOpen(event)}
                    className={`w-full rounded-field border-s-[3px] px-1.5 py-1 text-start
                                transition-all duration-fast ease-out hover:brightness-95 ${tone.block} ${
                                  selectedId === event.id ? 'ring-2 ring-accent' : ''
                                }`}
                  >
                    <span className="flex items-center gap-1">
                      <Icon name={tone.icon} size={10} />
                      <span className="ltr-nums text-micro font-semibold">
                        {formatTime(event.at, locale)}
                      </span>
                    </span>
                    <span
                      className={`mt-0.5 block truncate text-micro font-medium ${
                        event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''
                      }`}
                    >
                      {event.title}
                    </span>
                  </button>
                )
              })}
              {dayEvents.length > 2 && (
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
          </div>
        )
      })}
    </div>
  )

  return (
    <>
      <MapPanel
        screenKey="agenda"
        ariaLabel={t('map.agendaMap')}
        markers={markers}
        frameTo={frame ? { points: frame.points, key: frame.key, maxZoom: 13 } : undefined}
        legend={legend}
        contentWidth="half"
        /* AB4.1 — see the note on `MapSplit.contentClassName`: this is what
           makes `flex-1` below mean the column's height rather than the
           ladder's own. */
        contentClassName="flex h-full min-h-0 flex-col"
        /* AB4.1 — and the column keeps its own scrollport when the map is
           hidden, so "the whole useful height" is a real box. See the note on
           `MapSplit.keepPanelScroll`; this screen has no window-virtualised
           table, which is the only reason that rule exists. */
        keepPanelScroll
      >
        {(state) => (
          /**
           * ★★ AB4.1 — « la grille occupe toute la hauteur utile ».
           *
           * The column is a flex COLUMN with `min-h-0`, and the grid inside it
           * is `flex-1`. `min-h-0` is the whole of it: a flex item's default
           * `min-height: auto` refuses to shrink below its content, so without
           * it the grid is as tall as twenty-four hours at their full height
           * and the "useful height" is whatever the page happens to be. The
           * MONTH view is deliberately NOT stretched — it is a grid of days,
           * not of hours, and stretching six rows of dates buys nothing.
           */
          <div
            ref={gridBox}
            data-testid="agenda-panel"
            data-map-mode={state.mode}
            className="flex min-h-0 flex-1 flex-col"
          >
            <header className="mb-3">
              <h1 className="text-title text-content-primary">{t('agenda.title')}</h1>
              <p className="muted mt-1">{t('agenda.subtitle')}</p>
            </header>

            {controls}

            {/* G9 — the day as it will be DRIVEN, above the day as it is
                booked. Same block as the dashboard, keyed on the viewed date. */}
            {view === 'day' && (
              <div className="mb-3 shrink-0">
                <MyDayBlock dayKey={localDayKey(days[0])} />
              </div>
            )}

            {view === 'month' ? (
              <div className="min-h-0 flex-1 overflow-y-auto">{monthGrid}</div>
            ) : (
              <AgendaGrid
                days={days}
                byDay={byDay}
                today={today}
                /* AB4.1 — the hours stretch only when the content column has
                   the screen; in a split panel they keep a legible fixed band
                   and the ladder scrolls. */
                stretch={state.mode === 'hidden'}
                toneOf={toneOf}
                selectedId={selectedId}
                onSelect={selectAndOpen}
                onFocusDay={focusDay}
                focusedDay={focusedDay}
                onAddOn={(day, hour) => setOpenSlot(`${localDayKey(day)}-${hour}`)}
              />
            )}

            {/**
              * ★★ AB3.4 — « Un rendez-vous sans lieu connu apparaît dans la
              *    liste, marqué מיקום חסר, et n'est pas placé sur la carte. »
              *
              * It is a BLOCK rather than a badge on each entry, because the
              * question it answers is asked of the map, not of the entry:
              * "the map shows four and I have five" is what a coordinator
              * notices, and this is where he finds the fifth.
              */}
            {unplaced.length > 0 && (
              <div
                data-testid="agenda-unplaced"
                data-count={unplaced.length}
                data-open={unplacedOpen ? '1' : '0'}
                className="mt-2 shrink-0 rounded-card border border-edge-subtle bg-surface-raised"
              >
                {/**
                  * ⚠️ FOLDED BY DEFAULT, AND THAT IS AB4.1 ARBITRATING AB3.4.
                  * Open, this block was 150 px of a content-full column —
                  * measured — which came straight off the hour ladder the
                  * product owner asked to have the whole height. The entries
                  * are ALREADY marked in the grid itself (the ⚠ beside their
                  * hour), so what is folded here is the roll-call, not the
                  * marking. One line says how many, which is the question the
                  * map raises: « la carte en montre quatre et j'en ai cinq ».
                  */}
                <button
                  type="button"
                  data-testid="agenda-unplaced-toggle"
                  aria-expanded={unplacedOpen}
                  onClick={() => setUnplacedOpen((v) => !v)}
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-start"
                >
                  <Icon name="alert" size={14} className="shrink-0 text-status-warn-ink" />
                  <span className="text-micro font-semibold text-content-secondary">
                    {t('agenda.missingPosition')}
                  </span>
                  <span className="filter-count">{unplaced.length}</span>
                  <Icon
                    name="chevronDown"
                    size={14}
                    className={`ms-auto shrink-0 text-content-muted ${
                      unplacedOpen ? '' : 'ltr:-rotate-90 rtl:rotate-90'
                    }`}
                  />
                </button>
                {unplacedOpen && (
                  <div className="px-3 pb-3">
                    <p className="muted">{t('agenda.missingPositionHint')}</p>
                    <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
                      {unplaced.map((event) => (
                        <li key={event.id}>
                          <button
                            type="button"
                            data-testid="agenda-unplaced-row"
                            onClick={() => selectAndOpen(event)}
                            className="flex min-h-11 w-full items-center gap-2 rounded-field px-2 text-start
                                       hover:bg-surface-high"
                          >
                            <Icon
                              name={KIND_ICON[event.kind]}
                              size={13}
                              className="shrink-0 text-content-muted"
                            />
                            <span className="ltr-nums shrink-0 text-micro text-content-muted">
                              {formatDate(event.at, locale)} {formatTime(event.at, locale)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-caption text-content-primary">
                              {event.title}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* The hour bands open the same creation menu the month cells do;
                it is rendered here so it is never clipped by the scroller. */}
            {openSlot !== null && view !== 'month' && (
              <>
                <button
                  type="button"
                  aria-label={t('common.close')}
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setOpenSlot(null)}
                />
                <div className="relative">
                  <SlotMenu
                    day={new Date(`${openSlot.slice(0, 10)}T00:00:00`)}
                    onClose={() => setOpenSlot(null)}
                    onPlanVisit={(d) =>
                      setVisitAt(atTimeOn(d, Number(openSlot.slice(11)) || 10, 0))
                    }
                    onPlanMeeting={(d) =>
                      setMeetingAt(atTimeOn(d, Number(openSlot.slice(11)) || 10, 0))
                    }
                  />
                </div>
              </>
            )}
          </div>
        )}
      </MapPanel>

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
