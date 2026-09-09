import { useTranslation } from 'react-i18next'

import {
  buildFarmerLink,
  buildFarmerLinkMessage,
  dayKeyOf,
  documentChecklist,
  farmerTokenFor,
  formatDate,
  lastFourOf,
  now,
  readCoordinator,
  renewalStatus,
  smsHref,
  whatsappHref,
} from '@core/index'
import type { Farm } from '@core/index'

import { renewalWindowDays } from '../settings/renewal'
import { useLocale } from '../hooks/useLocale'
import { CopyButton, Callout, Section } from './primitives'
import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG3.1 · AG5 (2026-09-09) — LE LIEN DE L'AGRICULTEUR, CÔTÉ COORDINATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★★ L'ORIGINE EST LUE SUR LA PAGE ET NON COMPILÉE. `window.location` porte
 *    déjà la bonne réponse dans les trois cas qui existent — l'app réelle, le
 *    jumeau sous `/demo/`, et un aperçu local sur un port — et une constante
 *    aurait été fausse dans deux d'entre eux. C'est aussi ce qui fait qu'un
 *    lien envoyé depuis le jumeau ouvre le jumeau, ce qui est ce qu'on veut
 *    quand on montre la chose à quelqu'un.
 *
 * ⚠️ ET LE `pathname` COMPTE, PAS SEULEMENT L'ORIGINE. Le déployé est servi
 *    sous `/lo-yanum/` ; une URL construite sur la seule origine donnerait
 *    `azmer-fts.github.io/#/f/…`, c'est-à-dire un 404 chez GitHub Pages. Ce
 *    qui est pris est donc tout ce qui précède le `#`.
 */
function appOrigin(): string {
  if (typeof window === 'undefined') return ''
  const { origin, pathname } = window.location
  return `${origin}${pathname}`.replace(/\/index\.html$/, '').replace(/\/+$/, '')
}

export function FarmerLinkBlock({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const coordinator = readCoordinator()

  /**
   * ⚠️ LE CONTACT PRINCIPAL, ET S'IL N'Y EN A PAS, LE PREMIER. Une fiche sans
   *    contact du tout ne peut pas avoir de lien : il n'y a personne à qui
   *    l'envoyer et personne dont demander les quatre chiffres. Le bloc le dit
   *    plutôt que d'afficher un lien mort.
   */
  const contact = farm.contacts.find((c) => c.isPrimary) ?? farm.contacts[0] ?? null
  const todayKey = dayKeyOf(now())
  const renewal = renewalStatus(farm, todayKey, renewalWindowDays())
  const checklist = documentChecklist(farm)
  const missing = checklist.filter((l) => l.provided === null).length

  if (!contact) {
    return (
      <Section title={t('renewal.linkTitle')} collapseKey="entity-farmer-link">
        <Callout tone="warn" title={t('renewal.linkTitle')}>
          {t('farms.noContact')}
        </Callout>
      </Section>
    )
  }

  const link = buildFarmerLink(appOrigin(), farmerTokenFor(farm, contact.id))
  const phone = (contact.phone ?? '').trim() || (farm.farmerPhone ?? '').trim()
  const body = buildFarmerLinkMessage({
    farmerName: farm.farmerName || contact.name,
    farmName: farm.farmName || farm.name,
    until: renewal.state === 'due' ? renewal.until : null,
    link,
    coordinatorName: coordinator.name,
    coordinatorPhone: coordinator.phone,
    labels: {
      greeting: t('renewal.msgGreeting'),
      intro: t('renewal.msgIntro'),
      renewal: t('renewal.msgRenewal'),
      ask: t('renewal.msgAsk'),
      signature: t('renewal.msgSignature'),
    },
  })

  const four = lastFourOf(phone)

  return (
    <Section
      title={t('renewal.linkTitle')}
      collapseKey="entity-farmer-link"
      defaultOpen={false}
      summary={renewal.state === 'due' ? t('renewal.title') : undefined}
    >
      {renewal.state === 'due' && (
        <Callout tone="warn" title={t('renewal.dueTitle')}>
          <span data-testid="farm-renewal-due">
            {t('renewal.dueBody', { days: renewal.daysLeft, date: renewal.until })}
          </span>
        </Callout>
      )}

      <p className="muted mt-2">{t('renewal.linkHint')}</p>

      {/* ★ AG2 — LES QUATRE CHIFFRES SONT MONTRÉS AU COORDINATEUR, ET C'EST
          NÉCESSAIRE : c'est lui qui les dit au téléphone quand l'agriculteur
          n'a pas compris la question. Les cacher rendrait la porte
          indépannable, ce qui est le contraire de ce qu'AG2.4 demande.
          ⚠️ Une fiche SANS numéro n'a pas de porte du tout, et le bloc le dit
          plutôt que de laisser croire à une protection qui n'existe pas. */}
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <span className="muted">{t('challenge.label', { n: 4 })}</span>
        {four ? (
          <span className="ltr-nums chip bg-accent/15 text-accent-ink" dir="ltr" data-testid="farm-link-four">
            {four}
          </span>
        ) : (
          <span className="chip bg-status-warn/15 text-status-warn-ink" data-testid="farm-link-nofour">
            {t('challenge.noNumber')}
          </span>
        )}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={link} label={t('renewal.copyLink')} />
        <a
          href={smsHref([phone], body)}
          data-testid="farm-link-sms"
          className={`btn-primary ${phone === '' ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Icon name="message" size={16} />
          {t('renewal.sendLink')}
        </a>
        <a
          href={whatsappHref(phone, body)}
          data-testid="farm-link-whatsapp"
          className={`btn-secondary ${phone === '' ? 'pointer-events-none opacity-50' : ''}`}
        >
          <Icon name="message" size={16} />
          WhatsApp
        </a>
      </div>

      {/* ★★ AG6.3 — « LE COORDINATEUR VOIT CE QUI EST FOURNI ET CE QUI MANQUE. »
          Ici, sur la fiche, et pas seulement comme un compte dans une file :
          ce qu'on fait de cette information est téléphoner à quelqu'un, et
          c'est sur sa fiche qu'on a son numéro. */}
      <p className="label mt-4">{t('documents.expected')}</p>
      <ul className="mt-1.5 flex flex-col gap-1.5" data-testid="farm-documents">
        {checklist.map((line) => (
          <li
            key={line.id}
            data-testid={`farm-document-${line.id}`}
            data-provided={line.provided ? '1' : '0'}
            className="flex items-center gap-2 rounded-field bg-surface-high px-3 py-2"
          >
            <span
              className={line.provided ? 'text-status-success-ink' : 'text-status-warn-ink'}
            >
              <Icon name={line.provided ? 'check' : 'alert'} size={15} />
            </span>
            <span className="min-w-0 flex-1 truncate text-caption">
              {t(`documents.${line.id}`)}
            </span>
            <span className="muted shrink-0">
              {line.provided
                ? formatDate(line.provided.providedAt, locale)
                : t('documents.missing')}
            </span>
          </li>
        ))}
      </ul>
      {missing > 0 && (
        <p className="muted mt-1.5" data-testid="farm-documents-missing">
          {t('documents.missingCount', { n: missing })}
        </p>
      )}
    </Section>
  )
}
