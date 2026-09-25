import { useEffect, useState } from 'react'

import {
  APPOINTMENT_HORIZON_DAYS,
  freeSlots,
  slotsByDay,
} from '@core/availability'
import type { Slot } from '@core/availability'

import { loadBusy } from './api'
import { T, hebrewDayLabel } from './text'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP3.6 (2026-09-25) — LE RENDEZ-VOUS, BRANCHÉ SUR L'AGENDA RÉEL DU PO.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ LES RÈGLES SONT DANS `core/availability.ts`, EN CONSTANTES NOMMÉES, et ce
 *   fichier-ci ne fait que les afficher. C'est ce qui permet de les PROUVER
 *   (A258) sans ouvrir un navigateur.
 *
 * ⚠️ UN ÉCHEC DE CHARGEMENT NE BLOQUE PAS, ET C'EST LA RÈGLE DE TOUTE LA PAGE.
 *    « Un écran de trop est un abandon » : si l'agenda ne répond pas, la page
 *    le DIT et laisse passer. Une demande sans rendez-vous vaut mieux que pas
 *    de demande — exactement comme pour les documents.
 *
 * ⚠️ ET LE CRÉNEAU CHOISI EST REVÉRIFIÉ EN BASE AU MOMENT DE L'ÉCRITURE.
 *    Entre l'instant où cette liste s'affiche et celui où l'agriculteur touche
 *    « שליחה », le PO a pu poser autre chose : `submit_aid_request` refuse
 *    alors, et le refus revient ici sous le mot `appointmentTaken`.
 */
export function AppointmentStep({
  chosen,
  onChoose,
}: {
  chosen: string | null
  onChoose: (slot: Slot | null) => void
}) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [days, setDays] = useState<{ dayKey: string; slots: Slot[] }[]>([])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const busy = await loadBusy(new Date(), APPOINTMENT_HORIZON_DAYS)
        if (!alive) return
        setDays(slotsByDay(freeSlots(busy, new Date())))
        setState('ready')
      } catch {
        if (!alive) return
        /* ⚠️ ET ON PROPOSE QUAND MÊME DES CRÉNEAUX ? NON. Sans l'agenda, tout
           créneau proposé peut être déjà pris : ce serait un rendez-vous
           annoncé à quelqu'un qui n'y sera pas. On le dit et on passe. */
        setState('failed')
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (state === 'loading') {
    return (
      <p className="az-hint" data-testid="slots-loading">
        {T.slotsLoading}
      </p>
    )
  }
  if (state === 'failed') {
    return (
      <p className="az-notice az-notice-soft" data-testid="slots-failed">
        {T.slotsOffline}
      </p>
    )
  }
  if (days.length === 0) {
    return (
      <p className="az-notice az-notice-soft" data-testid="slots-none">
        {T.slotsNone}
      </p>
    )
  }

  return (
    <div data-testid="slots" data-days={days.length}>
      {days.map((day) => (
        <section className="az-day" key={day.dayKey} data-day={day.dayKey}>
          <h3 className="az-day-name">{hebrewDayLabel(day.dayKey)}</h3>
          <div className="az-slots">
            {day.slots.map((slot) => {
              const active = chosen === slot.startAt
              return (
                <button
                  key={slot.startAt}
                  type="button"
                  className="az-slot"
                  aria-pressed={active}
                  data-testid="slot"
                  data-start={slot.startAt}
                  onClick={() => onChoose(active ? null : slot)}
                >
                  {slot.label}
                </button>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
