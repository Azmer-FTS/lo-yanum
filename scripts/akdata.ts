import { readFileSync, writeFileSync } from 'node:fs'

import {
  FARM_STATUS_OPTIONS,
  HOME_BASE,
  LEGAL_ENTITY_OPTIONS,
  canonicalPhone,
  effectiveAreas,
  guardedDunamsOf,
  readAssociationCoords,
  readOption,
  typeFromAreas,
  weightedDunams,
} from '../src/core/index'
import type { Farm } from '../src/core/index'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AK1 — LES QUINZE EXPLOITATIONS DU PORTAIL DE L'ASSOCIATION. A192 · A193 · A194
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run akdata                 → vérifie le jeu construit (A192–A194)
 *   bun run akdata sql <out.sql>   → écrit l'insertion pour `lo-yanum-prod`
 *   bun run akdata check <rows>    → relit ce que la base a RENDU (JSON d'un
 *                                    `select` sur entities) et le vérifie
 *
 * ★ LA SOURCE EST RECOPIÉE TELLE QUELLE, colonne « מיקום » comprise, dans
 *   L'ORDRE DE LEUR PORTAIL : longitude, latitude. Elle passe par
 *   `readAssociationCoords`, le lecteur de l'application, qui refuse l'ordre
 *   inversé dans les deux sens (AB6 piège 1). Aucun couple n'est retourné à la
 *   main ici : si le lecteur se trompait, la porte le verrait.
 *
 * ★ LA NATURE EST DÉDUITE DES SURFACES (`typeFromAreas`), et de rien d'autre :
 *   un nom qui dit « גד״ש » n'est pas une surface déclarée.
 */

interface SourceRow {
  name: string
  contact: string
  phone: string
  idNo: string
  status: string
  grazing: string
  cultivated: string
  coords: string
}

/* Recopié du brief AK1, ligne pour ligne. */
const SOURCE: SourceRow[] = [
  { name: 'גד״ש דביר', contact: 'לירן', phone: '052-606-7361', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '' },
  { name: 'גד״ש להב', contact: 'אמיר פרץ', phone: '054-661-4679', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '' },
  { name: 'גד״ש רוחמה', contact: 'רו (מנכ״ל)', phone: '054-799-5091', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '' },
  { name: 'גד״ש שומריה', contact: 'אלחנן', phone: '054-667-3596', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '' },
  { name: 'גד״ש תדהר — החווה של אופק', contact: 'אופק', phone: '052-532-1261', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '' },
  { name: 'חוות אורחאן', contact: 'צביקה שלמה', phone: '050-627-0230', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '' },
  { name: 'משק ישי ספז', contact: 'ישי ספז', phone: '052-606-7344', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '34.3175954, 31.2056556' },
  { name: 'קיבוץ להב — חווה טיפולית', contact: 'ניר', phone: '052-684-1023', idNo: '', status: 'טרם נוצר קשר', grazing: '', cultivated: '', coords: '' },
  { name: 'בקר מושב אמציה', contact: 'שימי רוזן', phone: '050-885-1686', idNo: '570014266', status: 'נחתם', grazing: '26 000', cultivated: '', coords: '34.9001389, 31.5406799' },
  { name: 'דני בראל לכיש', contact: 'דני בראל', phone: '050-968-8262', idNo: '', status: 'מוכן לחתימה', grazing: '21 000', cultivated: '', coords: '' },
  { name: 'חוות הר-שמש', contact: 'הר שמש מושב שיתופי', phone: '055-684-9979', idNo: '570055368', status: 'נחתם', grazing: '', cultivated: '', coords: '34.8401384, 31.3926639' },
  { name: 'חוות זעק', contact: 'דוד דהן', phone: '052-323-1260', idNo: '', status: 'מוכן לחתימה', grazing: '1 000', cultivated: '100', coords: '34.8640847, 31.4131105' },
  { name: 'חוות מרגי', contact: 'יונתן מרגי', phone: '050-891-2840', idNo: '021985189', status: 'נחתם', grazing: '5 000', cultivated: '', coords: '35.034498, 31.670483' },
  { name: 'חוות ניסים', contact: 'ניסים פרץ', phone: '050-540-4866', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '', coords: '34.6739116, 31.4908558' },
  { name: 'משק שלם', contact: 'רותם', phone: '055-050-5055', idNo: '', status: 'מוכן לחתימה', grazing: '', cultivated: '1 000', coords: '' },
]

/**
 * La forme juridique, là où la SOURCE la dit en toutes lettres et nulle part
 * ailleurs : cinq noms commencent par « גד״ש », et le contact de הר-שמש
 * s'appelle « מושב שיתופי ». Le ח״פ 57… de בקר מושב אמציה ne dit pas LAQUELLE
 * des formes il désigne (AK1.3) : la case reste vide.
 */
function legalEntityOf(row: SourceRow): string | undefined {
  if (row.name.startsWith('גד״ש')) return readOption('גד״ש', LEGAL_ENTITY_OPTIONS)?.id
  if (row.contact.includes('מושב שיתופי')) return readOption('מושב שיתופי', LEGAL_ENTITY_OPTIONS)?.id
  return undefined
}

const area = (raw: string): number => {
  const cleaned = raw.replace(/[\s,]/g, '')
  return cleaned === '' ? 0 : Number(cleaned)
}

export function buildFarms(): Farm[] {
  return SOURCE.map((row, i): Farm => {
    const grazing = area(row.grazing)
    const cultivated = area(row.cultivated)
    const read = readAssociationCoords(row.coords)
    if (row.coords !== '' && read.position === null) {
      throw new Error(`coordonnées illisibles pour ${row.name}: ${row.coords} (${read.order})`)
    }
    const status = readOption(row.status, FARM_STATUS_OPTIONS)
    if (!status) throw new Error(`statut inconnu: ${row.status}`)
    return {
      id: `farm-ak1-${String(i + 1).padStart(2, '0')}`,
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
      /* Le drapeau de saisie seulement sur un vrai chiffre (AA4 · AD1.5). */
      farmDunamsManual: cultivated > 0 ? true : undefined,
      grazingDunamsManual: grazing > 0 ? true : undefined,
      contacts: [],
      commitments: [],
      agreements: [],
      notes: '',
      lastVisitAt: null,
      nextVisitAt: null,
      photo: null,
      legalEntity: legalEntityOf(row),
      farmerName: row.contact,
      farmerPhone: canonicalPhone(row.phone),
      /* ⚠️ AK1.4 — du TEXTE, recopié caractère pour caractère : 021985189. */
      farmerId: row.idNo === '' ? undefined : row.idNo,
      /* AK1.5 — aucun document reçu, et pas de סוג הסכם : la colonne est vide. */
      /* AK1.6 — שטחים שמירה : rien. */
    }
  })
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

/** Le parc d'Adoulam (פארק עדולם), au sud de Beit Shemesh. */
const ADULLAM = { lat: 31.655, lng: 34.95 }

function verify(farms: Farm[], origin: string): void {
  const byName = (n: string) => farms.find((f) => f.name === n)

  // A192
  check('A192', `${origin} : quinze fiches`, farms.length === 15, String(farms.length))
  const labels = farms.flatMap((f) => [f.name, f.farmerName ?? '', f.farmName ?? ''])
  const starred = labels.filter((l) => /[*★☆⭐✱✳]/u.test(l))
  check('A192', `${origin} : aucune étoile dans un libellé`, starred.length === 0, starred.join(' | '))
  const expected: Record<string, Farm['status']> = {}
  SOURCE.slice(0, 8).forEach((r) => (expected[r.name] = 'to_contact'))
  ;['בקר מושב אמציה', 'חוות הר-שמש', 'חוות מרגי'].forEach((n) => (expected[n] = 'signed'))
  ;['דני בראל לכיש', 'חוות זעק', 'חוות ניסים', 'משק שלם'].forEach((n) => (expected[n] = 'verbal_ok'))
  const wrong = Object.entries(expected).filter(([n, s]) => byName(n)?.status !== s)
  check('A192', `${origin} : statuts justes (8 טרם נוצר קשר, 3 נחתם, 4 מוכן לחתימה)`, wrong.length === 0, wrong.map(([n]) => n).join(', '))
  const ids = Object.fromEntries(farms.filter((f) => f.farmerId).map((f) => [f.name, f.farmerId]))
  check('A192', `${origin} : ת״ז/ח״פ en texte, zéro initial gardé`,
    ids['חוות מרגי'] === '021985189' && ids['בקר מושב אמציה'] === '570014266' && ids['חוות הר-שמש'] === '570055368' && Object.keys(ids).length === 3,
    JSON.stringify(ids))
  check('A192', `${origin} : aucun document reçu, aucun סוג הסכם`,
    farms.every((f) => (f.providedDocuments ?? []).length === 0 && !f.landAgreement))

  // A193
  const placed = farms.filter((f) => !f.positionMissing)
  check('A193', `${origin} : six fiches positionnées (six מיקום dans la source), neuf sans`, placed.length === 6, String(placed.length))
  const inIsrael = placed.every(
    (f) => f.position.lat > 29.4 && f.position.lat < 33.4 && f.position.lng > 34.2 && f.position.lng < 35.95 && f.position.lng > f.position.lat,
  )
  check('A193', `${origin} : chaque point tombe en Israël (lat 29–33, lng 34–36)`, inIsrael,
    placed.map((f) => `${f.name} ${f.position.lat},${f.position.lng}`).join(' | '))
  const margi = byName('חוות מרגי')
  const d = margi ? km(margi.position, ADULLAM) : Infinity
  check('A193', `${origin} : חוות מרגי dans la région d'Adoulam`, d < 12, `${d.toFixed(1)} km du parc`)
  const safaz = byName('משק ישי ספז')
  check('A193', `${origin} : משק ישי ספז = lat 31.2056556, lng 34.3175954`,
    safaz?.position.lat === 31.2056556 && safaz?.position.lng === 34.3175954)

  // A194
  const zaak = byName('חוות זעק')
  check('A194', `${origin} : חוות זעק = 1 000 מרעה ET 100 מעובד, nature mixte`,
    zaak?.grazingDunams === 1000 && zaak?.farmDunams === 100 && zaak?.type === 'mixed')
  const shalem = byName('משק שלם')
  check('A194', `${origin} : משק שלם = 1 000 מעובד, 0 מרעה, חקלאות seule`,
    shalem?.farmDunams === 1000 && shalem?.grazingDunams === 0 && shalem?.type === 'agriculture')
  check('A194', `${origin} : שטחים שמירה vide partout`,
    farms.every((f) => guardedDunamsOf(f) === null && !f.guardedDunamsManual))
  const grazingOnly = ['בקר מושב אמציה', 'דני בראל לכיש', 'חוות מרגי']
  check('A194', `${origin} : מרעה seul → livestock, sans surface recopiée`,
    grazingOnly.every((n) => byName(n)?.type === 'livestock' && byName(n)?.farmDunams === 0))
  const unknown = farms.filter((f) => effectiveAreas(f).total === 0)
  check('A194', `${origin} : sans surface → nature inconnue`, unknown.every((f) => f.type === 'unknown'), String(unknown.length))
  const weighted = farms.reduce((s, f) => s + weightedDunams(f), 0)
  check('AK1.7', `${origin} : dounams pondérés = 2 160`, weighted === 2160, String(weighted))
}

const sqlLiteral = (v: unknown): string => {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

const mode = process.argv[2] ?? 'verify'
const farms = buildFarms()

if (mode === 'sql') {
  const out = process.argv[3] ?? 'ak1.sql'
  const statements: string[] = ['begin;']
  for (const farm of farms) {
    for (const table of MAPPINGS.farms.toRows(farm)) {
      for (const row of table.rows) {
        const cols = Object.keys(row)
        statements.push(
          `insert into public.${table.table} (${cols.join(', ')}) values (${cols
            .map((c) => sqlLiteral(row[c]))
            .join(', ')}) on conflict (id) do nothing;`,
        )
      }
    }
  }
  statements.push('commit;')
  writeFileSync(out, statements.join('\n') + '\n')
  console.log(`${farms.length} fiches → ${out}`)
} else if (mode === 'check') {
  /* Ce que Postgres a rendu, repassé par la même traduction que l'app. */
  const rows = JSON.parse(readFileSync(process.argv[3], 'utf8')) as Record<string, unknown>[]
  const back = rows.map((r) => MAPPINGS.farms.fromRows(r, {}))
  verify(back, 'base réelle')
  console.log(`\n${passed} PASS / ${failed} FAIL`)
  process.exit(failed === 0 ? 0 : 1)
} else {
  verify(farms, 'jeu construit')
  /* Aller-retour par la traduction de l'app : ce qui sort est ce qui rentre. */
  const round = farms.map((f) => {
    const parent = MAPPINGS.farms.toRows(f)[0].rows[0]
    return MAPPINGS.farms.fromRows(JSON.parse(JSON.stringify(parent)), {})
  })
  verify(round, 'aller-retour lignes')
  console.log(`\n${passed} PASS / ${failed} FAIL`)
  process.exit(failed === 0 ? 0 : 1)
}
