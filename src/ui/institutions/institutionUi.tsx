import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Link } from 'react-router-dom'

import {
  INSTITUTION_CONTACT_ROLES,
  INSTITUTION_ENGAGEMENTS,
  SINGLE_CONTACT_ROLES,
  comparableInstitutionName,
  contactRoleKey,
  getDrivers,
  getVolunteers,
  headRoleKey,
  institutionContacts,
  isInstitutionHeadMissing,
  isInstitutionToConfirm,
  minorsLabel,
  newInstitutionContactId,
  setInstitutionContacts,
  setVolunteerRideWith,
  updateInstitution,
} from '@core/index'
import type { Driver, Institution, InstitutionContact, InstitutionContactRole, InstitutionEngagement, Volunteer } from '@core/index'

import { Avatar } from '../components/Avatar'
import { NumberField } from '../components/fields'
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

const telOf = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`

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
        <button
          type="button"
          className="btn-secondary min-h-11 self-start"
          data-testid="institution-contact-add"
          onClick={() => setDraft({ id: newInstitutionContactId(), role: isInstitutionHeadMissing(inst) ? 'head' : 'contact', name: '', phone: '', note: '' })}
        >
          <Icon name="plus" size={16} />
          {t('institutions.addContact')}
        </button>
      )}
    </section>
  )
}

function ContactRow({ inst, contact, taken, onSave, onRemove }: { inst: Institution; contact: InstitutionContact; taken: (r: InstitutionContactRole) => boolean; onSave: (c: InstitutionContact) => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(contact.name)
  const [phone, setPhone] = useState(contact.phone)
  const [note, setNote] = useState(contact.note)
  useEffect(() => {
    setName(contact.name)
    setPhone(contact.phone)
    setNote(contact.note)
  }, [contact.id, contact.name, contact.phone, contact.note])
  const commit = (patch: Partial<InstitutionContact>) => {
    const next = { ...contact, name, phone, note, ...patch }
    if (next.role !== contact.role || next.name !== contact.name || next.phone !== contact.phone || next.note !== contact.note) onSave(next)
  }
  const roleName = t(`institutions.role.${contactRoleKey(inst, contact.role)}`)
  return (
    <li className="rounded-card bg-surface-raised p-2.5 shadow-card" data-testid={`institution-contact-${contact.id}`} data-role={contact.role}>
      <div className="grid gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)_10rem]">
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
        <label className="flex flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('institutions.contactName')}</span>
          <input className="input min-h-11" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit({})} data-testid="institution-contact-name" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('institutions.contactPhone')}</span>
          <input className="input ltr-nums min-h-11" inputMode="tel" dir="ltr" placeholder="05X-XXX-XXXX" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => commit({})} data-testid="institution-contact-phone" />
        </label>
      </div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('institutions.contactNote')}</span>
          <input className="input min-h-11" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => commit({})} data-testid="institution-contact-note" />
        </label>
        {contact.phone && (
          <a href={telOf(contact.phone)} className="btn-secondary min-h-11" aria-label={t('institutions.callContact', { name: contact.name || roleName })}>
            <Icon name="phone" size={16} />
            {t('institutions.call')}
          </a>
        )}
        <button type="button" className="btn-ghost min-h-11" onClick={onRemove} aria-label={t('institutions.removeContact', { name: contact.name || roleName })} data-testid="institution-contact-remove">
          <Icon name="trash" size={16} />
        </button>
      </div>
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
      {contacts.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2 text-caption" data-role={c.role} data-testid={`institution-contact-line-${c.id}`}>
          <span className="w-[5.5rem] shrink-0 text-content-muted">{t(`institutions.role.${contactRoleKey(inst, c.role)}`)}</span>
          <span className="min-w-0 flex-1 font-semibold text-content-primary">{c.name || '—'}</span>
          {c.phone && (
            <a className="ltr-nums inline-flex min-h-[2.5rem] items-center gap-1 text-content-secondary hover:text-accent-ink" href={telOf(c.phone)} dir="ltr">
              <Icon name="phone" size={14} />
              {c.phone}
            </a>
          )}
          {c.note && <span className="basis-full text-micro text-content-muted" dir="auto">{c.note}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Statut d'engagement, contacts (★★ AZ5), note : éditables sur place. */
export function InstitutionEditor({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(inst.notes)
  useEffect(() => {
    setNotes(inst.notes)
  }, [inst.id, inst.notes])
  return (
    <div className="flex flex-col gap-3" data-testid="institution-editor">
      <p className="muted text-caption">
        {[inst.locality, t(`institutions.kind.${inst.kind}`), t(`institutions.audience.${inst.audience}`), inst.network].filter(Boolean).join(' · ')}
      </p>
      {inst.minorsAge && (
        <p className="flex flex-wrap gap-1.5">
          <MinorsChip inst={inst} />
        </p>
      )}
      {inst.positionUncertain && (
        <p className="rounded-field bg-status-warn/15 px-3 py-2 text-caption font-semibold text-status-warn-ink" data-testid="institution-uncertain">
          {t('institutions.uncertainLong')}
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
      {(inst.metOn || inst.students !== null || inst.positionSource) && (
        <dl className="grid gap-1 text-caption" data-testid="institution-facts">
          {inst.metOn && (
            <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.metOn')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.metOn.split('-').reverse().join('.')}</dd></div>
          )}
          {inst.students !== null && (
            <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.students')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.students}</dd></div>
          )}
          {inst.positionSource && (
            <div className="flex gap-2"><dt className="shrink-0 text-content-muted">{t('institutions.positionSource')}</dt><dd className="text-content-secondary">{inst.positionSource}</dd></div>
          )}
        </dl>
      )}
      <InstitutionContactsEditor inst={inst} />
      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-content-secondary">{t('institutions.notes')}</span>
        <textarea className="input min-h-[3.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== inst.notes && updateInstitution(inst.id, { notes })} />
      </label>
      {/* ★★ AZ5 — la mention « קטינים » : une information, modifiable ici. */}
      <div className="grid grid-cols-2 gap-2 sm:max-w-[20rem]" data-testid="institution-minors-edit">
        <NumberField label={`${t('institutions.minorsLabel')} · ${t('institutions.minorsFrom')}`} value={inst.minorsAge?.min ?? null} allowEmpty min={0} max={25} onCommit={(n) => updateInstitution(inst.id, { minorsAge: n === null ? null : { min: n, max: Math.max(n, inst.minorsAge?.max ?? n) } })} />
        <NumberField label={t('institutions.minorsTo')} value={inst.minorsAge?.max ?? null} allowEmpty min={0} max={25} onCommit={(n) => updateInstitution(inst.id, { minorsAge: n === null ? null : { min: Math.min(n, inst.minorsAge?.min ?? n), max: n } })} />
      </div>
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
