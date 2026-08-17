import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LOCALITY_POSITIONS, createVolunteer, updateVolunteer } from '@core/index'
import type { PhoneType, Volunteer, VolunteerDraft, VolunteerStatus } from '@core/index'

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
      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
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
        <TextArea
          label={t('form.notes')}
          value={notes}
          onChange={setNotes}
          rows={3}
          className="md:col-span-2"
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
