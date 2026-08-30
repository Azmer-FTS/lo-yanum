import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CANCEL_REASONS,
  cancelMission,
  formatDateTime,
  reactivateMission,
} from '@core/index'
import type { CancelReason, MissionView } from '@core/index'

import { Icon } from './Icon'
import { OutreachPanel } from './outreach'
import { Modal } from './primitives'
import { SelectField, TextArea } from './fields'
import { useLocale } from '../hooks/useLocale'

/**
 * G9bis — calling a guard off, telling everyone, and coming back from it.
 *
 * Three pieces, all mission-detail residents:
 *
 *   CancelMissionModal   the decision: a reason from a closed list (required),
 *                        a note (required when the reason is 'other')
 *   CancellationPanel    the aftermath: what/why/when, the per-recipient
 *                        notices with "sent" tracking, and reactivation
 *
 * The notice list is the heart of it. A guard is cancelled at 16:00 by one
 * person and stood by five; the checklist of "who has been told" is the only
 * thing between the decision and a volunteer standing at a farm gate at 21:30
 * for a night that is not happening.
 */

export function CancelMissionModal({
  missionId,
  onClose,
}: {
  missionId: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState<CancelReason | ''>('')
  const [note, setNote] = useState('')

  // The reason is required outright; the note becomes required when the
  // reason is 'other' — "cancelled: other" explains nothing to anyone.
  const valid = reason !== '' && (reason !== 'other' || note.trim() !== '')

  return (
    <Modal title={t('cancel.modalTitle')} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* The blank first option is the point: the coordinator must CHOOSE a
            reason, not absent-mindedly confirm whatever was pre-selected. */}
        <SelectField<CancelReason | ''>
          label={t('cancel.reasonLabel')}
          value={reason}
          onChange={setReason}
          required
          options={[
            { value: '', label: t('cancel.reasonPick') },
            ...CANCEL_REASONS.map((r) => ({
              value: r as CancelReason | '',
              label: t(`cancel.reason_${r}`),
            })),
          ]}
        />

        <TextArea
          label={
            reason === 'other'
              ? `${t('cancel.noteLabel')} — ${t('common.required')}`
              : `${t('cancel.noteLabel')} (${t('common.optional')})`
          }
          value={note}
          onChange={setNote}
          rows={3}
          placeholder={t('cancel.notePlaceholder')}
        />
        {reason === 'other' && note.trim() === '' && (
          <p className="muted -mt-2">{t('cancel.noteRequiredForOther')}</p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-edge-subtle pt-3">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('cancel.keep')}
          </button>
          {/* status-danger, deliberately NOT the critical orange: decision 49
              keeps that for the four findable emergencies, and a cancellation
              is an ordinary (if sad) administrative act. */}
          <button
            type="button"
            className="btn bg-status-danger text-content-on-accent hover:brightness-95 disabled:opacity-50"
            disabled={!valid}
            onClick={() => {
              if (reason === '') return
              cancelMission(missionId, reason, note)
              onClose()
            }}
          >
            <Icon name="close" size={15} />
            {t('cancel.confirm')}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * G9bis + P0bis.5b — THE AFTERMATH, AND WHO STILL HAS TO BE TOLD.
 *
 * The banner is this panel's own; the notices list is `OutreachPanel` with its
 * event pinned to `cancelled`. G9bis had a hand-written copy of that list, and
 * two things were wrong with the copy the moment the sending centre existed
 * beside it: it offered WhatsApp or SMS but never email, and it drew its
 * recipients from a SNAPSHOT taken at cancel time, so a driver added
 * afterwards was invisible on the one screen whose job is "who has not been
 * told". One list, derived from the mission, three channels.
 */
export function CancellationPanel({ view }: { view: MissionView }) {
  const { t } = useTranslation()
  const locale = useLocale()

  const { mission } = view
  if (!mission.cancelledAt || !mission.cancelReason) return null

  return (
    <div className="card overflow-hidden">
      {/* The what/why/when — the banner every visit to this guard now opens on. */}
      <div className="border-s-4 border-s-status-danger bg-status-danger/10 px-4 py-3">
        <p className="flex flex-wrap items-center gap-2 text-caption font-bold text-status-danger-ink">
          <Icon name="close" size={15} />
          {t('cancel.banner')}
          <span className="font-normal">
            · {t(`cancel.reason_${mission.cancelReason}`)}
          </span>
          <span className="ms-auto text-micro font-normal text-content-muted">
            {t('cancel.bannerAt', {
              when: formatDateTime(mission.cancelledAt, locale),
            })}
          </span>
        </p>
        {mission.cancelNote && (
          <p className="mt-1 text-caption text-content-secondary">
            {mission.cancelNote}
          </p>
        )}
      </div>

      <div className="p-4">
        <p className="mb-1 text-caption font-semibold text-content-primary">
          {t('cancel.messagesTitle')}
        </p>

        <OutreachPanel
          view={view}
          event="cancelled"
          note={mission.cancelNote}
          reasonLabel={t(`cancel.reason_${mission.cancelReason}`)}
        />

        {/* A46 — the way back: recruiting, with every yes to re-earn. */}
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-edge-subtle pt-3">
          <p className="muted min-w-0 flex-1">{t('cancel.reactivateHint')}</p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => reactivateMission(mission.id)}
          >
            <Icon name="history" size={15} />
            {t('cancel.reactivate')}
          </button>
        </div>
      </div>
    </div>
  )
}
