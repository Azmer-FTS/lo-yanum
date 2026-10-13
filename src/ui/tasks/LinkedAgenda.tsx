import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  formatDateTime,
  getTasks,
  getVisibleFarmVisits,
  getVisibleGeneralMeetings,
  isTaskOpen,
  meetingLink,
  now,
  setTaskDone,
  tasksLinkedTo,
} from '@core/index'
import type { TaskLinkKind } from '@core/index'

import { Icon } from '../components/Icon'
import { runUndoable } from '../components/UndoToast'
import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { TaskQuickAddSheet } from './TaskQuickAdd'

/**
 * ★★ BE (2026-10-13) — « DE LA FICHE ON VOIT LE RENDEZ-VOUS, ET DU RENDEZ-VOUS
 * ON OUVRE LA FICHE. »
 *
 * Sur la fiche d'une institution, d'une ferme ou d'un contact à traiter : les
 * rendez-vous à venir qui lui sont reliés (et, pour une ferme, ses visites),
 * les tâches ouvertes qui la nomment, et les deux gestes qui évitent de
 * retaper un nom — « + משימה » (une tâche déjà reliée, dictée dans la feuille)
 * et « + פגישה » (l'agenda, le panneau ouvert, le lien déjà posé).
 */
export function LinkedAgenda({ kind, id }: { kind: Exclude<TaskLinkKind, 'meeting'>; id: string }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const tasks = useCoreValue(() => tasksLinkedTo(getTasks(), kind, id).filter(isTaskOpen))
  const fromMs = now().getTime() - 2 * 3_600_000
  const meetings = useCoreValue(() =>
    getVisibleGeneralMeetings()
      .filter((m) => {
        const link = meetingLink(m)
        return link?.kind === kind && link.id === id && Date.parse(m.endAt) >= fromMs
      })
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
  )
  const visits = useCoreValue(() =>
    kind === 'farm' ? getVisibleFarmVisits().filter((v) => v.farmId === id && !v.done && Date.parse(v.at) >= fromMs).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)) : [],
  )
  const appointments = [
    ...meetings.map((m) => ({ key: `meeting:${m.id}`, at: m.at, title: m.title })),
    ...visits.map((v) => ({ key: `visit:${v.id}`, at: v.at, title: v.note || t('agenda.visit') })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))

  return (
    <section className="panel-scope rounded-card bg-surface-raised p-3 shadow-card" data-testid="linked-agenda" data-kind={kind} data-id={id}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Icon name="calendar" size={18} className="text-accent-ink" />
        <h2 className="text-section text-content-primary">{t('linked.title')}</h2>
        <div className="ms-auto flex flex-wrap gap-2">
          <button type="button" className="btn-secondary min-h-11" data-testid="linked-add-task" onClick={() => setAdding(true)}>
            <Icon name="checklist" size={15} />
            {t('linked.addTask')}
          </button>
          <button
            type="button"
            className="btn-secondary min-h-11"
            data-testid="linked-add-meeting"
            onClick={() => navigate(`/coordinator/agenda?new=meeting&link=${encodeURIComponent(`${kind}:${id}`)}`)}
          >
            <Icon name="users" size={15} />
            {t('linked.addMeeting')}
          </button>
        </div>
      </div>

      {appointments.length === 0 && tasks.length === 0 && <p className="muted" data-testid="linked-empty">{t('linked.empty')}</p>}

      {appointments.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1" data-testid="linked-appointments">
          {appointments.map((a) => (
            <li key={a.key}>
              <button
                type="button"
                data-testid="linked-appointment"
                onClick={() => navigate(`/coordinator/agenda?event=${encodeURIComponent(a.key)}`)}
                className="flex min-h-11 w-full items-center gap-2 rounded-field px-2 text-start hover:bg-surface-high"
              >
                <Icon name="clock" size={15} className="shrink-0 text-content-muted" />
                <span className="ltr-nums shrink-0 text-micro font-semibold text-content-secondary">{formatDateTime(a.at, locale)}</span>
                <span dir="auto" className="min-w-0 flex-1 truncate text-caption text-content-primary">{a.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {tasks.length > 0 && (
        <ul className="flex flex-col gap-1" data-testid="linked-tasks">
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-1" data-testid="linked-task" data-task-id={task.id}>
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
              <span dir="auto" className="min-w-0 flex-1 text-caption text-content-primary">{task.title}</span>
            </li>
          ))}
        </ul>
      )}

      <TaskQuickAddSheet open={adding} onClose={() => setAdding(false)} link={{ kind, id }} />
    </section>
  )
}
