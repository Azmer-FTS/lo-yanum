import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { createMemoLine, createTask, deleteMemoLine, getMemoLines, getTaskLists, memoView, undoable, updateMemoLine } from '@core/index'
import type { MemoBank, MemoLine, MemoSection } from '@core/index'

import { DictationField, InlineActions } from '../components/fields'
import { Icon } from '../components/Icon'
import { offerUndo, runUndoable } from '../components/UndoToast'
import { useCoreValue } from '../hooks/useCore'
import { useDefaultListId, writeLastList } from './TaskQuickAdd'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BE (2026-10-13) — L'AIDE-MÉMOIRE, DANS LE MÊME ÉCRAN QUE LES TÂCHES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO téléphone avec cet écran sous les yeux. Trois banques (institutions,
 * agriculteurs, volontaires), deux sections chacune (les questions, ce qu'on
 * dit).
 *
 * ★ L'HÉBREU EN GRAND, LE FRANÇAIS EN PETIT. L'hébreu est ce qu'il lit à voix
 *   haute pendant que l'autre attend : 22 px, à bout de bras ; le français, en
 *   dessous, pour lui.
 * ★ UNE RECHERCHE, LES TROIS BANQUES À LA FOIS (hébreu et français, sans
 *   niqqud ni gershayim — `memoMatches`).
 * ★ C'EST SON CARNET : une ligne se touche — « למשימה » (une tâche d'un geste,
 *   dans sa dernière liste), « עריכה », « מחיקה » (avec « ביטול ») ; chaque
 *   section a son « + שורה ». Rien ne s'y archive.
 */

export function MemoPane({ onTaskCreated }: { onTaskCreated?: (listId: string) => void }) {
  const { t } = useTranslation()
  const lines = useCoreValue(getMemoLines)
  const [query, setQuery] = useState('')
  const view = useMemo(() => memoView(lines, query), [lines, query])
  const searching = query.trim() !== ''
  const total = view.reduce((n, b) => n + b.count, 0)

  return (
    <div data-testid="memo-pane" data-results={total}>
      <div className="sticky top-0 z-10 -mx-1 mb-3 bg-surface-base/95 px-1 pb-2 pt-1 backdrop-blur" data-testid="memo-search-bar">
        <div className="flex items-start gap-2">
          <Icon name="search" size={18} className="mt-3 shrink-0 text-content-muted" />
          <DictationField label={t('memo.search')} hideLabel value={query} onChange={setQuery} placeholder={t('memo.searchPlaceholder')} className="min-w-0 flex-1" testId="memo-search" />
          {searching && (
            <button
              type="button"
              aria-label={t('common.clear')}
              data-testid="memo-search-clear"
              onClick={() => setQuery('')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high"
            >
              <Icon name="close" size={16} />
            </button>
          )}
        </div>
        {/* Les trois banques d'un toucher. */}
        <nav className="mt-2 flex flex-wrap gap-2" aria-label={t('memo.banks')}>
          {view.map((b) => (
            <a key={b.bank} href={`#memo-${b.bank}`} className="filter-pill min-h-11" data-testid="memo-jump" data-bank={b.bank}
              onClick={(e) => {
                e.preventDefault()
                document.getElementById(`memo-${b.bank}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
              }}
            >
              {t(`memo.bank.${b.bank}`)}
              <span className="filter-count">{b.count}</span>
            </a>
          ))}
        </nav>
      </div>

      {searching && total === 0 && <p className="muted" data-testid="memo-no-result">{t('memo.noResult')}</p>}

      {view.map((b) =>
        searching && b.count === 0 ? null : (
          <section key={b.bank} id={`memo-${b.bank}`} data-testid="memo-bank" data-bank={b.bank} data-count={b.count} className="mb-6 scroll-mt-32">
            <h2 className="mb-2 text-heading font-bold text-content-primary">{t(`memo.bank.${b.bank}`)}</h2>
            {b.sections.map((s) => (
              <MemoSectionBlock key={s.section} bank={b.bank} section={s.section} lines={s.lines} searching={searching} onTaskCreated={onTaskCreated} />
            ))}
          </section>
        ),
      )}
    </div>
  )
}

function MemoSectionBlock({
  bank,
  section,
  lines,
  searching,
  onTaskCreated,
}: {
  bank: MemoBank
  section: MemoSection
  lines: MemoLine[]
  searching: boolean
  onTaskCreated?: (listId: string) => void
}) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  return (
    <div className="mb-4" data-testid="memo-section" data-section={section}>
      <div className="mb-1 flex items-center gap-2">
        <h3 className="text-caption font-bold uppercase tracking-wide text-accent-ink">{t(`memo.section.${bank}.${section}`)}</h3>
        {!searching && (
          <button type="button" className="btn-ghost ms-auto min-h-11" data-testid="memo-add" onClick={() => setAdding(true)}>
            <Icon name="plus" size={14} />
            {t('memo.addLine')}
          </button>
        )}
      </div>
      {adding && (
        <div className="mb-2 rounded-card bg-surface-raised p-3 shadow-card">
          <MemoEditor
            onSave={(he, fr) => {
              if (createMemoLine({ bank, section, he, fr })) setAdding(false)
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {lines.map((line) => (
          <MemoRow key={line.id} line={line} onTaskCreated={onTaskCreated} />
        ))}
      </ul>
    </div>
  )
}

function MemoRow({ line, onTaskCreated }: { line: MemoLine; onTaskCreated?: (listId: string) => void }) {
  const { t } = useTranslation()
  const lists = useCoreValue(getTaskLists)
  const listId = useDefaultListId()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <li className="rounded-card bg-surface-raised p-3 shadow-card" data-testid="memo-line" data-line-id={line.id} data-editing="1">
        <MemoEditor
          he={line.he}
          fr={line.fr}
          onSave={(he, fr) => {
            runUndoable(t('memo.saved'), () => updateMemoLine(line.id, { he, fr }))
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
          onDelete={() => {
            setEditing(false)
            runUndoable(t('memo.deleted'), () => deleteMemoLine(line.id))
          }}
        />
      </li>
    )
  }

  return (
    <li className="rounded-card bg-surface-raised shadow-card" data-testid="memo-line" data-line-id={line.id}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="block w-full px-3 py-2 text-start" data-testid="memo-line-text">
        {line.he && (
          <span lang="he" dir="rtl" className="block text-[1.375rem] font-semibold leading-snug text-content-primary" data-testid="memo-he">
            {line.he}
          </span>
        )}
        {line.fr && (
          <span lang="fr" dir="ltr" className="mt-1 block text-caption leading-snug text-content-muted" data-testid="memo-fr">
            {line.fr}
          </span>
        )}
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-2 px-3 pb-3" data-testid="memo-line-actions">
          <button
            type="button"
            className="btn-primary min-h-11"
            data-testid="memo-to-task"
            disabled={!listId}
            onClick={() => {
              if (!listId) return
              const list = lists.find((l) => l.id === listId)
              /* Une tâche d'un geste, dans la dernière liste ouverte ; la bande dit
                 laquelle, offre « ביטול » et le chemin vers la tâche. */
              const u = undoable(() => createTask({ listId, title: line.he || line.fr, note: line.he ? line.fr : '' }))
              if (u.result) {
                writeLastList(listId)
                offerUndo(t('tasks.created', { list: list?.name ?? '' }), u.undo, onTaskCreated ? { label: t('memo.openTask'), run: () => onTaskCreated(listId) } : undefined)
              }
              setOpen(false)
            }}
          >
            <Icon name="checklist" size={15} />
            {t('memo.toTask')}
          </button>
          <button type="button" className="btn-secondary min-h-11" data-testid="memo-edit" onClick={() => setEditing(true)}>
            <Icon name="edit" size={15} />
            {t('common.edit')}
          </button>
          <button
            type="button"
            className="btn-ghost ms-auto min-h-11 text-status-danger-ink"
            data-testid="memo-delete"
            onClick={() => runUndoable(t('memo.deleted'), () => deleteMemoLine(line.id))}
          >
            <Icon name="trash" size={15} />
            {t('common.delete')}
          </button>
        </div>
      )}
    </li>
  )
}

function MemoEditor({
  he: he0 = '',
  fr: fr0 = '',
  onSave,
  onCancel,
  onDelete,
}: {
  he?: string
  fr?: string
  onSave: (he: string, fr: string) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const [he, setHe] = useState(he0)
  const [fr, setFr] = useState(fr0)
  return (
    <div className="form-grid" data-testid="memo-editor">
      <DictationField label={t('memo.he')} value={he} onChange={setHe} rows={2} autoFocus className="col-span-full" inputClassName="text-[1.125rem]" testId="memo-editor-he" />
      <DictationField label={t('memo.fr')} value={fr} onChange={setFr} rows={2} className="col-span-full" testId="memo-editor-fr" />
      <InlineActions
        className="col-span-full"
        onSubmit={() => onSave(he, fr)}
        onCancel={onCancel}
        onDelete={onDelete}
        disabled={he.trim() === '' && fr.trim() === ''}
        submitTestId="memo-editor-save"
        deleteTestId="memo-editor-delete"
      />
    </div>
  )
}
