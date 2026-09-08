import { readFileSync } from 'node:fs'

import * as XLSX from 'xlsx'

import {
  HOME_BASE,
  NEGLECT_DAYS_INITIAL,
  PROSPECTION_COLUMNS,
  analyseAssociation,
  analyseProspection,
  applyProspection,
  associationExportMatrix,
  associationInputs,
  availableVolunteers,
  availableVolunteersByRegion,
  composePlaceName,
  coverageState,
  farmGuardStats,
  getVisibleFarms,
  guardedDunamsOf,
  identityKey,
  prospectionExportMatrix,
  resetStore,
  volunteerRegion,
  weightedDunams,
} from '../src/core/index'
import { _raw } from '../src/core/store'
import type { Farm, Mission, Volunteer } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A97 … A107 — LA CLÉ D'IDENTITÉ, LE CLASSEUR À 32 COLONNES, LA SURFACE
 *              GARDÉE ET L'ÉQUITÉ DE RÉPARTITION.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run acpass
 *
 * ★ IT RUNS ON THE PRODUCT OWNER'S OWN WORKBOOK — the new one, 32 columns,
 *   one row per HOLDING. A fixture of our own making would prove that this
 *   importer reads a file this repository wrote, which is the one thing
 *   nobody needs to know.
 *
 *   A97   four holdings in ONE locality: four records, no fusion.
 *   A98   the new workbook re-imported: 0 created, updates only.
 *   A99   an amorce row, then the same row with both names filled: the record
 *         is UPDATED, not duplicated.
 *   A100  in `bun run acui` — it is a question about the sheet chooser, and
 *         the sheet chooser lives in a browser.
 *   A101  שם המקום read from its calculated value, and never written back as
 *         a formula.
 *   A102  שטחים שמירה: default = מעובד + מרעה, a typed figure is never
 *         overwritten, and a typed zero freezes nothing.
 *   A103  the weighting is untouched by the guarded area: 800 / 100 / 220.
 *   A104  the guard counters, cancelled excluded, and the last-guard date.
 *   A105  מתנדבים זמינים identical for two farms of one vivier.
 *   A106  in `bun run acui` — sorting and filtering is a screen.
 *   A107  the export: 32 columns, שטחים שמירה filled, round trip with no loss
 *         and no duplicate — plus the association's own 18-column format.
 *
 * ★ AND IT IS PURE — no browser, no dev server. Every claim here is a claim
 *   about @core, and a claim about @core should not need Chromium to answer.
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
console.log('  A97 … A107 — AC1 · AC2 · AC3 · AC4')
console.log('  ==================================')

/** The sheet as the wizard hands it over: a header row and a string matrix. */
function readSheet(path: string, sheetName: string): { headers: string[]; matrix: string[][] } {
  /* ⚠️ READ AS BYTES, NOT BY PATH — SheetJS's `readFile` picks a shim under
     Bun that cannot open a path with a space in it, and this repo lives in
     one. Same note as `bun run prospection`. */
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

function emptyFarms(): void {
  resetStore()
  _raw().farms = []
}

const { headers, matrix } = readSheet(FILE, SHEET)
const col = (header: string): number => headers.findIndex((h) => h.trim() === header)

const I_NAME = col('שם המקום (כפי שיישלח אליהם)')
const I_FARM = col('שם החווה')
const I_FARMER = col('שם החקלאי')
const I_LOCALITY = col('יישוב')
const I_CODE = col('סמל יישוב (למ״ס)')
const I_CULT = col('שטח מעובד (דונם)')
const I_GRAZE = col('שטח מרעה (דונם)')
const I_GUARD = col('שטחים שמירה (דונם)')

// ---------------------------------------------------------------------------
section('A97 — quatre exploitations dans une seule localité')
// ---------------------------------------------------------------------------

/**
 * ★★ THE CASE THE WHOLE PASS EXISTS FOR, IN THE PRODUCT OWNER'S OWN WORDS:
 *    « dans בארי il peut y avoir quatre agriculteurs, chacun avec ses dounams
 *      et son contrat. »
 *
 * Built by DUPLICATING one of his own rows and changing only the two name
 * columns, which is exactly what his מקרא sheet tells a coordinator to do:
 * « להוספת חווה נוספת באותו יישוב: לשכפל את השורה ולשנות שם החווה ושם החקלאי ».
 */
const FOUR = [
  ['חוות הבשור', 'יוסי כהן'],
  ['חוות הבשור', 'דוד לוי'],
  ['משק הדרום', 'אברהם מזרחי'],
  ['', 'שמעון בן דוד'],
]

function bariRows(): string[][] {
  const seed = matrix.find((r) => r[I_CODE].trim() === '1177')
  if (!seed) throw new Error('טללים (1177) not in the workbook')
  return FOUR.map(([farm, farmer]) => {
    const row = [...seed]
    row[I_FARM] = farm
    row[I_FARMER] = farmer
    /* ⚠️ The name cell is left as the workbook computed it for the SEED row.
       That is the honest shape of a duplicated line before Excel recalculates,
       and it is the one that proves the importer composes the name itself
       rather than trusting the cell (A101). */
    return row
  })
}

{
  emptyFarms()
  const rows = bariRows()
  const analysis = analyseProspection(headers, rows, getVisibleFarms())
  check(
    'A97 · four rows sharing one סמל יישוב are four creations, none rejected',
    analysis.plan.created.length === 4 &&
      analysis.plan.updated.length === 0 &&
      analysis.plan.rejected.length === 0,
    `created=${analysis.plan.created.length} updated=${analysis.plan.updated.length} rejected=${analysis.plan.rejected.length}`,
  )
  applyProspection(analysis.plan, HOME_BASE)
  const farms = getVisibleFarms()
  check(
    'A97 · four records, and every one keeps its own farmer',
    farms.length === 4 &&
      new Set(farms.map((f) => f.farmerName)).size === 4,
    farms.map((f) => `${f.farmName ?? '—'}/${f.farmerName ?? '—'}`).join(' · '),
  )
  check(
    'A97 · four distinct identity keys — nothing is written over anything',
    new Set(farms.map((f) => identityKey(f))).size === 4,
    [...new Set(farms.map((f) => identityKey(f)))].join(' · '),
  )
  check(
    'A97 · and all four carry the same locality code, which is the point',
    farms.every((f) => f.localityCode === 1177),
    farms.map((f) => String(f.localityCode)).join(','),
  )
  /* AC1.3 — and the very same four rows again change nothing. */
  const again = analyseProspection(headers, rows, getVisibleFarms())
  check(
    'A97 · the same four rows again: 0 created, 4 updated, nothing changed',
    again.plan.created.length === 0 &&
      again.plan.updated.length === 4 &&
      again.plan.updated.every((u) => u.changes.length === 0),
    `created=${again.plan.created.length} updated=${again.plan.updated.length}`,
  )
}

// ---------------------------------------------------------------------------
section('A98 — le nouveau classeur, réimporté')
// ---------------------------------------------------------------------------

emptyFarms()
{
  const first = analyseProspection(headers, matrix, getVisibleFarms())
  check(
    'A98 · 198 rows, 198 creations, nothing rejected',
    first.plan.created.length === 198 && first.plan.rejected.length === 0,
    `created=${first.plan.created.length} rejected=${first.plan.rejected.length}`,
  )
  applyProspection(first.plan, HOME_BASE)

  const again = analyseProspection(headers, matrix, getVisibleFarms())
  check(
    'A98 · the same file again: 0 created, 198 updated',
    again.plan.created.length === 0 && again.plan.updated.length === 198,
    `created=${again.plan.created.length} updated=${again.plan.updated.length}`,
  )
  check(
    'A98 · and not one field moves on the second pass',
    again.plan.updated.every((u) => u.changes.length === 0),
    again.plan.updated
      .filter((u) => u.changes.length > 0)
      .slice(0, 4)
      .map((u) => `${u.row.name}: ${u.changes.join(',')}`)
      .join(' · ') || 'no field differs',
  )
  applyProspection(again.plan, HOME_BASE)
  check(
    'A98 · the roster is still 198 long, and every key is unique',
    getVisibleFarms().length === 198 &&
      new Set(getVisibleFarms().map((f) => identityKey(f))).size === 198,
    `${getVisibleFarms().length} farms`,
  )
  /**
   * ⚠️ AND THE DUPLICATE OF AB'S A95 IS RE-ASKED WITH THE NEW KEY. 193
   *    creations on a re-import of our own association export was the defect
   *    that closed AB6.7; the identity has changed under it since, so the
   *    question has to be asked again rather than assumed.
   */
  const assoc = associationExportMatrix(associationInputs(getVisibleFarms()))
  const back = analyseAssociation(
    assoc.matrix[0],
    assoc.matrix.slice(1),
    getVisibleFarms(),
  )
  check(
    'A98 · re-importing our own association export still creates nothing',
    back.plan.created.length === 0 && back.plan.updated.length === 198,
    `created=${back.plan.created.length} updated=${back.plan.updated.length}`,
  )
}

// ---------------------------------------------------------------------------
section('A99 — une amorce, puis les deux noms remplis')
// ---------------------------------------------------------------------------

{
  emptyFarms()
  const seed = matrix.find((r) => r[I_CODE].trim() === '1177') as string[]
  const first = analyseProspection(headers, [seed], getVisibleFarms())
  applyProspection(first.plan, HOME_BASE)
  const created = getVisibleFarms()[0]
  check(
    'A99 · the amorce row creates ONE record, with neither name filled',
    getVisibleFarms().length === 1 &&
      created.farmName === undefined &&
      created.farmerName === undefined &&
      created.name === 'טללים',
    `${created.name} farm=${String(created.farmName)} farmer=${String(created.farmerName)}`,
  )

  const filled = [...seed]
  filled[I_FARM] = 'חוות טללים'
  filled[I_FARMER] = 'רות אברהמי'
  const second = analyseProspection(headers, [filled], getVisibleFarms())
  check(
    'A99 · filling both names UPDATES the amorce rather than duplicating it',
    second.plan.created.length === 0 && second.plan.updated.length === 1,
    `created=${second.plan.created.length} updated=${second.plan.updated.length}`,
  )
  applyProspection(second.plan, HOME_BASE)
  const after = getVisibleFarms()
  check(
    'A99 · still one record, now carrying the holding and its new name',
    after.length === 1 &&
      after[0].id === created.id &&
      after[0].farmName === 'חוות טללים' &&
      after[0].farmerName === 'רות אברהמי' &&
      after[0].name === 'חוות טללים - החווה של רות אברהמי',
    `${after.length} records · ${after[0].name}`,
  )
  /* And the promoted record is now matched by its full key, not by promotion. */
  const third = analyseProspection(headers, [filled], getVisibleFarms())
  check(
    'A99 · and the third pass matches on the full key, changing nothing',
    third.plan.created.length === 0 &&
      third.plan.updated.length === 1 &&
      third.plan.updated[0].changes.length === 0,
    third.plan.updated[0]?.changes.join(',') || 'nothing changed',
  )
  /**
   * ★ AC1.3, THE CASE THAT WOULD HAVE BITTEN SILENTLY: a coordinator typed a
   *   farmer's name into the APP, and then re-imports the untouched workbook,
   *   whose row for that locality is still an amorce. It must find the record
   *   it belongs to, not make a second one.
   */
  const backToSeed = analyseProspection(headers, [seed], getVisibleFarms())
  check(
    'A99 · an amorce row still finds the record whose names were filled since',
    backToSeed.plan.created.length === 0 && backToSeed.plan.updated.length === 1,
    `created=${backToSeed.plan.created.length} updated=${backToSeed.plan.updated.length}`,
  )
  applyProspection(backToSeed.plan, HOME_BASE)
  check(
    'A99 · and the amorce did not erase the two names it does not carry',
    getVisibleFarms()[0].farmName === 'חוות טללים' &&
      getVisibleFarms()[0].farmerName === 'רות אברהמי',
    `${getVisibleFarms()[0].farmName} / ${getVisibleFarms()[0].farmerName}`,
  )
}

// ---------------------------------------------------------------------------
section('A101 — שם המקום, lue calculée et jamais réécrite')
// ---------------------------------------------------------------------------

{
  /**
   * ★ THE CELL IS A FORMULA IN HIS FILE, AND THE VALUE IS WHAT SHEETJS HANDS
   *   OVER. Read straight from the workbook, with the formula beside it, so
   *   this is a claim about HIS file rather than about our reader.
   */
  const book = XLSX.read(readFileSync(FILE), { type: 'buffer', cellFormula: true })
  const ws = book.Sheets[SHEET]
  const b2 = ws['B2'] as { f?: string; v?: unknown } | undefined
  check(
    'A101 · שם המקום IS a formula in the product owner’s workbook',
    typeof b2?.f === 'string' && b2.f.includes('החווה של'),
    b2?.f ?? 'no formula',
  )
  check(
    'A101 · and it is its CALCULATED value the importer reads',
    String(b2?.v ?? '') === 'טללים' && matrix[0][I_NAME] === 'טללים',
    `${String(b2?.v)} · ${matrix[0][I_NAME]}`,
  )
  /* The four branches of his own IF, against `composePlaceName`. */
  const cases: Array<[string, string, string, string]> = [
    ['', '', 'טללים', 'טללים'],
    ['חוות הבשור', '', 'טללים', 'חוות הבשור'],
    ['', 'יוסי כהן', 'טללים', 'החווה של יוסי כהן'],
    ['חוות הבשור', 'יוסי כהן', 'טללים', 'חוות הבשור - החווה של יוסי כהן'],
  ]
  const wrong = cases.filter(
    ([farmName, farmerName, locality, want]) =>
      composePlaceName({ farmName, farmerName, locality }) !== want,
  )
  check(
    'A101 · the app recomposes it on all four branches of his formula',
    wrong.length === 0,
    wrong
      .map(([a, b, c, want]) => `${a}|${b}|${c} → ${composePlaceName({ farmName: a, farmerName: b, locality: c })} ≠ ${want}`)
      .join(' · ') || '4 branches',
  )
  /**
   * ⚠️ « NE JAMAIS L'ÉCRIRE EN RETOUR » — the file on disk is untouched. The
   *    export is a NEW matrix; nothing this app does writes into his workbook,
   *    and no cell this app produces carries a formula.
   */
  emptyFarms()
  const one = analyseProspection(headers, bariRows(), getVisibleFarms())
  applyProspection(one.plan, HOME_BASE)
  const exported = prospectionExportMatrix(getVisibleFarms())
  check(
    'A101 · no exported cell is a formula — the values are written, not the rule',
    exported.slice(1).every((row) => row.every((cell) => !cell.startsWith('='))),
    'no leading "=" anywhere',
  )
  check(
    'A101 · and the exported name is the composition, not the cell that was read',
    exported.slice(1).map((r) => r[I_NAME]).sort().join(' | ') ===
      [
        'חוות הבשור - החווה של יוסי כהן',
        'חוות הבשור - החווה של דוד לוי',
        'משק הדרום - החווה של אברהם מזרחי',
        'החווה של שמעון בן דוד',
      ]
        .sort()
        .join(' | '),
    exported.slice(1).map((r) => r[I_NAME]).join(' | '),
  )
}

// ---------------------------------------------------------------------------
section('A102 — שטחים שמירה : le défaut, la déclaration, et le zéro')
// ---------------------------------------------------------------------------

{
  check(
    'A102 · the default is מעובד + מרעה',
    guardedDunamsOf({ farmDunams: 800, grazingDunams: 5000 }) === 5800,
    String(guardedDunamsOf({ farmDunams: 800, grazingDunams: 5000 })),
  )
  check(
    'A102 · a declared figure wins over the default',
    guardedDunamsOf({
      farmDunams: 800,
      grazingDunams: 5000,
      guardedDunams: 1200,
      guardedDunamsManual: true,
    }) === 1200,
    '1200',
  )
  /**
   * ⚠️ THE TRAP, NAMED IN THE BRIEF: « le drapeau ne doit pas se poser sur un
   *    zéro implicite, sinon les fiches se figent à zéro pour toujours ». A
   *    record holding a zero and NO flag still answers with the default, so a
   *    polygon drawn tomorrow still fills it.
   */
  check(
    'A102 · a zero with no flag does not freeze anything',
    guardedDunamsOf({ farmDunams: 800, grazingDunams: 100, guardedDunams: 0 }) === 900,
    String(guardedDunamsOf({ farmDunams: 800, grazingDunams: 100, guardedDunams: 0 })),
  )
  /* And the importer never sets the flag for a zero cell. */
  const zeroRow = analyseProspection(
    ['שם המקום', 'יישוב', 'שטח מעובד (דונם)', 'שטח מרעה (דונם)', 'שטחים שמירה (דונם)'],
    [['מקום בדוי', 'מקום בדוי', '800', '100', '0']],
    [],
  )
  check(
    'A102 · a zero in the שטחים שמירה cell sets no manual flag on import',
    zeroRow.rows[0].patch.guardedDunamsManual === undefined,
    String(zeroRow.rows[0].patch.guardedDunamsManual),
  )
  const declared = analyseProspection(
    ['שם המקום', 'יישוב', 'שטח מעובד (דונם)', 'שטח מרעה (דונם)', 'שטחים שמירה (דונם)'],
    [['מקום בדוי', 'מקום בדוי', '800', '100', '2500']],
    [],
  )
  check(
    'A102 · a figure that differs from the default IS a declaration',
    declared.rows[0].patch.guardedDunams === 2500 &&
      declared.rows[0].patch.guardedDunamsManual === true,
    `${String(declared.rows[0].patch.guardedDunams)} manual=${String(declared.rows[0].patch.guardedDunamsManual)}`,
  )
  const restated = analyseProspection(
    ['שם המקום', 'יישוב', 'שטח מעובד (דונם)', 'שטח מרעה (דונם)', 'שטחים שמירה (דונם)'],
    [['מקום בדוי', 'מקום בדוי', '800', '100', '900']],
    [],
  )
  check(
    'A102 · a cell that restates the default is the default, not an override',
    restated.rows[0].patch.guardedDunams === undefined &&
      restated.rows[0].patch.guardedDunamsManual === undefined,
    `${String(restated.rows[0].patch.guardedDunams)}`,
  )
  /* AC3.2 — a declared value is never overwritten by a later re-import. */
  emptyFarms()
  const start = analyseProspection(headers, bariRows(), getVisibleFarms())
  applyProspection(start.plan, HOME_BASE)
  const farms = _raw().farms
  farms[0].farmDunams = 800
  farms[0].grazingDunams = 100
  farms[0].guardedDunams = 2500
  farms[0].guardedDunamsManual = true
  const reimport = analyseProspection(headers, bariRows(), getVisibleFarms())
  applyProspection(reimport.plan, HOME_BASE)
  const kept = getVisibleFarms().find((f) => f.id === farms[0].id)
  check(
    'A102 · and a re-import of a file with a blank cell never overwrites it',
    kept?.guardedDunams === 2500 && kept?.guardedDunamsManual === true,
    `${String(kept?.guardedDunams)} manual=${String(kept?.guardedDunamsManual)}`,
  )
}

// ---------------------------------------------------------------------------
section('A103 — la pondération est intacte')
// ---------------------------------------------------------------------------

/**
 * ★ AC3.4 — « la surface gardée est déclarative, la pondération est la règle
 *   de subvention. Les deux ne se mélangent pas. » Asked with a guarded area
 *   set to something wild on every one of the three cases: the answer must not
 *   move by a dunam.
 */
{
  const cases: Array<[number, number, number]> = [
    [800, 0, 800],
    [0, 5000, 100],
    [200, 1000, 220],
  ]
  const wrong = cases.filter(([farmDunams, grazingDunams, want]) => {
    const bare = weightedDunams({ farmDunams, grazingDunams })
    const withGuard = weightedDunams({
      farmDunams,
      grazingDunams,
      ...({ guardedDunams: 999_999, guardedDunamsManual: true } as object),
    })
    return bare !== want || withGuard !== want
  })
  check(
    'A103 · 800 / 100 / 220, with or without a declared guarded area',
    wrong.length === 0,
    wrong.map(([a, b, w]) => `${a}+${b} ≠ ${w}`).join(' · ') || '800 · 100 · 220',
  )
}

// ---------------------------------------------------------------------------
section('A104 · A105 — les compteurs de gardes et le vivier')
// ---------------------------------------------------------------------------

/**
 * ⚠️ BUILT ON THE STORE'S OWN FIXTURE RATHER THAN ON THE WORKBOOK, because
 *    guards need volunteers and drivers and anchor points, and the prospection
 *    file has none of those. `resetStore()` restores the demo set, which is
 *    the one every other gate in this repository counts against.
 */
{
  resetStore()
  const missions = _raw().missions as Mission[]
  const farms = getVisibleFarms()
  const target = farms.find((f) => missions.some((m) => m.farmId === f.id))
  if (!target) throw new Error('no farm with a guard in the fixture')

  const mine = missions.filter((m) => m.farmId === target.id)
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★★ RÉÉCRITE EN AE3.5 (2026-09-08), PAS SUPPRIMÉE — ET LA DIFFÉRENCE EST
   *    UNE CASE DE PLUS DANS CE FILTRE.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * AC4 disait « les nuits passées non annulées », et c'était la bonne
   * définition tant que RIEN dans le système ne pouvait dire si quelqu'un
   * était venu. Depuis AE3.1, une case le dit : le porteur du téléphone de
   * groupe confirme l'arrivée en un geste. Une nuit programmée que personne
   * n'a confirmée est une nuit dont on ne sait pas si elle a eu lieu, et la
   * porter au crédit d'une ferme dans le rapport de l'association serait un
   * chiffre inventé — « une garde non confirmée n'est pas une garde reçue ».
   *
   * ⚠️ LES TROIS COMPTEURS L'EXCLUENT ENSEMBLE. `guards`, `volunteering` et
   *    `regulars` sont trois lectures d'un même ensemble de nuits ; en
   *    exclure une d'un seul des trois donnerait à une ferme plus de
   *    volontaires-nuits que de nuits.
   */
  const past = mine.filter(
    (m) =>
      m.status !== 'cancelled' &&
      new Date(m.startAt).getTime() <= Date.now() &&
      m.arrivalConfirmedAt !== null,
  )
  const stats = farmGuardStats(target.id)
  check(
    'A104 · the nights counted are the ones that HAPPENED — cancelled and unconfirmed excluded',
    stats.guards === past.length,
    `${stats.guards} counted, ${past.length} expected, ${mine.length} on the record`,
  )
  check(
    'A104 · התנדבויות is volunteer-nights over those same guards',
    stats.volunteering === past.reduce((n, m) => n + m.assignments.length, 0),
    `${stats.volunteering}`,
  )
  /* ★ ET L'EXCLUSION EST RÉELLE SUR CETTE FICHE : sans une nuit non confirmée
     dans le lot, la ligne au-dessus passerait sans rien mesurer. */
  check(
    'A104 · ★ and at least one scheduled night is NOT counted, or the line above measures nothing',
    mine.some(
      (m) =>
        m.status !== 'cancelled' &&
        new Date(m.startAt).getTime() <= Date.now() &&
        m.arrivalConfirmedAt === null,
    ),
    `${mine.length - past.length} not counted`,
  )
  check(
    'A104 · the last-guard date is the latest of them, or null for none',
    stats.guards === 0
      ? stats.lastGuardAt === null
      : stats.lastGuardAt ===
        new Date(Math.max(...past.map((m) => new Date(m.startAt).getTime()))).toISOString(),
    String(stats.lastGuardAt),
  )
  /* A cancelled night moves neither counter — asserted by cancelling one. */
  if (past.length > 0) {
    const before = farmGuardStats(target.id)
    const victim = past[past.length - 1]
    const previous = victim.status
    victim.status = 'cancelled'
    const after = farmGuardStats(target.id)
    check(
      'A104 · cancelling a night removes it from both counters',
      after.guards === before.guards - 1 &&
        after.volunteering === before.volunteering - victim.assignments.length,
      `${before.guards}→${after.guards} guards, ${before.volunteering}→${after.volunteering} volunteer-nights`,
    )
    victim.status = previous
  }
  /* A farm nobody has guarded: zero, null, and `never` — not « 0 days ago ». */
  const untouched = farms.find((f) => !missions.some((m) => m.farmId === f.id))
  if (untouched) {
    const none = farmGuardStats(untouched.id)
    check(
      'A104 · a farm nobody has guarded reads zero and NULL, never a date',
      none.guards === 0 && none.lastGuardAt === null && none.daysSinceLastGuard === null,
      `${none.guards} / ${String(none.lastGuardAt)}`,
    )
  }

  // --- A105 ---------------------------------------------------------------
  const volunteers = _raw().volunteers as Volunteer[]
  const byRegion = availableVolunteersByRegion()
  const active = volunteers.filter((v) => v.status === 'active')
  check(
    'A105 · the vivier counts ACTIVE volunteers only',
    [...byRegion.values()].reduce((a, b) => a + b, 0) ===
      active.filter((v) => volunteerRegion(v) !== null).length,
    `${[...byRegion.values()].reduce((a, b) => a + b, 0)} of ${active.length} active`,
  )
  /**
   * ★ TWO FARMS OF ONE VIVIER SHOW THE SAME NUMBER, and the product owner said
   *   so before we did: « c'est attendu, pas un bug ». Proven on a real pair
   *   from the fixture rather than on two literals.
   */
  const byRegionFarms = new Map<string, Farm[]>()
  for (const f of farms) {
    const r = f.regionId ?? ''
    const key = String(r || 'auto')
    byRegionFarms.set(key, [...(byRegionFarms.get(key) ?? []), f])
  }
  const pair = farms
    .map((f) => ({ f, n: availableVolunteers(f, byRegion) }))
    .filter((x) => x.n > 0)
  const grouped = new Map<number, Farm[]>()
  for (const { f, n } of pair) grouped.set(n, [...(grouped.get(n) ?? []), f])
  const twoOfOneVivier = [...grouped.entries()].find(([, list]) => list.length >= 2)
  check(
    'A105 · two farms of one vivier show the same number, and it is not zero',
    twoOfOneVivier !== undefined &&
      availableVolunteers(twoOfOneVivier[1][0], byRegion) ===
        availableVolunteers(twoOfOneVivier[1][1], byRegion),
    twoOfOneVivier
      ? `${twoOfOneVivier[1][0].name} · ${twoOfOneVivier[1][1].name} → ${twoOfOneVivier[0]}`
      : 'no pair found',
  )
  /* AC4.5 — the threshold, and what each of the three states means. */
  check(
    'A104 · the initial neglect threshold is 30 days, and it is named',
    NEGLECT_DAYS_INITIAL === 30,
    String(NEGLECT_DAYS_INITIAL),
  )
  const activeFarm = { ...target, status: 'active' as const }
  check(
    'A104 · a lead that has had nothing is NOT flagged — only active farms are',
    coverageState({ ...target, status: 'to_contact' }, { guards: 0, volunteering: 0, regulars: 0, lastGuardAt: null, daysSinceLastGuard: null }) === 'notActive',
    'to_contact → notActive',
  )
  check(
    'A104 · an active farm with no guard at all reads « never »',
    coverageState(activeFarm, { guards: 0, volunteering: 0, regulars: 0, lastGuardAt: null, daysSinceLastGuard: null }) === 'never',
    'never',
  )
  check(
    'A104 · and one whose last night is past the threshold reads « stale »',
    coverageState(activeFarm, { guards: 3, volunteering: 9, regulars: 1, lastGuardAt: '2026-01-01T00:00:00.000Z', daysSinceLastGuard: 31 }) === 'stale' &&
      coverageState(activeFarm, { guards: 3, volunteering: 9, regulars: 1, lastGuardAt: '2026-09-01T00:00:00.000Z', daysSinceLastGuard: 7 }) === 'ok',
    '31 → stale, 7 → ok',
  )
}

// ---------------------------------------------------------------------------
section('A107 — l’export : 32 colonnes, aller-retour sans perte')
// ---------------------------------------------------------------------------

{
  emptyFarms()
  const first = analyseProspection(headers, matrix, getVisibleFarms())
  applyProspection(first.plan, HOME_BASE)
  /* Give a handful of records the fields the new columns are about, so the
     round trip is asked of a file with something in every one of them. */
  const raw = _raw().farms
  raw[0].farmName = 'חוות הבשור'
  raw[0].farmerName = 'יוסי כהן'
  raw[0].name = composePlaceName(raw[0])
  raw[0].farmerEmail = 'yossi@example.org'
  raw[0].umbrella = 'גד״ש חבל שלום'
  /**
   * ⚠️ THE TWO AREAS ARE FLAGGED `manual`, AS THE FORM WOULD FLAG THEM, and
   *    that is not a convenience: G15's importer reads a non-zero area as an
   *    override (« a typed number IS an override; a zero is not »), so a
   *    record carrying areas with NO flag — one filled from drawn polygons —
   *    picks the flag up on the way back in. That is AA4's rule behaving as
   *    written and predates this pass; setting the flag here asks the round
   *    trip about AC's columns rather than about G15's.
   */
  raw[0].farmDunams = 800
  raw[0].grazingDunams = 5000
  raw[0].farmDunamsManual = true
  raw[0].grazingDunamsManual = true
  raw[1].guardedDunams = 2500
  raw[1].guardedDunamsManual = true
  raw[1].farmDunams = 300
  raw[1].grazingDunams = 100
  raw[1].farmDunamsManual = true
  raw[1].grazingDunamsManual = true

  const source = getVisibleFarms()
  const exported = prospectionExportMatrix(source)
  check(
    'A107 · the export carries the workbook’s own 32 headers, in its order',
    exported[0].length === 32 &&
      exported[0].every((h, i) => h.trim() === headers[i].trim()),
    exported[0]
      .map((h, i) => (h.trim() === headers[i]?.trim() ? '' : `${i}: ${h} ≠ ${headers[i]}`))
      .filter(Boolean)
      .join(' · ') || `${exported[0].length} columns`,
  )
  check(
    'A107 · every column of the file is a declared column of this app',
    PROSPECTION_COLUMNS.length === 32,
    `${PROSPECTION_COLUMNS.length} declared`,
  )
  const iGuardOut = exported[0].findIndex((h) => h.trim() === 'שטחים שמירה (דונם)')
  const blank = exported.slice(1).filter((r) => r[iGuardOut] === '')
  check(
    'A107 · שטחים שמירה is filled on every row — it no longer comes out empty',
    blank.length === 0,
    `${blank.length} blank of ${exported.length - 1}`,
  )
  check(
    'A107 · and its value is the declaration where there is one, the default elsewhere',
    exported[2][iGuardOut] === '2500' && exported[1][iGuardOut] === '5800',
    `${exported[1][iGuardOut]} · ${exported[2][iGuardOut]}`,
  )

  const back = analyseProspection(exported[0], exported.slice(1), source)
  check(
    'A107 · every exported row finds its own record — nothing is created',
    back.plan.created.length === 0 && back.plan.rejected.length === 0,
    `created=${back.plan.created.length} rejected=${back.plan.rejected.length}`,
  )
  const drifted = back.plan.updated.filter((u) => u.changes.length > 0)
  check(
    'A107 · and no field comes back different',
    drifted.length === 0,
    drifted
      .slice(0, 6)
      .map((u) => `${u.row.name}: ${u.changes.join(',')}`)
      .join(' · ') || 'round trip is an identity',
  )
  applyProspection(back.plan, HOME_BASE)
  check(
    'A107 · the roster is still 198 long, with 198 distinct keys',
    getVisibleFarms().length === 198 &&
      new Set(getVisibleFarms().map((f) => identityKey(f))).size === 198,
    `${getVisibleFarms().length} farms`,
  )

  /* AC3.3 · AC4.6 — and the association's own 18-column format. */
  const assoc = associationExportMatrix(associationInputs(getVisibleFarms()))
  const iGuardAssoc = assoc.matrix[0].indexOf('שטחים שמירה')
  const iVol = assoc.matrix[0].indexOf('כמות התנדבויות')
  const iReg = assoc.matrix[0].indexOf('כמות מתנדבים קבועים')
  check(
    'A107 · the association export fills שטחים שמירה on every row',
    iGuardAssoc !== -1 && assoc.matrix.slice(1).every((r) => r[iGuardAssoc] !== ''),
    `${assoc.matrix.slice(1).filter((r) => r[iGuardAssoc] === '').length} blank`,
  )
  check(
    'A107 · and it carries both counters, as columns of its own',
    iVol !== -1 && iReg !== -1,
    `התנדבויות=${iVol} קבועים=${iReg}`,
  )
  check(
    'A107 · שטחים שמירה is no longer reported as a column this app does not hold',
    !assoc.report.blanks.some((b) => b.header === 'שטחים שמירה'),
    assoc.report.blanks.map((b) => b.header).join(' · ') || 'no blanks',
  )
  const backAssoc = analyseAssociation(
    assoc.matrix[0],
    assoc.matrix.slice(1),
    getVisibleFarms(),
  )
  check(
    'A107 · the association round trip creates nothing and duplicates nothing',
    backAssoc.plan.created.length === 0 && backAssoc.plan.updated.length === 198,
    `created=${backAssoc.plan.created.length} updated=${backAssoc.plan.updated.length}`,
  )
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
