import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createTask, getTaskLists, undoable } from '@core/index'
import type { Task, TaskLink } from '@core/index'

import { DictationField, InlineActions, SelectField } from '../components/fields'
import { Sheet } from '../components/Sheet'
import { offerUndo } from '../components/UndoToast'
import { useCoreValue } from '../hooks/useCore'
import { LinkChip } from '../agenda/links'
import { readSetting, writeSetting } from '../../storage/local'

/**
 * ★★ BE (2026-10-13) — CRÉER UNE TÂCHE D'UN GESTE, DE N'IMPORTE OÙ.
 *
 * « Depuis la fiche d'une institution, d'une ferme ou d'un contact, un geste
 * crée une tâche déjà reliée à cette fiche. C'est ce qui évite au PO de retaper
 * un nom. » Un champ de dictée (le titre), la liste (la dernière ouverte), le
 * lien déjà posé, et « שמירה ». Le champ ne se referme pas tout seul.
 */

const LAST_LIST_KEY = 'lo-yanum:tasks:list'

export function readLastList(): string | null {
  try {
    return readSetting(LAST_LIST_KEY)
  } catch {
    return null
  }
}

export function writeLastList(id: string): void {
  try {
    writeSetting(LAST_LIST_KEY, id)
  } catch {
    // Une commodité : sans elle, la première liste.
  }
}

/** La liste où une tâche neuve va par défaut : la dernière ouverte, sinon la première. */
export function useDefaultListId(): string | null {
  const lists = useCoreValue(getTaskLists)
  const last = readLastList()
  return lists.find((l) => l.id === last)?.id ?? lists[0]?.id ?? null
}

export function TaskQuickAdd({
  link = null,
  listId: fixedList,
  onDone,
  autoFocus = true,
  testId = 'task-quick-add',
}: {
  link?: TaskLink | null
  /** Une liste imposée (le volet des tâches, sur sa liste ouverte). */
  listId?: string
  onDone: (task: Task | null) => void
  autoFocus?: boolean
  testId?: string
}) {
  const { t } = useTranslation()
  const lists = useCoreValue(getTaskLists)
  const fallback = useDefaultListId()
  const [listId, setListId] = useState<string>(fixedList ?? fallback ?? '')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const error = touched && title.trim() === '' ? t('form.required') : undefined

  if (lists.length === 0) {
    return <p className="muted" data-testid={`${testId}-nolist`}>{t('tasks.noListYet')}</p>
  }

  const submit = (): void => {
    setTouched(true)
    if (title.trim() === '' || !listId) return
    const u = undoable(() => createTask({ listId, title, note, link }))
    if (u.result) {
      writeLastList(listId)
      const list = lists.find((l) => l.id === listId)
      offerUndo(t('tasks.created', { list: list?.name ?? '' }), u.undo)
    }
    onDone(u.result)
  }

  return (
    <div data-testid={testId} className="form-grid">
      <DictationField
        label={t('tasks.titleField')}
        value={title}
        onChange={setTitle}
        rows={2}
        autoFocus={autoFocus}
        required
        error={error}
        className="col-span-full"
        testId={`${testId}-title`}
      />
      <DictationField label={t('tasks.noteField')} value={note} onChange={setNote} rows={2} className="col-span-full" testId={`${testId}-note`} />
      {!fixedList && (
        <SelectField<string>
          label={t('tasks.listField')}
          value={listId}
          onChange={setListId}
          options={lists.map((l) => ({ value: l.id, label: l.name }))}
        />
      )}
      {link && (
        <div className="col-span-full">
          <span className="label">{t('tasks.linkField')}</span>
          <LinkChip link={link} testId={`${testId}-link`} />
        </div>
      )}
      <InlineActions className="col-span-full" onSubmit={submit} onCancel={() => onDone(null)} submitTestId={`${testId}-save`} cancelTestId={`${testId}-cancel`} />
    </div>
  )
}

/** La même chose, dans la feuille montante — depuis une fiche, n'importe où. */
export function TaskQuickAddSheet({ open, onClose, link }: { open: boolean; onClose: () => void; link: TaskLink | null }) {
  const { t } = useTranslation()
  return (
    <Sheet open={open} onClose={onClose} title={t('tasks.new')} testId="task-sheet" height={0.7}>
      {open && <TaskQuickAdd link={link} onDone={onClose} testId="task-sheet-form" />}
    </Sheet>
  )
}
