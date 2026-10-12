import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isContactEstablished, newFarmContactId, setFarmContactEstablished, setFarmContacts } from '@core/index'
import type { Farm, FarmContact } from '@core/index'

import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { runUndoable } from '../components/UndoToast'
import { TextField } from '../components/fields'
import { CallRestrictionChip, callTone, guardCall, isCallGuarded } from '../institutions/institutionUi'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BA (2026-10-12) — LES CONTACTS D'UNE FERME, UNE LISTE ORDONNÉE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le modèle d'AZ5 à la mesure d'une ferme : pas de rôles imposés, un ORDRE.
 * Le rang 1 est l'agriculteur — il représente la ferme partout (tableau,
 * vignette, aperçu, garde, urgence) ; les suivants sont ceux qu'on appelle
 * quand il ne répond pas (sa femme, l'ouvrier qui s'occupe du bétail…), chacun
 * avec une note. « ↑ » fait monter un contact ; au rang 1 il devient celui que
 * l'application montre. Retirer se défait (8 s).
 */
const telOf = (phone: string): string => `tel:${phone.replace(/[^\d+]/g, '')}`

export function FarmContactsEditor({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const contacts = farm.contacts
  const [draft, setDraft] = useState<FarmContact | null>(null)
  const write = (next: FarmContact[]) => setFarmContacts(farm.id, next)
  const save = (c: FarmContact) => {
    if (contacts.some((x) => x.id === c.id)) write(contacts.map((x) => (x.id === c.id ? c : x)))
    else if (c.name.trim() || c.phone.trim()) {
      write([...contacts, c])
      setDraft(null)
    } else setDraft(c)
  }
  const up = (i: number) => {
    if (i <= 0) return
    const next = [...contacts]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    write(next)
  }
  const remove = (c: FarmContact) =>
    runUndoable(t('undo.deleted', { name: c.name || c.phone }), () => write(contacts.filter((x) => x.id !== c.id)))
  return (
    <section className="flex flex-col gap-2" data-testid="farm-contacts-editor" data-count={contacts.length}>
      {contacts.length === 0 && !draft && <p className="muted text-caption">{t('farmContacts.none')}</p>}
      <ol className="flex flex-col gap-2">
        {[...contacts, ...(draft ? [draft] : [])].map((c, i) => (
          <FarmContactRow
            key={c.id}
            contact={c}
            rank={i + 1}
            onSave={save}
            onUp={i > 0 && i < contacts.length ? () => up(i) : undefined}
            onRemove={contacts.some((x) => x.id === c.id) ? () => remove(c) : () => setDraft(null)}
          />
        ))}
      </ol>
      {!draft && (
        <button
          type="button"
          className="btn-secondary min-h-11 self-start"
          data-testid="farm-contact-add"
          onClick={() => setDraft({ id: newFarmContactId(), name: '', phone: '', email: '', role: '', photo: null, isPrimary: contacts.length === 0, note: '' })}
        >
          <Icon name="plus" size={16} />
          {t('farmContacts.add')}
        </button>
      )}
    </section>
  )
}

function FarmContactRow({ contact, rank, onSave, onUp, onRemove }: { contact: FarmContact; rank: number; onSave: (c: FarmContact) => void; onUp?: () => void; onRemove: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState(contact.name)
  const [phone, setPhone] = useState(contact.phone)
  const [role, setRole] = useState(contact.role)
  const [note, setNote] = useState(contact.note ?? '')
  useEffect(() => {
    setName(contact.name)
    setPhone(contact.phone)
    setRole(contact.role)
    setNote(contact.note ?? '')
  }, [contact.id, contact.name, contact.phone, contact.role, contact.note])
  const commit = (patch: Partial<FarmContact> = {}) => {
    const next: FarmContact = { ...contact, name, phone, role, note, ...patch }
    if (
      next.name !== contact.name ||
      next.phone !== contact.phone ||
      next.role !== contact.role ||
      (next.note ?? '') !== (contact.note ?? '') ||
      (next.restrictsCalls === true) !== (contact.restrictsCalls === true)
    )
      onSave(next)
  }
  return (
    <li className="rounded-card bg-surface-raised p-2.5 shadow-card" data-testid={`farm-contact-${contact.id}`} data-rank={rank}>
      <div className="mb-2 flex items-center gap-2">
        <Avatar photo={contact.photo} phone={contact.phone} name={contact.name || '?'} size="sm" />
        <span className="rounded-pill bg-surface-high px-2 py-0.5 text-micro font-semibold text-content-secondary" data-testid="farm-contact-rank">
          {rank === 1 ? t('farmContacts.rank1') : t('farmContacts.rankN', { n: rank })}
        </span>
        <span className="ms-auto flex items-center gap-1">
          {onUp && (
            <button type="button" className="btn-ghost min-h-11" onClick={onUp} aria-label={t('farmContacts.up', { name: contact.name })} data-testid="farm-contact-up">
              <Icon name="chevronDown" size={16} className="rotate-180" />
            </button>
          )}
          <button type="button" className="btn-ghost min-h-11" onClick={onRemove} aria-label={t('farmContacts.remove', { name: contact.name })} data-testid="farm-contact-remove">
            <Icon name="trash" size={16} />
          </button>
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('farmContacts.name')}</span>
          <input className="input min-h-11" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => commit()} data-testid="farm-contact-name" />
        </label>
        {/* ★ BC — le pavé numérique, comme tout champ de téléphone (`kind="phone"`) :
            un `inputMode="tel"` brut ouvrait le clavier complet sur iPad (BB, 16). */}
        <div onBlur={() => commit()}>
          <TextField label={t('farmContacts.phone')} kind="phone" value={phone} onChange={setPhone} placeholder="05X-XXX-XXXX" testId="farm-contact-phone" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('farmContacts.role')}</span>
          <input className="input min-h-11" value={role} onChange={(e) => setRole(e.target.value)} onBlur={() => commit()} data-testid="farm-contact-role" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-micro font-semibold text-content-muted">{t('farmContacts.note')}</span>
          <input className="input min-h-11" value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => commit()} data-testid="farm-contact-note" />
        </label>
      </div>
      {/* ★★ BC — la note restreint l'usage du téléphone : tout bouton d'appel de
          ce contact le montre et demande confirmation. */}
      <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-caption text-content-secondary">
        <input
          type="checkbox"
          className="h-5 w-5 shrink-0 accent-[rgb(var(--status-warn))]"
          checked={contact.restrictsCalls === true}
          onChange={(e) => commit({ restrictsCalls: e.target.checked ? true : undefined })}
          data-testid="farm-contact-restricts"
        />
        {t('calls.restrictsLabel')}
      </label>
      {contact.phone && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <a href={telOf(contact.phone)} onClick={guardCall(null, t, contact)} className={`${callTone(null, 'btn-secondary', contact)} min-h-11`} data-testid="farm-contact-call" data-guarded={isCallGuarded(null, contact) ? '' : undefined}>
            <Icon name={isCallGuarded(null, contact) ? 'alert' : 'phone'} size={16} />
            {t('farmContacts.call')}
          </a>
          <CallRestrictionChip contact={contact} full />
        </div>
      )}
    </li>
  )
}

/**
 * ★★ BA — « נוצר קשר » / « טרם נוצר קשר », à la main. La règle mécanique de
 * l'import (coordonnées OU note interne) n'est qu'un point de départ.
 */
export function ContactEstablishedToggle({ farm }: { farm: Farm }) {
  const { t } = useTranslation()
  const on = isContactEstablished(farm)
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-field bg-surface-raised px-3 py-2 shadow-card" data-testid="farm-contact-established" data-established={on ? 'true' : 'false'}>
      <input type="checkbox" className="h-5 w-5" checked={on} onChange={(e) => setFarmContactEstablished(farm.id, e.target.checked)} />
      <span className="flex flex-col">
        <span className="text-caption font-semibold text-content-primary">{on ? t('farmContacts.established') : t('farmContacts.notEstablished')}</span>
        <span className="text-micro text-content-muted">{t('farmContacts.establishedHint')}</span>
      </span>
    </label>
  )
}
