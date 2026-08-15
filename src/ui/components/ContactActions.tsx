import { useTranslation } from 'react-i18next'

import { smsHref, telHref, whatsappHref } from '@core/index'

import { Icon } from './Icon'

/**
 * Call / WhatsApp / SMS for one person. On a phone these are the whole point of
 * the app, so the call target is a large tap area and the number is always
 * rendered LTR inside the RTL layout.
 */
/** The three action buttons on their own — for rows that already show a name. */
export function ContactButtons({
  name,
  phone,
  message,
}: {
  name: string
  phone: string
  /** Optional prefilled body for the WhatsApp / SMS actions. */
  message?: string
}) {
  const { t } = useTranslation()

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <a
        href={telHref(phone)}
        aria-label={`${t('common.call')} ${name}`}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-night-800 text-white transition-colors hover:bg-night-700"
      >
        <Icon name="phone" size={18} />
      </a>
      <a
        href={whatsappHref(phone, message)}
        target="_blank"
        rel="noreferrer"
        aria-label={`${t('common.whatsapp')} ${name}`}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-sand-300 text-emerald-700 transition-colors hover:bg-sand-100"
      >
        <Icon name="whatsapp" size={18} />
      </a>
      <a
        href={smsHref(phone, message)}
        aria-label={`${t('common.sms')} ${name}`}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-sand-300 text-night-800 transition-colors hover:bg-sand-100"
      >
        <Icon name="message" size={18} />
      </a>
    </div>
  )
}

export function ContactActions({
  name,
  phone,
  role,
  message,
}: {
  name: string
  phone: string
  role?: string
  message?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-night-950">{name}</p>
        <p className="ltr-nums text-xs text-night-950/50">{phone}</p>
        {role && <p className="truncate text-xs text-night-950/50">{role}</p>}
      </div>
      <ContactButtons name={name} phone={phone} message={message} />
    </div>
  )
}

/** Call-only variant for the field screens, where one tap is the whole story. */
export function CallRow({
  name,
  phone,
  label,
}: {
  name: string
  phone: string
  label: string
}) {
  return (
    <a
      href={telHref(phone)}
      className="flex items-center gap-3 rounded-xl border border-sand-200 px-3.5 py-3 transition-colors hover:bg-sand-100"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-night-100 text-night-800">
        <Icon name="phone" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-night-950/50">{label}</span>
        <span className="block truncate text-sm font-medium">{name}</span>
      </span>
      <span className="ltr-nums shrink-0 text-sm text-night-950/60">{phone}</span>
    </a>
  )
}
