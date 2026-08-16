import { useTranslation } from 'react-i18next'

import { smsHref, telHref, whatsappHref } from '@core/index'

import { Icon } from './Icon'

/**
 * Call / WhatsApp / SMS for one person. On a phone these are the whole point of
 * the app, so the call target is a large tap area and the number always renders
 * LTR inside the RTL layout.
 */

/** The three action buttons alone — for rows that already show a name. */
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
        className="flex h-10 w-10 items-center justify-center rounded-md bg-accent text-content-on-accent
                   transition-all duration-fast ease-out hover:bg-accent-strong active:scale-95"
      >
        <Icon name="phone" size={18} />
      </a>
      <a
        href={whatsappHref(phone, message)}
        target="_blank"
        rel="noreferrer"
        aria-label={`${t('common.whatsapp')} ${name}`}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-edge-strong
                   text-status-success transition-all duration-fast ease-out
                   hover:bg-status-success/10 active:scale-95"
      >
        <Icon name="whatsapp" size={18} />
      </a>
      <a
        href={smsHref(phone, message)}
        aria-label={`${t('common.sms')} ${name}`}
        className="flex h-10 w-10 items-center justify-center rounded-md border border-edge-strong
                   text-content-secondary transition-all duration-fast ease-out
                   hover:bg-surface-high hover:text-content-primary active:scale-95"
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
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-caption font-medium text-content-primary">
          {name}
        </p>
        <p className="ltr-nums text-micro text-content-muted">{phone}</p>
        {role && (
          <p className="truncate text-micro text-content-muted">{role}</p>
        )}
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
      className="flex items-center gap-3 rounded-md border border-edge-subtle bg-surface-raised px-3.5 py-3
                 transition-all duration-fast ease-out hover:border-accent/40 hover:bg-surface-high active:scale-[0.99]"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
        <Icon name="phone" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-micro text-content-muted">{label}</span>
        <span className="block truncate text-caption font-medium text-content-primary">
          {name}
        </span>
      </span>
      <span className="ltr-nums shrink-0 text-caption text-content-secondary">
        {phone}
      </span>
    </a>
  )
}
