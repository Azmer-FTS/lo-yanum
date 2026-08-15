/**
 * Public surface of the business layer.
 *
 * INVARIANT: nothing under /src/core imports React, react-dom, or any DOM API.
 * The UI depends on core; core never depends on the UI.
 */

export * from './types'
export * from './clock'
export * from './geo'
export * from './routing'
export * from './messages'
export * from './access'
export * from './sessions'
export * from './config'
export {
  subscribe,
  getVersion,
  getSession,
  setSession,
  resetStore,
  addIncident,
  addIncidentEntry,
  setIncidentResolved,
  confirmArrival,
  confirmGuardEnd,
  confirmDropoff,
  confirmPickup,
  archiveVolunteer,
  reactivateVolunteer,
  setCommitmentFulfilled,
} from './store'
export type { NewIncidentInput } from './store'
