import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'

import {
  FARM_PIPELINE,
  createFarm,
  getFarm,
  newContactId,
  updateFarm,
} from '@core/index'
import type { FarmContact, FarmDraft, FarmStatus, FarmType } from '@core/index'

import { Avatar } from '../../components/Avatar'
import { Icon } from '../../components/Icon'
import { PhotoField } from '../../components/PhotoField'
import {
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
  const [status, setStatus] = useState<FarmStatus>(
    existing?.status ?? 'to_contact',
  )
  const [lat, setLat] = useState(String(existing?.position.lat ?? ''))
  const [lng, setLng] = useState(String(existing?.position.lng ?? ''))
  const [farmHectares, setFarmHectares] = useState(
    String(existing?.farmHectares ?? ''),
  )
  const [grazingHectares, setGrazingHectares] = useState(
    String(existing?.grazingHectares ?? ''),
  )
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
    lat:
      !Number.isFinite(num(lat)) || num(lat) < -90 || num(lat) > 90
        ? t('form.invalidNumber')
        : undefined,
    lng:
      !Number.isFinite(num(lng)) || num(lng) < -180 || num(lng) > 180
        ? t('form.invalidNumber')
        : undefined,
  }
  const contactErrors = contacts.map((c) => ({
    name: !c.name.trim() ? t('form.required') : undefined,
    phone: !c.phone.trim()
      ? t('form.required')
      : !isValidPhone(c.phone)
        ? t('form.invalidPhone')
        : undefined,
  }))

  const valid =
    Object.values(errors).every((e) => e === undefined) &&
    contactErrors.every((e) => !e.name && !e.phone)

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

    const draft: FarmDraft = {
      photo,
      name: name.trim(),
      locality: locality.trim(),
      region: region.trim(),
      type,
      status,
      position: { lat: num(lat), lng: num(lng) },
      farmHectares: Number.isFinite(num(farmHectares)) ? num(farmHectares) : 0,
      grazingHectares: Number.isFinite(num(grazingHectares))
        ? num(grazingHectares)
        : 0,
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

  return (
    <div className="mx-auto max-w-5xl">
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
          <div className="md:col-span-2">
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
          <TextField
            label={t('form.locality')}
            value={locality}
            onChange={setLocality}
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
            <p className="muted md:col-span-2">{t('form.noContacts')}</p>
          ) : (
            contacts.map((contact, i) => (
              <div
                key={contact.id}
                className="rounded-md border border-edge-subtle bg-surface-sunken/60 p-3 md:col-span-2"
              >
                <div className="mb-3 flex items-center gap-3">
                  <Avatar photo={contact.photo} name={contact.name || '?'} size="md" />
                  <PhotoCompact
                    value={contact.photo}
                    onChange={(v) => patchContact(i, { photo: v })}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
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
          <TextField
            label={t('form.farmArea')}
            value={farmHectares}
            onChange={setFarmHectares}
            type="number"
            ltr
          />
          <TextField
            label={t('form.grazingArea')}
            value={grazingHectares}
            onChange={setGrazingHectares}
            type="number"
            ltr
          />
        </FormSection>

        <FormSection title={t('form.sectionLocation')}>
          <TextField
            label={t('form.lat')}
            value={lat}
            onChange={setLat}
            error={show('lat')}
            type="number"
            ltr
            required
          />
          <TextField
            label={t('form.lng')}
            value={lng}
            onChange={setLng}
            error={show('lng')}
            type="number"
            ltr
            required
            hint={t('form.pickOnMapHint')}
          />
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
            className="md:col-span-2"
          />
        </FormSection>

        <FormActions
          onCancel={cancel}
          cancelLabel={t('common.cancel')}
          submitLabel={t('common.save')}
          onSubmit={submit}
        />
      </div>
    </div>
  )
}
