import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  OUTREACH_EVENTS,
  buildGroupKit,
  buildOutreachMessage,
  emailRecipients,
  formatDateTime,
  mailtoHref,
  outreachRecipients,
  outreachSubject,
  setOutreachSent,
  smsGroupRecipients,
  smsHref,
  whatsappHref,
} from '@core/index'
import type {
  MissionView,
  OutreachChannel,
  OutreachEvent,
  OutreachLabels,
  OutreachRecipient,
} from '@core/index'

import { Icon } from './Icon'
import type { IconName } from './Icon'
import { CopyButton, Callout, Modal, Toggle } from './primitives'
import { useLocale } from '../hooks/useLocale'

/**
 * P0bis.5b — THE SENDING CENTRE.
 *
 * One screen per guard that answers "everybody has been told" — for the three
 * events that need telling: the guard was created, it changed, it is off.
 *
 * What it is NOT, and cannot be: a sender. No third-party application may send
 * a WhatsApp or an SMS on a user's behalf, so every button here is a HAND-OFF
 * — it opens the coordinator's own WhatsApp / Messages / Mail with the message
 * already written, and he presses send. The "sent" ticks are therefore the
 * only record that exists, which is exactly why they are a checklist and not a
 * status: the app does not know, the coordinator does.
 *
 * Email is the one channel a server can send by itself, and P3.3bis will do
 * that. The screen says so out loud rather than leaving the coordinator to
 * wonder why one of three channels behaves differently later.
 */
const CHANNEL_ICON: Record<OutreachChannel, IconName> = {
  whatsapp: 'whatsapp',
  sms: 'message',
  email: 'mail',
}

const KIND_LABEL: Record<OutreachRecipient['kind'], string> = {
  volunteer: 'roles.volunteer',
  driver: 'anchor.labelDriver',
  farmer: 'anchor.labelFarmer',
}

/** The label bag `@core/outreach` needs, resolved once per render. */
export function useOutreachLabels(): OutreachLabels {
  const { t } = useTranslation()
  return useMemo(
    () => ({
      title: {
        created: t('outreach.event.created'),
        updated: t('outreach.event.updated'),
        cancelled: t('outreach.event.cancelled'),
      },
      greeting: t('outreach.greeting'),
      farm: t('anchor.labelFarm'),
      date: t('missions.date'),
      time: t('outreach.timeRange'),
      anchorPoint: t('anchor.labelAnchor'),
      navigation: t('anchor.labelNavigation'),
      driver: t('anchor.labelDriver'),
      coordinator: t('anchor.labelCoordinator'),
      reason: t('cancel.reasonLabel'),
      askCreated: t('outreach.askCreated'),
      askUpdated: t('outreach.askUpdated'),
      askCancelled: t('outreach.askCancelled'),
      signature: t('outreach.signature'),
      groupName: t('outreach.groupName'),
    }),
    [t],
  )
}

function channelHref(
  channel: OutreachChannel,
  recipient: OutreachRecipient,
  body: string,
  subject: string,
): string {
  if (channel === 'whatsapp') return whatsappHref(recipient.phone, body)
  if (channel === 'sms') return smsHref(recipient.phone, body)
  return mailtoHref(recipient.email, subject, body)
}

export function OutreachPanel({
  view,
  event,
  onEventChange,
  events = OUTREACH_EVENTS,
  note = '',
  reasonLabel = '',
}: {
  view: MissionView
  event: OutreachEvent
  /** Omitted when the caller pins the event (the cancellation panel does). */
  onEventChange?: (event: OutreachEvent) => void
  /**
   * Which events the toggle offers. A guard that is NOT cancelled must not
   * offer to announce its cancellation: the message would be true of nothing,
   * and the tick would record telling somebody a falsehood.
   */
  events?: readonly OutreachEvent[]
  note?: string
  reasonLabel?: string
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const labels = useOutreachLabels()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)

  const recipients = outreachRecipients(view)
  const kosher = smsGroupRecipients(recipients)
  const withEmail = emailRecipients(recipients)

  const sentKey = (r: OutreachRecipient) => `${r.kind}-${r.id}`
  const sentAt = (r: OutreachRecipient): string | null =>
    view.mission.outreach.find(
      (n) =>
        n.event === event && n.recipientKind === r.kind && n.recipientId === r.id,
    )?.sentAt ?? null

  const sentCount = recipients.filter((r) => sentAt(r) !== null).length

  const bodyFor = (r: OutreachRecipient) =>
    buildOutreachMessage({ event, view, recipient: r, note, reasonLabel, locale }, labels)
  const subject = outreachSubject({ event, view, locale }, labels)

  /**
   * The GROUPED SMS: one message, every kosher phone in the `sms:` recipient
   * list. Sending eight identical messages one at a time is eight chances to
   * skip somebody at 16:40. The body is the kosher one — no links.
   */
  const groupSmsHref =
    kosher.length > 0
      ? smsHref(kosher.map((r) => r.phone).join(','), bodyFor(kosher[0]))
      : ''
  const groupEmailHref =
    withEmail.length > 0
      ? mailtoHref(withEmail.map((r) => r.email), subject, bodyFor(withEmail[0]))
      : ''

  return (
    <div className="flex flex-col gap-3">
      {onEventChange && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Toggle
            value={event}
            onChange={(v) => onEventChange(v as OutreachEvent)}
            options={events.map((e) => ({
              value: e,
              label: t(`outreach.event.${e}`),
            }))}
          />
          <button
            type="button"
            data-prepare-group
            className="btn-secondary py-1.5 text-micro"
            onClick={() => setGroupOpen(true)}
          >
            <Icon name="whatsapp" size={14} />
            {t('outreach.prepareGroup')}
          </button>
        </div>
      )}

      <p className="muted">{t('outreach.hint')}</p>

      {/* The constraint, stated once, where the question arises. A coordinator
          who does not know why nothing sends itself assumes it is broken. */}
      <Callout tone="info" title={t('outreach.title')}>
        {t('outreach.legalNote')}
      </Callout>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`chip ${
            sentCount === recipients.length && recipients.length > 0
              ? 'bg-status-success/15 text-status-success-ink'
              : 'bg-status-warn/15 text-status-warn-ink'
          }`}
        >
          <span className="numeric ltr-nums">
            {t('outreach.progress', {
              sent: sentCount,
              total: recipients.length,
            })}
          </span>
        </span>
      </div>

      {/* --- the two grouped actions ---------------------------------------- */}
      <div className="auto-cols gap-2 [--col-min:14rem]">
        {groupSmsHref ? (
          <a
            href={groupSmsHref}
            data-bulk="sms"
            className="btn-secondary justify-start"
          >
            <Icon name="message" size={15} />
            {t('outreach.bulkSms', { count: kosher.length })}
          </a>
        ) : (
          <span className="muted rounded-field bg-surface-high px-3 py-2">
            {t('outreach.bulkSmsNone')}
          </span>
        )}
        {groupEmailHref ? (
          <a
            href={groupEmailHref}
            data-bulk="email"
            className="btn-secondary justify-start"
          >
            <Icon name="mail" size={15} />
            {t('outreach.bulkEmail', { count: withEmail.length })}
          </a>
        ) : (
          <span className="muted rounded-field bg-surface-high px-3 py-2">
            {t('outreach.bulkEmailNone')}
          </span>
        )}
      </div>
      <p className="muted">{t('outreach.autoEmailSoon')}</p>

      {/* --- one row per person --------------------------------------------- */}
      <ul data-outreach-list className="flex flex-col divide-y divide-edge-subtle">
        {recipients.map((r) => {
          const key = sentKey(r)
          const when = sentAt(r)
          const body = bodyFor(r)
          return (
            <li key={key} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenFor(openFor === key ? null : key)}
                  /* X6 — `min-w-[11rem]` IS WHAT MAKES THE ROW WRAP. With
                     `min-w-0` this button gave way to the last pixel — measured
                     at 22 px inside a 222 px row at 25 % of the seam — and the
                     two pills inside it were then squeezed into two lines each.
                     A floor turns the squeeze into a line break of the row,
                     which is what `flex-wrap` on the parent is there for. */
                  className="flex min-w-[11rem] flex-1 items-center gap-2 text-start"
                  aria-expanded={openFor === key}
                >
                  <Icon
                    name={openFor === key ? 'chevronDown' : 'chevron'}
                    size={13}
                    className={`shrink-0 text-content-muted ${
                      openFor === key ? '' : 'rtl:-scale-x-100'
                    }`}
                  />
                  <span
                    data-outreach-name
                    className="truncate text-caption font-medium text-content-primary"
                  >
                    {r.name}
                  </span>
                  <span className="chip bg-surface-high text-content-secondary">
                    {t(KIND_LABEL[r.kind])}
                  </span>
                  {r.isGroupPhone && (
                    <span className="chip bg-accent/15 text-accent-ink">
                      <Icon name="phone" size={10} />
                      {t('volunteers.groupPhoneHolder')}
                    </span>
                  )}
                </button>

                {/* One button per channel this person can actually receive. */}
                {r.channels.map((channel) => (
                  <a
                    key={channel}
                    data-channel={channel}
                    href={channelHref(channel, r, body, subject)}
                    target={channel === 'whatsapp' ? '_blank' : undefined}
                    rel="noreferrer"
                    title={t(`outreach.channelWhy.${channel}`)}
                    className="btn-ghost py-1 text-micro"
                  >
                    <Icon name={CHANNEL_ICON[channel]} size={13} />
                    {t(`outreach.channel.${channel}`)}
                  </a>
                ))}
                {!r.email && (
                  <span
                    className="text-micro text-content-muted/60"
                    title={t('outreach.noEmail')}
                  >
                    <Icon name="mail" size={13} />
                  </span>
                )}

                <CopyButton value={body} className="btn-ghost py-1 text-micro" />

                {when ? (
                  <button
                    type="button"
                    onClick={() =>
                      setOutreachSent(view.mission.id, event, r.kind, r.id, false)
                    }
                    data-sent-at={when}
                    className="chip bg-status-success/15 text-status-success-ink"
                    title={t('outreach.undo')}
                  >
                    <Icon name="check" size={11} />
                    {t('outreach.sentAt', { when: formatDateTime(when, locale) })}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setOutreachSent(view.mission.id, event, r.kind, r.id, true)
                    }
                    data-mark-sent
                    className="btn-ghost py-1 text-micro"
                  >
                    <Icon name="check" size={13} />
                    {t('outreach.markSent')}
                  </button>
                )}
              </div>

              {openFor === key && (
                <textarea
                  readOnly
                  value={body}
                  rows={Math.min(16, body.split('\n').length + 1)}
                  dir="rtl"
                  className="mt-2 w-full resize-y rounded-field border border-edge-strong bg-surface-raised p-3 font-sans text-micro leading-relaxed text-content-primary"
                />
              )}
            </li>
          )
        })}
      </ul>

      {groupOpen && <GroupKitModal view={view} onClose={() => setGroupOpen(false)} />}
    </div>
  )
}

/**
 * P0bis.5c — THE GROUP HELPER.
 *
 * WhatsApp will not let an application create a group, so the next best thing
 * is to remove every step that involves typing: the group's name, the members'
 * numbers in the international form WhatsApp's own search field matches, and
 * the opening message. Three copies and three pastes.
 *
 * Kosher phones are EXCLUDED from the number list and named separately. A
 * number in that list that silently never joins would leave the coordinator
 * believing a person is in the group when he is not — which is the failure the
 * whole sending centre exists to prevent.
 */
export function GroupKitModal({
  view,
  onClose,
}: {
  view: MissionView
  onClose: () => void
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const labels = useOutreachLabels()
  const kit = buildGroupKit(view, labels, locale)
  const numbers = kit.numbers.join('\n')

  return (
    <Modal title={t('outreach.groupTitle')} onClose={onClose} wide>
      <div className="flex flex-col gap-4">
        <p className="muted">{t('outreach.groupIntro')}</p>

        <ol className="flex flex-col gap-1.5">
          {['groupStep1', 'groupStep2', 'groupStep3'].map((key, i) => (
            <li key={key} className="flex gap-2.5 text-caption text-content-secondary">
              <span className="numeric flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-accent/15 text-micro font-bold text-accent-ink">
                {i + 1}
              </span>
              {t(`outreach.${key}`)}
            </li>
          ))}
        </ol>

        <Field label={t('outreach.groupNameField')} value={kit.name} rows={1} />
        <Field
          label={`${t('outreach.groupNumbers')} · ${kit.numbers.length}`}
          value={numbers}
          rows={Math.min(10, kit.numbers.length + 1)}
          ltr
          hint={t('outreach.groupIncludesCoordinator')}
        />
        <Field
          label={t('outreach.groupMessage')}
          value={kit.message}
          rows={Math.min(16, kit.message.split('\n').length + 1)}
        />

        {kit.excluded.length > 0 && (
          <Callout tone="warn" title={t('phoneType.kosher')}>
            {t('outreach.groupExcluded', { count: kit.excluded.length })}
            <span className="mt-1 block text-micro">
              {kit.excluded.map((r) => r.name).join(' · ')}
            </span>
          </Callout>
        )}
      </div>
    </Modal>
  )
}

function Field({
  label,
  value,
  rows,
  ltr = false,
  hint,
}: {
  label: string
  value: string
  rows: number
  ltr?: boolean
  hint?: string
}) {
  return (
    <div data-kit-field>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="label mb-0">{label}</span>
        <CopyButton value={value} />
      </div>
      {/* Read-only textarea rather than a styled block: it is selectable
          everywhere, including where the Clipboard API is blocked (plain http
          on a phone), which is the case the copy button cannot cover. */}
      <textarea
        readOnly
        value={value}
        rows={rows}
        dir={ltr ? 'ltr' : 'rtl'}
        className={`w-full resize-y rounded-field border border-edge-strong bg-surface-raised p-3 font-sans text-caption leading-relaxed text-content-primary ${
          ltr ? 'ltr-nums text-start' : ''
        }`}
      />
      {hint && <p className="muted mt-1">{hint}</p>}
    </div>
  )
}
