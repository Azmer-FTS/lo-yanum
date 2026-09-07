import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatTime, formatWeekdayShort, isSameDay, localDayKey } from '@core/index'
import type { AgendaEvent } from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'
import { useLocale } from '../hooks/useLocale'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB4 (2026-09-08) — THE AGENDA LOOKS LIKE AN AGENDA.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner finds the week view right and badly used:
 *
 *   « En mode contenu plein écran, la grille de la semaine occupe toute la
 *     hauteur utile : les heures s'étirent, on ne laisse pas de bande vide en
 *     bas. […] ligne de l'heure courante bien visible, aujourd'hui mis en
 *     évidence, chevauchements de rendez-vous côte à côte et non superposés,
 *     défilement qui s'ouvre sur les heures de travail plutôt que sur
 *     minuit. »
 *
 * ★ WHAT WAS THERE, AND WHY IT COULD NOT DO ANY OF THAT. The week was seven
 *   BOXES, each a `min-h-40` column holding a stack of pills. A box has no
 *   time axis, so 09:00 and 21:00 were at whatever height the list reached;
 *   "now" had nowhere to be drawn; two guards at the same hour were one above
 *   the other, which is not what "at the same time" looks like; and the boxes
 *   ended wherever the longest one did, leaving the rest of a full screen
 *   empty. Every one of the product owner's four points is the same missing
 *   thing: THE HOUR IS NOT A POSITION.
 *
 * ★ SO IT IS AN HOUR LADDER, and the ladder is the geometry:
 *
 *     top    = (minutes since 00:00) / 60 × --hour-h
 *     height = duration in minutes    / 60 × --hour-h, floored so a
 *              point-in-time visit is still a readable block
 *
 * ⚠️ TWENTY-FOUR HOURS, NOT SIX-TO-MIDNIGHT, AND THAT IS NOT A DETAIL IN THIS
 *    APP. The old day view drew 06:00–23:00. This programme's whole subject is
 *    NIGHT GUARDS: a shift that starts at 22:00 and ends at 04:00 has half of
 *    itself outside that window, and a 01:00 guard did not exist on the
 *    calendar at all. The ladder is the whole day, and « défilement qui
 *    s'ouvre sur les heures de travail » is then exactly what it says — the
 *    SCROLL opens at `OPEN_AT`, and midnight is above it, one flick away.
 *
 * ★ AND THE HOURS STRETCH ONLY WHEN THERE IS ROOM. In `contentFull` the box
 *   is measured and the hour takes `height / 24`, floored at `MIN_HOUR` so it
 *   never becomes an unreadable band; in a split panel it is `SPLIT_HOUR` and
 *   the ladder scrolls. Either way there is no empty strip at the bottom,
 *   because the ladder is exactly as tall as the hours it draws.
 */

/** Where the scroll opens. Not midnight — the day starts being worked at 06. */
const OPEN_AT = 6
/** Below this an hour band cannot carry a label, let alone an event. */
const MIN_HOUR = 30
/** A ladder in a narrow panel scrolls rather than squeezes. */
const SPLIT_HOUR = 52
/** A visit is a point in time; it still needs a block a thumb can hit. */
const MIN_EVENT_MINUTES = 45

export interface AgendaTone {
  /** Tailwind classes for the block. */
  block: string
  dot: string
  icon: IconName
}

/**
 * ★★ AB4.3 — TWO APPOINTMENTS AT THE SAME HOUR ARE SIDE BY SIDE.
 *
 * « chevauchements de rendez-vous côte à côte et non superposés »
 *
 * The events of one day are swept in start order into CLUSTERS — a maximal run
 * of events where each overlaps at least one other — and every event in a
 * cluster gets `1 / size` of the column, in its own lane.
 *
 * ⚠️ THE CLUSTER, NOT THE PAIR. Sharing the width between two events that
 *    happen to touch would still stack a third one on the second: A 20:00–02:00
 *    overlaps B 21:00–22:00 and C 23:00–00:00 while B and C do not touch each
 *    other, and all three have to be visible. Splitting by cluster gives
 *    thirds; splitting by pair would give B and C the same half.
 *
 * ⚠️ AND THE COMPARISON IS ON THE DAY'S OWN MINUTES, clamped to it. A guard
 *    that runs past midnight is drawn to the foot of its own day and picked up
 *    again at the head of the next one — the alternative, a block that
 *    overflows its column, is a block drawn over the neighbouring day.
 */
export interface LaidOut {
  event: AgendaEvent
  /** Minutes from 00:00 of the day being drawn. */
  from: number
  to: number
  lane: number
  lanes: number
}

const MINUTES_IN_DAY = 24 * 60

export function layOutDay(events: readonly AgendaEvent[], day: Date): LaidOut[] {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime()
  const dayEnd = dayStart + MINUTES_IN_DAY * 60_000

  const spans = events
    .map((event) => {
      const startMs = new Date(event.at).getTime()
      const rawEnd = new Date(event.endAt).getTime()
      const endMs = Number.isFinite(rawEnd) && rawEnd > startMs ? rawEnd : startMs
      const from = Math.max(0, Math.round((startMs - dayStart) / 60_000))
      const toRaw = Math.round((Math.min(endMs, dayEnd) - dayStart) / 60_000)
      const to = Math.min(MINUTES_IN_DAY, Math.max(from + MIN_EVENT_MINUTES, toRaw))
      return { event, from, to }
    })
    .sort((a, b) => a.from - b.from || a.to - b.to)

  const out: LaidOut[] = []
  let cluster: typeof spans = []
  let clusterEnd = -1

  const flush = (): void => {
    if (cluster.length === 0) return
    /* Lanes inside the cluster: the first lane whose last event has finished. */
    const laneEnds: number[] = []
    for (const span of cluster) {
      let lane = laneEnds.findIndex((end) => end <= span.from)
      if (lane === -1) {
        lane = laneEnds.length
        laneEnds.push(span.to)
      } else {
        laneEnds[lane] = span.to
      }
      out.push({ ...span, lane, lanes: 0 })
    }
    const lanes = laneEnds.length
    for (let i = out.length - cluster.length; i < out.length; i++) out[i].lanes = lanes
    cluster = []
    clusterEnd = -1
  }

  for (const span of spans) {
    if (cluster.length > 0 && span.from >= clusterEnd) flush()
    cluster.push(span)
    clusterEnd = Math.max(clusterEnd, span.to)
  }
  flush()

  return out
}

/**
 * How tall an hour is, and whether the ladder scrolls.
 *
 * ⚠️ `useLayoutEffect` FOR THE FIRST MEASUREMENT, then a ResizeObserver. The
 *    ladder's opening scroll position is computed FROM the hour height, so a
 *    height that arrives after the browser has painted means a calendar that
 *    visibly jumps from midnight to six o'clock on every mount.
 */
function useHourHeight(stretch: boolean): {
  ref: (node: HTMLElement | null) => void
  hour: number
} {
  const [hour, setHour] = useState(stretch ? MIN_HOUR : SPLIT_HOUR)
  const node = useRef<HTMLElement | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  useEffect(() => () => observer.current?.disconnect(), [])

  const ref = (el: HTMLElement | null): void => {
    if (el === node.current) return
    observer.current?.disconnect()
    node.current = el
    if (!el) {
      observer.current = null
      return
    }
    const measure = (): void =>
      setHour(stretch ? Math.max(MIN_HOUR, el.clientHeight / 24) : SPLIT_HOUR)
    measure()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(el)
  }

  useLayoutEffect(() => {
    const el = node.current
    if (!el) return
    setHour(stretch ? Math.max(MIN_HOUR, el.clientHeight / 24) : SPLIT_HOUR)
  }, [stretch])

  return { ref, hour }
}

/** Minutes since midnight, ticking once a minute — the "now" line. */
function useMinuteOfDay(): number {
  const [minute, setMinute] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const tick = (): void => {
      const d = new Date()
      setMinute(d.getHours() * 60 + d.getMinutes())
    }
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])
  return minute
}

export interface AgendaGridProps {
  /** One column per day: 1 in the day view, 7 in the week view. */
  days: Date[]
  byDay: Map<string, AgendaEvent[]>
  today: Date
  /** True when the content column has the whole screen (map hidden). */
  stretch: boolean
  toneOf: (event: AgendaEvent) => AgendaTone
  selectedId: string | null
  onSelect: (event: AgendaEvent) => void
  /** AB3.3 — the day header is also "put the map on this day". */
  onFocusDay: (day: Date) => void
  focusedDay: string | null
  /** The empty-slot creation menu, opened on a column's own "+" . */
  onAddOn: (day: Date, hour: number) => void
}

export function AgendaGrid({
  days,
  byDay,
  today,
  stretch,
  toneOf,
  selectedId,
  onSelect,
  onFocusDay,
  focusedDay,
  onAddOn,
}: AgendaGridProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { ref: boxRef, hour } = useHourHeight(stretch)
  const nowMinute = useMinuteOfDay()
  const scroller = useRef<HTMLDivElement | null>(null)
  const opened = useRef(false)

  /**
   * AB4.3 — « défilement qui s'ouvre sur les heures de travail ». Once, on the
   * first paint that has a real hour height: re-running it on every render
   * would drag the coordinator back to 06:00 every time he scrolled to a
   * night guard.
   */
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el || opened.current || hour <= 0) return
    if (el.scrollHeight <= el.clientHeight + 1) {
      opened.current = true
      return
    }
    el.scrollTop = OPEN_AT * hour
    opened.current = true
  }, [hour])

  const ladder = Array.from({ length: 24 }, (_, i) => i)
  const height = hour * 24

  return (
    <div
      ref={(node) => {
        scroller.current = node
        boxRef(node)
      }}
      data-testid="agenda-grid"
      data-hour-height={Math.round(hour)}
      /* `min-h-0` + `flex-1` on the parent is what makes "the whole useful
         height" mean the box rather than the content: without it a flex child
         is as tall as what is inside it, which is the empty band AB4.1 is
         about. */
      /* ⚠️ AND A CAP FOR THE STACKED SHAPE. Below the map breakpoint the
         content column has no height of its own — the shell is a plain
         column — so `flex-1` resolves to the ladder's own 24 hours and the
         PAGE scrolls instead of the grid. That is not an empty band, but it
         does push the view pills off the top. The cap is inert wherever the
         flex height is smaller, which is every width at and above `lg`. */
      className="relative max-h-[calc(100dvh-13rem)] min-h-0 flex-1 overflow-y-auto
                 rounded-card bg-surface-raised shadow-card"
    >
      {/* The weekday header rides the top of the scroller, so the columns keep
          their names while the night hours are scrolled to. */}
      <div
        className="sticky top-0 z-20 grid border-b border-edge-subtle bg-surface-raised/95 backdrop-blur"
        style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}
      >
        <span aria-hidden="true" />
        {days.map((day) => {
          const key = localDayKey(day)
          const isToday = isSameDay(day, today)
          const count = (byDay.get(key) ?? []).length
          return (
            <button
              key={key}
              type="button"
              onClick={() => onFocusDay(day)}
              title={t('agenda.focusDay')}
              data-testid="agenda-day-head"
              data-day={key}
              data-today={isToday ? '1' : undefined}
              data-focused={focusedDay === key ? '1' : undefined}
              className={`flex min-h-11 flex-col items-center justify-center gap-0.5 border-s border-edge-subtle
                          px-1 py-1.5 transition-colors duration-fast hover:bg-surface-high ${
                            focusedDay === key ? 'bg-accent/10' : ''
                          }`}
            >
              <span className="text-micro text-content-muted">
                {formatWeekdayShort(day, locale)}
              </span>
              <span
                className={`numeric flex h-6 min-w-6 items-center justify-center rounded-pill px-1 text-caption font-bold ${
                  isToday
                    ? 'bg-accent text-content-on-accent'
                    : 'text-content-primary'
                }`}
              >
                {day.getDate()}
              </span>
              {count > 0 && (
                <span className="numeric text-micro text-content-muted">{count}</span>
              )}
            </button>
          )
        })}
      </div>

      <div
        className="relative grid"
        style={{
          gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))`,
          height: `${height}px`,
        }}
      >
        {/* The hour gutter. */}
        <div className="relative border-e border-edge-subtle">
          {ladder.map((h) => (
            <span
              key={h}
              className="numeric ltr-nums absolute end-1 -translate-y-1/2 text-micro text-content-muted"
              style={{ top: `${h * hour}px` }}
            >
              {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
            </span>
          ))}
        </div>

        {days.map((day) => {
          const key = localDayKey(day)
          const isToday = isSameDay(day, today)
          const laid = layOutDay(byDay.get(key) ?? [], day)
          return (
            <div
              key={key}
              data-testid="agenda-column"
              data-day={key}
              className={`relative border-s border-edge-subtle ${
                isToday ? 'bg-accent/5' : ''
              }`}
            >
              {/* The hour lines, and each band is also a create target. */}
              {ladder.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`${formatWeekdayShort(day, locale)} ${String(h).padStart(2, '0')}:00`}
                  onClick={() => onAddOn(day, h)}
                  className="absolute inset-x-0 border-t border-edge-subtle/60 hover:bg-accent/5"
                  style={{ top: `${h * hour}px`, height: `${hour}px` }}
                />
              ))}

              {laid.map(({ event, from, to, lane, lanes }) => {
                const tone = toneOf(event)
                const selected = selectedId === event.id
                /**
                 * ⚠️ A SHORT BLOCK PUTS THE HOUR AND THE NAME ON ONE LINE.
                 * At a stretched 34 px hour a 45-minute appointment is 25 px
                 * tall and two 11 px lines do not fit — measured on the
                 * deployed capture as five blocks showing a time and no name,
                 * which is the one thing a calendar entry must always say.
                 */
                const boxHeight = ((to - from) / 60) * hour
                const compact = boxHeight < 34
                return (
                  <button
                    key={event.id}
                    type="button"
                    data-testid="agenda-event"
                    data-event-id={event.id}
                    data-lane={lane}
                    data-lanes={lanes}
                    onClick={() => onSelect(event)}
                    /* ⚠️ `flex flex-col justify-start`, AND IT IS NOT DECORATION.
                       A `<button>` CENTRES its content box vertically by the
                       user-agent stylesheet, so a six-hour guard drew its own
                       time and title in the middle of the block — measured on
                       the deployed capture as a label sitting at 09:00 on an
                       event that starts at 05:11, which reads as the wrong
                       time on a calendar whose whole subject is the hour. */
                    className={`absolute flex flex-col justify-start overflow-hidden rounded-field
                                border-s-[3px] py-0.5 text-start ${compact ? 'px-1' : 'px-1.5'}
                                transition-all duration-fast ease-out hover:brightness-95 ${tone.block} ${
                                  selected ? 'ring-2 ring-accent z-10' : ''
                                }`}
                    style={{
                      top: `${(from / 60) * hour}px`,
                      height: `${Math.max(18, ((to - from) / 60) * hour - 2)}px`,
                      insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`,
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      {/* ⚠️ NO KIND ICON ON A COMPACT BLOCK. A week column on
                          a 402 px phone is 46 px wide and the button clips at
                          its inline end, so nine pixels of icon plus a gap
                          pushed the HOUR out of the box — measured as blocks
                          reading « :30 ». The colour of the block already says
                          which kind it is, and the legend says what the colour
                          means; the hour has nothing else that carries it. */}
                      {!compact && <Icon name={tone.icon} size={9} className="shrink-0" />}
                      <span className="ltr-nums shrink-0 text-micro font-semibold">
                        {formatTime(event.at, locale)}
                      </span>
                      {event.position === null && (
                        <Icon
                          name="alert"
                          size={9}
                          className="shrink-0"
                          aria-label={t('agenda.missingPosition')}
                        />
                      )}
                      {compact && (
                        <span
                          className={`min-w-0 truncate text-micro font-medium ${
                            event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''
                          }`}
                        >
                          {event.title}
                        </span>
                      )}
                    </span>
                    {!compact && (
                      <span
                        className={`block truncate text-micro font-medium ${
                          event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''
                        }`}
                      >
                        {event.title}
                      </span>
                    )}
                  </button>
                )
              })}

              {/**
                * ★★ AB4.3 — THE CURRENT HOUR, ON TODAY'S COLUMN ONLY.
                *
                * A line drawn across all seven columns says "it is now" about
                * Tuesday as well as about today, which is exactly the reading
                * a calendar must not allow. It is `pointer-events-none` so it
                * never takes a tap that was aimed at the band under it.
                */}
              {isToday && (
                <span
                  data-testid="agenda-now"
                  aria-label={t('agenda.nowLine')}
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: `${(nowMinute / 60) * hour}px` }}
                >
                  <span className="h-0.5 w-full bg-critical" />
                  <span className="absolute -start-1 h-2.5 w-2.5 rounded-pill bg-critical shadow-card" />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
