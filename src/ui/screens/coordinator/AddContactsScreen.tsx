import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

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
import { InfoTip, TitleWithInfo } from '../../components/InfoTip'
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AX10 (2026-10-10) — AJOUTER QUOI QUE CE SOIT : UN SEUL ENDROIT, PAR ÉTAPES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Je suis perdu entre les façons d'ajouter une ferme, une institution, un
 *   volontaire, un contact. » L'inventaire en comptait DOUZE. Celui-ci est
 * l'unique point d'entrée (le « + » y mène, les listes y mènent, le type déjà
 * dit) — et il prolonge AW2 au lieu d'ajouter un écran.
 *
 * L'ORDRE EST CELUI DU PO : « d'abord un nom, obligatoire, puis ce que c'est,
 * puis ce que ce type-là demande ». Chaque étape n'apparaît que quand la
 * précédente a sa réponse ; RIEN N'EST DÉPLOYÉ D'AVANCE (les trois chemins
 * d'AW2 étaient ouverts côte à côte, grisés, avant même le type).
 *
 * Ce qu'on DÉPOSE au lieu de taper — des fiches .vcf, un texte collé, une
 * liste Excel/CSV qu'une institution a fournie — se choisit d'un toucher sous
 * le nom ; puis, là aussi, ce que c'est.
 *
 * Les CINQ types et ce qu'ils deviennent :
 *   חקלאי לפנות אליו → une piste (`leads`, comme AW2 « חוות »)
 *   כרטיס חווה        → le formulaire complet de la ferme (ou du מושב), nom repris
 *   מוסד              → une institution (`institutions`)
 *   מתנדב             → un volontaire RATTACHÉ à son institution
 *   נהג מתנדב         → le formulaire du chauffeur, nom repris
 */
type AddType = 'farm' | 'farmFile' | 'institution' | 'volunteer' | 'driver'
type Source = 'name' | 'vcf' | 'paste' | 'list'
const ADD_TYPES: readonly AddType[] = ['farm', 'farmFile', 'institution', 'volunteer', 'driver']
const FILE_TYPES: readonly AddType[] = ['farm', 'institution', 'volunteer']
const LIST_TYPES: readonly AddType[] = ['volunteer', 'institution', 'farmFile']
const isContactKind = (k: AddType | null): k is ContactKind => k === 'farm' || k === 'institution' || k === 'volunteer'

const KIND_ICON: Record<AddType, ReactNode> = {
  farm: <Icon name="userPlus" size={24} />,
  farmFile: <Icon name="farm" size={24} />,
  institution: <Icon name="school" size={24} />,
  volunteer: <Icon name="users" size={24} />,
  driver: <Icon name="steering" size={24} />,
}

type Done = { kind: ContactKind; count: number } | null

export function AddContactsScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const initial = params.get('type')
  const [type, setTypeState] = useState<AddType | null>(
    (ADD_TYPES as readonly string[]).includes(initial ?? '') ? (initial as AddType) : null,
  )
  const initialSource = params.get('source')
  const [source, setSourceState] = useState<Source>(initialSource === 'vcf' || initialSource === 'paste' || initialSource === 'list' ? initialSource : 'name')
  const [name, setName] = useState('')
  const kind: ContactKind | null = isContactKind(type) ? type : null
  const setType = (k: AddType) => {
    setTypeState(k)
    setDone(null)
    // Le type change le découpage de TOUS les brouillons déjà lus.
    if (isContactKind(k)) setDrafts((ds) => ds.map((d) => resplit(d, k)))
    const next = new URLSearchParams(params)
    next.set('type', k)
    setParams(next, { replace: true })
  }
  const setSource = (s: Source) => {
    setSourceState(s)
    setDone(null)
    const next = new URLSearchParams(params)
    if (s === 'name') next.delete('source')
    else next.set('source', s)
    setParams(next, { replace: true })
    // Un type que cette source ne sait pas lire est oublié, pas gardé en silence.
    if (type && !(s === 'name' ? ADD_TYPES : s === 'list' ? LIST_TYPES : FILE_TYPES).includes(type)) setTypeState(null)
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

  const needsInstitution = type === 'volunteer'
  const ready = type !== null && (!needsInstitution || institution !== null)
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

  const named = name.trim().length > 0
  /* Les étapes : ② dès qu'il y a un nom (ou une autre source) ; ③ dès que le type est dit. */
  const showType = source !== 'name' || named
  const showDetails = showType && ready
  const types = source === 'name' ? ADD_TYPES : source === 'list' ? LIST_TYPES : FILE_TYPES

  return (
    <div className="mx-auto max-w-4xl" data-testid="add-contacts" data-kind={type ?? ''} data-source={source} data-step={showDetails ? 3 : showType ? 2 : 1}>
      <PageHeader
        title={t('add.titleOne')}
        info={<p>{t('add.info')}</p>}
        back={{ to: '/coordinator', label: t('nav.dashboard') }}
      />

      {/* ------------------------------------------------------------------ */}
      {/* ① LE NOM — ou ce qu'on dépose                                       */}
      {/* ------------------------------------------------------------------ */}
      <section aria-labelledby="add-name-title" className="mt-2" data-testid="add-step-1">
        {source === 'name' ? (
          <>
            <label id="add-name-title" htmlFor="add-name" className="flex items-center gap-2 text-heading text-content-primary">
              <StepNumber n={1} />
              {t('add.step.name')}
              <span aria-hidden="true" className="text-status-danger-ink">*</span>
            </label>
            <input
              id="add-name"
              className="input mt-3 min-h-[3.25rem] w-full text-body"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setDone(null)
              }}
              dir="auto"
              autoFocus
              placeholder={t('add.namePlaceholder')}
              data-testid="add-name"
              /* ★★ AX10 — Entrée = « et ensuite » : le formulaire du type déjà dit
                 (ferme, chauffeur), sinon le premier champ de l'étape ③. */
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !name.trim()) return
                e.preventDefault()
                if (type === 'farmFile') navigate(`/coordinator/farms/new?name=${encodeURIComponent(name.trim())}`)
                else if (type === 'driver') navigate(`/coordinator/drivers/new?name=${encodeURIComponent(name.trim())}`)
                else requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-testid="add-form-phone"]')?.focus())
              }}
            />
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-caption text-content-muted" data-testid="add-sources">
              <span>{t('add.orFrom')}</span>
              <button type="button" className="btn-ghost min-h-11 px-2.5 py-1" onClick={() => setSource('vcf')} data-testid="add-source-vcf">
                <Icon name="user" size={15} />
                {t('add.source.vcf')}
              </button>
              <button type="button" className="btn-ghost min-h-11 px-2.5 py-1" onClick={() => setSource('paste')} data-testid="add-source-paste">
                <Icon name="copy" size={15} />
                {t('add.source.paste')}
              </button>
              <button type="button" className="btn-ghost min-h-11 px-2.5 py-1" onClick={() => setSource('list')} data-testid="add-source-list">
                <Icon name="table" size={15} />
                {t('add.source.list')}
              </button>
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="add-name-title" className="flex items-center gap-2 text-heading text-content-primary">
              <StepNumber n={1} />
              {t(`add.source.${source}`)}
            </h2>
            <button type="button" className="btn-ghost min-h-11" onClick={() => setSource('name')} data-testid="add-source-name">
              <Icon name="edit" size={15} />
              {t('add.source.backToName')}
            </button>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* ② CE QUE C'EST                                                      */}
      {/* ------------------------------------------------------------------ */}
      {showType && (
        <section aria-labelledby="add-kind-title" className="mt-6 animate-fade-in" data-testid="add-step-2">
          <h2 id="add-kind-title" className="flex items-center gap-2 text-heading text-content-primary">
            <StepNumber n={2} />
            {source === 'name' ? t('add.step.typeNamed', { name: name.trim() }) : t('add.step.type')}
          </h2>
          <div role="radiogroup" aria-labelledby="add-kind-title" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" data-testid="add-kind">
            {types.map((k) => {
              const on = type === k
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setType(k)}
                  data-testid={`add-kind-${k}`}
                  className={`flex min-h-[4rem] items-center gap-3 rounded-card border-2 p-3 text-start transition-colors duration-fast ${on ? 'border-accent bg-accent/10' : 'border-edge-subtle bg-surface-raised hover:bg-surface-high'}`}
                >
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-pill ${on ? 'bg-accent text-content-on-accent' : 'bg-surface-high text-content-secondary'}`}>
                    {KIND_ICON[k]}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body font-bold text-content-primary">{t(`add.type.${k}`)}</span>
                    <span className="block truncate text-caption text-content-secondary">{t(`add.typeHint.${k}`)}</span>
                  </span>
                </button>
              )
            })}
          </div>
          {needsInstitution && <InstitutionPicker institutions={institutions} value={instId} onChange={setInstId} />}
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ③ CE QUE CE TYPE-LÀ DEMANDE                                         */}
      {/* ------------------------------------------------------------------ */}
      {showDetails && type && (
        <section aria-labelledby="add-details-title" className="mt-6 animate-fade-in" data-testid="add-step-3" data-type={type}>
          <h2 id="add-details-title" className="flex items-center gap-2 text-heading text-content-primary">
            <StepNumber n={3} />
            {t(`add.step.details.${source === 'name' ? type : source}`)}
          </h2>
          <div className="mt-3">
            {source === 'name' && kind && (
              <ManualDetails
                kind={kind}
                name={name.trim()}
                institution={institution}
                existing={existing}
                onSave={(d) => {
                  const n = write([d])
                  if (n) {
                    setDone({ kind, count: n })
                    setName('')
                  }
                }}
              />
            )}
            {source === 'name' && type === 'farmFile' && <FarmFileStep name={name.trim()} onGo={(to) => navigate(to)} />}
            {source === 'name' && type === 'driver' && (
              <button type="button" className="btn-primary min-h-11" onClick={() => navigate(`/coordinator/drivers/new?name=${encodeURIComponent(name.trim())}`)} data-testid="add-driver-go">
                <Icon name="steering" size={16} />
                {t('add.driverGo')}
              </button>
            )}
            {source === 'vcf' && <FilesPath kind={kind} onDrafts={addDrafts} />}
            {source === 'paste' && <PastePath kind={kind} onDrafts={addDrafts} />}
            {source === 'list' && <ListStep type={type} institution={institution} onGo={(to) => navigate(to)} />}
          </div>
        </section>
      )}

      {done && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-card bg-status-success/15 p-3 text-caption font-semibold text-status-success-ink" role="status" data-testid="add-done" data-count={done.count}>
          <Icon name="check" size={18} />
          <span className="flex-1">{t(`add.done.${done.kind}`, { count: done.count, institution: institution?.name ?? '' })}</span>
          <Link to={done.kind === 'farm' ? '/coordinator/leads' : done.kind === 'institution' ? '/coordinator/institutions' : '/coordinator/volunteers'} className="btn-secondary min-h-11" data-testid="add-done-open">
            {t(`add.open.${done.kind}`)}
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* ④ L'APERÇU (fiches et collage)                                      */}
      {/* ------------------------------------------------------------------ */}
      {kind && drafts.length > 0 && (
        <section aria-labelledby="add-preview-title" className="mt-6" data-testid="add-preview" data-count={drafts.length} data-chosen={chosen.length}>
          <h2 id="add-preview-title" className="flex items-center gap-2 text-heading text-content-primary">
            <StepNumber n={4} />
            {t('add.previewTitle', { count: drafts.length })}
          </h2>
          <InfoTip testId="add-preview-info" className="mt-1">
            <p>{t('add.previewHint')}</p>
          </InfoTip>
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

/** ③ pour une piste, une institution, un volontaire tapés à la main : le reste, tout facultatif. */
function ManualDetails({
  kind,
  name,
  institution,
  existing,
  onSave,
}: {
  kind: ContactKind
  name: string
  institution: Institution | null
  existing: Parameters<typeof findDuplicates>[1]
  onSave: (d: ContactDraft) => void
}) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [other, setOther] = useState('')
  const [where, setWhere] = useState('')
  const [confirmDup, setConfirmDup] = useState(false)
  const draft = useMemo(() => {
    if (kind === 'institution') {
      // Le nom tapé EST l'institution ; « autre » est la personne à appeler.
      const base = draftFromName({ fullName: other.trim(), phone, origin: { path: 'form' }, locationText: where }, 'institution')
      return { ...base, orgName: name, split: 'form' as const }
    }
    const base = draftFromName({ fullName: name, orgField: kind === 'farm' ? other.trim() || undefined : undefined, phone, origin: { path: 'form' }, locationText: where }, kind)
    return base
  }, [kind, name, phone, other, where])
  const dup = useMemo(() => findDuplicates([draft], existing, kind)[0] ?? null, [draft, existing, kind])
  useEffect(() => setConfirmDup(false), [name, phone, other])
  const save = () => {
    if (!name) return
    if (dup && !confirmDup) {
      setConfirmDup(true)
      return
    }
    onSave(draft)
    setPhone('')
    setOther('')
    setWhere('')
    setConfirmDup(false)
  }
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface-raised p-4 shadow-card" data-testid="add-path-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('add.form.phone')} value={phone} onChange={(v) => setPhone(formatPhoneTyping(v))} testId="add-form-phone" type="tel" ltr />
        {kind !== 'volunteer' && <Field label={t(`add.form.other.${kind}`)} value={other} onChange={setOther} testId="add-form-org" />}
      </div>
      {kind !== 'volunteer' && (
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-content-secondary">{t('add.form.location')}</span>
          <input className="input min-h-11" value={where} onChange={(e) => setWhere(e.target.value)} dir="ltr" placeholder={t('add.form.locationPlaceholder')} data-testid="add-form-location" />
          <LocationEcho text={where} />
        </label>
      )}
      {dup && (
        <p className="text-caption font-semibold text-status-warn-ink" data-testid="add-form-dup">
          {t(`add.dup.${dup.kind}`, { name: dup.name })}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary min-h-11" disabled={!name} onClick={save} data-testid="add-form-save">
          <Icon name="check" size={16} />
          {dup && confirmDup ? t('add.form.saveAnyway') : t(`add.form.saveAs.${kind}`)}
        </button>
        {kind === 'volunteer' && institution && (
          /* Le formulaire complet (âge, disponibilités, permis…), le nom et l'institution repris. */
          <Link to={`/coordinator/volunteers/new?name=${encodeURIComponent(name)}&institution=${institution.id}`} className="btn-ghost min-h-11" data-testid="add-volunteer-full">
            {t('add.fullForm')}
          </Link>
        )}
      </div>
    </div>
  )
}

/** ③ pour une ferme : le formulaire complet, le nom repris — ferme ou מושב. */
function FarmFileStep({ name, onGo }: { name: string; onGo: (to: string) => void }) {
  const { t } = useTranslation()
  const [moshav, setMoshav] = useState(false)
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface-raised p-4 shadow-card" data-testid="add-farm-file">
      <span role="radiogroup" aria-label={t('add.farmKind')} className="flex flex-nowrap gap-1">
        {[false, true].map((m) => (
          <button
            key={String(m)}
            type="button"
            role="radio"
            aria-checked={moshav === m}
            onClick={() => setMoshav(m)}
            data-testid={`add-farm-kind-${m ? 'moshav' : 'farm'}`}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-field border text-caption font-semibold ${moshav === m ? 'border-accent bg-accent/15 text-accent-ink' : 'border-edge-subtle text-content-secondary hover:bg-surface-high'}`}
          >
            {t(m ? 'farms.newMoshav' : 'farms.new')}
          </button>
        ))}
      </span>
      <button
        type="button"
        className="btn-primary min-h-11 self-start"
        onClick={() => onGo(`/coordinator/farms/new?name=${encodeURIComponent(name)}${moshav ? '&kind=moshav' : ''}`)}
        data-testid="add-farm-go"
      >
        <Icon name="farm" size={16} />
        {t('add.farmGo')}
      </button>
    </div>
  )
}

/** ③ pour une liste Excel/CSV : l'assistant d'import du bon type, l'institution reprise. */
function ListStep({ type, institution, onGo }: { type: AddType; institution: Institution | null; onGo: (to: string) => void }) {
  const { t } = useTranslation()
  const to =
    type === 'volunteer'
      ? `/coordinator/import/volunteers${institution ? `?institution=${institution.id}` : ''}`
      : type === 'institution'
        ? '/coordinator/import/institutions'
        : '/coordinator/import/farms'
  return (
    <div className="flex flex-col gap-3 rounded-card bg-surface-raised p-4 shadow-card" data-testid="add-list">
      <p className="text-caption text-content-secondary">{t(`add.list.${type}`, { name: institution?.name ?? '' })}</p>
      <button type="button" className="btn-primary min-h-11 self-start" onClick={() => onGo(to)} data-testid="add-list-go" data-to={to}>
        <Icon name="upload" size={16} />
        {t('add.list.go')}
      </button>
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
      <TitleWithInfo as="h3" info={hint} className="gap-2 text-body font-bold text-content-primary">
        {icon}
        {title}
      </TitleWithInfo>
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
