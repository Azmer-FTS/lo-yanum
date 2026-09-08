/**
 * Public surface of the business layer.
 *
 * INVARIANT: nothing under /src/core imports React, react-dom, or any DOM API.
 * The UI depends on core; core never depends on the UI.
 */

export * from './types'
export * from './clock'
export * from './contrast'
export * from './geo'
export * from './regions'
export * from './fields'
export * from './routing'
export * from './tours'
export * from './messages'
export * from './outreach'
export * from './import'
export * from './agenda'
export * from './association'
export * from './prospection'
export * from './signatures'
export * from './access'
export * from './dispatch'
export * from './sessions'
export * from './config'
export * from './profile'
export * from './theme'
export * from './photo'
export * from './deletion'
export * from './report'
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
  setPresence,
  archiveVolunteer,
  reactivateVolunteer,
  setCommitmentFulfilled,
  createFarm,
  updateFarm,
  // AD2.2 — les deux gestes de la note d'écart.
  alignDeclaredToOutline,
  keepDeclaredArea,
  // PO POINT 8 — the deletions, every one of them refusal-aware.
  deleteFarm,
  deleteVolunteer,
  deleteDriver,
  deleteFarmContact,
  deleteMission,
  clearMissionMeetingPoints,
  deleteFarmZoneChecked,
  deleteFarmVisitChecked,
  deleteTourById,
  createFarmZone,
  createThreatZone,
  updateThreatZone,
  deleteThreatZone,
  createThreatVector,
  updateThreatVector,
  deleteThreatVector,
  updateFarmZoneRing,
  deleteFarmZone,
  createDriver,
  updateDriver,
  setMissionDriverConfirmed,
  newContactId,
  newAgreementId,
  createAnchorPoint,
  patchAnchorPoint,
  deleteAnchorPoint,
  updateAnchorPoint,
  createVolunteer,
  updateVolunteer,
  importVolunteers,
  importFarms,
  applyAssociation,
  applyProspection,
  applySignatures,
  importDrivers,
  createFarmVisit,
  updateFarmVisit,
  deleteFarmVisit,
  createGeneralMeeting,
  updateGeneralMeeting,
  deleteGeneralMeeting,
  createMission,
  updateMissionStaffing,
  saveTour,
  deleteTour,
  cancelMission,
  setOutreachSent,
  reactivateMission,
  notifyDerivedChange,
} from './store'
export type {
  NewIncidentInput,
  FarmDraft,
  FarmZoneDraft,
  ThreatZoneDraft,
  ThreatVectorDraft,
  DriverDraft,
  AnchorDraft,
  VolunteerDraft,
  FarmVisitDraft,
  GeneralMeetingDraft,
  MissionDraft,
  TourDraft,
} from './store'

export {
  LOCALITIES,
  LOCALITY_KIND_LABEL,
  findLocality,
  normalizeLocality,
  searchLocalities,
} from './gazetteer'
export type { Locality, LocalityKind } from './gazetteer'

export { configurePhotoPool, photoSource } from './photo'
