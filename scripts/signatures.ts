import {
  HOME_BASE,
  SIGNATURE_COLUMNS,
  analyseSignatures,
  applySignatures,
  getVisibleFarms,
  guessSignatureField,
  identityKey,
  readSignatureCell,
  readSignedAt,
  resetStore,
  signatureExportMatrix,
  signatureImageOf,
  signedFarms,
} from '../src/core/index'
import { _raw } from '../src/core/store'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A81 · A82 · A83 · A84 — LA REPRISE DES SIGNATURES DÉJÀ OBTENUES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run signatures
 *
 * The association signs farmers today through an external web form; each
 * signature reaches them as ONE ROW with the drawing in a cell, and those rows
 * are what they hand to the State. This gate is the claim that those rows come
 * into this app without losing anything and go back out in the same shape.
 *
 *   A81  a row with no record of its own CREATES one, signed, with the
 *        signature attached.
 *   A82  base64, URL and a point path all import; an unrecognised cell costs
 *        the signature and NEVER the row.
 *   A83  a file with foreign headers imports after a hand mapping, and the
 *        mapping is remembered (the memory itself is the browser's — see
 *        `bun run sheets` — this proves the pure half: a supplied mapping is
 *        honoured over the guess).
 *   A84  the export is one row per signed farm, signature in a cell, and it
 *        re-imports into the same records with nothing created.
 *
 * PURE — no browser. `bun run sheets` drives the two wizard screens.
 */

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
console.log('  A81 · A82 · A83 · A84 — SIGNATURES')
console.log('  ==================================')

/** A one-pixel PNG, which is a real data URI and not a plausible-looking one. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const HEADERS = SIGNATURE_COLUMNS.map((c) => c.header)

/** Build a row in this app's own column order. */
function row(values: Partial<Record<string, string>>): string[] {
  return SIGNATURE_COLUMNS.map((c) => values[c.field] ?? '')
}

function emptyFarms(): void {
  resetStore()
  _raw().farms = []
}

// ---------------------------------------------------------------------------
section('A82 — the three shapes of a signature cell, and the fourth')
// ---------------------------------------------------------------------------

{
  const base64 = readSignatureCell(PNG)
  check('A82 · a base64 data URI is taken as it is', base64.shape === 'dataUri' && base64.image === PNG, base64.shape)

  const url = readSignatureCell('https://forms.example.org/sig/abc123.png')
  check('A82 · an image URL is kept as the image source', url.shape === 'url' && url.image !== null, url.shape)

  const jsonPairs = readSignatureCell('[[10,20],[30,25],[45,40]]')
  check(
    'A82 · a point path as JSON pairs is drawn',
    jsonPairs.shape === 'points' && (jsonPairs.image ?? '').startsWith('data:image/svg+xml'),
    jsonPairs.shape,
  )

  const jsonObjects = readSignatureCell('[{"x":10,"y":20},{"x":30,"y":25}]')
  check(
    'A82 · and as {x,y} objects',
    jsonObjects.shape === 'points' && jsonObjects.image !== null,
    jsonObjects.shape,
  )

  const strokes = readSignatureCell('[[[1,1],[2,2]],[[8,1],[9,4]]]')
  check(
    'A82 · two strokes stay two strokes, not one line through both',
    strokes.shape === 'points' &&
      (decodeURIComponent(strokes.image ?? '').match(/<polyline/g) ?? []).length === 2,
    (decodeURIComponent(strokes.image ?? '').match(/<polyline/g) ?? []).length + ' polylines',
  )

  const shorthand = readSignatureCell('10,20 30,25 45,40')
  check(
    'A82 · and the SVG polyline shorthand',
    shorthand.shape === 'points' && shorthand.image !== null,
    shorthand.shape,
  )

  const junk = readSignatureCell('signed on paper, ask the office')
  check(
    'A82 · an unrecognised cell yields no image and is named as such',
    junk.shape === 'unknown' && junk.image === null,
    junk.shape,
  )
  check('A82 · an empty cell is empty, not unknown', readSignatureCell('  ').shape === 'empty', readSignatureCell('  ').shape)
}

/** The date, which is where an American parser silently loses eight months. */
{
  const il = readSignedAt('03/09/2026')
  check(
    'A82 · 03/09/2026 is the third of September, not the ninth of March',
    il !== null && new Date(il).getMonth() === 8 && new Date(il).getDate() === 3,
    il ?? 'null',
  )
  check('A82 · an ISO date is read as one', readSignedAt('2026-09-03T10:00:00Z') !== null, 'ok')
  check('A82 · and an unreadable one is null rather than invented', readSignedAt('בקרוב') === null, 'null')
}

// ---------------------------------------------------------------------------
section('A81 — a row with no record creates one, signed')
// ---------------------------------------------------------------------------

{
  emptyFarms()
  const matrix = [
    row({ name: 'חוות רתם', council: 'רמת הנגב', farmerName: 'יואב רתם', farmerPhone: '052-0000101', signedAt: '03/09/2026', signature: PNG }),
    row({ name: 'מקום ללא חתימה', council: 'אשכול', farmerName: 'דוד', signedAt: '04/09/2026', signature: 'חתם על הנייר' }),
  ]
  const { plan } = analyseSignatures(HEADERS, matrix, getVisibleFarms())
  check(
    'A81 · neither row matched anything, so both are creations',
    plan.created.length === 2 && plan.attached.length === 0 && plan.rejected.length === 0,
    `created=${plan.created.length} attached=${plan.attached.length} rejected=${plan.rejected.length}`,
  )
  check(
    'A82 · the unreadable cell is listed, and its row is NOT rejected',
    plan.unreadable.length === 1 && plan.rejected.length === 0,
    `unreadable=${plan.unreadable.length} rejected=${plan.rejected.length}`,
  )

  const applied = applySignatures(plan, 'consents-2026-09.csv', HOME_BASE)
  check(
    'A81 · two records created',
    applied.created === 2 && applied.attached === 0,
    `created=${applied.created} attached=${applied.attached}`,
  )

  const farms = getVisibleFarms()
  const rotem = farms.find((f) => f.name === 'חוות רתם')
  check(
    'A81 · the status is הסכמה נחתמה',
    rotem?.status === 'signed',
    rotem?.status ?? 'missing',
  )
  check(
    'A81 · the signature is on the record',
    rotem?.signature === PNG,
    rotem?.signature ? 'PNG attached' : 'nothing attached',
  )
  check(
    'A81 · with the row’s own signing date and the file it came from',
    rotem?.signatureOrigin?.kind === 'imported' &&
      rotem?.signatureOrigin?.fileName === 'consents-2026-09.csv' &&
      (rotem?.signatureOrigin?.signedAt ?? '').startsWith('2026-09-03'),
    `${rotem?.signatureOrigin?.fileName} ${rotem?.signatureOrigin?.signedAt}`,
  )
  check(
    'A81 · the farmer who signed is on the record',
    rotem?.farmerName === 'יואב רתם' && rotem?.farmerPhone === '052-0000101',
    `${rotem?.farmerName} · ${rotem?.farmerPhone}`,
  )
  check(
    'A81 · and it is marked מיקום חסר, because nobody has placed it',
    rotem?.positionMissing === true &&
      rotem?.position.lat === HOME_BASE.lat,
    `positionMissing=${String(rotem?.positionMissing)}`,
  )

  const noSig = farms.find((f) => f.name === 'מקום ללא חתימה')
  check(
    'A82 · the row whose cell was junk is signed and flagged חתימה חסרה',
    noSig?.status === 'signed' && noSig?.signatureMissing === true && noSig?.signature === null,
    `status=${noSig?.status} missing=${String(noSig?.signatureMissing)}`,
  )
}

// ---------------------------------------------------------------------------
section('A81 — and a row that DOES match attaches rather than duplicating')
// ---------------------------------------------------------------------------

{
  const before = getVisibleFarms().length
  const again = analyseSignatures(
    HEADERS,
    [row({ name: 'חוות רתם', council: 'רמת הנגב', signedAt: '05/09/2026', signature: PNG })],
    getVisibleFarms(),
  )
  check(
    'A81 · the second signature attaches to the record that exists',
    again.plan.attached.length === 1 && again.plan.created.length === 0,
    `attached=${again.plan.attached.length} created=${again.plan.created.length}`,
  )
  applySignatures(again.plan, 'consents-later.csv', HOME_BASE)
  check(
    'A81 · and the roster did not grow',
    getVisibleFarms().length === before,
    `${getVisibleFarms().length} farms`,
  )
  const keys = new Set(getVisibleFarms().map((f) => identityKey(f)))
  check(
    'A81 · no duplicate identity',
    keys.size === getVisibleFarms().length,
    `${keys.size} keys / ${getVisibleFarms().length} farms`,
  )
}

// ---------------------------------------------------------------------------
section('A83 — a file whose headers are somebody else’s')
// ---------------------------------------------------------------------------

{
  emptyFarms()
  const foreign = ['Timestamp', 'Farm', 'Signed by', 'Mobile', 'Signature blob', 'Region council']
  const foreignRows = [
    ['2026-09-03 10:12', 'חוות עצוז', 'דוד עצוז', '052-0000103', PNG, 'רמת הנגב'],
  ]

  const guessed = foreign.map((h) => guessSignatureField(h))
  check(
    'A83 · the app does NOT pretend to recognise the foreign headers it cannot',
    guessed.includes('ignore'),
    guessed.join(','),
  )
  /**
   * ⚠️ AND THE COST OF NOT MAPPING IS EXACTLY THE POINT OF AA5.6. « Farm » and
   *    « Signed by » are close enough to this app's own aliases to be guessed;
   *    « Signature blob » and « Region council » are not. Left alone the row
   *    still imports — a farmer who signed has signed — but WITHOUT the
   *    signature and without the council, which is a silent half-import and
   *    the reason the mapping screen has to exist.
   */
  const blocked = analyseSignatures(foreign, foreignRows, getVisibleFarms())
  check(
    'A83 · unmapped, the row imports but loses its signature and its council',
    blocked.plan.rejected.length === 0 &&
      blocked.plan.created.length === 1 &&
      blocked.plan.unreadable.length === 1 &&
      blocked.rows[0].council === '',
    `rejected=${blocked.plan.rejected.length} unreadable=${blocked.plan.unreadable.length} council="${blocked.rows[0].council}"`,
  )

  /* AA5.6 — the coordinator maps them by hand, and the mapping is honoured. */
  const byHand: Array<'ignore' | 'name' | 'farmerName' | 'farmerPhone' | 'signature' | 'signedAt' | 'council'> = [
    'signedAt',
    'name',
    'farmerName',
    'farmerPhone',
    'signature',
    'council',
  ]
  const mapped = analyseSignatures(foreign, foreignRows, getVisibleFarms(), byHand)
  check(
    'A83 · with the hand mapping the row imports',
    mapped.plan.created.length === 1 && mapped.plan.rejected.length === 0,
    `created=${mapped.plan.created.length} rejected=${mapped.plan.rejected.length}`,
  )
  applySignatures(mapped.plan, 'external-form.csv', HOME_BASE)
  const azuz = getVisibleFarms().find((f) => f.name === 'חוות עצוז')
  check(
    'A83 · and every mapped field landed where it was pointed',
    azuz?.farmerName === 'דוד עצוז' &&
      azuz?.farmerPhone === '052-0000103' &&
      azuz?.council === 'רמת הנגב' &&
      azuz?.signature === PNG,
    `${azuz?.farmerName} · ${azuz?.council}`,
  )
}

// ---------------------------------------------------------------------------
section('A84 — the export the association receives, and reads back')
// ---------------------------------------------------------------------------

{
  emptyFarms()
  applySignatures(
    analyseSignatures(
      HEADERS,
      [
        row({ name: 'חוות רתם', council: 'רמת הנגב', farmerName: 'יואב רתם', farmerPhone: '052-0000101', signedAt: '03/09/2026', signature: PNG }),
        row({ name: 'מושב רתמים', council: 'רמת הנגב', farmerName: 'ועד המושב', signedAt: '04/09/2026', signature: '[[1,1],[9,4],[14,2]]' }),
      ],
      getVisibleFarms(),
    ).plan,
    'consents.csv',
    HOME_BASE,
  )
  /* A farm that is NOT signed, to prove the export leaves it out. */
  _raw().farms.push({
    ...getVisibleFarms()[0],
    id: 'unsigned-01',
    name: 'מקום שטרם חתם',
    status: 'to_contact',
    signature: null,
    signatureOrigin: undefined,
  })

  const farms = getVisibleFarms()
  const matrix = signatureExportMatrix(farms, signatureImageOf)

  check(
    'A84 · the headers are the ones this importer reads',
    matrix[0].join('|') === HEADERS.join('|'),
    matrix[0].join(' · '),
  )
  check(
    'A84 · one row per signed farm, and the unsigned one is not in it',
    matrix.length - 1 === signedFarms(farms).length && matrix.length - 1 === 2,
    `${matrix.length - 1} rows for ${farms.length} farms`,
  )
  const sigCol = SIGNATURE_COLUMNS.findIndex((c) => c.field === 'signature')
  check(
    'A84 · the signature is in the cell, as an image',
    matrix.slice(1).every((r) => r[sigCol].startsWith('data:image/')),
    matrix
      .slice(1)
      .map((r) => r[sigCol].slice(0, 22))
      .join(' · '),
  )

  const back = analyseSignatures(matrix[0], matrix.slice(1), farms)
  check(
    'A84 · and it re-imports into the same records — nothing created',
    back.plan.created.length === 0 && back.plan.attached.length === 2,
    `created=${back.plan.created.length} attached=${back.plan.attached.length}`,
  )
  check(
    'A84 · with no signature lost on the way round',
    back.plan.unreadable.length === 0,
    `${back.plan.unreadable.length} unreadable`,
  )
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
