import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import {
  createInstitution,
  createLeads,
  createVolunteer,
  formatPhoneTyping,
  getInstitutions,
  getVisibleFarms,
  getVisibleLeads,
  getVolunteers,
} from '@core/index'
import type { Institution } from '@core/index'
import {
  applySplit,
  displayName,
  draftFromName,
  draftsFromPaste,
  draftsFromVcfFile,
  editDraft,
  findDuplicates,
  institutionFromDraft,
  leadFromDraft,
  localPhoneDisplay,
  locateDraft,
  personName,
  readLocation,
  volunteerFromDraft,
} from '@core/contacts'
import type { ContactDraft, ContactKind, Duplicate } from '@core/contacts'

import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AW2 (2026-10-09) — AJOUTER DES CONTACTS : TROIS CHEMINS, UN SEUL ÉCRAN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Une fonction qu'on ne sait pas utiliser n'existe pas. » — le PO savait
 *   coller du texte dans la salle d'attente, il ne savait pas quoi coller.
 *
 * ★ L'ÉCRAN DIT CE QU'IL ATTEND, DANS L'ORDRE OÙ IL L'ATTEND :
 *   ① « מה מוסיפים? » — trois grandes tuiles, rien d'autre n'est actif avant.
 *     Le type décide où la fiche va (salle d'attente / carte de couverture /
 *     liste des volontaires), quels mots du nom sont l'exploitation ou
 *     l'institution, et contre quoi on cherche les doublons. C'est pour cela
 *     qu'il vient en PREMIER et pour TOUT le lot : vingt fiches d'un coup
 *     reçoivent le même type sans vingt questions.
 *     Un volontaire demande en plus SON institution, une fois pour le lot —
 *     créable sur place.
 *   ② trois chemins côte à côte, chacun nommé par ce qu'on a en main :
 *     « הקלדה » (debout, avec ce qu'on a), « קבצי איש קשר » (les .vcf du
 *     téléphone), « הדבקת טקסט » (WhatsApp, Excel, notes).
 *   ③ « לפני שמירה » : chaque fiche lue, CORRIGEABLE — un toucher sur un mot
 *     du nom déplace la limite personne / exploitation ; doublons signalés et
 *     décochés ; ce qui n'a pas été compris, dit. Rien n'est écrit avant.
 *
 * ⚠️ Où ce n'est PAS utile : la saisie d'UNE fiche d'un type déjà connu (le
 *    bouton « + » de la liste des volontaires ouvre ce même écran AVEC le type
 *    choisi — `?type=` — : on ne repose pas la question).
 */

type Done = { kind: ContactKind; count: number } | null

const KIND_ICON: Record<ContactKind, ReactNode> = {
  farm: <Icon name="farm" size={26} />,
  institution: (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 9.5 12 5l10 4.5L12 14Z M6 11.5v4.2c0 1.3 2.7 2.8 6 2.8s6-1.5 6-2.8v-4.2 M22 9.5v5" />
    </svg>
  ),
  volunteer: <Icon name="users" size={26} />,
}

export function AddContactsScreen() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const initial = params.get('type')
  const [kind, setKindState] = useState<ContactKind | null>(initial === 'farm' || initial === 'institution' || initial === 'volunteer' ? initial : null)
  const setKind = (k: ContactKind) => {
    setKindState(k)
    setDone(null)
    // Le type change le découpage de TOUS les brouillons déjà lus.
    setDrafts((ds) => ds.map((d) => resplit(d, k)))
    const next = new URLSearchParams(params)
    next.set('type', k)
    setParams(next, { replace: true })
  }
  const institutions = useCoreValue(() => getInstitutions())
  const leads = useCoreValue(() => getVisibleLeads())
  const farms = useCoreValue(() => getVisibleFarms())
  const volunteers = useCoreValue(() => getVolunteers())
  const [instId, setInstId] = useState<string | null>(params.get('institution'))
  const institution = institutions.find((i) => i.id === instId) ?? null
  const [drafts, setDrafts] = useState<ContactDraft[]>([])
  const [skip, setSkip] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState<Done>(null)

  const ready = kind !== null && (kind !== 'volunteer' || institution !== null)
  const existing = useMemo(
    () => ({ leads, farms, institutions, volunteers }),
    [leads, farms, institutions, volunteers],
  )
  const dups = useMemo(() => (kind ? findDuplicates(drafts, existing, kind) : drafts.map(() => null)), [drafts, existing, kind])
  /* ★ Un doublon est proposé DÉCOCHÉ ; le PO peut le cocher quand même. */
  const included = (d: ContactDraft, i: number) => (d.key in skip ? !skip[d.key] : dups[i] === null && !d.problems.includes('noName'))
  const chosen = drafts.filter((d, i) => included(d, i))

  const addDrafts = (more: ContactDraft[]) => {
    setDone(null)
    setDrafts((ds) => [...ds, ...more])
  }

  const write = (list: ContactDraft[]): number => {
    if (!kind || list.length === 0) return 0
    if (kind === 'farm') {
      createLeads(list.map(leadFromDraft))
    } else if (kind === 'institution') {
      for (const d of list) createInstitution(institutionFromDraft(d))
    } else if (institution) {
      for (const d of list) createVolunteer(volunteerFromDraft(d, institution))
    }
    return list.length
  }

  const saveAll = () => {
    const n = write(chosen)
    if (!kind || n === 0) return
    const keys = new Set(chosen.map((d) => d.key))
    setDrafts((ds) => ds.filter((d) => !keys.has(d.key)))
    setDone({ kind, count: n })
  }

  return (
    <div data-testid="add-contacts" data-kind={kind ?? ''}>
      <PageHeader title={t('add.title')} subtitle={t('add.subtitle')} />

      {/* ------------------------------------------------------------------ */}
      {/* ① LE TYPE                                                           */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="add-kind-title" className="mt-2">
        <h2 id="add-kind-title" className="flex items-center gap-2 text-heading text-content-primary">
          <StepNumber n={1} />
          {t('add.kindTitle')}
        </h2>
        <div role="radiogroup" aria-labelledby="add-kind-title" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3" data-testid="add-kind">
          {(['farm', 'institution', 'volunteer'] as const).map((k) => {
            const on = kind === k
            return (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setKind(k)}
                data-testid={`add-kind-${k}`}
                className={`flex min-h-[4.5rem] items-center gap-3 rounded-card border-2 p-3 text-start transition-colors duration-fast ${on ? 'border-accent bg-accent/10' : 'border-edge-subtle bg-surface-raised hover:bg-surface-high'}`}
              >
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill ${on ? 'bg-accent text-content-on-accent' : 'bg-surface-high text-content-secondary'}`}>
                  {KIND_ICON[k]}
                </span>
                <span className="min-w-0">
                  <span className="block text-body font-bold text-content-primary">{t(`add.kind.${k}`)}</span>
                  <span className="block text-caption text-content-secondary">{t(`add.kindHint.${k}`)}</span>
                </span>
              </button>
            )
          })}
        </div>
        {kind === 'volunteer' && (
          <InstitutionPicker institutions={institutions} value={instId} onChange={setInstId} />
        )}
        {!ready && (
          <p className="mt-3 flex items-center gap-2 text-caption font-semibold text-status-warn-ink" data-testid="add-not-ready">
            <Icon name="info" size={16} />
            {kind === null ? t('add.chooseKindFirst') : t('add.chooseInstitutionFirst')}
          </p>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* ② LES TROIS CHEMINS                                                 */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="add-paths-title" className="mt-6">
        <h2 id="add-paths-title" className="flex items-center gap-2 text-heading text-content-primary">
          <StepNumber n={2} />
          {kind ? t('add.pathsTitle', { what: t(`add.kindPlural.${kind}`) }) : t('add.pathsTitleNone')}
        </h2>
        <fieldset disabled={!ready} className={`mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3 ${ready ? '' : 'opacity-50'}`} data-testid="add-paths">
          <FormPath kind={kind} onSave={(d) => {
            const n = write([d])
            if (kind && n) setDone({ kind, count: n })
          }} existing={existing} />
          <FilesPath kind={kind} onDrafts={addDrafts} />
          <PastePath kind={kind} onDrafts={addDrafts} />
        </fieldset>
      </section>

      {done && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card bg-status-success/15 p-3 text-caption font-semibold text-status-success-ink" role="status" data-testid="add-done" data-count={done.count}>
          <Icon name="check" size={18} />
          <span className="flex-1">{t(`add.done.${done.kind}`, { count: done.count, institution: institution?.name ?? '' })}</span>
          <Link to={done.kind === 'farm' ? '/coordinator/leads' : done.kind === 'institution' ? '/coordinator/coverage' : '/coordinator/volunteers'} className="btn-secondary min-h-11">
            {t(`add.open.${done.kind}`)}
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ③ L'APERÇU                                                          */}
      {/* ------------------------------------------------------------------ */}
      {kind && drafts.length > 0 && (
        <section aria-labelledby="add-preview-title" className="mt-6" data-testid="add-preview" data-count={drafts.length} data-chosen={chosen.length}>
          <h2 id="add-preview-title" className="flex items-center gap-2 text-heading text-content-primary">
            <StepNumber n={3} />
            {t('add.previewTitle', { count: drafts.length })}
          </h2>
          <p className="muted mt-1">{t('add.previewHint')}</p>
          <PreviewSummary drafts={drafts} dups={dups} />
          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((d, i) => (
              <DraftRow
                key={d.key}
                d={d}
                kind={kind}
                dup={dups[i]}
                on={included(d, i)}
                onToggle={(on) => setSkip((s) => ({ ...s, [d.key]: !on }))}
                onChange={(next) => setDrafts((ds) => ds.map((x) => (x.key === d.key ? next : x)))}
                onRemove={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}
              />
            ))}
          </ul>
          <div className="sticky bottom-0 z-10 -mx-1 mt-3 flex flex-wrap items-center gap-2 bg-surface-base/95 px-1 py-3 backdrop-blur">
            <button type="button" className="btn-primary min-h-11" disabled={chosen.length === 0 || !ready} onClick={saveAll} data-testid="add-create">
              <Icon name="check" size={16} />
              {t(`add.create.${kind}`, { count: chosen.length, institution: institution?.name ?? '' })}
            </button>
            <button type="button" className="btn-ghost min-h-11" onClick={() => setDrafts([])} data-testid="add-clear">
              {t('add.clear')}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}

function resplit(d: ContactDraft, kind: ContactKind): ContactDraft {
  const fresh = draftFromName({ fullName: d.fullName, phone: d.phone, otherPhones: d.otherPhones, email: d.email, address: d.address, notes: d.notes, origin: d.origin }, kind)
  return { ...fresh, key: d.key, position: d.position ?? fresh.position, positionFrom: d.position ? d.positionFrom : fresh.positionFrom }
}

function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-accent text-caption font-bold text-content-on-accent">
      {n}
    </span>
  )
}

// ---------------------------------------------------------------------------
// L'institution d'un lot de volontaires
// ---------------------------------------------------------------------------

function InstitutionPicker({ institutions, value, onChange }: { institutions: readonly Institution[]; value: string | null; onChange: (id: string) => void }) {
  const { t } = useTranslation()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const sorted = [...institutions].sort((a, b) => a.name.localeCompare(b.name, 'he'))
  const create = () => {
    const n = name.trim()
    if (!n) return
    const d = draftFromName({ fullName: n, origin: { path: 'form' } }, 'institution')
    /* ★ Créée depuis un lot de volontaires : le contact existe déjà. */
    const made = createInstitution({ ...institutionFromDraft({ ...d, orgName: n }), name: n, engagement: 'contacted' })
    onChange(made.id)
    setCreating(false)
    setName('')
  }
  return (
    <div className="mt-3 rounded-card bg-surface-raised p-3 shadow-card" data-testid="add-institution">
      <label className="flex flex-col gap-1.5">
        <span className="text-caption font-bold text-content-secondary">{t('add.institutionLabel')}</span>
        <select className="input min-h-11" value={value ?? ''} onChange={(e) => e.target.value && onChange(e.target.value)} data-testid="add-institution-select">
          <option value="">{t('add.institutionChoose')}</option>
          {sorted.map((i) => (
            <option key={i.id} value={i.id}>
              {i.locality ? `${i.name} · ${i.locality}` : i.name}
            </option>
          ))}
        </select>
      </label>
      {creating ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
            <span className="text-caption text-content-secondary">{t('add.institutionNewName')}</span>
            <input className="input min-h-11" value={name} onChange={(e) => setName(e.target.value)} dir="auto" autoFocus data-testid="add-institution-new-name" />
          </label>
          <button type="button" className="btn-primary min-h-11" disabled={!name.trim()} onClick={create} data-testid="add-institution-create">
            {t('add.institutionCreate')}
          </button>
          <button type="button" className="btn-ghost min-h-11" onClick={() => setCreating(false)}>
            {t('common.cancel')}
          </button>
        </div>
      ) : (
        <button type="button" className="btn-ghost mt-2 min-h-11" onClick={() => setCreating(true)} data-testid="add-institution-new">
          <Icon name="plus" size={16} />
          {t('add.institutionNew')}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chemin 1 — la saisie
// ---------------------------------------------------------------------------

function PathCard({ icon, title, hint, children, testId }: { icon: ReactNode; title: string; hint: string; children: ReactNode; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-card bg-surface-raised p-4 shadow-card" data-testid={testId}>
      <div>
        <h3 className="flex items-center gap-2 text-body font-bold text-content-primary">
          {icon}
          {title}
        </h3>
        <p className="muted mt-0.5 text-caption">{hint}</p>
      </div>
      {children}
    </div>
  )
}

function LocationEcho({ text }: { text: string }) {
  const { t } = useTranslation()
  const r = readLocation(text)
  if (!text.trim()) return <span className="muted text-micro">{t('add.location.hint')}</span>
  if (r.ok) {
    return (
      <span className="flex items-center gap-1.5 text-micro font-semibold text-status-success-ink" data-testid="add-location-ok" data-via={r.via}>
        <Icon name="check" size={13} />
        {t(`add.location.via.${r.via}`)} · <span dir="ltr" className="ltr-nums">{r.position.lat.toFixed(5)}, {r.position.lng.toFixed(5)}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-micro font-semibold text-status-warn-ink" data-testid="add-location-bad" data-reason={r.reason}>
      <Icon name="alert" size={13} />
      {t(`add.location.${r.reason}`)}
    </span>
  )
}

function FormPath({ kind, onSave, existing }: { kind: ContactKind | null; onSave: (d: ContactDraft) => void; existing: Parameters<typeof findDuplicates>[1] }) {
  const { t } = useTranslation()
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState('')
  const [org, setOrg] = useState('')
  const [where, setWhere] = useState('')
  const [confirmDup, setConfirmDup] = useState(false)
  const k = kind ?? 'farm'
  const draft = useMemo(() => {
    const base = draftFromName({ fullName: `${first} ${last}`.trim(), phone, origin: { path: 'form' }, locationText: where }, k)
    // La saisie est déjà découpée : aucun découpage automatique sur des champs séparés.
    return { ...base, firstName: first.trim(), lastName: last.trim(), orgName: k === 'volunteer' ? '' : org.trim(), split: 'form' as const }
  }, [first, last, phone, org, where, k])
  const named = !!(first.trim() || last.trim() || (k !== 'volunteer' && org.trim()))
  const dup = useMemo(() => (named ? findDuplicates([draft], existing, k)[0] : null), [draft, existing, k, named])
  useEffect(() => setConfirmDup(false), [first, last, phone, org])
  const save = () => {
    if (!named) return
    if (dup && !confirmDup) {
      setConfirmDup(true)
      return
    }
    onSave(draft)
    setFirst('')
    setLast('')
    setPhone('')
    setOrg('')
    setWhere('')
    setConfirmDup(false)
  }
  return (
    <PathCard icon={<Icon name="edit" size={18} />} title={t('add.form.title')} hint={t('add.form.hint')} testId="add-path-form">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('add.form.first')} value={first} onChange={setFirst} testId="add-form-first" required={!last && !org} />
        <Field label={t('add.form.last')} value={last} onChange={setLast} testId="add-form-last" />
      </div>
      <Field label={t('add.form.phone')} value={phone} onChange={(v) => setPhone(formatPhoneTyping(v))} testId="add-form-phone" type="tel" ltr />
      {k !== 'volunteer' && <Field label={t(`add.form.org.${k}`)} value={org} onChange={setOrg} testId="add-form-org" />}
      {k !== 'volunteer' && (
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-content-secondary">{t('add.form.location')}</span>
          <input className="input min-h-11" value={where} onChange={(e) => setWhere(e.target.value)} dir="ltr" placeholder={t('add.form.locationPlaceholder')} data-testid="add-form-location" />
          <LocationEcho text={where} />
        </label>
      )}
      <p className="muted text-micro">{t('add.form.onlyName')}</p>
      {dup && (
        <p className="text-caption font-semibold text-status-warn-ink" data-testid="add-form-dup">
          {t(`add.dup.${dup.kind}`, { name: dup.name })}
        </p>
      )}
      <button type="button" className="btn-primary min-h-11" disabled={!named} onClick={save} data-testid="add-form-save">
        <Icon name="check" size={16} />
        {dup && confirmDup ? t('add.form.saveAnyway') : t('add.form.save')}
      </button>
    </PathCard>
  )
}

function Field({ label, value, onChange, testId, type = 'text', ltr = false, required = false }: { label: string; value: string; onChange: (v: string) => void; testId: string; type?: string; ltr?: boolean; required?: boolean }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-caption font-semibold text-content-secondary">
        {label}
        {required && <span aria-hidden="true" className="text-status-danger-ink"> *</span>}
      </span>
      <input className={`input min-h-11 ${ltr ? 'ltr-nums' : ''}`} type={type} inputMode={type === 'tel' ? 'tel' : undefined} value={value} onChange={(e) => onChange(e.target.value)} dir={ltr ? 'ltr' : 'auto'} data-testid={testId} />
    </label>
  )
}

// ---------------------------------------------------------------------------
// Chemin 2 — les fiches .vcf
// ---------------------------------------------------------------------------

function FilesPath({ kind, onDrafts }: { kind: ContactKind | null; onDrafts: (d: ContactDraft[]) => void }) {
  const { t } = useTranslation()
  const [over, setOver] = useState(false)
  const [report, setReport] = useState<{ files: number; contacts: number; unreadable: string[] } | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const read = async (files: FileList | File[] | null) => {
    if (!kind || !files) return
    const list = [...files]
    if (list.length === 0) return
    const out: ContactDraft[] = []
    const unreadable: string[] = []
    for (const f of list) {
      const text = await f.text().catch(() => '')
      const r = draftsFromVcfFile(text, kind, f.name)
      if (r.unreadable) unreadable.push(f.name)
      out.push(...r.drafts)
    }
    setReport({ files: list.length, contacts: out.length, unreadable })
    onDrafts(out)
    if (input.current) input.current.value = ''
  }
  return (
    <PathCard icon={<Icon name="user" size={18} />} title={t('add.files.title')} hint={t('add.files.hint')} testId="add-path-files">
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (kind) setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void read(e.dataTransfer.files)
        }}
        className={`flex min-h-[8rem] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed p-4 text-center ${over ? 'border-accent bg-accent/10' : 'border-edge-strong'}`}
        data-testid="add-files-drop"
      >
        <Icon name="upload" size={22} />
        <span className="text-caption text-content-secondary">{t('add.files.drop')}</span>
        {/* ★ AW2.2.7 — sur iPad le glisser-déposer est souvent impraticable : le
            sélecteur fait la même chose, et accepte PLUSIEURS fichiers. */}
        <label className="btn-secondary min-h-11 cursor-pointer">
          <Icon name="document" size={16} />
          {t('add.files.choose')}
          <input
            ref={input}
            type="file"
            multiple
            accept=".vcf,.vcard,text/vcard,text/x-vcard,text/directory"
            className="sr-only"
            data-testid="add-files-input"
            onChange={(e) => void read(e.target.files)}
          />
        </label>
      </div>
      {report && (
        <p className="text-caption text-content-secondary" data-testid="add-files-report" data-files={report.files} data-contacts={report.contacts}>
          {t('add.files.report', { files: report.files, count: report.contacts })}
          {report.unreadable.length > 0 && (
            <span className="block font-semibold text-status-warn-ink" data-testid="add-files-unreadable">
              {t('add.files.unreadable', { names: report.unreadable.join(', ') })}
            </span>
          )}
        </p>
      )}
    </PathCard>
  )
}

// ---------------------------------------------------------------------------
// Chemin 3 — le collage
// ---------------------------------------------------------------------------

function PastePath({ kind, onDrafts }: { kind: ContactKind | null; onDrafts: (d: ContactDraft[]) => void }) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const go = () => {
    if (!kind || !text.trim()) return
    onDrafts(draftsFromPaste(text, kind))
    setText('')
  }
  return (
    <PathCard icon={<Icon name="copy" size={18} />} title={t('add.paste.title')} hint={t('add.paste.hint')} testId="add-path-paste">
      <textarea className="input min-h-[8rem]" dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('add.paste.placeholder')} data-testid="add-paste-text" />
      <button type="button" className="btn-secondary min-h-11" disabled={!text.trim()} onClick={go} data-testid="add-paste-read">
        <Icon name="sparkle" size={16} />
        {t('add.paste.read')}
      </button>
    </PathCard>
  )
}

// ---------------------------------------------------------------------------
// L'aperçu
// ---------------------------------------------------------------------------

function PreviewSummary({ drafts, dups }: { drafts: readonly ContactDraft[]; dups: ReadonlyArray<Duplicate | null> }) {
  const { t } = useTranslation()
  const nDup = dups.filter(Boolean).length
  const nProblem = drafts.filter((d) => d.problems.some((p) => p === 'noName' || p === 'noPhone' || p === 'shortLink' || p === 'unreadLocation' || p === 'splitUncertain' || p === 'noOrg')).length
  return (
    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption" data-testid="add-preview-summary" data-dups={nDup} data-problems={nProblem}>
      <span className="font-semibold text-content-primary">{t('add.summary.new', { count: drafts.length - nDup })}</span>
      {nDup > 0 && <span className="font-semibold text-status-warn-ink">{t('add.summary.dups', { count: nDup })}</span>}
      {nProblem > 0 && <span className="font-semibold text-status-warn-ink">{t('add.summary.problems', { count: nProblem })}</span>}
    </p>
  )
}

function DraftRow({
  d,
  kind,
  dup,
  on,
  onToggle,
  onChange,
  onRemove,
}: {
  d: ContactDraft
  kind: ContactKind
  dup: Duplicate | null
  on: boolean
  onToggle: (on: boolean) => void
  onChange: (d: ContactDraft) => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [where, setWhere] = useState('')
  const title = displayName(d, kind) || localPhoneDisplay(d.phone) || '—'
  const person = personName(d)
  const orgWord = kind === 'volunteer' ? t('add.preview.cardInstitution') : t(`add.form.org.${kind}`)
  return (
    <li
      className={`rounded-card bg-surface-raised p-3 shadow-card ${on ? '' : 'border-2 border-dashed border-edge-strong opacity-70'}`}
      data-testid="add-draft"
      data-key={d.key}
      data-first={d.firstName}
      data-last={d.lastName}
      data-org={d.orgName}
      data-phone={d.phone}
      data-dup={dup?.kind ?? ''}
      data-on={on ? 'true' : 'false'}
      data-problems={d.problems.join(' ')}
    >
      <div className="flex items-start gap-3">
        <input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={on} onChange={(e) => onToggle(e.target.checked)} aria-label={title} data-testid="add-draft-on" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-content-primary" data-testid="add-draft-title">{title}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-caption text-content-secondary">
            {kind !== 'volunteer' && person && person !== title && <span data-testid="add-draft-person">{person}</span>}
            {d.phone && (
              <span dir="ltr" className="ltr-nums" data-testid="add-draft-phone">
                {localPhoneDisplay(d.phone)}
              </span>
            )}
            {d.email && <span dir="ltr">{d.email}</span>}
          </p>
          {/* ★★ AW2.3 — LE DÉCOUPAGE SE CORRIGE D'UN GESTE : chaque mot du nom
              d'origine est une pastille ; toucher un mot fait commencer
              l'exploitation (ou l'institution) À CE MOT. */}
          {d.tokens.length > 1 && (
            <div className="mt-2" data-testid="add-draft-split">
              <p className="muted text-micro">{t(kind === 'volunteer' ? 'add.preview.splitHintVolunteer' : 'add.preview.splitHint', { org: orgWord })}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {d.tokens.map((tok, i) => {
                  const isOrg = d.orgStart !== null && i >= d.orgStart
                  return (
                    <button
                      key={`${tok}-${i}`}
                      type="button"
                      onClick={() => onChange(applySplit(d, d.orgStart === i ? null : i, kind))}
                      className={`min-h-9 rounded-pill border px-2.5 text-caption font-semibold ${isOrg ? 'border-status-violet bg-status-violet/15 text-status-violet-ink' : 'border-edge-subtle bg-surface-high text-content-primary'}`}
                      aria-pressed={isOrg}
                      data-testid={`add-draft-token-${i}`}
                    >
                      {tok}
                    </button>
                  )
                })}
                {d.orgStart !== null && (
                  <button type="button" className="btn-ghost min-h-9 text-micro" onClick={() => onChange(applySplit(d, null, kind))} data-testid="add-draft-no-org">
                    {t('add.preview.noOrg', { org: orgWord })}
                  </button>
                )}
              </div>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-micro">
            {d.split === 'marker' && <Chip tone="violet">{t('add.preview.autoSplit')}</Chip>}
            {d.position ? (
              <Chip tone={d.positionFrom === 'locality' ? 'warn' : 'success'} testId="add-draft-place">
                {d.positionFrom === 'locality' ? t('add.preview.placeApprox', { place: d.place }) : t(`add.location.via.${d.positionFrom}`)}
              </Chip>
            ) : kind !== 'volunteer' ? (
              <Chip tone="warn" testId="add-draft-noplace">{d.place ? t('add.preview.placeNoPin', { place: d.place }) : t('add.preview.noPlace')}</Chip>
            ) : null}
            {d.problems.includes('noPhone') && <Chip tone="muted">{t('add.preview.noPhone')}</Chip>}
            {d.problems.includes('noName') && <Chip tone="warn">{t('add.preview.noName')}</Chip>}
            {d.problems.includes('noOrg') && <Chip tone="warn">{t('add.preview.noOrgName')}</Chip>}
            {d.problems.includes('shortLink') && <Chip tone="warn">{t('add.location.shortLink')}</Chip>}
            {d.problems.includes('unreadLocation') && <Chip tone="warn">{t('add.location.unreadable')}</Chip>}
            {d.problems.includes('splitUncertain') && <Chip tone="warn">{t('add.preview.splitUncertain')}</Chip>}
            {d.cardInstitution && kind === 'volunteer' && <Chip tone="muted">{t('add.preview.cardSays', { name: d.cardInstitution })}</Chip>}
            {d.origin.file && <Chip tone="muted">{d.origin.file}</Chip>}
          </div>
          {dup && (
            <p className="mt-1.5 text-caption font-semibold text-status-warn-ink" data-testid="add-draft-dup">
              {t(`add.dup.${dup.kind}`, { name: dup.name })}
            </p>
          )}
          {open && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="add-draft-edit">
              <Field label={t('add.form.first')} value={d.firstName} onChange={(v) => onChange(editDraft(d, { firstName: v }, kind))} testId="add-draft-first" />
              <Field label={t('add.form.last')} value={d.lastName} onChange={(v) => onChange(editDraft(d, { lastName: v }, kind))} testId="add-draft-last" />
              {kind !== 'volunteer' && <Field label={orgWord} value={d.orgName} onChange={(v) => onChange(editDraft(d, { orgName: v }, kind))} testId="add-draft-org" />}
              <Field label={t('add.form.phone')} value={localPhoneDisplay(d.phone)} onChange={(v) => onChange(editDraft(d, { phone: v }, kind))} testId="add-draft-phone-input" type="tel" ltr />
              {kind !== 'volunteer' && (
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-caption font-semibold text-content-secondary">{t('add.form.location')}</span>
                  <input
                    className="input min-h-11"
                    value={where}
                    dir="ltr"
                    placeholder={t('add.form.locationPlaceholder')}
                    onChange={(e) => {
                      setWhere(e.target.value)
                      onChange(locateDraft(d, e.target.value, kind))
                    }}
                    data-testid="add-draft-location"
                  />
                  <LocationEcho text={where} />
                </label>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button type="button" className="btn-ghost min-h-11 min-w-11" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t('add.preview.edit')} data-testid="add-draft-edit-toggle">
            <Icon name="edit" size={16} />
          </button>
          <button type="button" className="btn-ghost min-h-11 min-w-11" onClick={onRemove} aria-label={t('add.preview.remove')} data-testid="add-draft-remove">
            <Icon name="close" size={16} />
          </button>
        </div>
      </div>
    </li>
  )
}

function Chip({ tone, children, testId }: { tone: 'violet' | 'warn' | 'success' | 'muted'; children: ReactNode; testId?: string }) {
  const cls =
    tone === 'violet'
      ? 'bg-status-violet/15 text-status-violet-ink'
      : tone === 'warn'
        ? 'bg-status-warn/15 text-status-warn-ink'
        : tone === 'success'
          ? 'bg-status-success/15 text-status-success-ink'
          : 'bg-surface-high text-content-secondary'
  return (
    <span className={`chip ${cls}`} data-testid={testId}>
      {children}
    </span>
  )
}
