import { readFileSync } from 'node:fs'

import * as XLSX from 'xlsx'

import {
  ASSOCIATION_COLUMNS,
  HOME_BASE,
  analyseAssociation,
  analyseProspection,
  applyAssociation,
  applyProspection,
  associationCoords,
  associationDate,
  associationExportMatrix,
  associationInputs,
  associationPhone,
  associationSignatures,
  canonicalDate,
  canonicalPhone,
  coordinateOrder,
  getVisibleFarms,
  guessAssociationMapping,
  identityKey,
  readAssociationCoords,
  resetStore,
} from '../src/core/index'
import { matrixToCsv } from '../src/core/xlsx'
import { _raw } from '../src/core/store'
import type { AssociationInput, Farm } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A94 · A95 · A96 — L'EXPORT AU FORMAT DE L'ASSOCIATION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run assoc
 *
 * ★ IT RUNS ON THE PRODUCT OWNER'S OWN WORKBOOK, like `bun run prospection`:
 *   the 198 southern rows are imported first, and the export is taken of THAT
 *   — not of a fixture written to please the exporter. A file of our own
 *   making would prove that this code reads what this code wrote.
 *
 *   A94  the seventeen headers, in their order, plus the second מיקום;
 *        coordinates in LONGITUDE, LATITUDE; telephones `(0XX) XXX-XXXX`;
 *        dates `JJ/MM/AAAA`.
 *   A95  export → re-import: no row is created, nothing that had a value
 *        loses it or changes.
 *   A96→AC3  שטחים שמירה est une déclaration : remplie, par défaut
 *        מעובד + מרעה, écrasable à la main. La règle d'AB est renversée.
 *
 * ★ AND THE COORDINATE ORDER IS REFUSED IN BOTH DIRECTIONS, which is the
 *   product owner's own wording: « ajoute une vérification qui échoue si
 *   l'ordre est inversé, dans les deux sens ».
 */

const FILE = 'docs/samples/prospection-sud.xlsx'
const SHEET = 'רשימה'

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

console.log('')
console.log('  A94 · A95 · A96 — THE ASSOCIATION EXPORT')
console.log('  =========================================')

function readSheet(path: string, sheet: string): { headers: string[]; matrix: string[][] } {
  const book = XLSX.read(readFileSync(path), { type: 'buffer' })
  const name = book.SheetNames.includes(sheet) ? sheet : book.SheetNames[0]
  const grid = XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })
  const headers = (grid[0] as unknown[]).map((c) => String(c ?? ''))
  const matrix = grid
    .slice(1)
    .map((r) => (r as unknown[]).map((c) => String(c ?? '')))
    .filter((r) => r.some((c) => c.trim() !== ''))
  return { headers, matrix }
}

resetStore()
_raw().farms = []

// ---------------------------------------------------------------------------
section('The formats their system expects')
// ---------------------------------------------------------------------------

check(
  'A94 · a telephone is written (0XX) XXX-XXXX',
  associationPhone('052-0000001') === '(052) 000-0001',
  associationPhone('052-0000001'),
)
check(
  'A94 · and read back to the shape this app stores',
  canonicalPhone('(052) 000-0001') === '052-0000001',
  canonicalPhone('(052) 000-0001'),
)
check(
  'A94 · a number that is not ten digits is left exactly as it was',
  associationPhone('08-1234') === '08-1234' && canonicalPhone('08-1234') === '08-1234',
  `${associationPhone('08-1234')} / ${canonicalPhone('08-1234')}`,
)
check(
  'A94 · a date is written JJ/MM/AAAA',
  associationDate('2027-03-09') === '09/03/2027',
  associationDate('2027-03-09'),
)
check(
  'A94 · and read back to YYYY-MM-DD',
  canonicalDate('09/03/2027') === '2027-03-09' && canonicalDate('2027-03-09') === '2027-03-09',
  `${canonicalDate('09/03/2027')} / ${canonicalDate('2027-03-09')}`,
)
check(
  'A94 · an empty or unreadable date stays empty',
  associationDate('') === '' && canonicalDate('demain') === '',
  `[${associationDate('')}] [${canonicalDate('demain')}]`,
)

// ---------------------------------------------------------------------------
section('A94 — the coordinate order, refused in BOTH directions')
// ---------------------------------------------------------------------------

/* Their own example, from the brief: « 35.501401, 32.371810 ». */
check(
  'A94 · longitude, latitude is what their format is',
  coordinateOrder(35.501401, 32.37181) === 'lng-lat',
  coordinateOrder(35.501401, 32.37181),
)
check(
  'A94 · latitude, longitude — the standard order — is REFUSED',
  coordinateOrder(32.37181, 35.501401) === 'lat-lng',
  coordinateOrder(32.37181, 35.501401),
)
check(
  'A94 · and the refusal survives the overlap of the two ranges',
  /* 33.9 is a plausible latitude AND a plausible longitude. The pair is still
     decided, because in this country the longitude is always the larger. */
  coordinateOrder(33.9, 33.6) === 'lng-lat' && coordinateOrder(33.6, 33.9) === 'lat-lng',
  `${coordinateOrder(33.9, 33.6)} / ${coordinateOrder(33.6, 33.9)}`,
)
check(
  'A94 · a pair outside the country is neither',
  coordinateOrder(2.35, 48.85) === 'outside' && coordinateOrder(48.85, 2.35) === 'outside',
  `${coordinateOrder(2.35, 48.85)} / ${coordinateOrder(48.85, 2.35)}`,
)
check(
  'A94 · a swapped cell is read as null, not as a place',
  readAssociationCoords('32.371810, 35.501401').position === null,
  JSON.stringify(readAssociationCoords('32.371810, 35.501401')),
)
check(
  'A94 · a correct cell round-trips to the exact point',
  (() => {
    const p = { lat: 31.123456, lng: 34.987654 }
    const back = readAssociationCoords(associationCoords(p)).position
    return back !== null && back.lat === p.lat && back.lng === p.lng
  })(),
  associationCoords({ lat: 31.123456, lng: 34.987654 }),
)

// ---------------------------------------------------------------------------
section('A94 — the columns, exactly and in order')
// ---------------------------------------------------------------------------

/** ⚠️ TRANSCRIBED FROM THE BRIEF, NOT FROM THE CODE. */
const WANTED = [
  'שם המקום',
  'איש קשר',
  'נייד איש קשר',
  'הסכם רעיה/חכירה',
  'שטחי מרעה',
  'שטחים מעובדים',
  'שטחים שמירה',
  'כמות התנדבויות',
  'תאריך תפוגה הסכם קרקע',
  'כמות מתנדבים קבועים',
  'מיקום',
  'חתימה',
  'הצהרת חקלאי',
  'סיווג מוסד',
  'מוסד',
  'שם העסק',
  'מייל חקלאי',
]

const headersOut = ASSOCIATION_COLUMNS.map((c) => c.header)

check(
  'A94 · the seventeen headers appear, in the brief’s order',
  (() => {
    /* A subsequence match: the eighteenth column — the second מיקום — is
       inserted, and everything else must still be in this order. */
    let i = 0
    for (const h of headersOut) if (h === WANTED[i]) i++
    return i === WANTED.length
  })(),
  headersOut.join(' | '),
)
check(
  'A94 · there are TWO columns called מיקום, and they hold different things',
  (() => {
    const at = headersOut.reduce<number[]>((acc, h, i) => (h === 'מיקום' ? [...acc, i] : acc), [])
    if (at.length !== 2) return false
    return (
      ASSOCIATION_COLUMNS[at[0]].source !== ASSOCIATION_COLUMNS[at[1]].source &&
      ASSOCIATION_COLUMNS[at[0]].format === 'coords'
    )
  })(),
  headersOut.filter((h) => h === 'מיקום').length + ' columns named מיקום',
)
/**
 * ★★ AH8 (2026-09-09) — LE COMPTE PASSE DE DIX-HUIT À VINGT ET UN, ET LA PORTE
 *    CHANGE DE FORME PLUTÔT QUE DE DISPARAÎTRE.
 *
 * Ce qu'elle protégeait était « rien d'INVENTÉ ne s'ajoute au fichier de
 * l'association ». Le PO a nommé trois informations qui devaient avoir leur
 * propre colonne et n'en avaient aucune (ת״ז / ח״פ, שם החווה, תאריך חתימה) ;
 * une porte qui compte ne peut pas distinguer un ajout demandé d'un ajout
 * subi. Elle nomme donc désormais les trois, et refuse toute quatrième.
 */
const AH8_ADDED = ['ת״ז / ח״פ', 'שם החווה', 'תאריך חתימה']
check(
  'A94/AH8 · le fichier est les dix-huit, plus les TROIS colonnes nommées par le PO',
  headersOut.length === WANTED.length + 1 + AH8_ADDED.length &&
    AH8_ADDED.every((h) => headersOut.includes(h)),
  `${headersOut.length} columns`,
)
check(
  'AH8 · et chacune des douze informations du brief a SA propre colonne',
  (() => {
    const NEEDED = [
      'איש קשר', 'ת״ז / ח״פ', 'נייד איש קשר', 'שם החווה', 'מיקום',
      'תאריך חתימה', 'שטחים מעובדים', 'שטחי מרעה', 'שטחים שמירה',
      'הסכם רעיה/חכירה', 'תאריך תפוגה הסכם קרקע', 'חתימה',
    ]
    return NEEDED.every((h) => headersOut.includes(h))
  })(),
)

// ---------------------------------------------------------------------------
section('The real workbook, imported and then exported')
// ---------------------------------------------------------------------------

const { headers, matrix } = readSheet(FILE, SHEET)
{
  const analysis = analyseProspection(headers, matrix, getVisibleFarms())
  applyProspection(analysis.plan, HOME_BASE)
}
const farms = getVisibleFarms()
check('198 farms in the store to export', farms.length === 198, `${farms.length}`)

/**
 * ⚠️ THE COUNTS AND THE SIGNATURE ARE INJECTED, NOT READ FROM THE FIXTURE.
 *    The prospection workbook carries neither, and the three columns that need
 *    them (התנדבויות · מתנדבים קבועים · חתימה) would otherwise be tested only
 *    in their empty state — which is the state that never goes wrong.
 */
/**
 * ⚠️ AND SO ARE THE FOUR FIELDS THE WORKBOOK ITSELF LEAVES EMPTY. Measured on
 *    his file: not one of the 198 rows carries a farmer, a mobile, a kind of
 *    land agreement or an expiry — it is a PROSPECTION list, and AA4's whole
 *    point is that those columns get filled in the app afterwards. Testing the
 *    telephone and date formats against 198 empty cells would be testing
 *    nothing, so three records are given the values a worked row has.
 */
{
  const worked = _raw().farms
  for (let i = 0; i < 3; i++) {
    worked[i].farmerName = `חקלאי ${i + 1}`
    worked[i].farmerPhone = `05${i}-000000${i + 1}`
    worked[i].landAgreement = i === 0 ? 'farmer_declaration' : 'perpetual_lease'
    worked[i].landAgreementUntil = '2027-03-09'
    worked[i].legalEntity = 'private_farmer'
    worked[i].contacts = [
      {
        id: `c${i}`,
        name: `חקלאי ${i + 1}`,
        phone: `05${i}-000000${i + 1}`,
        email: `farm${i + 1}@example.org`,
        role: '',
        photo: null,
        isPrimary: true,
      },
    ]
  }
}

const inputs: AssociationInput[] = associationInputs(getVisibleFarms()).map((row, i) =>
  i < 3
    ? {
        ...row,
        volunteering: 7 + i,
        regulars: 2,
        signature: 'data:image/png;base64,iVBORw0KGgo=',
      }
    : row,
)

const { matrix: out, report } = associationExportMatrix(inputs)

check('A94 · one header row and one row per farm', out.length === 199, `${out.length} rows`)
check(
  'A94 · the header row is the column list, verbatim',
  JSON.stringify(out[0]) === JSON.stringify(headersOut),
  out[0].slice(0, 4).join(' | '),
)
check(
  'A94 · every coordinate cell is longitude, latitude',
  report.badCoordinates.length === 0,
  report.badCoordinates.map((r) => `${r.name}: ${r.text}`).slice(0, 3).join(' · ') ||
    'checked on the way out, on every row',
)
{
  const iCoords = headersOut.findIndex((_, i) => ASSOCIATION_COLUMNS[i].format === 'coords')
  const withCoords = out.slice(1).filter((r) => r[iCoords] !== '')
  const sample = withCoords[0]?.[iCoords] ?? ''
  const [a, b] = sample.split(',').map((x) => Number(x))
  check(
    `A94 · and the first of them reads ${sample}`,
    withCoords.length > 0 && a > b && coordinateOrder(a, b) === 'lng-lat',
    `${withCoords.length} rows carry a point`,
  )
}
{
  const iPhone = ASSOCIATION_COLUMNS.findIndex((c) => c.format === 'phone')
  const phones = out.slice(1).map((r) => r[iPhone]).filter((v) => v !== '')
  const bad = phones.filter((v) => !/^\(0\d{2}\) \d{3}-\d{4}$/.test(v))
  check(
    'A94 · every telephone written is (0XX) XXX-XXXX',
    phones.length > 0 && bad.length === 0,
    bad.slice(0, 3).join(' · ') || `${phones.length} numbers`,
  )
}
{
  const iDate = ASSOCIATION_COLUMNS.findIndex((c) => c.format === 'date')
  const dates = out.slice(1).map((r) => r[iDate]).filter((v) => v !== '')
  const bad = dates.filter((v) => !/^\d{2}\/\d{2}\/\d{4}$/.test(v))
  check(
    'A94 · every date written is JJ/MM/AAAA',
    dates.length > 0 && bad.length === 0,
    bad.slice(0, 3).join(' · ') || `${dates.length} dates`,
  )
}
{
  const iSig = ASSOCIATION_COLUMNS.findIndex((c) => c.source === 'signature')
  const sigs = out.slice(1).map((r) => r[iSig]).filter((v) => v !== '')
  check(
    'A94 · the signature travels in the AA5 shape (a data URI in the cell)',
    sigs.length === 3 && sigs.every((v) => v.startsWith('data:image/')),
    `${sigs.length} signatures`,
  )
}

// ---------------------------------------------------------------------------
section('A96 → AC3 — שטחים שמירה est une DÉCLARATION, et elle sort remplie')
// ---------------------------------------------------------------------------

/**
 * ⚠️ THIS SECTION SAYS THE OPPOSITE OF WHAT IT SAID IN AB, AND ON PURPOSE.
 *    A96 asserted the column was never written, because AB6.4 read it as an
 *    erroneous copy of « שטחים מעובדים ». The product owner has ruled: it is a
 *    DECLARATION their system fills deliberately — « nous surveillons la
 *    totalité de cette surface » — so the default IS the whole holding and the
 *    old assertion is now the defect. The gate is rewritten rather than
 *    deleted so the reversal is on the record.
 */
{
  const iGuard = headersOut.indexOf('שטחים שמירה')
  const iCult = headersOut.indexOf('שטחים מעובדים')
  const iGraze = headersOut.indexOf('שטחי מרעה')
  const empty = out.slice(1).filter((r) => r[iGuard] === '')
  check(
    'AC3.3 · every row carries a guarded area — the column no longer comes out blank',
    empty.length === 0,
    `${empty.length} empty of ${out.length - 1}`,
  )
  const wrong = out
    .slice(1)
    .filter((r) => Number(r[iGuard]) !== Number(r[iCult] || 0) + Number(r[iGraze] || 0))
  check(
    'AC3.1 · and by default it is מעובד + מרעה, on every row',
    wrong.length === 0,
    wrong.length ? `${wrong.length} rows differ` : `${out.length - 1} rows`,
  )
  check(
    'AC3.3 · the export no longer reports it as a column this app does not hold',
    !report.blanks.some((b) => b.header === 'שטחים שמירה'),
    report.blanks.map((b) => `${b.header}(${b.reason})`).join(' · ') || 'no blanks reported',
  )
  /* AC3.2 — a figure the coordinator typed is what goes out, not the default. */
  const one = associationExportMatrix([
    { ...inputs[0], guardedDunams: 42 },
  ]).matrix[1]
  check(
    'AC3.2 · a declared figure overrides the default in the file',
    one[iGuard] === '42',
    `[${one[iGuard]}]`,
  )
}

// ---------------------------------------------------------------------------
section('A95 — the round trip')
// ---------------------------------------------------------------------------

const before = new Map(getVisibleFarms().map((f) => [f.id, JSON.parse(JSON.stringify(f)) as Farm]))

{
  const outHeaders = out[0]
  const outBody = out.slice(1)
  const mapping = guessAssociationMapping(outHeaders)
  check(
    'A95 · every column of our own export is recognised on the way back',
    mapping.filter((m) => m === 'ignore').length === 0,
    mapping.filter((m) => m === 'ignore').length + ' ignored',
  )
  check(
    'A95 · and the two מיקום columns are told apart by POSITION',
    (() => {
      const at = outHeaders.reduce<number[]>((a, h, i) => (h === 'מיקום' ? [...a, i] : a), [])
      return at.length === 2 && mapping[at[0]] === 'coordinates' && mapping[at[1]] === 'localityName'
    })(),
    JSON.stringify(
      outHeaders.map((h, i) => (h === 'מיקום' ? mapping[i] : null)).filter(Boolean),
    ),
  )

  const back = analyseAssociation(outHeaders, outBody, getVisibleFarms(), mapping)
  check(
    'A95 · not one row is created — every one found its own record',
    back.plan.created.length === 0,
    `${back.plan.created.length} created, ${back.plan.updated.length} matched`,
  )
  check(
    'A95 · and every one of the 198 matched',
    back.plan.updated.length === 198,
    `${back.plan.updated.length}`,
  )
  check(
    'A95 · nothing is rejected',
    back.plan.rejected.length === 0,
    back.plan.rejected.slice(0, 3).map((r) => `line ${r.rowNumber}: ${r.problems.join(',')}`).join(' · ') ||
      'no rejects',
  )

  applyAssociation(back.plan, associationSignatures(back.rows), 'round-trip.xlsx', HOME_BASE)

  const after = getVisibleFarms()
  check('A95 · still 198 records, no duplicate', after.length === 198, `${after.length}`)

  /**
   * ⚠️ THE ASSERTION IS « NO LOSS », NOT « NO CHANGE », AND THE DIFFERENCE IS
   *    DELIBERATE. Their format has no column for סמל יישוב, for the region,
   *    for the notes or for the two liaison fields, so a re-import must not
   *    touch them — that is the loss being tested. It MAY fill something that
   *    was empty (a signature arriving, a farmer's name their file carries and
   *    ours did not), and that is a gain, reported below rather than failed.
   */
  const lost: string[] = []
  const gained: string[] = []
  const IGNORED = new Set(['status', 'signature', 'signatureOrigin', 'signatureMissing'])
  for (const farm of after) {
    const was = before.get(farm.id)
    if (!was) continue
    const a = was as unknown as Record<string, unknown>
    const b = farm as unknown as Record<string, unknown>
    for (const key of Object.keys(a)) {
      if (IGNORED.has(key)) continue
      const wasSet = a[key] !== undefined && a[key] !== null && a[key] !== ''
      const same = JSON.stringify(a[key]) === JSON.stringify(b[key])
      if (same) continue
      if (wasSet) lost.push(`${farm.name}.${key}: ${JSON.stringify(a[key])} → ${JSON.stringify(b[key])}`)
      else gained.push(`${key}`)
    }
  }
  check(
    'A95 · no field that had a value lost it or changed',
    lost.length === 0,
    lost.slice(0, 5).join(' · ') || `${gained.length} previously-empty fields filled`,
  )
  check(
    'A95 · the three signatures came back attached',
    after.filter((f) => (f.signature ?? '').startsWith('data:image/')).length === 3,
    `${after.filter((f) => (f.signature ?? '').startsWith('data:image/')).length}`,
  )
}

// ---------------------------------------------------------------------------
section('AB6.1 — and the same matrix as CSV')
// ---------------------------------------------------------------------------

{
  const csv = matrixToCsv(out)
  check('the CSV opens with a UTF-8 BOM', csv.charCodeAt(0) === 0xfeff, `U+${csv.charCodeAt(0).toString(16)}`)
  check('records are separated by CRLF', csv.includes('\r\n'), 'CRLF')
  check(
    'the first line is the eighteen headers, each quoted',
    csv.slice(1).split('\r\n')[0] === headersOut.map((h) => `"${h}"`).join(','),
    csv.slice(1).split('\r\n')[0].slice(0, 60),
  )
  check(
    'a cell containing a comma survives it',
    (() => {
      const line = matrixToCsv([['a,b', 'c"d']]).slice(1).trim()
      return line === '"a,b","c""d"'
    })(),
    matrixToCsv([['a,b', 'c"d']]).slice(1).trim(),
  )
  check(
    'and the CSV has exactly as many lines as the matrix',
    csv.slice(1).trim().split('\r\n').length === out.length,
    `${csv.slice(1).trim().split('\r\n').length} / ${out.length}`,
  )
}

// ---------------------------------------------------------------------------
section('AB6.2 — the identity a re-import matches on')
// ---------------------------------------------------------------------------

check(
  'their format carries no סמל יישוב, so the key is the name + the מוסד',
  identityKey({ localityCode: null, name: 'חוות בודדים', council: 'רמת נגב' }) !==
    identityKey({ localityCode: null, name: 'חוות בודדים', council: 'שדות נגב' }),
  identityKey({ localityCode: null, name: 'חוות בודדים', council: 'רמת נגב' }),
)

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
