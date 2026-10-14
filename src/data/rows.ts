import type { Collection, StoreData } from '@core/backend'
import type { Tour, TourPlan } from '@core/tours'
import { splitLegacyDunams } from '@core/fields'
import { normalizeLeadStatus } from '@core/leads'
import { normalizeBranches } from '@core/branches'
import type { Institution, InstitutionContact, PhoneLabel } from '@core/institutions'
import { INSTITUTION_CONTACT_ROLES, foldLegacyOffice, settleInstitution } from '@core/institutions'
import type { Landmark } from '@core/landmarks'
import type { MemoLine } from '@core/memo'
import type { FarmInstitutionLink } from '@core/farmLinks'
import { MEMO_BANK_KEYS } from '@core/memo'
import type { Task, TaskLinkKind, TaskList } from '@core/tasks'
import { TASK_LINK_KINDS } from '@core/tasks'
import type {
  Agreement,
  AnchorPoint,
  Driver,
  Farm,
  FarmCommitment,
  LivestockLine,
  FarmContact,
  FarmVisit,
  FarmZone,
  GeneralMeeting,
  Lead,
  Incident,
  IncidentEntry,
  LatLng,
  LegConfirmation,
  Mission,
  MissionAssignment,
  MissionDriver,
  OutreachNotice,
  PresenceMark,
  Volunteer,
} from '@core/types'
import { DEFAULT_AVAILABILITY, EMPTY_LEG } from '@core/types'

/**
 * P2.6b — THE ONE PLACE THAT KNOWS BOTH SHAPES.
 *
 * `@core/types` is a NESTED domain model: a `Farm` carries its contacts,
 * commitments and agreements; a `Mission` carries its assignments, their
 * presence marks, its cars and their passengers. Postgres holds the same facts
 * as 26 flat tables. This file is the whole of the translation, in both
 * directions, and nothing else in the app is allowed to know a column name.
 *
 * ★ IT IS WRITTEN AS AN AGGREGATE MAPPING, NOT A TABLE MAPPING, AND THAT
 *   DECIDES THE WRITE PATH. `store.ts` reports what changed as whole
 *   aggregates (see the note on `indexOf`), because that is what a mutation
 *   actually produces and what an offline outbox can replay a week later
 *   without holding a reference into a store that has moved on. So an upsert
 *   here is: write the parent row, then for each child table delete what
 *   belongs to this parent and insert the new set. That is aggregate-level
 *   last-write-wins, it is a handful of statements rather than a field-level
 *   diff nobody could debug at 02:00, and it is exactly the granularity the
 *   change record already has.
 *
 * ★ THE CHILD LISTS ARE IN INSERT ORDER AND ARE DELETED IN REVERSE. Not a
 *   style choice: `presence_marks` has a foreign key onto
 *   `mission_assignments`, and `mission_driver_passengers` onto
 *   `mission_drivers`. Insert a mark before its assignment, or delete an
 *   assignment before its marks, and Postgres refuses — correctly.
 *
 * `bun run mapping` drives every fixture aggregate through `toRows` and back
 * through `fromRows` and fails on any difference, so "lossless" is a checked
 * claim about 12 farms, 300 volunteers and every guard in the fixtures rather
 * than a hope about 26 hand-written column lists.
 */

export type Row = Record<string, unknown>

/** One table's worth of an aggregate's rows. */
export interface TableRows {
  table: string
  rows: Row[]
}

export interface Mapping<T> {
  /** The parent table; its primary key IS the aggregate's id. */
  readonly table: string
  /**
   * Child tables in INSERT order, each with the column naming the parent.
   * Deletes run in reverse; see the note above.
   */
  readonly children: ReadonlyArray<{ table: string; fk: string }>
  toRows(value: T): TableRows[]
  fromRows(parent: Row, children: Record<string, Row[]>): T
}

// --- Small readers ---------------------------------------------------------
//
// Postgres answers a `timestamptz` as `2026-08-31 12:00:00+00`, the app writes
// `iso(now())` which is `2026-08-31T12:00:00.000Z`. Both parse to the same
// instant and every reader in @core goes through `new Date(...)`, so nothing
// would visibly break — but two spellings of one timestamp in one snapshot is
// exactly the kind of difference that makes a structural diff report a change
// that did not happen. Normalising on the way in costs nothing and keeps the
// write-through quiet.

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' ? v : fallback)
const bool = (v: unknown): boolean => v === true
const nullableStr = (v: unknown): string | null => (typeof v === 'string' ? v : null)

const ts = (v: unknown): string => (v == null ? '' : new Date(v as string).toISOString())
const tsOrNull = (v: unknown): string | null =>
  v == null ? null : new Date(v as string).toISOString()

/** A day key stays a day key: `date` comes back as YYYY-MM-DD already. */
const day = (v: unknown): string => str(v).slice(0, 10)

const point = (lat: unknown, lng: unknown): LatLng => ({ lat: num(lat), lng: num(lng) })
const pointOrNull = (lat: unknown, lng: unknown): LatLng | null =>
  lat == null || lng == null ? null : point(lat, lng)

/** Child rows, in the `position` order they were written with. */
const ordered = (rows: Row[] | undefined): Row[] =>
  [...(rows ?? [])].sort((a, b) => num(a.position) - num(b.position))

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

// --- Vertex rings ----------------------------------------------------------

const ringRows = (fk: string, id: string, ring: LatLng[]): Row[] =>
  ring.map((p, position) => ({ [fk]: id, position, lat: p.lat, lng: p.lng }))

const ringOf = (rows: Row[] | undefined): LatLng[] =>
  ordered(rows).map((r) => point(r.lat, r.lng))

// ===========================================================================
// Farms — `entities` + contacts + commitments + agreements
// ===========================================================================
//
// A `FarmCommitment` has NO id in the domain model; the table needs one. It is
// minted from the parent and the position — `farm-01:c0` — which is stable
// across writes (the same commitment keeps the same row) and needs nothing
// stored to reproduce. `position` is what actually orders them on the way
// back, and it is load-bearing: `setCommitmentFulfilled` addresses a
// commitment by its INDEX.

const farmMapping: Mapping<Farm> = {
  table: 'entities',
  children: [
    { table: 'entity_contacts', fk: 'entity_id' },
    { table: 'entity_commitments', fk: 'entity_id' },
    // PO POINT 6 — the same shape as commitments, and for the same reason:
    // the domain object has no id, the row needs one, and `position` is what
    // orders them on the way back.
    { table: 'entity_livestock', fk: 'entity_id' },
    { table: 'agreements', fk: 'entity_id' },
  ],
  toRows: (f) => [
    {
      table: 'entities',
      rows: [
        {
          id: f.id,
          name: f.name,
          locality: f.locality,
          region: f.region,
          type: f.type,
          entity_kind: f.entityKind ?? 'farm',
          status: f.status,
          lat: f.position.lat,
          lng: f.position.lng,
          farm_dunams: f.farmDunams,
          grazing_dunams: f.grazingDunams,
          farm_dunams_manual: f.farmDunamsManual ?? false,
          grazing_dunams_manual: f.grazingDunamsManual ?? false,
          notes: f.notes,
          last_visit_at: f.lastVisitAt,
          next_visit_at: f.nextVisitAt,
          photo: f.photo,
          /**
           * ★ AA2 · AA5 (2026-09-07) — THE PROSPECTION COLUMNS.
           *
           * ⚠️ EVERY ONE OF THEM IS WRITTEN AS `null` RATHER THAN OMITTED WHEN
           *    ABSENT, and that is not cosmetic: an omitted key in an upsert
           *    leaves whatever the row held before, so a farm whose חקלאי was
           *    cleared in the form would come back with the old name after a
           *    sync. `?? null` makes "cleared" a value the round trip carries.
           */
          locality_code: f.localityCode ?? null,
          council: f.council ?? null,
          council_phone: f.councilPhone ?? null,
          locality_kind: f.localityKind ?? null,
          priority: f.priority ?? null,
          position_missing: f.positionMissing ?? false,
          /* AM1.4 — « dans » ou « rattachée à » le יישוב ; null = non précisé. */
          locality_relation: f.localityRelation ?? null,
          legal_entity: f.legalEntity ?? null,
          land_agreement: f.landAgreement ?? null,
          land_agreement_until: f.landAgreementUntil ?? null,
          farmer_name: f.farmerName ?? null,
          farmer_phone: f.farmerPhone ?? null,
          /* ★★ BA — « טרם נוצר קשר » ; absent = établi (défaut de la colonne). */
          contact_established: f.contactEstablished !== false,
          /* ★★ BC — la localité de repère (calculée ou saisie) et la nature. */
          nearest_locality: f.nearestLocality ?? null,
          nearest_locality_manual: f.nearestLocalityManual ?? false,
          branches: f.branches ?? [],
          farmer_email: f.farmerEmail ?? null,
          /* AF1 — ת״ז / ח״פ, la quatrième case de l'en-tête du הסכם. */
          farmer_id_no: f.farmerId ?? null,
          liaison_name: f.liaisonName ?? null,
          liaison_phone: f.liaisonPhone ?? null,
          /* AC1 · AC2.4 · AC3 — the holding half of the identity, the umbrella
             organisation, and the declared guarded area with its override. */
          farm_name: f.farmName ?? null,
          umbrella_org: f.umbrella ?? null,
          guarded_dunams: f.guardedDunams ?? null,
          guarded_dunams_manual: f.guardedDunamsManual ?? false,
          /**
           * ★★ AD2.2 — LA DIVERGENCE QUE LE COORDINATEUR A TRANCHÉE, comme la
           *    PAIRE de totaux sur laquelle il l'a tranchée.
           *
           * ⚠️ ET LA SURFACE MESURÉE N'A PAS DE COLONNE, EXPRÈS (AD1). Elle est
           *    recalculée depuis `farm_zones` à chaque hydratation
           *    (`remeasureFarms`, core/store.ts) ; lui donner une colonne
           *    rouvrirait le seul chemin par lequel un jeu de données arrivé
           *    d'ailleurs pourrait la figer, qui est le défaut G15 lui-même.
           */
          area_gap_declared: f.areaGapAcceptedDeclared ?? null,
          area_gap_measured: f.areaGapAcceptedMeasured ?? null,
          /**
           * ★★ AE2 — LES DEUX NUMÉROS QUI ARRIVENT LES PREMIERS ET LA FICHE DU
           *    SITE. Six colonnes de texte, toutes nullables, aucune lue par
           *    quoi que ce soit d'autre que l'écran d'urgence et le SMS.
           *
           * ⚠️ `council_hotline` N'EST PAS `council_phone`. La seconde existe
           *    depuis AA4 et c'est la STANDARDISTE ; les fondre reviendrait à
           *    composer un numéro qui ne répond pas la nuit. Voir la note sur
           *    `Farm.councilHotline`.
           */
          council_hotline: f.councilHotline ?? null,
          standby_phone: f.standbyPhone ?? null,
          site_access: f.siteAccess ?? null,
          gate_code: f.gateCode ?? null,
          parking: f.parking ?? null,
          terrain_notes: f.terrainNotes ?? null,
          signature: f.signature ?? null,
          signature_missing: f.signatureMissing ?? false,
          signature_origin: f.signatureOrigin ? JSON.stringify(f.signatureOrigin) : null,
          /* ★★ AG6 · AG4 — ce que l'agriculteur a renvoyé depuis son
             téléphone. Voir la migration 20260909000300 pour pourquoi les
             documents fournis sont une colonne `jsonb` et non une table fille,
             et pourquoi la photo de carte n'en est PAS un. */
          provided_documents: f.providedDocuments
            ? JSON.stringify(f.providedDocuments)
            : null,
          id_photo: f.idPhoto ?? null,
          /* ★★ AS1.5 — les contrats de terre. Envoyés en TABLEAU (pas en
             chaîne comme `provided_documents`) : le déclencheur
             `entities_land_documents_dispatch` lit `$[*].status` en jsonb. */
          land_documents: f.landDocuments && f.landDocuments.length > 0 ? f.landDocuments : null,
          /* ★ AK7 — l'archive : un instant et un motif, deux colonnes
             nullables. `?? null` comme les autres : « désarchivée » doit être
             une valeur que l'aller-retour porte, pas une clé omise. */
          archived_at: f.archivedAt ?? null,
          archive_reason: f.archiveReason ?? null,
        },
      ],
    },
    {
      table: 'entity_contacts',
      rows: f.contacts.map((c, position) => ({
        id: c.id,
        entity_id: f.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        role: c.role,
        photo: c.photo,
        is_primary: c.isPrimary,
        /* ★★ BA — la note d'un contact ; `position` est son RANG (0 = rang 1). */
        note: c.note ?? '',
        /* ★★ BC — la note restreint l'usage du téléphone. */
        restricts_calls: c.restrictsCalls ?? false,
        position,
      })),
    },
    {
      table: 'entity_commitments',
      rows: f.commitments.map((c, position) => ({
        id: `${f.id}:c${position}`,
        entity_id: f.id,
        kind: c.kind,
        detail: c.detail,
        fulfilled: c.fulfilled,
        position,
      })),
    },
    {
      table: 'entity_livestock',
      rows: (f.livestock ?? []).map((l, position) => ({
        id: `${f.id}:l${position}`,
        entity_id: f.id,
        kind: l.kind,
        label: l.label,
        heads: l.heads,
        position,
      })),
    },
    {
      table: 'agreements',
      rows: f.agreements.map((a, position) => ({
        id: a.id,
        entity_id: f.id,
        signed_at: a.signedAt,
        signed_by: a.signedBy,
        file_name: a.fileName,
        // P3.3 — null and not '' when unsigned: the column is nullable and the
        // domain field is `string | null | undefined`, so an empty string here
        // would come back as a signature that is a zero-length image.
        signature: a.signature ?? null,
        position,
      })),
    },
  ],
  fromRows: (p, kids): Farm => ({
    id: str(p.id),
    name: str(p.name),
    locality: str(p.locality),
    region: str(p.region),
    type: str(p.type, 'mixed') as Farm['type'],
    entityKind: str(p.entity_kind, 'farm') as Farm['entityKind'],
    status: str(p.status, 'to_contact') as Farm['status'],
    position: point(p.lat, p.lng),
    /**
     * ★★ AA2 (2026-09-07) — THE SINGLE-AREA MIGRATION, AND WHAT IT ACTUALLY
     *    HAD TO MOVE.
     *
     * The product owner asked for « migration sans perte de la surface unique
     * actuelle ». Said plainly, and it is worth saying rather than
     * implementing something that looks like work: this model has held the two
     * areas APART since G1 — `farm_dunams` and `grazing_dunams` are separate
     * columns and separate fields, and no row in this repository has ever
     * carried one figure. What AA2 changed is what they are CALLED (מעובד /
     * מרעה) and what they are used for (the 1:50 weighting), not where they
     * live, so there is nothing to move for a record written by this app.
     *
     * ⚠️ WHICH LEAVES THE ROW THAT DID NOT COME FROM THIS APP. A payload with
     *    a single `dunams` and neither of the two — an older snapshot, a hand-
     *    written seed, a table someone else built — is exactly the case the
     *    rule is for, and reading it as zero would silently lose the figure.
     *    `splitLegacyDunams` files it by the entity's own type and REFUSES to
     *    guess for a mixed holding, because a split nobody measured would
     *    become a funding number nobody measured.
     */
    ...legacyAreas(p),
    farmDunamsManual: bool(p.farm_dunams_manual),
    grazingDunamsManual: bool(p.grazing_dunams_manual),
    contacts: ordered(kids.entity_contacts).map(
      (r): FarmContact => ({
        id: str(r.id),
        name: str(r.name),
        phone: str(r.phone),
        email: str(r.email),
        role: str(r.role),
        photo: nullableStr(r.photo),
        isPrimary: bool(r.is_primary),
        /* ★★ BA — absente plutôt que vide : l'aller-retour reste une identité. */
        ...(str(r.note) !== '' ? { note: str(r.note) } : {}),
        ...(r.restricts_calls === true ? { restrictsCalls: true } : {}),
      }),
    ),
    commitments: ordered(kids.entity_commitments).map(
      (r): FarmCommitment => ({
        kind: str(r.kind, 'other') as FarmCommitment['kind'],
        detail: str(r.detail),
        fulfilled: bool(r.fulfilled),
      }),
    ),
    /**
     * ★ `undefined` WHEN THERE ARE NO ROWS, NOT `[]`, and it is the same
     *   distinction the whole feature turns on: absent means nobody has been
     *   asked, and `totalHeads` returns null for it so the dashboard and the
     *   report can stay silent rather than state a zero nobody established.
     *   An empty array would round-trip as "asked, and the answer was none".
     */
    livestock:
      ordered(kids.entity_livestock).length === 0
        ? undefined
        : ordered(kids.entity_livestock).map(
            (r): LivestockLine => ({
              kind: str(r.kind, 'other') as LivestockLine['kind'],
              label: str(r.label),
              heads: num(r.heads),
            }),
          ),
    agreements: ordered(kids.agreements).map(
      (r): Agreement => ({
        id: str(r.id),
        signedAt: ts(r.signed_at),
        signedBy: str(r.signed_by),
        fileName: str(r.file_name),
        signature: nullableStr(r.signature),
      }),
    ),
    notes: str(p.notes),
    lastVisitAt: tsOrNull(p.last_visit_at),
    nextVisitAt: tsOrNull(p.next_visit_at),
    photo: nullableStr(p.photo),
    /**
     * AA2 · AA5 — the prospection columns.
     *
     * ⚠️ ABSENT COMES BACK AS `undefined`, NOT AS `''` OR `null`, and that is
     *    what makes the round trip an identity. Every one of these fields is
     *    optional on `Farm`; a farm that has never been asked its חקלאי has no
     *    key at all, and `str()`'s helpful `''` would turn "not asked" into
     *    "asked, and the answer was blank" on the way back — which is the
     *    exact distinction AA2bis is built on and which `bun run mapping`
     *    catches to the byte. A value that IS an empty string, typed and
     *    cleared in the form, still round-trips as an empty string.
     */
    localityCode: optNum(p.locality_code),
    council: optStr(p.council),
    councilPhone: optStr(p.council_phone),
    localityKind: optStr(p.locality_kind),
    priority: optNum(p.priority),
    positionMissing: p.position_missing === true ? true : undefined,
    localityRelation:
      p.locality_relation === 'in' || p.locality_relation === 'attached' ? p.locality_relation : undefined,
    legalEntity: optStr(p.legal_entity),
    landAgreement: optStr(p.land_agreement),
    landAgreementUntil: optStr(p.land_agreement_until),
    farmerName: optStr(p.farmer_name),
    farmerPhone: optStr(p.farmer_phone),
    /* ★★ BA — seul « non établi » est porté ; établi = absent. */
    ...(p.contact_established === false ? { contactEstablished: false } : {}),
    /* ★★ BC — absentes tant que rien n'est dit : l'aller-retour reste une identité. */
    ...(optStr(p.nearest_locality) ? { nearestLocality: optStr(p.nearest_locality) } : {}),
    ...(p.nearest_locality_manual === true ? { nearestLocalityManual: true } : {}),
    ...(normalizeBranches(p.branches).length > 0 ? { branches: normalizeBranches(p.branches) } : {}),
    farmerEmail: optStr(p.farmer_email),
    farmerId: optStr(p.farmer_id_no),
    liaisonName: optStr(p.liaison_name),
    liaisonPhone: optStr(p.liaison_phone),
    // AC1 · AC2.4 · AC3.
    farmName: optStr(p.farm_name),
    umbrella: optStr(p.umbrella_org),
    guardedDunams: optNum(p.guarded_dunams),
    /* ⚠️ `undefined` AND NOT `false` WHEN ABSENT, exactly as `positionMissing`
       is: `guardedDunamsOf` reads absent and false alike, and only one of the
       two is what a record that has never been answered for actually holds —
       which is what keeps `bun run mapping`'s round trip an identity. */
    guardedDunamsManual: p.guarded_dunams_manual === true ? true : undefined,
    /* AD2.2 — absentes tant que personne n'a tranché ; `areaGap` lit les deux
       ensemble et n'accepte que la paire complète. */
    areaGapAcceptedDeclared: optNum(p.area_gap_declared),
    areaGapAcceptedMeasured: optNum(p.area_gap_measured),
    /* AE2 — absents tant que personne n'a renseigné ; `optStr` rend `undefined`
       et non `''`, ce qui est ce qui garde l'aller-retour de `bun run mapping`
       une identité. */
    councilHotline: optStr(p.council_hotline),
    standbyPhone: optStr(p.standby_phone),
    siteAccess: optStr(p.site_access),
    gateCode: optStr(p.gate_code),
    parking: optStr(p.parking),
    terrainNotes: optStr(p.terrain_notes),
    // AA5 — the imported signature and where it came from.
    signature: optStr(p.signature),
    signatureMissing: p.signature_missing === true ? true : undefined,
    signatureOrigin: readSignatureOrigin(p.signature_origin),
    // AG6 · AG4 — et le retour de l'agriculteur.
    providedDocuments: readProvidedDocuments(p.provided_documents),
    idPhoto: optStr(p.id_photo),
    landDocuments: readLandDocuments(p.land_documents),
    /* AK7 — absente tant que rien n'a été archivé ; `null` est « désarchivée »
       et c'est une valeur que l'aller-retour doit porter (voir `toRows`). */
    /* `undefined` quand la colonne est vide — comme `positionMissing` : « pas
       archivée » et « désarchivée » sont le même fait, et l'aller-retour de
       `bun run mapping` doit rester une identité. */
    archivedAt: p.archived_at == null ? undefined : ts(p.archived_at),
    archiveReason: optStr(p.archive_reason),
  }),
}

/**
 * ★★ AG6 — les documents fournis, relus depuis la colonne `jsonb`.
 *
 * ⚠️ ET UNE CELLULE ABÎMÉE REND `undefined`, JAMAIS UNE EXCEPTION — exactement
 *    la même règle que `readSignatureOrigin` ci-dessous, et pour la même
 *    raison : ceci tourne sur chaque ligne de chaque instantané, et une cellule
 *    illisible ne doit pas emporter la synchronisation entière. Une fiche dont
 *    les documents sont illisibles est une fiche dont on ne sait pas ce qui a
 *    été fourni — ce qui est déjà ce que `undefined` veut dire ici, et ce qui
 *    la remet dans la file plutôt que de l'en sortir à tort.
 */
/** ★★ AS1.5 — tableau jsonb, ou sa forme en chaîne (tolérée), ou rien. */
function readLandDocuments(raw: unknown): Farm['landDocuments'] {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw) as unknown
    } catch {
      return undefined
    }
  }
  if (!Array.isArray(value)) return undefined
  const rows = value.filter(
    (d): d is NonNullable<Farm['landDocuments']>[number] =>
      !!d && typeof d === 'object' && typeof (d as { id?: unknown }).id === 'string',
  )
  return rows.length > 0 ? rows : undefined
}

function readProvidedDocuments(raw: unknown): Farm['providedDocuments'] {
  const value =
    typeof raw === 'string'
      ? (() => {
          try {
            return JSON.parse(raw) as unknown
          } catch {
            return null
          }
        })()
      : raw
  if (!Array.isArray(value)) return undefined
  const rows = value.filter(
    (d): d is NonNullable<Farm['providedDocuments']>[number] =>
      !!d &&
      typeof d === 'object' &&
      ((d as { id?: unknown }).id === 'crops' || (d as { id?: unknown }).id === 'grazing'),
  )
  return rows.length > 0 ? rows : undefined
}

/**
 * AA5.4 — the origin travels as one JSON column rather than three.
 *
 * ⚠️ AND A MALFORMED ONE IS `undefined`, NEVER A THROW. This runs on every row
 *    of every snapshot; one bad cell must not take the whole sync down, and a
 *    farm whose provenance is unreadable is a farm whose provenance is
 *    unknown — which is what `undefined` already means here.
 */
/** AA2 — see the note in the farm's `fromRows`: absent stays absent. */
const optStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const optNum = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined)

function legacyAreas(p: Row): { farmDunams: number; grazingDunams: number } {
  if (p.farm_dunams === undefined && p.grazing_dunams === undefined) {
    return splitLegacyDunams(num(p.dunams), str(p.type, 'mixed') as Farm['type'])
  }
  return { farmDunams: num(p.farm_dunams), grazingDunams: num(p.grazing_dunams) }
}

function readSignatureOrigin(raw: unknown): Farm['signatureOrigin'] {
  if (raw && typeof raw === 'object') return raw as Farm['signatureOrigin']
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  try {
    const parsed = JSON.parse(raw) as Farm['signatureOrigin']
    return parsed && typeof parsed === 'object' ? parsed : undefined
  } catch {
    return undefined
  }
}

// ===========================================================================
// Ground
// ===========================================================================

const farmZoneMapping: Mapping<FarmZone> = {
  table: 'zones',
  children: [{ table: 'zone_vertices', fk: 'zone_id' }],
  toRows: (z) => [
    { table: 'zones', rows: [{ id: z.id, entity_id: z.farmId, kind: z.kind }] },
    { table: 'zone_vertices', rows: ringRows('zone_id', z.id, z.ring) },
  ],
  fromRows: (p, kids): FarmZone => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    kind: str(p.kind, 'farm_boundary') as FarmZone['kind'],
    ring: ringOf(kids.zone_vertices),
  }),
}

const anchorMapping: Mapping<AnchorPoint> = {
  table: 'guard_posts',
  children: [],
  toRows: (a) => [
    {
      table: 'guard_posts',
      rows: [
        {
          id: a.id,
          entity_id: a.farmId,
          name: a.name,
          lat: a.position.lat,
          lng: a.position.lng,
          instructions: a.instructions,
          access_description: a.accessDescription,
        },
      ],
    },
  ],
  fromRows: (p): AnchorPoint => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    name: str(p.name),
    position: point(p.lat, p.lng),
    instructions: strings(p.instructions),
    accessDescription: str(p.access_description),
  }),
}

// --- G18: the sensitive layer ---------------------------------------------

const threatZoneMapping: Mapping<StoreData['threatZones'][number]> = {
  table: 'threat_zones',
  children: [{ table: 'threat_zone_vertices', fk: 'threat_zone_id' }],
  toRows: (z) => [
    {
      table: 'threat_zones',
      rows: [
        {
          id: z.id,
          entity_id: z.farmId,
          intensity: z.intensity,
          note: z.note,
          updated_at: z.updatedAt,
        },
      ],
    },
    { table: 'threat_zone_vertices', rows: ringRows('threat_zone_id', z.id, z.ring) },
  ],
  fromRows: (p, kids) => ({
    id: str(p.id),
    farmId: nullableStr(p.entity_id),
    ring: ringOf(kids.threat_zone_vertices),
    intensity: str(p.intensity, 'medium') as 'low' | 'medium' | 'high',
    note: str(p.note),
    updatedAt: ts(p.updated_at),
  }),
}

const threatVectorMapping: Mapping<StoreData['threatVectors'][number]> = {
  table: 'threat_vectors',
  children: [],
  toRows: (v) => [
    {
      table: 'threat_vectors',
      rows: [
        {
          id: v.id,
          entity_id: v.farmId,
          origin_lat: v.origin.lat,
          origin_lng: v.origin.lng,
          target_lat: v.target.lat,
          target_lng: v.target.lng,
          intensity: v.intensity,
          note: v.note,
          updated_at: v.updatedAt,
        },
      ],
    },
  ],
  fromRows: (p) => ({
    id: str(p.id),
    farmId: nullableStr(p.entity_id),
    origin: point(p.origin_lat, p.origin_lng),
    target: point(p.target_lat, p.target_lng),
    intensity: str(p.intensity, 'medium') as 'low' | 'medium' | 'high',
    note: str(p.note),
    updatedAt: ts(p.updated_at),
  }),
}

// ===========================================================================
// People
// ===========================================================================

const volunteerMapping: Mapping<Volunteer> = {
  table: 'volunteers',
  children: [],
  toRows: (v) => [
    {
      table: 'volunteers',
      rows: [
        {
          id: v.id,
          name: v.name,
          age: v.age,
          phone: v.phone,
          phone_type: v.phoneType,
          email: v.email,
          yeshiva: v.yeshiva,
          institution_id: v.institutionId ?? null,
          ride_with: v.rideWith ?? null,
          locality: v.locality,
          guards_count: v.guardsCount,
          status: v.status,
          inactive_reason: v.inactiveReason,
          notes: v.notes,
          last_activity_at: v.lastActivityAt,
          photo: v.photo,
          has_license: v.hasLicense,
          has_car: v.hasCar,
          can_drive: v.canDrive,
          avail_nights: v.availability.nights,
          avail_days: v.availability.days,
          avail_weekends: v.availability.weekends,
          avail_excluded: v.availability.excludedDates,
        },
      ],
    },
  ],
  fromRows: (p): Volunteer => ({
    id: str(p.id),
    name: str(p.name),
    age: num(p.age, 20),
    phone: str(p.phone),
    phoneType: str(p.phone_type, 'smartphone') as Volunteer['phoneType'],
    email: str(p.email),
    yeshiva: str(p.yeshiva),
    // ★ AW2 — absent tant qu'aucune institution n'est rattachée (fiches d'avant AW).
    ...(p.institution_id ? { institutionId: str(p.institution_id) } : {}),
    ...(p.ride_with ? { rideWith: str(p.ride_with) } : {}),
    locality: str(p.locality),
    guardsCount: num(p.guards_count),
    status: str(p.status, 'active') as Volunteer['status'],
    inactiveReason: nullableStr(p.inactive_reason),
    notes: str(p.notes),
    lastActivityAt: tsOrNull(p.last_activity_at),
    photo: nullableStr(p.photo),
    hasLicense: bool(p.has_license),
    hasCar: bool(p.has_car),
    canDrive: bool(p.can_drive),
    availability: {
      nights: p.avail_nights === undefined ? DEFAULT_AVAILABILITY.nights : bool(p.avail_nights),
      days: p.avail_days === undefined ? DEFAULT_AVAILABILITY.days : bool(p.avail_days),
      weekends:
        p.avail_weekends === undefined ? DEFAULT_AVAILABILITY.weekends : bool(p.avail_weekends),
      excludedDates: strings(p.avail_excluded).map((d) => d.slice(0, 10)),
    },
  }),
}

const driverMapping: Mapping<Driver> = {
  table: 'drivers',
  children: [],
  toRows: (d) => [
    {
      table: 'drivers',
      rows: [
        {
          id: d.id,
          name: d.name,
          phone: d.phone,
          email: d.email,
          vehicle: d.vehicle,
          seats: d.seats,
          locality: d.locality,
          photo: d.photo,
          availability_note: d.availabilityNote,
          notes: d.notes,
          volunteer_id: d.volunteerId,
        },
      ],
    },
  ],
  fromRows: (p): Driver => ({
    id: str(p.id),
    name: str(p.name),
    phone: str(p.phone),
    email: str(p.email),
    vehicle: str(p.vehicle),
    seats: num(p.seats, 4),
    locality: str(p.locality),
    photo: nullableStr(p.photo),
    availabilityNote: str(p.availability_note),
    notes: str(p.notes),
    volunteerId: nullableStr(p.volunteer_id),
  }),
}

// ===========================================================================
// Missions — the deep one
// ===========================================================================
//
// R6's presence marks are ROWS, one per person per leg per channel, and the
// `null` in a `LegConfirmation` is the ABSENCE of a row rather than a row
// holding null. That is what makes a mark an append the outbox can replay
// without read-modify-writing a record two other people are also touching —
// so the mapping back has to reconstitute the three-slot object from however
// few rows arrived.

const LEGS = ['outbound', 'inbound'] as const
const SOURCES = ['driver', 'group', 'self'] as const

const missionMapping: Mapping<Mission> = {
  table: 'missions',
  children: [
    { table: 'mission_guard_posts', fk: 'mission_id' },
    { table: 'mission_assignments', fk: 'mission_id' },
    { table: 'presence_marks', fk: 'mission_id' },
    { table: 'mission_drivers', fk: 'mission_id' },
    { table: 'mission_driver_passengers', fk: 'mission_id' },
    /* AE3.3 — les signes de vie de la nuit, un par ligne, dans l'ordre. */
    { table: 'mission_checkpoints', fk: 'mission_id' },
    { table: 'cancel_notices', fk: 'mission_id' },
  ],
  toRows: (m) => {
    const marks: Row[] = []
    for (const a of m.assignments) {
      for (const leg of LEGS) {
        for (const source of SOURCES) {
          const mark = a[leg][source]
          if (mark === null) continue
          marks.push({
            mission_id: m.id,
            volunteer_id: a.volunteerId,
            leg,
            source,
            mark,
          })
        }
      }
    }
    const passengers: Row[] = []
    for (const d of m.drivers) {
      d.passengerVolunteerIds.forEach((volunteerId, position) => {
        passengers.push({
          mission_id: m.id,
          driver_id: d.driverId,
          volunteer_id: volunteerId,
          position,
        })
      })
    }
    return [
      {
        table: 'missions',
        rows: [
          {
            id: m.id,
            entity_id: m.farmId,
            guard_post_id: m.anchorPointId,
            start_at: m.startAt,
            end_at: m.endAt,
            status: m.status,
            required_volunteers: m.requiredVolunteers,
            pickup_lat: m.pickupPoint?.lat ?? null,
            pickup_lng: m.pickupPoint?.lng ?? null,
            dropoff_lat: m.dropoffPoint?.lat ?? null,
            dropoff_lng: m.dropoffPoint?.lng ?? null,
            return_pickup_lat: m.returnPickupPoint?.lat ?? null,
            return_pickup_lng: m.returnPickupPoint?.lng ?? null,
            return_dropoff_lat: m.returnDropoffPoint?.lat ?? null,
            return_dropoff_lng: m.returnDropoffPoint?.lng ?? null,
            arrival_confirmed_at: m.arrivalConfirmedAt,
            end_confirmed_at: m.endConfirmedAt,
            dropped_off_at: m.droppedOffAt,
            picked_up_at: m.pickedUpAt,
            completed_at: m.completedAt,
            cancelled_at: m.cancelledAt,
            cancel_reason: m.cancelReason,
            cancel_note: m.cancelNote,
            reactivated_at: m.reactivatedAt,
            created_at: m.createdAt,
          },
        ],
      },
      {
        /**
         * ★★ AE3.3 — UNE LIGNE PAR POINT DE CONTRÔLE, PAS UNE COLONNE
         *    « dernier signe ».
         *
         * Une colonne unique répondrait à « depuis quand est-il silencieux »
         * et à rien d'autre. La question que le coordinateur pose au matin est
         * « combien de fois a-t-il donné signe », et celle que l'association
         * pose au mois est « est-ce que ce dispositif sert ». Les deux sont des
         * questions sur des lignes.
         */
        table: 'mission_checkpoints',
        rows: (m.checkpoints ?? []).map((at, position) => ({
          mission_id: m.id,
          at,
          position,
        })),
      },
      {
        table: 'mission_guard_posts',
        rows: m.additionalAnchorPointIds.map((guardPostId, position) => ({
          mission_id: m.id,
          guard_post_id: guardPostId,
          position,
          starts_at: null,
          ends_at: null,
        })),
      },
      {
        table: 'mission_assignments',
        rows: m.assignments.map((a, position) => ({
          mission_id: m.id,
          volunteer_id: a.volunteerId,
          is_group_phone: a.isGroupPhone,
          position,
        })),
      },
      { table: 'presence_marks', rows: marks },
      {
        table: 'mission_drivers',
        rows: m.drivers.map((d, position) => ({
          mission_id: m.id,
          driver_id: d.driverId,
          confirmed: d.confirmed,
          position,
        })),
      },
      { table: 'mission_driver_passengers', rows: passengers },
      {
        table: 'cancel_notices',
        rows: m.outreach.map((n) => ({
          mission_id: m.id,
          event: n.event,
          recipient_kind: n.recipientKind,
          recipient_id: n.recipientId,
          sent_at: n.sentAt,
        })),
      },
    ]
  },
  fromRows: (p, kids): Mission => {
    const missionId = str(p.id)

    const legs = new Map<string, { outbound: LegConfirmation; inbound: LegConfirmation }>()
    const legsFor = (volunteerId: string) => {
      let entry = legs.get(volunteerId)
      if (!entry) {
        entry = { outbound: { ...EMPTY_LEG }, inbound: { ...EMPTY_LEG } }
        legs.set(volunteerId, entry)
      }
      return entry
    }
    for (const r of kids.presence_marks ?? []) {
      const leg = str(r.leg) as (typeof LEGS)[number]
      const source = str(r.source) as (typeof SOURCES)[number]
      if (!LEGS.includes(leg) || !SOURCES.includes(source)) continue
      legsFor(str(r.volunteer_id))[leg][source] = str(r.mark) as PresenceMark
    }

    const passengersByDriver = new Map<string, Row[]>()
    for (const r of kids.mission_driver_passengers ?? []) {
      const key = str(r.driver_id)
      passengersByDriver.set(key, [...(passengersByDriver.get(key) ?? []), r])
    }

    return {
      id: missionId,
      farmId: str(p.entity_id),
      anchorPointId: str(p.guard_post_id),
      additionalAnchorPointIds: ordered(kids.mission_guard_posts).map((r) =>
        str(r.guard_post_id),
      ),
      /* AE3.3 — relus dans l'ordre écrit, jamais retriés par la date : c'est
         `position` qui porte l'ordre, comme pour les quatre autres enfants. */
      checkpoints: ordered(kids.mission_checkpoints).map((r) => ts(r.at)),
      pickupPoint: pointOrNull(p.pickup_lat, p.pickup_lng),
      dropoffPoint: pointOrNull(p.dropoff_lat, p.dropoff_lng),
      returnPickupPoint: pointOrNull(p.return_pickup_lat, p.return_pickup_lng),
      returnDropoffPoint: pointOrNull(p.return_dropoff_lat, p.return_dropoff_lng),
      startAt: ts(p.start_at),
      endAt: ts(p.end_at),
      status: str(p.status, 'recruiting') as Mission['status'],
      requiredVolunteers: num(p.required_volunteers, 2),
      assignments: ordered(kids.mission_assignments).map((r): MissionAssignment => {
        const volunteerId = str(r.volunteer_id)
        const entry = legsFor(volunteerId)
        return {
          volunteerId,
          isGroupPhone: bool(r.is_group_phone),
          outbound: entry.outbound,
          inbound: entry.inbound,
        }
      }),
      drivers: ordered(kids.mission_drivers).map((r): MissionDriver => {
        const driverId = str(r.driver_id)
        return {
          driverId,
          passengerVolunteerIds: ordered(passengersByDriver.get(driverId)).map((x) =>
            str(x.volunteer_id),
          ),
          confirmed: bool(r.confirmed),
        }
      }),
      arrivalConfirmedAt: tsOrNull(p.arrival_confirmed_at),
      endConfirmedAt: tsOrNull(p.end_confirmed_at),
      createdAt: ts(p.created_at),
      droppedOffAt: tsOrNull(p.dropped_off_at),
      pickedUpAt: tsOrNull(p.picked_up_at),
      completedAt: tsOrNull(p.completed_at),
      cancelledAt: tsOrNull(p.cancelled_at),
      cancelReason: (nullableStr(p.cancel_reason) as Mission['cancelReason']) ?? null,
      cancelNote: str(p.cancel_note),
      outreach: (kids.cancel_notices ?? []).map(
        (r): OutreachNotice => ({
          event: str(r.event, 'cancelled') as OutreachNotice['event'],
          recipientKind: str(r.recipient_kind, 'volunteer') as OutreachNotice['recipientKind'],
          recipientId: str(r.recipient_id),
          sentAt: tsOrNull(r.sent_at),
        }),
      ),
      reactivatedAt: tsOrNull(p.reactivated_at),
    }
  },
}

// ===========================================================================
// Incidents, visits, meetings, tours
// ===========================================================================

const incidentMapping: Mapping<Incident> = {
  table: 'incidents',
  children: [{ table: 'incident_entries', fk: 'incident_id' }],
  toRows: (i) => [
    {
      table: 'incidents',
      rows: [
        {
          id: i.id,
          entity_id: i.farmId,
          mission_id: i.missionId,
          source: i.source,
          reporter_id: i.reporterId,
          reporter_name: i.reporterName,
          severity: i.severity,
          description: i.description,
          lat: i.position?.lat ?? null,
          lng: i.position?.lng ?? null,
          reported_at: i.reportedAt,
          resolved: i.resolved,
        },
      ],
    },
    {
      table: 'incident_entries',
      rows: i.entries.map((e, position) => ({
        id: e.id,
        incident_id: i.id,
        at: e.at,
        author: e.author,
        text: e.text,
        position,
      })),
    },
  ],
  fromRows: (p, kids): Incident => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    missionId: nullableStr(p.mission_id),
    source: str(p.source, 'coordinator') as Incident['source'],
    reporterId: nullableStr(p.reporter_id),
    reporterName: str(p.reporter_name),
    severity: str(p.severity, 'observation') as Incident['severity'],
    description: str(p.description),
    position: pointOrNull(p.lat, p.lng),
    reportedAt: ts(p.reported_at),
    resolved: bool(p.resolved),
    entries: ordered(kids.incident_entries).map(
      (r): IncidentEntry => ({
        id: str(r.id),
        at: ts(r.at),
        author: str(r.author),
        text: str(r.text),
      }),
    ),
  }),
}

const farmVisitMapping: Mapping<FarmVisit> = {
  table: 'farm_visits',
  children: [],
  toRows: (v) => [
    {
      table: 'farm_visits',
      rows: [
        {
          id: v.id,
          entity_id: v.farmId,
          at: v.at,
          note: v.note,
          done: v.done,
          remind_minutes: v.remindMinutes ?? null,
          /* AP3.6 — un rendez-vous demandé depuis la page publique tant que le
             PO ne l'a pas confirmé. `?? false` et non `?? null` : la colonne
             est `not null default false`. */
          pending_confirmation: v.pendingConfirmation ?? false,
        },
      ],
    },
  ],
  fromRows: (p): FarmVisit => ({
    id: str(p.id),
    farmId: str(p.entity_id),
    at: ts(p.at),
    note: str(p.note),
    done: bool(p.done),
    remindMinutes: typeof p.remind_minutes === 'number' ? p.remind_minutes : undefined,
    pendingConfirmation: p.pending_confirmation === true ? true : undefined,
  }),
}

const generalMeetingMapping: Mapping<GeneralMeeting> = {
  table: 'general_meetings',
  children: [],
  toRows: (m) => [
    {
      table: 'general_meetings',
      rows: [
        {
          id: m.id,
          title: m.title,
          at: m.at,
          end_at: m.endAt,
          location: m.location,
          person: m.person,
          note: m.note,
          /* AF3.1 · AF4.2 — le point collé et l'alerte. `?? null` fait de
             « effacé » une valeur que l'aller-retour porte, comme pour les
             champs de prospection. */
          lat: m.position?.lat ?? null,
          lng: m.position?.lng ?? null,
          remind_minutes: m.remindMinutes ?? null,
          /* AS6.6 — la piste dont ce rendez-vous est né. */
          lead_id: m.leadId ?? null,
          /* ★★ BE — l'institution ou la ferme reliée (liens souples). */
          institution_id: m.institutionId ?? null,
          entity_id: m.farmId ?? null,
        },
      ],
    },
  ],
  fromRows: (p): GeneralMeeting => ({
    id: str(p.id),
    title: str(p.title),
    at: ts(p.at),
    endAt: ts(p.end_at),
    location: str(p.location),
    person: str(p.person),
    note: str(p.note),
    /* ⚠️ `undefined` ET NON `null` QUAND LA COLONNE EST VIDE, exactement comme
       `guardedDunamsManual` : `bun run mapping` exige que l'aller-retour soit
       une IDENTITÉ, et une fiche à qui l'on n'a jamais posé la question porte
       `undefined`. Les deux se lisent pareil en aval (`?? null`). */
    position:
      typeof p.lat === 'number' && typeof p.lng === 'number'
        ? { lat: p.lat, lng: p.lng }
        : undefined,
    remindMinutes: typeof p.remind_minutes === 'number' ? p.remind_minutes : undefined,
    leadId: typeof p.lead_id === 'string' ? p.lead_id : undefined,
    /* ★★ BE — absents quand la colonne est vide : l'aller-retour reste une identité. */
    ...(typeof p.institution_id === 'string' ? { institutionId: p.institution_id } : {}),
    ...(typeof p.entity_id === 'string' ? { farmId: p.entity_id } : {}),
  }),
}

/**
 * ★★ AS6 — les pistes. Une table, aucune fille. Le point est deux colonnes
 * nullables comme pour `general_meetings` ; `null` est une vraie réponse.
 */
const leadMapping: Mapping<Lead> = {
  table: 'leads',
  children: [],
  toRows: (l) => [
    {
      table: 'leads',
      rows: [
        {
          id: l.id,
          name: l.name,
          contact_name: l.contactName,
          phone: l.phone,
          email: l.email ?? '',
          place: l.place,
          lat: l.position?.lat ?? null,
          lng: l.position?.lng ?? null,
          region_id: l.regionId,
          status: l.status,
          notes: l.notes,
          source: l.source,
          raw: l.raw,
          rank: l.rank,
          converted_farm_id: l.convertedFarmId,
          converted_at: l.convertedAt,
          photo: l.photo ?? null,
          branches: l.branches ?? [],
          created_at: l.createdAt,
          updated_at: l.updatedAt,
        },
      ],
    },
  ],
  fromRows: (p): Lead => ({
    id: str(p.id),
    name: str(p.name),
    contactName: str(p.contact_name),
    phone: str(p.phone),
    email: str(p.email),
    place: str(p.place),
    position: typeof p.lat === 'number' && typeof p.lng === 'number' ? { lat: p.lat, lng: p.lng } : null,
    regionId: typeof p.region_id === 'string' && p.region_id !== '' ? (p.region_id as Lead['regionId']) : null,
    /* AT2.5 — deux anciens statuts replis à la lecture. */
    status: normalizeLeadStatus(str(p.status)),
    notes: str(p.notes),
    source: str(p.source) as Lead['source'],
    raw: str(p.raw),
    rank: typeof p.rank === 'number' ? p.rank : 0,
    convertedFarmId: typeof p.converted_farm_id === 'string' ? p.converted_farm_id : null,
    convertedAt: typeof p.converted_at === 'string' ? ts(p.converted_at) : null,
    ...(typeof p.photo === 'string' && p.photo !== '' ? { photo: p.photo } : {}),
    ...(normalizeBranches(p.branches).length > 0 ? { branches: normalizeBranches(p.branches) } : {}),
    createdAt: ts(p.created_at),
    updatedAt: ts(p.updated_at),
  }),
}

/**
 * ★★ AU3 — les institutions. Une table, aucune fille. Le point est deux
 * colonnes nullables (`null` = hors carte) ; `position_uncertain` le marque à
 * vérifier (AU3.4).
 */
const institutionMapping: Mapping<Institution> = {
  table: 'institutions',
  children: [],
  toRows: (i) => [
    {
      table: 'institutions',
      rows: [
        {
          id: i.id,
          name: i.name,
          locality: i.locality,
          kind: i.kind,
          audience: i.audience,
          network: i.network,
          lat: i.position?.lat ?? null,
          lng: i.position?.lng ?? null,
          position_uncertain: i.positionUncertain,
          engagement: i.engagement,
          contact_name: i.contactName,
          contact_phone: i.contactPhone,
          contacts: i.contacts ?? [],
          minors_age_min: i.minorsAge?.min ?? null,
          minors_age_max: i.minorsAge?.max ?? null,
          notes: i.notes,
          extra: i.extra,
          source: i.source,
          engagement_confirmed: i.engagementConfirmed,
          met_on: i.metOn,
          students: i.students,
          position_source: i.positionSource,
          aliases: i.aliases,
          /* ★★ BD — l'adresse du lieu ; le secrétariat est une entrée de `contacts`.
             ★★ BB — la coordination préalable, les fiches liées. */
          address: i.address ?? '',
          coordination_required: i.coordinationRequired === true,
          coordination_note: i.coordinationNote ?? '',
          related_ids: i.relatedIds ?? [],
          created_at: i.createdAt,
          updated_at: i.updatedAt,
        },
      ],
    },
  ],
  /* ★★ AZ5 — `settleInstitution` : une ligne d'avant AZ5 (sans `contacts`)
     garde sa personne comme « איש קשר », jamais promue rang 1. */
  /* ★★ BD — une ligne qui porte encore `office_phone` / `office_address` (avant
     la migration de BD) est REPLIÉE à la lecture : le numéro devient une entrée
     « מזכירות » sans nom, l'adresse devient celle du lieu (`foldLegacyOffice`). */
  fromRows: (p): Institution => settleInstitution(foldLegacyOffice({
    id: str(p.id),
    name: str(p.name),
    locality: str(p.locality),
    kind: str(p.kind) as Institution['kind'],
    audience: str(p.audience) as Institution['audience'],
    network: str(p.network),
    position: typeof p.lat === 'number' && typeof p.lng === 'number' ? { lat: p.lat, lng: p.lng } : null,
    positionUncertain: p.position_uncertain === true,
    engagement: str(p.engagement) as Institution['engagement'],
    contactName: str(p.contact_name),
    contactPhone: str(p.contact_phone),
    notes: str(p.notes),
    extra: str(p.extra),
    source: str(p.source) as Institution['source'],
    /* AV1 — une ligne d'avant AV n'a pas la colonne : confirmée par défaut. */
    engagementConfirmed: p.engagement_confirmed !== false,
    metOn: typeof p.met_on === 'string' && p.met_on !== '' ? p.met_on.slice(0, 10) : null,
    students: typeof p.students === 'number' ? p.students : null,
    positionSource: str(p.position_source),
    aliases: str(p.aliases),
    /* ★★ BB — présents seulement quand ils portent quelque chose : une ligne
       d'avant BB (ou vide) fait l'aller-retour à l'identique. */
    ...(str(p.address) ? { address: str(p.address) } : {}),
    ...(p.coordination_required === true ? { coordinationRequired: true } : {}),
    ...(str(p.coordination_note) ? { coordinationNote: str(p.coordination_note) } : {}),
    ...(Array.isArray(p.related_ids) && p.related_ids.length > 0 ? { relatedIds: p.related_ids.filter((x): x is string => typeof x === 'string') } : {}),
    createdAt: ts(p.created_at),
    updatedAt: ts(p.updated_at),
    ...(typeof p.minors_age_min === 'number' && typeof p.minors_age_max === 'number' ? { minorsAge: { min: p.minors_age_min, max: p.minors_age_max } } : {}),
    contacts: readInstitutionContacts(p.contacts),
  }, str(p.office_phone), str(p.office_address))),
}

const CONTACT_ROLES = new Set<string>(INSTITUTION_CONTACT_ROLES)
function readInstitutionContacts(raw: unknown): InstitutionContact[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c, n) => ({
      id: str(c.id) || `ic-${n + 1}`,
      role: (CONTACT_ROLES.has(str(c.role)) ? str(c.role) : 'contact') as InstitutionContact['role'],
      name: str(c.name),
      phone: str(c.phone),
      note: str(c.note),
      /* ★★ BG — le mail ; absent tant qu'il n'est pas saisi. */
      ...(str(c.email).trim() !== '' ? { email: str(c.email).trim() } : {}),
      /* ★★ BC — la note restreint l'usage du téléphone ; absent = appel ordinaire. */
      ...(c.restrictsCalls === true ? { restrictsCalls: true } : {}),
      /* ★★ BB — plusieurs numéros ; absent sur une ligne d'avant BB. */
      ...(Array.isArray(c.phones)
        ? {
            phones: (c.phones as unknown[])
              .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
              /* ★★ BD — toute étiquette saisie est gardée (liste ouverte), au plus 24 signes. */
              .map((x) => ({ number: str(x.number), label: str(x.label).trim().slice(0, 24) as PhoneLabel })),
          }
        : {}),
    }))
}

/** ★★ AV2 — les points de repère. Une table, aucune fille. */
const landmarkMapping: Mapping<Landmark> = {
  table: 'landmarks',
  children: [],
  toRows: (l) => [
    {
      table: 'landmarks',
      rows: [{ id: l.id, name: l.name, lat: l.position.lat, lng: l.position.lng, note: l.note, created_at: l.createdAt, updated_at: l.updatedAt }],
    },
  ],
  fromRows: (p): Landmark => ({
    id: str(p.id),
    name: str(p.name),
    position: { lat: Number(p.lat), lng: Number(p.lng) },
    note: str(p.note),
    createdAt: ts(p.created_at),
    updatedAt: ts(p.updated_at),
  }),
}

// ===========================================================================
// ★★ BE (2026-10-13) — les listes de tâches, les tâches, l'aide-mémoire.
// Trois tables, aucune fille. Les liens d'une tâche sont SOUPLES (`link_kind`
// + `link_id`, sans clé étrangère) : une fiche supprimée ne supprime pas la
// tâche du PO.
// ===========================================================================

const taskListMapping: Mapping<TaskList> = {
  table: 'task_lists',
  children: [],
  toRows: (l) => [{ table: 'task_lists', rows: [{ id: l.id, name: l.name, rank: l.rank, created_at: l.createdAt, updated_at: l.updatedAt }] }],
  fromRows: (p): TaskList => ({ id: str(p.id), name: str(p.name), rank: num(p.rank), createdAt: ts(p.created_at), updatedAt: ts(p.updated_at) }),
}

const LINK_KINDS = new Set<string>(TASK_LINK_KINDS)

const taskMapping: Mapping<Task> = {
  table: 'tasks',
  children: [],
  toRows: (t) => [
    {
      table: 'tasks',
      rows: [
        {
          id: t.id,
          list_id: t.listId,
          title: t.title,
          note: t.note,
          rank: t.rank,
          link_kind: t.link?.kind ?? null,
          link_id: t.link?.id ?? null,
          due_on: t.dueOn,
          due_time: t.dueTime,
          done_at: t.doneAt,
          archived_at: t.archivedAt,
          created_at: t.createdAt,
          updated_at: t.updatedAt,
        },
      ],
    },
  ],
  fromRows: (p): Task => ({
    id: str(p.id),
    listId: str(p.list_id),
    title: str(p.title),
    note: str(p.note),
    rank: num(p.rank),
    link:
      LINK_KINDS.has(str(p.link_kind)) && str(p.link_id) !== ''
        ? { kind: str(p.link_kind) as TaskLinkKind, id: str(p.link_id) }
        : null,
    dueOn: typeof p.due_on === 'string' && p.due_on !== '' ? day(p.due_on) : null,
    dueTime: typeof p.due_time === 'string' && p.due_time !== '' ? p.due_time.slice(0, 5) : null,
    doneAt: tsOrNull(p.done_at),
    archivedAt: tsOrNull(p.archived_at),
    createdAt: ts(p.created_at),
    updatedAt: ts(p.updated_at),
  }),
}

const MEMO_BANKS_SET = new Set<string>(MEMO_BANK_KEYS)

const memoLineMapping: Mapping<MemoLine> = {
  table: 'memo_lines',
  children: [],
  toRows: (l) => [
    {
      table: 'memo_lines',
      rows: [{ id: l.id, bank: l.bank, section: l.section, he: l.he, fr: l.fr, rank: l.rank, created_at: l.createdAt, updated_at: l.updatedAt }],
    },
  ],
  fromRows: (p): MemoLine => ({
    id: str(p.id),
    bank: (MEMO_BANKS_SET.has(str(p.bank)) ? str(p.bank) : 'institutions') as MemoLine['bank'],
    section: (str(p.section) === 'say' ? 'say' : 'questions') as MemoLine['section'],
    he: str(p.he),
    fr: str(p.fr),
    rank: num(p.rank),
    createdAt: ts(p.created_at),
    updatedAt: ts(p.updated_at),
  }),
}

/**
 * ★★ BG — le parrainage. `created_by` est posé PAR LA BASE (`auth.uid()`, un
 * déclencheur qui le fixe à l'insertion et le garde ensuite) : le client
 * l'envoie tel qu'il l'a lu, `null` pour un lien neuf, et la base décide.
 */
const farmInstitutionLinkMapping: Mapping<FarmInstitutionLink> = {
  table: 'farm_institution_links',
  children: [],
  toRows: (l) => [
    {
      table: 'farm_institution_links',
      rows: [{ id: l.id, farm_id: l.farmId, institution_id: l.institutionId, created_at: l.createdAt, created_by: l.createdBy }],
    },
  ],
  fromRows: (p): FarmInstitutionLink => ({
    id: str(p.id),
    farmId: str(p.farm_id),
    institutionId: str(p.institution_id),
    createdAt: ts(p.created_at),
    createdBy: typeof p.created_by === 'string' && p.created_by !== '' ? p.created_by : null,
  }),
}

function planOf(raw: unknown): TourPlan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const out: TourPlan = {}
  if (Array.isArray(r.order)) out.order = r.order.filter((x): x is string => typeof x === 'string')
  if (typeof r.visitMinutes === 'number' && r.visitMinutes >= 0) out.visitMinutes = r.visitMinutes
  if (r.stopMinutes && typeof r.stopMinutes === 'object' && !Array.isArray(r.stopMinutes)) {
    const m: Record<string, number> = {}
    for (const [k, v] of Object.entries(r.stopMinutes as Record<string, unknown>)) if (typeof v === 'number' && v >= 0) m[k] = v
    if (Object.keys(m).length > 0) out.stopMinutes = m
  }
  const o = r.origin as Record<string, unknown> | undefined
  if (o && typeof o.lat === 'number' && typeof o.lng === 'number') out.origin = { lat: o.lat, lng: o.lng, label: typeof o.label === 'string' ? o.label : '' }
  return Object.keys(out).length > 0 ? out : null
}

const tourMapping: Mapping<Tour> = {
  table: 'tours',
  children: [{ table: 'tour_stops', fk: 'tour_id' }],
  toRows: (t) => [
    {
      table: 'tours',
      rows: [{ id: t.id, day_key: t.dayKey, depart_at: t.departAt, name: t.name ?? '', free_stops: t.freeStops ?? [], plan: t.plan ?? {} }],
    },
    {
      table: 'tour_stops',
      rows: t.farmIds.map((entityId, position) => ({
        tour_id: t.id,
        entity_id: entityId,
        position,
      })),
    },
  ],
  fromRows: (p, kids): Tour => ({
    id: str(p.id),
    dayKey: day(p.day_key),
    name: str(p.name),
    departAt: ts(p.depart_at),
    farmIds: ordered(kids.tour_stops).map((r) => str(r.entity_id)),
    /* ★★ AY12.2 — les points libres ; absents tant qu'il n'y en a aucun. */
    ...(Array.isArray(p.free_stops) && p.free_stops.length > 0
      ? {
          freeStops: (p.free_stops as Array<Record<string, unknown>>)
            .filter((f) => typeof f.lat === 'number' && typeof f.lng === 'number')
            .map((f) => ({ id: str(f.id), name: str(f.name), lat: f.lat as number, lng: f.lng as number, phone: str(f.phone) })),
        }
      : {}),
    /* ★★ AZ4 — ordre manuel, durées sur place, départ propre ; absent = comme avant. */
    ...(planOf(p.plan) ? { plan: planOf(p.plan) as TourPlan } : {}),
  }),
}

// ===========================================================================

/**
 * The registry, keyed by the collection names `store.ts` reports changes in.
 * Its iteration order is `COLLECTIONS`' order, which is FK-safe for hydration
 * and for a first write into an empty database.
 */
export const MAPPINGS: { [K in Collection]: Mapping<StoreData[K][number]> } = {
  farms: farmMapping,
  leads: leadMapping,
  farmZones: farmZoneMapping,
  anchorPoints: anchorMapping,
  threatZones: threatZoneMapping,
  threatVectors: threatVectorMapping,
  volunteers: volunteerMapping,
  drivers: driverMapping,
  missions: missionMapping,
  incidents: incidentMapping,
  farmVisits: farmVisitMapping,
  generalMeetings: generalMeetingMapping,
  tours: tourMapping,
  institutions: institutionMapping,
  landmarks: landmarkMapping,
  taskLists: taskListMapping,
  tasks: taskMapping,
  memoLines: memoLineMapping,
  farmInstitutionLinks: farmInstitutionLinkMapping,
}

/** Every table an aggregate of this collection lives in, parent first. */
export function tablesOf(collection: Collection): string[] {
  const mapping = MAPPINGS[collection] as Mapping<unknown>
  return [mapping.table, ...mapping.children.map((c) => c.table)]
}
