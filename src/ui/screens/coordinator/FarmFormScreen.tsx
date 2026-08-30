import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  LOCALITY_POSITIONS,
  NEGEV_CENTER,
  createFarm,
  getFarm,
  getFarmZonesForFarm,
  ringAreaDunams,
  fromDayKey,
  isEmail,
  iso,
  localDayKey,
  newAgreementId,
  newContactId,
  now,
  positionOfLocality,
  updateFarm,
} from '@core/index'
import type {
  Agreement,
  CommitmentKind,
  EntityKind,
  FarmCommitment,
  FarmContact,
  FarmDraft,
  FarmStatus,
  FarmType,
  LatLng,
} from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { PhotoField } from '../../components/PhotoField'
import { MapSplit } from '../../components/MapSplit'
import { PinMap } from '../../components/PinMap'
import {
  AutocompleteField,
  Field,
  FormActions,
  FormSection,
  SelectField,
  TextArea,
  TextField,
  isValidPhone,
} from '../../components/fields'
import { PageHeader } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

/** Compact camera/import pair for an inline contact row. */
function PhotoCompact({
  value,
  onChange,
}: {
  value: string | null
  onChange: (v: string | null) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="min-w-0 flex-1">
      <PhotoField
        label={t('photo.personLabel')}
        value={value}
        onChange={onChange}
        name="?"
        hint={t('photo.hint')}
      />
    </div>
  )
}

const STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']
const TYPES: FarmType[] = ['agriculture', 'livestock', 'mixed']

/**
 * R5.1 — farm create/edit.
 *
 * Two-column responsive layout grouped by meaning: identity → contacts →
 * areas → status → notes. Saving writes to the mock store, so the change is
 * visible everywhere for the rest of the session.
 */
/** G15 — the provenance line under a dunam field: override chip + the way
 *  back to the zone sum, or the sum's name when it is the live source. */
function DunamSourceRow({
  manual,
  autoSum,
  onAuto,
}: {
  manual: boolean
  autoSum: number | null
  onAuto: (sum: number) => void
}) {
  const { t } = useTranslation()
  if (manual) {
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <span className="chip bg-status-warn/15 text-status-warn-ink">
          {t('zone.manualOverride')}
        </span>
        {autoSum !== null && (
          <button
            type="button"
            onClick={() => onAuto(autoSum)}
            className="text-micro font-semibold text-accent-ink hover:underline"
          >
            {t('zone.backToAuto')} (
            <span className="numeric ltr-nums">{autoSum}</span>)
          </button>
        )}
      </div>
    )
  }
  if (autoSum === null) return null
  return (
    <p className="muted mt-1">
      {t('zone.autoFromZones')} ·{' '}
      <span className="numeric ltr-nums">{autoSum}</span>
    </p>
  )
}

export function FarmFormScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { farmId } = useParams()

  const existing = useCoreValue(() => (farmId ? getFarm(farmId) : null))
  const isEdit = Boolean(farmId)

  const [name, setName] = useState(existing?.name ?? '')
  const [locality, setLocality] = useState(existing?.locality ?? '')
  const [region, setRegion] = useState(existing?.region ?? '')
  const [type, setType] = useState<FarmType>(existing?.type ?? 'mixed')
  // G16 — חווה / מושב / אחר. New records default to a farm.
  const [entityKind, setEntityKind] = useState<EntityKind>(
    existing?.entityKind ?? 'farm',
  )
  const [status, setStatus] = useState<FarmStatus>(
    existing?.status ?? 'to_contact',
  )
  const [position, setPosition] = useState<LatLng | null>(
    existing?.position ?? null,
  )
  const [commitments, setCommitments] = useState<FarmCommitment[]>(
    existing?.commitments ?? [],
  )
  const [agreements, setAgreements] = useState<Agreement[]>(
    existing?.agreements ?? [],
  )
  const [farmDunams, setFarmHectares] = useState(
    String(existing?.farmDunams ?? ''),
  )
  const [grazingDunams, setGrazingHectares] = useState(
    String(existing?.grazingDunams ?? ''),
  )
  // G15 — typing in a dunam field flips it to "מוזן ידנית"; the button under
  // the field hands it back to the zone sum.
  const [farmManual, setFarmManual] = useState(
    Boolean(existing?.farmDunamsManual),
  )
  const [grazingManual, setGrazingManual] = useState(
    Boolean(existing?.grazingDunamsManual),
  )
  const zones = useCoreValue(() => (farmId ? getFarmZonesForFarm(farmId) : []))
  const zoneSum = (kind: 'farm_boundary' | 'grazing_area'): number | null => {
    const of = zones.filter((z) => z.kind === kind)
    if (of.length === 0) return null
    return Math.round(of.reduce((s, z) => s + ringAreaDunams(z.ring), 0))
  }
  const [contacts, setContacts] = useState<FarmContact[]>(
    existing?.contacts ?? [],
  )
  const [notes, setNotes] = useState(existing?.notes ?? '')
  const [photo, setPhoto] = useState<string | null>(existing?.photo ?? null)
  const [touched, setTouched] = useState(false)

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))

  const errors = {
    name: !name.trim() ? t('form.required') : undefined,
    locality: !locality.trim() ? t('form.required') : undefined,
    // A37 — a farm exists only where its pin is: no pin, no farm.
    position: !position ? t('form.pinRequired') : undefined,
  }
  const contactErrors = contacts.map((c) => ({
    name: !c.name.trim() ? t('form.required') : undefined,
    phone: !c.phone.trim()
      ? t('form.required')
      : !isValidPhone(c.phone)
        ? t('form.invalidPhone')
        : undefined,
    // P0bis.5a — optional, checked only when filled.
    email:
      c.email.trim() && !isEmail(c.email) ? t('form.invalidEmail') : undefined,
  }))

  const valid =
    Object.values(errors).every((e) => e === undefined) &&
    contactErrors.every((e) => !e.name && !e.phone && !e.email)

  const show = (key: keyof typeof errors) => (touched ? errors[key] : undefined)

  const patchContact = (index: number, patch: Partial<FarmContact>) => {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    )
  }

  const addContact = () => {
    setContacts((prev) => [
      ...prev,
      {
        id: newContactId(),
        name: '',
        phone: '',
        email: '',
        role: '',
        photo: null,
        // The first contact added is the one who can sign in as FARMER.
        isPrimary: prev.length === 0,
      },
    ])
  }

  const removeContact = (index: number) => {
    setContacts((prev) => {
      const next = prev.filter((_, i) => i !== index)
      // Never leave a farm with contacts but no primary — the farmer role
      // resolves its identity through that flag.
      if (next.length > 0 && !next.some((c) => c.isPrimary)) {
        next[0] = { ...next[0], isPrimary: true }
      }
      return next
    })
  }

  const setPrimary = (index: number) => {
    setContacts((prev) => prev.map((c, i) => ({ ...c, isPrimary: i === index })))
  }

  const submit = () => {
    setTouched(true)
    if (!valid) return

    if (!position) return

    const draft: FarmDraft = {
      photo,
      name: name.trim(),
      locality: locality.trim(),
      region: region.trim(),
      type,
      entityKind,
      status,
      position,
      commitments: commitments.map((c) => ({ ...c, detail: c.detail.trim() })),
      agreements: agreements.map((a) => ({ ...a, signedBy: a.signedBy.trim() })),
      farmDunams: Number.isFinite(num(farmDunams)) ? num(farmDunams) : 0,
      grazingDunams: Number.isFinite(num(grazingDunams))
        ? num(grazingDunams)
        : 0,
      farmDunamsManual: farmManual,
      grazingDunamsManual: grazingManual,
      contacts: contacts.map((c) => ({
        ...c,
        name: c.name.trim(),
        phone: c.phone.trim(),
        role: c.role.trim(),
      })),
      notes: notes.trim(),
    }

    if (isEdit && farmId) {
      updateFarm(farmId, draft)
      navigate(`/coordinator/farms/${farmId}`)
    } else {
      const farm = createFarm(draft)
      navigate(`/coordinator/farms/${farm.id}`)
    }
  }

  const cancel = () =>
    navigate(isEdit && farmId ? `/coordinator/farms/${farmId}` : '/coordinator/farms')

  /* G2.1/P0bis.1 — the coordinates are not typed, they are pointed at, and
     under the frozen gabarit the pin map is the LEFT panel rather than a block
     halfway down the form. That is also the better form: the map follows the
     locality field while no pin exists, so typing the town puts the right
     hills on screen, and the pin stays visible while the rest is filled in. */
  const mapBody = (
    <PinMap
      flush
      value={position}
      onChange={setPosition}
      fallbackCenter={positionOfLocality(locality) ?? NEGEV_CENTER}
      error={show('position')}
    />
  )

  return (
    <MapSplit
      screenKey="farm-form"
      ariaLabel={t('form.sectionFarmLocation')}
      breakpoint="xl"
      contentPercent={50}
      splitHeight="h-[42dvh] min-h-[18rem]"
      map={() => mapBody}
    >
      {() => (
        <>
      <PageHeader
        title={t(isEdit ? 'farms.edit' : 'farms.new')}
        subtitle={isEdit ? existing?.name : undefined}
        back={{
          to:
            isEdit && farmId
              ? `/coordinator/farms/${farmId}`
              : '/coordinator/farms',
          label: t('farms.title'),
        }}
      />

      <div className="flex flex-col gap-4">
        <FormSection title={t('form.sectionIdentity')}>
          <div className="col-span-full">
            <PhotoField
              label={t('photo.farmLabel')}
              value={photo}
              onChange={setPhoto}
              name={name}
              shape="square"
            />
          </div>
          <TextField
            label={t('form.name')}
            value={name}
            onChange={setName}
            error={show('name')}
            required
          />
          <AutocompleteField
            label={t('form.locality')}
            value={locality}
            onChange={setLocality}
            options={Object.keys(LOCALITY_POSITIONS)}
            error={show('locality')}
            required
          />
          <TextField label={t('form.region')} value={region} onChange={setRegion} />
          <SelectField<FarmType>
            label={t('form.type')}
            value={type}
            onChange={setType}
            options={TYPES.map((v) => ({ value: v, label: t(`farmType.${v}`) }))}
          />
          {/* G16 — what KIND of entity this record is. A moshav keeps every
              mechanic and changes marker, zone tints and boundary wording. */}
          <SelectField<EntityKind>
            label={t('form.entityKind')}
            value={entityKind}
            onChange={setEntityKind}
            options={(['farm', 'moshav', 'other'] as EntityKind[]).map((v) => ({
              value: v,
              label: t(`entityKind.${v}`),
            }))}
          />
        </FormSection>

        <FormSection
          title={t('form.sectionContacts')}
          action={
            <button type="button" onClick={addContact} className="btn-ghost py-1.5">
              <Icon name="plus" size={15} />
              {t('form.addContact')}
            </button>
          }
        >
          {contacts.length === 0 ? (
            <p className="muted col-span-full">{t('form.noContacts')}</p>
          ) : (
            contacts.map((contact, i) => (
              <div
                key={contact.id}
                className="rounded-field border border-edge-subtle bg-surface-high p-3 col-span-full"
              >
                <div className="mb-3 flex items-center gap-3">
                  <Avatar photo={contact.photo} name={contact.name || '?'} size="md" />
                  <PhotoCompact
                    value={contact.photo}
                    onChange={(v) => patchContact(i, { photo: v })}
                  />
                </div>
                <div className="auto-cols gap-3 [--col-min:9rem]">
                  <TextField
                    label={t('form.contactName')}
                    value={contact.name}
                    onChange={(v) => patchContact(i, { name: v })}
                    error={touched ? contactErrors[i]?.name : undefined}
                    required
                  />
                  <TextField
                    label={t('form.contactPhone')}
                    value={contact.phone}
                    onChange={(v) => patchContact(i, { phone: v })}
                    error={touched ? contactErrors[i]?.phone : undefined}
                    type="tel"
                    ltr
                    required
                  />
                  <TextField
                    label={t('form.contactEmail')}
                    value={contact.email}
                    onChange={(v) => patchContact(i, { email: v })}
                    error={touched ? contactErrors[i]?.email : undefined}
                    type="email"
                    ltr
                    placeholder="name@example.co.il"
                  />
                  <TextField
                    label={t('form.contactRole')}
                    value={contact.role}
                    onChange={(v) => patchContact(i, { role: v })}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-caption text-content-secondary">
                    <input
                      type="radio"
                      name="primary-contact"
                      checked={contact.isPrimary}
                      onChange={() => setPrimary(i)}
                      className="h-4 w-4 accent-accent"
                    />
                    {t('form.contactPrimary')}
                  </label>
                  <button
                    type="button"
                    onClick={() => removeContact(i)}
                    className="btn-ghost py-1.5 text-status-danger-ink hover:bg-status-danger/10"
                  >
                    <Icon name="trash" size={15} />
                    {t('form.removeContact')}
                  </button>
                </div>
              </div>
            ))
          )}
        </FormSection>

        <FormSection title={t('form.sectionAreas')}>
          {/* G15 — each field says where its number comes from: typed values
              wear the "מוזן ידנית" chip and can be handed back to the zone
              sum; automatic values name their source. */}
          <div>
            <TextField
              label={t('form.farmArea')}
              value={farmDunams}
              onChange={(v) => {
                setFarmHectares(v)
                setFarmManual(true)
              }}
              type="number"
              ltr
            />
            <DunamSourceRow
              manual={farmManual}
              autoSum={zoneSum('farm_boundary')}
              onAuto={(sum) => {
                setFarmManual(false)
                setFarmHectares(String(sum))
              }}
            />
          </div>
          <div>
            <TextField
              label={t('form.grazingArea')}
              value={grazingDunams}
              onChange={(v) => {
                setGrazingHectares(v)
                setGrazingManual(true)
              }}
              type="number"
              ltr
            />
            <DunamSourceRow
              manual={grazingManual}
              autoSum={zoneSum('grazing_area')}
              onAuto={(sum) => {
                setGrazingManual(false)
                setGrazingHectares(String(sum))
              }}
            />
          </div>
        </FormSection>

        {/* G2.4 — the detail screen shows commitments and agreements, so the
            form must be able to write them: a datum with no way in is either
            dead weight or a lie. Real agreement signing (PDF, signature) is
            Lot 3; this records the FACT of one. */}
        <FormSection
          title={t('commitment.title')}
          action={
            <button
              type="button"
              onClick={() =>
                setCommitments((prev) => [
                  ...prev,
                  { kind: 'shelter', detail: '', fulfilled: false },
                ])
              }
              className="btn-ghost py-1.5"
            >
              <Icon name="plus" size={15} />
              {t('form.addCommitment')}
            </button>
          }
        >
          {commitments.length === 0 ? (
            <p className="muted col-span-full">{t('common.none')}</p>
          ) : (
            commitments.map((c, i) => (
              <div
                key={i}
                className="rounded-field border border-edge-subtle bg-surface-high p-3 col-span-full"
              >
                <div className="auto-cols gap-3 [--col-min:13rem]">
                  <SelectField<CommitmentKind>
                    label={t('form.commitmentKind')}
                    value={c.kind}
                    onChange={(kind) =>
                      setCommitments((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, kind } : x)),
                      )
                    }
                    options={(
                      ['shelter', 'water', 'food', 'other'] as CommitmentKind[]
                    ).map((k) => ({ value: k, label: t(`commitment.${k}`) }))}
                  />
                  <TextField
                    label={t('form.commitmentDetail')}
                    value={c.detail}
                    onChange={(detail) =>
                      setCommitments((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, detail } : x)),
                      )
                    }
                  />
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-caption text-content-secondary">
                    <input
                      type="checkbox"
                      checked={c.fulfilled}
                      onChange={(e) =>
                        setCommitments((prev) =>
                          prev.map((x, j) =>
                            j === i ? { ...x, fulfilled: e.target.checked } : x,
                          ),
                        )
                      }
                      className="check"
                    />
                    {t('commitment.fulfilled')}
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setCommitments((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="btn-ghost py-1.5 text-status-danger-ink hover:bg-status-danger/10"
                  >
                    <Icon name="trash" size={15} />
                    {t('common.remove')}
                  </button>
                </div>
              </div>
            ))
          )}
        </FormSection>

        <FormSection
          title={t('farms.agreements')}
          action={
            <button
              type="button"
              onClick={() =>
                setAgreements((prev) => [
                  ...prev,
                  {
                    id: newAgreementId(),
                    signedAt: iso(now()),
                    signedBy: '',
                    fileName: t('form.agreementFileName', {
                      name: name.trim() || '—',
                    }),
                  },
                ])
              }
              className="btn-ghost py-1.5"
            >
              <Icon name="plus" size={15} />
              {t('form.addAgreement')}
            </button>
          }
        >
          {agreements.length === 0 ? (
            <p className="muted col-span-full">{t('farms.noAgreements')}</p>
          ) : (
            agreements.map((a, i) => (
              <div
                key={a.id}
                className="rounded-field border border-edge-subtle bg-surface-high p-3 col-span-full"
              >
                <div className="auto-cols gap-3 [--col-min:13rem]">
                  <TextField
                    label={t('farms.signedBy')}
                    value={a.signedBy}
                    onChange={(signedBy) =>
                      setAgreements((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, signedBy } : x)),
                      )
                    }
                  />
                  <Field label={t('form.signedAt')}>
                    <input
                      type="date"
                      className="input ltr-nums"
                      value={localDayKey(new Date(a.signedAt))}
                      onChange={(e) => {
                        if (!e.target.value) return
                        const signedAt = iso(fromDayKey(e.target.value))
                        setAgreements((prev) =>
                          prev.map((x, j) => (j === i ? { ...x, signedAt } : x)),
                        )
                      }}
                    />
                  </Field>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setAgreements((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="btn-ghost py-1.5 text-status-danger-ink hover:bg-status-danger/10"
                  >
                    <Icon name="trash" size={15} />
                    {t('common.remove')}
                  </button>
                </div>
              </div>
            ))
          )}
        </FormSection>

        <FormSection title={t('form.sectionStatus')}>
          <SelectField<FarmStatus>
            label={t('form.status')}
            value={status}
            onChange={setStatus}
            options={STATUSES.map((v) => ({
              value: v,
              label: t(`farmStatus.${v}`),
            }))}
          />
        </FormSection>

        <FormSection title={t('form.sectionNotes')}>
          <TextArea
            label={t('form.notes')}
            value={notes}
            onChange={setNotes}
            rows={4}
            className="col-span-full"
          />
        </FormSection>

        <FormActions
          onCancel={cancel}
          cancelLabel={t('common.cancel')}
          submitLabel={t('common.save')}
          onSubmit={submit}
        />
      </div>
        </>
      )}
    </MapSplit>
  )
}
