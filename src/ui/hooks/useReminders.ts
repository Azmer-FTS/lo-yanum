import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { getVisibleFarms, getVisibleFarmVisits, getVisibleGeneralMeetings } from '@core/index'

import { useCoreValue } from './useCore'
import { scheduleOpenAppReminders } from '../reminders'
import type { DueReminder } from '../reminders'

/**
 * ★★ AF4.2 (2026-09-09) — LES MINUTERIES, POSÉES UNE FOIS, À LA RACINE.
 *
 * Monté dans `App` et nulle part ailleurs : un planificateur par écran
 * poserait la même alarme cinq fois et la ferait sonner cinq fois. C'est la
 * règle de PO POINT 3 pour l'indicateur de réseau, appliquée à autre chose.
 *
 * ⚠️ ET IL SE REPOSE ENTIÈREMENT À CHAQUE MUTATION DU MAGASIN. Annuler puis
 *    reposer toutes les minuteries est beaucoup plus sûr que de tenir un
 *    différentiel : un rendez-vous déplacé au doigt sur la grille (AF4.1)
 *    change son heure, et une alarme survivante sonnerait pour un horaire qui
 *    n'existe plus.
 *
 * ⚠️ CE QU'IL NE FAIT PAS EST ÉCRIT DANS `ui/reminders.ts` : il ne réveille
 *    pas un appareil dont l'app est fermée. C'est le fichier .ics qui fait ça,
 *    et c'est pour cela que les deux formulaires de rendez-vous offrent les
 *    deux.
 */
export function useReminderScheduler(): void {
  const { t } = useTranslation()
  const visits = useCoreValue(getVisibleFarmVisits)
  const meetings = useCoreValue(getVisibleGeneralMeetings)
  const farms = useCoreValue(getVisibleFarms)

  useEffect(() => {
    const due: DueReminder[] = []

    for (const visit of visits) {
      if (visit.done || visit.remindMinutes == null || visit.remindMinutes < 0) continue
      const at = new Date(visit.at).getTime()
      if (!Number.isFinite(at)) continue
      const farm = farms.find((f) => f.id === visit.farmId)
      due.push({
        id: `visit:${visit.id}`,
        title: t('agenda.planVisit'),
        body: [farm?.name, farm?.locality, visit.note].filter(Boolean).join(' · '),
        fireAt: at - visit.remindMinutes * 60_000,
      })
    }

    for (const meeting of meetings) {
      if (meeting.remindMinutes == null || meeting.remindMinutes < 0) continue
      const at = new Date(meeting.at).getTime()
      if (!Number.isFinite(at)) continue
      due.push({
        id: `meeting:${meeting.id}`,
        title: meeting.title,
        body: [meeting.location, meeting.person].filter(Boolean).join(' · '),
        fireAt: at - meeting.remindMinutes * 60_000,
      })
    }

    return scheduleOpenAppReminders(due)
  }, [visits, meetings, farms, t])
}
