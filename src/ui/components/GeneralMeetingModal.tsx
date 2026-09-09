import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useNavigate } from 'react-router-dom'

import {
  LOCALITY_POSITIONS,
  createGeneralMeeting,
  deleteGeneralMeeting,
  formatCoords,
  getGeneralMeeting,
  getVisibleFarms,
  updateGeneralMeeting,
  positionParam,
} from '@core/index'
import type { LatLng } from '@core/index'

import { AutocompleteField, Field, SelectField, TextArea, TextField } from './fields'
import { useConfirmDelete } from './ConfirmDelete'
import { Icon } from './Icon'
import { PositionLinkField } from './PositionLinkField'
import { Modal } from './primitives'
import { REMINDER_CHOICES, downloadCalendarEvent } from '../reminders'
import { useCoreValue } from '../hooks/useCore'

/**
 * G6 — the third agenda event: a general meeting. Free title, free location
 * (the gazetteer assists but never constrains — these happen in offices and
 * warehouses, not only in towns), a person or organisation, and a note.
 * Same modal-over-the-calendar pattern as FarmVisitModal, for the same
 * reasons.
 */
export function GeneralMeetingModal({
  meetingId,
  defaultAt,
  onClose,
}: {
  /** Editing an existing meeting; omit to create. */
  meetingId?: string
  /** ISO datetime the new meeting starts at. */
  defaultAt?: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  // PO POINT 8 — every deletion in this app now asks first. Before this,
  // each of these buttons deleted on the FIRST TAP.
  const del = useConfirmDelete()
  const existing = useCoreValue(() =>
    meetingId ? getGeneralMeeting(meetingId) : null,
  )

  const toLocalInput = (isoValue: string): string => {
    const d = new Date(isoValue)
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
    return local.toISOString().slice(0, 16)
  }
  const fromLocalInput = (value: string): string =>
    new Date(value).toISOString()

  const [title, setTitle] = useState(existing?.title ?? '')
  const [at, setAt] = useState(
    toLocalInput(existing?.at ?? defaultAt ?? new Date().toISOString()),
  )
  const [endTime, setEndTime] = useState(
    existing ? toLocalInput(existing.endAt).slice(11, 16) : '',
  )
  const [location, setLocation] = useState(existing?.location ?? '')
  const [person, setPerson] = useState(existing?.person ?? '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [touched, setTouched] = useState(false)
  /* ★ AF3.1 — le point collé depuis un lien, gardé tel quel. */
  const [position, setPosition] = useState<LatLng | null>(existing?.position ?? null)
  /* ★ AF4.2 — l'alerte, en minutes avant. `-1` dans le sélecteur = aucune. */
  const [remind, setRemind] = useState<number>(existing?.remindMinutes ?? -1)
  const navigate = useNavigate()
  const farms = useCoreValue(getVisibleFarms)
  const placeOptions = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const name of [
      ...farms.map((f) => f.farmName || f.name),
      ...farms.map((f) => f.locality),
      ...Object.keys(LOCALITY_POSITIONS),
    ]) {
      const value = (name ?? '').trim()
      if (value === '' || seen.has(value)) continue
      seen.add(value)
      out.push(value)
    }
    return out
  }, [farms])

  const titleError = !title.trim() ? t('form.required') : undefined
  const valid = !titleError && at !== ''

  const submit = () => {
    setTouched(true)
    if (!valid) return
    const startIso = fromLocalInput(at)
    // End = same day at the given time; empty means one hour.
    const endIso = endTime
      ? fromLocalInput(`${at.slice(0, 11)}${endTime}`)
      : new Date(new Date(startIso).getTime() + 60 * 60_000).toISOString()
    const draft = {
      title: title.trim(),
      at: startIso,
      endAt: endIso,
      location: location.trim(),
      person: person.trim(),
      note: note.trim(),
      /* ⚠️ LE POINT COLLÉ NE SE REPLIE PAS SUR LE CENTROÏDE DE LA LOCALITÉ.
         C'est AB3.4 : `null` est une vraie réponse, et une épingle numérotée
         posée sur un יישוב parce que la réunion s'y tient « quelque part » se
         lit comme un fait. L'agenda résout déjà `location` par le gazetteer
         pour dessiner ; ce champ-ci ne porte QUE ce qu'on lui a donné. */
      position,
      remindMinutes: remind < 0 ? null : remind,
    }
    if (existing) updateGeneralMeeting(existing.id, draft)
    else createGeneralMeeting(draft)
    onClose()
  }

  return (
    <Modal
      title={t(existing ? 'meeting.edit' : 'meeting.new')}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        <TextField
          label={t('meeting.titleField')}
          value={title}
          onChange={setTitle}
          error={touched ? titleError : undefined}
          required
        />
        <div className="form-grid">
          <Field label={t('meeting.startField')} required>
            <input
              type="datetime-local"
              className="input ltr-nums"
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
          <Field label={t('meeting.endField')}>
            <input
              type="time"
              className="input ltr-nums"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </Field>
        </div>
        {/* ★★ AF3.4 (2026-09-09) — LES 1 174 LOCALITÉS DU PAYS **ET** LES
            LIEUX DU PROGRAMME. Le gazetteer national est là depuis N4 ; ce qui
            manquait à cette liste, ce sont les endroits où le PO se rend
            vraiment — « פגישה בחוות רתם » n'est pas un יישוב et ne le sera
            jamais. Les fiches d'abord, parce qu'elles sont plus probables que
            n'importe quelle ville, et l'autocomplétion range de toute façon
            par préfixe. */}
        <AutocompleteField
          label={t('meeting.locationField')}
          value={location}
          onChange={setLocation}
          options={placeOptions}
        />

        {/* ★★ AF3.1 — LE LIEN REÇU PAR WHATSAPP, ET C'EST LA MOITIÉ QUI
            MANQUAIT. `location` est du texte résolu par le gazetteer : parfait
            pour « בית שאן », impuissant pour une parcelle au bout d'un chemin,
            qui est exactement le cas du brief. Le point collé est gardé TEL
            QUEL et c'est lui que l'agenda dessine. */}
        <PositionLinkField onResolve={setPosition} />
        <p className="muted -mt-2" data-testid="meeting-position">
          {position ? (
            <span className="flex flex-wrap items-center gap-2">
              <Icon name="pin" size={13} />
              <span className="ltr-nums" dir="ltr">
                {formatCoords(position)}
              </span>
              <button
                type="button"
                className="btn-ghost py-1"
                data-testid="meeting-position-clear"
                onClick={() => setPosition(null)}
              >
                {t('common.remove')}
              </button>
            </span>
          ) : (
            t('meeting.positionNone')
          )}
        </p>

        {/* ★★ AF4.2 — L'ALERTE, ET CE QU'ELLE DÉCLENCHE VRAIMENT. Deux voies,
            et la seconde est celle qui réveille un iPad dont l'app est
            fermée : voir `ui/reminders.ts`, qui dit aussi ce qu'une PWA ne
            peut pas faire. */}
        <div className="form-grid">
          <SelectField<string>
            label={t('meeting.remindField')}
            value={String(remind)}
            onChange={(v) => setRemind(Number(v))}
            options={REMINDER_CHOICES.map((m) => ({
              value: String(m),
              label: m < 0 ? t('meeting.remindNone') : t(`reminder.m${m}`),
            }))}
          />
          <Field label=" ">
            <button
              type="button"
              className="btn-secondary"
              data-testid="meeting-calendar"
              onClick={() =>
                downloadCalendarEvent({
                  uid: existing?.id ?? `meet-${Date.parse(fromLocalInput(at))}`,
                  title: title.trim() || t('meeting.new'),
                  at: fromLocalInput(at),
                  endAt: endTime
                    ? fromLocalInput(`${at.slice(0, 11)}${endTime}`)
                    : new Date(Date.parse(fromLocalInput(at)) + 3_600_000).toISOString(),
                  location: location.trim(),
                  note: note.trim(),
                  position,
                  remindMinutes: remind < 0 ? null : remind,
                })
              }
            >
              <Icon name="calendar" size={15} />
              {t('meeting.remindCalendar')}
            </button>
          </Field>
        </div>

        {/* ★★ AF3.3 — « UN LIEU AINSI POSÉ PEUT ÊTRE CONVERTI EN FICHE FERME
            EN UN GESTE ». Le geste est ce bouton : il ouvre le formulaire de
            création avec le point, le nom et la localité déjà dedans. Il
            n'enregistre rien — שמור décide, comme partout. */}
        {position && (
          <button
            type="button"
            className="btn-secondary self-start"
            data-testid="meeting-make-farm"
            onClick={() => {
              const query = new URLSearchParams({
                /* ★ AH9 — `positionParam`, JAMAIS l'interpolation nue : voir
                   `core/geo.ts`. Un point rond perdait ses décimales et le
                   formulaire s'ouvrait sans épingle. */
                at: positionParam(position),
                name: title.trim(),
                locality: location.trim(),
              })
              onClose()
              navigate(`/coordinator/farms/new?${query.toString()}`)
            }}
          >
            <Icon name="home" size={15} />
            {t('meeting.makeFarm')}
          </button>
        )}
        <TextField
          label={t('meeting.personField')}
          value={person}
          onChange={setPerson}
        />
        <TextArea
          label={t('common.notes')}
          value={note}
          onChange={setNote}
          rows={3}
        />
      </div>

      <div className="mt-5 flex items-center gap-2">
        {existing && (
          <button
            type="button"
            className="btn-ghost text-status-danger-ink hover:bg-status-danger/10"
            data-testid="meeting-delete"
            onClick={() =>
              del.ask(
                'generalMeeting',
                existing.id,
                () => {
                  deleteGeneralMeeting(existing.id)
                  return true
                },
                { after: onClose },
              )
            }
          >
            <Icon name="trash" size={15} />
            {t('meeting.delete')}
          </button>
        )}
        <div className="ms-auto flex gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn-primary"
            data-testid="meeting-save"
            onClick={submit}
          >
            {t('common.save')}
          </button>
        </div>
      </div>
      {del.dialog}
    </Modal>
  )
}
