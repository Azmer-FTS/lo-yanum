import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { callRestrictions, isCallRestricted, restrictsCalls } from '@core/calls'
import type { CallContact } from '@core/calls'

import { Link } from 'react-router-dom'

import {
  INSTITUTION_CONTACT_ROLES,
  INSTITUTION_ENGAGEMENTS,
  SECRETARIAT_LABEL,
  isKnownPhoneLabel,
  isSecretariatEntry,
  phoneLabelChoices,
  SINGLE_CONTACT_ROLES,
  comparableInstitutionName,
  contactPhones,
  contactRoleKey,
  getDrivers,
  getInstitutions,
  getVolunteers,
  headRoleKey,
  institutionContacts,
  needsPriorCoordination,
  isInstitutionHeadMissing,
  isInstitutionToConfirm,
  minorsLabel,
  newInstitutionContactId,
  setInstitutionContacts,
  setVolunteerRideWith,
  updateInstitution,
} from '@core/index'
import type { ContactPhone, Driver, Institution, InstitutionContact, InstitutionContactRole, InstitutionEngagement, PhoneLabel, Volunteer } from '@core/index'

import { Avatar } from '../components/Avatar'
import { FormSection, NumberField, TextField } from '../components/fields'
import { Icon } from '../components/Icon'
import { useCoreValue } from '../hooks/useCore'
import { runUndoable } from '../components/UndoToast'

/**
 * ★★ AX1 — L'INSTITUTION, UNE SEULE FOIS : son statut d'engagement et sa
 * fiche éditable vivaient dans `CoverageScreen` (AU/AV). Elles servent
 * désormais deux écrans — מוסדות (l'étape 1 du métier) et מפת כיסוי
 * (l'appariement) — et ne doivent pas diverger.
 */
export const ENGAGEMENT_ON: Record<InstitutionEngagement, string> = {
  not_contacted: 'border-status-info bg-status-info/15 text-status-info-ink',
  contacted: 'border-status-warn bg-status-warn/15 text-status-warn-ink',
  interested: 'border-accent bg-accent/15 text-accent-ink',
  signed: 'border-status-violet bg-status-violet/15 text-status-violet-ink',
  not_relevant: 'border-edge-strong bg-surface-high text-content-primary',
}

export function EngagementSegments({ value, onChange, testId }: { value: InstitutionEngagement; onChange: (e: InstitutionEngagement) => void; testId: string }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('institutions.engagementLabel')} data-testid={testId} className="flex flex-nowrap gap-1">
      {INSTITUTION_ENGAGEMENTS.map((s) => {
        const on = s === value
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t(`institutions.engagement.${s}`)}
            title={t(`institutions.engagement.${s}`)}
            data-testid={`${testId}-${s}`}
            onClick={() => onChange(s)}
            className={`flex min-h-[2.75rem] flex-auto items-center justify-center whitespace-nowrap rounded-field border px-1.5 text-caption font-semibold transition-colors duration-fast ${
              on ? ENGAGEMENT_ON[s] : 'border-edge-subtle text-content-secondary hover:bg-surface-high'
            }`}
          >
            {t(`institutions.engagementShort.${s}`)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * ★★ AZ5 — « חסר ראש ישיבה » : le rang 1 n'est pas encore saisi. Une fiche à
 * relancer, pas une alerte ; le libellé suit la nature (מנהל pour une école).
 */
export function HeadMissingChip({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  if (!isInstitutionHeadMissing(inst)) return null
  return (
    <span className="chip border border-status-warn bg-status-warn/15 text-micro text-status-warn-ink" data-testid={`institution-head-missing-${inst.id}`}>
      {t(`institutions.headMissing.${headRoleKey(inst)}`)}
    </span>
  )
}

/**
 * ★★ AZ5 — « קטינים » et la tranche d'âge. ⛔ UNE INFORMATION : ton neutre,
 * aucune règle, aucun blocage, aucun avertissement n'en dépend.
 */
export function MinorsChip({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  const range = minorsLabel(inst)
  if (!range) return null
  return (
    <span className="chip bg-surface-high text-micro text-content-secondary" data-testid={`institution-minors-${inst.id}`}>
      <span className="ltr-nums">{t('institutions.minors', { range })}</span>
    </span>
  )
}

export const telOf = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`

/** ★★ BD — le texte d'une étiquette : traduite quand elle est connue, telle que saisie sinon. */
export const phoneLabelText = (label: PhoneLabel, t: (k: string) => string): string => (label === '' || isKnownPhoneLabel(label) ? t(`institutions.phoneLabel.${label}`) : label)

/**
 * ★★ BB — « נדרש תיאום מוקדם ». Le marqueur et SON TEXTE (par qui passer)
 * vont toujours ensemble ; posé, il change TOUS les boutons d'appel de
 * l'institution : teinte d'avertissement, et un appel ne part qu'après avoir
 * relu le texte (`guardCall`). Jamais un bouton d'appel ordinaire.
 */
export function coordinationText(inst: Institution, t: (k: string, o?: Record<string, unknown>) => string): string {
  return t('institutions.coordinationCall', { note: (inst.coordinationNote ?? '').trim() || t('institutions.coordination') })
}

/**
 * ★★ BC (2026-10-12) — LE MÊME GARDE, ÉTENDU AU CONTACT. Un contact dont la
 * NOTE restreint l'usage du téléphone (`restrictsCalls`) passe par le même
 * chemin que « נדרש תיאום מוקדם » : teinte d'avertissement, icône ⚠, et un
 * appel qui ne part qu'après avoir relu le texte. Un seul mécanisme, pour les
 * contacts d'institution comme pour ceux d'une ferme (`inst = null`).
 */
export type { CallContact } from '@core/calls'
export { restrictsCalls } from '@core/calls'

/** Les textes à relire avant d'appeler : l'institution d'abord, puis le contact (`callRestrictions`, @core). */
export function callNotices(inst: Institution | null, contact: CallContact | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): string[] {
  return callRestrictions(inst, contact).map((r) =>
    r.kind === 'coordination'
      ? t('institutions.coordinationCall', { note: r.note || t('institutions.coordination') })
      : t('calls.restricted', { name: r.name || t('calls.thisContact'), note: r.note || t('calls.restrictedNoNote') }),
  )
}

/** Le bouton doit-il se montrer en avertissement ? */
export const isCallGuarded = (inst: Institution | null, contact?: CallContact | null): boolean => isCallRestricted(inst, contact)

/** Faut-il composer ? `true` sans rien demander quand rien ne restreint l'appel. */
export function confirmCall(inst: Institution | null, contact: CallContact | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): boolean {
  const notices = callNotices(inst, contact, t)
  if (notices.length === 0) return true
  return window.confirm(`${notices.join('\n\n')}\n\n${t('institutions.coordinationCallAnyway')}?`)
}

/** À poser sur le `onClick` d'un lien d'appel : rien quand rien ne restreint l'appel. */
export function guardCall(inst: Institution | null, t: (k: string, o?: Record<string, unknown>) => string, contact?: CallContact | null) {
  return (e: { preventDefault: () => void }) => {
    if (!confirmCall(inst, contact, t)) e.preventDefault()
  }
}

/** La classe d'un bouton d'appel : ordinaire, ou d'avertissement quand quelque chose restreint l'appel. */
export const callTone = (inst: Institution | null, ordinary: string, contact?: CallContact | null): string =>
  isCallGuarded(inst, contact) ? 'btn-secondary border-status-warn bg-status-warn/15 text-status-warn-ink' : ordinary

/** ★★ BB — le marqueur, AVEC son texte. Liste, vignette, aperçu, carte de couverture. */
export function CoordinationChip({ inst, full = false }: { inst: Institution; full?: boolean }) {
  const { t } = useTranslation()
  if (!needsPriorCoordination(inst)) return null
  const note = (inst.coordinationNote ?? '').trim()
  return (
    <span
      className={`chip border border-status-warn bg-status-warn/15 text-micro font-semibold text-status-warn-ink ${full ? 'whitespace-normal' : 'max-w-full'}`}
      title={note || undefined}
      data-testid={`institution-coordination-${inst.id}`}
      dir="auto"
    >
      <Icon name="alert" size={12} className="shrink-0" />
      <span className={full ? '' : 'truncate'}>{note ? `${t('institutions.coordination')} · ${note}` : t('institutions.coordination')}</span>
    </span>
  )
}

/**
 * ★★ BC — la restriction d'un contact, AVEC sa note : à côté du bouton d'appel
 * de la LISTE, là où le PO compose par réflexe. Rien quand rien ne restreint.
 */
export function CallRestrictionChip({ contact, full = false }: { contact: CallContact | null | undefined; full?: boolean }) {
  const { t } = useTranslation()
  if (!restrictsCalls(contact)) return null
  const note = (contact?.note ?? '').trim()
  return (
    <span
      className={`chip border border-status-warn bg-status-warn/15 text-micro font-semibold text-status-warn-ink ${full ? 'whitespace-normal' : 'max-w-full'}`}
      title={note || undefined}
      data-testid="call-restriction-chip"
      dir="auto"
    >
      <Icon name="alert" size={12} className="shrink-0" />
      <span className={full ? '' : 'truncate'}>{note ? `${t('calls.restrictedShort')} · ${note}` : t('calls.restrictedShort')}</span>
    </span>
  )
}

/** ★★ BB — la bannière de la fiche et de l'aperçu : le marqueur, en grand, avant tout bouton d'appel. */
export function CoordinationBanner({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  if (!needsPriorCoordination(inst)) return null
  return (
    <div role="note" className="flex items-start gap-2 rounded-field border border-status-warn bg-status-warn/15 px-3 py-2 text-status-warn-ink" data-testid="institution-coordination-banner">
      <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 text-caption">
        <span className="font-bold">{t('institutions.coordination')}</span>
        {(inst.coordinationNote ?? '').trim() && <span className="block" dir="auto">{inst.coordinationNote}</span>}
      </p>
    </div>
  )
}

/**
 * ★★ AZ5 — LES CONTACTS, RANGÉS PAR RÔLE, ÉDITÉS DEPUIS LA FICHE. Chaque
 * ligne : rôle, nom, téléphone, note. Le rang 1 (ראש ישיבה / מנהל) et le רכז
 * ne se portent qu'une fois : leur rôle est grisé ailleurs dès qu'il est pris.
 * ⛔ Aucun « premier à appeler » : chaque ligne a son propre bouton d'appel.
 */
export function InstitutionContactsEditor({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  const contacts = institutionContacts(inst)
  const [draft, setDraft] = useState<InstitutionContact | null>(null)
  const taken = (role: InstitutionContactRole, self: string) => SINGLE_CONTACT_ROLES.includes(role) && contacts.some((c) => c.role === role && c.id !== self)
  const save = (c: InstitutionContact) => {
    if (contacts.some((x) => x.id === c.id)) {
      setInstitutionContacts(inst.id, contacts.map((x) => (x.id === c.id ? c : x)))
    } else if (c.name.trim() || c.phone.trim()) {
      setInstitutionContacts(inst.id, [...contacts, c])
      setDraft(null)
    } else {
      setDraft(c)
    }
  }
  const remove = (c: InstitutionContact) =>
    runUndoable(t('undo.deleted', { name: c.name || t(`institutions.role.${contactRoleKey(inst, c.role)}`) }), () =>
      setInstitutionContacts(inst.id, contacts.filter((x) => x.id !== c.id)),
    )
  return (
    <section className="flex flex-col gap-2" data-testid="institution-contacts" data-count={contacts.length}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-label font-semibold text-content-primary">{t('institutions.contacts')}</h3>
        <HeadMissingChip inst={inst} />
      </div>
      {contacts.length === 0 && !draft && <p className="muted text-caption">{t('institutions.noContacts')}</p>}
      <ul className="flex flex-col gap-2">
        {[...contacts, ...(draft ? [draft] : [])].map((c) => (
          <ContactRow key={c.id} inst={inst} contact={c} taken={(r) => taken(r, c.id)} onSave={save} onRemove={contacts.some((x) => x.id === c.id) ? () => remove(c) : () => setDraft(null)} />
        ))}
      </ul>
      {!draft && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary min-h-11"
            data-testid="institution-contact-add"
            onClick={() => setDraft({ id: newInstitutionContactId(), role: isInstitutionHeadMissing(inst) ? 'head' : 'contact', name: '', phone: '', note: '' })}
          >
            <Icon name="plus" size={16} />
            {t('institutions.addContact')}
          </button>
          {/* ★★ BD — une entrée sans personne : le numéro et son étiquette « מזכירות ». */}
          <button
            type="button"
            className="btn-ghost min-h-11"
            data-testid="institution-secretariat-add"
            onClick={() => setDraft({ id: newInstitutionContactId(), role: 'contact', name: '', phone: '', phones: [{ number: '', label: SECRETARIAT_LABEL }], note: '' })}
          >
            <Icon name="phone" size={16} />
            {t('institutions.addSecretariat')}
          </button>
        </div>
      )}
    </section>
  )
}

const CUSTOM_LABEL = '__custom'

function ContactRow({ inst, contact, taken, onSave, onRemove }: { inst: Institution; contact: InstitutionContact; taken: (r: InstitutionContactRole) => boolean; onSave: (c: InstitutionContact) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(contact.name)
  /* ★★ BB — plusieurs numéros, chacun son étiquette ; le premier sert aux listes. */
  const initialPhones = (): ContactPhone[] => {
    const list = contactPhones(contact)
    return list.length ? list : [{ number: '', label: 'mobile' }]
  }
  const [phones, setPhones] = useState<ContactPhone[]>(initialPhones)
  const [note, setNote] = useState(contact.note)
  const [customAt, setCustomAt] = useState<number | null>(null)
  /* ★★ BD — les étiquettes connues, puis toutes celles déjà saisies dans la base. */
  const labelChoices = useCoreValue(() => phoneLabelChoices(getInstitutions()))
  const phonesKey = JSON.stringify(contactPhones(contact))
  useEffect(() => {
    setName(contact.name)
    setPhones(initialPhones())
    setNote(contact.note)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id, contact.name, phonesKey, contact.note])
  const commit = (patch: Partial<InstitutionContact> = {}, nextPhones: ContactPhone[] = phones) => {
    const kept = nextPhones.filter((p) => p.number.trim() !== '')
    const next: InstitutionContact = { ...contact, name, note, phone: kept[0]?.number ?? '', phones: kept, ...patch }
    const changed =
      next.role !== contact.role || next.name !== contact.name || next.note !== contact.note || next.restrictsCalls !== contact.restrictsCalls || JSON.stringify(contactPhones(next)) !== phonesKey
    if (changed) onSave(next)
  }
  const setPhoneAt = (n: number, p: Partial<ContactPhone>, save = false) => {
    const next = phones.map((x, k) => (k === n ? { ...x, ...p } : x))
    setPhones(next)
    if (save) commit({}, next)
  }
  /* L'entrée telle qu'elle est À L'ÉCRAN (nom et étiquettes en cours de saisie). */
  const secretariat = isSecretariatEntry({ name, phone: '', phones: phones.map((p) => ({ ...p, number: p.number || '0' })) })
  const roleName = secretariat ? t('institutions.phoneLabel.secretariat') : t(`institutions.role.${contactRoleKey(inst, contact.role)}`)
  const first = phones.find((p) => p.number.trim())?.number ?? ''
  return (
    <li className="rounded-card bg-surface-raised p-2.5 shadow-card" data-testid={`institution-contact-${contact.id}`} data-role={contact.role} data-phones={contactPhones(contact).length}>
      {first && (
        <div className="mb-2">
          <Avatar phone={first} name={contact.name || '?'} size="sm" />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
        {/* ★★ BD — une entrée « מזכירות » (sans nom, numéros étiquetés מזכירות)
            ne prend pas de rang : pas de sélecteur de rôle, son étiquette suffit. */}
        {secretariat ? (
          <p className="flex min-h-11 flex-col justify-end gap-1" data-testid="institution-contact-secretariat">
            <span className="text-micro font-semibold text-content-muted">{t('institutions.roleLabel')}</span>
            <span className="text-caption font-semibold text-content-primary">{t('institutions.phoneLabel.secretariat')}</span>
          </p>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-micro font-semibold text-content-muted">{t('institutions.roleLabel')}</span>
            <select className="input min-h-11" value={contact.role} onChange={(e) => commit({ role: e.target.value as InstitutionContactRole })} data-testid="institution-contact-role">
              {INSTITUTION_CONTACT_ROLES.map((r) => (
                <option key={r} value={r} disabled={taken(r)}>
                  {t(`institutions.role.${contactRoleKey(inst, r)}`)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('institutions.contactName')}</span>
          <input className="input min-h-11" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit()} placeholder={secretariat ? t('institutions.secretariatNoName') : undefined} data-testid="institution-contact-name" />
        </label>
      </div>
      <ul className="mt-2 flex flex-col gap-2" data-testid="institution-contact-phones">
        {phones.map((p, n) => (
          <li key={n} className="flex flex-wrap items-end gap-2" data-testid={`institution-contact-phone-${n}`}>
            <label className="flex w-[7.5rem] flex-col gap-1">
              <span className="text-micro font-semibold text-content-muted">{t('institutions.contactPhone')}</span>
              {customAt === n ? (
                /* ★★ BD — « תווית אחרת… » : l'étiquette se saisit, et rejoint la liste. */
                <input
                  className="input min-h-11"
                  autoFocus
                  defaultValue=""
                  maxLength={24}
                  placeholder={t('institutions.phoneLabelCustom')}
                  onBlur={(e) => {
                    setCustomAt(null)
                    const label = e.currentTarget.value.trim()
                    if (label) setPhoneAt(n, { label }, true)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  data-testid="institution-contact-phone-label-custom"
                />
              ) : (
                <select
                  className="input min-h-11"
                  value={p.label}
                  onChange={(e) => (e.target.value === CUSTOM_LABEL ? setCustomAt(n) : setPhoneAt(n, { label: e.target.value as PhoneLabel }, true))}
                  data-testid="institution-contact-phone-label"
                >
                  {[...labelChoices, ...(labelChoices.includes(p.label) ? [] : [p.label])].map((l) => (
                    <option key={l || 'none'} value={l}>
                      {phoneLabelText(l, t)}
                    </option>
                  ))}
                  <option value={CUSTOM_LABEL}>{t('institutions.phoneLabelOther')}</option>
                </select>
              )}
            </label>
            <div className="min-w-[10rem] flex-1" onBlur={() => commit()}>
              <TextField label={`${t('institutions.contactPhone')}${p.label ? ` · ${phoneLabelText(p.label, t)}` : ''}`} kind="phone" value={p.number} onChange={(v) => setPhoneAt(n, { number: v })} testId="institution-contact-phone" />
            </div>
            {p.number.trim() && (
              <a
                href={telOf(p.number)}
                onClick={guardCall(inst, t, contact)}
                className={`${callTone(inst, 'btn-secondary', contact)} min-h-11`}
                data-testid="institution-contact-call"
                data-guarded={isCallGuarded(inst, contact) ? '' : undefined}
                aria-label={t('institutions.callNumber', { name: contact.name || roleName, label: phoneLabelText(p.label, t) })}
              >
                <Icon name="phone" size={16} />
                {t('institutions.call')}
              </a>
            )}
            {phones.length > 1 && (
              <button
                type="button"
                className="btn-ghost min-h-11"
                aria-label={t('institutions.removePhone', { number: p.number })}
                data-testid="institution-contact-phone-remove"
                onClick={() => {
                  const next = phones.filter((_, k) => k !== n)
                  setPhones(next)
                  commit({}, next)
                }}
              >
                <Icon name="close" size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn-ghost mt-1 min-h-11 text-caption"
        data-testid="institution-contact-phone-add"
        onClick={() => setPhones([...phones, { number: '', label: phones.some((x) => x.label === 'mobile') ? 'home' : 'mobile' }])}
      >
        <Icon name="plus" size={14} />
        {t('institutions.addPhone')}
      </button>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('institutions.contactNote')}</span>
          <input className="input min-h-11" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => commit()} data-testid="institution-contact-note" />
        </label>
        <button type="button" className="btn-ghost min-h-11" onClick={onRemove} aria-label={t('institutions.removeContact', { name: contact.name || roleName })} data-testid="institution-contact-remove">
          <Icon name="trash" size={16} />
        </button>
      </div>
      {/* ★★ BC — « cette note restreint l'usage du téléphone » : tout bouton
          d'appel de ce contact, dans la liste comme ici, le montre et demande
          confirmation. */}
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-caption text-content-secondary">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[rgb(var(--status-warn))]"
          checked={contact.restrictsCalls === true}
          onChange={(e) => commit({ restrictsCalls: e.target.checked ? true : undefined })}
          data-testid="institution-contact-restricts"
        />
        {t('calls.restrictsLabel')}
      </label>
    </li>
  )
}

/**
 * ★★ AZ5 — les contacts, en lecture, rangés par rôle (aperçu, carte de
 * couverture). Le rang 1 manquant est dit, jamais remplacé.
 */
export function InstitutionContactsList({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  const contacts = institutionContacts(inst)
  return (
    <ul className="flex flex-col divide-y divide-edge-subtle/60" data-testid="institution-contacts-list" data-count={contacts.length}>
      {isInstitutionHeadMissing(inst) && (
        <li className="py-2">
          <HeadMissingChip inst={inst} />
        </li>
      )}
      {contacts.map((c) => {
        const phones = contactPhones(c)
        return (
          <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-caption" data-role={c.role} data-testid={`institution-contact-line-${c.id}`} data-phones={phones.length}>
            {/* ★★ BA — la photo de la personne, retrouvée par son téléphone. */}
            <Avatar phone={phones[0]?.number ?? ''} name={c.name || '?'} size="xs" />
            {/* ★★ BD — une entrée « מזכירות » n'a ni rôle ni nom : son étiquette les remplace. */}
            <span className="w-[5.5rem] shrink-0 text-content-muted">{isSecretariatEntry(c) ? t('institutions.phoneLabel.secretariat') : t(`institutions.role.${contactRoleKey(inst, c.role)}`)}</span>
            <span className="min-w-0 flex-1 font-semibold text-content-primary">{c.name || (isSecretariatEntry(c) ? '' : '—')}</span>
            {/* ★★ BB — chaque numéro, appelable, avec son étiquette ; le premier d'abord. */}
            {phones.map((p, n) => (
              <a
                key={n}
                className={`ltr-nums inline-flex min-h-[2.75rem] items-center gap-1 hover:text-accent-ink ${isCallGuarded(inst, c) ? 'font-semibold text-status-warn-ink' : 'text-content-secondary'}`}
                href={telOf(p.number)}
                onClick={guardCall(inst, t, c)}
                dir="ltr"
                data-testid="institution-contact-line-call"
                data-guarded={isCallGuarded(inst, c) ? '' : undefined}
              >
                <Icon name={isCallGuarded(inst, c) ? 'alert' : 'phone'} size={14} />
                {p.number}
                {p.label && phones.length > 1 && <span className="text-micro text-content-muted">({phoneLabelText(p.label, t)})</span>}
              </a>
            ))}
            {c.note && !restrictsCalls(c) && <span className="basis-full text-micro text-content-muted" dir="auto">{c.note}</span>}
            {restrictsCalls(c) && (
              <span className="basis-full">
                <CallRestrictionChip contact={c} full />
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * ★★ BB — les fiches LIÉES (même ensemble, secrétariat partagé) : le lien est
 * réciproque à la lecture (une fiche qui me nomme est liée à moi).
 */
export function relatedInstitutions(inst: Institution, all: readonly Institution[]): Institution[] {
  const ids = new Set([...(inst.relatedIds ?? []), ...all.filter((o) => (o.relatedIds ?? []).includes(inst.id)).map((o) => o.id)])
  ids.delete(inst.id)
  return all.filter((o) => ids.has(o.id))
}

export function RelatedInstitutions({ inst, editable = false }: { inst: Institution; editable?: boolean }) {
  const { t } = useTranslation()
  const all = useCoreValue(() => getInstitutions())
  const linked = relatedInstitutions(inst, all)
  if (!editable && linked.length === 0) return null
  const unlink = (o: Institution) => {
    updateInstitution(inst.id, { relatedIds: (inst.relatedIds ?? []).filter((x) => x !== o.id) })
    if ((o.relatedIds ?? []).includes(inst.id)) updateInstitution(o.id, { relatedIds: (o.relatedIds ?? []).filter((x) => x !== inst.id) })
  }
  return (
    <section className="flex flex-col gap-1.5" data-testid="institution-related" data-count={linked.length}>
      <h3 className="text-label font-semibold text-content-primary">{t('institutions.related')}</h3>
      <ul className="flex flex-wrap gap-1.5">
        {linked.map((o) => (
          <li key={o.id} className="flex items-center gap-1">
            <Link to={`/coordinator/institutions/${o.id}`} className="chip min-h-[2.5rem] border border-edge-subtle bg-surface-raised text-caption text-content-primary hover:bg-surface-high" data-testid={`institution-related-${o.id}`}>
              {o.name}
            </Link>
            {editable && (
              <button type="button" className="btn-ghost min-h-[2.5rem] px-2" onClick={() => unlink(o)} aria-label={t('institutions.relatedRemove', { name: o.name })}>
                <Icon name="close" size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <select
          className="input min-h-11 sm:max-w-[20rem]"
          value=""
          onChange={(e) => e.target.value && updateInstitution(inst.id, { relatedIds: [...(inst.relatedIds ?? []), e.target.value] })}
          data-testid="institution-related-add"
          aria-label={t('institutions.relatedAdd')}
        >
          <option value="">{t('institutions.relatedAdd')}</option>
          {all
            .filter((o) => o.id !== inst.id && !linked.some((l) => l.id === o.id))
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
        </select>
      )}
    </section>
  )
}

/**
 * ★★ BB — la coordination préalable, éditable sur la fiche. ★★ BD — la
 * מזכירות n'est plus ici : c'est une entrée de la liste des contacts.
 */
function CoordinationEditor({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  const [by, setBy] = useState(inst.coordinationNote ?? '')
  useEffect(() => {
    setBy(inst.coordinationNote ?? '')
  }, [inst.id, inst.coordinationNote])
  return (
    <>
      <section className="flex flex-col gap-2 rounded-field border border-edge-subtle p-2.5" data-testid="institution-coordination-edit">
        <label className="flex min-h-11 items-center gap-2 text-caption font-semibold text-content-primary">
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={needsPriorCoordination(inst)}
            onChange={(e) => updateInstitution(inst.id, { coordinationRequired: e.target.checked })}
            data-testid="institution-coordination-toggle"
          />
          {t('institutions.coordination')}
        </label>
        {needsPriorCoordination(inst) && (
          <label className="flex flex-col gap-1">
            <span className="text-micro font-semibold text-content-muted">{t('institutions.coordinationBy')}</span>
            <input className="input min-h-11" value={by} onChange={(e) => setBy(e.target.value)} onBlur={() => by !== (inst.coordinationNote ?? '') && updateInstitution(inst.id, { coordinationNote: by })} data-testid="institution-coordination-note" dir="auto" />
          </label>
        )}
      </section>
    </>
  )
}

/**
 * Statut d'engagement, contacts (★★ AZ5), note : éditables sur place.
 * ★★ BD 7 — rendu en `FormSection` (la grammaire des formulaires) : l'état,
 * le lieu (`place`, fourni par la page : adresse et point), les contacts, les
 * notes. Chaque champ s'enregistre en quittant le champ.
 */
export function InstitutionEditor({ inst, place }: { inst: Institution; place?: ReactNode }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(inst.notes)
  useEffect(() => {
    setNotes(inst.notes)
  }, [inst.id, inst.notes])
  return (
    <div className="flex flex-col gap-4" data-testid="institution-editor">
      <FormSection title={t('institutions.sectionStatus')} testId="institution-block-status">
        <div className="col-span-full flex flex-col gap-3">
          <CoordinationBanner inst={inst} />
          <p className="muted text-caption">
            {[inst.locality, t(`institutions.kind.${inst.kind}`), t(`institutions.audience.${inst.audience}`), inst.network].filter(Boolean).join(' · ')}
          </p>
          {inst.minorsAge && (
            <p className="flex flex-wrap gap-1.5">
              <MinorsChip inst={inst} />
            </p>
          )}
          {isInstitutionToConfirm(inst) && (
            <div className="flex flex-wrap items-center gap-2 rounded-field bg-status-warn/15 px-3 py-2" data-testid="institution-to-confirm">
              <p className="min-w-0 flex-1 text-caption font-semibold text-status-warn-ink">
                {t('institutions.toConfirmLong', { status: t(`institutions.engagement.${inst.engagement}`) })}
              </p>
              <button type="button" className="btn-primary min-h-11" onClick={() => runUndoable(t('undo.confirmed', { name: inst.name }), () => updateInstitution(inst.id, { engagementConfirmed: true }))} data-testid="institution-confirm">
                <Icon name="check" size={16} />
                {t('institutions.confirm')}
              </button>
            </div>
          )}
          {/* ★★ AV1 — CORRIGER = CONFIRMER : choisir un statut, c'est le dire. */}
          <EngagementSegments value={inst.engagement} onChange={(e) => runUndoable(t('undo.engagement', { name: inst.name, status: t(`institutions.engagement.${e}`) }), () => updateInstitution(inst.id, { engagement: e, engagementConfirmed: true }))} testId="institution-engagement" />
          {(inst.metOn || inst.students !== null) && (
            <dl className="grid gap-1 text-caption" data-testid="institution-facts">
              {inst.metOn && (
                <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.metOn')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.metOn.split('-').reverse().join('.')}</dd></div>
              )}
              {inst.students !== null && (
                <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.students')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.students}</dd></div>
              )}
            </dl>
          )}
        </div>
      </FormSection>
      {place && (
        <FormSection title={t('place.positionTitle')} testId="institution-block-place">
          {inst.positionUncertain && (
            <p className="col-span-full rounded-field bg-status-warn/15 px-3 py-2 text-caption font-semibold text-status-warn-ink" data-testid="institution-uncertain">
              {t('institutions.uncertainLong')}
            </p>
          )}
          {place}
          {inst.positionSource && (
            <p className="col-span-full text-micro text-content-muted" data-testid="institution-position-source">
              {t('institutions.positionSource')} · {inst.positionSource}
            </p>
          )}
        </FormSection>
      )}
      <FormSection title={t('institutions.contacts')} testId="institution-block-contacts">
        <div className="col-span-full flex flex-col gap-3">
          <InstitutionContactsEditor inst={inst} />
          <CoordinationEditor inst={inst} />
        </div>
      </FormSection>
      <FormSection title={t('institutions.notes')} testId="institution-block-notes">
        <div className="col-span-full">
          <RelatedInstitutions inst={inst} editable />
        </div>
        <label className="col-span-full block">
          <span className="label">{t('institutions.notes')}</span>
          <textarea className="input min-h-[5.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== inst.notes && updateInstitution(inst.id, { notes })} data-testid="institution-notes" />
        </label>
        {/* ★★ AZ5 — la mention « קטינים » : une information, modifiable ici. */}
        <NumberField label={`${t('institutions.minorsLabel')} · ${t('institutions.minorsFrom')}`} value={inst.minorsAge?.min ?? null} allowEmpty min={0} max={25} onCommit={(n) => updateInstitution(inst.id, { minorsAge: n === null ? null : { min: n, max: Math.max(n, inst.minorsAge?.max ?? n) } })} />
        <NumberField label={t('institutions.minorsTo')} value={inst.minorsAge?.max ?? null} allowEmpty min={0} max={25} onCommit={(n) => updateInstitution(inst.id, { minorsAge: n === null ? null : { min: Math.min(n, inst.minorsAge?.min ?? n), max: n } })} />
      </FormSection>
    </div>
  )
}

/** Les volontaires d'une institution : rattachés par `institutionId`, ou (anciens) par le nom. */
export function peopleOf(inst: Institution, volunteers: readonly Volunteer[]): Volunteer[] {
  const name = comparableInstitutionName(inst.name)
  return volunteers.filter((v) => v.institutionId === inst.id || (!v.institutionId && !!v.yeshiva && comparableInstitutionName(v.yeshiva) === name))
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY4.3 (2026-10-11) — SES VOLONTAIRES ET SES CONDUCTEURS, MIS EN
 *    CORRESPONDANCE, DEPUIS LA FICHE DE L'INSTITUTION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Chaque institution a SES PROPRES conducteurs : c'est ce que je leur
 * demande, et c'est ce qui rend les gardes possibles. » Ici, d'un coup d'œil :
 * combien de volontaires, combien conduisent, combien de places ; puis chaque
 * volontaire avec SON conducteur (« יוצא עם »), choisi d'un toucher parmi les
 * conducteurs DE LA MÊME institution. Un conducteur dit combien de places il
 * a, et combien il en a déjà promis.
 */
export function InstitutionPeople({ inst, compact = false }: { inst: Institution; compact?: boolean }) {
  const { t } = useTranslation()
  const volunteers = useCoreValue(() => getVolunteers())
  const drivers = useCoreValue(() => getDrivers())
  const people = peopleOf(inst, volunteers).filter((v) => v.status !== 'inactive')
  const driving = people.filter((v) => v.canDrive)
  const riders = people.filter((v) => !v.canDrive)
  const car = (v: Volunteer): Driver | undefined => drivers.find((d) => d.volunteerId === v.id)
  const seats = driving.reduce((n, v) => n + Math.max(0, (car(v)?.seats ?? 4) - 1), 0)
  const promised = (v: Volunteer) => riders.filter((r) => r.rideWith === v.id).length
  return (
    <div data-testid="institution-people" data-volunteers={people.length} data-drivers={driving.length}>
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: people.length, label: t('institutionPeople.volunteers'), testId: 'institution-people-count' },
          { n: driving.length, label: t('institutionPeople.drivers'), testId: 'institution-drivers-count' },
          { n: seats, label: t('institutionPeople.seats'), testId: 'institution-seats-count' },
        ].map((x) => (
          <div key={x.testId} className="rounded-card bg-surface-raised p-2.5 text-center shadow-card" data-testid={x.testId}>
            <p className="numeric text-title font-bold text-content-primary">{x.n}</p>
            <p className="text-micro text-content-muted">{x.label}</p>
          </div>
        ))}
      </div>
      {people.length === 0 ? (
        <p className="muted mt-3 text-caption">{t('institutionPeople.none')}</p>
      ) : (
        <ul className="mt-3 divide-y divide-edge-subtle">
          {[...driving, ...riders].map((v) => {
            const c = car(v)
            const ride = riders.includes(v)
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-2 py-2" data-testid={`institution-person-${v.id}`} data-driver={v.canDrive ? '' : undefined}>
                <Avatar photo={v.photo} name={v.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-caption font-semibold text-content-primary">{v.name}</span>
                    {v.canDrive && (
                      <span className="chip bg-status-info/15 text-micro text-status-info-ink">
                        <Icon name="steering" size={12} />
                        {t('institutionPeople.driver')}
                      </span>
                    )}
                  </span>
                  <span className="muted block truncate text-micro">
                    {v.canDrive
                      ? t('institutionPeople.carLine', { vehicle: c?.vehicle || t('institutionPeople.privateCar'), taken: promised(v), seats: Math.max(0, (c?.seats ?? 4) - 1) })
                      : v.phone}
                  </span>
                </span>
                {ride && !compact && (
                  <label className="flex min-w-[11rem] items-center gap-1.5 text-micro text-content-muted">
                    <span className="shrink-0">{t('institutionPeople.ridesWith')}</span>
                    <select
                      className="input min-h-[2.5rem] flex-1 py-1 text-caption"
                      value={v.rideWith ?? ''}
                      onChange={(e) => setVolunteerRideWith(v.id, e.target.value || null)}
                      data-testid={`institution-ride-${v.id}`}
                      disabled={driving.length === 0}
                    >
                      <option value="">{driving.length === 0 ? t('institutionPeople.noDriver') : t('institutionPeople.nobody')}</option>
                      {driving.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} ({promised(d)}/{Math.max(0, (car(d)?.seats ?? 4) - 1)})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {ride && compact && v.rideWith && (
                  <span className="muted text-micro">
                    {t('institutionPeople.ridesWith')} {people.find((p) => p.id === v.rideWith)?.name ?? ''}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={`/coordinator/volunteers/new?institution=${inst.id}`} className="btn-secondary min-h-11" data-testid="institution-add-volunteer">
          <Icon name="userPlus" size={16} />
          {t('institutionPeople.add')}
        </Link>
        <Link to={`/coordinator/volunteers?institution=${inst.id}`} className="btn-ghost min-h-11" data-testid="institution-see-volunteers">
          <Icon name="users" size={16} />
          {t('institutionPeople.seeAll')}
        </Link>
      </div>
    </div>
  )
}
