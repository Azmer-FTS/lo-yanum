import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { contactPhones, contactRoleKey, formatDateTime, institutionContacts, isSecretariatEntry, mailtoHref, whatsappHref } from '@core/index'
import type { DocFarmRow, Institution } from '@core/index'

import { DOC_HOSTING, listInstitutionDocVersions, publishInstitutionDoc, stableDocUrl } from '../../data/institutionDocs'
import type { DocVersion } from '../../data/institutionDocs'
import { Icon } from '../components/Icon'
import { CopyButton } from '../components/primitives'
import { useLocale } from '../hooks/useLocale'
import { onSettingsApplied } from '../settings/applied'
import { DocHasDateError, institutionDocPdf } from './institutionDoc'
import type { DocLayout, InstitutionDocInput } from './institutionDoc'
import { readSetting, writeSetting } from '../../storage/local'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BG (2026-10-14) — GÉNÉRER ET ENVOYER LE DOCUMENT DE L'INSTITUTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   · « הפקת המסמך » produit le document complet (charte du PO,
 *     `institutionDoc.ts`) et le PUBLIE à l'adresse stable de l'institution
 *     (`data/institutionDocs.ts`), sa version horodatée à côté ;
 *   · le lien public pointe TOUJOURS sur la dernière version ;
 *   · les versions précédentes sont listées ici : « qu'est-ce que je leur
 *     avais envoyé la première fois » ;
 *   · l'envoi : un contact qui a un MAIL a l'icône mail (le lien dans le
 *     message préparé), un contact qui a un NUMÉRO a l'icône WhatsApp (le
 *     message pré-rédigé avec LE LIEN — WhatsApp ne joint pas un PDF depuis un
 *     lien, on ne contourne pas). Les icônes n'existent que si la donnée existe,
 *     et seulement quand un document existe : jamais un bouton mort.
 */

/** Le site, le mail et le téléphone du pied de page : un réglage du PO, synchronisé. */
export const DOC_IDENTITY_KEY = 'lo-yanum:institution-doc'
export interface DocIdentity {
  site: string
  email: string
  phone: string
}
/* Le site et le mail PUBLICS de l'association (leur page d'accueil) ; le
   téléphone n'y est pas publié : au PO de le donner. */
const DEFAULT_IDENTITY: DocIdentity = { site: 'artzenu.org.il', email: 'office@artzenu.org.il', phone: '' }

function readIdentity(): DocIdentity {
  try {
    const raw = JSON.parse(readSetting(DOC_IDENTITY_KEY) ?? 'null') as Partial<DocIdentity> | null
    return { ...DEFAULT_IDENTITY, ...(raw ?? {}) }
  } catch {
    return DEFAULT_IDENTITY
  }
}
function useDocIdentity(): [DocIdentity, (next: DocIdentity) => void] {
  const [identity, setState] = useState(readIdentity)
  useEffect(() => onSettingsApplied([DOC_IDENTITY_KEY], () => setState(readIdentity())), [])
  const set = (next: DocIdentity) => {
    setState(next)
    try {
      writeSetting(DOC_IDENTITY_KEY, JSON.stringify(next))
    } catch {
      /* idem */
    }
  }
  return [identity, set]
}

/** Pour les portes : le dernier document produit, sa forme et ses pages. */
declare global {
  interface Window {
    __bgLastDoc?: { layout: DocLayout; bytes: Uint8Array; url: string }
  }
}

export function InstitutionDocBlock({
  inst,
  linked,
  proposed,
  limitText,
  margin,
  nightPct,
}: {
  inst: Institution
  linked: DocFarmRow[]
  proposed: DocFarmRow[]
  limitText: string
  margin: number
  nightPct: number
}) {
  const { t } = useTranslation()
  const locale = useLocale()
  const [identity, setIdentity] = useDocIdentity()
  const [versions, setVersions] = useState<DocVersion[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    setVersions(null)
    setDone(false)
    setError(null)
    void listInstitutionDocVersions(inst.id).then((v) => alive && setVersions(v))
    return () => {
      alive = false
    }
  }, [inst.id])

  const latest = versions && versions.length > 0 ? stableDocUrl(inst.id) : null
  const contacts = institutionContacts(inst)

  const input = (): InstitutionDocInput => ({
    name: inst.name,
    subtitle: [t(`institutions.kind.${inst.kind}`), inst.locality].filter(Boolean).join(' · '),
    kicker: t('instDoc.kicker'),
    facts: {
      title: t('instDoc.factsTitle'),
      rows: [
        [t('instDoc.fact.kind'), t(`institutions.kind.${inst.kind}`)],
        [t('instDoc.fact.locality'), inst.locality],
        [t('instDoc.fact.address'), inst.address ?? ''],
        [t('instDoc.fact.audience'), t(`institutions.audience.${inst.audience}`)],
        [t('instDoc.fact.network'), inst.network],
        [t('instDoc.fact.students'), inst.students !== null ? String(inst.students) : ''],
      ],
    },
    contacts: {
      title: t('instDoc.contactsTitle'),
      empty: t('instDoc.contactsEmpty'),
      rows: contacts.map((c) => ({
        role: isSecretariatEntry(c) ? t('institutions.phoneLabel.secretariat') : t(`institutions.role.${contactRoleKey(inst, c.role)}`),
        name: c.name,
        phones: contactPhones(c).map((p) => p.number).join(' / '),
        email: c.email ?? '',
      })),
    },
    fill: {
      title: t('instDoc.fillTitle'),
      intro: t('instDoc.fillIntro'),
      fields: [t('instDoc.fillField.coordinator'), t('instDoc.fillField.phone'), t('instDoc.fillField.email'), t('instDoc.fillField.volunteers'), t('instDoc.fillField.nights'), t('instDoc.fillField.notes')],
    },
    farms: {
      columns: { name: t('instDoc.col.name'), locality: t('instDoc.col.locality'), km: t('instDoc.col.km'), min: t('instDoc.col.min') },
      linkedTitle: t('instDoc.linkedTitle', { count: linked.length }),
      linkedEmpty: t('instDoc.linkedEmpty'),
      linked,
      proposedTitle: t('instDoc.proposedTitle', { limit: limitText, count: proposed.length }),
      proposedEmpty: t('instDoc.proposedEmpty', { limit: limitText }),
      proposed,
      note: nightPct > 0 ? t('instDoc.timesNoteNight', { margin, night: nightPct }) : t('instDoc.timesNote', { margin }),
    },
    boxes: [
      { title: t('instDoc.box1Title'), lines: [t('instDoc.box1Line1'), t('instDoc.box1Line2'), t('instDoc.box1Line3')] },
      {
        title: t('instDoc.box2Title'),
        lines: [t('instDoc.box2Line1'), t('instDoc.box2Line2'), ...[identity.site, identity.email, identity.phone].filter((s) => s.trim())],
      },
    ],
    footer: identity,
    title: inst.name,
    author: t('instDoc.author'),
  })

  const generate = async () => {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      const fileName = `${inst.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || inst.id}.pdf`
      const { file, layout } = await institutionDocPdf(input(), fileName)
      const published = await publishInstitutionDoc(inst.id, file)
      /* Pour les portes : la forme et les octets du dernier document (les pages
         sont les JPEG du fichier lui-même). */
      window.__bgLastDoc = { layout, bytes: new Uint8Array(await file.arrayBuffer()), url: published.url }
      setVersions(await listInstitutionDocVersions(inst.id))
      setDone(true)
    } catch (e) {
      setError(e instanceof DocHasDateError ? t('instDoc.errorDate') : t('instDoc.errorPublish'))
    } finally {
      setBusy(false)
    }
  }

  const message = (who: string) => t('instDoc.message', { who, inst: inst.name, url: latest ?? '' })
  const senders = contacts.filter((c) => contactPhones(c).length > 0 || (c.email ?? '').trim() !== '')

  return (
    <section className="mt-4 rounded-card bg-surface-raised p-3 shadow-card" data-testid="coverage-doc" data-hosting={DOC_HOSTING} data-versions={versions?.length ?? ''}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-caption font-bold text-content-secondary">
          <Icon name="document" size={16} />
          {t('instDoc.blockTitle')}
        </p>
        <button type="button" className="btn-primary min-h-11" onClick={() => void generate()} disabled={busy} data-testid="coverage-doc-generate" data-busy={busy ? 'true' : 'false'}>
          <Icon name={latest ? 'history' : 'document'} size={16} />
          {busy ? t('instDoc.generating') : latest ? t('instDoc.regenerate') : t('instDoc.generate')}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-caption font-semibold text-status-danger-ink" data-testid="coverage-doc-error">
          {error}
        </p>
      )}
      {done && (
        <p className="mt-2 text-caption font-semibold text-status-success-ink" data-testid="coverage-doc-done">
          {t('instDoc.done')}
        </p>
      )}
      {latest && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={latest} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-11" data-testid="coverage-doc-open">
            <Icon name="external" size={15} />
            {t('instDoc.open')}
          </a>
          <CopyButton value={latest} label={t('instDoc.copyLink')} className="btn-ghost min-h-11" />
        </div>
      )}
      {DOC_HOSTING === 'memory' && <p className="muted mt-1 text-micro">{t('instDoc.memoryOnly')}</p>}

      {/* ★ L'ENVOI — seulement ce qui existe : un mail, un numéro, un document. */}
      {latest ? (
        senders.length > 0 && (
          <ul className="mt-3 flex flex-col divide-y divide-edge-subtle/60 border-t border-edge-subtle" data-testid="coverage-doc-send">
            {senders.map((c) => {
              const phone = contactPhones(c)[0]?.number ?? ''
              const who = c.name || (isSecretariatEntry(c) ? t('institutions.phoneLabel.secretariat') : t(`institutions.role.${contactRoleKey(inst, c.role)}`))
              return (
                <li key={c.id} className="flex min-h-11 items-center gap-2 py-1 text-caption" data-testid={`coverage-doc-contact-${c.id}`}>
                  <span className="min-w-0 flex-1 truncate font-semibold text-content-primary">{who}</span>
                  {(c.email ?? '').trim() !== '' && (
                    <a
                      href={mailtoHref(c.email as string, t('instDoc.mailSubject', { inst: inst.name }), message(c.name || inst.name))}
                      className="flex h-11 w-11 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high hover:text-accent-ink"
                      aria-label={t('instDoc.sendMail', { who })}
                      title={t('instDoc.sendMail', { who })}
                      data-testid={`coverage-doc-mail-${c.id}`}
                    >
                      <Icon name="mail" size={18} />
                    </a>
                  )}
                  {phone && (
                    <a
                      href={whatsappHref(phone, message(c.name || inst.name))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-11 w-11 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high hover:text-status-success-ink"
                      aria-label={t('instDoc.sendWhatsapp', { who })}
                      title={t('instDoc.sendWhatsapp', { who })}
                      data-testid={`coverage-doc-wa-${c.id}`}
                    >
                      <Icon name="whatsapp" size={18} />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>
        )
      ) : (
        versions !== null && <p className="muted mt-2 text-micro">{t('instDoc.sendAfter')}</p>
      )}

      {versions && versions.length > 0 && (
        <details className="mt-2" data-testid="coverage-doc-versions">
          <summary className="flex min-h-11 cursor-pointer items-center text-caption font-semibold text-content-secondary">{t('instDoc.versions', { count: versions.length })}</summary>
          <ul className="flex flex-col gap-1">
            {versions.map((v, n) => (
              <li key={v.name} className="flex min-h-11 items-center gap-2 text-caption" data-testid="coverage-doc-version" data-name={v.name}>
                <span className="ltr-nums min-w-0 flex-1 text-content-primary">{formatDateTime(v.at.toISOString(), locale)}</span>
                {n === 0 && <span className="chip bg-accent/15 text-accent-ink">{t('instDoc.current')}</span>}
                {n === versions.length - 1 && versions.length > 1 && <span className="chip bg-surface-high text-content-secondary">{t('instDoc.first')}</span>}
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="btn-ghost min-h-11 px-2" aria-label={t('instDoc.openVersion')}>
                  <Icon name="external" size={15} />
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="mt-1" data-testid="coverage-doc-identity">
        <summary className="flex min-h-11 cursor-pointer items-center text-micro font-semibold text-content-muted">{t('instDoc.identityTitle')}</summary>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['site', 'email', 'phone'] as const).map((k) => (
            <label key={k} className="flex flex-col gap-1">
              <span className="text-micro font-semibold text-content-muted">{t(`instDoc.identity.${k}`)}</span>
              <input
                className="input min-h-11"
                dir="ltr"
                inputMode={k === 'phone' ? 'tel' : k === 'email' ? 'email' : 'url'}
                defaultValue={identity[k]}
                onBlur={(e) => e.currentTarget.value.trim() !== identity[k] && setIdentity({ ...identity, [k]: e.currentTarget.value.trim() })}
                data-testid={`coverage-doc-identity-${k}`}
              />
            </label>
          ))}
        </div>
        {identity.phone.trim() === '' && <p className="mt-1 text-micro text-status-warn-ink">{t('instDoc.identityNoPhone')}</p>}
      </details>
    </section>
  )
}
