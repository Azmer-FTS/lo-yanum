import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  LOCALITY_POSITIONS,
  createGeneralMeeting,
  deleteGeneralMeeting,
  getGeneralMeeting,
  updateGeneralMeeting,
} from '@core/index'

import { AutocompleteField, Field, TextArea, TextField } from './fields'
import { Icon } from './Icon'
import { Modal } from './primitives'
import { useCoreValue } from '../hooks/useCore'

/**
 * G6 — the third agenda event: a general meeting. Free title, free location
 * (the gazetteer assists but never constrains — these happen in offices and
 * warehouses, not only in towns), a person or organisation, and a note.
 * Same modal-over-the-calendar pattern as FarmVisitModal, for the same
 * reasons.
 */
export function GeneralMeetingModal({
  meetingId,
  defaultAt,
  onClose,
}: {
  /** Editing an existing meeting; omit to create. */
  meetingId?: string
  /** ISO datetime the new meeting starts at. */
  defaultAt?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const existing = useCoreValue(() =>
    meetingId ? getGeneralMeeting(meetingId) : null,
  )

  const toLocalInput = (isoValue: string): string => {
    const d = new Date(isoValue)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }
  const fromLocalInput = (value: string): string =>
    new Date(value).toISOString()

  const [title, setTitle] = useState(existing?.title ?? '')
  const [at, setAt] = useState(
    toLocalInput(existing?.at ?? defaultAt ?? new Date().toISOString()),
  )
  const [endTime, setEndTime] = useState(
    existing ? toLocalInput(existing.endAt).slice(11, 16) : '',
  )
  const [location, setLocation] = useState(existing?.location ?? '')
  const [person, setPerson] = useState(existing?.person ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [touched, setTouched] = useState(false)

  const titleError = !title.trim() ? t('form.required') : undefined
  const valid = !titleError && at !== ''

  const submit = () => {
    setTouched(true)
    if (!valid) return
    const startIso = fromLocalInput(at)
    // End = same day at the given time; empty means one hour.
    const endIso = endTime
      ? fromLocalInput(`${at.slice(0, 11)}${endTime}`)
      : new Date(new Date(startIso).getTime() + 60 * 60_000).toISOString()
    const draft = {
      title: title.trim(),
      at: startIso,
      endAt: endIso,
      location: location.trim(),
      person: person.trim(),
      note: note.trim(),
    }
    if (existing) updateGeneralMeeting(existing.id, draft)
    else createGeneralMeeting(draft)
    onClose()
  }

  return (
    <Modal
      title={t(existing ? 'meeting.edit' : 'meeting.new')}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t('meeting.titleField')}
          value={title}
          onChange={setTitle}
          error={touched ? titleError : undefined}
          required
        />
        <div className="form-grid">
          <Field label={t('meeting.startField')} required>
            <input
              type="datetime-local"
              className="input ltr-nums"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
          <Field label={t('meeting.endField')}>
            <input
              type="time"
              className="input ltr-nums"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        <AutocompleteField
          label={t('meeting.locationField')}
          value={location}
          onChange={setLocation}
          options={Object.keys(LOCALITY_POSITIONS)}
        />
        <TextField
          label={t('meeting.personField')}
          value={person}
          onChange={setPerson}
        />
        <TextArea
          label={t('common.notes')}
          value={note}
          onChange={setNote}
          rows={3}
        />
      </div>

      <div className="mt-5 flex items-center gap-2">
        {existing && (
          <button
            type="button"
            className="btn-ghost text-status-danger-ink hover:bg-status-danger/10"
            onClick={() => {
              deleteGeneralMeeting(existing.id)
              onClose()
            }}
          >
            <Icon name="trash" size={15} />
            {t('meeting.delete')}
          </button>
        )}
        <div className="ms-auto flex gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn-primary" onClick={submit}>
            {t('common.save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
