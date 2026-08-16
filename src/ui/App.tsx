import type { ReactNode } from 'react'
import { Suspense, lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { getSession, homeRouteFor } from '@core/index'
import type { Role } from '@core/index'

import {
  CoordinatorLayout,
  DRIVER_NAV,
  FARMER_NAV,
  FieldLayout,
  VOLUNTEER_NAV,
} from './components/layouts'
import { useCoreValue } from './hooks/useCore'
import { LandingScreen } from './screens/LandingScreen'
import { DriverTripScreen } from './screens/driver/DriverTripScreen'
import { FarmerGuardsScreen } from './screens/farmer/FarmerGuardsScreen'
import { FarmerReportScreen } from './screens/farmer/FarmerReportScreen'
import { FarmerTonightScreen } from './screens/farmer/FarmerTonightScreen'
import { AnchorFormScreen } from './screens/coordinator/AnchorFormScreen'
import { AnchorSheetScreen } from './screens/coordinator/AnchorSheetScreen'
import { DashboardScreen } from './screens/coordinator/DashboardScreen'
import { FarmDetailScreen } from './screens/coordinator/FarmDetailScreen'
import { FarmFormScreen } from './screens/coordinator/FarmFormScreen'
import { FarmsListScreen } from './screens/coordinator/FarmsListScreen'
import { IncidentDetailScreen } from './screens/coordinator/IncidentDetailScreen'
import { IncidentsScreen } from './screens/coordinator/IncidentsScreen'
import { MissionDetailScreen } from './screens/coordinator/MissionDetailScreen'
import { MissionsScreen } from './screens/coordinator/MissionsScreen'
import { RoutePlannerScreen } from './screens/coordinator/RoutePlannerScreen'
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

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingScreen />} />

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
          <Route
            path="volunteers/import"
            element={
              <Suspense fallback={<div className="skeleton h-96 rounded-lg" />}>
                <ImportWizardScreen />
              </Suspense>
            }
          />
          <Route path="missions" element={<MissionsScreen />} />
          <Route path="missions/:missionId" element={<MissionDetailScreen />} />
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
