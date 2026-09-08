import { changesBetween, indexOf } from './backend'
import { deletionPlan } from './deletion'
import type { StoreBackend, StoreData, StoreIndex } from './backend'
import { iso, now } from './clock'
import { DEMO_BACKEND } from './demo'
import { declaredAreas, measuredAreas } from './fields'
import { ringAreaDunams } from './geo'
import { ASSOCIATION_INDEX, entityKindForRow } from './prospection'
import { farmFromSignatureRow, signaturePatch } from './signatures'
import type { SignaturePlan } from './signatures'
import type { ProspectionPlan } from './prospection'
import type { Tour } from './tours'
import type {
  Agreement,
  AnchorPoint,
  OutreachNotice,
  CancelReason,
  Driver,
  Farm,
  FarmCommitment,
  FarmContact,
  LivestockLine,
  FarmStatus,
  RegionId,
  EntityKind,
  FarmType,
  FarmVisit,
  FarmZone,
  FarmZoneKind,
  GeneralMeeting,
  Incident,
  IncidentSeverity,
  IncidentSource,
  LatLng,
  Mission,
  MissionAssignment,
  MissionDriver,
  MissionLeg,
  PhoneType,
  PresenceMark,
  PresenceSource,
  Session,
  ThreatIntensity,
  ThreatVector,
  ThreatZone,
  Volunteer,
  VolunteerAvailability,
  VolunteerStatus,
} from './types'
import { DEFAULT_AVAILABILITY, EMPTY_LEG } from './types'

/**
 * P2.6 — THE STORE, AND IT NO LONGER OWNS ITS DATA.
 *
 * Deliberately NOT a React context: it is a plain observable so that /src/core
 * stays framework-free. The UI binds to it with `useSyncExternalStore`.
 *
 * What P2.6 changed is WHERE the snapshot comes from and what happens after a
 * mutation. Both now belong to a `StoreBackend` (see ./backend): the demo one
 * seeds the mock fixtures and persists nothing, the Supabase one seeds empty,
 * hydrates from Postgres and writes through. The 53 mutations below are
 * IDENTICAL under both — they mutate the snapshot and commit, exactly as they
 * did before — which is what makes "no screen changes" true rather than hoped.
 */

let backend: StoreBackend = DEMO_BACKEND
let data: StoreData = remeasureFarms(backend.seed())

/**
 * The structural index the write-through diff is taken against — see
 * `indexOf`. Null whenever the backend persists nothing, which is what keeps
 * demo mode (and therefore /poc and every browser gate) on exactly the code
 * path it had before P2.6.
 */
let index: StoreIndex | null = backend.persists ? indexOf(data) : null

// --- Observable plumbing ---------------------------------------------------

let version = 0
const listeners = new Set<() => void>()

function commit(): void {
  if (index !== null) {
    const next = indexOf(data)
    const changes = changesBetween(index, next)
    index = next
    if (changes.length > 0) backend.onChange?.(changes)
  }
  version += 1
  for (const fn of listeners) fn()
}

/**
 * ★★ Y2 — SOMETHING OUTSIDE THE STORE CHANGED WHAT THE STORE'S DATA MEANS.
 *
 * The region outlines are not store data — they are a pure function the store's
 * data is read THROUGH (`farmRegion`, `regionOfLocality`, `dunamsByRegion`).
 * When the coordinator saves a redrawn boundary, not one farm has changed and
 * every farm's region may have. `useCoreValue` re-runs its selector on a
 * version bump and nothing else, so this is the whole of "rattachement
 * automatique … recalculé après enregistrement": one bump, and every screen
 * re-reads through the new outlines.
 *
 * ⚠️ NOT a mutation, and it must not become one. It writes nothing, so the
 *    Supabase backend sees no change and nothing is pushed — which is right:
 *    the outlines are a setting of this device, not a row.
 */
export function notifyDerivedChange(): void {
  commit()
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Monotonic snapshot token — changes whenever any store data changes. */
export function getVersion(): number {
  return version
}

/**
 * Raw, UNFILTERED data. Only /src/core/access.ts may call this; screens must go
 * through the role-aware accessors so the filtering rules live in one place.
 */
export function _raw(): StoreData {
  return data
}

export function getSession(): Session {
  return data.session
}

export function setSession(session: Session): void {
  data.session = session
  commit()
}

/**
 * Back to the backend's seed.
 *
 * A TEST AND DEMO OPERATION, and it is written not to write: the index is
 * rebuilt from the fresh snapshot BEFORE the commit, so the diff sees nothing
 * and nothing is pushed. `bun run accept` calls it between sections; a real
 * mode that reset itself into 26 DELETEs would be a different kind of tool.
 */
export function resetStore(): void {
  data = remeasureFarms(backend.seed())
  index = backend.persists ? indexOf(data) : null
  commit()
}

/**
 * Swap the implementation. Called ONCE, before the first render, and only from
 * outside /src/core — the core cannot know which of the two builds is running
 * (`SUPABASE_CONFIGURED` lives in src/data), and giving it the ability to find
 * out would be the import that ends the "core does no I/O" invariant.
 */
export function installBackend(next: StoreBackend): void {
  backend = next
  data = remeasureFarms(next.seed())
  index = next.persists ? indexOf(data) : null
  version += 1
  for (const fn of listeners) fn()
}

/** The installed backend's name — 'demo' | 'supabase'. Diagnostics only. */
export function backendName(): string {
  return backend.name
}

/**
 * HYDRATION — replace the whole snapshot without writing a word back.
 *
 * This is how the Supabase backend fills the empty app it seeded, and how a
 * P2.5b cache restores a reload. The index is rebuilt from the incoming data
 * rather than diffed against it, ON PURPOSE: what just arrived FROM the server
 * must never be echoed back TO it, and a hydration that produced 3 000 changes
 * would do exactly that on every reconnect.
 */
export function replaceSnapshot(next: StoreData): void {
  const session = data.session
  /* AD1 - la mesure est reconstruite depuis les polygones qui viennent
     d'arriver, jamais lue dans ce qui arrive : voir `remeasureFarms`. */
  data = remeasureFarms({ ...next, session })
  index = backend.persists ? indexOf(data) : null
  version += 1
  for (const fn of listeners) fn()
}

// --- Mutations -------------------------------------------------------------

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`
}

export interface NewIncidentInput {
  farmId: string
  missionId: string | null
  source: IncidentSource
  reporterId: string | null
  reporterName: string
  severity: IncidentSeverity
  description: string
  position: LatLng | null
}

export function addIncident(input: NewIncidentInput): Incident {
  const incident: Incident = {
    id: nextId('inc'),
    ...input,
    reportedAt: iso(now()),
    resolved: false,
    entries: [],
  }
  data.incidents = [incident, ...data.incidents]
  commit()
  return incident
}

export function addIncidentEntry(
  incidentId: string,
  author: string,
  text: string,
): void {
  const incident = data.incidents.find((i) => i.id === incidentId)
  if (!incident) return
  incident.entries = [
    ...incident.entries,
    { id: nextId('ent'), at: iso(now()), author, text },
  ]
  commit()
}

export function setIncidentResolved(incidentId: string, resolved: boolean): void {
  const incident = data.incidents.find((i) => i.id === incidentId)
  if (!incident) return
  incident.resolved = resolved
  commit()
}

function withMission(missionId: string, fn: (m: Mission) => void): void {
  const mission = data.missions.find((m) => m.id === missionId)
  if (!mission) return
  fn(mission)
  commit()
}

/** Volunteer action: the group has reached the anchor point. */
export function confirmArrival(missionId: string): void {
  withMission(missionId, (m) => {
    m.arrivalConfirmedAt = iso(now())
    m.status = 'in_progress'
  })
}

/** True once every assignment has at least one mark on the given leg. */
function legFullyMarked(mission: Mission, leg: MissionLeg): boolean {
  return mission.assignments.every(
    (a) => a[leg].driver !== null || a[leg].group !== null,
  )
}

/**
 * D6.2 — stamp the timeline instants a leg transition implies.
 *
 * Called from every path that can change a leg's completeness, so a timestamp
 * can never be missed by one caller and set by another. Each stamp is
 * write-once: re-marking a volunteer must not rewrite the moment the group
 * actually got on site.
 */
function stampLegTimestamps(mission: Mission): void {
  if (mission.droppedOffAt === null && legFullyMarked(mission, 'outbound')) {
    mission.droppedOffAt = iso(now())
  }
  if (mission.pickedUpAt === null && legFullyMarked(mission, 'inbound')) {
    mission.pickedUpAt = iso(now())
  }
  if (mission.completedAt === null && mission.status === 'completed') {
    mission.completedAt = iso(now())
  }
}

/**
 * ★★ AE3.3 — LE POINT DE CONTRÔLE, EN UN GESTE.
 *
 * Un horodatage ajouté à la fin de la liste, et rien d'autre. Pas de statut,
 * pas de champ « dernier signe » qui doublerait la liste et pourrait la
 * contredire : `checkpointState` (core/vigil.ts) lit le maximum de l'arrivée
 * et des points, ce qui est vrai par construction.
 *
 * ⚠️ SANS EFFET AVANT L'ARRIVÉE ET APRÈS LA FIN. Un point de contrôle sur une
 *    garde qui n'a pas commencé serait un signe de vie donné par quelqu'un qui
 *    n'est pas sur place — c'est-à-dire exactement le faux négatif qu'AE3
 *    existe pour empêcher.
 */
export function recordCheckpoint(missionId: string): void {
  withMission(missionId, (m) => {
    if (m.arrivalConfirmedAt === null) return
    if (m.endConfirmedAt !== null) return
    m.checkpoints = [...(m.checkpoints ?? []), iso(now())]
  })
}

/** Volunteer action: the guard is over for the whole group. */
export function confirmGuardEnd(missionId: string): void {
  withMission(missionId, (m) => {
    m.endConfirmedAt = iso(now())
    m.status = legFullyMarked(m, 'inbound')
      ? 'completed'
      : 'return_not_confirmed'
    stampLegTimestamps(m)
  })
}

/**
 * R6: record one nominative presence mark.
 *
 * Marks are never merged or overwritten across sources — the driver's answer
 * and the group holder's answer are stored side by side precisely so a
 * disagreement can be detected instead of silently resolved.
 */
export function setPresence(
  missionId: string,
  volunteerId: string,
  leg: MissionLeg,
  source: PresenceSource,
  mark: PresenceMark | null,
): void {
  withMission(missionId, (m) => {
    const assignment = m.assignments.find((a) => a.volunteerId === volunteerId)
    if (!assignment) return
    assignment[leg][source] = mark

    if (leg === 'outbound' && m.status === 'planned') {
      m.status = 'in_progress'
    }
    if (leg === 'inbound' && m.endConfirmedAt && legFullyMarked(m, 'inbound')) {
      m.status = 'completed'
    }
    stampLegTimestamps(m)
  })
}

export function archiveVolunteer(volunteerId: string, reason: string): void {
  const volunteer = data.volunteers.find((v) => v.id === volunteerId)
  if (!volunteer) return
  volunteer.status = 'inactive'
  volunteer.inactiveReason = reason
  commit()
}

export function reactivateVolunteer(volunteerId: string): void {
  const volunteer = data.volunteers.find((v) => v.id === volunteerId)
  if (!volunteer) return
  volunteer.status = 'active'
  volunteer.inactiveReason = null
  commit()
}

export function setCommitmentFulfilled(
  farmId: string,
  index: number,
  fulfilled: boolean,
): void {
  const farm = data.farms.find((f) => f.id === farmId)
  if (!farm || !farm.commitments[index]) return
  farm.commitments[index].fulfilled = fulfilled
  commit()
}

// --- R5: create / edit -----------------------------------------------------
//
// These write straight into the in-memory store, so edits persist for the
// session and disappear on reload. In Lot 1 each becomes a Supabase mutation;
// the signatures are shaped to survive that swap unchanged.

export interface FarmDraft {
  photo: string | null
  name: string
  locality: string
  region: string
  /** X12.2 — the standard region, when it is pinned by hand. Null = derived. */
  regionId?: RegionId | null
  type: FarmType
  /** G16 — חווה / מושב / אחר; absent = farm. */
  entityKind?: EntityKind
  status: FarmStatus
  position: LatLng
  farmDunams: number
  grazingDunams: number
  /** G15 — see Farm: true = the coordinator typed the value. */
  farmDunamsManual?: boolean
  grazingDunamsManual?: boolean
  contacts: FarmContact[]
  commitments: FarmCommitment[]
  /** PO POINT 6 — the head count, per species. Absent = never asked. */
  livestock?: LivestockLine[]
  agreements: Agreement[]
  notes: string
  // AA2 — the prospection fields. Every one optional; see `Farm` for why.
  localityCode?: number | null
  council?: string
  councilPhone?: string
  localityKind?: string
  priority?: number | null
  positionMissing?: boolean
  legalEntity?: string
  landAgreement?: string
  landAgreementUntil?: string | null
  farmerName?: string
  farmerPhone?: string
  farmerEmail?: string
  liaisonName?: string
  liaisonPhone?: string
  // AC1 · AC2 · AC3 — the holding's own name, its umbrella, its guarded area.
  farmName?: string
  umbrella?: string
  guardedDunams?: number
  guardedDunamsManual?: boolean
  /* ★★ AE2 — les deux numéros de nuit et les quatre champs du תיק אתר. Ils
     sont sur le brouillon comme les autres textes libres : `createFarm` et
     `updateFarm` recopient le brouillon, il n'y a rien de plus à écrire. */
  councilHotline?: string
  standbyPhone?: string
  siteAccess?: string
  gateCode?: string
  parking?: string
  terrainNotes?: string
  // AA5 — set by the signatures import, never by the form.
  signature?: string | null
  signatureMissing?: boolean
  signatureOrigin?: Farm['signatureOrigin']
}

export function createFarm(draft: FarmDraft): Farm {
  const farm: Farm = {
    id: nextId('farm'),
    ...draft,
    lastVisitAt: null,
    nextVisitAt: null,
  }
  data.farms = [farm, ...data.farms]
  commit()
  return farm
}

export function updateFarm(farmId: string, draft: FarmDraft): void {
  const index = data.farms.findIndex((f) => f.id === farmId)
  if (index === -1) return
  data.farms[index] = { ...data.farms[index], ...draft }
  /* AD1 — le formulaire n'écrit QUE la surface déclarée ; la mesurée est
     reprise ici pour qu'une fiche créée puis enregistrée porte la sienne
     sans attendre la prochaine mutation de polygone. */
  remeasureFarm(farmId)
  commit()
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD2.2 — LES DEUX GESTES DE LA NOTE D'ÉCART, EN UN GESTE CHACUN.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « aligner sur le tracé » — la déclarée prend la valeur mesurée. La note se
 * tait d'elle-même après ça, parce qu'il n'y a plus d'écart : rien à mémoriser.
 *
 * ⚠️ ET LE DRAPEAU DE SAISIE SUIT LA MÊME RÈGLE QU'AILLEURS (AD1.5) : il se
 *    pose sur un chiffre, jamais sur un zéro. Aligner sur un contour qui n'a
 *    pas de zone de pâture met מרעה à zéro, et un zéro drapeauté serait une
 *    exploitation qui DÉCLARE n'avoir aucun pâturage — ce que personne n'a dit.
 */
export function alignDeclaredToOutline(farmId: string): void {
  const index = data.farms.findIndex((f) => f.id === farmId)
  if (index === -1) return
  const farm = data.farms[index]
  const measured = measuredAreas(farm)
  if (measured === null) return
  const next: Farm = {
    ...farm,
    farmDunams: measured.cultivated,
    grazingDunams: measured.grazing,
  }
  if (measured.cultivated > 0) next.farmDunamsManual = true
  else delete next.farmDunamsManual
  if (measured.grazing > 0) next.grazingDunamsManual = true
  else delete next.grazingDunamsManual
  /* La divergence tranchée n'existe plus ; garder sa trace ferait taire une
     divergence FUTURE qui se trouverait porter les mêmes deux totaux. */
  next.areaGapAcceptedDeclared = null
  next.areaGapAcceptedMeasured = null
  data.farms[index] = next
  commit()
}

/**
 * « garder le chiffre déclaré » — la note se tait POUR CETTE FICHE jusqu'à ce
 * que l'un des deux totaux change à nouveau. C'est la paire qui est
 * enregistrée, pas un booléen : voir `areaGap` dans core/fields.ts.
 */
export function keepDeclaredArea(farmId: string): void {
  const index = data.farms.findIndex((f) => f.id === farmId)
  if (index === -1) return
  const farm = data.farms[index]
  const declared = declaredAreas(farm)
  const measured = measuredAreas(farm)
  if (declared === null || measured === null) return
  data.farms[index] = {
    ...farm,
    areaGapAcceptedDeclared: declared.total,
    areaGapAcceptedMeasured: measured.total,
  }
  commit()
}

export function newContactId(): string {
  return nextId('contact')
}

export function newAgreementId(): string {
  return nextId('agr')
}

// --- Farm zones (G1) -------------------------------------------------------

export interface FarmZoneDraft {
  farmId: string
  kind: FarmZoneKind
  ring: LatLng[]
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD1 (2026-09-08) — LE SEUL ÉCRIVAIN DE LA SURFACE **MESURÉE**.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * G15 avait UN écrivain pour UN couple de champs, arbitré par un drapeau. La
 * décision du PO en AD1 sépare les deux faits : la surface déclarée n'est plus
 * touchée par la carte, et ce writer-ci ne remplit que la mesurée.
 *
 * ★ ET C'EST POUR ÇA QUE LE DÉFAUT G15 DISPARAÎT. La mesurée n'a aucune
 *   colonne en base, aucune cellule dans l'export, aucune lecture dans
 *   l'import : elle est RECALCULÉE, ici, depuis les polygones. Un aller-retour
 *   export/import ne peut donc rien y figer, et redessiner un contour la
 *   recalcule — y compris après cet aller-retour, ce qu'A109 mesure.
 *
 * ★ AUCUN POLYGONE DE CE GENRE = CHAMP ABSENT (AD3.4). Pas zéro : « il n'y a
 *   pas de tracé » et « le tracé fait zéro » sont deux phrases, et seule la
 *   première met l'exploitation dans la file « à contourner ». Effacer le
 *   dernier contour rend donc la fiche à cette file, ce qui est exactement ce
 *   qu'il faut qu'il se passe.
 */
function remeasureFarm(farmId: string): void {
  const farm = data.farms.find((f) => f.id === farmId)
  if (!farm) return
  const next = remeasured(farm, data.farmZones)
  if (next !== farm) data.farms = data.farms.map((f) => (f.id === farmId ? next : f))
}

/** La mesure d'une ferme contre une liste de zones. Pure. */
function remeasured(farm: Farm, allZones: readonly FarmZone[]): Farm {
  const zones = allZones.filter((z) => z.farmId === farm.id)
  const sumOf = (kind: FarmZoneKind): number | undefined => {
    const of = zones.filter((z) => z.kind === kind)
    if (of.length === 0) return undefined
    return Math.round(of.reduce((s, z) => s + ringAreaDunams(z.ring), 0))
  }
  const boundary = sumOf('farm_boundary')
  const grazing = sumOf('grazing_area')
  if (farm.measuredFarmDunams === boundary && farm.measuredGrazingDunams === grazing) {
    return farm
  }
  const next = { ...farm }
  if (boundary === undefined) delete next.measuredFarmDunams
  else next.measuredFarmDunams = boundary
  if (grazing === undefined) delete next.measuredGrazingDunams
  else next.measuredGrazingDunams = grazing
  return next
}

/**
 * ★★ AD1 — LA MESURE EST RECONSTRUITE À CHAQUE FOIS QUE LE JEU DE DONNÉES
 *    ARRIVE, et jamais lue depuis ce qui arrive.
 *
 * Quatre portes d'entrée : la graine du backend, `resetStore`, `installBackend`
 * et `replaceSnapshot` (l'hydratation Supabase et le cache hors-ligne). Une
 * seule d'entre elles oubliée et une fiche hydratée porterait une mesure
 * venue d'ailleurs — c'est-à-dire exactement la classe de défaut qu'AD1
 * supprime. Écrit comme une fonction sur un `StoreData` pour qu'il n'y ait
 * qu'un mot à appeler aux quatre endroits.
 *
 * ⚠️ CE N'EST PAS UNE MUTATION : elle est appelée AVANT que l'index de
 *    write-through soit pris, donc rien n'est repoussé vers le serveur. Ce
 *    serait de toute façon sans objet — aucun de ces champs n'a de colonne.
 */
function remeasureFarms(next: StoreData): StoreData {
  next.farms = next.farms.map((f) => remeasured(f, next.farmZones))
  return next
}

export function createFarmZone(draft: FarmZoneDraft): FarmZone {
  const zone: FarmZone = { id: nextId('zone'), ...draft }
  data.farmZones = [...data.farmZones, zone]
  remeasureFarm(draft.farmId)
  commit()
  return zone
}

/** A drag knows the whole ring it produced; replacing it is the mutation. */
export function updateFarmZoneRing(zoneId: string, ring: LatLng[]): void {
  const index = data.farmZones.findIndex((z) => z.id === zoneId)
  if (index === -1) return
  data.farmZones[index] = { ...data.farmZones[index], ring }
  remeasureFarm(data.farmZones[index].farmId)
  commit()
}

export function deleteFarmZone(zoneId: string): void {
  const zone = data.farmZones.find((z) => z.id === zoneId)
  data.farmZones = data.farmZones.filter((z) => z.id !== zoneId)
  if (zone) remeasureFarm(zone.farmId)
  commit()
}

export interface AnchorDraft {
  farmId: string
  name: string
  position: LatLng
  instructions: string[]
  accessDescription: string
}

export function createAnchorPoint(draft: AnchorDraft): AnchorPoint {
  const anchor: AnchorPoint = { id: nextId('anchor'), ...draft }
  data.anchorPoints = [...data.anchorPoints, anchor]
  commit()
  return anchor
}

export function updateAnchorPoint(anchorId: string, draft: AnchorDraft): void {
  const index = data.anchorPoints.findIndex((a) => a.id === anchorId)
  if (index === -1) return
  data.anchorPoints[index] = { ...data.anchorPoints[index], ...draft }
  commit()
}

/**
 * F2 — a partial update, because dragging a pin must not need a whole draft.
 *
 * `updateAnchorPoint` takes the full `AnchorDraft`, which is right for a form
 * and wrong for a map: the map knows a new latitude and nothing else, and
 * routing a drag through the form's shape means every drag rewrites the access
 * description with whatever the caller happened to be holding.
 */
export function patchAnchorPoint(
  anchorId: string,
  patch: Partial<Omit<AnchorPoint, 'id' | 'farmId'>>,
): void {
  const index = data.anchorPoints.findIndex((a) => a.id === anchorId)
  if (index === -1) return
  data.anchorPoints[index] = { ...data.anchorPoints[index], ...patch }
  commit()
}

/**
 * Remove an anchor point — the undo for a pin dropped by accident.
 *
 * REFUSES if any guard still points at it, and says so by returning false. A
 * mission whose rendezvous no longer resolves is invisible: `toMissionView`
 * returns null for it and the guard silently disappears from every screen. The
 * caller is expected to surface the refusal rather than swallow it.
 */
export function deleteAnchorPoint(anchorId: string): boolean {
  const used = data.missions.some(
    (m) =>
      m.anchorPointId === anchorId ||
      m.additionalAnchorPointIds.includes(anchorId),
  )
  if (used) return false
  data.anchorPoints = data.anchorPoints.filter((a) => a.id !== anchorId)
  commit()
  return true
}

export interface VolunteerDraft {
  photo: string | null
  name: string
  age: number
  phone: string
  phoneType: PhoneType
  /** P0bis.5a — optional; '' means "no address", not "unknown". */
  email?: string
  yeshiva: string
  locality: string
  status: VolunteerStatus
  inactiveReason: string | null
  notes: string
  /** G5.2 — licence / car / dual-hat flags. Default false. */
  hasLicense?: boolean
  hasCar?: boolean
  canDrive?: boolean
  /** G3.4 — slot preferences. Defaults to "whenever needed". */
  availability?: VolunteerAvailability
}

export function createVolunteer(draft: VolunteerDraft): Volunteer {
  const volunteer: Volunteer = {
    id: nextId('vol'),
    guardsCount: 0,
    lastActivityAt: null,
    email: '',
    hasLicense: false,
    hasCar: false,
    canDrive: false,
    availability: { ...DEFAULT_AVAILABILITY },
    ...draft,
  }
  data.volunteers = [volunteer, ...data.volunteers]
  syncVolunteerDriver(volunteer)
  commit()
  return volunteer
}

export function updateVolunteer(
  volunteerId: string,
  draft: VolunteerDraft,
): void {
  const index = data.volunteers.findIndex((v) => v.id === volunteerId)
  if (index === -1) return
  data.volunteers[index] = { ...data.volunteers[index], ...draft }
  syncVolunteerDriver(data.volunteers[index])
  commit()
}

/**
 * G5.2 — keep the dual hat honest: ONE human, two roster rows, one source of
 * truth. While `canDrive` is true a linked Driver row exists and mirrors the
 * volunteer's identity fields; when it goes false the row goes with it. The
 * mirrored row keeps its own vehicle/seats/notes once created — those are
 * driver facts, not volunteer facts.
 */
function syncVolunteerDriver(volunteer: Volunteer): void {
  const linked = data.drivers.find((d) => d.volunteerId === volunteer.id)
  if (volunteer.canDrive && !linked) {
    data.drivers = [
      ...data.drivers,
      {
        id: nextId('driver'),
        name: volunteer.name,
        phone: volunteer.phone,
        // The dual hat is ONE human: the same address, kept in step below.
        email: volunteer.email,
        // Vehicle description is the driver's to fill in; empty renders as
        // the UI's "private car" fallback.
        vehicle: '',
        seats: 4,
        locality: volunteer.locality,
        photo: volunteer.photo,
        availabilityNote: '',
        notes: '',
        volunteerId: volunteer.id,
      },
    ]
  } else if (volunteer.canDrive && linked) {
    linked.name = volunteer.name
    linked.phone = volunteer.phone
    linked.email = volunteer.email
    linked.locality = volunteer.locality
    linked.photo = volunteer.photo
  } else if (!volunteer.canDrive && linked) {
    data.drivers = data.drivers.filter((d) => d.id !== linked.id)
  }
}

// --- G5.1: driver create/edit ----------------------------------------------

export interface DriverDraft {
  photo: string | null
  name: string
  phone: string
  /** P0bis.5a — optional; '' means "no address". */
  email?: string
  vehicle: string
  seats: number
  locality: string
  availabilityNote: string
  notes: string
}

// ---------------------------------------------------------------------------
// G18 — the threat layer's writers
// ---------------------------------------------------------------------------

/**
 * Both shapes carry `updatedAt`, and it is stamped HERE rather than passed in.
 *
 * A threat assessment's age is the second thing a coordinator needs to know
 * about it (the first is what it says), and a date a caller supplies is a date
 * a caller can forget to bump. Every write refreshes it — including a vertex
 * drag, because moving a zone IS revising the assessment.
 */
export interface ThreatZoneDraft {
  farmId: string | null
  ring: LatLng[]
  intensity: ThreatIntensity
  note: string
}

export function createThreatZone(draft: ThreatZoneDraft): ThreatZone {
  const zone: ThreatZone = {
    id: nextId('threat'),
    ...draft,
    updatedAt: iso(now()),
  }
  data.threatZones = [...data.threatZones, zone]
  commit()
  return zone
}

export function updateThreatZone(
  zoneId: string,
  patch: Partial<Omit<ThreatZone, 'id' | 'updatedAt'>>,
): void {
  const index = data.threatZones.findIndex((z) => z.id === zoneId)
  if (index === -1) return
  data.threatZones[index] = {
    ...data.threatZones[index],
    ...patch,
    updatedAt: iso(now()),
  }
  data.threatZones = [...data.threatZones]
  commit()
}

export function deleteThreatZone(zoneId: string): void {
  data.threatZones = data.threatZones.filter((z) => z.id !== zoneId)
  commit()
}

export interface ThreatVectorDraft {
  farmId: string | null
  origin: LatLng
  target: LatLng
  intensity: ThreatIntensity
  note: string
}

export function createThreatVector(draft: ThreatVectorDraft): ThreatVector {
  const vector: ThreatVector = {
    id: nextId('vector'),
    ...draft,
    updatedAt: iso(now()),
  }
  data.threatVectors = [...data.threatVectors, vector]
  commit()
  return vector
}

export function updateThreatVector(
  vectorId: string,
  patch: Partial<Omit<ThreatVector, 'id' | 'updatedAt'>>,
): void {
  const index = data.threatVectors.findIndex((v) => v.id === vectorId)
  if (index === -1) return
  data.threatVectors[index] = {
    ...data.threatVectors[index],
    ...patch,
    updatedAt: iso(now()),
  }
  data.threatVectors = [...data.threatVectors]
  commit()
}

export function deleteThreatVector(vectorId: string): void {
  data.threatVectors = data.threatVectors.filter((v) => v.id !== vectorId)
  commit()
}

export function createDriver(draft: DriverDraft): Driver {
  const driver: Driver = {
    id: nextId('driver'),
    volunteerId: null,
    email: '',
    ...draft,
  }
  data.drivers = [driver, ...data.drivers]
  commit()
  return driver
}

export function updateDriver(driverId: string, draft: DriverDraft): void {
  const index = data.drivers.findIndex((d) => d.id === driverId)
  if (index === -1) return
  data.drivers[index] = { ...data.drivers[index], ...draft }
  // The mirror runs both ways for identity fields — the human is one.
  const linkedVolunteerId = data.drivers[index].volunteerId
  if (linkedVolunteerId) {
    const volunteer = data.volunteers.find((v) => v.id === linkedVolunteerId)
    if (volunteer) {
      volunteer.name = draft.name
      volunteer.phone = draft.phone
      volunteer.locality = draft.locality
      volunteer.photo = draft.photo
    }
  }
  commit()
}

/**
 * G4 — resuming a recruitment: the mission's team is REPLACED with the new
 * roster, keeping the presence marks of anyone who survived the reshuffle.
 * Also the path that turns 'recruiting' into 'planned' when the gauge fills.
 */
export function updateMissionStaffing(
  missionId: string,
  volunteerIds: string[],
  drivers: MissionDriver[],
  status: 'planned' | 'recruiting',
  requiredVolunteers?: number,
): void {
  withMission(missionId, (m) => {
    const chosen = volunteerIds
      .map((id) => data.volunteers.find((v) => v.id === id))
      .filter((v): v is Volunteer => v !== undefined)
    const holderId =
      chosen.find((v) => v.phoneType === 'smartphone')?.id ?? chosen[0]?.id
    m.assignments = chosen.map((v) => {
      const existing = m.assignments.find((a) => a.volunteerId === v.id)
      return {
        volunteerId: v.id,
        isGroupPhone: v.id === holderId,
        outbound: existing?.outbound ?? { ...EMPTY_LEG },
        inbound: existing?.inbound ?? { ...EMPTY_LEG },
      }
    })
    m.drivers = drivers
    m.status = status
    if (requiredVolunteers !== undefined) {
      m.requiredVolunteers = requiredVolunteers
    }
  })
}

// --- G9bis: cancellation ----------------------------------------------------

/**
 * Call a guard off.
 *
 * The reason is REQUIRED by the signature — a cancellation without a why is
 * not recordable here, which is the whole point (A45). The notice list is
 * snapshotted NOW, from the people booked at this moment: every assigned
 * volunteer, every driver with a car on the night, and the farm's primary
 * contact — the three audiences who are otherwise standing in the dark at
 * 21:00 for a night that is not happening.
 */
export function cancelMission(
  missionId: string,
  reason: CancelReason,
  note: string,
): void {
  withMission(missionId, (m) => {
    m.status = 'cancelled'
    m.cancelledAt = iso(now())
    m.cancelReason = reason
    m.cancelNote = note.trim()
    m.reactivatedAt = null
    // P0bis.5b — the recipient LIST is no longer snapshotted here: it is
    // derived from the mission by `outreachRecipients` every time the sending
    // centre renders, so a driver added after the cancellation is on the list
    // instead of silently missing from it. Only the ticks are stored, and a
    // cancellation starts with none.
    m.outreach = m.outreach.filter((n) => n.event !== 'cancelled')
  })
}

/**
 * A45/P0bis.5b — the coordinator ticking off "this person has been told".
 *
 * An UPSERT, because the tick is the only record that exists: there is no
 * pre-populated row to find. Un-ticking removes the entry rather than nulling
 * it, so "no entry" means exactly one thing.
 */
export function setOutreachSent(
  missionId: string,
  event: OutreachNotice['event'],
  recipientKind: OutreachNotice['recipientKind'],
  recipientId: string,
  sent: boolean,
): void {
  withMission(missionId, (m) => {
    const rest = m.outreach.filter(
      (n) =>
        !(
          n.event === event &&
          n.recipientKind === recipientKind &&
          n.recipientId === recipientId
        ),
    )
    m.outreach = sent
      ? [...rest, { event, recipientKind, recipientId, sentAt: iso(now()) }]
      : rest
  })
}

/**
 * A46 — a cancelled guard comes back as a RECRUITMENT, not as a plan.
 *
 * Everyone's yes was for a night that was then called off; assuming it still
 * stands is exactly the mistake this flow exists to prevent. So the roster is
 * kept (the coordinator should not redial from a blank list) but every
 * confirmation is reset: drivers to unconfirmed, and the status to
 * 'recruiting' so the wizard's resume flow and the escalating dashboard
 * alerts take over. The cancellation chapter stays on the record for the
 * timeline.
 */
export function reactivateMission(missionId: string): void {
  withMission(missionId, (m) => {
    if (m.status !== 'cancelled') return
    m.status = 'recruiting'
    m.reactivatedAt = iso(now())
    for (const d of m.drivers) d.confirmed = false
  })
}

/** G5.3 — one driver confirming HIS car's passengers. */
export function setMissionDriverConfirmed(
  missionId: string,
  driverId: string,
  confirmed: boolean,
): void {
  withMission(missionId, (m) => {
    const entry = m.drivers.find((d) => d.driverId === driverId)
    if (entry) entry.confirmed = confirmed
  })
}

// --- D4: farm visits -------------------------------------------------------

export interface FarmVisitDraft {
  farmId: string
  at: string
  note: string
  done: boolean
}

/**
 * Recompute `Farm.nextVisitAt` from the visit rows.
 *
 * `nextVisitAt` predates FarmVisit and is read by the route planner, the
 * dashboard and the farm card. Rather than leave two independent sources of
 * truth, it is now a DERIVED CACHE with exactly one writer: this function,
 * called after every visit mutation. Nothing else in the codebase assigns to
 * it, which is what keeps "the agenda says Tuesday" and "the farm card says
 * Tuesday" from ever disagreeing.
 */
function syncNextVisit(farmId: string): void {
  const farm = data.farms.find((f) => f.id === farmId)
  if (!farm) return

  const t = now().getTime()
  const upcoming = data.farmVisits
    .filter(
      (v) => v.farmId === farmId && !v.done && new Date(v.at).getTime() >= t,
    )
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  farm.nextVisitAt = upcoming[0]?.at ?? null
}

export interface GeneralMeetingDraft {
  title: string
  at: string
  endAt: string
  location: string
  person: string
  note: string
}

export function createGeneralMeeting(draft: GeneralMeetingDraft): GeneralMeeting {
  const meeting: GeneralMeeting = { id: nextId('meet'), ...draft }
  data.generalMeetings = [...data.generalMeetings, meeting]
  commit()
  return meeting
}

export function updateGeneralMeeting(
  meetingId: string,
  draft: Partial<GeneralMeetingDraft>,
): void {
  const index = data.generalMeetings.findIndex((m) => m.id === meetingId)
  if (index === -1) return
  data.generalMeetings[index] = { ...data.generalMeetings[index], ...draft }
  commit()
}

export function deleteGeneralMeeting(meetingId: string): void {
  data.generalMeetings = data.generalMeetings.filter((m) => m.id !== meetingId)
  commit()
}

export function createFarmVisit(draft: FarmVisitDraft): FarmVisit {
  const visit: FarmVisit = { id: nextId('visit'), ...draft }
  data.farmVisits = [...data.farmVisits, visit]
  syncNextVisit(visit.farmId)
  commit()
  return visit
}

export function updateFarmVisit(visitId: string, draft: FarmVisitDraft): void {
  const index = data.farmVisits.findIndex((v) => v.id === visitId)
  if (index === -1) return
  const previousFarmId = data.farmVisits[index].farmId
  data.farmVisits[index] = { ...data.farmVisits[index], ...draft }
  syncNextVisit(previousFarmId)
  if (draft.farmId !== previousFarmId) syncNextVisit(draft.farmId)
  commit()
}

export function deleteFarmVisit(visitId: string): void {
  const visit = data.farmVisits.find((v) => v.id === visitId)
  if (!visit) return
  data.farmVisits = data.farmVisits.filter((v) => v.id !== visitId)
  syncNextVisit(visit.farmId)
  commit()
}

// --- G9: tours — the saved field day ----------------------------------------

export interface TourDraft {
  dayKey: string
  departAt: string
  farmIds: string[]
}

/**
 * Save a tour — an UPSERT keyed on the day, because a tour IS a calendar day:
 * "the route for Tuesday" is one object however many times it is re-planned,
 * and two tours on one day would make the "היום שלי" block ambiguous about
 * which one the coordinator is actually driving.
 */
export function saveTour(draft: TourDraft): Tour {
  const existing = data.tours.find((t) => t.dayKey === draft.dayKey)
  if (existing) {
    existing.departAt = draft.departAt
    existing.farmIds = [...draft.farmIds]
    commit()
    return existing
  }
  const tour: Tour = { id: nextId('tour'), ...draft, farmIds: [...draft.farmIds] }
  data.tours = [...data.tours, tour]
  commit()
  return tour
}

export function deleteTour(dayKey: string): void {
  data.tours = data.tours.filter((t) => t.dayKey !== dayKey)
  commit()
}

// --- D5: create a guard ----------------------------------------------------

export interface MissionDraft {
  farmId: string
  anchorPointId: string
  /** F2 — other positions covered during the night. Defaults to none. */
  additionalAnchorPointIds?: string[]
  /** G8 — meeting points; see the Mission type. All default to null. */
  pickupPoint?: LatLng | null
  dropoffPoint?: LatLng | null
  returnPickupPoint?: LatLng | null
  returnDropoffPoint?: LatLng | null
  startAt: string
  endAt: string
  /** In shortlist order. The first one carries the group phone by default. */
  volunteerIds: string[]
  /** G5.3 — one entry per car; [] means no driver arranged. */
  drivers?: MissionDriver[]
  /** G4 — the requested team size (gauge denominator). */
  requiredVolunteers?: number
  /** G4 — 'recruiting' when leaving the wizard with a partial team. */
  status?: 'planned' | 'recruiting'
}

/**
 * Create a guard from the wizard's result.
 *
 * The group phone goes to the first SMARTPHONE holder in the list, falling back
 * to the first volunteer. That fallback is a deliberate visible compromise: a
 * group of kosher-phone holders with no smartphone between them is a real
 * scheduling problem, and the mission should exist so the coordinator can SEE
 * it, not be silently rejected by a form.
 */
export function createMission(draft: MissionDraft): Mission {
  const chosen = draft.volunteerIds
    .map((id) => data.volunteers.find((v) => v.id === id))
    .filter((v): v is Volunteer => v !== undefined)

  const holderId =
    chosen.find((v) => v.phoneType === 'smartphone')?.id ?? chosen[0]?.id ?? null

  const assignments: MissionAssignment[] = chosen.map((v) => ({
    volunteerId: v.id,
    isGroupPhone: v.id === holderId,
    outbound: { ...EMPTY_LEG },
    inbound: { ...EMPTY_LEG },
  }))

  const mission: Mission = {
    id: nextId('mission'),
    farmId: draft.farmId,
    anchorPointId: draft.anchorPointId,
    // Never let the rendezvous appear twice: it is already `anchorPointId`, and
    // a duplicate would render the same pin twice on every map.
    additionalAnchorPointIds: (draft.additionalAnchorPointIds ?? []).filter(
      (id) => id !== draft.anchorPointId,
    ),
    pickupPoint: draft.pickupPoint ?? null,
    dropoffPoint: draft.dropoffPoint ?? null,
    returnPickupPoint: draft.returnPickupPoint ?? null,
    returnDropoffPoint: draft.returnDropoffPoint ?? null,
    startAt: draft.startAt,
    endAt: draft.endAt,
    status: draft.status ?? 'planned',
    assignments,
    drivers: draft.drivers ?? [],
    requiredVolunteers: draft.requiredVolunteers ?? assignments.length,
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    /* AE3.3 — vide, et c'est l'état honnête d'une nuit qui n'a pas commencé. */
    checkpoints: [],
    createdAt: iso(now()),
    droppedOffAt: null,
    pickedUpAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: null,
    cancelNote: '',
    outreach: [],
    reactivatedAt: null,
  }

  data.missions = [mission, ...data.missions]
  commit()
  return mission
}

/**
 * G10 — bulk append from the import wizard, for the two other rosters.
 *
 * Deliberately NOT `drafts.map(createFarm)`: each `create*` commits, and 300
 * commits is 300 renders of a screen nobody is looking at yet. One splice, one
 * commit, one paint — the same shape `importVolunteers` has had since R5.4.
 *
 * A farm gets its zone sums recomputed on the way in: an import carries no
 * polygons, so `remeasureFarm` is what gives an imported farm its measured
 * the same one-writer rule as a drawn one (G15) — the manual flag the draft
 * sets is what protects a number the farmer actually stated.
 */
export function importFarms(drafts: FarmDraft[]): number {
  const created: Farm[] = drafts.map((draft, i) => ({
    id: `${nextId('farm')}-${i}`,
    lastVisitAt: null,
    nextVisitAt: null,
    ...draft,
  }))
  data.farms = [...data.farms, ...created]
  for (const farm of created) remeasureFarm(farm.id)
  commit()
  return created.length
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA4.2 (2026-09-07) — UN RÉIMPORT MET À JOUR, IL NE CRÉE JAMAIS DE DOUBLON.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `importFarms` above APPENDS, which is right for a one-off roster and wrong
 * for the workbook the product owner re-imports several times a week: the same
 * 198 rows would become 396, then 594. This is the other writer, and it takes
 * a PLAN — computed by `planProspection`, previewed by the coordinator — so
 * that what was shown on the preview screen and what is written here are the
 * same object rather than two derivations of it.
 *
 * ★ THE MERGE IS `{ ...farm, ...patch }` AND THE PATCH IS SPARSE. That single
 *   spread is AA4.3: a key absent from the patch is a cell that was blank, and
 *   a blank cell leaves what the app holds exactly as it was. Nothing here has
 *   to know which fields those are, which is what stops the rule from decaying
 *   the next time a column is added.
 *
 * ★ A CREATED RECORD GETS THE DEFAULTS A FARM CANNOT EXIST WITHOUT — a point
 *   (the programme's base, flagged `positionMissing`), a status, a type — and
 *   nothing else invented. Empty contacts, empty commitments, no livestock:
 *   « לא הומצא אף נתון » is the workbook's own rule and it is this one too.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD1.1 — « UN IMPORT NE FIGE PAS UN POLYGONE », ET C'EST ICI QUE ÇA SE
 *    JOUE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * L'export écrit une surface sur CHAQUE ligne, et pour une exploitation qui
 * n'a jamais rien déclaré ce qu'il écrit est ce que le contour mesure (AD1.4 :
 * quand une seule des deux existe, elle sert seule). Relire cette cellule
 * comme une DÉCLARATION transformerait chaque aller-retour en fabrication de
 * déclarations : la fiche cesserait de suivre son polygone, et redessiner le
 * contour ferait apparaître une note d'écart sur une ferme dont personne n'a
 * jamais signé le moindre chiffre. C'est le défaut G15, sous une autre forme.
 *
 * ★ LA RÈGLE EST CELLE QU'AC3 A DÉJÀ INVENTÉE POUR שטחים שמירה : une cellule
 *   qui redit ce que l'app calculerait de toute façon N'EST PAS une saisie.
 *   Ici, « ce que l'app calculerait » est la surface MESURÉE de cette fiche.
 *   Une cellule qui dit autre chose est bien une déclaration, et elle est
 *   écrite — même si elle est plus petite, même si elle est plus grande : c'est
 *   précisément la divergence qu'AD2 sert à montrer.
 *
 * ⚠️ COMPARÉ GENRE PAR GENRE, PAS SUR LE TOTAL. Une ligne qui dirait 430
 *    מעובד / 0 מרעה contre un contour de 0 / 430 a le même total et n'est pas
 *    la même exploitation.
 */
function withoutRestatedMeasure<T extends { farmDunams?: number; grazingDunams?: number }>(
  farm: Farm,
  patch: T,
): T {
  const measured = measuredAreas(farm)
  if (measured === null) return patch
  const next = { ...patch }
  if (next.farmDunams !== undefined && Math.round(next.farmDunams) === measured.cultivated) {
    delete next.farmDunams
    delete (next as { farmDunamsManual?: boolean }).farmDunamsManual
  }
  if (next.grazingDunams !== undefined && Math.round(next.grazingDunams) === measured.grazing) {
    delete next.grazingDunams
    delete (next as { grazingDunamsManual?: boolean }).grazingDunamsManual
  }
  return next
}

export function applyProspection(
  plan: ProspectionPlan,
  fallbackPosition: LatLng,
): { created: number; updated: number } {
  const created: Farm[] = plan.created.map((entry, i) => {
    const patch = entry.patch
    return {
      id: `${nextId('farm')}-${i}`,
      name: patch.name ?? '',
      // AB6.7 — the association's second מיקום carries a real locality;
      // the prospection sheet has no such column and seeds it from the name.
      locality: patch.locality ?? patch.name ?? '',
      region: patch.region ?? '',
      regionId: patch.regionId ?? null,
      type: patch.type ?? 'mixed',
      entityKind: entityKindForRow(patch),
      status: patch.status ?? 'to_contact',
      position: patch.position ?? fallbackPosition,
      farmDunams: patch.farmDunams ?? 0,
      grazingDunams: patch.grazingDunams ?? 0,
      farmDunamsManual: patch.farmDunamsManual,
      grazingDunamsManual: patch.grazingDunamsManual,
      contacts: [],
      commitments: [],
      agreements: [],
      notes: patch.notes ?? '',
      lastVisitAt: null,
      nextVisitAt: null,
      photo: null,
      localityCode: patch.localityCode ?? null,
      council: patch.council,
      councilPhone: patch.councilPhone,
      localityKind: patch.localityKind,
      priority: patch.priority ?? null,
      positionMissing: patch.positionMissing,
      legalEntity: patch.legalEntity,
      landAgreement: patch.landAgreement,
      landAgreementUntil: patch.landAgreementUntil ?? null,
      farmerName: patch.farmerName,
      farmerPhone: patch.farmerPhone,
      farmerEmail: patch.farmerEmail,
      liaisonName: patch.liaisonName,
      liaisonPhone: patch.liaisonPhone,
      // AC1 · AC2.4 · AC3 — the holding, its umbrella, its declared watch.
      farmName: patch.farmName,
      umbrella: patch.umbrella,
      guardedDunams: patch.guardedDunams,
      guardedDunamsManual: patch.guardedDunamsManual,
    }
  })

  const patches = new Map(plan.updated.map((entry) => [entry.farmId as string, entry.patch]))
  data.farms = [
    ...data.farms.map((farm) => {
      const patch = patches.get(farm.id)
      return patch ? { ...farm, ...withoutRestatedMeasure(farm, patch) } : farm
    }),
    ...created,
  ]
  for (const farm of created) remeasureFarm(farm.id)
  commit()
  return { created: created.length, updated: patches.size }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AB6.7 (2026-09-08) — RÉIMPORTER LE FICHIER DE L'ASSOCIATION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The plan itself is a prospection plan — `analyseAssociation` builds one, for
 * the reasons written in `core/association.ts` — so applying it IS
 * `applyProspection`, unchanged, with all three of AA4's guarantees intact.
 *
 * What this adds is the one column that has no equivalent on that path: the
 * signature. It is attached exactly as AA5 attaches one — the image, the
 * origin, the file it came in, the day — so a signature that made the round
 * trip is indistinguishable from one that arrived on the consents form, which
 * is the whole point of « la forme retenue par l'import de signatures d'AA5 ».
 *
 * ⚠️ AND IT NEVER CLEARS ONE. A row whose חתימה cell is empty leaves the farm's
 *    signature alone: their export of a farm they have no signature for must
 *    not delete the one this app captured on a tablet in the field. Same rule
 *    as AA4.3, applied to the one field that is not in the patch.
 */
export function applyAssociation(
  plan: ProspectionPlan,
  signatures: ReadonlyMap<string, string>,
  fileName: string,
  fallbackPosition: LatLng,
): { created: number; updated: number; signatures: number } {
  const applied = applyProspection(plan, fallbackPosition)
  if (signatures.size === 0) return { ...applied, signatures: 0 }

  const importedAt = iso(now())
  let attached = 0
  data.farms = data.farms.map((farm) => {
    const image = signatures.get(ASSOCIATION_INDEX.key(farm))
    if (!image) return farm
    attached++
    return {
      ...farm,
      status: 'signed' as FarmStatus,
      signature: image,
      signatureMissing: undefined,
      signatureOrigin: {
        kind: 'imported' as const,
        signedAt: farm.signatureOrigin?.signedAt ?? null,
        fileName,
        importedAt,
      },
    }
  })
  commit()
  return { ...applied, signatures: attached }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AA5.2 · AA5.4 (2026-09-07) — LES SIGNATURES DÉJÀ OBTENUES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * One row is one signed farm. A row that matches a record SIGNS that record; a
 * row that matches nothing CREATES one — « le PO doit pouvoir faire signer
 * d'abord et créer la fiche ensuite », which is how a gate at dusk actually
 * works.
 *
 * ★ THE STATUS IS SET, AND SO IS ITS PROVENANCE. « הסכמה נחתמה » with the
 *   row's own date, plus the file it came in and the day it arrived — because
 *   these records become documents handed to a ministry, and a signature whose
 *   origin is unrecorded is one nobody can defend.
 *
 * ★ AND A SIGNATURE THAT COULD NOT BE READ STILL SIGNS THE FARM. The record is
 *   `signed`, flagged « חתימה חסרה », and named in the report. Refusing it
 *   would throw away the fact that a farmer consented over the format of a
 *   spreadsheet cell.
 */
export function applySignatures(
  plan: SignaturePlan,
  fileName: string,
  fallbackPosition: LatLng,
): { attached: number; created: number; withoutSignature: number } {
  const importedAt = iso(now())

  const created: Farm[] = plan.created.map((entry, i) => {
    const base = farmFromSignatureRow(entry.row, fallbackPosition)
    const patch = signaturePatch(entry.row, fileName, importedAt)
    return {
      id: `${nextId('farm')}-sig-${i}`,
      name: base.name,
      locality: base.locality,
      region: '',
      regionId: null,
      type: 'mixed',
      entityKind: 'farm',
      position: base.position,
      positionMissing: base.positionMissing,
      localityCode: base.localityCode ?? null,
      council: base.council,
      farmDunams: 0,
      grazingDunams: 0,
      contacts: [],
      commitments: [],
      agreements: [],
      notes: '',
      lastVisitAt: null,
      nextVisitAt: null,
      photo: null,
      ...patch,
    }
  })

  const patches = new Map(
    plan.attached.map((entry) => [
      entry.farmId as string,
      signaturePatch(entry.row, fileName, importedAt),
    ]),
  )
  data.farms = [
    ...data.farms.map((farm) => {
      const patch = patches.get(farm.id)
      return patch ? { ...farm, ...patch } : farm
    }),
    ...created,
  ]
  commit()
  return {
    attached: patches.size,
    created: created.length,
    withoutSignature: plan.unreadable.length,
  }
}

export function importDrivers(drafts: DriverDraft[]): number {
  const created: Driver[] = drafts.map((draft, i) => ({
    id: `${nextId('driver')}-${i}`,
    volunteerId: null,
    email: '',
    ...draft,
  }))
  data.drivers = [...data.drivers, ...created]
  commit()
  return created.length
}

/** Bulk append from the CSV/XLSX import wizard (R5.4). */
export function importVolunteers(drafts: VolunteerDraft[]): number {
  const created: Volunteer[] = drafts.map((draft, i) => ({
    id: `${nextId('vol')}-${i}`,
    guardsCount: 0,
    lastActivityAt: null,
    email: '',
    hasLicense: false,
    hasCar: false,
    canDrive: false,
    availability: { ...DEFAULT_AVAILABILITY },
    ...draft,
  }))
  data.volunteers = [...created, ...data.volunteers]
  commit()
  return created.length
}

// --- PO POINT 8 (2026-08-31): deleting a record ------------------------------

/**
 * ★ EVERY ONE OF THESE ASKS `deletionPlan` FIRST, AND REFUSES ON ITS ANSWER.
 *
 * The policy lives in `./deletion` and nowhere else. These functions do not
 * re-derive it, do not take a `force` flag, and return `false` rather than
 * throwing — a refusal is an ordinary outcome the screen has to render, not an
 * exception. Putting the check here rather than only in the dialog is what
 * makes the rule true of the STORE: a future screen, an import, a script, all
 * hit the same wall.
 *
 * ★ AND THEY WRITE NOTHING SPECIAL FOR THE OUTBOX. P2.6 derives changes by
 *   diffing the snapshot (`backend.ts`), so a row that stops being in an array
 *   becomes `{ collection, id, json: null }` by construction — which is exactly
 *   what P2.5b's outbox stores and what `bun run sync` already asserts survives
 *   a reload as a DELETION. Deleting offline therefore needed no new machinery
 *   at all, which is the payoff of having derived changes instead of declaring
 *   them.
 */

/**
 * An entity, and everything hanging off it.
 *
 * The cascade is written out rather than left to Postgres because the LOCAL
 * cache has no foreign keys: `on delete cascade` in
 * `20260830000100_schema.sql` cleans the database, and this cleans the device.
 * Both are needed, and the app is the one the coordinator is looking at.
 */
export function deleteFarm(farmId: string): boolean {
  if (!deletionPlan('entity', farmId).allowed) return false
  data.farms = data.farms.filter((f) => f.id !== farmId)
  data.farmZones = data.farmZones.filter((z) => z.farmId !== farmId)
  data.anchorPoints = data.anchorPoints.filter((a) => a.farmId !== farmId)
  data.threatZones = data.threatZones.filter((z) => z.farmId !== farmId)
  data.threatVectors = data.threatVectors.filter((v) => v.farmId !== farmId)
  data.farmVisits = data.farmVisits.filter((v) => v.farmId !== farmId)
  // A tour is a DAY, not a farm, so it loses a stop rather than being deleted —
  // and a tour left with no stops is an empty plan the coordinator can drop
  // himself. Rewriting the array rather than mutating it in place so the diff
  // in `backend.ts` sees the tour as changed.
  data.tours = data.tours.map((t) =>
    t.farmIds.includes(farmId)
      ? { ...t, farmIds: t.farmIds.filter((id) => id !== farmId) }
      : t,
  )
  commit()
  return true
}

/**
 * A volunteer, and the driver row his dual hat materialised (G5.2).
 *
 * One human, one deletion. Leaving the driver behind would put a name in the
 * driver roster that belongs to nobody and that no volunteer screen can reach.
 */
export function deleteVolunteer(volunteerId: string): boolean {
  if (!deletionPlan('volunteer', volunteerId).allowed) return false
  data.volunteers = data.volunteers.filter((v) => v.id !== volunteerId)
  data.drivers = data.drivers.filter((d) => d.volunteerId !== volunteerId)
  commit()
  return true
}

export function deleteDriver(driverId: string): boolean {
  if (!deletionPlan('driver', driverId).allowed) return false
  const driver = data.drivers.find((d) => d.id === driverId)
  data.drivers = data.drivers.filter((d) => d.id !== driverId)
  // ★ THE DUAL HAT COMES OFF THE VOLUNTEER TOO. Deleting the driver row while
  //   `canDrive` stays true means the next `updateVolunteer` materialises the
  //   driver again — the deletion would undo itself, silently, the first time
  //   somebody edited a phone number.
  if (driver?.volunteerId) {
    const i = data.volunteers.findIndex((v) => v.id === driver.volunteerId)
    if (i !== -1) data.volunteers[i] = { ...data.volunteers[i], canDrive: false }
  }
  commit()
  return true
}

/** One contact off an entity's card. */
export function deleteFarmContact(contactId: string): boolean {
  if (!deletionPlan('contact', contactId).allowed) return false
  const index = data.farms.findIndex((f) =>
    f.contacts.some((c) => c.id === contactId),
  )
  if (index === -1) return false
  data.farms[index] = {
    ...data.farms[index],
    contacts: data.farms[index].contacts.filter((c) => c.id !== contactId),
  }
  commit()
  return true
}

/**
 * G8's meeting points are FIELDS on a guard, not records, so "delete the
 * meeting point" is clearing them — and the guard falls back to what it did
 * before anybody overrode it: the entity's own pin.
 */
export function clearMissionMeetingPoints(missionId: string): boolean {
  const index = data.missions.findIndex((m) => m.id === missionId)
  if (index === -1) return false
  data.missions[index] = {
    ...data.missions[index],
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
  }
  commit()
  return true
}

/**
 * A guard that was abandoned in the wizard — see `isUnsolicitedDraft`.
 *
 * Every other guard is CANCELLED, which `cancelMission` already does and which
 * keeps the record, the reason and the night.
 */
export function deleteMission(missionId: string): boolean {
  if (!deletionPlan('mission', missionId).allowed) return false
  data.missions = data.missions.filter((m) => m.id !== missionId)
  // An incident always belongs to the ENTITY; its `missionId` is a pointer that
  // has to stop pointing rather than take the incident with it. Same shape as
  // `on delete set null` in the schema.
  data.incidents = data.incidents.map((i) =>
    i.missionId === missionId ? { ...i, missionId: null } : i,
  )
  commit()
  return true
}

/** The refusal-aware wrappers for the deletions that already existed. */
export function deleteFarmZoneChecked(zoneId: string): boolean {
  if (!deletionPlan('farmZone', zoneId).allowed) return false
  deleteFarmZone(zoneId)
  return true
}

export function deleteFarmVisitChecked(visitId: string): boolean {
  if (!deletionPlan('farmVisit', visitId).allowed) return false
  deleteFarmVisit(visitId)
  return true
}

/**
 * A tour is a plan for one day and carries no history of its own, so this is
 * the id-keyed twin of `deleteTour(dayKey)` rather than a new rule.
 */
export function deleteTourById(tourId: string): boolean {
  const tour = data.tours.find((t) => t.id === tourId)
  if (!tour) return false
  if (!deletionPlan('tour', tourId).allowed) return false
  data.tours = data.tours.filter((t) => t.id !== tourId)
  commit()
  return true
}
