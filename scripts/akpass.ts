import {
  ASSOCIATION_COLUMNS,
  FARM_TYPE_OPTIONS,
  LEGAL_ENTITY_OPTIONS,
  activitiesOf,
  agreementValues,
  allowedStatus,
  applyRemoteSignature,
  associationExportMatrix,
  associationInputs,
  awaitingDocuments,
  buildProgrammeReport,
  closureBlocked,
  createFarm,
  getVisibleFarms,
  parseAgreementBlocks,
  plainText,
  readOption,
  renderAgreementTemplate,
  resetStore,
  richRuns,
  templateSection,
  typeFromAreas,
  typeOfActivities,
  updateFarm,
} from '../src/core/index'
import type { Farm } from '../src/core/index'
import { matrixToCsv } from '../src/core/xlsx'
import { _raw } from '../src/core/store'
import he from '../src/locales/he.json'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AK — LES RÈGLES, SANS NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run akpass
 *
 *   A195  nature à choix multiple (deux cases → quatre valeurs, aucune perdue) ;
 *         liste des entités juridiques COMPLÈTE et DANS L'ORDRE du PO ; surfaces
 *         jamais recopiées d'un type à l'autre.
 *   A196  le gabarit porte le gras du formulaire, et l'encadré se lit du gabarit.
 *   A199  zéro initial d'une ת״ז : valeurs du document, export xlsx/CSV.
 *   A202  (règles) fiche signée sans documents = en attente ; « פעילה » refusée
 *         tant qu'ils manquent, à l'écran comme à l'import ; une fiche déjà
 *         « פעילה » n'est pas rétrogradée ; le compte rendu sépare les signées.
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

const draftOf = (farm: Farm) => {
  const { id: _id, lastVisitAt: _l, nextVisitAt: _n, ...rest } = farm
  return rest
}

// ---------------------------------------------------------------------------
section('A195 — nature à choix multiple, entités, surfaces')
// ---------------------------------------------------------------------------
{
  const combos = [
    [false, false, 'unknown'],
    [true, false, 'agriculture'],
    [false, true, 'livestock'],
    [true, true, 'mixed'],
  ] as const
  const bad = combos.filter(([c, g, want]) => {
    const t = typeOfActivities({ crops: c, grazing: g })
    const back = activitiesOf(t)
    return t !== want || back.crops !== c || back.grazing !== g
  })
  check('A195 · two boxes ↔ four values, both ways, nothing lost', bad.length === 0, bad.map((b) => b[2]).join(','))
  check('A195 · a farm can be both — חקלאות AND מרעה is one value, « mixed »',
    activitiesOf('mixed').crops && activitiesOf('mixed').grazing)
  check('A195 · nature deduced from areas: 100 + 1000 → mixed, 1000 + 0 → agriculture, 0 + 0 → unknown',
    typeFromAreas(100, 1000) === 'mixed' && typeFromAreas(1000, 0) === 'agriculture' && typeFromAreas(0, 0) === 'unknown')
  const labels = LEGAL_ENTITY_OPTIONS.map((o) => o.label)
  const expected = ['חקלאי פרטי', 'אגודה שיתופית', 'מושב שיתופי', 'גד״ש', 'שח״ם', 'קיבוץ', 'מושב', 'רועה/בעל עדר', 'חברה בע״מ', 'לא ידוע']
  check('A195 · the legal-entity list is the PO\'s ten, in his order, in ONE config file',
    labels.join('|') === expected.join('|'), labels.join(' · '))
  check('A195 · the ids already written in records did not change',
    ['private_farmer', 'cooperative', 'gadash', 'shaham', 'kibbutz', 'moshav', 'herder', 'unknown_entity'].every((id) =>
      LEGAL_ENTITY_OPTIONS.some((o) => o.id === id)))
  check('A195 · « מושב שיתופי » and « חברה בע״מ » read from a file', readOption('מושב שיתופי', LEGAL_ENTITY_OPTIONS)?.id === 'moshav_shitufi' && readOption('חברה בע"מ', LEGAL_ENTITY_OPTIONS)?.id === 'company')
  check('A195 · « לא ידוע » is a nature value the workbook can carry', readOption('לא ידוע', FARM_TYPE_OPTIONS)?.id === 'unknown')

  /* Surfaces : un fichier ne recopie jamais l'une dans l'autre (AK2.3). */
  resetStore()
  const base = getVisibleFarms()[0]
  const created = createFarm({ ...draftOf(base), name: 'בדיקת תחום', type: 'livestock', farmDunams: 0, grazingDunams: 5000, guardedDunams: undefined, guardedDunamsManual: undefined })
  const saved = getVisibleFarms().find((f) => f.id === created.id)!
  check('A195 · a grazing-only farm keeps 0 cultivated — nothing copied', saved.farmDunams === 0 && saved.grazingDunams === 5000)
  const assoc = associationExportMatrix(associationInputs([saved])).matrix
  const iCult = assoc[0].indexOf('שטחים מעובדים')
  const iGraze = assoc[0].indexOf('שטחי מרעה')
  const iGuard = assoc[0].indexOf('שטחים שמירה')
  check('A195 · and the association export writes 0 · 5000 · (blank)', assoc[1][iCult] === '0' && assoc[1][iGraze] === '5000' && assoc[1][iGuard] === '',
    `${assoc[1][iCult]} · ${assoc[1][iGraze]} · «${assoc[1][iGuard]}»`)
}

// ---------------------------------------------------------------------------
section('A196 — le gabarit porte le gras, l\'encadré se lit du gabarit')
// ---------------------------------------------------------------------------
{
  const template = he.settings.agreementDoc.defaultTemplate
  const runs = richRuns(template).filter((r) => r.bold).map((r) => r.text)
  check('A196 · exactly the two bold passages of their form',
    runs.join('|') === 'ארגון "ארצנו" מבית עמותת שיבת ציון לרגבי אדמתה|שמירה, חקלאות ומרעה.', runs.join(' | '))
  const rendered = renderAgreementTemplate(template, { 'שנה': '2026' })
  const box = templateSection(rendered, 'הצהרה ואישור')
  check('A196 · the box is read from the template, two lines, line break kept',
    box !== null && box.lines.filter((l) => l.trim() !== '').length === 2 && box.lines[0].includes('בשנת 2026'),
    box ? box.lines.join(' ⏎ ') : 'null')
  const blocks = parseAgreementBlocks(rendered)
  check('A196 · the title is « הסכם התנדבות- ארצנו », no asterisk printed',
    blocks[0]?.kind === 'title' && (blocks[0] as { text: string }).text === 'הסכם התנדבות- ארצנו')
  check('A196 · an orphan ** stays visible rather than bolding the rest', plainText('a **b') === 'a **b' && richRuns('a **b').every((r) => !r.bold))
}

// ---------------------------------------------------------------------------
section('A199 — le zéro initial, du champ au fichier')
// ---------------------------------------------------------------------------
{
  resetStore()
  const farm = getVisibleFarms().find((f) => !f.farmerId)!
  applyRemoteSignature(farm.id, {
    farmerName: 'יונתן מרגי',
    farmerId: '021985189',
    farmerPhone: '050-8912840',
    farmName: '',
    signature: 'data:image/png;base64,iVBORw0KGgo=',
    idPhoto: null,
    fileName: 'x.pdf',
  })
  const signed = getVisibleFarms().find((f) => f.id === farm.id)!
  check('A199 · stored as the string 021985189', signed.farmerId === '021985189', JSON.stringify(signed.farmerId))
  const values = agreementValues(signed, { year: '2026', signedAtText: '' })
  check('A199 · the document carries 021985189', values['תז_חפ'] === '021985189')
  const doc = renderAgreementTemplate(he.settings.agreementDoc.defaultTemplate, values)
  check('A199 · and the rendered document text too', doc.includes('021985189'))
  const { matrix } = associationExportMatrix(associationInputs([signed]))
  const iId = matrix[0].indexOf(ASSOCIATION_COLUMNS.find((c) => c.source === 'farmerId')!.header)
  check('A199 · the association export cell is 021985189', matrix[1][iId] === '021985189', matrix[1][iId])
  const csv = matrixToCsv(matrix)
  check('A199 · the CSV bytes carry 021985189', csv.includes('021985189'))
}

// ---------------------------------------------------------------------------
section('A202 — les documents manquants bloquent la clôture')
// ---------------------------------------------------------------------------
{
  const signed = { type: 'livestock' as const, status: 'signed' as const, providedDocuments: [] }
  check('A202 · signed, no document → awaiting', awaitingDocuments(signed))
  check('A202 · signed, the grazing document received → complete',
    !awaitingDocuments({ ...signed, providedDocuments: [{ id: 'grazing', providedAt: '2026-09-16', fileName: 'a.pdf', file: 'x' }] }))
  check('A202 · mixed with only one of two → still awaiting',
    awaitingDocuments({ type: 'mixed', status: 'signed', providedDocuments: [{ id: 'grazing', providedAt: '2026-09-16', fileName: 'a.pdf', file: 'x' }] }))
  check('A202 · unknown nature, nothing received → awaiting', awaitingDocuments({ type: 'unknown', status: 'to_contact', providedDocuments: [] }))
  check('A202 · a declined farm waits for nothing', !awaitingDocuments({ ...signed, status: 'declined' }))
  check('A202 · an archived farm waits for nothing', !awaitingDocuments({ ...signed, archivedAt: '2026-09-16T10:00:00Z' }))
  check('A202 · « פעילה » is refused while documents are missing', allowedStatus('signed', 'active', signed) === 'signed' && closureBlocked(signed))
  check('A202 · a farm that was already « פעילה » is not demoted', allowedStatus('active', 'active', signed) === 'active')

  resetStore()
  const farm = getVisibleFarms().find((f) => f.status === 'signed' && (f.providedDocuments ?? []).length === 0) ??
    getVisibleFarms().find((f) => (f.providedDocuments ?? []).length === 0)!
  const before = farm.status === 'active' ? 'signed' : farm.status
  _raw().farms.find((f) => f.id === farm.id)!.status = before
  updateFarm(farm.id, { ...draftOf(farm), status: 'active' })
  const after = getVisibleFarms().find((f) => f.id === farm.id)!
  check('A202 · updateFarm cannot close it (the domain holds the lock, not only the screen)', after.status === before, `${before} → ${after.status}`)
  const made = createFarm({ ...draftOf(farm), name: 'חדשה', status: 'active', providedDocuments: [] })
  check('A202 · nor can createFarm', getVisibleFarms().find((f) => f.id === made.id)?.status === 'signed')

  /* AK5.4 — le compte rendu. */
  resetStore()
  const raw = _raw().farms
  raw.forEach((f) => { if (f.status === 'signed' || f.status === 'active') f.providedDocuments = [] })
  const firstSigned = raw.find((f) => f.status === 'signed' || f.status === 'active')!
  firstSigned.type = 'livestock'
  firstSigned.providedDocuments = [{ id: 'grazing', providedAt: '2026-09-16', fileName: 'a.pdf', file: 'x' }]
  const r = buildProgrammeReport()
  const total = raw.filter((f) => !f.id.startsWith('test-') && (f.status === 'signed' || f.status === 'active')).length
  check('A202 · the report splits signed farms: with documents / awaiting them',
    r.farmsSignedWithDocuments === 1 && r.farmsSignedAwaitingDocuments === total - 1,
    `${r.farmsSignedWithDocuments} + ${r.farmsSignedAwaitingDocuments} = ${total}`)
  check('A202 · the report has the two labels', typeof he.report.signedWithDocs === 'string' && typeof he.report.signedAwaitingDocs === 'string')
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
