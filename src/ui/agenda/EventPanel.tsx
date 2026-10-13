import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  addDays,
  agendaCanEdit,
  createGeneralMeeting,
  deleteFarmVisitChecked,
  deleteGeneralMeeting,
  formatCoords,
  formatDate,
  formatTime,
  formatWeekdayShort,
  getCalendarEvents,
  getFarmVisit,
  getGeneralMeeting,
  getMission,
  getTasks,
  getTours,
  isTaskOpen,
  meetingLink,
  meetingLinkPatch,
  positionParam,
  setTaskDone,
  tasksLinkedTo,
  updateFarmVisit,
  updateGeneralMeeting,
} from '@core/index'
import type { AgendaEvent, AgendaEventKind, AgendaLink, LatLng } from '@core/index'

import { DictationField, InlineActions, SelectField } from '../components/fields'
import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'
import { PositionLinkField } from '../components/PositionLinkField'
import { runUndoable } from '../components/UndoToast'
import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { REMINDER_CHOICES, downloadCalendarEvent } from '../reminders'
import { TaskQuickAdd } from '../tasks/TaskQuickAdd'
import { LinkChip, LinkPicker } from './links'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BE (2026-10-13) — OUVRIR UN ÉVÉNEMENT NE QUITTE PAS LE CALENDRIER.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Aujourd'hui, ouvrir un rendez-vous change de page et le calendrier
 * disparaît. Le PO veut le voir derrière pendant qu'il regarde ou modifie. »
 *
 * UN SEUL CONTENANT, trois états :
 *   · CONSULTER — le titre, le jour et l'heure, le lieu, la fiche reliée (un
 *     toucher l'ouvre), la note, le rappel, les tâches rattachées ;
 *   · MODIFIER — le MÊME panneau se remplit de champs (« עריכה ») ;
 *   · CRÉER — un créneau touché ouvre ce panneau, le curseur dans le titre ;
 *     seul le titre est obligatoire.
 * Où il vit : à côté du calendrier sur ordinateur et tablette (la colonne des
 * tâches lui cède la place le temps de l'ouvrir) ; au téléphone, dans la
 * feuille ancrée de BC, à deux crans. L'écran qui l'héberge décide ; ce
 * composant ne sait rien de la largeur.
 *
 * ★ UN REFLET (garde, itinéraire) SE CONSULTE ICI MAIS NE S'Y MODIFIE PAS : il
 *   dit d'où il vient, montre ses étapes, et « פתיחה ב… » mène à son écran
 *   d'origine en un geste.
 */

export interface EventRef {
  kind: AgendaEventKind
  id: string
}

export type PanelState =
  | { mode: 'view'; ref: EventRef }
  | { mode: 'edit'; ref: EventRef }
  | { mode: 'new'; at: string; endAt: string; link: AgendaLink | null; title?: string }

const KIND_ICON: Record<AgendaEventKind, IconName> = { mission: 'shield', visit: 'pin', meeting: 'users', tour: 'route' }

/** Le jour d'une date ISO, à minuit local. */
const dayOf = (iso: string): Date => {
  const d = new Date(iso)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** L'entrée d'agenda d'une référence, relue à chaque rendu : elle suit sa source. */
export function findCalendarEvent(ref: EventRef): AgendaEvent | null {
  let at: string | null = null
  if (ref.kind === 'meeting') at = getGeneralMeeting(ref.id)?.at ?? null
  else if (ref.kind === 'visit') at = getFarmVisit(ref.id)?.at ?? null
  else if (ref.kind === 'mission') at = getMission(ref.id)?.startAt ?? null
  else at = getTours().find((t) => `tour:${t.id}` === ref.id)?.departAt ?? null
  if (!at) return null
  const day = dayOf(at)
  return getCalendarEvents(day, addDays(day, 1)).find((e) => e.id === ref.id) ?? null
}

/** « ג׳ 14.10 · 16:00–18:30 » */
export function whenLabel(at: string, endAt: string, locale: string): string {
  const d = new Date(at)
  const span = endAt && endAt !== at ? `${formatTime(at, locale)}–${formatTime(endAt, locale)}` : formatTime(at, locale)
  /* L'heure dans un isolat GAUCHE-À-DROITE (U+2066 … U+2069) : « 14:30–16:00 »
     se lit comme partout ailleurs dans l'app (`.ltr-nums`), même au milieu
     d'une phrase en hébreu. */
  return `${formatWeekdayShort(d, locale)} ${formatDate(at, locale)} · \u2066${span}\u2069`
}

const toDateInput = (iso: string): string => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const toTimeInput = (iso: string): string => {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const fromInputs = (date: string, time: string): string => new Date(`${date}T${time || '00:00'}:00`).toISOString()

export function EventPanel({
  panel,
  onPanel,
  onClose,
  onOpenTask,
  bare = false,
}: {
  panel: PanelState
  onPanel: (next: PanelState) => void
  onClose: () => void
  onOpenTask?: (taskId: string) => void
  /** ★ Dans la feuille du téléphone : sa barre porte déjà le titre et la croix. */
  bare?: boolean
}) {
  const { t } = useTranslation()
  const event = useCoreValue(() => (panel.mode === 'new' ? null : findCalendarEvent(panel.ref)))

  if (panel.mode === 'new') {
    return (
      <PanelFrame bare={bare} title={t('agenda.newEvent')} icon="users" onClose={onClose} testState="new">
        <MeetingEditor
          seed={{ at: panel.at, endAt: panel.endAt, link: panel.link, title: panel.title ?? '' }}
          onSaved={(id) => onPanel({ mode: 'view', ref: { kind: 'meeting', id } })}
          onCancel={onClose}
        />
      </PanelFrame>
    )
  }

  if (!event) {
    return (
      <PanelFrame bare={bare} title={t('agenda.eventGone')} icon="alert" onClose={onClose} testState="gone">
        <p className="muted">{t('agenda.eventGoneHint')}</p>
      </PanelFrame>
    )
  }

  const title = event.title || (event.kind === 'tour' ? t('agenda.tourUntitled') : '')

  if (panel.mode === 'edit' && agendaCanEdit(event)) {
    return (
      <PanelFrame bare={bare} title={t('agenda.editEvent')} icon={KIND_ICON[event.kind]} onClose={onClose} testState="edit" eventId={event.id}>
        {event.kind === 'meeting' ? (
          <MeetingEditor meetingId={event.id} onSaved={() => onPanel({ mode: 'view', ref: panel.ref })} onCancel={() => onPanel({ mode: 'view', ref: panel.ref })} onDeleted={onClose} />
        ) : (
          <VisitEditor visitId={event.id} onSaved={() => onPanel({ mode: 'view', ref: panel.ref })} onCancel={() => onPanel({ mode: 'view', ref: panel.ref })} onDeleted={onClose} />
        )}
      </PanelFrame>
    )
  }

  return (
    <PanelFrame bare={bare} title={title} icon={KIND_ICON[event.kind]} onClose={onClose} testState="view" eventId={event.id} reflection={event.reflection === true}>
      <EventView event={event} onEdit={() => onPanel({ mode: 'edit', ref: panel.ref })} onClose={onClose} onOpenTask={onOpenTask} />
    </PanelFrame>
  )
}

function PanelFrame({
  title,
  icon,
  onClose,
  children,
  testState,
  eventId,
  reflection = false,
  bare = false,
}: {
  bare?: boolean
  title: string
  icon: IconName
  onClose: () => void
  children: React.ReactNode
  testState: string
  eventId?: string
  reflection?: boolean
}) {
  const { t } = useTranslation()
  return (
    <section
      data-testid="event-panel"
      data-state={testState}
      data-event-id={eventId}
      data-reflection={reflection ? '1' : undefined}
      aria-label={title}
      className="panel-scope flex flex-col"
    >
      <header className={bare ? 'sr-only' : 'mb-3 flex items-start gap-2'}>
        <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-field ${reflection ? 'agenda-reflection bg-surface-high' : 'bg-accent/10'} text-accent-ink`}>
          <Icon name={icon} size={18} />
        </span>
        <h2 dir="auto" className="min-w-0 flex-1 text-heading font-semibold leading-snug text-content-primary" data-testid="event-panel-title">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          data-testid="event-panel-close"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high"
        >
          <Icon name="close" size={18} />
        </button>
      </header>
      {children}
    </section>
  )
}

function Row({ icon, children, testId }: { icon: IconName; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex items-start gap-2 py-1.5" data-testid={testId}>
      <Icon name={icon} size={16} className="mt-0.5 shrink-0 text-content-muted" />
      <div className="min-w-0 flex-1 text-caption text-content-primary">{children}</div>
    </div>
  )
}

function EventView({ event, onEdit, onClose, onOpenTask }: { event: AgendaEvent; onEdit: () => void; onClose: () => void; onOpenTask?: (taskId: string) => void }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const meeting = useCoreValue(() => (event.kind === 'meeting' ? getGeneralMeeting(event.id) : null))
  const visit = useCoreValue(() => (event.kind === 'visit' ? getFarmVisit(event.id) : null))
  const tasks = useCoreValue(() => (event.kind === 'meeting' ? tasksLinkedTo(getTasks(), 'meeting', event.id) : []))
  const [adding, setAdding] = useState(false)
  const reflection = event.reflection === true
  const remind = meeting?.remindMinutes ?? visit?.remindMinutes ?? null

  return (
    <div className="flex flex-col">
      {reflection && (
        <p className="mb-2 rounded-field bg-surface-high px-3 py-2 text-micro text-content-secondary" data-testid="event-reflection-note">
          <Icon name="external" size={12} className="me-1 inline" />
          {t(event.kind === 'tour' ? 'agenda.reflectionTour' : 'agenda.reflectionMission')}
        </p>
      )}
      <Row icon="clock" testId="event-when">
        <span className="numeric">{whenLabel(event.at, event.endAt, locale)}</span>
        {event.kind === 'tour' && <span className="muted ms-1">{t('agenda.tourEstimated')}</span>}
      </Row>
      {visit?.pendingConfirmation && (
        <div className="my-1 flex flex-wrap items-center gap-2 rounded-field bg-status-warn/10 px-3 py-2" data-testid="event-pending">
          <span className="text-caption font-semibold text-status-warn-ink">{t('agenda.pending')}</span>
          <button
            type="button"
            className="btn-secondary ms-auto min-h-11"
            data-testid="event-confirm"
            onClick={() => {
              const next = { ...visit, pendingConfirmation: false }
              runUndoable(t('agenda.confirmed'), () => updateFarmVisit(visit.id, next))
            }}
          >
            <Icon name="check" size={15} />
            {t('agenda.confirm')}
          </button>
        </div>
      )}
      {meeting?.location && (
        <Row icon="pin" testId="event-place">
          <span dir="auto">{meeting.location}</span>
        </Row>
      )}
      {meeting?.position && (
        <Row icon="navigation">
          <span className="ltr-nums" dir="ltr">{formatCoords(meeting.position)}</span>
        </Row>
      )}
      {meeting?.person && (
        <Row icon="user">
          <span dir="auto">{meeting.person}</span>
        </Row>
      )}
      {event.link && (
        <div className="py-1.5" data-testid="event-link">
          <LinkChip link={event.link} testId="event-link-chip" />
        </div>
      )}
      {event.kind === 'mission' && event.subtitle && (
        <Row icon="shield">
          <span dir="auto">{event.subtitle}</span>
        </Row>
      )}
      {(meeting?.note || visit?.note) && (
        <p dir="auto" className="my-2 whitespace-pre-wrap rounded-field bg-surface-high px-3 py-2 text-caption text-content-primary" data-testid="event-note">
          {meeting?.note || visit?.note}
        </p>
      )}
      {remind !== null && remind >= 0 && (
        <Row icon="bell">
          <span>{t(`reminder.m${remind}`)}</span>
        </Row>
      )}

      {/* ★ LES ÉTAPES D'UN ITINÉRAIRE, dans l'ordre, avec leur heure. */}
      {event.steps && event.steps.length > 0 && (
        <ol className="my-2 flex flex-col gap-1" data-testid="event-steps">
          {event.steps.map((s, n) => (
            <li key={`${n}-${s.label}`} className="flex items-center gap-2 rounded-field bg-surface-high px-3 py-2 text-caption">
              <span className="numeric flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-accent text-micro font-bold text-content-on-accent">{n + 1}</span>
              <span dir="auto" className="min-w-0 flex-1 truncate">{s.label}</span>
              {s.at && <span className="ltr-nums shrink-0 text-micro text-content-muted">{formatTime(s.at, locale)}</span>}
            </li>
          ))}
        </ol>
      )}

      {/* ★ LES TÂCHES RATTACHÉES à ce rendez-vous. */}
      {event.kind === 'meeting' && (
        <div className="mt-3" data-testid="event-tasks" data-count={tasks.filter(isTaskOpen).length}>
          <div className="mb-1 flex items-center gap-2">
            <Icon name="checklist" size={16} className="text-accent-ink" />
            <h3 className="text-caption font-semibold text-content-secondary">{t('agenda.linkedTasks')}</h3>
            <button type="button" className="btn-ghost ms-auto min-h-11" data-testid="event-add-task" onClick={() => setAdding(true)}>
              <Icon name="plus" size={14} />
              {t('tasks.add')}
            </button>
          </div>
          {adding && (
            <div className="mb-2 rounded-card bg-surface-high p-3">
              <TaskQuickAdd link={{ kind: 'meeting', id: event.id }} onDone={() => setAdding(false)} testId="event-task-add" />
            </div>
          )}
          <ul className="flex flex-col gap-1">
            {tasks.filter(isTaskOpen).map((task) => (
              <li key={task.id} className="flex items-center gap-1" data-testid="event-task" data-task-id={task.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  aria-label={t('tasks.check')}
                  onClick={() => runUndoable(t('tasks.doneToast'), () => setTaskDone(task.id, true))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field hover:bg-surface-high"
                >
                  <span className="h-5 w-5 rounded-[5px] border-2 border-content-muted" />
                </button>
                <button type="button" dir="auto" className="min-h-11 min-w-0 flex-1 text-start text-caption text-content-primary" onClick={() => onOpenTask?.(task.id)}>
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {reflection ? (
          <button type="button" className="btn-primary min-h-11" data-testid="event-open-source" onClick={() => navigate(event.href)}>
            <Icon name="external" size={15} />
            {t(event.kind === 'tour' ? 'agenda.openTour' : 'agenda.openMission')}
          </button>
        ) : (
          <>
            <button type="button" className="btn-primary min-h-11" data-testid="event-edit" onClick={onEdit}>
              <Icon name="edit" size={15} />
              {t('common.edit')}
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11"
              data-testid="event-ics"
              onClick={() =>
                downloadCalendarEvent({
                  uid: event.id,
                  title: event.title,
                  at: event.at,
                  endAt: event.endAt === event.at ? new Date(Date.parse(event.at) + 3_600_000).toISOString() : event.endAt,
                  location: meeting?.location ?? '',
                  note: meeting?.note ?? visit?.note ?? '',
                  position: meeting?.position ?? null,
                  remindMinutes: remind,
                })
              }
            >
              <Icon name="calendar" size={15} />
              {t('meeting.remindCalendar')}
            </button>
            {meeting?.position && (
              <button
                type="button"
                className="btn-ghost min-h-11"
                data-testid="event-make-farm"
                onClick={() => {
                  const q = new URLSearchParams({ at: positionParam(meeting.position as LatLng), name: meeting.title, locality: meeting.location })
                  navigate(`/coordinator/farms/new?${q.toString()}`)
                }}
              >
                <Icon name="home" size={15} />
                {t('meeting.makeFarm')}
              </button>
            )}
            <button
              type="button"
              className="btn-ghost ms-auto min-h-11 text-status-danger-ink"
              data-testid="event-delete"
              onClick={() => {
                if (event.kind === 'meeting') runUndoable(t('agenda.deleted'), () => deleteGeneralMeeting(event.id))
                else runUndoable(t('agenda.deleted'), () => deleteFarmVisitChecked(event.id))
                onClose()
              }}
            >
              <Icon name="trash" size={15} />
              {t('common.delete')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function ReminderSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation()
  return (
    <SelectField<string>
      label={t('meeting.remindField')}
      value={String(value)}
      onChange={(v) => onChange(Number(v))}
      options={REMINDER_CHOICES.map((m) => ({ value: String(m), label: m < 0 ? t('meeting.remindNone') : t(`reminder.m${m}`) }))}
    />
  )
}

/**
 * Le rendez-vous du PO, en champs. Un seul obligatoire : le titre. Créé ou
 * modifié ICI, dans le panneau — le calendrier reste à côté.
 */
function MeetingEditor({
  meetingId,
  seed,
  onSaved,
  onCancel,
  onDeleted,
}: {
  meetingId?: string
  seed?: { at: string; endAt: string; link: AgendaLink | null; title: string }
  onSaved: (id: string) => void
  onCancel: () => void
  onDeleted?: () => void
}) {
  const { t } = useTranslation()
  const existing = useCoreValue(() => (meetingId ? getGeneralMeeting(meetingId) : null))
  const at0 = existing?.at ?? seed?.at ?? new Date().toISOString()
  const end0 = existing?.endAt ?? seed?.endAt ?? new Date(Date.parse(at0) + 3_600_000).toISOString()
  const [title, setTitle] = useState(existing?.title ?? seed?.title ?? '')
  const [date, setDate] = useState(toDateInput(at0))
  const [start, setStart] = useState(toTimeInput(at0))
  const [end, setEnd] = useState(toTimeInput(end0))
  const [location, setLocation] = useState(existing?.location ?? '')
  const [person, setPerson] = useState(existing?.person ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [link, setLink] = useState<AgendaLink | null>(existing ? meetingLink(existing) : (seed?.link ?? null))
  const [position, setPosition] = useState<LatLng | null>(existing?.position ?? null)
  const [remind, setRemind] = useState<number>(existing?.remindMinutes ?? -1)
  const [touched, setTouched] = useState(false)
  const titleError = touched && title.trim() === '' ? t('form.required') : undefined

  const submit = (): void => {
    setTouched(true)
    if (title.trim() === '' || date === '' || start === '') return
    const at = fromInputs(date, start)
    let endAt = end ? fromInputs(date, end) : ''
    if (!endAt || Date.parse(endAt) <= Date.parse(at)) endAt = new Date(Date.parse(at) + 3_600_000).toISOString()
    const draft = {
      title: title.trim(),
      at,
      endAt,
      location: location.trim(),
      person: person.trim(),
      note: note.trim(),
      position,
      remindMinutes: remind < 0 ? null : remind,
      ...meetingLinkPatch(link),
    }
    if (existing) {
      runUndoable(t('agenda.saved'), () => updateGeneralMeeting(existing.id, draft))
      onSaved(existing.id)
    } else {
      let id = ''
      runUndoable(t('agenda.created'), () => {
        id = createGeneralMeeting(draft).id
      })
      onSaved(id)
    }
  }

  return (
    <div className="form-grid" data-testid="meeting-editor">
      <DictationField label={t('meeting.titleField')} value={title} onChange={setTitle} rows={2} autoFocus={!existing} required error={titleError} className="col-span-full" testId="meeting-editor-title" />
      <label className="block">
        <span className="label">{t('agenda.dayField')}</span>
        <input type="date" className="input ltr-nums min-h-11" value={date} onChange={(e) => setDate(e.target.value)} data-testid="meeting-editor-date" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">{t('agenda.startField')}</span>
          <input type="time" step={900} className="input ltr-nums min-h-11" value={start} onChange={(e) => setStart(e.target.value)} data-testid="meeting-editor-start" />
        </label>
        <label className="block">
          <span className="label">{t('agenda.endField')}</span>
          <input type="time" step={900} className="input ltr-nums min-h-11" value={end} onChange={(e) => setEnd(e.target.value)} data-testid="meeting-editor-end" />
        </label>
      </div>
      <DictationField label={t('meeting.locationField')} value={location} onChange={setLocation} className="col-span-full" testId="meeting-editor-place" />
      <LinkPicker label={t('agenda.linkField')} value={link} onChange={(next) => setLink(next as AgendaLink | null)} kinds={['institution', 'farm', 'lead']} testId="meeting-editor-link" />
      <DictationField label={t('meeting.personField')} value={person} onChange={setPerson} className="col-span-full" testId="meeting-editor-person" />
      <ReminderSelect value={remind} onChange={setRemind} />
      <DictationField label={t('common.notes')} value={note} onChange={setNote} rows={3} className="col-span-full" testId="meeting-editor-note" />
      <PositionLinkField onResolve={setPosition} className="col-span-full" />
      {position && (
        <p className="muted col-span-full -mt-2 flex flex-wrap items-center gap-2">
          <Icon name="pin" size={13} />
          <span className="ltr-nums" dir="ltr">{formatCoords(position)}</span>
          <button type="button" className="btn-ghost min-h-11" onClick={() => setPosition(null)}>
            {t('common.remove')}
          </button>
        </p>
      )}
      <InlineActions
        className="col-span-full"
        onSubmit={submit}
        onCancel={onCancel}
        onDelete={
          existing
            ? () => {
                runUndoable(t('agenda.deleted'), () => deleteGeneralMeeting(existing.id))
                onDeleted?.()
              }
            : undefined
        }
        submitTestId="meeting-editor-save"
        cancelTestId="meeting-editor-cancel"
        deleteTestId="meeting-editor-delete"
      />
    </div>
  )
}

/** Une visite de ferme : la ferme est son lien ; le jour, l'heure, la note, faite ou non. */
function VisitEditor({ visitId, onSaved, onCancel, onDeleted }: { visitId: string; onSaved: () => void; onCancel: () => void; onDeleted: () => void }) {
  const { t } = useTranslation()
  const visit = useCoreValue(() => getFarmVisit(visitId))
  const [date, setDate] = useState(visit ? toDateInput(visit.at) : '')
  const [time, setTime] = useState(visit ? toTimeInput(visit.at) : '')
  const [note, setNote] = useState(visit?.note ?? '')
  const [done, setDone] = useState(visit?.done ?? false)
  const [remind, setRemind] = useState<number>(visit?.remindMinutes ?? -1)
  if (!visit) return null
  return (
    <div className="form-grid" data-testid="visit-editor">
      <div className="col-span-full">
        <span className="label">{t('agenda.visitFarm')}</span>
        <LinkChip link={{ kind: 'farm', id: visit.farmId }} />
      </div>
      <label className="block">
        <span className="label">{t('agenda.dayField')}</span>
        <input type="date" className="input ltr-nums min-h-11" value={date} onChange={(e) => setDate(e.target.value)} data-testid="visit-editor-date" />
      </label>
      <label className="block">
        <span className="label">{t('agenda.startField')}</span>
        <input type="time" step={900} className="input ltr-nums min-h-11" value={time} onChange={(e) => setTime(e.target.value)} data-testid="visit-editor-time" />
      </label>
      <ReminderSelect value={remind} onChange={setRemind} />
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" className="h-6 w-6" checked={done} onChange={(e) => setDone(e.target.checked)} />
        <span className="text-caption text-content-primary">{t('agenda.visitDone')}</span>
      </label>
      <DictationField label={t('common.notes')} value={note} onChange={setNote} rows={3} className="col-span-full" testId="visit-editor-note" />
      <InlineActions
        className="col-span-full"
        onSubmit={() => {
          if (date === '' || time === '') return
          runUndoable(t('agenda.saved'), () => updateFarmVisit(visit.id, { farmId: visit.farmId, at: fromInputs(date, time), note: note.trim(), done, remindMinutes: remind < 0 ? null : remind }))
          onSaved()
        }}
        onCancel={onCancel}
        onDelete={() => {
          runUndoable(t('agenda.deleted'), () => deleteFarmVisitChecked(visit.id))
          onDeleted()
        }}
        submitTestId="visit-editor-save"
        cancelTestId="visit-editor-cancel"
        deleteTestId="visit-editor-delete"
      />
    </div>
  )
}
