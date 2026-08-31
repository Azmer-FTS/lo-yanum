import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  createFarmVisit,
  deleteFarmVisitChecked,
  getFarmVisit,
  getVisibleFarms,
  updateFarmVisit,
} from '@core/index'

import { SelectField, TextArea } from './fields'
import { useConfirmDelete } from './ConfirmDelete'
import { Icon } from './Icon'
import { Modal } from './primitives'
import { useCoreValue } from '../hooks/useCore'

/**
 * D4 — create or edit a planned farm visit.
 *
 * A modal rather than a route because it is opened from three places (an empty
 * agenda slot, an existing agenda entry, the farm card) and none of them should
 * lose their scroll position or their calendar page to a full navigation.
 *
 * The datetime is a native `datetime-local`. It is the only control in the app
 * that is not built from the design tokens, and that is the right trade: the
 * native picker is the one the user already knows on their phone, and a
 * hand-rolled one at 13px in RTL would be worse in every way.
 */
export function FarmVisitModal({
  visitId,
  defaultFarmId,
  defaultAt,
  onClose,
}: {
  /** Editing an existing visit; omit to create a new one. */
  visitId?: string
  defaultFarmId?: string
  /** ISO datetime the new visit starts at. */
  defaultAt?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  // PO POINT 8 — every deletion in this app now asks first. Before this,
  // each of these buttons deleted on the FIRST TAP.
  const del = useConfirmDelete()
  const farms = useCoreValue(getVisibleFarms)
  const existing = useCoreValue(() => (visitId ? getFarmVisit(visitId) : null))

  /**
   * `datetime-local` speaks LOCAL wall-clock with no zone, while the store
   * speaks ISO/UTC. Converting through the offset rather than slicing the ISO
   * string matters: `toISOString().slice(0,16)` shows a Negev evening as the
   * afternoon before.
   */
  const toLocalInput = (isoValue: string): string => {
    const d = new Date(isoValue)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }
  const fromLocalInput = (value: string): string =>
    new Date(value).toISOString()

  const [farmId, setFarmId] = useState(
    existing?.farmId ?? defaultFarmId ?? farms[0]?.id ?? '',
  )
  const [at, setAt] = useState(
    toLocalInput(existing?.at ?? defaultAt ?? new Date().toISOString()),
  )
  const [note, setNote] = useState(existing?.note ?? '')
  const [done, setDone] = useState(existing?.done ?? false)

  const valid = farmId !== '' && at !== ''

  const submit = () => {
    if (!valid) return
    const draft = { farmId, at: fromLocalInput(at), note: note.trim(), done }
    if (existing) updateFarmVisit(existing.id, draft)
    else createFarmVisit(draft)
    onClose()
  }

  return (
    <Modal
      title={t(existing ? 'agenda.editVisit' : 'agenda.planVisit')}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <SelectField
          label={t('missions.farm')}
          value={farmId}
          onChange={setFarmId}
          required
          options={farms.map((f) => ({
            value: f.id,
            label: `${f.name} · ${f.locality}`,
          }))}
          // F1 — planning a visit to nothing is not a validation error, it is a
          // missing farm. Offer the farm.
          emptyLabel={t('wizard.noFarms')}
          emptyAction={
            <Link to="/coordinator/farms/new" className="btn-primary">
              {t('farms.createFirst')}
            </Link>
          }
        />

        <label className="block">
          <span className="label">{t('agenda.visitAt')}</span>
          <input
            type="datetime-local"
            className="input ltr-nums text-start"
            value={at}
            onChange={(e) => setAt(e.target.value)}
          />
        </label>

        <TextArea
          label={t('common.notes')}
          value={note}
          onChange={setNote}
          rows={3}
          placeholder={t('agenda.notePlaceholder')}
        />

        <label className="flex cursor-pointer items-center gap-2.5 rounded-field bg-surface-high px-3 py-2.5">
          <input
            type="checkbox"
            checked={done}
            onChange={(e) => setDone(e.target.checked)}
            className="h-4 w-4 accent-accent"
          />
          <span className="text-caption text-content-primary">
            {t('agenda.visitDone')}
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-3">
          {existing && (
            <button
              type="button"
              className="btn-ghost me-auto text-status-danger-ink hover:bg-status-danger/10"
              data-testid="visit-delete"
              onClick={() =>
                del.ask(
                  'farmVisit',
                  existing.id,
                  () => deleteFarmVisitChecked(existing.id),
                  { after: onClose },
                )
              }
            >
              <Icon name="trash" size={15} />
              {t('common.remove')}
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!valid}
            onClick={submit}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
      {del.dialog}
    </Modal>
  )
}
