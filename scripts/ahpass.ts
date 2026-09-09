import {
  AGREEMENT_SAMPLE,
  AGREEMENT_VARS,
  TEST_FARM_ID,
  agreementValues,
  buildProgrammeReport,
  buildTestData,
  createFarm,
  farmFormSuggestions,
  getCountableFarms,
  getDunamKpis,
  getVisibleFarms,
  inherited,
  isTestId,
  liaisonIsFarmer,
  parseAgreementBlocks,
  proposedFarmName,
  purgeTestData,
  renderAgreementTemplate,
  resetStore,
  seedTestData,
  testDataCount,
  unknownAgreementVars,
} from '../src/core/index'
import { _raw } from '../src/core/store'
import type { Farm } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A153 … A165 — CE QU'UN NAVIGATEUR NE REND PAS PLUS VRAI (PASSE AH).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ahpass
 *
 *   A153/A154/A157  les redondances du formulaire : ce qui est proposé, et ce
 *                   qui est ENREGISTRÉ quand on ne tape rien.
 *   A155            « même personne » : la case recopie, et son état se déduit.
 *   A160/A161       le jeu d'essai : marqué, exclu des compteurs, et sa
 *                   suppression n'emporte QUE lui.
 *   A163/A165       le gabarit : les sept variables, aucune surface, la
 *                   variable inconnue nommée, et la ligne qui disparaît.
 *
 * ★ AUCUN NAVIGATEUR ICI, ET C'EST LA RAISON D'ÊTRE DU FICHIER. Ce qui demande
 *   un écran est dans `bun run ahui`, `ahbar` et `ahdoc`.
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
console.log('  A153 … A165 — AH1 · AH3 · AH5, SANS NAVIGATEUR')
console.log('  ==============================================')

const PATTERN = 'החווה של {{first}}'
const NO_CONTACTS: never[] = []

// ---------------------------------------------------------------------------
section('1 — A153 · A154 · A157 · le pré-remplissage')
// ---------------------------------------------------------------------------

{
  const s = farmFormSuggestions(
    {
      name: '',
      locality: 'ירוחם',
      farmName: '',
      farmerName: 'יוסי כהן',
      farmerPhone: '050-1112222',
      farmerEmail: '',
      contacts: NO_CONTACTS,
    },
    PATTERN,
  )
  check('A157 · שם החווה se propose « החווה של <prénom> »', s.farmName === 'החווה של יוסי', s.farmName)
  check(
    'A157 · et c’est LA MÊME fonction qu’en AG4',
    s.farmName === proposedFarmName('יוסי כהן', PATTERN),
  )
  check('A153 · le nom de la fiche se déduit du nom de la ferme', s.name === 'החווה של יוסי', s.name)
}

{
  /* Le PO a tapé un nom de ferme : la fiche le reprend, pas la proposition. */
  const s = farmFormSuggestions(
    {
      name: '',
      locality: 'ירוחם',
      farmName: 'משק כהן',
      farmerName: 'יוסי כהן',
      farmerPhone: '',
      farmerEmail: '',
      contacts: NO_CONTACTS,
    },
    PATTERN,
  )
  check('A153 · un nom de ferme tapé gagne sur la proposition', s.name === 'משק כהן', s.name)
  check('A154 · un champ déjà rempli ne reçoit plus de proposition', s.farmName === '')
}

{
  /* Le téléphone demandé deux fois : dans les DEUX sens. */
  const withContact = farmFormSuggestions(
    {
      name: '',
      locality: '',
      farmName: '',
      farmerName: '',
      farmerPhone: '',
      farmerEmail: '',
      contacts: [
        { name: 'משה לוי', phone: '052-3334444', email: 'm@example.invalid', isPrimary: true },
        { name: 'אחר', phone: '053-9999999', email: '', isPrimary: false },
      ],
    },
    PATTERN,
  )
  check(
    'A153 · le nom, le portable et le courriel du CHCLAI se proposent depuis le contact PRINCIPAL',
    withContact.farmerName === 'משה לוי' &&
      withContact.farmerPhone === '052-3334444' &&
      withContact.farmerEmail === 'm@example.invalid',
  )
  check(
    '⚠️ et jamais depuis un contact secondaire',
    withContact.farmerPhone !== '053-9999999',
  )

  const withFarmer = farmFormSuggestions(
    {
      name: '',
      locality: '',
      farmName: '',
      farmerName: 'יוסי כהן',
      farmerPhone: '050-1112222',
      farmerEmail: '',
      contacts: [{ name: '', phone: '', email: '', isPrimary: true }],
    },
    PATTERN,
  )
  check(
    'A153 · et dans l’autre sens : le contact principal se propose depuis le CHCLAI',
    withFarmer.primaryContactName === 'יוסי כהן' &&
      withFarmer.primaryContactPhone === '050-1112222',
  )
}

{
  check('A154 · `inherited` retient ce qui est tapé', inherited('  משק  ', 'proposé') === 'משק')
  check('A154 · et la proposition quand rien n’est tapé', inherited('', 'proposé') === 'proposé')
  check('A154 · deux vides donnent la chaîne vide, jamais undefined', inherited('', '') === '')
}

// ---------------------------------------------------------------------------
section('2 — A155 · « le contact de terrain est la même personne »')
// ---------------------------------------------------------------------------

check(
  'A155 · deux paires identiques ⇒ la case est cochée',
  liaisonIsFarmer({
    farmerName: 'יוסי כהן',
    farmerPhone: '050-1112222',
    liaisonName: 'יוסי כהן',
    liaisonPhone: '050-1112222',
  }) === true,
)
check(
  'A155 · un seul champ qui diffère ⇒ décochée',
  liaisonIsFarmer({
    farmerName: 'יוסי כהן',
    farmerPhone: '050-1112222',
    liaisonName: 'יוסי כהן',
    liaisonPhone: '052-0000000',
  }) === false,
)
check(
  '⚠️ deux paires VIDES ne sont pas « la même personne »',
  liaisonIsFarmer({ farmerName: '', farmerPhone: '', liaisonName: '', liaisonPhone: '' }) === false,
)

// ---------------------------------------------------------------------------
section('3 — A160 · A161 · le jeu d’essai')
// ---------------------------------------------------------------------------

resetStore()
{
  const before = { farms: _raw().farms.length, kpis: getDunamKpis() }
  const report0 = buildProgrammeReport(365)

  const { added } = seedTestData()
  check('A160 · le jeu est posé', added > 0, `${added} lignes`)
  check(
    'A160 · une ferme, un volontaire, un conducteur, deux gardes',
    buildTestData().farms.length === 1 &&
      buildTestData().volunteers.length === 1 &&
      buildTestData().drivers.length === 1 &&
      buildTestData().missions.length === 2,
  )
  check(
    'A160 · la ferme est COMPLÈTE : ת״ז, portable, surfaces, contour, contrat signé, documents',
    (() => {
      const f = buildTestData().farms[0]
      const z = buildTestData().farmZones[0]
      return (
        f.farmerId !== '' &&
        f.farmerPhone !== '' &&
        f.farmDunams > 0 &&
        f.grazingDunams > 0 &&
        z.ring.length >= 3 &&
        (f.agreements[0]?.signature ?? null) !== null &&
        (f.providedDocuments ?? []).length === 2
      )
    })(),
  )
  check(
    'A160 · valeurs manifestement fictives',
    buildTestData().farms[0].farmerId === '000000000' &&
      buildTestData().farms[0].farmerPhone === '050-0000000',
  )
  check('A160 · elle est VISIBLE dans les listes', getVisibleFarms().some((f) => isTestId(f.id)))
  check(
    'A160 · et ABSENTE des fermes comptées',
    !getCountableFarms().some((f) => isTestId(f.id)),
  )

  const after = getDunamKpis()
  check(
    'A160 · les dounams gardés et pondérés n’ont pas bougé',
    after.guardedDunams === before.kpis.guardedDunams &&
      after.weightedSigned === before.kpis.weightedSigned,
    `${before.kpis.weightedSigned} → ${after.weightedSigned}`,
  )
  const report1 = buildProgrammeReport(365)
  /* ⚠️ `generatedAt` EST L'HORODATAGE DU TIRAGE et il diffère forcément de
     quelques millisecondes entre les deux appels. Le comparer reviendrait à
     faire échouer la porte pour la seule chose qu'elle n'interroge pas. */
  const figures = (r: object): string =>
    JSON.stringify({ ...(r as Record<string, unknown>), generatedAt: null })
  check(
    'A160 · le compte rendu envoyé est identique, chiffre pour chiffre',
    figures(report1) === figures(report0),
  )

  // --- A161 : la suppression n’emporte QUE le jeu -------------------------
  const mine = createFarm({
    ...(_raw().farms[0] as unknown as Parameters<typeof createFarm>[0]),
    name: 'החווה שלי',
  })
  check('A161 · une ferme créée par le PO ne porte JAMAIS le préfixe', !isTestId(mine.id), mine.id)
  const farmsBeforePurge = _raw().farms.length
  const { removed } = purgeTestData()
  check('A161 · la suppression compte les lignes retirées', removed > 0, `${removed}`)
  check('A161 · il ne reste aucune ligne de bidon', testDataCount() === 0)
  check(
    'A161 · la ferme du PO a survécu',
    _raw().farms.some((f) => f.id === mine.id),
  )
  check(
    'A161 · et rien d’autre n’est parti',
    _raw().farms.length === farmsBeforePurge - 1 &&
      _raw().farms.length === before.farms + 1,
    `${before.farms} → ${_raw().farms.length}`,
  )
}

// ---------------------------------------------------------------------------
section('4 — A163 · A165 · le gabarit du document')
// ---------------------------------------------------------------------------

check('A163 · sept variables, ni plus ni moins', AGREEMENT_VARS.length === 7)
check(
  'AH5.2 · ⛔ aucune SURFACE parmi elles',
  !AGREEMENT_VARS.some((v) => /שטח|דונם|מעובד|מרעה/.test(v)),
  AGREEMENT_VARS.join(' · '),
)
check(
  'A163 · une variable connue est acceptée',
  unknownAgreementVars('שלום {{שם_החקלאי}}').length === 0,
)
check(
  'A163 · une variable inconnue est refusée ET nommée',
  unknownAgreementVars('{{שם_החקלא}} et {{tz}}').join(',') === 'שם_החקלא,tz',
)
check(
  'A163 · nommée UNE fois même si elle apparaît trois fois',
  unknownAgreementVars('{{x}} {{x}} {{x}}').length === 1,
)

{
  const tpl = [
    '## הסכם',
    'שם: {{שם_החקלאי}}',
    'ת״ז: {{תז_חפ}}',
    'נייד: {{נייד}}',
    'טקסט קבוע',
  ].join('\n')
  const out = renderAgreementTemplate(tpl, {
    'שם_החקלאי': 'יוסי כהן',
    'תז_חפ': '',
    'נייד': '050-1112222',
  })
  check('A165 · la ligne dont la variable est vide DISPARAÎT', !out.includes('ת״ז'), out)
  check('A165 · et il ne reste pas de ligne vide à sa place', !/\n\s*\n\s*\n/.test(out))
  check('A165 · les lignes renseignées restent', out.includes('יוסי כהן') && out.includes('050-1112222'))
  check('A165 · une ligne SANS variable est conservée telle quelle', out.includes('טקסט קבוע'))
}
{
  const out = renderAgreementTemplate('נייד: {{נייד}} · {{תז_חפ}}', {
    'נייד': '050-1112222',
    'תז_חפ': '',
  })
  check(
    'A165 · un séparateur orphelin est retiré',
    out.trim() === 'נייד: 050-1112222',
    JSON.stringify(out),
  )
}
{
  const blocks = parseAgreementBlocks('## כותרת\nגוף\n## תת־כותרת\nעוד')
  check(
    'A163 · le PREMIER ## est le titre, les suivants des intertitres',
    blocks[0].kind === 'title' && blocks[2].kind === 'heading',
    blocks.map((b) => b.kind).join(','),
  )
}
{
  resetStore()
  const farm = _raw().farms.find((f: Farm) => f.id === 'farm-01')!
  const v = agreementValues(farm, { year: '2026', signedAtText: '01/01/2026' })
  check('A163 · les sept valeurs sont toutes des chaînes', Object.keys(v).length === 7)
  check('A163 · l’exemple des réglages est complet', Object.keys(AGREEMENT_SAMPLE).length === 7)
}

console.log('')
console.log(failed === 0 ? `  All ${passed} checks passed.` : `  ${failed} of ${passed + failed} checks FAILED.`)
console.log('')
if (failed > 0) process.exit(1)
