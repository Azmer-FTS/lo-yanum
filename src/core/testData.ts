import { guardNight, hoursFromNow, iso, now } from './clock'
import { EMPTY_LEG } from './types'
import type {
  AnchorPoint,
  Driver,
  Farm,
  FarmZone,
  Mission,
  Volunteer,
} from './types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH3 (2026-09-09) — UN JEU D'ESSAI MINIMAL, MARQUÉ, ET SUPPRIMABLE EN UN
 *    GESTE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « La base a été vidée en AF8. Le PO ne peut donc rien voir dans "voir
 *     comme" ni dans l'espace agriculteur : il n'y a ni ferme, ni agriculteur,
 *     ni volontaire, ni conducteur. »
 *
 * ★★ CE N'EST PAS LE JEU DE DÉMONSTRATION, ET LES DEUX NE DOIVENT PAS SE
 *    CONFONDRE. `demo-` est le programme complet du jumeau de démonstration —
 *    douze exploitations, cinquante-six volontaires, une couche de menaces. Ce
 *    jeu-ci est MINIMAL par exigence : une ferme, un volontaire, un
 *    conducteur, deux gardes. Il existe pour qu'un écran ait quelque chose à
 *    montrer, pas pour raconter un programme.
 *
 * ★★ LE MARQUEUR EST LE PRÉFIXE `test-`, ET C'EST LA MÊME MÉCANIQUE QU'EN N3.
 *    `nextId` ne produit jamais ce préfixe, donc tout ce que le PO créera
 *    entre-temps y survit PAR CONSTRUCTION — ce n'est pas une précaution, c'est
 *    une propriété. La suppression est « retirer les lignes dont l'id commence
 *    par `test-` », et rien d'autre.
 *
 * ★★ ET IL EST EXCLU DES COMPTEURS (AH3.5). « Ce jeu ne fausse rien : exclu des
 *    compteurs de l'objectif, des dounams pondérés et du compte rendu envoyé. »
 *    C'est ce que `isTestId` sert à faire dans `access.ts` et `report.ts` — pas
 *    à le cacher des listes, où le PO doit au contraire le VOIR, avec sa
 *    marque.
 *
 * ⚠️ VALEURS MANIFESTEMENT FICTIVES (AH3.3). Le portable est un 050-0000000
 *    qui ne sonne nulle part, la ת״ז est neuf zéros — un numéro israélien
 *    valide a une clé de contrôle, celui-ci ne peut appartenir à personne — et
 *    le nom porte « (בדיקה) ». Un jeu d'essai plausible finit par être appelé.
 *
 * PURE : ni DOM, ni React. La pose et le retrait sont dans `store.ts`.
 */

export const TEST_PREFIX = 'test-'

export const isTestId = (id: string): boolean => id.startsWith(TEST_PREFIX)

/** L'étiquette portée à l'écran. Le texte hébreu vit dans les traductions. */
export const TEST_BADGE_KEY = 'testData.badge'

export const TEST_FARM_ID = `${TEST_PREFIX}farm`
export const TEST_ZONE_ID = `${TEST_PREFIX}zone`
export const TEST_ANCHOR_ID = `${TEST_PREFIX}anchor`
export const TEST_VOLUNTEER_ID = `${TEST_PREFIX}vol`
export const TEST_DRIVER_ID = `${TEST_PREFIX}drv`
export const TEST_MISSION_PAST_ID = `${TEST_PREFIX}mission-past`
export const TEST_MISSION_NEXT_ID = `${TEST_PREFIX}mission-next`

export interface TestDataset {
  farms: Farm[]
  farmZones: FarmZone[]
  anchorPoints: AnchorPoint[]
  volunteers: Volunteer[]
  drivers: Driver[]
  missions: Mission[]
}

/**
 * ★ UN POINT DANS LE NÉGUEV, CHOISI DANS LE VIDE. 31,05 N / 34,72 E est une
 *   étendue sans exploitation ; l'épingle du jeu d'essai ne se posera donc
 *   jamais sur une vraie ferme du PO, ce qui est ce qui arriverait si l'on
 *   reprenait les coordonnées d'une fixture de démonstration.
 */
const CENTER = { lat: 31.0512, lng: 34.7231 }

const ring = (offsets: Array<[number, number]>) =>
  offsets.map(([dLat, dLng]) => ({
    lat: +(CENTER.lat + dLat).toFixed(6),
    lng: +(CENTER.lng + dLng).toFixed(6),
  }))

/**
 * Le jeu, construit à l'instant où on le pose : « une garde PASSÉE et une
 * garde À VENIR » sont des faits relatifs à maintenant, et un jeu daté en dur
 * cesse d'être ce que le brief demande dès le lendemain.
 */
export function buildTestData(): TestDataset {
  const at = iso(now())

  const farm: Farm = {
    id: TEST_FARM_ID,
    name: 'חוות בדיקה',
    farmName: 'חוות בדיקה',
    locality: 'ירוחם',
    region: 'הנגב',
    regionId: null,
    type: 'mixed',
    entityKind: 'farm',
    status: 'signed',
    position: CENTER,
    photo: null,
    farmDunams: 120,
    grazingDunams: 80,
    farmDunamsManual: true,
    grazingDunamsManual: true,
    guardedDunams: 200,
    guardedDunamsManual: false,
    livestock: [{ kind: 'sheep', label: '', heads: 40 }],
    commitments: [{ kind: 'water', detail: 'ברז ליד השער', fulfilled: true }],
    contacts: [
      {
        id: `${TEST_PREFIX}contact`,
        name: 'ישראל ישראלי (בדיקה)',
        phone: '050-0000000',
        email: 'test@example.invalid',
        role: 'בעל החווה',
        photo: null,
        isPrimary: true,
      },
    ],
    agreements: [
      {
        id: `${TEST_PREFIX}agreement`,
        signedAt: at,
        signedBy: 'ישראל ישראלי (בדיקה)',
        fileName: 'הסכם — חוות בדיקה.pdf',
        /* ★ UNE SIGNATURE RÉELLE, DESSINÉE EN SVG : un trait, pas une image
           téléversée. Le brief demande « signature » dans le jeu, et une fiche
           marquée « לא נחתם » ne montrerait pas l'écran que le PO veut voir. */
        signature: TEST_SIGNATURE,
      },
    ],
    /* ★ « documents fournis » du brief. Le PDF est un vrai PDF minimal — une
       page blanche — parce que `ProvidedDocument.file` est ce que l'écran
       ouvre : un marqueur y produirait un bouton qui ne mène nulle part. */
    providedDocuments: [
      { id: 'crops', providedAt: at, fileName: 'אישור עיבוד — בדיקה.pdf', file: BLANK_PDF },
      { id: 'grazing', providedAt: at, fileName: 'הסכם רעיה — בדיקה.pdf', file: BLANK_PDF },
    ],
    notes: 'רשומה של נתוני בדיקה. אפשר למחוק אותה מההגדרות.',
    localityCode: null,
    council: 'מועצה אזורית רמת נגב',
    legalEntity: 'private_farmer',
    landAgreement: 'lease',
    landAgreementUntil: null,
    farmerName: 'ישראל ישראלי (בדיקה)',
    farmerPhone: '050-0000000',
    farmerEmail: 'test@example.invalid',
    farmerId: '000000000',
    liaisonName: 'ישראל ישראלי (בדיקה)',
    liaisonPhone: '050-0000000',
    umbrella: '',
    councilHotline: '08-0000000',
    standbyPhone: '050-0000001',
    siteAccess: 'שער צפוני, קוד בשלט',
    gateCode: '0000',
    parking: 'ליד המכולה',
    terrainNotes: 'שטח פתוח, ללא תאורה.',
    lastVisitAt: null,
    nextVisitAt: null,
  }

  const zone: FarmZone = {
    id: TEST_ZONE_ID,
    farmId: TEST_FARM_ID,
    kind: 'farm_boundary',
    ring: ring([
      [0.004, -0.005],
      [0.004, 0.005],
      [-0.004, 0.005],
      [-0.004, -0.005],
    ]),
  }

  const anchor: AnchorPoint = {
    id: TEST_ANCHOR_ID,
    farmId: TEST_FARM_ID,
    name: 'עמדת בדיקה',
    position: { lat: CENTER.lat + 0.002, lng: CENTER.lng + 0.002 },
    instructions: ['עמדה של נתוני בדיקה.'],
    accessDescription: 'מכביש 204, פנייה מזרחה. שער צפוני.',
  }

  const volunteer: Volunteer = {
    id: TEST_VOLUNTEER_ID,
    name: 'מתנדב בדיקה',
    age: 21,
    phone: '050-0000002',
    phoneType: 'smartphone',
    email: '',
    availability: { nights: true, days: false, weekends: false, excludedDates: [] },
    yeshiva: 'ישיבת בדיקה',
    locality: 'ירוחם',
    guardsCount: 1,
    status: 'active',
    inactiveReason: null,
    notes: 'נתוני בדיקה',
    lastActivityAt: hoursFromNow(-30),
    photo: null,
    hasLicense: false,
    hasCar: false,
    canDrive: false,
  }

  const driver: Driver = {
    id: TEST_DRIVER_ID,
    name: 'נהג בדיקה',
    phone: '050-0000003',
    email: '',
    vehicle: 'טרנזיט (בדיקה)',
    seats: 8,
    locality: 'באר שבע',
    photo: null,
    availabilityNote: 'א׳–ה׳ בערב',
    notes: 'נתוני בדיקה',
    volunteerId: null,
  }

  const skeleton = {
    anchorPointId: TEST_ANCHOR_ID,
    additionalAnchorPointIds: [] as string[],
    pickupPoint: null,
    dropoffPoint: null,
    returnPickupPoint: null,
    returnDropoffPoint: null,
    farmId: TEST_FARM_ID,
    requiredVolunteers: 1,
    cancelledAt: null,
    cancelReason: null,
    cancelNote: '',
    outreach: [],
    reactivatedAt: null,
    checkpoints: [] as string[],
  }

  const past: Mission = {
    ...skeleton,
    id: TEST_MISSION_PAST_ID,
    startAt: hoursFromNow(-30),
    endAt: hoursFromNow(-22),
    status: 'completed',
    assignments: [
      {
        volunteerId: TEST_VOLUNTEER_ID,
        isGroupPhone: true,
        outbound: { driver: 'present', group: 'present', self: 'present' },
        inbound: { driver: 'present', group: 'present', self: 'present' },
      },
    ],
    drivers: [
      { driverId: TEST_DRIVER_ID, passengerVolunteerIds: [TEST_VOLUNTEER_ID], confirmed: true },
    ],
    arrivalConfirmedAt: hoursFromNow(-29.8),
    endConfirmedAt: hoursFromNow(-22),
    createdAt: hoursFromNow(-72),
    droppedOffAt: hoursFromNow(-30),
    pickedUpAt: hoursFromNow(-22.2),
    completedAt: hoursFromNow(-22),
  }

  const next: Mission = {
    ...skeleton,
    id: TEST_MISSION_NEXT_ID,
    /* `guardNight` rend la PAIRE 21:00 → 05:00, en heure locale et sûre au
       changement d'heure — voir `clock.ts`. Recalculer une fin en ajoutant huit
       heures de millisecondes est précisément l'erreur qu'il existe pour
       éviter. */
    ...guardNight(2),
    status: 'planned',
    assignments: [
      {
        volunteerId: TEST_VOLUNTEER_ID,
        isGroupPhone: true,
        outbound: { ...EMPTY_LEG },
        inbound: { ...EMPTY_LEG },
      },
    ],
    drivers: [
      { driverId: TEST_DRIVER_ID, passengerVolunteerIds: [TEST_VOLUNTEER_ID], confirmed: false },
    ],
    arrivalConfirmedAt: null,
    endConfirmedAt: null,
    createdAt: at,
    droppedOffAt: null,
    pickedUpAt: null,
    completedAt: null,
  }

  return {
    farms: [farm],
    farmZones: [zone],
    anchorPoints: [anchor],
    volunteers: [volunteer],
    drivers: [driver],
    missions: [past, next],
  }
}

/**
 * ★ UNE SIGNATURE, ET ELLE EST UN SVG EN URL DE DONNÉES.
 *
 * Le pad produit un PNG ; ici on n'a pas de canevas (ce fichier est pur), et un
 * PNG en base64 pèserait dix kilo-octets de bruit illisible dans le dépôt. Un
 * SVG d'un trait fait la même chose en une ligne, se lit dans un `<img>` comme
 * n'importe quelle autre encre, et se voit tout de suite pour ce qu'il est.
 */
const TEST_SIGNATURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="110" viewBox="0 0 320 110">' +
      '<path d="M20 78 C60 20, 90 96, 130 54 S200 18, 240 62 C262 86, 282 50, 300 44" ' +
      'fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/>' +
      '</svg>',
  )

/**
 * ★ UN PDF D'UNE PAGE BLANCHE, EN DUR.
 *
 * Le brief demande « documents fournis » dans le jeu d'essai, et un document
 * fourni est un fichier qu'on peut OUVRIR. Ce sont les 200 octets minimaux
 * d'un PDF valide ; ils s'ouvrent dans n'importe quel lecteur et ne prétendent
 * rien être d'autre qu'une page vide.
 */
const BLANK_PDF =
  'data:application/pdf;base64,' +
  'JVBERi0xLjQKMSAwIG9iago8PC9UeXBlL0NhdGFsb2cvUGFnZXMgMiAwIFI+PgplbmRvYmoKMiAw' +
  'IG9iago8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8' +
  'PC9UeXBlL1BhZ2UvUGFyZW50IDIgMCBSL01lZGlhQm94WzAgMCA1OTUgODQyXT4+CmVuZG9iagp0' +
  'cmFpbGVyCjw8L1Jvb3QgMSAwIFI+Pgo='
