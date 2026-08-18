import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  CANCEL_REASONS,
  COORDINATOR,
  buildCancellationMessage,
  cancelMission,
  formatDateTime,
  reactivateMission,
  setCancelNoticeSent,
  smsHref,
  whatsappHref,
} from '@core/index'
import type { CancelNotice, CancelReason, MissionView } from '@core/index'

import { Icon } from './Icon'
import { CopyButton, Modal } from './primitives'
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

interface Recipient {
  notice: CancelNotice
  name: string
  phone: string
  roleKey: string
  /** WhatsApp works only where a smartphone does. */
  smartphone: boolean
}

/** Resolve each stored notice back to a person the coordinator can reach. */
function recipientsOf(view: MissionView): Recipient[] {
  return view.mission.cancelNotices.flatMap((notice) => {
    if (notice.recipientKind === 'volunteer') {
      const row = view.volunteers.find(
        (v) => v.volunteer.id === notice.recipientId,
      )
      if (!row) return []
      return [
        {
          notice,
          name: row.volunteer.name,
          phone: row.volunteer.phone,
          roleKey: 'roles.volunteer',
          smartphone: row.volunteer.phoneType === 'smartphone',
        },
      ]
    }
    if (notice.recipientKind === 'driver') {
      const row = view.drivers.find((d) => d.driver.id === notice.recipientId)
      if (!row) return []
      return [
        {
          notice,
          name: row.driver.name,
          phone: row.driver.phone,
          roleKey: 'anchor.labelDriver',
          smartphone: true,
        },
      ]
    }
    const contact = view.farm.contacts.find((c) => c.id === notice.recipientId)
    if (!contact) return []
    return [
      {
        notice,
        name: contact.name,
        phone: contact.phone,
        roleKey: 'anchor.labelFarmer',
        smartphone: true,
      },
    ]
  })
}

export function CancellationPanel({ view }: { view: MissionView }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [openFor, setOpenFor] = useState<string | null>(null)

  const { mission, farm } = view
  if (!mission.cancelledAt || !mission.cancelReason) return null

  const recipients = recipientsOf(view)
  const sent = recipients.filter((r) => r.notice.sentAt !== null).length

  const messageFor = (r: Recipient): string =>
    buildCancellationMessage(
      {
        recipientName: r.name,
        farm,
        startAt: mission.startAt,
        reasonLabel: t(`cancel.reason_${mission.cancelReason}`),
        note: mission.cancelNote,
        coordinatorName: COORDINATOR.name,
        coordinatorPhone: COORDINATOR.phone,
        locale,
      },
      {
        title: t('cancel.msgTitle'),
        greeting: t('cancel.msgGreeting'),
        farm: t('anchor.labelFarm'),
        date: t('missions.date'),
        reason: t('cancel.reasonLabel'),
        ask: t('cancel.msgAsk'),
        signature: t('cancel.msgSignature'),
      },
    )

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

      {/* A45 — the notices, with the sent-count doing the nagging. */}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-caption font-semibold text-content-primary">
            {t('cancel.messagesTitle')}
          </p>
          <span
            className={`chip ${
              sent === recipients.length
                ? 'bg-status-success/15 text-status-success-ink'
                : 'bg-status-warn/15 text-status-warn-ink'
            }`}
          >
            <span className="numeric ltr-nums">
              {t('cancel.noticesProgress', {
                sent,
                total: recipients.length,
              })}
            </span>
          </span>
        </div>
        <p className="muted mt-1">{t('cancel.messagesHint')}</p>

        <ul className="mt-2.5 flex flex-col divide-y divide-edge-subtle">
          {recipients.map((r) => {
            const key = `${r.notice.recipientKind}-${r.notice.recipientId}`
            const body = messageFor(r)
            const isSent = r.notice.sentAt !== null
            return (
              <li key={key} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpenFor(openFor === key ? null : key)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  >
                    <Icon
                      name={openFor === key ? 'chevronDown' : 'chevron'}
                      size={13}
                      className={`shrink-0 text-content-muted ${
                        openFor === key ? '' : 'rtl:-scale-x-100'
                      }`}
                    />
                    <span className="truncate text-caption font-medium text-content-primary">
                      {r.name}
                    </span>
                    <span className="chip bg-surface-high text-content-secondary">
                      {t(r.roleKey)}
                    </span>
                  </button>

                  <CopyButton value={body} className="btn-ghost py-1 text-micro" />
                  {r.smartphone ? (
                    <a
                      href={whatsappHref(r.phone, body)}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-ghost py-1 text-micro"
                    >
                      <Icon name="whatsapp" size={13} />
                      {t('common.whatsapp')}
                    </a>
                  ) : (
                    <a href={smsHref(r.phone, body)} className="btn-ghost py-1 text-micro">
                      <Icon name="message" size={13} />
                      {t('common.sms')}
                    </a>
                  )}

                  {isSent ? (
                    <button
                      type="button"
                      onClick={() =>
                        setCancelNoticeSent(
                          mission.id,
                          r.notice.recipientKind,
                          r.notice.recipientId,
                          false,
                        )
                      }
                      title={t('cancel.unmarkSent')}
                      className="chip bg-status-success/15 text-status-success-ink"
                    >
                      <Icon name="check" size={11} />
                      {t('cancel.sentAt', {
                        when: formatDateTime(r.notice.sentAt as string, locale),
                      })}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setCancelNoticeSent(
                          mission.id,
                          r.notice.recipientKind,
                          r.notice.recipientId,
                          true,
                        )
                      }
                      className="btn-secondary py-1 text-micro"
                    >
                      <Icon name="check" size={13} />
                      {t('cancel.markSent')}
                    </button>
                  )}
                </div>

                {openFor === key && (
                  <pre
                    className="mt-2 whitespace-pre-wrap rounded-field bg-surface-high p-3
                               font-sans text-caption text-content-secondary"
                    dir="rtl"
                  >
                    {body}
                  </pre>
                )}
              </li>
            )
          })}
        </ul>

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
