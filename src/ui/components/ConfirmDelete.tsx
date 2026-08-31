import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { deletionPlan } from '@core/index'
import type { DeletableKind } from '@core/index'

import { Icon } from './Icon'
import { Callout, Modal } from './primitives'

/**
 * PO POINT 8 (2026-08-31) — THE ONE CONFIRMATION, FOR ALL TEN KINDS OF RECORD.
 *
 * The product owner asked for a delete action on ten different things, always
 * with a confirmation, always naming the element, always listing what goes with
 * it — and REFUSED with a reason and an alternative when the record has a
 * history. That is one dialog, not ten, and the reason it can be one is that
 * `core/deletion.ts` already answers every question it needs to ask.
 *
 * ★ IT NEVER DECIDES ANYTHING ITSELF. It renders `deletionPlan(kind, id)`. A
 *   dialog that carried its own copy of "may this be deleted" would be the
 *   copy that drifts, and it would drift in the direction that matters: the
 *   store would refuse, the dialog would have said yes, and the coordinator
 *   would watch a farm not disappear with no explanation.
 *
 * ★ THE REFUSAL IS THE SAME DIALOG, NOT AN ERROR AFTERWARDS. He taps "מחק",
 *   and if the record cannot go he is told WHY — "3 שמירות" — and what to do
 *   instead, before he has confirmed anything. A confirm-then-fail flow would
 *   make him agree to something that was never going to happen.
 *
 * ★ AND THE RETYPE-THE-NAME STEP IS RARE ON PURPOSE (point 8d). It appears
 *   only for an entity that has DRAWN ZONES, because the drawing is the one
 *   thing on these records that cannot be recovered by typing it again. Asking
 *   for it everywhere would make it a reflex, and a reflex confirmation is not
 *   a confirmation.
 */
export function ConfirmDelete({
  kind,
  id,
  /** What to call the thing in the title. Falls back to the plan's own name. */
  label,
  onClose,
  onConfirm,
}: {
  kind: DeletableKind
  id: string
  label?: string
  onClose: () => void
  /** Returns false if the store refused after all — surfaced, never swallowed. */
  onConfirm: () => boolean
}) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState('')
  const [failed, setFailed] = useState(false)

  // Read once per render rather than held in state: the store can change under
  // an open dialog (a sync lands, a guard arrives) and the answer must be the
  // CURRENT one at the moment the button is pressed.
  const plan = deletionPlan(kind, id)
  const name = label ?? plan.name

  if (!plan.found) return null

  const nameOk = !plan.requireName || typed.trim() === name.trim()

  return (
    <Modal
      title={plan.allowed ? t('deletion.title') : t('deletion.refusedTitle')}
      onClose={onClose}
    >
      <p className="text-body font-medium text-content-primary">{name}</p>

      {plan.allowed ? (
        <>
          <Callout tone="warn" icon="alert" title={t('deletion.irreversible')}>
            {plan.cascades.length > 0 ? (
              <>
                <span className="block">{t('deletion.alsoDeleted')}</span>
                <ul className="mt-1.5 list-disc space-y-0.5 ps-5">
                  {plan.cascades.map((c) => (
                    <li key={c.key}>{t(c.key, { count: c.count })}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </Callout>

          {plan.requireName && (
            <div className="mt-4">
              <p className="muted mb-2">{t('deletion.typeNameHint')}</p>
              <label className="label" htmlFor="confirm-delete-name">
                {t('deletion.typeNameLabel')}
              </label>
              <input
                id="confirm-delete-name"
                className="input"
                data-testid="delete-confirm-name"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
              />
              {typed.length > 0 && !nameOk && (
                <p className="mt-1.5 text-micro text-status-danger-ink">
                  {t('deletion.typeNameMismatch')}
                </p>
              )}
            </div>
          )}

          {failed && (
            <p className="mt-3 text-caption text-status-danger-ink">
              {t('deletion.failed')}
            </p>
          )}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-danger"
              data-testid="delete-confirm"
              disabled={!nameOk}
              onClick={() => {
                if (onConfirm()) onClose()
                else setFailed(true)
              }}
            >
              <Icon name="trash" size={16} />
              {t('deletion.confirm')}
            </button>
          </div>
        </>
      ) : (
        <>
          <Callout tone="danger" icon="alert" title={t('deletion.blockedBy')}>
            <ul className="list-disc space-y-0.5 ps-5">
              {plan.blockers.map((b) => (
                <li key={b.key}>{t(b.key, { count: b.count })}</li>
              ))}
            </ul>
          </Callout>

          {plan.alternativeKey && (
            <div className="mt-4" data-testid="delete-alternative">
              <p className="text-caption font-medium text-content-secondary">
                {t('deletion.alternative')}
              </p>
              <p className="mt-1 text-caption text-content-primary">
                {t(plan.alternativeKey)}
              </p>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <button type="button" className="btn-primary" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

/**
 * The dialog as two lines at a call site.
 *
 * ★ IT EXISTS BECAUSE THE PRODUCT OWNER'S RULE IS "ALWAYS WITH CONFIRMATION",
 *   AND A RULE THAT COSTS FIVE LINES OF STATE PER BUTTON IS A RULE SOMEBODY
 *   SKIPS. Wiring the delete actions revealed that every deletion this app
 *   already had — a zone, a guard post, a visit, a meeting, a tour, a threat
 *   zone — deleted on the FIRST TAP with no confirmation at all. Ten call
 *   sites, ten chances to forget. So the whole thing is one `ask(…)` and one
 *   `{dialog}`.
 *
 *     const del = useConfirmDelete()
 *     <button onClick={() => del.ask('farmVisit', visit.id, () => deleteFarmVisitChecked(visit.id))} />
 *     {del.dialog}
 *
 * `after` runs only when the store really deleted — closing a modal, clearing
 * a selection — so a refusal leaves the screen exactly as it was.
 */
export function useConfirmDelete(): {
  ask: (
    kind: DeletableKind,
    id: string,
    perform: () => boolean,
    options?: { label?: string; after?: () => void },
  ) => void
  dialog: JSX.Element | null
} {
  const [pending, setPending] = useState<{
    kind: DeletableKind
    id: string
    perform: () => boolean
    label?: string
    after?: () => void
  } | null>(null)

  return {
    ask: (kind, id, perform, options) =>
      setPending({ kind, id, perform, label: options?.label, after: options?.after }),
    dialog: pending ? (
      <ConfirmDelete
        kind={pending.kind}
        id={pending.id}
        label={pending.label}
        onClose={() => setPending(null)}
        onConfirm={() => {
          const ok = pending.perform()
          if (ok) pending.after?.()
          return ok
        }}
      />
    ) : null,
  }
}
