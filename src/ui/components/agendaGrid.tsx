import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  SNAP_MINUTES,
  formatTime,
  formatWeekdayShort,
  isSameDay,
  layOutDay,
  localDayKey,
  minuteAtOffset,
  snapMinute,
} from '@core/index'
import type { AgendaEvent, Task } from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'
import { useLocale } from '../hooks/useLocale'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB4 (2026-09-08) — THE AGENDA LOOKS LIKE AN AGENDA.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * An HOUR LADDER, and the ladder is the geometry:
 *
 *     top    = (minutes since 00:00) / 60 × hour
 *     height = duration in minutes    / 60 × hour, floored so a
 *              point-in-time visit is still a readable block
 *
 * ⚠️ TWENTY-FOUR HOURS, NOT SIX-TO-MIDNIGHT: this programme's subject is NIGHT
 *    guards. The SCROLL opens at `OPEN_AT`, and midnight is one flick above.
 * ★ The hours stretch only when the agenda has the screen to itself; elsewhere
 *   the hour keeps a legible fixed band and the ladder scrolls.
 *
 * ★★ BE (2026-10-13) — « NE REFAIS PAS LA GRILLE, ELLE CONVIENT. » La grille
 * ci-dessous est celle d'AB4. Ce qui change est la MANIPULATION :
 *   · toucher un créneau vide CRÉE un rendez-vous au quart d'heure touché
 *     (`onCreateAt`) — plus de menu intermédiaire ;
 *   · le glisser-déposer est franc (voir la note au-dessus de `HOLD_MS`) ;
 *   · le BORD INFÉRIEUR d'un rendez-vous allonge (ou raccourcit) sa durée ;
 *   · un REFLET (garde, itinéraire) se dessine à part — hachuré, bord en
 *     tirets, la flèche de sa source — et ne se déplace pas ;
 *   · les tâches datées se posent EN HAUT DU JOUR, sous son nom, discrètes.
 */

/** `HH:MM` d'une minute du jour — l'heure que le bloc annonce pendant qu'on le déplace. */
function clockLabel(minute: number): string {
  const m = Math.max(0, Math.min(24 * 60, minute))
  const h = Math.floor(m / 60)
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Where the scroll opens. Not midnight — the day starts being worked at 06. */
const OPEN_AT = 6
/** Below this an hour band cannot carry a label, let alone an event. */
const MIN_HOUR = 30
/** A ladder in a narrow panel scrolls rather than squeezes. */
const SPLIT_HOUR = 52
/**
 * ★★ BE — AU TÉLÉPHONE, L'HEURE FAIT 56 PX. Un quart d'heure y vaut 14 px :
 * c'est ce qui rend le pas du glisser-déposer atteignable au pouce (à 30 px
 * l'heure, il en valait 7).
 */
const PHONE_HOUR = 56

export interface AgendaTone {
  /** Tailwind classes for the block. */
  block: string
  dot: string
  icon: IconName
}

/**
 * How tall an hour is, and whether the ladder scrolls.
 * ⚠️ `useLayoutEffect` FOR THE FIRST MEASUREMENT, then a ResizeObserver: the
 *    opening scroll position is computed FROM the hour height.
 */
function useHourHeight(stretch: boolean, fixed: number): {
  ref: (node: HTMLElement | null) => void
  hour: number
} {
  const [hour, setHour] = useState(stretch ? MIN_HOUR : fixed)
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
    const measure = (): void => setHour(stretch ? Math.max(MIN_HOUR, el.clientHeight / 24) : fixed)
    measure()
    observer.current = new ResizeObserver(measure)
    observer.current.observe(el)
  }

  useLayoutEffect(() => {
    const el = node.current
    if (!el) return
    setHour(stretch ? Math.max(MIN_HOUR, el.clientHeight / 24) : fixed)
  }, [stretch, fixed])

  return { ref, hour }
}

/** Minutes since midnight, ticking — the "now" line. */
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

/** ★★ BE — le rendez-vous en cours de création, dessiné en pointillé à sa place. */
export interface AgendaDraft {
  dayKey: string
  from: number
  to: number
  label: string
}

export interface AgendaGridProps {
  /** One column per day: 1 in the day view, 7 in the week view. */
  days: Date[]
  byDay: Map<string, AgendaEvent[]>
  today: Date
  /** True when the agenda has the whole screen. */
  stretch: boolean
  /** ★★ BE — le téléphone : l'heure fixe à `PHONE_HOUR`. */
  phone?: boolean
  toneOf: (event: AgendaEvent) => AgendaTone
  selectedId: string | null
  onSelect: (event: AgendaEvent) => void
  /** AB3.3 — the day header is also "put the map on this day". */
  onFocusDay: (day: Date) => void
  focusedDay: string | null
  /** ★★ BE — un toucher sur un créneau vide : le jour et la minute (au quart d'heure). */
  onCreateAt: (day: Date, minute: number) => void
  /** ★★ AF4.1 · BE — déplacer : le jour et la minute de début voulus. */
  onMove?: (event: AgendaEvent, day: Date, startMinute: number) => void
  /** Dit si CE bloc se déplace. Absent = aucun ne se déplace. Un reflet, jamais. */
  canMove?: (event: AgendaEvent) => boolean
  /** ★★ BE — allonger par le bord inférieur : la minute de fin voulue. */
  onResize?: (event: AgendaEvent, endMinute: number) => void
  canResize?: (event: AgendaEvent) => boolean
  /** ★★ BE — les tâches datées, par jour, en haut de la colonne. */
  dueByDay?: Map<string, Task[]>
  onOpenTask?: (task: Task) => void
  draft?: AgendaDraft | null
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF4.1 · BE (2026-10-13) — LE GLISSER-DÉPOSER, FRANC, AU DOIGT COMME À LA
 *    SOURIS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO y arrivait « très compliqué, très complexe ». Trois causes, trouvées
 * en relisant le geste d'AF4.1 contre ce que fait un téléphone :
 *
 *   1. ⚠️ `touch-action` POSÉ APRÈS L'APPUI NE SERT À RIEN. Le navigateur lit
 *      `touch-action` au moment où le doigt se pose ; le poser à l'armement
 *      (AF4.1) laissait le défilement décider au premier mouvement — la page
 *      partait, le navigateur envoyait `pointercancel`, le bloc revenait à sa
 *      place. Désormais un `touchmove` NON PASSIF, posé une fois sur le
 *      document, refuse le défilement tant qu'un bloc est armé.
 *   2. ⚠️ L'APPUI LONG D'iOS sélectionnait le texte du bloc (la loupe, le menu
 *      « Copier »). Les blocs sont `select-none` et sans menu de rappel.
 *   3. ⚠️ À LA SOURIS, IL FALLAIT AUSSI TENIR 280 ms. Une souris ne fait pas
 *      défiler en glissant : elle s'arme au premier mouvement (4 px).
 *
 * ★ CE QUI RESTE D'AF4.1 : au doigt, un appui maintenu (`HOLD_MS`) arme le
 *   déplacement — un glissement AVANT ce délai est un défilement de la grille.
 *   Armé : une vibration courte (là où le téléphone la permet), le bloc se
 *   soulève, son ancienne place reste en pointillé, et il annonce son heure
 *   (« 14:30–16:00 ») à chaque quart d'heure franchi. Au bord haut ou bas de
 *   la grille, elle défile d'elle-même.
 * ★ LE BORD INFÉRIEUR : une bande de 14 px au pied du bloc (`touch-action:
 *   none`, donc sans appui long) qui allonge ou raccourcit, au quart d'heure.
 * ★ Un clic qui SUIT un glissement ne compte pas (il ouvrirait le bloc).
 */
const HOLD_MS = 250
/** Au-delà de ce déplacement avant l'armement, au doigt, c'est un défilement. */
const SLOP_PX = 8
/** À la souris ou au stylet, le geste s'arme à ce déplacement. */
const MOUSE_ARM_PX = 4
/** La bande, au pied d'un bloc, qui allonge sa durée. */
const RESIZE_PX = 14
/** La marge, en haut et en bas de la grille, où elle défile d'elle-même. */
const EDGE_PX = 44

interface DragState {
  id: string
  mode: 'move' | 'resize'
  /** Colonne visée, en index de `days`. */
  dayIndex: number
  /** Minute de début visée (déplacement) — au pas. */
  startMinute: number
  /** Minute de fin visée — au pas. */
  endMinute: number
}

interface Gesture {
  event: AgendaEvent
  mode: 'move' | 'resize'
  pointerId: number
  touch: boolean
  startX: number
  startY: number
  startScroll: number
  from: number
  to: number
  dayIndex: number
  armed: boolean
  timer: number
  element: HTMLElement
}

export function AgendaGrid({
  days,
  byDay,
  today,
  stretch,
  phone = false,
  toneOf,
  selectedId,
  onSelect,
  onFocusDay,
  focusedDay,
  onCreateAt,
  onMove,
  canMove,
  onResize,
  canResize,
  dueByDay,
  onOpenTask,
  draft,
}: AgendaGridProps) {
  const { t } = useTranslation()
  const locale = useLocale()
  const { ref: boxRef, hour } = useHourHeight(stretch && !phone, phone ? PHONE_HOUR : SPLIT_HOUR)
  const nowMinute = useMinuteOfDay()
  const scroller = useRef<HTMLDivElement | null>(null)
  const opened = useRef(false)

  /**
   * AB4.3 — the scroll opens on the working hours, once.
   * ⚠️ ★★ BE — UNE GRILLE MONTÉE CACHÉE (le volet de l'agenda au téléphone,
   *    quand c'est celui des tâches qui est ouvert) a une hauteur nulle : elle
   *    ne « s'ouvre » qu'au premier instant où elle a une hauteur, sinon elle
   *    restait à minuit.
   */
  const openOnce = (): void => {
    const el = scroller.current
    if (!el || opened.current || hour <= 0 || el.clientHeight === 0) return
    if (el.scrollHeight > el.clientHeight + 1) el.scrollTop = OPEN_AT * hour
    opened.current = true
  }
  useLayoutEffect(openOnce, [hour])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => openOnce())
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hour])

  /** ★★ BE — le bloc ouvert (ou le créneau en création) est amené à l'écran. */
  useEffect(() => {
    const el = scroller.current
    if (!el || el.clientHeight === 0) return
    const target = selectedId
      ? el.querySelector<HTMLElement>(`[data-event-id="${CSS.escape(selectedId)}"]`)
      : draft
        ? el.querySelector<HTMLElement>('[data-testid="agenda-draft"]')
        : null
    if (!target) return
    /* Le haut de la fenêtre de la grille, sous ses en-têtes collés : c'est là
       que le bloc doit être — au téléphone, la feuille couvre le bas. */
    const head = el.querySelector<HTMLElement>('.sticky')?.getBoundingClientRect().height ?? 0
    const rel = target.getBoundingClientRect().top - el.getBoundingClientRect().top - head
    if (rel < 4 || rel > 96) el.scrollTo({ top: Math.max(0, el.scrollTop + rel - 12), behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, draft?.dayKey, draft?.from])

  const ladder = Array.from({ length: 24 }, (_, i) => i)
  const height = hour * 24

  // -------------------------------------------------------------------------
  // Le geste. Voir la note au-dessus de `HOLD_MS`.
  // -------------------------------------------------------------------------
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClick = useRef(false)

  const put = (next: DragState | null): void => {
    dragRef.current = next
    setDrag(next)
  }

  /* ★ 1 — le défilement est refusé tant qu'un bloc est armé (voir l'en-tête). */
  useEffect(() => {
    const block = (e: TouchEvent): void => {
      if (gesture.current?.armed) e.preventDefault()
    }
    document.addEventListener('touchmove', block, { passive: false })
    return () => document.removeEventListener('touchmove', block)
  }, [])

  /** Colonne sous une abscisse écran, ou l'actuelle si le doigt sort de la grille. */
  const columnAt = (clientX: number, fallback: number): number => {
    const columns = scroller.current?.querySelectorAll('[data-testid="agenda-column"]')
    if (!columns) return fallback
    for (let i = 0; i < columns.length; i++) {
      const r = columns[i].getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right) return i
    }
    return fallback
  }

  /** L'index de colonne où ce bloc est actuellement dessiné. */
  const columnIndexOf = (event: AgendaEvent): number => {
    const key = localDayKey(new Date(event.at))
    const i = days.findIndex((d) => localDayKey(d) === key)
    return i === -1 ? 0 : i
  }

  const arm = (g: Gesture): void => {
    g.armed = true
    try {
      g.element.setPointerCapture(g.pointerId)
    } catch {
      // Un pointeur déjà relâché : le geste se terminera de lui-même.
    }
    try {
      if (g.touch) navigator.vibrate?.(8)
    } catch {
      // Pas de vibreur : rien à dire.
    }
    put({ id: g.event.id, mode: g.mode, dayIndex: g.dayIndex, startMinute: g.from, endMinute: g.to })
  }

  const begin = (e: React.PointerEvent<HTMLElement>, event: AgendaEvent, from: number, to: number, mode: 'move' | 'resize'): void => {
    const allowed = mode === 'move' ? Boolean(onMove) && (canMove?.(event) ?? false) : Boolean(onResize) && (canResize?.(event) ?? false)
    if (!allowed) return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    if (mode === 'resize') e.stopPropagation()
    const touch = e.pointerType === 'touch'
    const g: Gesture = {
      event,
      mode,
      pointerId: e.pointerId,
      touch,
      startX: e.clientX,
      startY: e.clientY,
      startScroll: scroller.current?.scrollTop ?? 0,
      from,
      to,
      dayIndex: columnIndexOf(event),
      armed: false,
      timer: 0,
      element: e.currentTarget,
    }
    /* Au doigt, le DÉPLACEMENT s'arme par l'appui maintenu ; le bord inférieur
       est `touch-action: none`, il s'arme au premier mouvement comme la souris. */
    if (touch && mode === 'move') g.timer = window.setTimeout(() => arm(g), HOLD_MS)
    gesture.current = g
  }

  const autoScroll = (clientY: number): void => {
    const el = scroller.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (clientY < r.top + EDGE_PX) el.scrollTop -= 10
    else if (clientY > r.bottom - EDGE_PX) el.scrollTop += 10
  }

  const onPointerMove = (e: React.PointerEvent<HTMLElement>): void => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    const dx = e.clientX - g.startX
    const dyScreen = e.clientY - g.startY
    if (!g.armed) {
      const far = Math.abs(dx) > SLOP_PX || Math.abs(dyScreen) > SLOP_PX
      if (g.touch && g.mode === 'move') {
        /* Un mouvement avant l'armement est un défilement : on rend la main. */
        if (far) {
          window.clearTimeout(g.timer)
          gesture.current = null
        }
        return
      }
      if (Math.abs(dx) > MOUSE_ARM_PX || Math.abs(dyScreen) > MOUSE_ARM_PX) arm(g)
      else return
    }
    autoScroll(e.clientY)
    const dy = dyScreen + ((scroller.current?.scrollTop ?? 0) - g.startScroll)
    const deltaMinutes = Math.round(((dy / hour) * 60) / SNAP_MINUTES) * SNAP_MINUTES
    if (g.mode === 'move') {
      const duration = g.to - g.from
      const startMinute = snapMinute(g.from + deltaMinutes)
      put({ id: g.event.id, mode: 'move', dayIndex: columnAt(e.clientX, g.dayIndex), startMinute, endMinute: startMinute + duration })
    } else {
      const endMinute = Math.max(g.from + SNAP_MINUTES, Math.min(24 * 60, g.to + deltaMinutes))
      put({ id: g.event.id, mode: 'resize', dayIndex: g.dayIndex, startMinute: g.from, endMinute })
    }
  }

  const finish = (commit: boolean): void => {
    const g = gesture.current
    if (!g) return
    window.clearTimeout(g.timer)
    gesture.current = null
    const state = dragRef.current
    put(null)
    if (!g.armed) return
    /* Le clic qui suit un glissement n'ouvre pas le bloc. */
    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 350)
    if (!commit || !state) return
    if (state.mode === 'move') {
      if (state.startMinute === g.from && state.dayIndex === g.dayIndex) return
      onMove?.(g.event, days[state.dayIndex], state.startMinute)
    } else {
      if (state.endMinute === g.to) return
      onResize?.(g.event, state.endMinute)
    }
  }

  /** ★★ BE — le créneau touché, au quart d'heure (le clavier : l'heure pleine). */
  const createAt = (e: React.MouseEvent<HTMLButtonElement>, day: Date, h: number): void => {
    const column = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect()
    const minute = column && e.clientY > 0 ? minuteAtOffset(e.clientY - column.top, hour) : h * 60
    onCreateAt(day, minute)
  }

  const showDue = !!dueByDay && days.some((d) => (dueByDay.get(localDayKey(d)) ?? []).length > 0)

  return (
    <div
      ref={(node) => {
        scroller.current = node
        boxRef(node)
      }}
      data-testid="agenda-grid"
      data-hour-height={Math.round(hour)}
      data-dragging={drag ? drag.mode : undefined}
      /* `min-h-0` + `flex-1` on the parent is what makes "the whole useful
         height" mean the box rather than the content (AB4.1). */
      className="relative min-h-0 flex-1 overflow-y-auto rounded-card bg-surface-raised shadow-card"
    >
      {/* The weekday header rides the top of the scroller. */}
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
              <span className="text-micro text-content-muted">{formatWeekdayShort(day, locale)}</span>
              <span
                className={`numeric flex h-6 min-w-6 items-center justify-center rounded-pill px-1 text-caption font-bold ${
                  isToday ? 'bg-accent text-content-on-accent' : 'text-content-primary'
                }`}
              >
                {day.getDate()}
              </span>
              {count > 0 && <span className="numeric text-micro text-content-muted">{count}</span>}
            </button>
          )
        })}

        {/**
          * ★★ BE — « UNE TÂCHE AVEC ÉCHÉANCE APPARAÎT EN HAUT DU JOUR DANS
          * L'AGENDA, DISCRÈTEMENT, ET NON COMME UN RENDEZ-VOUS. » Une rangée
          * sous les noms des jours, seulement quand la période en a : une case
          * vide et le titre, en petit ; au-delà de deux, « +N ».
          */}
        {showDue && (
          <>
            <span aria-hidden="true" className="border-t border-edge-subtle" />
            {days.map((day) => {
              const key = localDayKey(day)
              const due = dueByDay?.get(key) ?? []
              const shown = days.length > 1 ? due.slice(0, 2) : due.slice(0, 4)
              return (
                <div key={`due-${key}`} data-testid="agenda-due" data-day={key} data-count={due.length} className="flex min-w-0 flex-col gap-0.5 border-s border-t border-edge-subtle p-0.5">
                  {shown.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      data-testid="agenda-due-task"
                      data-task-id={task.id}
                      onClick={() => onOpenTask?.(task)}
                      className="flex min-h-7 min-w-0 items-center gap-1 rounded-field px-1 text-start text-micro text-content-secondary hover:bg-surface-high"
                    >
                      <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px] border border-content-muted" />
                      {task.dueTime && <span className="ltr-nums shrink-0 font-semibold">{task.dueTime}</span>}
                      <span className="min-w-0 truncate">{task.title}</span>
                    </button>
                  ))}
                  {due.length > shown.length && <span className="numeric px-1 text-micro text-content-muted">+{due.length - shown.length}</span>}
                </div>
              )
            })}
          </>
        )}
      </div>

      <div
        className="relative grid"
        style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))`, height: `${height}px` }}
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

        {days.map((day, dayIndex) => {
          const key = localDayKey(day)
          const isToday = isSameDay(day, today)
          const laid = layOutDay(byDay.get(key) ?? [], day)
          const draftHere = draft && draft.dayKey === key ? draft : null
          return (
            <div
              key={key}
              data-testid="agenda-column"
              data-day={key}
              className={`relative border-s border-edge-subtle ${isToday ? 'bg-accent/5' : ''} ${
                drag?.mode === 'move' && drag.dayIndex === dayIndex ? 'bg-accent/10' : ''
              }`}
            >
              {/* The hour lines, and each band creates — at the quarter touched. */}
              {ladder.map((h) => (
                <button
                  key={h}
                  type="button"
                  data-testid="agenda-slot"
                  data-hour={h}
                  aria-label={t('agenda.createAt', { when: `${formatWeekdayShort(day, locale)} ${String(h).padStart(2, '0')}:00` })}
                  onClick={(e) => createAt(e, day, h)}
                  className="absolute inset-x-0 border-t border-edge-subtle/60 hover:bg-accent/5"
                  style={{ top: `${h * hour}px`, height: `${hour}px` }}
                />
              ))}

              {/* ★★ BE — le rendez-vous en cours de création, en pointillé. */}
              {draftHere && (
                <div
                  data-testid="agenda-draft"
                  className="pointer-events-none absolute inset-x-0.5 z-10 flex flex-col rounded-field border-2 border-dashed border-accent bg-accent/15 px-1.5 py-0.5"
                  style={{ top: `${(draftHere.from / 60) * hour}px`, height: `${Math.max(18, ((draftHere.to - draftHere.from) / 60) * hour - 2)}px` }}
                >
                  <span className="ltr-nums text-micro font-semibold text-accent-ink">
                    {clockLabel(draftHere.from)}–{clockLabel(draftHere.to)}
                  </span>
                  <span className="truncate text-micro font-medium text-accent-ink">{draftHere.label}</span>
                </div>
              )}

              {laid.map(({ event, from, to, lane, lanes }) => {
                const tone = toneOf(event)
                const selected = selectedId === event.id
                const reflection = event.reflection === true
                const dragging = drag?.id === event.id
                const movable = !reflection && Boolean(onMove) && (canMove?.(event) ?? false)
                const resizable = !reflection && Boolean(onResize) && (canResize?.(event) ?? false)
                const shownFrom = dragging ? drag.startMinute : from
                const shownTo = dragging ? drag.endMinute : to
                const boxHeight = ((shownTo - shownFrom) / 60) * hour
                /* ⚠️ A SHORT BLOCK PUTS THE HOUR AND THE NAME ON ONE LINE. */
                const compact = boxHeight < 34
                /* ⚠️ A BLOCK THAT SHARES ITS COLUMN IS NARROW: the name wins. */
                const shared = lanes > 1 && !dragging
                const title = event.title || (event.kind === 'tour' ? t('agenda.tourUntitled') : '')
                const hourLabel = dragging ? `${clockLabel(shownFrom)}–${clockLabel(shownTo)}` : formatTime(event.at, locale)
                return (
                  <div key={event.id} className="contents">
                    {/* ★★ BE — pendant le geste, l'ancienne place reste en pointillé. */}
                    {dragging && (
                      <div
                        aria-hidden
                        data-testid="agenda-ghost"
                        className="pointer-events-none absolute rounded-field border-2 border-dashed border-content-muted/60"
                        style={{
                          top: `${(from / 60) * hour}px`,
                          height: `${Math.max(18, ((to - from) / 60) * hour - 2)}px`,
                          insetInlineStart: `calc(${(lane / lanes) * 100}% + 2px)`,
                          width: `calc(${100 / lanes}% - 4px)`,
                        }}
                      />
                    )}
                    <button
                      type="button"
                      data-testid="agenda-event"
                      data-event-id={event.id}
                      data-kind={event.kind}
                      data-reflection={reflection ? '1' : undefined}
                      data-lane={lane}
                      data-lanes={lanes}
                      data-movable={movable ? '1' : undefined}
                      data-resizable={resizable ? '1' : undefined}
                      data-dragging={dragging ? '1' : undefined}
                      data-selected={selected ? '1' : undefined}
                      onPointerDown={(e) => begin(e, event, from, to, 'move')}
                      onPointerMove={onPointerMove}
                      onPointerUp={() => finish(true)}
                      onPointerCancel={() => finish(false)}
                      onContextMenu={(e) => {
                        if (movable) e.preventDefault()
                      }}
                      title={reflection ? t('agenda.reflectionHint') : title}
                      onClick={() => {
                        if (suppressClick.current) return
                        onSelect(event)
                      }}
                      /* ⚠️ `flex flex-col justify-start`: a `<button>` centres its
                         content by default, which drew a guard's hour mid-block.
                         ★★ BE — `select-none` + `[-webkit-touch-callout:none]` :
                         l'appui long d'iOS ne sélectionne plus le texte. */
                      className={`agenda-block absolute flex select-none flex-col justify-start overflow-hidden rounded-field
                                  border-s-[3px] py-0.5 text-start [-webkit-touch-callout:none] ${compact ? 'px-1' : 'px-1.5'}
                                  ${dragging ? '' : 'transition-all duration-fast ease-out'} hover:brightness-95 ${tone.block} ${
                                    reflection ? 'agenda-reflection' : ''
                                  } ${selected ? 'z-10 ring-2 ring-accent' : ''} ${movable ? 'cursor-grab' : ''}`}
                      style={{
                        top: `${(shownFrom / 60) * hour}px`,
                        height: `${Math.max(movable ? 24 : 18, boxHeight - 2)}px`,
                        insetInlineStart: dragging
                          ? `calc(${(drag.dayIndex - dayIndex) * 100}% + 2px)`
                          : `calc(${(lane / lanes) * 100}% + 2px)`,
                        width: dragging ? 'calc(100% - 4px)' : `calc(${100 / lanes}% - 4px)`,
                        zIndex: dragging ? 30 : undefined,
                        opacity: dragging ? 0.95 : undefined,
                        boxShadow: dragging ? '0 12px 32px rgb(0 0 0 / 0.28)' : undefined,
                        transform: dragging && drag.mode === 'move' ? 'scale(1.02)' : undefined,
                      }}
                    >
                      {shared ? (
                        <span className="flex min-w-0 items-center gap-1">
                          {reflection && <Icon name="external" size={9} className="shrink-0" />}
                          {event.position === null && !reflection && (
                            <Icon name="alert" size={9} className="shrink-0" aria-label={t('agenda.missingPosition')} />
                          )}
                          <span className={`min-w-0 truncate text-micro font-semibold ${event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''}`}>
                            {title}
                          </span>
                        </span>
                      ) : (
                        <>
                          <span className="flex min-w-0 items-center gap-1">
                            {!compact && <Icon name={tone.icon} size={9} className="shrink-0" />}
                            <span className={`ltr-nums shrink-0 text-micro font-semibold ${dragging ? 'rounded bg-surface-raised/80 px-0.5' : ''}`} data-testid={dragging ? 'agenda-drag-time' : undefined}>
                              {hourLabel}
                            </span>
                            {reflection && <Icon name="external" size={9} className="shrink-0" aria-label={t('agenda.reflection')} />}
                            {event.position === null && !reflection && (
                              <Icon name="alert" size={9} className="shrink-0" aria-label={t('agenda.missingPosition')} />
                            )}
                            {compact && (
                              <span className={`min-w-0 truncate text-micro font-medium ${event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''}`}>
                                {title}
                              </span>
                            )}
                          </span>
                          {!compact && (
                            <span className={`block truncate text-micro font-medium ${event.missionStatus === 'cancelled' ? 'line-through opacity-80' : ''}`}>
                              {title}
                            </span>
                          )}
                        </>
                      )}
                      {/* ★★ BE — le bord inférieur : il allonge la durée. */}
                      {resizable && !shared && (
                        <span
                          data-testid="agenda-resize"
                          aria-hidden
                          onPointerDown={(e) => begin(e, event, from, to, 'resize')}
                          className="absolute inset-x-0 bottom-0 flex cursor-ns-resize touch-none items-end justify-center"
                          style={{ height: `${RESIZE_PX}px` }}
                        >
                          <span className="mb-0.5 h-1 w-6 rounded-pill bg-current opacity-40" />
                        </span>
                      )}
                    </button>
                  </div>
                )
              })}

              {/**
                * ★★ AB4.3 — THE CURRENT HOUR, ON TODAY'S COLUMN ONLY, in the
                * accent (AL4.1: orange means urgency on this screen).
                */}
              {isToday && (
                <span
                  data-testid="agenda-now"
                  aria-label={t('agenda.nowLine')}
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: `${(nowMinute / 60) * hour}px` }}
                >
                  <span className="h-0.5 w-full bg-accent" />
                  <span className="absolute -start-1 h-2.5 w-2.5 rounded-pill bg-accent shadow-card" />
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
