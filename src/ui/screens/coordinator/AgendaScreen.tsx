import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import {
  MONTH_GRID_DAYS,
  addDays,
  addMonths,
  agendaCanMove,
  agendaCanResize,
  atTimeOn,
  formatDate,
  formatMonthYear,
  formatTime,
  formatWeekdayShort,
  getCalendarEvents,
  getDueTasks,
  getFarmVisit,
  getGeneralMeeting,
  isSameDay,
  localDayKey,
  monthGridStart,
  movedSpan,
  now,
  resizedEnd,
  startOfWeek,
  updateFarmVisit,
  updateGeneralMeeting,
} from '@core/index'
import type { AgendaEvent, AgendaLink, LatLng, MissionStatus, Task } from '@core/index'

import { AgendaGrid } from '../../components/agendaGrid'
import type { AgendaDraft, AgendaTone } from '../../components/agendaGrid'
import { Icon } from '../../components/Icon'
import { TitleWithInfo } from '../../components/InfoTip'
import { MapSplit } from '../../components/MapSplit'
import { MapView } from '../../components/MapView'
import type { MapMarker } from '../../components/MapView'
import { withInteraction } from '../../components/MapPanel'
import { MyDayBlock } from '../../components/MyDayBlock'
import { DockedSheet } from '../../components/Sheet'
import { readToken } from '../../components/badges'
import { runUndoable } from '../../components/UndoToast'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { useViewportTier } from '../../hooks/useNarrow'
import { EventPanel, findCalendarEvent, whenLabel } from '../../agenda/EventPanel'
import type { EventRef, PanelState } from '../../agenda/EventPanel'
import { TasksPane } from '../../tasks/TasksPane'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BE (2026-10-13) — LA PAGE יומן : L'AGENDA ET LES TÂCHES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux volets, et AUCUNE disposition nouvelle : c'est `MapSplit`, le partage
 * de toutes les listes à carte. L'AGENDA est à la place de la carte (à gauche),
 * les TÂCHES à la place de la liste (à droite), dans les mêmes proportions ;
 * au téléphone, un seul à la fois, et la même pilule pour passer de l'un à
 * l'autre (ses icônes : la liste à cocher, le calendrier). Le dernier volet
 * ouvert est retenu (`lo-yanum:map-mode:agenda`).
 *
 * ★ OUVRIR UN ÉVÉNEMENT NE QUITTE PAS LE CALENDRIER (`EventPanel`) : sur
 *   tablette et ordinateur, le panneau prend la colonne des tâches le temps
 *   qu'il est ouvert (le partage est imposé, le mode retenu n'est pas touché) ;
 *   au téléphone, la feuille ancrée de BC, à deux crans.
 * ★ TOUCHER UN CRÉNEAU VIDE crée un rendez-vous au quart d'heure touché et
 *   ouvre le même panneau, le curseur dans le titre.
 * ★ RÈGLE 0 : la grille montre `getCalendarEvents` — les rendez-vous du PO ET
 *   les reflets (gardes, itinéraires), plus les tâches datées en haut du jour.
 *
 * ⚠️ AB3 (« où se situent mes rendez-vous ») N'EST PAS PERDU : la carte des
 *    rendez-vous de la période se montre d'un toucher (« מפה ») AU-DESSUS de
 *    la grille, numérotée dans l'ordre de chaque jour comme avant ; toucher
 *    une épingle ouvre le rendez-vous.
 */

type View = 'day' | 'week' | 'month'

/** Event colour, resolved from the same status tokens the rest of the app uses. */
const MISSION_TONE: Record<MissionStatus, string> = {
  recruiting: 'border-s-status-warn bg-status-warn/10 text-status-warn-ink',
  planned: 'border-s-status-info bg-status-info/10 text-status-info-ink',
  in_progress: 'border-s-status-success bg-status-success/10 text-status-success-ink',
  completed: 'border-s-content-muted bg-content-muted/10 text-content-muted',
  return_not_confirmed: 'border-s-critical bg-critical/10 text-status-danger-ink',
  cancelled: 'border-s-content-muted bg-content-muted/10 text-content-muted',
}

const VISIT_TONE = 'border-s-status-violet bg-status-violet/10 text-status-violet-ink'
const MEETING_TONE = 'border-s-farm-visited bg-farm-visited/10 text-farm-visited-ink'
/** ★★ BE — l'itinéraire : la couleur de l'accent, hachuré comme tout reflet. */
const TOUR_TONE = 'border-s-accent bg-accent/10 text-accent-ink'

const DOT_TONE: Record<MissionStatus, string> = {
  recruiting: 'bg-status-warn',
  planned: 'bg-status-info',
  in_progress: 'bg-status-success',
  completed: 'bg-content-muted',
  return_not_confirmed: 'bg-critical',
  cancelled: 'bg-content-muted',
}

const MISSION_TOKEN: Record<MissionStatus, string> = {
  recruiting: '--status-warn',
  planned: '--status-info',
  in_progress: '--status-success',
  completed: '--text-muted',
  return_not_confirmed: '--critical',
  cancelled: '--text-muted',
}

const KIND_ICON = { mission: 'shield', visit: 'pin', meeting: 'users', tour: 'route' } as const

function toneOf(event: AgendaEvent): AgendaTone {
  if (event.kind === 'tour') return { block: TOUR_TONE, dot: 'bg-accent', icon: 'route' }
  return {
    block: event.missionStatus ? MISSION_TONE[event.missionStatus] : event.kind === 'meeting' ? MEETING_TONE : VISIT_TONE,
    dot: event.missionStatus ? DOT_TONE[event.missionStatus] : event.kind === 'meeting' ? 'bg-farm-visited' : 'bg-status-violet',
    icon: KIND_ICON[event.kind],
  }
}

function markerColour(event: AgendaEvent): string {
  if (event.missionStatus) return readToken(MISSION_TOKEN[event.missionStatus])
  return readToken(event.kind === 'meeting' ? '--farm-visited' : '--status-violet')
}

/** Le rendez-vous et le reflet : qui se déplace, qui s'allonge (la règle est dans le cœur). */
const canMove = agendaCanMove
const canResize = agendaCanResize

/** G6.2 — what else can be put on a day: a guard, a visit, a route. */
function DayMenu({ day, onClose }: { day: Date; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const row = (icon: 'shield' | 'pin' | 'route', tint: string, label: string, to: string) => (
    <button
      type="button"
      className="flex min-h-11 w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-micro font-medium text-content-primary hover:bg-surface-high"
      onClick={() => {
        onClose()
        navigate(to)
      }}
    >
      <Icon name={icon} size={13} className={tint} />
      {label}
    </button>
  )
  return (
    <div data-testid="agenda-slot-menu" className="absolute end-0 top-full z-30 mt-1 w-60 animate-fade-in rounded-field border border-edge-strong bg-surface-overlay p-1 shadow-lift">
      {row('shield', 'text-accent-ink', t('missions.create'), `/coordinator/missions/new?date=${localDayKey(day)}`)}
      {row('pin', 'text-status-violet-ink', t('agenda.planVisit'), `/coordinator/agenda/visit/new?at=${encodeURIComponent(atTimeOn(day, 10, 0))}`)}
      {row('route', 'text-accent-ink', t('myday.createRoute'), `/coordinator/route?date=${localDayKey(day)}`)}
    </div>
  )
}

/** `kind:id` d'une adresse (`?event=meeting:abc`). */
function parseRef(raw: string | null): EventRef | null {
  if (!raw) return null
  const at = raw.indexOf(':')
  if (at <= 0) return null
  const kind = raw.slice(0, at)
  const id = raw.slice(at + 1)
  if (kind !== 'meeting' && kind !== 'visit' && kind !== 'mission' && kind !== 'tour') return null
  return { kind, id: kind === 'tour' && !id.startsWith('tour:') ? `tour:${id}` : id }
}

function parseLink(raw: string | null): AgendaLink | null {
  if (!raw) return null
  const at = raw.indexOf(':')
  const kind = raw.slice(0, at)
  const id = raw.slice(at + 1)
  return (kind === 'institution' || kind === 'farm' || kind === 'lead') && id ? { kind, id } : null
}

export function AgendaScreen() {
  const { t } = useTranslation()
  const tier = useViewportTier()
  const phone = tier === 'phone'
  const [panel, setPanel] = useState<PanelState | null>(null)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [focusTask, setFocusTask] = useState<string | null>(null)
  const [composeTask, setComposeTask] = useState(false)
  const [forceMode, setForceMode] = useState<'hidden' | 'full' | null>(null)
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()

  const openPanel = useCallback((next: PanelState | null) => {
    setPanel(next)
    setSheetOpen(true)
  }, [])

  /**
   * ★★ AB1.1 · BE — LES ADRESSES : `?new=meeting` (le « + »), `?new=task`,
   * `?event=meeting:<id>` (une fiche, une tâche reliée), `?link=institution:<id>`
   * (un rendez-vous déjà relié). Lues une fois, puis effacées.
   */
  useEffect(() => {
    const asked = params.get('new')
    const ref = parseRef(params.get('event'))
    /* ★★ BF — `?task=<id>` : la recherche globale ouvre une tâche, comme l'agenda. */
    const askedTask = params.get('task')
    if (askedTask) {
      setPanel(null)
      setFocusTask(askedTask)
      if (phone) setForceMode('hidden')
      setParams({}, { replace: true })
      return
    }
    if (!asked && !ref) return
    if (asked === 'visit') {
      navigate(`/coordinator/agenda/visit/new?at=${encodeURIComponent(atTimeOn(now(), 10, 0))}`, { replace: true, state: { returnTo: '/coordinator/agenda' } })
      return
    }
    if (asked === 'meeting') {
      const at = params.get('at') ?? atTimeOn(now(), 10, 0)
      openPanel({ mode: 'new', at, endAt: new Date(Date.parse(at) + 3_600_000).toISOString(), link: parseLink(params.get('link')) })
      if (phone) setForceMode('full')
    } else if (asked === 'task') {
      setForceMode(phone ? 'hidden' : null)
      setComposeTask(true)
    } else if (ref) {
      openPanel({ mode: 'view', ref })
      if (phone) setForceMode('full')
    }
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  const desktopPanel = !!panel && !phone

  /* ★ Au téléphone, la feuille ouverte écarte le « + » et la pilule (comme la
     feuille des filtres, AA1.2) : montés au-dessus d'elle, ils se posaient sur
     le titre de l'agenda. */
  useEffect(() => {
    if (!(panel && phone)) return
    const root = document.documentElement
    root.setAttribute('data-filters-open', '')
    return () => root.removeAttribute('data-filters-open')
  }, [panel, phone])

  return (
    <>
      <MapSplit
        screenKey="agenda"
        ariaLabel={t('agenda.title')}
        list
        bar={false}
        keepPanelScroll
        contentClassName="flex min-h-0 flex-col"
        modeOverride={desktopPanel ? 'split' : (forceMode ?? undefined)}
        onModeChange={() => {
          setForceMode(null)
          if (!phone) setPanel(null)
        }}
        pillLabels={{ hidden: t('tasks.title'), split: t('agenda.both'), full: t('agenda.title') }}
        pillIcons={{ hidden: 'checklist', split: 'columns', full: 'calendar' }}
        map={(state) => (
          <AgendaPane
            stretch={state.mode === 'full'}
            phone={phone}
            panel={panel}
            onPanel={openPanel}
            onOpenTask={(task) => {
              setFocusTask(task.id)
              if (phone) setForceMode('hidden')
              else setPanel(null)
            }}
          />
        )}
      >
        {() =>
          desktopPanel && panel ? (
            <div className="pb-6" data-testid="agenda-side-panel">
              <EventPanel
                panel={panel}
                onPanel={openPanel}
                onClose={() => setPanel(null)}
                onOpenTask={(id) => {
                  setPanel(null)
                  setFocusTask(id)
                }}
              />
            </div>
          ) : (
            <TasksPane
              focusTask={focusTask}
              onFocusHandled={() => setFocusTask(null)}
              compose={composeTask}
              onComposeHandled={() => setComposeTask(false)}
            />
          )
        }
      </MapSplit>

      {/* Au téléphone : la feuille ancrée, à deux crans, le calendrier au-dessus. */}
      {panel && phone && (
        <DockedSheet
          expanded={sheetOpen}
          onExpandedChange={setSheetOpen}
          maxHeight={0.56}
          testId="agenda-sheet"
          header={<SheetHeader panel={panel} onClose={() => setPanel(null)} />}
        >
          <EventPanel
            bare
            panel={panel}
            onPanel={openPanel}
            onClose={() => setPanel(null)}
            onOpenTask={(id) => {
              setPanel(null)
              setFocusTask(id)
              setForceMode('hidden')
            }}
          />
        </DockedSheet>
      )}
    </>
  )
}

/** La barre de la feuille réduite : le titre et l'heure, et la croix. */
function SheetHeader({ panel, onClose }: { panel: PanelState; onClose: () => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const event = useCoreValue(() => (panel.mode === 'new' ? null : findCalendarEvent(panel.ref)))
  const title = panel.mode === 'new' ? t('agenda.newEvent') : (event?.title || (event?.kind === 'tour' ? t('agenda.tourUntitled') : ''))
  const when = panel.mode === 'new' ? whenLabel(panel.at, panel.endAt, locale) : event ? whenLabel(event.at, event.endAt, locale) : ''
  return (
    <div className="flex items-center gap-2" data-testid="agenda-sheet-bar">
      <div className="min-w-0 flex-1">
        <p dir="auto" className="truncate text-caption font-semibold text-content-primary">{title}</p>
        <p className="numeric truncate text-micro text-content-muted">{when}</p>
      </div>
      <button type="button" onClick={onClose} aria-label={t('common.close')} data-testid="agenda-sheet-close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high">
        <Icon name="close" size={18} />
      </button>
    </div>
  )
}

function AgendaPane({
  stretch,
  phone,
  panel,
  onPanel,
  onOpenTask,
}: {
  stretch: boolean
  phone: boolean
  panel: PanelState | null
  onPanel: (next: PanelState | null) => void
  onOpenTask: (task: Task) => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  /* AB4.4 — au téléphone, le jour par défaut ; la semaine ailleurs. */
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'day' : 'week'))
  const [anchor, setAnchor] = useState(() => now())
  const [dayMenu, setDayMenu] = useState(false)
  const [mapOn, setMapOn] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedDay, setFocusedDay] = useState<string | null>(null)
  const [frame, setFrame] = useState<{ points: LatLng[]; key: string } | null>(null)
  const today = now()

  const { days, from, to } = useMemo(() => {
    if (view === 'day') {
      const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
      return { days: [start], from: start, to: addDays(start, 1) }
    }
    if (view === 'week') {
      const start = startOfWeek(anchor)
      return { days: Array.from({ length: 7 }, (_, i) => addDays(start, i)), from: start, to: addDays(start, 7) }
    }
    const start = monthGridStart(anchor)
    return { days: Array.from({ length: MONTH_GRID_DAYS }, (_, i) => addDays(start, i)), from: start, to: addDays(start, MONTH_GRID_DAYS) }
  }, [view, anchor])

  const events = useCoreValue(() => getCalendarEvents(from, to))
  const due = useCoreValue(() => getDueTasks(from, to))

  const byDay = useMemo(() => {
    const map = new Map<string, AgendaEvent[]>()
    for (const event of events) {
      const key = localDayKey(new Date(event.at))
      const list = map.get(key)
      if (list) list.push(event)
      else map.set(key, [event])
    }
    for (const list of map.values()) list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    return map
  }, [events])

  /** AB3.2 — the marker number is the rank within its own day. */
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

  const selectedId = panel && panel.mode !== 'new' ? panel.ref.id : null

  const open = (event: AgendaEvent): void => {
    onPanel({ mode: 'view', ref: { kind: event.kind, id: event.id } })
    if (event.position && mapOn) setFrame({ points: [event.position], key: `${event.id}-${Date.now()}` })
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
            { onHover: setHoveredId, onSelect: () => open(event) },
          ),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, rankOf, hoveredId, selectedId, locale, mapOn],
  )

  const focusDay = (day: Date): void => {
    const key = localDayKey(day)
    setFocusedDay(key)
    const points = (byDay.get(key) ?? []).map((e) => e.position).filter((p): p is LatLng => p !== null)
    if (points.length > 0) setFrame({ points, key: `${key}-${Date.now()}` })
  }

  const step = (direction: number): void =>
    setAnchor((d) => (view === 'day' ? addDays(d, direction) : view === 'week' ? addDays(d, 7 * direction) : addMonths(d, direction)))

  /** ★★ BE — toucher un créneau vide : un rendez-vous d'une heure, au quart d'heure. */
  const createAt = (day: Date, minute: number): void => {
    const at = atTimeOn(day, Math.floor(minute / 60), minute % 60)
    onPanel({ mode: 'new', at, endAt: new Date(Date.parse(at) + 3_600_000).toISOString(), link: null })
  }

  /** AF4.1 · BE — déplacer : la durée est conservée. */
  const moveOnGrid = (event: AgendaEvent, day: Date, startMinute: number): void => {
    if (event.kind === 'visit') {
      const visit = getFarmVisit(event.id)
      if (!visit) return
      const { at } = movedSpan(visit.at, visit.at, day, startMinute)
      runUndoable(t('agenda.movedToast', { when: `${formatWeekdayShort(day, locale)} ${formatTime(at, locale)}` }), () => updateFarmVisit(event.id, { ...visit, at }))
      return
    }
    const meeting = getGeneralMeeting(event.id)
    if (!meeting) return
    const span = movedSpan(meeting.at, meeting.endAt, day, startMinute)
    runUndoable(t('agenda.movedToast', { when: `${formatWeekdayShort(day, locale)} ${formatTime(span.at, locale)}` }), () => updateGeneralMeeting(event.id, span))
  }

  /** ★★ BE — allonger par le bord inférieur. */
  const resizeOnGrid = (event: AgendaEvent, endMinute: number): void => {
    const meeting = getGeneralMeeting(event.id)
    if (!meeting) return
    const endAt = resizedEnd(meeting.at, endMinute)
    runUndoable(t('agenda.resizedToast', { when: formatTime(endAt, locale) }), () => updateGeneralMeeting(event.id, { endAt }))
  }

  /** G6.4 — the month cells: drop onto another day keeps the hour. */
  const dropOnDay = (payload: string, day: Date): void => {
    const [kind, id] = payload.split(':')
    if (kind === 'visit') {
      const visit = getFarmVisit(id)
      if (visit) moveOnGrid({ kind: 'visit', id } as AgendaEvent, day, new Date(visit.at).getHours() * 60 + new Date(visit.at).getMinutes())
    } else if (kind === 'meeting') {
      const meeting = getGeneralMeeting(id)
      if (meeting) moveOnGrid({ kind: 'meeting', id } as AgendaEvent, day, new Date(meeting.at).getHours() * 60 + new Date(meeting.at).getMinutes())
    }
  }

  const draft: AgendaDraft | null =
    panel?.mode === 'new'
      ? (() => {
          const s = new Date(panel.at)
          const e = new Date(panel.endAt)
          const fromMin = s.getHours() * 60 + s.getMinutes()
          return { dayKey: localDayKey(s), from: fromMin, to: Math.max(fromMin + 15, isSameDay(s, e) ? e.getHours() * 60 + e.getMinutes() : 24 * 60), label: t('agenda.newEvent') }
        })()
      : null

  const periodLabel = view === 'day' ? formatDate(days[0].toISOString(), locale) : view === 'week' ? formatMonthYear(days[0], locale) : formatMonthYear(addDays(from, 10), locale)
  const unplaced = events.filter((e) => e.position === null && !e.reflection)

  return (
    <div data-testid="agenda-panel" data-view={view} className="flex h-full min-h-0 flex-col px-3 pb-[var(--float-reserve)] pt-4 md:px-4">
      <header className="mb-2 flex items-center gap-2">
        <TitleWithInfo as="span" info={t('agenda.subtitle')} className="text-title text-content-primary">
          <h1>{t('agenda.title')}</h1>
        </TitleWithInfo>
      </header>

      <div data-testid="agenda-controls" className="mb-3 flex flex-wrap items-center gap-2 rounded-card bg-surface-overlay p-2 shadow-card">
        <div className="flex items-center gap-1">
          <button type="button" aria-label={t('agenda.previous')} onClick={() => step(-1)} className="flex h-11 w-11 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high hover:text-content-primary">
            <Icon name="chevron" size={16} className="ltr:-scale-x-100" />
          </button>
          <button type="button" onClick={() => setAnchor(now())} className="filter-pill min-h-11">
            {t('common.today')}
          </button>
          <button type="button" aria-label={t('agenda.next')} onClick={() => step(1)} className="flex h-11 w-11 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high hover:text-content-primary">
            <Icon name="chevron" size={16} className="rtl:-scale-x-100" />
          </button>
        </div>
        <p className="text-caption font-semibold text-content-primary" data-testid="agenda-period">{periodLabel}</p>
        <div className="pill-row ms-auto" data-testid="agenda-views">
          {(['day', 'week', 'month'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} data-view={v} className={`filter-pill min-h-11 ${view === v ? 'filter-pill-active' : ''}`}>
              {t(`agenda.${v}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={mapOn}
          data-testid="agenda-map-toggle"
          onClick={() => setMapOn((v) => !v)}
          className={`filter-pill min-h-11 ${mapOn ? 'filter-pill-active' : ''}`}
          title={t('agenda.mapToggle')}
        >
          <Icon name="map" size={15} />
          <span className="sr-only md:not-sr-only">{t('agenda.mapToggle')}</span>
        </button>
        <div className="relative">
          <button type="button" aria-expanded={dayMenu} data-testid="agenda-day-menu" onClick={() => setDayMenu((v) => !v)} className="filter-pill min-h-11" aria-label={t('agenda.addOther')} title={t('agenda.addOther')}>
            <Icon name="plus" size={15} />
          </button>
          {dayMenu && (
            <>
              <button type="button" aria-label={t('common.close')} className="fixed inset-0 z-20 cursor-default" onClick={() => setDayMenu(false)} />
              <DayMenu day={days[0]} onClose={() => setDayMenu(false)} />
            </>
          )}
        </div>
      </div>

      {/* ★ AB3 — la carte de la période, d'un toucher, au-dessus de la grille. */}
      {mapOn && (
        <div className="relative mb-3 h-[32dvh] min-h-48 shrink-0 overflow-hidden rounded-card shadow-card" data-testid="agenda-map">
          <MapView
            ariaLabel={t('map.agendaMap')}
            className="h-full w-full"
            markers={markers}
            frameTo={frame ? { points: frame.points, key: frame.key, maxZoom: 13 } : undefined}
          />
          {unplaced.length > 0 && (
            <p className="absolute inset-x-2 bottom-2 rounded-field bg-surface-overlay/90 px-2 py-1 text-micro text-content-secondary" data-testid="agenda-unplaced" data-count={unplaced.length}>
              <Icon name="alert" size={12} className="me-1 inline text-status-warn-ink" />
              {t('agenda.missingPosition')} · {unplaced.length}
            </p>
          )}
        </div>
      )}

      {/* G9 — the day as it will be DRIVEN, above the day as it is booked. */}
      {view === 'day' && !phone && (
        <div className="mb-3 shrink-0">
          <MyDayBlock dayKey={localDayKey(days[0])} />
        </div>
      )}

      {view === 'month' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-7 gap-1.5">
            {days.slice(0, 7).map((d) => (
              <div key={`head-${d.toISOString()}`} className="pb-1 text-center text-micro font-semibold uppercase tracking-wide text-content-muted">
                {formatWeekdayShort(d, locale)}
              </div>
            ))}
            {days.map((day) => {
              const key = localDayKey(day)
              const dayEvents = byDay.get(key) ?? []
              const dayDue = due.get(key) ?? []
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
                  className={`relative flex min-h-24 flex-col rounded-field border p-1.5 ${isToday ? 'border-accent bg-accent/5' : 'border-edge-subtle bg-surface-raised'} ${outside ? 'opacity-45' : ''}`}
                >
                  <button
                    type="button"
                    data-testid="agenda-day-head"
                    data-day={key}
                    data-today={isToday ? '1' : undefined}
                    onClick={() => {
                      focusDay(day)
                      setAnchor(day)
                      setView('day')
                    }}
                    className={`numeric mb-1 self-start rounded-field px-1 text-caption font-bold hover:bg-surface-high ${isToday ? 'text-accent-ink' : 'text-content-primary'}`}
                  >
                    {day.getDate()}
                  </button>
                  {dayDue.length > 0 && (
                    <span className="mb-0.5 flex items-center gap-1 text-micro text-content-muted" data-testid="agenda-due" data-day={key} data-count={dayDue.length}>
                      <span aria-hidden className="h-2 w-2 rounded-[2px] border border-content-muted" />
                      {dayDue.length}
                    </span>
                  )}
                  <div className="flex flex-1 flex-col gap-1">
                    {dayEvents.slice(0, 2).map((event) => {
                      const tone = toneOf(event)
                      return (
                        <button
                          key={event.id}
                          type="button"
                          data-testid="agenda-event"
                          data-event-id={event.id}
                          data-kind={event.kind}
                          data-reflection={event.reflection ? '1' : undefined}
                          data-selected={selectedId === event.id ? '1' : undefined}
                          draggable={canMove(event)}
                          onDragStart={(e) => e.dataTransfer.setData('text/plain', `${event.kind}:${event.id}`)}
                          onClick={() => open(event)}
                          className={`w-full rounded-field border-s-[3px] px-1.5 py-1 text-start ${tone.block} ${event.reflection ? 'agenda-reflection' : ''} ${selectedId === event.id ? 'ring-2 ring-accent' : ''}`}
                        >
                          <span className="flex items-center gap-1">
                            <Icon name={tone.icon} size={10} />
                            <span className="ltr-nums text-micro font-semibold">{formatTime(event.at, locale)}</span>
                          </span>
                          <span className={`mt-0.5 block truncate text-micro font-medium ${event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''}`}>
                            {event.title || (event.kind === 'tour' ? t('agenda.tourUntitled') : '')}
                          </span>
                        </button>
                      )
                    })}
                    {dayEvents.length > 2 && <span className="numeric text-micro text-content-muted">+{dayEvents.length - 2}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <AgendaGrid
          days={days}
          byDay={byDay}
          today={today}
          stretch={stretch}
          phone={phone}
          toneOf={toneOf}
          selectedId={selectedId}
          onSelect={open}
          onFocusDay={focusDay}
          focusedDay={focusedDay}
          onCreateAt={createAt}
          onMove={moveOnGrid}
          canMove={canMove}
          onResize={resizeOnGrid}
          canResize={canResize}
          dueByDay={due}
          onOpenTask={onOpenTask}
          draft={draft}
        />
      )}
    </div>
  )
}
