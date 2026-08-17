import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LOCALITY_POSITIONS, createDriver, updateDriver } from '@core/index'
import type { Driver, DriverDraft } from '@core/index'

import { PhotoField } from '../../components/PhotoField'
import {
  AutocompleteField,
  TextArea,
  TextField,
  isValidPhone,
} from '../../components/fields'
import { Modal } from '../../components/primitives'

/** G5.1 — driver create/edit. `driver === null` means create. */
export function DriverFormModal({
  driver,
  onClose,
}: {
  driver: Driver | null
  onClose: () => void
}) {
  const { t } = useTranslation()

  const [name, setName] = useState(driver?.name ?? '')
  const [phone, setPhone] = useState(driver?.phone ?? '')
  const [locality, setLocality] = useState(driver?.locality ?? '')
  const [vehicle, setVehicle] = useState(driver?.vehicle ?? '')
  const [seats, setSeats] = useState(String(driver?.seats ?? 4))
  const [availabilityNote, setAvailabilityNote] = useState(
    driver?.availabilityNote ?? '',
  )
  const [notes, setNotes] = useState(driver?.notes ?? '')
  const [photo, setPhoto] = useState<string | null>(driver?.photo ?? null)
  const [touched, setTouched] = useState(false)

  const seatsNum = Number(seats)
  const errors = {
    name: !name.trim() ? t('form.required') : undefined,
    phone: !phone.trim()
      ? t('form.required')
      : !isValidPhone(phone)
        ? t('form.invalidPhone')
        : undefined,
    locality: !locality.trim() ? t('form.required') : undefined,
    seats:
      !Number.isFinite(seatsNum) || seatsNum < 1 || seatsNum > 60
        ? t('form.invalidNumber')
        : undefined,
  }
  const valid = Object.values(errors).every((e) => e === undefined)
  const show = (key: keyof typeof errors) => (touched ? errors[key] : undefined)

  const submit = () => {
    setTouched(true)
    if (!valid) return

    const draft: DriverDraft = {
      photo,
      name: name.trim(),
      phone: phone.trim(),
      locality: locality.trim(),
      vehicle: vehicle.trim(),
      seats: seatsNum,
      availabilityNote: availabilityNote.trim(),
      notes: notes.trim(),
    }

    if (driver) updateDriver(driver.id, draft)
    else createDriver(draft)
    onClose()
  }

  return (
    <Modal
      title={t(driver ? 'driver.editDriver' : 'driver.addDriver')}
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
        />
        <AutocompleteField
          label={t('form.locality')}
          value={locality}
          onChange={setLocality}
          options={Object.keys(LOCALITY_POSITIONS)}
          error={show('locality')}
          required
        />
        <TextField
          label={t('driver.vehicle')}
          value={vehicle}
          onChange={setVehicle}
          placeholder={t('driver.privateCar')}
        />
        <TextField
          label={t('driver.seats')}
          value={seats}
          onChange={setSeats}
          error={show('seats')}
          type="number"
          ltr
          required
        />
        <TextField
          label={t('driver.availabilityNote')}
          value={availabilityNote}
          onChange={setAvailabilityNote}
        />
        <TextArea
          label={t('common.notes')}
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
