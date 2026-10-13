import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  LINGER_MS,
  archivedTasks,
  createTaskList,
  deleteTask,
  deleteTaskList,
  formatDate,
  getTaskLists,
  getTasks,
  isTaskOpen,
  moveTask,
  renameTaskList,
  setTaskArchived,
  setTaskDone,
  updateTask,
  visibleTasks,
} from '@core/index'
import type { Task, TaskLink } from '@core/index'

import { DictationField, InlineActions, SelectField } from '../components/fields'
import { Icon } from '../components/Icon'
import { offerUndo, runUndoable } from '../components/UndoToast'
import { useCoreValue } from '../hooks/useCore'
import { useLocale } from '../hooks/useLocale'
import { LINK_ICON, LinkChip, LinkPicker } from '../agenda/links'
import { MemoPane } from './MemoPane'
import { TaskQuickAdd, readLastList, writeLastList } from './TaskQuickAdd'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BE (2026-10-13) — LE VOLET DES TÂCHES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le cœur de cette passe. » Le PO, son téléphone à la main, y lit ce qu'il a
 * à faire, coche ce qui est fait, range dans SON ordre.
 *
 *   · DES LISTES, en pastilles qui passent à la ligne (rien ne défile de côté
 *     sous 48 rem, AY2) ; à leur suite « + רשימה » et l'onglet de
 *     l'AIDE-MÉMOIRE (« עזר לשיחה »).
 *   · UNE TÂCHE : sa poignée (glisser au doigt), sa case, son titre ; un
 *     toucher sur le titre la DÉPLIE (note, lien, échéance, gestes). Un geste
 *     plie ou déplie TOUT — pour réordonner des lignes courtes, puis rouvrir.
 *   · COCHER : la tâche reste un instant, barrée, À SA PLACE (`LINGER_MS`), puis
 *     rejoint les archives ; « ביטול » la rend. Les archives se rouvrent.
 *   · MODIFIER : sur place, dans la ligne — le même contenant.
 */

const TAB_KEY = 'lo-yanum:tasks:tab'
export const MEMO_TAB = 'memo'

function readTab(): string | null {
  try {
    return localStorage.getItem(TAB_KEY)
  } catch {
    return null
  }
}

function writeTab(tab: string): void {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    // Une commodité.
  }
  if (tab !== MEMO_TAB) writeLastList(tab)
}

/** Un instant qui avance tant qu'une tâche cochée attend de partir. */
function useNowWhile(active: boolean): number {
  const [nowMs, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 400)
    return () => window.clearInterval(id)
  }, [active])
  return active ? nowMs : Date.now()
}

/** Le plus proche ancêtre qui défile (la colonne, ou la page). */
function scrollParentOf(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

export function TasksPane({
  focusTask,
  onFocusHandled,
  compose = false,
  onComposeHandled,
}: {
  /** ★ Ouvrir CETTE tâche (venue de l'agenda) : sa liste, dépliée, à l'écran. */
  focusTask?: string | null
  onFocusHandled?: () => void
  /** ★ Le « + משימה » du bouton flottant : le champ de la nouvelle tâche, ouvert. */
  compose?: boolean
  onComposeHandled?: () => void
}) {
  const { t } = useTranslation()
  const lists = useCoreValue(getTaskLists)
  const tasks = useCoreValue(getTasks)
  const [tab, setTabState] = useState<string>(() => readTab() ?? readLastList() ?? '')
  const [adding, setAdding] = useState(false)
  const [listName, setListName] = useState('')

  const listTab = lists.find((l) => l.id === tab)?.id ?? lists.find((l) => l.id === readLastList())?.id ?? lists[0]?.id
  /* Une nouvelle tâche demandée depuis le « + » : on quitte l'aide-mémoire pour la liste. */
  const current = tab === MEMO_TAB && !(compose && listTab) ? MEMO_TAB : (listTab ?? MEMO_TAB)
  const setTab = (next: string): void => {
    setTabState(next)
    writeTab(next)
  }

  /* L'agenda demande une tâche : on va à sa liste. */
  const focused = focusTask ? tasks.find((x) => x.id === focusTask) ?? null : null
  useEffect(() => {
    if (focused && focused.listId !== current) setTab(focused.listId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused?.id])

  const openCount = (listId: string): number => tasks.filter((x) => x.listId === listId && isTaskOpen(x)).length

  return (
    <div data-testid="tasks-pane" data-tab={current} className="flex min-h-0 flex-col">
      <header className="mb-3 flex items-center gap-2">
        <Icon name="checklist" size={20} className="text-accent-ink" />
        <h1 className="text-title text-content-primary">{t('tasks.title')}</h1>
      </header>

      {/* Les listes, puis « + רשימה », puis l'aide-mémoire : une rangée qui passe à la ligne. */}
      <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist" data-testid="tasks-tabs">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            role="tab"
            aria-selected={current === l.id}
            data-testid="tasks-tab"
            data-list-id={l.id}
            onClick={() => setTab(l.id)}
            className={`filter-pill min-h-11 ${current === l.id ? 'filter-pill-active' : ''}`}
          >
            <span className="max-w-[10rem] truncate">{l.name}</span>
            <span className="filter-count">{openCount(l.id)}</span>
          </button>
        ))}
        {adding ? (
          <div className="flex w-full flex-wrap items-end gap-2" data-testid="tasks-new-list">
            <DictationField label={t('tasks.listName')} value={listName} onChange={setListName} autoFocus className="min-w-0 flex-1" testId="tasks-new-list-name" />
            <InlineActions
              onSubmit={() => {
                const created = createTaskList(listName)
                if (created) {
                  setTab(created.id)
                  setAdding(false)
                  setListName('')
                }
              }}
              onCancel={() => {
                setAdding(false)
                setListName('')
              }}
              disabled={listName.trim() === ''}
              submitTestId="tasks-new-list-save"
            />
          </div>
        ) : (
          <button type="button" data-testid="tasks-add-list" onClick={() => setAdding(true)} className="filter-pill min-h-11">
            <Icon name="plus" size={14} />
            {t('tasks.addList')}
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={current === MEMO_TAB}
          data-testid="tasks-tab-memo"
          onClick={() => setTab(MEMO_TAB)}
          className={`filter-pill min-h-11 ${current === MEMO_TAB ? 'filter-pill-active' : ''}`}
        >
          <Icon name="book" size={15} />
          {t('memo.tab')}
        </button>
      </div>

      {current === MEMO_TAB ? (
        <MemoPane onTaskCreated={(listId) => setTab(listId)} />
      ) : (
        <ListView
          key={current}
          listId={current}
          focusTask={focused?.listId === current ? focused.id : null}
          onFocusHandled={onFocusHandled}
          compose={compose}
          onComposeHandled={onComposeHandled}
        />
      )}
    </div>
  )
}

function ListView({
  listId,
  focusTask,
  onFocusHandled,
  compose,
  onComposeHandled,
}: {
  listId: string
  focusTask: string | null
  onFocusHandled?: () => void
  compose?: boolean
  onComposeHandled?: () => void
}) {
  const { t } = useTranslation()
  const lists = useCoreValue(getTaskLists)
  const tasks = useCoreValue(getTasks)
  const list = lists.find((l) => l.id === listId)
  const [composer, setComposer] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [editing, setEditing] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!compose) return
    setComposer(true)
    onComposeHandled?.()
  }, [compose, onComposeHandled])

  const lingering = tasks.some((x) => x.listId === listId && x.doneAt !== null && x.archivedAt === null && Date.now() - Date.parse(x.doneAt) < LINGER_MS)
  const nowMs = useNowWhile(lingering)
  const rows = useMemo(() => visibleTasks(tasks, listId, nowMs), [tasks, listId, nowMs])
  const archive = useMemo(() => archivedTasks(tasks, listId), [tasks, listId])
  const openRows = rows.filter(isTaskOpen)
  const allOpen = rows.length > 0 && rows.every((r) => expanded.has(r.id))

  /* La tâche demandée par l'agenda : dépliée, à l'écran. */
  const listRef = useRef<HTMLUListElement | null>(null)
  useEffect(() => {
    if (!focusTask) return
    setExpanded((s) => new Set(s).add(focusTask))
    const id = requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-task-id="${CSS.escape(focusTask)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      onFocusHandled?.()
    })
    return () => cancelAnimationFrame(id)
  }, [focusTask, onFocusHandled])

  // -------------------------------------------------------------------------
  // ★ RÉORDONNER AU DOIGT. La poignée est `touch-action: none` : le doigt posé
  //   dessus déplace la ligne tout de suite (pas d'appui long — la poignée EST
  //   l'intention), le reste de la ligne fait défiler la page. Les lignes
  //   voisines s'écartent pour montrer où elle tombera ; près des bords, la
  //   liste défile d'elle-même. Relâchée, une seule écriture (`moveTask`).
  // -------------------------------------------------------------------------
  const [drag, setDrag] = useState<{ id: string; dy: number; target: number; from: number; height: number } | null>(null)
  const gesture = useRef<{ id: string; pointerId: number; startY: number; startScroll: number; scroller: HTMLElement | null; centers: number[]; from: number; height: number; center: number } | null>(null)

  const startDrag = (e: React.PointerEvent<HTMLButtonElement>, task: Task): void => {
    if (!isTaskOpen(task)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rowsEls = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-task-row][data-open-task="1"]') ?? [])
    const from = rowsEls.findIndex((el) => el.dataset.taskId === task.id)
    if (from === -1) return
    const rects = rowsEls.map((el) => el.getBoundingClientRect())
    const scroller = scrollParentOf(listRef.current)
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.current = {
      id: task.id,
      pointerId: e.pointerId,
      startY: e.clientY,
      startScroll: scroller ? scroller.scrollTop : window.scrollY,
      scroller,
      centers: rects.map((r) => r.top + r.height / 2),
      from,
      height: rects[from].height,
      center: rects[from].top + rects[from].height / 2,
    }
    setDrag({ id: task.id, dy: 0, target: from, from, height: rects[from].height })
  }

  const moveDrag = (e: React.PointerEvent<HTMLButtonElement>): void => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointerId) return
    const viewH = window.innerHeight
    if (e.clientY < 80) (g.scroller ?? document.scrollingElement)?.scrollBy?.(0, -12)
    else if (e.clientY > viewH - 120) (g.scroller ?? document.scrollingElement)?.scrollBy?.(0, 12)
    const scrolled = (g.scroller ? g.scroller.scrollTop : window.scrollY) - g.startScroll
    const dy = e.clientY - g.startY + scrolled
    const center = g.center + dy
    let target = 0
    g.centers.forEach((c, i) => {
      if (i !== g.from && c < center) target++
    })
    setDrag({ id: g.id, dy, target, from: g.from, height: g.height })
  }

  const endDrag = (commit: boolean): void => {
    const g = gesture.current
    gesture.current = null
    const state = drag
    setDrag(null)
    if (!g || !commit || !state || state.target === state.from) return
    runUndoable(t('tasks.movedToast'), () => moveTask(g.id, state.target))
  }

  /** Le décalage d'une ligne voisine pendant le glissement. */
  const shiftOf = (index: number): number => {
    if (!drag || index === drag.from) return 0
    if (drag.from < drag.target && index > drag.from && index <= drag.target) return -drag.height
    if (drag.target < drag.from && index >= drag.target && index < drag.from) return drag.height
    return 0
  }

  const toggle = (id: string): void =>
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (!list) return null
  let openIndex = -1

  return (
    <div data-testid="tasks-list" data-list-id={listId} data-expanded-all={allOpen ? '1' : '0'}>
      {/* La barre : créer, tout plier / déplier, les archives, la liste elle-même. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary min-h-11" data-testid="tasks-add" onClick={() => setComposer(true)}>
          <Icon name="plus" size={16} />
          {t('tasks.add')}
        </button>
        <button
          type="button"
          className="btn-secondary min-h-11"
          data-testid="tasks-toggle-all"
          aria-pressed={allOpen}
          onClick={() => setExpanded(allOpen ? new Set() : new Set(rows.map((r) => r.id)))}
        >
          <Icon name={allOpen ? 'collapse' : 'expand'} size={16} />
          {allOpen ? t('tasks.collapseAll') : t('tasks.expandAll')}
        </button>
        <button type="button" className="btn-ghost min-h-11" data-testid="tasks-rename-list" onClick={() => setRenaming(list.name)}>
          <Icon name="edit" size={15} />
          {t('tasks.renameList')}
        </button>
      </div>

      {renaming !== null && (
        <div className="mb-3 rounded-card bg-surface-raised p-3 shadow-card" data-testid="tasks-rename">
          <DictationField label={t('tasks.listName')} value={renaming} onChange={setRenaming} autoFocus testId="tasks-rename-name" />
          <InlineActions
            onSubmit={() => {
              if (renameTaskList(list.id, renaming)) setRenaming(null)
            }}
            onCancel={() => setRenaming(null)}
            onDelete={() => {
              setRenaming(null)
              setConfirmDelete(true)
            }}
            disabled={renaming.trim() === ''}
            submitTestId="tasks-rename-save"
            deleteTestId="tasks-delete-list"
          />
        </div>
      )}
      {confirmDelete && (
        <div role="alertdialog" className="mb-3 rounded-card bg-status-danger/10 p-3" data-testid="tasks-delete-list-confirm">
          <p className="text-caption font-semibold text-status-danger-ink">
            {t('tasks.deleteListConfirm', { name: list.name, count: tasks.filter((x) => x.listId === list.id).length })}
          </p>
          <InlineActions
            submitLabel={t('common.delete')}
            onSubmit={() => {
              setConfirmDelete(false)
              runUndoable(t('tasks.listDeleted', { name: list.name }), () => deleteTaskList(list.id))
            }}
            onCancel={() => setConfirmDelete(false)}
            submitTestId="tasks-delete-list-yes"
          />
        </div>
      )}

      {composer && (
        <div className="mb-3 rounded-card bg-surface-raised p-3 shadow-card">
          <TaskQuickAdd listId={listId} onDone={() => setComposer(false)} testId="tasks-composer" />
        </div>
      )}

      {rows.length === 0 && !composer && <p className="muted mb-3" data-testid="tasks-empty">{t('tasks.empty')}</p>}

      <ul ref={listRef} className="flex flex-col gap-2" data-testid="tasks-rows">
        {rows.map((task) => {
          const open = isTaskOpen(task)
          if (open) openIndex++
          const index = open ? openIndex : -1
          const dragging = drag?.id === task.id
          const shift = open ? shiftOf(index) : 0
          return (
            <TaskRow
              key={task.id}
              task={task}
              expanded={expanded.has(task.id)}
              editing={editing === task.id}
              dragging={dragging}
              style={{
                transform: dragging ? `translateY(${drag.dy}px)` : shift ? `translateY(${shift}px)` : undefined,
                transition: dragging ? 'none' : 'transform 160ms ease-out',
                zIndex: dragging ? 20 : undefined,
                position: 'relative',
              }}
              onToggle={() => toggle(task.id)}
              onEdit={() => {
                setEditing(task.id)
                setExpanded((s) => new Set(s).add(task.id))
              }}
              onEditDone={() => setEditing(null)}
              onGripDown={(e) => startDrag(e, task)}
              onGripMove={moveDrag}
              onGripUp={() => endDrag(true)}
              onGripCancel={() => endDrag(false)}
              canUp={open && index > 0}
              canDown={open && index < openRows.length - 1}
              onUp={() => runUndoable(t('tasks.movedToast'), () => moveTask(task.id, index - 1))}
              onDown={() => runUndoable(t('tasks.movedToast'), () => moveTask(task.id, index + 1))}
            />
          )
        })}
      </ul>

      {/* Les archives : ce qui est fait, ou mis de côté. Rien n'y est perdu. */}
      <div className="mt-4 rounded-card bg-surface-raised" data-testid="tasks-archive" data-count={archive.length}>
        <button
          type="button"
          aria-expanded={archiveOpen}
          data-testid="tasks-archive-toggle"
          onClick={() => setArchiveOpen((v) => !v)}
          className="flex min-h-11 w-full items-center gap-2 px-3 text-start"
        >
          <Icon name="archive" size={16} className="text-content-muted" />
          <span className="text-caption font-semibold text-content-secondary">{t('tasks.archive')}</span>
          <span className="filter-count">{archive.length}</span>
          <Icon name="chevronDown" size={14} className={`ms-auto text-content-muted ${archiveOpen ? '' : 'ltr:-rotate-90 rtl:rotate-90'}`} />
        </button>
        {archiveOpen && (
          <ul className="flex flex-col gap-1 px-2 pb-2">
            {archive.length === 0 && <li className="muted px-1 pb-1">{t('tasks.archiveEmpty')}</li>}
            {archive.map((task) => (
              <ArchivedRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  expanded,
  editing,
  dragging,
  style,
  onToggle,
  onEdit,
  onEditDone,
  onGripDown,
  onGripMove,
  onGripUp,
  onGripCancel,
  canUp,
  canDown,
  onUp,
  onDown,
}: {
  task: Task
  expanded: boolean
  editing: boolean
  dragging: boolean
  style: React.CSSProperties
  onToggle: () => void
  onEdit: () => void
  onEditDone: () => void
  onGripDown: (e: React.PointerEvent<HTMLButtonElement>) => void
  onGripMove: (e: React.PointerEvent<HTMLButtonElement>) => void
  onGripUp: () => void
  onGripCancel: () => void
  canUp: boolean
  canDown: boolean
  onUp: () => void
  onDown: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const open = isTaskOpen(task)
  const done = task.doneAt !== null
  const due = task.dueOn ? `${formatDate(`${task.dueOn}T12:00:00`, locale)}${task.dueTime ? ` · ${task.dueTime}` : ''}` : null

  return (
    <li
      data-testid="task-row"
      data-task-row=""
      data-task-id={task.id}
      data-open-task={open ? '1' : '0'}
      data-done={done ? '1' : '0'}
      data-expanded={expanded ? '1' : '0'}
      data-dragging={dragging ? '1' : undefined}
      style={style}
      className={`rounded-card bg-surface-raised shadow-card ${dragging ? 'shadow-lift ring-2 ring-accent' : ''}`}
    >
      <div className="flex items-start gap-1 p-1">
        <button
          type="button"
          data-testid="task-grip"
          aria-label={t('tasks.drag')}
          disabled={!open}
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          onPointerCancel={onGripCancel}
          className="flex h-11 w-11 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded-field text-content-muted
                     hover:bg-surface-high disabled:opacity-30 [-webkit-touch-callout:none]"
        >
          <Icon name="grip" size={18} />
        </button>
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? t('tasks.uncheck') : t('tasks.check')}
          data-testid="task-check"
          onClick={() =>
            done
              ? runUndoable(t('tasks.reopened'), () => setTaskDone(task.id, false))
              : runUndoable(t('tasks.doneToast'), () => setTaskDone(task.id, true))
          }
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field hover:bg-surface-high"
        >
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-[6px] border-2 transition-colors ${
              done ? 'border-status-success bg-status-success text-content-on-accent' : 'border-content-muted'
            }`}
          >
            {done && <Icon name="check" size={15} />}
          </span>
        </button>
        <button
          type="button"
          data-testid="task-title"
          aria-expanded={expanded}
          onClick={onToggle}
          className="min-h-11 min-w-0 flex-1 py-2 text-start"
        >
          <span dir="auto" className={`block whitespace-pre-wrap break-words text-body font-medium leading-snug ${done ? 'text-content-muted line-through' : 'text-content-primary'}`}>
            {task.title || t('tasks.untitled')}
          </span>
          {!expanded && (task.link || due || task.note) && (
            <span className="mt-0.5 flex flex-wrap items-center gap-2 text-micro text-content-muted">
              {task.link && <Icon name={LINK_ICON[task.link.kind]} size={12} />}
              {task.note && <Icon name="document" size={12} />}
              {due && <span className="ltr-nums">{due}</span>}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-label={expanded ? t('tasks.collapse') : t('tasks.expand')}
          data-testid="task-chevron"
          onClick={onToggle}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-muted hover:bg-surface-high"
        >
          <Icon name="chevronDown" size={16} className={expanded ? 'rotate-180' : ''} />
        </button>
      </div>

      {expanded && !editing && (
        <div className="px-3 pb-3" data-testid="task-details">
          {task.note && (
            <p dir="auto" className="mb-2 whitespace-pre-wrap text-caption text-content-secondary" data-testid="task-note">
              {task.note}
            </p>
          )}
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {task.link && <LinkChip link={task.link} testId="task-link" />}
            {due && (
              <span className="inline-flex min-h-8 items-center gap-1 rounded-pill bg-surface-high px-3 text-micro text-content-secondary">
                <Icon name="calendar" size={13} />
                <span className="ltr-nums">{due}</span>
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn-secondary min-h-11" data-testid="task-edit" onClick={onEdit}>
              <Icon name="edit" size={15} />
              {t('common.edit')}
            </button>
            {open && (
              <button
                type="button"
                className="btn-ghost min-h-11"
                data-testid="task-archive"
                onClick={() => runUndoable(t('tasks.archivedToast'), () => setTaskArchived(task.id, true))}
              >
                <Icon name="archive" size={15} />
                {t('tasks.toArchive')}
              </button>
            )}
            <button type="button" className="btn-ghost min-h-11 w-11 justify-center px-0" aria-label={t('tasks.up')} disabled={!canUp} onClick={onUp} data-testid="task-up">
              <Icon name="chevronUp" size={16} />
            </button>
            <button type="button" className="btn-ghost min-h-11 w-11 justify-center px-0" aria-label={t('tasks.down')} disabled={!canDown} onClick={onDown} data-testid="task-down">
              <Icon name="chevronDown" size={16} />
            </button>
            <button
              type="button"
              className="btn-ghost me-0 ms-auto min-h-11 text-status-danger-ink"
              data-testid="task-delete"
              onClick={() => runUndoable(t('tasks.deletedToast'), () => deleteTask(task.id))}
            >
              <Icon name="trash" size={15} />
              {t('common.delete')}
            </button>
          </div>
        </div>
      )}

      {editing && <TaskEditor task={task} onDone={onEditDone} />}
    </li>
  )
}

function TaskEditor({ task, onDone }: { task: Task; onDone: () => void }) {
  const { t } = useTranslation()
  const lists = useCoreValue(getTaskLists)
  const [title, setTitle] = useState(task.title)
  const [note, setNote] = useState(task.note)
  const [listId, setListId] = useState(task.listId)
  const [link, setLink] = useState<TaskLink | null>(task.link)
  const [dueOn, setDueOn] = useState(task.dueOn ?? '')
  const [dueTime, setDueTime] = useState(task.dueTime ?? '')
  const [touched, setTouched] = useState(false)
  const error = touched && title.trim() === '' ? t('form.required') : undefined

  return (
    <div className="form-grid px-3 pb-3" data-testid="task-editor">
      <DictationField label={t('tasks.titleField')} value={title} onChange={setTitle} rows={2} autoFocus required error={error} className="col-span-full" testId="task-editor-title" />
      <DictationField label={t('tasks.noteField')} value={note} onChange={setNote} rows={3} className="col-span-full" testId="task-editor-note" />
      <SelectField<string> label={t('tasks.listField')} value={listId} onChange={setListId} options={lists.map((l) => ({ value: l.id, label: l.name }))} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">{t('tasks.dueOn')}</span>
          <input type="date" className="input ltr-nums min-h-11" value={dueOn} onChange={(e) => setDueOn(e.target.value)} data-testid="task-editor-due" />
        </label>
        <label className="block">
          <span className="label">{t('tasks.dueTime')}</span>
          <input type="time" className="input ltr-nums min-h-11" value={dueTime} disabled={dueOn === ''} onChange={(e) => setDueTime(e.target.value)} data-testid="task-editor-time" />
        </label>
      </div>
      <LinkPicker label={t('tasks.linkField')} value={link} onChange={setLink} kinds={['institution', 'farm', 'lead', 'meeting']} testId="task-editor-link" />
      <InlineActions
        className="col-span-full"
        onSubmit={() => {
          setTouched(true)
          if (title.trim() === '') return
          const changed = runUndoable(t('tasks.savedToast'), () =>
            updateTask(task.id, { title, note, listId, link, dueOn: dueOn || null, dueTime: dueTime || null }),
          )
          if (changed && listId !== task.listId) {
            const dest = lists.find((l) => l.id === listId)
            offerUndo(t('tasks.movedToList', { list: dest?.name ?? '' }))
          }
          onDone()
        }}
        onCancel={onDone}
        onDelete={() => {
          runUndoable(t('tasks.deletedToast'), () => deleteTask(task.id))
          onDone()
        }}
        submitTestId="task-editor-save"
        deleteTestId="task-editor-delete"
      />
    </div>
  )
}

function ArchivedRow({ task }: { task: Task }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const when = task.doneAt ?? task.archivedAt
  return (
    <li data-testid="task-archived" data-task-id={task.id} className="flex items-center gap-2 rounded-field px-1 py-1 hover:bg-surface-high">
      <Icon name={task.doneAt ? 'check' : 'archive'} size={15} className="shrink-0 text-content-muted" />
      <span dir="auto" className={`min-w-0 flex-1 text-caption ${task.doneAt ? 'text-content-muted line-through' : 'text-content-secondary'}`}>
        {task.title}
      </span>
      {when && <span className="ltr-nums shrink-0 text-micro text-content-muted">{formatDate(when, locale)}</span>}
      <button
        type="button"
        className="btn-secondary min-h-11 shrink-0"
        data-testid="task-restore"
        onClick={() => runUndoable(t('tasks.reopened'), () => setTaskArchived(task.id, false))}
      >
        <Icon name="undo" size={14} />
        {t('tasks.restore')}
      </button>
      <button
        type="button"
        className="btn-ghost h-11 w-11 shrink-0 justify-center px-0 text-status-danger-ink"
        aria-label={t('common.delete')}
        data-testid="task-archived-delete"
        onClick={() => runUndoable(t('tasks.deletedToast'), () => deleteTask(task.id))}
      >
        <Icon name="trash" size={15} />
      </button>
    </li>
  )
}
