import type { ReactNode } from 'react'
import { Suspense, lazy, useEffect, useReducer } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { getSession, homeRouteFor } from '@core/index'
import type { Role } from '@core/index'

import { SUPABASE_CONFIGURED } from '../data/config'

import {
  CoordinatorLayout,
  DRIVER_NAV,
  FARMER_NAV,
  FieldLayout,
  VOLUNTEER_NAV,
} from './components/layouts'
import { DataBanner } from './components/DataBanner'
import { NetworkStatus } from './components/NetworkStatus'
import { useTruncationTitles } from './hooks/useTruncationTitles'
import { useReminderScheduler } from './hooks/useReminders'
import { useAuth } from './hooks/useAuth'
import { useCoreValue } from './hooks/useCore'
import { EMERGENCY_ROUTE } from './components/EmergencyButton'
import { readGuardPass } from './guardPass'
import { EmergencyScreen } from './screens/EmergencyScreen'
import { GuardLinkScreen } from './screens/GuardLinkScreen'
import { LandingScreen } from './screens/LandingScreen'
import { AuthSplash, LoginScreen } from './screens/LoginScreen'
import { StyleguideScreen } from './screens/StyleguideScreen'
import { DriverTripScreen } from './screens/driver/DriverTripScreen'
import { DriversScreen } from './screens/coordinator/DriversScreen'
import { FarmerGuardsScreen } from './screens/farmer/FarmerGuardsScreen'
import { FarmerReportScreen } from './screens/farmer/FarmerReportScreen'
import { FarmerTonightScreen } from './screens/farmer/FarmerTonightScreen'
import { AgendaScreen } from './screens/coordinator/AgendaScreen'
import { AnchorFormScreen } from './screens/coordinator/AnchorFormScreen'
import { AnchorSheetScreen } from './screens/coordinator/AnchorSheetScreen'
import { DashboardScreen } from './screens/coordinator/DashboardScreen'
import { FarmDetailScreen } from './screens/coordinator/FarmDetailScreen'
import { FarmFormScreen } from './screens/coordinator/FarmFormScreen'
import { ExportScreen } from './screens/coordinator/ExportScreen'
import { FarmsListScreen } from './screens/coordinator/FarmsListScreen'
import { IncidentDetailScreen } from './screens/coordinator/IncidentDetailScreen'
import { IncidentsScreen } from './screens/coordinator/IncidentsScreen'
import { MissionDetailScreen } from './screens/coordinator/MissionDetailScreen'
import { MissionWizardScreen } from './screens/coordinator/MissionWizardScreen'
import { MissionsScreen } from './screens/coordinator/MissionsScreen'
import { RoutePlannerScreen } from './screens/coordinator/RoutePlannerScreen'
import { RegionsEditScreen } from './screens/coordinator/RegionsEditScreen'
import { SettingsScreen } from './screens/coordinator/SettingsScreen'
import { VolunteersScreen } from './screens/coordinator/VolunteersScreen'
import { VolunteerGuardScreen } from './screens/volunteer/VolunteerGuardScreen'
import { VolunteerRosterScreen } from './screens/volunteer/VolunteerRosterScreen'
import { VolunteerReportScreen } from './screens/volunteer/VolunteerReportScreen'

/** Coordinator-only and rarely opened — keep it out of the initial bundle. */
const ImportWizardScreen = lazy(() =>
  import('./screens/coordinator/ImportWizardScreen').then((m) => ({
    default: m.ImportWizardScreen,
  })),
)

/** AA4 · AA5 — the same reasoning, and it also pulls SheetJS on demand. */
const SheetImportScreen = lazy(() =>
  import('./screens/coordinator/SheetImportScreen').then((m) => ({
    default: m.SheetImportScreen,
  })),
)

/**
 * Navigation-level half of the role gate. The data-level half — the half that
 * actually matters — lives in @core/access; this only stops a role from
 * *landing* on a screen built for another role (e.g. a stale bookmark after
 * switching identity in the dev toolbar).
 */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const session = useCoreValue(getSession)
  if (session.role !== role) {
    return <Navigate to={homeRouteFor(session.role)} replace />
  }
  return <>{children}</>
}

/**
 * P2.3 — THE GATE, AND IT IS OUTSIDE THE ROUTER ON PURPOSE.
 *
 * In a build pointed at Supabase, an unauthenticated visitor does not get a
 * router at all: no route exists to be typed, bookmarked or deep-linked into,
 * so there is no list of exceptions to keep correct as screens are added. The
 * navigation-level role gate below and the data-level gate in `@core/access`
 * are unchanged; this is a third, coarser ring outside both.
 *
 * In a build WITHOUT the two environment variables — demo mode, which is what
 * the frozen /poc is and what every verification script drives — `status` is
 * `disabled` and this function returns the app exactly as P0bis left it.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE1 · AE2 (2026-09-08) — LES DEUX CHOSES QUI PASSENT DEVANT LA PORTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ★ AE1 — UN VOLONTAIRE N'A PAS DE COMPTE. « Aucun volontaire ne crée de
 *   compte. Aucun mot de passe. » La porte P2.3 est une bonne porte pour un
 *   coordinateur ; pour le porteur d'un lien de garde, c'est un formulaire
 *   qu'il ne peut pas remplir, donc une app qui ne s'ouvre pas. Deux états la
 *   contournent, et deux seulement : l'URL EST un lien de garde, ou l'appareil
 *   PORTE un laissez-passer non périmé (`ui/guardPass.ts`, qui refuse de
 *   rendre un jeton dont la date est passée et l'efface au passage).
 *
 * ★ AE2 — ET L'ÉCRAN D'URGENCE AUSSI, POUR QUELQU'UN QUI N'A NI L'UN NI
 *   L'AUTRE. C'est AE1.5 vu de l'autre côté : les numéros restent
 *   atteignables. Un écran qui ne porte que des numéros publics et le numéro
 *   du coordinateur ne divulgue rien qu'une porte devrait garder, et le refuser
 *   à quelqu'un dont le lien vient d'expirer est précisément le défaut que
 *   cette passe existe pour supprimer.
 *
 * ⚠️ LU SUR LE HASH ET NON SUR UN ÉTAT DU ROUTEUR, parce qu'il n'y a pas
 *    encore de routeur : cette décision se prend AVANT `<HashRouter>`.
 */
function passesTheDoor(): boolean {
  const hash = typeof window === 'undefined' ? '' : window.location.hash
  if (hash.startsWith('#/g/')) return true
  if (hash === `#${EMERGENCY_ROUTE}` || hash.startsWith(`#${EMERGENCY_ROUTE}?`)) return true
  return readGuardPass() !== null
}

/**
 * ⚠️★★ ET IL FAUT ÉCOUTER `hashchange`, CE QUI N'EST PAS UNE PRÉCAUTION MAIS UN
 *    DÉFAUT MESURÉ SUR L'URL RÉELLE DÉPLOYÉE.
 *
 *    Depuis une URL FROIDE, `…/#/sos` ouvre l'écran d'urgence sans mot de passe
 *    — vérifié sur https://azmer-fts.github.io/lo-yanum/. Mais depuis l'écran
 *    de connexion, coller `#/sos` dans la barre d'adresse ne faisait RIEN :
 *    `passesTheDoor` n'est lu que pendant un rendu, et devant la porte il n'y a
 *    pas de routeur — donc personne n'écoutait le changement de hash, et rien
 *    ne provoquait ce rendu. La page restait sur son formulaire.
 *
 *    C'est exactement la situation d'AE1.5 vue de l'autre côté : quelqu'un dont
 *    le lien vient d'expirer atterrit sur la porte, et les numéros doivent
 *    rester atteignables sans qu'il ait à savoir qu'il faut recharger. Trois
 *    lignes, et la promesse devient vraie depuis TOUS les points d'entrée et
 *    non seulement depuis le bon.
 */
function useHashDoor(): void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    window.addEventListener('hashchange', bump)
    return () => window.removeEventListener('hashchange', bump)
  }, [])
}

export default function App() {
  const auth = useAuth()
  // U7 — every truncated text carries its full value as a title, app-wide.
  useTruncationTitles()
  // AE1.5 · AE2 — voir `useHashDoor` : la porte doit se relire quand l'URL
  // change, y compris quand aucun routeur n'est monté pour l'entendre.
  useHashDoor()
  // AF4.2 — les alarmes des rendez-vous, posées UNE fois pour toute l'app.
  useReminderScheduler()

  if (auth.status === 'loading') return <AuthSplash />
  if (auth.status === 'signed-out' && !passesTheDoor()) return <LoginScreen />

  return (
    <HashRouter>
      {/* Outside <Routes>, so a data-layer failure is visible on whichever
          screen the coordinator happens to be on rather than on one of them. */}
      <DataBanner />
      {/* PO POINT 3 — mounted ONCE, at the root, above every shell. "On every
          screen" has to mean every screen, including the ones nobody
          remembered when a new layout was added. */}
      <NetworkStatus />
      <Routes>
        {/* The identity picker is a DEMO artefact: it hands out farmer,
            volunteer and driver sessions on mock people. A real signed-in
            coordinator has exactly one identity, so the front door opens
            straight onto his control room. */}
        <Route
          path="/"
          element={
            SUPABASE_CONFIGURED ? (
              <Navigate to="/coordinator" replace />
            ) : (
              <LandingScreen />
            )
          }
        />

        {/* ★★ AE1 — LE LIEN DE GARDE. Hors de toute coquille et hors de toute
            garde de rôle : c'est lui qui POSE le rôle. */}
        <Route path="/g/:token" element={<GuardLinkScreen />} />

        {/* ★★ AE2 — L'ÉCRAN D'URGENCE, UNE SEULE ROUTE POUR LES QUATRE RÔLES.
            Au niveau racine et non dans chaque coquille : quatre copies
            seraient quatre écrans à garder identiques, et celui qui divergerait
            serait découvert une nuit. Il n'a pas de `RequireRole` parce qu'il
            n'y a pas de rôle qui n'ait pas le droit d'appeler la police. */}
        <Route path={EMERGENCY_ROUTE} element={<EmergencyScreen />} />

        {/* D1 — token demonstration page. Hidden: not in any navigation, no
            role gate, rendered outside every layout so the tokens are seen on
            their own rather than through a shell. */}
        <Route path="/styleguide" element={<StyleguideScreen />} />

        <Route
          path="/coordinator"
          element={
            <RequireRole role="coordinator">
              <CoordinatorLayout />
            </RequireRole>
          }
        >
          <Route index element={<DashboardScreen />} />
          <Route path="farms" element={<FarmsListScreen />} />
          {/* Static segments before the :farmId param, or "new" is read as an id. */}
          <Route path="farms/new" element={<FarmFormScreen />} />
          <Route path="farms/:farmId" element={<FarmDetailScreen />} />
          <Route path="farms/:farmId/edit" element={<FarmFormScreen />} />
          <Route
            path="farms/:farmId/anchors/new"
            element={<AnchorFormScreen />}
          />
          <Route
            path="farms/:farmId/anchors/:anchorId"
            element={<AnchorSheetScreen />}
          />
          <Route
            path="farms/:farmId/anchors/:anchorId/edit"
            element={<AnchorFormScreen />}
          />
          <Route path="route" element={<RoutePlannerScreen />} />
          <Route path="volunteers" element={<VolunteersScreen />} />
          <Route path="drivers" element={<DriversScreen />} />
          {/* G10 — ONE wizard, three templates. The kind lives in the path so
              a coordinator can be sent straight to the farms import, and so
              the back link knows which roster he came from. The legacy
              /volunteers/import URL is kept: it is in the product owner's
              browser history and in the Lot 0.9 screenshots. */}
          {/* ★★ AA4 · AA5 — the two imports that come from OUTSIDE the
              programme are their own screen, and they are declared BEFORE the
              `:kind` route or the wizard's redirect would swallow them: it
              treats any kind it does not know as a mistyped URL.

              ⚠️ AND EACH CARRIES A `key`. Both routes render the same lazy
                 component, so React reconciles one into the other and KEEPS
                 its state: caught by `bun run sheets`, which walked the
                 prospection wizard to its preview, navigated to the signatures
                 one, and found no file input — the second screen had inherited
                 the first one's step. A key per kind makes the switch a
                 remount, which is what a different file plainly is. */}
          <Route
            path="import/prospection"
            element={
              <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
                <SheetImportScreen key="prospection" kind="prospection" />
              </Suspense>
            }
          />
          <Route
            path="import/signatures"
            element={
              <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
                <SheetImportScreen key="signatures" kind="signatures" />
              </Suspense>
            }
          />
          {/* ★★ AB6.7 — and the association's own file, coming back. Same
              screen, same `key` rule: three routes render one lazy component,
              and without a key per kind React reconciles one into the next and
              KEEPS its step (see the note on the two above). */}
          <Route
            path="import/association"
            element={
              <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
                <SheetImportScreen key="association" kind="association" />
              </Suspense>
            }
          />
          <Route
            path="import/:kind"
            element={
              <Suspense fallback={<div className="skeleton h-96 rounded-card" />}>
                <ImportWizardScreen />
              </Suspense>
            }
          />
          <Route
            path="volunteers/import"
            element={<Navigate to="/coordinator/import/volunteers" replace />}
          />
          {/* ★★ AB6.6 — l'écran d'export. Reached from חוות → ⋯, beside the
              two imports it is the counterpart of. */}
          <Route path="export" element={<ExportScreen />} />
          <Route path="agenda" element={<AgendaScreen />} />
          <Route path="missions" element={<MissionsScreen />} />
          {/* Static segment before the :missionId param, or "new" is read as an id. */}
          <Route path="missions/new" element={<MissionWizardScreen />} />
          <Route path="missions/:missionId" element={<MissionDetailScreen />} />
          <Route path="settings" element={<SettingsScreen />} />
          {/* ★★ Y2 — "עריכת אזורים". Reached from הגדרות; the screen itself
              refuses to render for anybody but the coordinator. */}
          <Route path="settings/regions" element={<RegionsEditScreen />} />
          <Route path="incidents" element={<IncidentsScreen />} />
          <Route
            path="incidents/:incidentId"
            element={<IncidentDetailScreen />}
          />
          <Route path="*" element={<Navigate to="/coordinator" replace />} />
        </Route>

        <Route
          path="/farmer"
          element={
            <RequireRole role="farmer">
              <FieldLayout items={FARMER_NAV} />
            </RequireRole>
          }
        >
          <Route index element={<FarmerTonightScreen />} />
          <Route path="guards" element={<FarmerGuardsScreen />} />
          <Route path="report" element={<FarmerReportScreen />} />
          <Route path="*" element={<Navigate to="/farmer" replace />} />
        </Route>

        <Route
          path="/volunteer"
          element={
            <RequireRole role="volunteer">
              <FieldLayout items={VOLUNTEER_NAV} />
            </RequireRole>
          }
        >
          <Route index element={<VolunteerGuardScreen />} />
          <Route path="roster" element={<VolunteerRosterScreen />} />
          <Route path="report" element={<VolunteerReportScreen />} />
          <Route path="*" element={<Navigate to="/volunteer" replace />} />
        </Route>

        <Route
          path="/driver"
          element={
            <RequireRole role="driver">
              <FieldLayout items={DRIVER_NAV} />
            </RequireRole>
          }
        >
          <Route index element={<DriverTripScreen />} />
          <Route path="*" element={<Navigate to="/driver" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
