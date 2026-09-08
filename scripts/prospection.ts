import { readFileSync } from 'node:fs'

import * as XLSX from 'xlsx'

import {
  HOME_BASE,
  LAND_AGREEMENT_OPTIONS,
  WEIGHTED_DUNAM,
  WEIGHTED_DUNAM_TARGET,
  analyseProspection,
  applyProspection,
  getVisibleFarms,
  identityKey,
  landRightIssue,
  optionLabel,
  prospectionExportMatrix,
  regionById,
  regionOf,
  resetStore,
  splitLegacyDunams,
  targetProgress,
  weightedDunams,
} from '../src/core/index'
import { _raw } from '../src/core/store'
import type { Farm } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A75 … A80 — LE CLASSEUR DE PROSPECTION, ET LA PONDÉRATION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run prospection
 *
 * ★ IT RUNS ON THE REAL FILE. `docs/samples/prospection-sud.xlsx` is the
 *   product owner's own workbook — 198 rows, 193 with coordinates, the
 *   gershayim in « סמל יישוב (למ״ס) » and the em dash in « נייד — איש קשר »
 *   exactly as his spreadsheet writes them. A fixture of our own making would
 *   have proved that this importer reads a file this repository wrote, which
 *   is the one thing nobody needs to know.
 *
 * ★ AND IT IS PURE — no browser, no dev server. Everything asserted here is a
 *   claim about @core, and a claim about @core should not need Chromium to
 *   answer. `bun run import` (A44) covers the wizard's own screens.
 *
 *   A75  198 rows processed, 193 placed on the map, at the right coordinates.
 *   A76  the same file again: 0 created, 198 updated, 0 duplicates.
 *   A77  the same file with cells EMPTIED: nothing the app holds is erased.
 *   A78  export → import: every row finds its record, and nothing changed.
 *   A79  the weighting: 800 · 5 000 · 200+1 000.
 *   A80  the land-right warning, on each of its four answers.
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
console.log('  A75 · A76 · A77 · A78 · A79 · A80 — PROSPECTION')
console.log('  ==============================================')

/** The sheet as the wizard hands it over: a header row and a string matrix. */
function readSheet(path: string, sheetName: string): { headers: string[]; matrix: string[][] } {
  /* ⚠️ READ AS BYTES, NOT BY PATH. SheetJS's `readFile` uses whatever file
     shim it detects; under Bun it picks a branch that cannot open a path with
     a space in it, and this repository lives in one. */
  const book = XLSX.read(readFileSync(path), { type: 'buffer' })
  const sheet = book.Sheets[sheetName]
  if (!sheet) throw new Error(`no sheet ${sheetName} in ${path}`)
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
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

/** A store holding nothing but what this script puts in it. */
function emptyFarms(): void {
  resetStore()
  _raw().farms = []
}

const { headers, matrix } = readSheet(FILE, SHEET)

// ---------------------------------------------------------------------------
section('A75 — the first import of the real workbook')
// ---------------------------------------------------------------------------

check(
  'AC2 · every one of the 32 headers is recognised',
  (() => {
    const { mapping } = analyseProspection(headers, [], [])
    return mapping.every((f) => f !== 'ignore')
  })(),
  (() => {
    const { mapping } = analyseProspection(headers, [], [])
    const missed = headers.filter((_, i) => mapping[i] === 'ignore')
    return missed.length ? `unrecognised: ${missed.join(' | ')}` : `${headers.length} columns`
  })(),
)

emptyFarms()
const first = analyseProspection(headers, matrix, getVisibleFarms())

check(
  'A75 · 198 rows read from the sheet',
  first.rows.length === 198,
  `${first.rows.length} rows`,
)
check(
  'A75 · none of them is rejected',
  first.plan.rejected.length === 0,
  first.plan.rejected
    .slice(0, 5)
    .map((r) => `line ${r.rowNumber}: ${r.problems.join(',')}`)
    .join(' · ') || 'no rejects',
)
check(
  'A75 · 193 carry a usable position',
  first.plan.positioned === 193,
  `${first.plan.positioned} positioned, ${198 - first.plan.positioned} without`,
)

const applied = applyProspection(first.plan, HOME_BASE)
check(
  'A75 · 198 records created',
  applied.created === 198 && applied.updated === 0,
  `created=${applied.created} updated=${applied.updated}`,
)

/**
 * ★ AND THEY LAND WHERE THE SHEET SAYS. « Vérifier qu'elles atterrissent au
 *   bon endroit sur la carte » — which is not "they have a position" but "the
 *   position is the one in the file". Checked row by row against the sheet's
 *   own two columns, not against a total.
 */
{
  const iLat = headers.findIndex((h) => h.trim() === 'קו רוחב')
  const iLng = headers.findIndex((h) => h.trim() === 'קו אורך')
  const iName = headers.findIndex((h) => h.trim() === 'שם המקום (כפי שיישלח אליהם)')
  const farms = getVisibleFarms()
  const wrong: string[] = []
  let compared = 0
  for (const raw of matrix) {
    /* ⚠️ THE BLANK CHECK COMES FIRST. `Number('')` is 0, which is finite and
       is a real point in the Gulf of Guinea; testing finiteness alone let the
       five rows with no coordinates into a comparison against 0,0. */
    if (raw[iLat].trim() === '' || raw[iLng].trim() === '') continue
    const lat = Number(raw[iLat])
    const lng = Number(raw[iLng])
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
    const farm = farms.find((f) => f.name === raw[iName])
    if (!farm) {
      wrong.push(`${raw[iName]} missing`)
      continue
    }
    compared++
    if (Math.abs(farm.position.lat - lat) > 1e-9 || Math.abs(farm.position.lng - lng) > 1e-9) {
      wrong.push(`${farm.name} ${farm.position.lat},${farm.position.lng} ≠ ${lat},${lng}`)
    }
  }
  check(
    'A75 · every positioned row is at its own coordinates',
    wrong.length === 0 && compared === 193,
    wrong.slice(0, 4).join(' · ') || `${compared} compared`,
  )

  const missing = farms.filter((f) => f.positionMissing)
  check(
    'A75 · the five without coordinates are parked and marked מיקום חסר',
    missing.length === 5 &&
      missing.every(
        (f) => f.position.lat === HOME_BASE.lat && f.position.lng === HOME_BASE.lng,
      ),
    missing.map((f) => f.name).join(' · '),
  )
}

/** AA4.5 — the region column, and the polygons where it is silent. */
{
  const farms = getVisibleFarms()
  const named = farms.filter((f) => f.regionId !== null && f.regionId !== undefined)
  const wrong = named.filter((f) => regionById(f.regionId ?? null)?.name !== f.region)
  check(
    'AA4.5 · the אזור column pins the standard region when it names one',
    named.length === 198 && wrong.length === 0,
    `${named.length} pinned, ${wrong.length} mismatched`,
  )
  /**
   * ★ AND THE POLYGON IS WHAT ANSWERS WHEN THE COLUMN DOES NOT. Asked of a row
   *   whose אזור cell says something no region is called: the standard region
   *   must stay UNPINNED (`regionId: null`), which is precisely what makes
   *   `farmRegion` fall through to `regionOf(position)` with no special case.
   *
   * ⚠️ NOT ASKED AS « every placed row falls inside an outline ». The outlines
   *    in `regions.ts` are hand-written approximations and say so; a handful of
   *    the product owner's rows sit outside all of them, which is a fact about
   *    the map and not a defect of the importer. Testing it here would make
   *    this gate fail the day somebody redraws a seam by 200 m.
   */
  const strange = analyseProspection(
    ['שם המקום', 'אזור (באפליקציה)', 'קו רוחב', 'קו אורך'],
    [['מקום בדוי', 'אזור שלא קיים', '31.04393', '34.72177']],
    [],
  )
  const row = strange.rows[0]
  check(
    'AA4.5 · an unknown אזור leaves the region to the polygons, and is reported',
    row.patch.regionId === undefined &&
      row.warnings.includes('warnUnknownRegion') &&
      row.unknown.length === 1 &&
      regionOf(row.patch.position as { lat: number; lng: number }) === 'negev',
    `regionId=${String(row.patch.regionId)} warnings=${row.warnings.join(',')} polygon=${String(
      regionOf(row.patch.position as { lat: number; lng: number }),
    )}`,
  )
}

/** AA4.6 · AA4.7 — the two columns that are read and thrown away. */
{
  const farms = getVisibleFarms()
  const withArea = farms.filter((f) => f.farmDunams > 0 || f.grazingDunams > 0)
  check(
    'AA4.6 · « אומדן סדר גודל » never became an area',
    withArea.length === 0,
    withArea.length ? `${withArea.length} farms carry an area from the estimate` : '198 at 0/0',
  )
  check(
    'AA4.7 · and the weighted figure is the app’s own computation',
    farms.every((f) => weightedDunams(f) === 0),
    'nothing imported from the משוקלל column',
  )
}

// ---------------------------------------------------------------------------
section('A76 — the same file again')
// ---------------------------------------------------------------------------

{
  const before = getVisibleFarms().length
  const again = analyseProspection(headers, matrix, getVisibleFarms())
  check(
    'A76 · 0 created, 198 updated',
    again.plan.created.length === 0 && again.plan.updated.length === 198,
    `created=${again.plan.created.length} updated=${again.plan.updated.length}`,
  )
  const applied2 = applyProspection(again.plan, HOME_BASE)
  check(
    'A76 · the roster is still 198 long',
    getVisibleFarms().length === before && applied2.created === 0,
    `${getVisibleFarms().length} farms`,
  )
  check(
    'A76 · and the second pass changes nothing at all',
    again.plan.updated.every((u) => u.changes.length === 0),
    again.plan.updated
      .filter((u) => u.changes.length > 0)
      .slice(0, 4)
      .map((u) => `${u.row.name}: ${u.changes.join(',')}`)
      .join(' · ') || 'no field differs',
  )
  const keys = new Set(getVisibleFarms().map((f) => identityKey(f)))
  check(
    'A76 · no two records share an identity key',
    keys.size === getVisibleFarms().length,
    `${keys.size} keys for ${getVisibleFarms().length} farms`,
  )
}

// ---------------------------------------------------------------------------
section('A77 — the same file with cells emptied')
// ---------------------------------------------------------------------------

{
  /**
   * The scenario the rule exists for: the coordinator types four facts into
   * the APP, then re-imports the sheet he has not typed them into.
   */
  const farms = _raw().farms
  const target = farms.find((f) => f.localityCode === 1177)
  if (!target) throw new Error('טללים (1177) not found')
  target.farmerName = 'יוסי כהן'
  target.farmerPhone = '052-0001234'
  target.notes = 'סיכום שיחה מיום שלישי'
  target.farmDunams = 800
  // A typed area IS an override — G15's flag, set the way the form sets it.
  target.farmDunamsManual = true
  target.landAgreement = 'perpetual_lease'

  /** Every cell but the identity emptied, on every row. */
  /* AC2 — the identity is now the holding AND the locality, so the columns
     that must survive the blanking are five, not three. */
  const keep = new Set([
    'שם המקום (כפי שיישלח אליהם)',
    'שם החווה',
    'שם החקלאי',
    'יישוב',
    'סמל יישוב (למ״ס)',
    'מועצה אזורית',
  ])
  const blanked = matrix.map((raw) =>
    raw.map((cell, i) => (keep.has(headers[i]?.trim() ?? '') ? cell : '')),
  )

  const third = analyseProspection(headers, blanked, getVisibleFarms())
  check(
    'A77 · every emptied row still matches its record',
    third.plan.created.length === 0 && third.plan.updated.length === 198,
    `created=${third.plan.created.length} updated=${third.plan.updated.length}`,
  )
  applyProspection(third.plan, HOME_BASE)

  const after = getVisibleFarms().find((f) => f.localityCode === 1177)
  check(
    'A77 · the four facts typed in the app are untouched',
    after?.farmerName === 'יוסי כהן' &&
      after?.farmerPhone === '052-0001234' &&
      after?.notes === 'סיכום שיחה מיום שלישי' &&
      after?.farmDunams === 800 &&
      after?.landAgreement === 'perpetual_lease',
    `farmer=${after?.farmerName} phone=${after?.farmerPhone} dunams=${after?.farmDunams} agreement=${after?.landAgreement}`,
  )
  check(
    'A77 · and a blanked coordinate column does not un-place a farm',
    getVisibleFarms().filter((f) => f.positionMissing).length === 5,
    `${getVisibleFarms().filter((f) => f.positionMissing).length} marked מיקום חסר`,
  )
}

// ---------------------------------------------------------------------------
section('A78 — export, then import the export')
// ---------------------------------------------------------------------------

{
  const source = getVisibleFarms()
  const exported = prospectionExportMatrix(source)
  check(
    'A78 · the export has the workbook’s own 32 headers, in order',
    exported[0].length === headers.length &&
      exported[0].every((h, i) => h.trim() === headers[i].trim()),
    exported[0]
      .map((h, i) => (h.trim() === headers[i]?.trim() ? '' : `${i}: ${h} ≠ ${headers[i]}`))
      .filter(Boolean)
      .join(' · ') || `${exported[0].length} columns`,
  )
  check(
    'A78 · one row per record',
    exported.length === source.length + 1,
    `${exported.length - 1} rows for ${source.length} farms`,
  )

  const back = analyseProspection(exported[0], exported.slice(1), source)
  check(
    'A78 · every exported row finds its own record — nothing is created',
    back.plan.created.length === 0 && back.plan.rejected.length === 0,
    `created=${back.plan.created.length} rejected=${back.plan.rejected.length}`,
  )
  /**
   * ★★ AC2.2 — ONE FIELD MOVES ON THE FIRST PASS, AND IT IS THE FORMULA.
   *
   * The A77 section above typed « יוסי כהן » straight onto the טללים record,
   * which is what a coordinator does in the app — and the workbook's own
   * שם המקום formula says a row with a farmer and no farm name is called
   * « החווה של יוסי כהן ». The export writes that (it is the cell HIS Excel
   * would recompute anyway) and the re-import adopts it. Exactly one record,
   * exactly one field, by the association's own rule — and the SECOND round
   * trip is a pure identity, which is what makes it a rename and not a drift.
   */
  const drifted = back.plan.updated.filter((u) => u.changes.length > 0)
  check(
    'A78 · one record is renamed by the workbook’s own formula, and nothing else moves',
    drifted.length === 1 && drifted[0].changes.join(',') === 'name',
    drifted
      .slice(0, 6)
      .map((u) => `${u.row.name}: ${u.changes.join(',')}`)
      .join(' · ') || 'round trip is an identity',
  )
  applyProspection(back.plan, HOME_BASE)
  const settled = getVisibleFarms()
  const again2 = analyseProspection(
    prospectionExportMatrix(settled)[0],
    prospectionExportMatrix(settled).slice(1),
    settled,
  )
  const drifted2 = again2.plan.updated.filter((u) => u.changes.length > 0)
  check(
    'A78 · and the second round trip is an identity',
    again2.plan.created.length === 0 && drifted2.length === 0,
    drifted2
      .slice(0, 4)
      .map((u) => `${u.row.name}: ${u.changes.join(',')}`)
      .join(' · ') || `${again2.plan.updated.length} updated, nothing changed`,
  )
  check(
    'A78 · no unknown list value on the way back in',
    back.plan.unknown.length === 0,
    back.plan.unknown
      .slice(0, 4)
      .map((u) => `line ${u.rowNumber} ${u.header}=${u.value}`)
      .join(' · ') || 'every value re-read',
  )
}

// ---------------------------------------------------------------------------
section('A79 — the weighting')
// ---------------------------------------------------------------------------

check(
  'A79 · 800 cultivated = 800',
  weightedDunams({ farmDunams: 800, grazingDunams: 0 }) === 800,
  String(weightedDunams({ farmDunams: 800, grazingDunams: 0 })),
)
check(
  'A79 · 5 000 grazing = 100',
  weightedDunams({ farmDunams: 0, grazingDunams: 5000 }) === 100,
  String(weightedDunams({ farmDunams: 0, grazingDunams: 5000 })),
)
check(
  'A79 · 200 cultivated + 1 000 grazing = 220',
  weightedDunams({ farmDunams: 200, grazingDunams: 1000 }) === 220,
  String(weightedDunams({ farmDunams: 200, grazingDunams: 1000 })),
)
check(
  'A79 · the coefficients are the 1:50 ratio, named',
  WEIGHTED_DUNAM.cultivated === 1 && WEIGHTED_DUNAM.grazing === 1 / 50,
  `cultivated=${WEIGHTED_DUNAM.cultivated} grazing=${WEIGHTED_DUNAM.grazing}`,
)
check(
  'A79 · and the target is the workbook’s 100 000',
  WEIGHTED_DUNAM_TARGET === 100_000 &&
    targetProgress(25_000) === 25 &&
    targetProgress(118_000) === 118,
  `target=${WEIGHTED_DUNAM_TARGET} 25000→${targetProgress(25_000)}% 118000→${targetProgress(118_000)}%`,
)

/** AA2 — the single-area migration rule, on its three branches. */
check(
  'AA2 · a single area goes to מעובד for an arable holding',
  JSON.stringify(splitLegacyDunams(430, 'agriculture')) ===
    JSON.stringify({ farmDunams: 430, grazingDunams: 0 }),
  JSON.stringify(splitLegacyDunams(430, 'agriculture')),
)
check(
  'AA2 · to מרעה for a herd',
  JSON.stringify(splitLegacyDunams(430, 'livestock')) ===
    JSON.stringify({ farmDunams: 0, grazingDunams: 430 }),
  JSON.stringify(splitLegacyDunams(430, 'livestock')),
)
check(
  'AA2 · and to zero/zero when the kind does not say',
  JSON.stringify(splitLegacyDunams(430, 'mixed')) ===
    JSON.stringify({ farmDunams: 0, grazingDunams: 0 }),
  JSON.stringify(splitLegacyDunams(430, 'mixed')),
)

// ---------------------------------------------------------------------------
section('A80 — the right over the land')
// ---------------------------------------------------------------------------

{
  const TODAY = '2026-09-07'
  const at = (landAgreement: string, landAgreementUntil: string | null = null) =>
    landRightIssue({ landAgreement, landAgreementUntil }, TODAY)

  check('A80 · a perpetual lease is established', at('perpetual_lease') === 'none', at('perpetual_lease'))
  check(
    'A80 · הצהרת חקלאים בלבד is not a document of rights',
    at('farmer_declaration') === 'no_document',
    at('farmer_declaration'),
  )
  check('A80 · אין מסמך warns', at('no_document') === 'no_document', at('no_document'))
  check('A80 · לא ידוע warns', at('unknown_agreement') === 'no_document', at('unknown_agreement'))
  check('A80 · and so does a record with nothing written', at('') === 'unset', at(''))
  check(
    'A80 · a lapsed date warns even on the strongest lease',
    at('perpetual_lease', '2026-09-06') === 'expired',
    at('perpetual_lease', '2026-09-06'),
  )
  check(
    'A80 · today is not lapsed',
    at('perpetual_lease', TODAY) === 'none',
    at('perpetual_lease', TODAY),
  )
  check(
    'A80 · the three weak kinds are declared weak in the one list',
    LAND_AGREEMENT_OPTIONS.filter((o) => !o.establishesRight)
      .map((o) => o.id)
      .join(',') === 'farmer_declaration,no_document,unknown_agreement',
    LAND_AGREEMENT_OPTIONS.filter((o) => !o.establishesRight)
      .map((o) => optionLabel(o.id, LAND_AGREEMENT_OPTIONS))
      .join(' · '),
  )
  /** AA2bis warns; it never blocks — the record is unchanged by the answer. */
  /* Any imported row but טללים, whose agreement the A77 section typed in. */
  const farm = getVisibleFarms().find((f) => !f.landAgreement) as Farm
  check(
    'A80 · warning only: the record is untouched by the verdict',
    landRightIssue(farm, TODAY) === 'unset' && farm.status !== 'declined',
    `${farm.name}: issue=${landRightIssue(farm, TODAY)} status=${farm.status}`,
  )
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
