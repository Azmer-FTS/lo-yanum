import { useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

import { atTimeOn, getAllLeads, getDrivers, getFarmVisit, getGeneralMeeting, getInstitutions, getVolunteers, moveLead, now } from '@core/index'
import { useTranslation } from 'react-i18next'

import { FarmVisitModal } from '../../components/FarmVisitModal'
import { GeneralMeetingModal } from '../../components/GeneralMeetingModal'
import { FormWaiting } from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'
import { useHydrated } from '../../hooks/useDataState'
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

/**
 * Retour là d'où l'on vient ; à défaut (adresse ouverte directement), la liste.
 * ⚠️ Une page ouverte PAR REMPLACEMENT (l'agenda qui lit `?new=meeting`) n'a pas
 * « d'où l'on vient » dans l'historique : revenir en arrière sautait l'agenda et
 * posait le PO sur le tableau de bord (vu par afui AF4.3). L'écran qui remplace
 * dit donc où revenir (`state.returnTo`).
 */
function useBack(fallback: string): () => void {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo
  return () => {
    if (returnTo) navigate(returnTo, { replace: true })
    else if (location.key !== 'default') navigate(-1)
    else navigate(fallback, { replace: true })
  }
}

export function VolunteerFormPage() {
  const { volunteerId } = useParams()
  const back = useBack('/coordinator/volunteers')
  const volunteers = useCoreValue(getVolunteers)
  const yeshivot = useMemo(() => [...new Set(volunteers.map((v) => v.yeshiva))].sort(), [volunteers])
  const volunteer = volunteerId ? (volunteers.find((v) => v.id === volunteerId) ?? null) : null
  /* ★★ AX10 — arrivé de « הוספה » : le nom et l'institution déjà dits. */
  const [params] = useSearchParams()
  const institutions = useCoreValue(getInstitutions)
  const institution = institutions.find((i) => i.id === params.get('institution')) ?? null
  /* ★★ BD 8a — avant l'arrivée des données, une fiche absente n'est pas « supprimée ». */
  const hydrated = useHydrated()
  if (volunteerId && !volunteer) return hydrated ? <Navigate to="/coordinator/volunteers" replace /> : <FormWaiting />
  return (
    <VolunteerFormModal
      volunteer={volunteer}
      yeshivot={yeshivot}
      onClose={back}
      presentation="page"
      initialName={params.get('name') ?? undefined}
      institution={institution}
      driver={params.get('driver') === '1'}
    />
  )
}

export function DriverFormPage() {
  const { driverId } = useParams()
  const back = useBack('/coordinator/drivers')
  const drivers = useCoreValue(getDrivers)
  const driver = driverId ? (drivers.find((d) => d.id === driverId) ?? null) : null
  const [params] = useSearchParams()
  const hydrated = useHydrated()
  if (driverId && !driver) return hydrated ? <Navigate to="/coordinator/drivers" replace /> : <FormWaiting />
  return <DriverFormModal driver={driver} onClose={back} presentation="page" initialName={params.get('name') ?? undefined} />
}

export function VisitFormPage() {
  const { visitId } = useParams()
  const [params] = useSearchParams()
  const back = useBack('/coordinator/agenda')
  /* ★★ BD 8a — le formulaire naît de la fiche au montage : il attend qu'elle soit là. */
  const existing = useCoreValue(() => (visitId ? getFarmVisit(visitId) : null))
  const hydrated = useHydrated()
  if (visitId && !existing) return hydrated ? <Navigate to="/coordinator/agenda" replace /> : <FormWaiting />
  return (
    <FarmVisitModal
      key={visitId ?? 'new'}
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
  const { t } = useTranslation()
  const back = useBack('/coordinator/agenda')
  /* ★★ AS6.6 — `?lead=` : le rendez-vous naît d'une piste. Ses champs sont
     pré-remplis, le lien est gardé, et la piste passe à « קבעתי פגישה ». */
  const leadId = params.get('lead')
  const lead = useCoreValue(() => (leadId ? (getAllLeads().find((l) => l.id === leadId) ?? null) : null))
  const existing = useCoreValue(() => (meetingId ? getGeneralMeeting(meetingId) : null))
  const hydrated = useHydrated()
  if (meetingId && !existing) return hydrated ? <Navigate to="/coordinator/agenda" replace /> : <FormWaiting />
  if (leadId && !lead && !hydrated) return <FormWaiting />
  return (
    <GeneralMeetingModal
      key={meetingId ?? 'new'}
      meetingId={meetingId}
      defaultAt={params.get('at') ?? atTimeOn(now(), 10, 0)}
      onClose={back}
      presentation="page"
      prefill={
        lead
          ? {
              title: t('leads.meetingTitle', { name: lead.name }),
              person: [lead.contactName, lead.phone].filter(Boolean).join(' · '),
              location: lead.place,
              position: lead.position,
              note: lead.notes,
              leadId: lead.id,
            }
          : undefined
      }
      onCreated={lead ? () => moveLead(lead.id, { status: 'meeting_set' }) : undefined}
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
  newMeeting: (opts: { at?: string; lead?: string } = {}) => {
    const q = new URLSearchParams()
    if (opts.at) q.set('at', opts.at)
    if (opts.lead) q.set('lead', opts.lead)
    const s = q.toString()
    return `/coordinator/agenda/meeting/new${s ? `?${s}` : ''}`
  },
  editMeeting: (id: string) => `/coordinator/agenda/meeting/${id}`,
}
