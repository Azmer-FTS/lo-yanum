import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  comparableInstitutionName,
  createVolunteer,
  getDrivers,
  getInstitutions,
  isEmail,
  normalizeEmail,
  updateVolunteer,
  updateVolunteerDriving,
} from '@core/index'
import { DEFAULT_AVAILABILITY } from '@core/index'
import type {
  Institution,
  PhoneType,
  Volunteer,
  VolunteerAvailability,
  VolunteerDraft,
  VolunteerStatus,
} from '@core/index'

import { PhotoField } from '../../components/PhotoField'
import { LocalityField } from '../../components/LocalityField'
import {
  NumberField,
  SelectField,
  TextArea,
  TextField,
  isValidPhone,
} from '../../components/fields'
import { Modal } from '../../components/primitives'
import { runUndoable } from '../../components/UndoToast'
import { useCoreValue } from '../../hooks/useCore'

/** L'institution que nomme ce texte : celle déjà liée si le nom est le sien, sinon celle qui porte ce nom. */
function institutionIdFor(name: string, institutions: readonly Institution[], current: string | null): string | null {
  const wanted = comparableInstitutionName(name)
  if (!wanted) return null
  const linked = institutions.find((i) => i.id === current)
  if (linked && comparableInstitutionName(linked.name) === wanted) return linked.id
  return institutions.find((i) => comparableInstitutionName(i.name) === wanted)?.id ?? null
}

/** R5.3 — volunteer create/edit. `volunteer === null` means create. */
export function VolunteerFormModal({
  volunteer,
  yeshivot,
  onClose,
  presentation = 'page',
  initialName,
  institution,
  driver = false,
}: {
  volunteer: Volunteer | null
  /** ★★ AY4 — « נהג חדש » : un volontaire qui conduit, cases déjà cochées. */
  driver?: boolean
  /** ★★ AX10 — le nom déjà tapé dans « הוספה ». */
  initialName?: string
  /** ★★ AX10 — l'institution choisie dans « הוספה » : le volontaire lui est rattaché. */
  institution?: { id: string; name: string } | null
  yeshivot: string[]
  onClose: () => void
  /** ★ AN11 — rendu comme page du panneau (le motif unique). */
  presentation?: 'overlay' | 'page'
}) {
  const { t } = useTranslation()

  const [name, setName] = useState(volunteer?.name ?? initialName ?? '')
  /* ⚠️ AX — un âge INCONNU (0, posé par l'ajout de contacts) s'affichait « 0 »
     et le contrôle (≥ 14) refusait d'enregistrer la fiche sans qu'on y touche. */
  const [age, setAge] = useState(volunteer?.age ? String(volunteer.age) : '')
  const [phone, setPhone] = useState(volunteer?.phone ?? '')
  const [phoneType, setPhoneType] = useState<PhoneType>(
    volunteer?.phoneType ?? 'smartphone',
  )
  // P0bis.5a — optional, and validated only if filled: a blank address is a
  // fact about this person, not an omission to nag about.
  const [email, setEmail] = useState(volunteer?.email ?? '')
  const [yeshiva, setYeshiva] = useState(volunteer?.yeshiva ?? institution?.name ?? yeshivot[0] ?? '')
  const institutions = useCoreValue(getInstitutions)
  const [locality, setLocality] = useState(volunteer?.locality ?? '')
  const [status, setStatus] = useState<VolunteerStatus>(
    volunteer?.status ?? 'active',
  )
  const [inactiveReason, setInactiveReason] = useState(
    volunteer?.inactiveReason ?? '',
  )
  const [notes, setNotes] = useState(volunteer?.notes ?? '')
  // G5.2 — licence / car / dual hat.
  const [hasLicense, setHasLicense] = useState(volunteer?.hasLicense ?? driver)
  const [hasCar, setHasCar] = useState(volunteer?.hasCar ?? driver)
  const [canDrive, setCanDrive] = useState(volunteer?.canDrive ?? driver)
  /* ★★ AY4 — la voiture se saisit sur la fiche du volontaire (la ligne
     `drivers` liée la porte). */
  const car = useCoreValue(getDrivers).find((d) => volunteer && d.volunteerId === volunteer.id)
  const [vehicle, setVehicle] = useState(car?.vehicle ?? '')
  const [seats, setSeats] = useState<number>(car?.seats ?? 4)
  const [availabilityNote, setAvailabilityNote] = useState(car?.availabilityNote ?? '')
  /* ★★ AY12.5 — l'institution se CHOISIT dans la table des institutions ;
     « אחר » garde la saisie libre pour une maison pas encore fichée. */
  const initialInst = volunteer?.institutionId ?? institution?.id ?? institutionIdFor(volunteer?.yeshiva ?? '', institutions, null)
  const [instChoice, setInstChoice] = useState<string>(initialInst ?? (volunteer?.yeshiva ? '__other' : ''))
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
    email:
      email.trim() && !isEmail(email) ? t('form.invalidEmail') : undefined,
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
      /* ⚠️ AX — vide = inconnu (0), jamais un âge inventé (c'était 20). */
      age: Number.isFinite(ageNum) && ageNum > 0 ? ageNum : 0,
      phone: phone.trim(),
      phoneType,
      email: normalizeEmail(email),
      /* ★★ AY12.5 — une institution choisie dans la table : son nom ET son id. */
      yeshiva: instChoice && instChoice !== '__other' ? (institutions.find((i) => i.id === instChoice)?.name ?? yeshiva) : yeshiva,
      institutionId: instChoice && instChoice !== '__other' ? instChoice : institutionIdFor(yeshiva, institutions, null),
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

    runUndoable(t('undo.saved', { name: draft.name }), () => {
      const id = volunteer ? (updateVolunteer(volunteer.id, draft), volunteer.id) : createVolunteer(draft).id
      if (draft.canDrive) updateVolunteerDriving(id, { vehicle: vehicle.trim(), seats, availabilityNote: availabilityNote.trim() })
    })
    onClose()
  }

  const show = (key: keyof typeof errors) => (touched ? errors[key] : undefined)

  return (
    <Modal
      presentation={presentation}
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
          kind="phone"
          required
          placeholder="(050) 000-0000"
        />
        <TextField
          label={t('form.email')}
          value={email}
          onChange={setEmail}
          error={show('email')}
          kind="email"
          placeholder="name@example.co.il"
          hint={t('form.emailHint')}
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
          kind="integer"
        />
        {/* ★★ AY12.5 — LE FORMULAIRE EST RELIÉ AUX INSTITUTIONS : on choisit
            une fiche (celle qui compte ses volontaires et ses conducteurs) ;
            « אחר » garde la saisie libre (F1 : une première venue d'une
            maison pas encore fichée ne doit pas être bloquée). */}
        <SelectField<string>
          label={t('form.yeshiva')}
          value={instChoice}
          onChange={setInstChoice}
          options={[
            { value: '', label: t('volunteerForm.noInstitution') },
            ...institutions.map((i) => ({ value: i.id, label: i.name })),
            { value: '__other', label: t('volunteerForm.otherInstitution') },
          ]}
          testId="volunteer-institution"
        />
        {instChoice === '__other' && (
          <TextField label={t('volunteerForm.otherName')} value={yeshiva} onChange={setYeshiva} testId="volunteer-institution-other" />
        )}
        <LocalityField
          label={t('form.locality')}
          value={locality}
          onChange={setLocality}
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
        {canDrive && hasLicense && hasCar && (
          <>
            <TextField label={t('driver.vehicle')} value={vehicle} onChange={setVehicle} placeholder={t('volunteerForm.vehiclePlaceholder')} testId="volunteer-vehicle" />
            <NumberField label={t('driver.seats')} value={seats} onCommit={(n) => n !== null && setSeats(n)} min={1} max={9} testId="volunteer-seats" />
            <TextField label={t('driver.availabilityNote')} value={availabilityNote} onChange={setAvailabilityNote} testId="volunteer-availability-note" />
          </>
        )}

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
