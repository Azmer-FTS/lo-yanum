import type { ReactNode } from 'react'
import { Suspense, lazy } from 'react'
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
import { useAuth } from './hooks/useAuth'
import { useCoreValue } from './hooks/useCore'
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
export default function App() {
  const auth = useAuth()
  // U7 — every truncated text carries its full value as a title, app-wide.
  useTruncationTitles()

  if (auth.status === 'loading') return <AuthSplash />
  if (auth.status === 'signed-out') return <LoginScreen />

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
