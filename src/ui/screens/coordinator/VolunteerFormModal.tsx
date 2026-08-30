import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LOCALITY_POSITIONS, createVolunteer, updateVolunteer } from '@core/index'
import { DEFAULT_AVAILABILITY } from '@core/index'
import type {
  PhoneType,
  Volunteer,
  VolunteerAvailability,
  VolunteerDraft,
  VolunteerStatus,
} from '@core/index'

import { PhotoField } from '../../components/PhotoField'
import {
  AutocompleteField,
  SelectField,
  SelectOrCreateField,
  TextArea,
  TextField,
  isValidPhone,
} from '../../components/fields'
import { Modal } from '../../components/primitives'

/** R5.3 — volunteer create/edit. `volunteer === null` means create. */
export function VolunteerFormModal({
  volunteer,
  yeshivot,
  onClose,
}: {
  volunteer: Volunteer | null
  yeshivot: string[]
  onClose: () => void
}) {
  const { t } = useTranslation()

  const [name, setName] = useState(volunteer?.name ?? '')
  const [age, setAge] = useState(String(volunteer?.age ?? ''))
  const [phone, setPhone] = useState(volunteer?.phone ?? '')
  const [phoneType, setPhoneType] = useState<PhoneType>(
    volunteer?.phoneType ?? 'smartphone',
  )
  const [yeshiva, setYeshiva] = useState(volunteer?.yeshiva ?? yeshivot[0] ?? '')
  const [locality, setLocality] = useState(volunteer?.locality ?? '')
  const [status, setStatus] = useState<VolunteerStatus>(
    volunteer?.status ?? 'active',
  )
  const [inactiveReason, setInactiveReason] = useState(
    volunteer?.inactiveReason ?? '',
  )
  const [notes, setNotes] = useState(volunteer?.notes ?? '')
  // G5.2 — licence / car / dual hat.
  const [hasLicense, setHasLicense] = useState(volunteer?.hasLicense ?? false)
  const [hasCar, setHasCar] = useState(volunteer?.hasCar ?? false)
  const [canDrive, setCanDrive] = useState(volunteer?.canDrive ?? false)
  // G3.4 — slot preferences.
  const [availability, setAvailability] = useState<VolunteerAvailability>(
    volunteer?.availability ?? { ...DEFAULT_AVAILABILITY },
  )
  const [photo, setPhoto] = useState<string | null>(volunteer?.photo ?? null)
  const [touched, setTouched] = useState(false)

  const ageNum = Number(age)
  const errors = {
    name: !name.trim() ? t('form.required') : undefined,
    phone: !phone.trim()
      ? t('form.required')
      : !isValidPhone(phone)
        ? t('form.invalidPhone')
        : undefined,
    age:
      age.trim() && (!Number.isFinite(ageNum) || ageNum < 14 || ageNum > 99)
        ? t('form.invalidNumber')
        : undefined,
    locality: !locality.trim() ? t('form.required') : undefined,
    // An inactive volunteer without a reason is how a roster rots: nobody
    // remembers six months later why the person was taken off the list.
    inactiveReason:
      status === 'inactive' && !inactiveReason.trim()
        ? t('form.required')
        : undefined,
  }
  const valid = Object.values(errors).every((e) => e === undefined)

  const submit = () => {
    setTouched(true)
    if (!valid) return

    const draft: VolunteerDraft = {
      photo,
      name: name.trim(),
      age: Number.isFinite(ageNum) && ageNum > 0 ? ageNum : 20,
      phone: phone.trim(),
      phoneType,
      yeshiva,
      locality: locality.trim(),
      status,
      inactiveReason: status === 'inactive' ? inactiveReason.trim() : null,
      notes: notes.trim(),
      hasLicense,
      hasCar,
      // The dual hat needs both halves; unchecking either revokes it.
      canDrive: canDrive && hasLicense && hasCar,
      availability,
    }

    if (volunteer) updateVolunteer(volunteer.id, draft)
    else createVolunteer(draft)
    onClose()
  }

  const show = (key: keyof typeof errors) => (touched ? errors[key] : undefined)

  return (
    <Modal
      title={t(volunteer ? 'volunteers.edit' : 'volunteers.new')}
      onClose={onClose}
      wide
    >
      <div className="form-grid">
        <div className="col-span-full">
          <PhotoField
            label={t('photo.personLabel')}
            value={photo}
            onChange={setPhoto}
            name={name}
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
          label={t('form.phone')}
          value={phone}
          onChange={setPhone}
          error={show('phone')}
          type="tel"
          ltr
          required
          placeholder="050-0000000"
        />
        <SelectField<PhoneType>
          label={t('form.phoneType')}
          value={phoneType}
          onChange={setPhoneType}
          options={[
            { value: 'smartphone', label: t('phoneType.smartphone') },
            { value: 'kosher', label: t('phoneType.kosher') },
          ]}
        />
        <TextField
          label={t('form.age')}
          value={age}
          onChange={setAge}
          error={show('age')}
          type="number"
          ltr
        />
        {/* F1 — the roster's yeshivot are a suggestion, not a closed world:
            the first volunteer from a new yeshiva must not be unenterable. */}
        <SelectOrCreateField
          label={t('form.yeshiva')}
          value={yeshiva}
          onChange={setYeshiva}
          options={yeshivot}
          createLabel={t('form.addNew')}
          backLabel={t('form.chooseExisting')}
        />
        <AutocompleteField
          label={t('form.locality')}
          value={locality}
          onChange={setLocality}
          options={Object.keys(LOCALITY_POSITIONS)}
          error={show('locality')}
          required
        />
        <SelectField<VolunteerStatus>
          label={t('form.status')}
          value={status}
          onChange={setStatus}
          options={[
            { value: 'active', label: t('volunteerStatus.active') },
            { value: 'inactive', label: t('volunteerStatus.inactive') },
          ]}
        />
        {status === 'inactive' && (
          <TextField
            label={t('form.inactiveReason')}
            value={inactiveReason}
            onChange={setInactiveReason}
            error={show('inactiveReason')}
            required
          />
        )}
        {/* G5.2 — the driving block: licence, car, and — only when both are
            there to stand on — the dual hat that mirrors this volunteer into
            the drivers roster. */}
        <div className="flex flex-col gap-2 col-span-full">
          <span className="label">{t('driver.vehicle')}</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-caption text-content-secondary">
              <input
                type="checkbox"
                className="check"
                checked={hasLicense}
                onChange={(e) => setHasLicense(e.target.checked)}
              />
              {t('form.hasLicense')}
            </label>
            <label className="flex items-center gap-2 text-caption text-content-secondary">
              <input
                type="checkbox"
                className="check"
                checked={hasCar}
                onChange={(e) => setHasCar(e.target.checked)}
              />
              {t('form.hasCar')}
            </label>
            <label
              className={`flex items-center gap-2 text-caption ${
                hasLicense && hasCar
                  ? 'text-content-secondary'
                  : 'text-content-muted'
              }`}
            >
              <input
                type="checkbox"
                className="check"
                disabled={!(hasLicense && hasCar)}
                checked={canDrive && hasLicense && hasCar}
                onChange={(e) => setCanDrive(e.target.checked)}
              />
              {t('form.canDrive')}
            </label>
          </div>
          {hasLicense && hasCar && (
            <p className="muted">{t('form.canDriveHint')}</p>
          )}
        </div>

        {/* G3.4 — availability preferences; everything on = no constraint. */}
        <div className="flex flex-col gap-2 col-span-full">
          <span className="label">{t('form.availabilityLabel')}</span>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {(
              [
                ['nights', 'form.availNights'],
                ['days', 'form.availDays'],
                ['weekends', 'form.availWeekends'],
              ] as const
            ).map(([key, labelKey]) => (
              <label
                key={key}
                className="flex items-center gap-2 text-caption text-content-secondary"
              >
                <input
                  type="checkbox"
                  className="check"
                  checked={availability[key]}
                  onChange={(e) =>
                    setAvailability((prev) => ({
                      ...prev,
                      [key]: e.target.checked,
                    }))
                  }
                />
                {t(labelKey)}
              </label>
            ))}
          </div>
        </div>

        <TextArea
          label={t('form.notes')}
          value={notes}
          onChange={setNotes}
          rows={3}
          className="col-span-full"
        />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button type="button" className="btn-primary" onClick={submit}>
          {t('common.save')}
        </button>
      </div>
    </Modal>
  )
}
