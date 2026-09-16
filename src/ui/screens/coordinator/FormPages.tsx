import { useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { atTimeOn, getDrivers, getVolunteers, now } from '@core/index'

import { FarmVisitModal } from '../../components/FarmVisitModal'
import { GeneralMeetingModal } from '../../components/GeneralMeetingModal'
import { useCoreValue } from '../../hooks/useCore'
import { DriverFormModal } from './DriverFormModal'
import { VolunteerFormModal } from './VolunteerFormModal'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AN11 (2026-09-17) — UNE SEULE LOGIQUE D'OUVERTURE : LA PAGE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Une nouvelle ferme s'ouvre dans le panneau de droite, un nouveau volontaire
 * en fenêtre. Je ne m'y retrouve pas. » Ferme, moshav et garde étaient des
 * PAGES (une adresse, une flèche retour, le formulaire dans le panneau) ;
 * volontaire, conducteur, rendez-vous et événement étaient des FENÊTRES posées
 * sur un voile.
 *
 * ★ LE MOTIF RETENU EST LA PAGE, parce que c'est le seul qui accueille la
 *   carte dont la ferme et le moshav ont besoin pour poser leur épingle, et
 *   parce qu'une page a une adresse : le geste « retour » de l'iPad la ferme,
 *   un rechargement la rouvre au même endroit.
 *
 * Les quatre formulaires gardent leur contenu ; ils sont rendus ici en page
 * (`Modal presentation="page"`) et TOUS leurs points d'entrée — le « + », les
 * listes, l'agenda, la fiche, le planificateur — naviguent vers ces adresses.
 * Les fenêtres qui restent sont des CONFIRMATIONS et des LECTURES (supprimer,
 * archiver, signer, lire un document) : ce ne sont ni des créations ni des
 * éditions.
 */

/** Retour là d'où l'on vient ; à défaut (adresse ouverte directement), la liste. */
function useBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  return () => {
    if (location.key !== 'default') navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

export function VolunteerFormPage() {
  const { volunteerId } = useParams()
  const back = useBack('/coordinator/volunteers')
  const volunteers = useCoreValue(getVolunteers)
  const yeshivot = useMemo(() => [...new Set(volunteers.map((v) => v.yeshiva))].sort(), [volunteers])
  const volunteer = volunteerId ? (volunteers.find((v) => v.id === volunteerId) ?? null) : null
  if (volunteerId && !volunteer) return <Navigate to="/coordinator/volunteers" replace />
  return <VolunteerFormModal volunteer={volunteer} yeshivot={yeshivot} onClose={back} presentation="page" />
}

export function DriverFormPage() {
  const { driverId } = useParams()
  const back = useBack('/coordinator/drivers')
  const drivers = useCoreValue(getDrivers)
  const driver = driverId ? (drivers.find((d) => d.id === driverId) ?? null) : null
  if (driverId && !driver) return <Navigate to="/coordinator/drivers" replace />
  return <DriverFormModal driver={driver} onClose={back} presentation="page" />
}

export function VisitFormPage() {
  const { visitId } = useParams()
  const [params] = useSearchParams()
  const back = useBack('/coordinator/agenda')
  return (
    <FarmVisitModal
      visitId={visitId}
      defaultFarmId={params.get('farm') ?? undefined}
      defaultAt={params.get('at') ?? atTimeOn(now(), 10, 0)}
      onClose={back}
      presentation="page"
    />
  )
}

export function MeetingFormPage() {
  const { meetingId } = useParams()
  const [params] = useSearchParams()
  const back = useBack('/coordinator/agenda')
  return (
    <GeneralMeetingModal
      meetingId={meetingId}
      defaultAt={params.get('at') ?? atTimeOn(now(), 10, 0)}
      onClose={back}
      presentation="page"
    />
  )
}

/** Les adresses, en un endroit : tous les points d'entrée passent par ici. */
export const formRoutes = {
  newVolunteer: () => '/coordinator/volunteers/new',
  editVolunteer: (id: string) => `/coordinator/volunteers/${id}/edit`,
  newDriver: () => '/coordinator/drivers/new',
  editDriver: (id: string) => `/coordinator/drivers/${id}/edit`,
  newVisit: (opts: { at?: string; farm?: string } = {}) => {
    const q = new URLSearchParams()
    if (opts.at) q.set('at', opts.at)
    if (opts.farm) q.set('farm', opts.farm)
    const s = q.toString()
    return `/coordinator/agenda/visit/new${s ? `?${s}` : ''}`
  },
  editVisit: (id: string) => `/coordinator/agenda/visit/${id}`,
  newMeeting: (opts: { at?: string } = {}) =>
    `/coordinator/agenda/meeting/new${opts.at ? `?at=${encodeURIComponent(opts.at)}` : ''}`,
  editMeeting: (id: string) => `/coordinator/agenda/meeting/${id}`,
}
