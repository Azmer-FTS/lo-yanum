import { readFileSync, writeFileSync } from 'node:fs'

import {
  FARM_STATUS_OPTIONS,
  HOME_BASE,
  LEGAL_ENTITY_OPTIONS,
  canonicalPhone,
  countsTowardProgramme,
  effectiveAreas,
  guardedDunamsOf,
  identityNumberKind,
  readAssociationCoords,
  readOption,
  typeFromAreas,
  weightedDunams,
} from '../src/core/index'
import type { Farm } from '../src/core/index'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AO1 — LES VINGT-CINQ EXPLOITATIONS DU PORTAIL. A239 · A240 · A241 · A242
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aodata                  → vérifie l'appariement et le jeu construit
 *   bun run aodata sql <out.sql>    → écrit la reprise pour `lo-yanum-prod`
 *   bun run aodata check <rows>     → relit ce que la base a RENDU (JSON)
 *
 * ★★ LE PIÈGE DE CETTE PASSE N'EST PAS LA SAISIE, C'EST L'APPARIEMENT.
 *    Quinze fiches existent déjà (AK1, `farm-ak1-01` … `-15`). Le portail en
 *    montre maintenant vingt-cinq — dont ces quinze, sous des noms qui ont
 *    parfois CHANGÉ : « גד״ש תדהר — החווה של אופק » s'appelle désormais
 *    « 05 - גד״ש תדהר — החווה של אופק ». Une reprise naïve par nom exact
 *    créerait un doublon, et le PO se retrouverait avec deux fiches pour une
 *    exploitation, dont une seule porte son historique.
 *
 * ★★ ET LE PIÈGE INVERSE EST JUSTE À CÔTÉ. Cinq lignes s'appellent
 *    « 0N - שדה משה חקלאות » et partagent LES MÊMES COORDONNÉES : ce sont des
 *    VOISINS de תומר שדה משה, des parcelles distinctes qu'il se charge de
 *    faire signer. Les fusionner parce qu'elles se ressemblent perdrait
 *    quatre exploitations. Donc : le préfixe « 0N - » est ignoré pour
 *    RETROUVER une fiche existante, et il est gardé comme IDENTITÉ entre deux
 *    lignes neuves.
 *
 * ★ LA SOURCE EST RECOPIÉE TELLE QUELLE, colonne « מיקום » comprise, dans
 *   L'ORDRE DU PORTAIL : longitude, latitude. Elle passe par
 *   `readAssociationCoords`, le lecteur de l'application, qui refuse l'ordre
 *   inversé dans les deux sens. Aucun couple n'est retourné à la main ici.
 */

interface SourceRow {
  name: string
  contact: string
  phone: string
  idNo: string
  status: string
  grazing: string
  cultivated: string
  /** « מיקום » du portail : longitude, latitude — DANS CET ORDRE. */
  coords: string
  note: string
}

/* Recopié du brief AO1, ligne pour ligne, dans son ordre. */
const SOURCE: SourceRow[] = [
  { name: 'גד״ש דביר', contact: 'לירן', phone: '052-606-7361', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '', note: '' },
  { name: 'גד״ש להב', contact: 'אמיר פרץ', phone: '054-661-4679', idNo: '', status: 'לא רלוונטי כרגע', grazing: '', cultivated: '', coords: '', note: 'יש להם שומר קבוע' },
  { name: 'גד״ש רוחמה', contact: 'רו (מנכ״ל)', phone: '054-799-5091', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '', note: '' },
  { name: 'גד״ש שומריה', contact: 'אלחנן', phone: '054-667-3596', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '', note: '' },
  { name: 'חוות אורחאן', contact: 'צביקה שלמה', phone: '050-627-0230', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '', note: '' },
  { name: 'משק ישי ספז', contact: 'ישי ספז', phone: '052-606-7344', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '34.3175954, 31.2056556', note: '' },
  { name: 'קיבוץ להב — חווה טיפולית', contact: 'ניר', phone: '052-684-1023', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '', note: '' },
  { name: '01 - תומר שדה משה חקלאות', contact: 'משק שבתאי', phone: '054-787-1854', idNo: '557457074', status: 'נחתם', grazing: '', cultivated: '280', coords: '34.794011, 31.6114124', note: '' },
  { name: '02 - שדה משה חקלאות', contact: '', phone: '', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '', coords: '34.813112, 31.6139839', note: 'שכן של תומר, ימולא על ידו' },
  { name: '02 - מושב פתיש עדר בקר', contact: 'ודקלה עופר', phone: '054-237-1311', idNo: '23505696', status: 'נחתם', grazing: '0', cultivated: '', coords: '34.5605774, 31.3303833', note: '' },
  { name: '03 - שדה משה חקלאות', contact: '', phone: '', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '', coords: '34.813112, 31.6139839', note: 'שכן של תומר, ימולא על ידו' },
  { name: '03 - אבן חן חקלאות', contact: 'עדי אבן חן', phone: '054-561-1316', idNo: '24015877', status: 'נחתם', grazing: '', cultivated: '650', coords: '34.656149, 31.689069', note: '' },
  { name: '04 - שדה משה חקלאות', contact: '', phone: '', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '', coords: '34.813112, 31.6139839', note: 'שכן של תומר, ימולא על ידו' },
  { name: '04 - חקלאי שפיר', contact: 'שי ברנס', phone: '052-866-5461', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '3 000', coords: '34.664364, 31.676913', note: '' },
  { name: '05 - שדה משה חקלאות', contact: '', phone: '', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '', coords: '34.813112, 31.6139839', note: 'שכן של תומר, ימולא על ידו' },
  { name: '05 - גד״ש תדהר — החווה של אופק', contact: 'אופק', phone: '052-532-1261', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '', coords: '34.626769, 31.379197', note: '' },
  { name: '06 - חוות נעמ״א', contact: 'עשירי ברוך', phone: '054-430-6587', idNo: '7010797', status: 'נחתם', grazing: '0', cultivated: '600', coords: '34.595009, 31.333333', note: '' },
  { name: '07 - מושב איתן', contact: 'דביר', phone: '050-934-4585', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '3 000', coords: '34.7486881, 31.5713246', note: 'חיבורים עם חקלאים' },
  { name: 'בקר מושב אמציה', contact: 'שימי רוזן', phone: '050-885-1686', idNo: '570014266', status: 'נחתם', grazing: '26 000', cultivated: '', coords: '34.9001389, 31.5406799', note: '' },
  { name: 'דני בראל לכיש', contact: 'דני בראל', phone: '050-968-8262', idNo: '', status: 'מוכן לחתימה', grazing: '21 000', cultivated: '', coords: '34.8312961, 31.571997', note: '' },
  { name: 'חוות הר-שמש', contact: 'הר שמש מושב שיתופי', phone: '055-684-9979', idNo: '570055368', status: 'נחתם', grazing: '1 000', cultivated: '200', coords: '34.8401384, 31.3926639', note: '' },
  { name: 'חוות זעק', contact: 'דוד דהן', phone: '052-323-1260', idNo: '', status: 'מוכן לחתימה', grazing: '1 000', cultivated: '100', coords: '34.8640847, 31.4131105', note: '' },
  { name: 'חוות מרגי', contact: 'יונתן מרגי', phone: '050-891-2840', idNo: '021985189', status: 'נחתם', grazing: '5 000', cultivated: '', coords: '35.034498, 31.670483', note: '' },
  { name: 'חוות ניסים', contact: 'ניסים פרץ', phone: '050-540-4866', idNo: '', status: 'בהמתנה', grazing: '', cultivated: '', coords: '34.6739116, 31.4908558', note: 'קיבל 6 בני שירות לכל השנה' },
  { name: 'משק שלם', contact: 'רותם', phone: '055-050-5055', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '1 000', coords: '34.6425293, 31.4729415', note: '' },
]

/* Ce que la base porte AUJOURD'HUI — relevé d'AK1, relu depuis prod. */
interface ExistingRow {
  id: string
  name: string
}

function readExisting(path = 'docs/ak/ak1-prod-rows.json'): ExistingRow[] {
  const rows = JSON.parse(readFileSync(path, 'utf8')) as Array<Record<string, unknown>>
  return rows.map((r) => ({ id: String(r.id), name: String(r.name) }))
}

// ---------------------------------------------------------------------------
// L'appariement
// ---------------------------------------------------------------------------

/**
 * Le nom SANS son préfixe d'ordre (« 05 - », « 01 - »), espaces normalisés.
 *
 * ⚠️ CETTE FORME NE SERT QU'À RETROUVER UNE FICHE EXISTANTE. Deux lignes
 *    NEUVES qui se réduisent au même texte restent deux exploitations : ce
 *    sont les cinq parcelles « שדה משה », et les confondre en perdrait quatre.
 */
export function pairingKey(name: string): string {
  return name
    .replace(/^\s*\d{1,3}\s*[-–—]\s*/u, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

export interface Pairing {
  /** Une ligne du portail qui retrouve une fiche existante. */
  updates: Array<{ row: SourceRow; id: string; renamedFrom: string | null }>
  /** Une ligne du portail qui n'existe nulle part. */
  creations: Array<{ row: SourceRow; id: string }>
  /** Une fiche existante qu'aucune ligne du portail ne réclame. */
  orphans: ExistingRow[]
  /** Un appariement REFUSÉ parce qu'il était ambigu. Doit rester vide. */
  ambiguous: Array<{ name: string; candidates: string[] }>
}

export function pairFarms(source: SourceRow[], existing: ExistingRow[]): Pairing {
  const out: Pairing = { updates: [], creations: [], orphans: [], ambiguous: [] }
  const taken = new Set<string>()

  /* 1 — nom exact. Le cas ordinaire : quatorze des quinze. */
  const byExactName = new Map<string, ExistingRow[]>()
  const byKey = new Map<string, ExistingRow[]>()
  for (const e of existing) {
    const exact = e.name.trim()
    if (!byExactName.has(exact)) byExactName.set(exact, [])
    byExactName.get(exact)!.push(e)
    const k = pairingKey(e.name)
    if (!byKey.has(k)) byKey.set(k, [])
    byKey.get(k)!.push(e)
  }

  /* Combien de lignes du portail se réduisent à la même clé : au-delà d'une,
     la clé ne peut plus DÉSIGNER une fiche existante sans choisir au hasard. */
  const sourceKeyCount = new Map<string, number>()
  for (const r of source) {
    const k = pairingKey(r.name)
    sourceKeyCount.set(k, (sourceKeyCount.get(k) ?? 0) + 1)
  }

  let created = 0
  for (const row of source) {
    const exact = byExactName.get(row.name.trim())?.filter((e) => !taken.has(e.id)) ?? []
    if (exact.length === 1) {
      taken.add(exact[0].id)
      out.updates.push({ row, id: exact[0].id, renamedFrom: null })
      continue
    }
    const key = pairingKey(row.name)
    const loose = byKey.get(key)?.filter((e) => !taken.has(e.id)) ?? []
    if (loose.length === 1 && (sourceKeyCount.get(key) ?? 0) === 1) {
      taken.add(loose[0].id)
      out.updates.push({ row, id: loose[0].id, renamedFrom: loose[0].name })
      continue
    }
    if (loose.length > 1) {
      /* ⚠️ ON NE TRANCHE PAS À LA PLACE DU PO. Un appariement ambigu devient
         une création ET une ligne dans le rapport : mieux vaut une fiche de
         trop, visible et fusionnable, qu'un historique écrasé en silence. */
      out.ambiguous.push({ name: row.name, candidates: loose.map((e) => e.name) })
    }
    created += 1
    out.creations.push({ row, id: `farm-ao1-${String(created).padStart(2, '0')}` })
  }

  out.orphans = existing.filter((e) => !taken.has(e.id))
  return out
}

// ---------------------------------------------------------------------------
// La fiche
// ---------------------------------------------------------------------------

/**
 * La forme juridique, là où la SOURCE la dit en toutes lettres et nulle part
 * ailleurs (même règle qu'AK1) : « גד״ש » au début du nom, « מושב שיתופי »
 * dans le contact. Un ח״פ ne dit pas LAQUELLE des formes il désigne.
 */
function legalEntityOf(row: SourceRow): string | undefined {
  if (row.name.startsWith('גד״ש')) return readOption('גד״ש', LEGAL_ENTITY_OPTIONS)?.id
  if (pairingKey(row.name).startsWith('גד״ש')) return readOption('גד״ש', LEGAL_ENTITY_OPTIONS)?.id
  if (row.contact.includes('מושב שיתופי')) return readOption('מושב שיתופי', LEGAL_ENTITY_OPTIONS)?.id
  return undefined
}

const area = (raw: string): number => {
  const cleaned = raw.replace(/[\s, ]/g, '')
  return cleaned === '' ? 0 : Number(cleaned)
}

export function buildFarms(existing: ExistingRow[] = readExisting()): {
  farms: Farm[]
  pairing: Pairing
} {
  const pairing = pairFarms(SOURCE, existing)
  const idFor = new Map<SourceRow, string>()
  pairing.updates.forEach((u) => idFor.set(u.row, u.id))
  pairing.creations.forEach((c) => idFor.set(c.row, c.id))

  const farms = SOURCE.map((row): Farm => {
    const grazing = area(row.grazing)
    const cultivated = area(row.cultivated)
    const read = readAssociationCoords(row.coords)
    if (row.coords !== '' && read.position === null) {
      throw new Error(`coordonnées illisibles pour ${row.name}: ${row.coords} (${read.order})`)
    }
    const status = readOption(row.status, FARM_STATUS_OPTIONS)
    if (!status) throw new Error(`statut inconnu: ${row.status}`)
    return {
      id: idFor.get(row)!,
      name: row.name,
      locality: '',
      region: '',
      regionId: null,
      type: typeFromAreas(cultivated, grazing),
      entityKind: 'farm',
      status: status.id as Farm['status'],
      position: read.position ?? HOME_BASE,
      positionMissing: read.position === null ? true : undefined,
      farmDunams: cultivated,
      grazingDunams: grazing,
      /* Le drapeau de saisie seulement sur un vrai chiffre (AA4 · AD1.5) :
         « 0 » au portail veut dire « on a demandé, il n'y en a pas », pas
         « quelqu'un a mesuré zéro ». */
      farmDunamsManual: cultivated > 0 ? true : undefined,
      grazingDunamsManual: grazing > 0 ? true : undefined,
      contacts: [],
      commitments: [],
      agreements: [],
      /* AO2.4 — le commentaire libre du PO, recopié tel quel. C'est lui que le
         rapport d'activité reprend mot pour mot (AO3.2). */
      notes: row.note,
      lastVisitAt: null,
      nextVisitAt: null,
      photo: null,
      legalEntity: legalEntityOf(row),
      farmerName: row.contact === '' ? undefined : row.contact,
      farmerPhone: row.phone === '' ? undefined : canonicalPhone(row.phone),
      /* ⚠️ AO1.1 — du TEXTE, recopié caractère pour caractère : 021985189. */
      farmerId: row.idNo === '' ? undefined : row.idNo,
      /* AK1.5 — aucun document reçu, et pas de סוג הסכם : la colonne est vide.
         AK1.6 / AL1 — שטחים שמירה : rien tant que le PO n'a pas tranché. */
    }
  })

  return { farms, pairing }
}

// ---------------------------------------------------------------------------

let passed = 0
let failed = 0
function check(id: string, label: string, ok: boolean, detail = ''): void {
  if (ok) passed += 1
  else failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${label}${detail ? ` — ${detail}` : ''}`)
}

/** Distance en km, orthodromie. */
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const ADULLAM = { lat: 31.655, lng: 34.95 }
/** מושב פתיש, au sud d'Ofakim — un point que l'on peut nommer sans la source. */
const PATISH = { lat: 31.3306, lng: 34.5606 }

function verify(farms: Farm[], pairing: Pairing | null, origin: string): void {
  const byName = (n: string) => farms.find((f) => f.name === n)

  // --- A239 : vingt-cinq fiches, aucun doublon -----------------------------
  check('A239', `${origin} : vingt-cinq fiches`, farms.length === 25, String(farms.length))
  const ids = farms.map((f) => f.id)
  check('A239', `${origin} : vingt-cinq identifiants distincts`, new Set(ids).size === 25)
  const names = farms.map((f) => f.name.trim())
  check('A239', `${origin} : vingt-cinq noms distincts`, new Set(names).size === 25,
    names.filter((n, i) => names.indexOf(n) !== i).join(' | '))
  if (pairing) {
    check('A239', 'les quinze fiches d’AK1 sont MISES À JOUR, pas recréées',
      pairing.updates.length === 15, `${pairing.updates.length} appariées`)
    check('A239', 'dix fiches créées, et dix seulement',
      pairing.creations.length === 10, `${pairing.creations.length} créées`)
    check('A239', 'aucune fiche existante laissée orpheline',
      pairing.orphans.length === 0, pairing.orphans.map((o) => o.name).join(', '))
    check('A239', 'aucun appariement ambigu',
      pairing.ambiguous.length === 0, JSON.stringify(pairing.ambiguous))
    const renamed = pairing.updates.filter((u) => u.renamedFrom !== null)
    check('A239', '« גד״ש תדהר » retrouvée malgré son préfixe « 05 - »',
      renamed.length === 1 && renamed[0].id === 'farm-ak1-05',
      renamed.map((r) => `${r.renamedFrom} → ${r.row.name}`).join(' | '))
    const keptIds = pairing.updates.map((u) => u.id).sort()
    check('A239', 'les identifiants d’AK1 sont conservés tels quels',
      keptIds.every((i) => i.startsWith('farm-ak1-')) && keptIds.length === 15)
  }

  // --- A241 : le secteur שדה משה -------------------------------------------
  /**
   * ⚠️ « CINQ LIGNES 02 À 05 » : LE BRIEF SE CONTREDIT, ET LE TABLEAU TRANCHE.
   *    Le tableau du portail porte QUATRE lignes « 0N - שדה משה חקלאות »
   *    (02, 03, 04, 05) — les voisins sans informations, que תומר se charge de
   *    faire signer — plus « 01 - תומר שדה משה חקלאות », qui est SA fiche à
   *    lui : elle a un contact, un ח״פ, 280 dounams et surtout un AUTRE point
   *    (34.794011 contre 34.813112). Les cinq lignes du secteur sont donc
   *    01 à 05 ; les quatre qui partagent un point sont 02 à 05. Compté ainsi
   *    plutôt que de forcer un cinquième voisin qui n'existe pas dans la
   *    source. À faire confirmer par le PO (voir le rapport).
   */
  const sdeMosheNeighbours = farms.filter((f) => pairingKey(f.name) === 'שדה משה חקלאות')
  const sdeMosheSector = farms.filter((f) => f.name.includes('שדה משה'))
  check('A241', `${origin} : cinq lignes au secteur « שדה משה » (01 à 05)`,
    sdeMosheSector.length === 5, sdeMosheSector.map((f) => f.name).join(' | '))
  check('A241', `${origin} : quatre voisins « 0N - שדה משה חקלאות », non fusionnés`,
    sdeMosheNeighbours.length === 4 && new Set(sdeMosheNeighbours.map((f) => f.id)).size === 4,
    sdeMosheNeighbours.map((f) => f.name).join(' | '))
  check('A241', `${origin} : les quatre voisins partagent UN point et gardent QUATRE fiches`,
    new Set(sdeMosheNeighbours.map((f) => `${f.position.lat},${f.position.lng}`)).size === 1)
  check('A241', `${origin} : « 01 - תומר שדה משה » n’est PAS un des voisins (autre point)`,
    byName('01 - תומר שדה משה חקלאות') !== undefined &&
      !sdeMosheNeighbours.some((f) => f.name.includes('תומר')) &&
      byName('01 - תומר שדה משה חקלאות')!.position.lng !== sdeMosheNeighbours[0].position.lng)
  check('A241', `${origin} : les quatre voisins portent le commentaire du PO`,
    sdeMosheNeighbours.every((f) => f.notes === 'שכן של תומר, ימולא על ידו'))
  check('A241', `${origin} : les quatre voisins sont sans contact et sans ת״ז`,
    sdeMosheNeighbours.every((f) => !f.farmerName && !f.farmerPhone && !f.farmerId))

  // --- A240 : les coordonnées ----------------------------------------------
  const placed = farms.filter((f) => !f.positionMissing)
  check('A240', `${origin} : dix-neuf fiches positionnées`, placed.length === 19, String(placed.length))
  const inIsrael = placed.every(
    (f) =>
      f.position.lat > 29.4 &&
      f.position.lat < 33.4 &&
      f.position.lng > 34.2 &&
      f.position.lng < 35.95 &&
      f.position.lng > f.position.lat,
  )
  check('A240', `${origin} : chaque point tombe en Israël (lat 29–33, lng 34–36)`, inIsrael,
    placed.map((f) => `${f.name} ${f.position.lat},${f.position.lng}`).join(' | '))
  const margi = byName('חוות מרגי')
  const dMargi = margi ? km(margi.position, ADULLAM) : Infinity
  check('A240', `${origin} : חוות מרגי dans la région d’Adoulam`, dMargi < 12, `${dMargi.toFixed(1)} km`)
  const patish = byName('02 - מושב פתיש עדר בקר')
  const dPatish = patish ? km(patish.position, PATISH) : Infinity
  check('A240', `${origin} : מושב פתיש tombe sur מושב פתיש`, dPatish < 3, `${dPatish.toFixed(1)} km`)
  const safaz = byName('משק ישי ספז')
  check('A240', `${origin} : משק ישי ספז = lat 31.2056556, lng 34.3175954`,
    safaz?.position.lat === 31.2056556 && safaz?.position.lng === 34.3175954)
  check('A240', `${origin} : aucun point n’est resté sur le repli de Jérusalem`,
    !placed.some((f) => f.position.lat === HOME_BASE.lat && f.position.lng === HOME_BASE.lng))
  check('A240', `${origin} : les six sans מיקום portent « מיקום חסר »`,
    farms.filter((f) => f.positionMissing).length === 6)

  // --- A242 : ת״ז / ח״פ ----------------------------------------------------
  const idNos = Object.fromEntries(farms.filter((f) => f.farmerId).map((f) => [f.name, f.farmerId]))
  check('A242', `${origin} : sept numéros, en texte`, Object.keys(idNos).length === 7,
    JSON.stringify(idNos))
  check('A242', `${origin} : le zéro initial de חוות מרגי tient (021985189)`,
    idNos['חוות מרגי'] === '021985189', String(idNos['חוות מרגי']))
  check('A242', `${origin} : aucun numéro n’a perdu ni gagné un caractère`,
    farms.every((f) => {
      if (!f.farmerId) return true
      const src = SOURCE.find((r) => r.name === f.name)
      return src !== undefined && src.idNo === f.farmerId
    }))
  const companies = farms.filter((f) => identityNumberKind(f.farmerId) === 'company').map((f) => f.name)
  check('A242', `${origin} : les trois « 5… » à neuf chiffres sont lus comme ח״פ, pas ת״ז`,
    companies.length === 3 &&
      companies.includes('בקר מושב אמציה') &&
      companies.includes('חוות הר-שמש') &&
      companies.includes('01 - תומר שדה משה חקלאות'),
    companies.join(', '))
  check('A242', `${origin} : חוות מרגי (021985189) reste une ת״ז`,
    identityNumberKind(byName('חוות מרגי')?.farmerId) === 'person')
  check('A242', `${origin} : les numéros courts ne sont NI l’un NI l’autre`,
    ['02 - מושב פתיש עדר בקר', '03 - אבן חן חקלאות', '06 - חוות נעמ״א'].every(
      (n) => identityNumberKind(byName(n)?.farmerId) === 'unknown',
    ))

  // --- A243 : les deux nouveaux statuts ------------------------------------
  const lahav = byName('גד״ש להב')
  check('A243', `${origin} : גד״ש להב = לא רלוונטי כרגע (et non סירבה)`,
    lahav?.status === 'not_relevant_now', String(lahav?.status))
  check('A243', `${origin} : גד״ש להב porte « יש להם שומר קבוע »`,
    lahav?.notes === 'יש להם שומר קבוע', String(lahav?.notes))
  const nissim = byName('חוות ניסים')
  check('A243', `${origin} : חוות ניסים = בהמתנה`, nissim?.status === 'on_hold', String(nissim?.status))
  check('A243', `${origin} : חוות ניסים porte « קיבל 6 בני שירות לכל השנה »`,
    nissim?.notes === 'קיבל 6 בני שירות לכל השנה')
  check('A243', `${origin} : les deux sortent des compteurs`,
    !countsTowardProgramme('not_relevant_now') && !countsTowardProgramme('on_hold'))
  check('A243', `${origin} : et elles restent dans la liste des vingt-cinq`,
    farms.filter((f) => !countsTowardProgramme(f.status)).length === 2)

  // --- Les statuts et les surfaces ----------------------------------------
  const count = (s: Farm['status']) => farms.filter((f) => f.status === s).length
  check('AO1', `${origin} : 6 טרם נוצר קשר · 10 מוכן לחתימה · 7 נחתם · 1 · 1`,
    count('to_contact') === 6 &&
      count('verbal_ok') === 10 &&
      count('signed') === 7 &&
      count('not_relevant_now') === 1 &&
      count('on_hold') === 1,
    `${count('to_contact')}/${count('verbal_ok')}/${count('signed')}/${count('not_relevant_now')}/${count('on_hold')}`)
  const cultivated = farms.reduce((s, f) => s + f.farmDunams, 0)
  const grazing = farms.reduce((s, f) => s + f.grazingDunams, 0)
  check('AO1.4', `${origin} : 8 830 dounams מעובד`, cultivated === 8830, String(cultivated))
  check('AO1.4', `${origin} : 54 000 dounams מרעה`, grazing === 54000, String(grazing))
  const weighted = farms.reduce((s, f) => s + weightedDunams(f), 0)
  check('AO1.4', `${origin} : dounams pondérés = 9 910 (8 830 + 54 000 × 0,02)`,
    weighted === 9910, String(weighted))
  check('AO1', `${origin} : שטחים שמירה vide partout (AL1 : c’est un geste du PO)`,
    farms.every((f) => guardedDunamsOf(f) === null && !f.guardedDunamsManual))
  check('AO1', `${origin} : aucun document reçu, aucun סוג הסכם`,
    farms.every((f) => (f.providedDocuments ?? []).length === 0 && !f.landAgreement))
  const zeroGrazing = ['02 - מושב פתיש עדר בקר', '06 - חוות נעמ״א']
  check('AO1', `${origin} : « מרעה 0 » ne pose pas le drapeau de saisie`,
    zeroGrazing.every((n) => byName(n)?.grazingDunams === 0 && !byName(n)?.grazingDunamsManual))
  const unknown = farms.filter((f) => effectiveAreas(f).total === 0)
  check('AO1', `${origin} : sans surface → nature inconnue`,
    unknown.every((f) => f.type === 'unknown'), String(unknown.length))
  const comments = farms.filter((f) => f.notes !== '')
  check('AO1', `${origin} : sept commentaires du PO, recopiés tels quels`,
    comments.length === 7, comments.map((f) => f.name).join(' | '))
  check('AO1', `${origin} : dix-huit fiches sans commentaire, et vraiment vides`,
    farms.filter((f) => f.notes === '').length === 18)
}

const sqlLiteral = (v: unknown): string => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * ⚠️ LE BLOC CI-DESSOUS NE S'EXÉCUTE QU'EN LIGNE DE COMMANDE. `aocaptures`
 *    importe `buildFarms` pour servir les 25 exploitations au bundle déployé ;
 *    sans ce garde-fou, l'import rejouerait la porte ET appellerait
 *    `process.exit`, ce qui tuerait le script appelant avant sa première
 *    capture.
 */
const mode = process.argv[2] ?? 'verify'

if (!import.meta.main) {
  /* importé : rien ne tourne */
} else if (mode === 'check') {
  /* Ce que Postgres a rendu, repassé par la même traduction que l'app. */
  const rows = JSON.parse(readFileSync(process.argv[3], 'utf8')) as Record<string, unknown>[]
  const back = rows.map((r) => MAPPINGS.farms.fromRows(r, {}))
  verify(back, null, 'base réelle')
  console.log(`\n${passed} PASS / ${failed} FAIL`)
  process.exit(failed === 0 ? 0 : 1)
} else {
  const { farms, pairing } = buildFarms()

  if (mode === 'sql') {
    const out = process.argv[3] ?? 'docs/ao/ao1-prod.sql'
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * ⚠️⚠️ UNE MISE À JOUR N'ÉCRIT QUE LES COLONNES DU PORTAIL, ET C'EST LA
     *      DÉCISION LA PLUS IMPORTANTE DE CE FICHIER.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * La première version émettait un `insert … on conflict do update set`
     * qui REPOUSSAIT LES CINQUANTE ET UNE COLONNES. Sur les quinze fiches
     * d'AK1, cela aurait écrasé tout ce que le PO a posé depuis dans l'app —
     * une photo, une visite, un תיק אתר, une surface gardée acceptée d'un
     * geste (AL1), un contact ajouté — parce que la reprise n'en sait rien et
     * les aurait donc remis à `null`.
     *
     * Le portail ne connaît que ces colonnes-là. Tout le reste appartient à
     * l'app et n'est PAS touché.
     *
     * ⚠️ `notes` N'EST ÉCRIT QUE QUAND LE PORTAIL PORTE UN COMMENTAIRE. Sept
     *    lignes en ont un ; les dix-huit autres laissent la note de l'app
     *    telle quelle, parce qu'une colonne vide au portail veut dire « le PO
     *    n'a rien écrit LÀ », pas « efface ce qu'il a écrit ICI ».
     */
    /**
     * ═══════════════════════════════════════════════════════════════════════
     * ★★ ET TROIS DE CES COLONNES NE S'ÉCRASENT PAS : ELLES SE COMPLÈTENT.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * ⚠️ VU EN LISANT LA BASE AVANT D'ÉCRIRE, le 2026-09-24 : trois fiches
     *    (`farm-ak1-11` הר-שמש, `-12` זעק, `-13` מרגי) portaient un
     *    `updated_at` du jour. Le PO avait DÉPLACÉ LEURS ÉPINGLES à la main
     *    — de 45 à 210 m — et choisi `legal_entity = 'herder'` sur מרגי, que
     *    le portail ne connaît pas. Une reprise « le portail fait autorité »
     *    aurait remis les trois épingles à la coordonnée du portail et effacé
     *    son choix, sans que rien ne le dise.
     *
     * · `lat` / `lng` / `position_missing` — le portail ne sert QUE les fiches
     *   que l'app n'a pas encore placées. **Une épingle posée par le PO gagne
     *   toujours** : c'est lui qui a vu le terrain, pas le tableur.
     * · `legal_entity`, `farmer_name`, `farmer_phone`, `farmer_id_no` — le
     *   portail gagne QUAND IL A UNE VALEUR ; une colonne vide au portail ne
     *   vide jamais celle de l'app.
     *
     * Le reste (nom, statut, nature, surfaces) est bien au portail : c'est la
     * raison d'être de la reprise.
     */
    const PORTAL_COLUMNS = [
      'name',
      'status',
      'type',
      'farm_dunams',
      'grazing_dunams',
      'farm_dunams_manual',
      'grazing_dunams_manual',
    ]
    /** Le portail comble un vide, il n'écrase pas une valeur. */
    const FILL_ONLY = ['legal_entity', 'farmer_name', 'farmer_phone', 'farmer_id_no']
    const lines: string[] = [
      '-- AO1 — la reprise des 25 exploitations du portail, pour `lo-yanum-prod`.',
      '--',
      '-- ⚠️ À JOUER APRÈS `20260924000100_status_not_relevant_now_on_hold.sql` :',
      "--    Postgres refuse d'utiliser une valeur d'enum ajoutée dans la même",
      "--    transaction que son ajout. Les statuts `not_relevant_now` et",
      '--    `on_hold` sont utilisés ici.',
      '--',
      `-- ${pairing.updates.length} MISES À JOUR : les identifiants d'AK1 sont conservés, et`,
      '--   SEULES les colonnes que le portail connaît sont écrites. Tout ce que',
      "--   le PO a posé dans l'app depuis AK1 (photo, visite, תיק אתר, שטחים",
      '--   שמירה, contacts) reste intact.',
      `-- ${pairing.creations.length} CRÉATIONS : \`farm-ao1-01\` … \`farm-ao1-10\`.`,
      '-- Aucun doublon, aucune fusion : voir `bun run aodata`.',
      '',
      'begin;',
      '',
    ]
    const updateIds = new Set(pairing.updates.map((u) => u.id))
    const renamed = new Map(pairing.updates.map((u) => [u.id, u.renamedFrom]))
    for (const farm of farms) {
      const parent = MAPPINGS.farms.toRows(farm)[0].rows[0]
      if (updateIds.has(farm.id)) {
        const was = renamed.get(farm.id)
        const sets = PORTAL_COLUMNS.map((c) => `  ${c} = ${sqlLiteral(parent[c])}`)
        /* Le portail comble un vide, il n'écrase jamais une valeur de l'app. */
        for (const c of FILL_ONLY) {
          sets.push(`  ${c} = coalesce(nullif(${sqlLiteral(parent[c])}, ''), ${c})`)
        }
        /* ★ L'ÉPINGLE DU PO GAGNE. Le portail ne sert que les fiches que
           l'app n'a pas encore placées (`position_missing`). */
        sets.push(
          `  lat = case when position_missing then ${sqlLiteral(parent.lat)} else lat end`,
          `  lng = case when position_missing then ${sqlLiteral(parent.lng)} else lng end`,
          `  position_missing = case when position_missing then ${sqlLiteral(parent.position_missing)} else false end`,
        )
        if (farm.notes !== '') sets.push(`  notes = ${sqlLiteral(farm.notes)}`)
        lines.push(
          `-- MISE À JOUR ${farm.id} — ${farm.name}${was ? `  (renommée depuis « ${was} »)` : ''}`,
          `update public.entities set`,
          sets.join(',\n'),
          `where id = ${sqlLiteral(farm.id)};`,
          '',
        )
      } else {
        const cols = Object.keys(parent)
        lines.push(
          `-- CRÉATION ${farm.id} — ${farm.name}`,
          `insert into public.entities (${cols.join(', ')})`,
          `values (${cols.map((c) => sqlLiteral(parent[c])).join(', ')})`,
          `on conflict (id) do nothing;`,
          '',
        )
      }
    }
    lines.push(
      '-- Le contrôle : vingt-cinq lignes, dix au nouvel identifiant.',
      "select count(*) as total, count(*) filter (where id like 'farm-ao1-%') as creees",
      '  from public.entities',
      "  where id like 'farm-ak1-%' or id like 'farm-ao1-%';",
      '',
      'commit;',
    )
    writeFileSync(out, lines.join('\n') + '\n')
    console.log(
      `${farms.length} fiches → ${out} (${pairing.updates.length} mises à jour, ${pairing.creations.length} créations)`,
    )
  } else {
    verify(farms, pairing, 'jeu construit')
    /* Aller-retour par la traduction de l'app : ce qui sort est ce qui rentre. */
    const round = farms.map((f) => {
      const parent = MAPPINGS.farms.toRows(f)[0].rows[0]
      return MAPPINGS.farms.fromRows(JSON.parse(JSON.stringify(parent)), {})
    })
    verify(round, null, 'aller-retour lignes')
    console.log(`\n${passed} PASS / ${failed} FAIL`)
    process.exit(failed === 0 ? 0 : 1)
  }
}
