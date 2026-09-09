import {
  AGREEMENT_FIELDS,
  agreementFieldValues,
  boundedDistance,
  buildProgrammeReport,
  isUnresolvableLocationLink,
  looseMatch,
  missingDeclarationTokens,
  parsePositionInput,
  rankOptions,
  renderDeclaration,
  resetStore,
  typoBudget,
} from '../src/core/index'
import { LOCALITIES } from '../src/core/gazetteer'
import { _raw } from '../src/core/store'
import type { Farm } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A133 · A134 · A137 — LES TROIS QUESTIONS DE LA PASSE AF QU'UN NAVIGATEUR NE
 *                      REND PAS PLUS VRAIES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run afpass
 *
 *   A133  un lien de localisation collé : les quatre formats du brief, et
 *         l'ordre longitude/latitude REFUSÉ dans les deux sens.
 *   A134  l'autocomplétion de lieu : couverture nationale, et tolérance aux
 *         fautes de frappe — avec son seuil, qui est ce qui l'empêche de
 *         mentir.
 *   A137  le compte rendu : les chiffres d'AF5.3 sont tous présents, ils
 *         BOUGENT quand la période change, et ceux qui ne doivent pas bouger
 *         ne bougent pas.
 *   plus  AF1 : les quatre cases du document, et le refus d'un gabarit de
 *         הצהרה qui a perdu son année.
 *
 * ★ AUCUN NAVIGATEUR ICI, ET C'EST LA RAISON D'ÊTRE DU FICHIER. Ces quatre
 *   familles sont des fonctions pures de @core ; les vérifier dans Chromium
 *   ajouterait quarante secondes de build à chaque exécution et une chance de
 *   plus que la porte échoue pour une raison qui n'est pas le produit. Ce qui
 *   demande un écran est dans `bun run afui`.
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
console.log('  A133 · A134 · A137 — AF1 · AF3 · AF5, SANS NAVIGATEUR')
console.log('  =====================================================')

// ---------------------------------------------------------------------------
section('1 — A133 · le lien de localisation collé')
// ---------------------------------------------------------------------------

/**
 * ⚠️ LE POINT DE RÉFÉRENCE EST DANS LE NÉGUEV, ET LES DEUX NOMBRES SONT LOIN
 *    L'UN DE L'AUTRE EXPRÈS. 31,05 et 34,65 : si l'analyseur inversait les
 *    deux, le résultat tomberait hors de la boîte d'Israël et serait refusé —
 *    ce qui est exactement ce qu'on veut vérifier. Un couple pris près de la
 *    diagonale (32,0 / 32,1) passerait dans les deux sens et ne prouverait
 *    rien.
 */
const LAT = 31.0583
const LNG = 34.6531

const FORMS: Array<[string, string]> = [
  ['Waze — ll=', `https://waze.com/ul?ll=${LAT}%2C${LNG}&navigate=yes`],
  ['Waze — carte en direct', `https://www.waze.com/live-map/directions?to=ll.${LAT}%2C${LNG}`],
  ['Google Maps — barre d’adresse', `https://www.google.com/maps/@${LAT},${LNG},15z`],
  ['Google Maps — lien de partage', `https://www.google.com/maps/search/?api=1&query=${LAT},${LNG}`],
  ['Google Maps — un lieu', `https://www.google.com/maps/place/Retem/@${LAT},${LNG},17z/data=!3m1!4b1`],
  ['Plans (Apple)', `https://maps.apple.com/?ll=${LAT},${LNG}&q=Retem`],
  ['couple brut', `${LAT}, ${LNG}`],
  ['couple brut, sans virgule', `${LAT} ${LNG}`],
]

for (const [name, input] of FORMS) {
  const got = parsePositionInput(input)
  const ok =
    got !== null &&
    Math.abs(got.lat - LAT) < 1e-6 &&
    Math.abs(got.lng - LNG) < 1e-6
  check(`format lu : ${name}`, ok, got ? `${got.lat}, ${got.lng}` : 'null')
}

/**
 * ★★ AF3.2 — L'ORDRE LONGITUDE/LATITUDE, ET LA VÉRIFICATION EST CELLE D'AB6.
 *
 * Le format de l'association écrit « longitude, latitude », l'inverse de tout
 * le reste. En Israël la longitude (~35) est toujours PLUS GRANDE que la
 * latitude (~32), donc une seule des deux lectures tombe dans la boîte — et
 * c'est celle-là qui est retenue, quel que soit l'ordre du texte collé.
 */
{
  const swapped = parsePositionInput(`${LNG}, ${LAT}`)
  check(
    'A133 · un couple écrit longitude-d’abord est REMIS À L’ENDROIT',
    swapped !== null &&
      Math.abs(swapped.lat - LAT) < 1e-6 &&
      Math.abs(swapped.lng - LNG) < 1e-6,
    swapped ? `${swapped.lat}, ${swapped.lng}` : 'null',
  )
}
{
  /* Un couple qui ne tombe dans la boîte dans AUCUN des deux sens est refusé
     plutôt que posé — « une ferme silencieusement placée en Méditerranée est
     pire qu'une ferme sans épingle ». */
  const outside = parsePositionInput('48.8566, 2.3522')
  check('A133 · un point hors d’Israël est REFUSÉ', outside === null, String(outside))
}
{
  const shortened = 'https://maps.app.goo.gl/aBcDeFgHiJkL'
  check(
    'A133 · un lien raccourci est DIT, pas deviné',
    parsePositionInput(shortened) === null && isUnresolvableLocationLink(shortened),
  )
  check(
    'A133 · et un texte quelconque n’est pas pris pour un lien raccourci',
    !isUnresolvableLocationLink('בית הכנסת של דוד'),
  )
}

// ---------------------------------------------------------------------------
section('2 — A134 · l’autocomplétion de lieu')
// ---------------------------------------------------------------------------

const NAMES = LOCALITIES.map((l) => l.name)

check(
  'A134 · couverture NATIONALE et non « une dizaine d’endroits »',
  NAMES.length >= 1000,
  `${NAMES.length} localités`,
)

/* Quatre villes des quatre coins du pays : le Néguev n'est pas le fichier. */
for (const name of ['בית שאן', 'קריית שמונה', 'אילת', 'מודיעין עילית']) {
  const hits = rankOptions(name, NAMES, (n) => n, 8)
  check(`A134 · « ${name} » est proposé`, hits.some((h) => h.item === name))
}

/**
 * ⚠️ ET L'ORTHOGRAPHE DU FICHIER N'EST PAS CELLE QUE LES GENS TAPENT. Le
 *    gazetteer de l'État écrit « קריית שמונה » avec deux yod ; le PO écrira
 *    « קרית שמונה », qui est l'usage courant. Sans la tolérance d'AF2.2, cette
 *    frappe-là ne rendait rien — et c'est exactement le symptôme qu'il a
 *    rapporté. La première version de cette porte a d'ailleurs échoué sur ce
 *    point en demandant la mauvaise chaîne, ce qui l'a montré.
 */
{
  const hits = rankOptions('קרית שמונה', NAMES, (n) => n, 8)
  check(
    'A134 · l’orthographe courante trouve celle du fichier',
    hits.some((h) => h.item === 'קריית שמונה'),
    hits.map((h) => h.item).slice(0, 3).join(' · '),
  )
}

/* La ponctuation hébraïque : geresh, guillemets ASCII, maqaf, espaces. */
for (const [typed, want] of [
  ['באר-שבע', 'באר שבע'],
  ['באר  שבע', 'באר שבע'],
] as Array<[string, string]>) {
  const hits = rankOptions(typed, NAMES, (n) => n, 8)
  check(`A134 · ponctuation tolérée : « ${typed} »`, hits.some((h) => h.item === want))
}

/**
 * ★★ LA TOLÉRANCE AUX FAUTES, ET SON SEUIL. Une lettre à côté sur un nom long
 *    est rattrapée ; sur un fragment court elle ne l'est PAS, et c'est ce qui
 *    empêche l'autocomplétion de proposer la moitié du pays à quelqu'un qui a
 *    tapé trois lettres.
 */
{
  const hits = rankOptions('קריית שמינה', NAMES, (n) => n, 8)
  check(
    'A134 · une lettre à côté sur un nom long est rattrapée',
    hits.some((h) => h.item === 'קריית שמונה'),
    hits.map((h) => h.item).slice(0, 3).join(' · '),
  )
}
check('A134 · seuil : rien sous quatre caractères', typoBudget('רתם') === 0)
check('A134 · seuil : une correction jusqu’à sept', typoBudget('רתמים') === 1)
check('A134 · seuil : deux au-delà', typoBudget('קרית שמונה') === 2)
check(
  'A134 · la transposition compte pour UNE erreur',
  boundedDistance('רתמים', 'רתימם', 2) === 1,
  String(boundedDistance('רתמים', 'רתימם', 2)),
)
check(
  'A134 · le plafond coupe vraiment',
  boundedDistance('אילת', 'קרית שמונה', 1) > 1,
)
/* Le rang PRÉFIXE passe toujours devant l'approchant : quelqu'un qui a tapé le
   début d'un nom veut ce nom-là. */
{
  const hits = rankOptions('באר', NAMES, (n) => n, 8)
  check(
    'A134 · le préfixe passe devant l’approchant',
    hits.length > 0 && hits[0].rank === 0,
    hits[0]?.item,
  )
}
check(
  'A134 · la recherche des listes tolère la même faute',
  looseMatch('קריית שמינה', ['קריית שמונה', 'רתמים']),
)
check(
  'A134 · et ne rend pas n’importe quoi',
  !looseMatch('אילת', ['קרית שמונה', 'רתמים']),
)

// ---------------------------------------------------------------------------
section('3 — AF1 · les quatre cases du document et le gabarit')
// ---------------------------------------------------------------------------

resetStore()
const farm = _raw().farms.find((f: Farm) => f.id === 'farm-01')!

{
  const values = agreementFieldValues(farm)
  check('AF1 · le document a exactement quatre cases', AGREEMENT_FIELDS.length === 4)
  check(
    'AF1 · מקום התנדבות porte l’exploitation ET la localité',
    values.place.includes(farm.name) && values.place.includes(farm.locality),
    values.place,
  )
  check('AF1 · שם החקלאי est pré-rempli', values.farmerName !== '', values.farmerName)
  check('AF1 · תז/חפ est pré-rempli', values.farmerId !== '', values.farmerId)
  check('AF1 · נייד est pré-rempli', values.phone !== '', values.phone)
  /* ⚠️ ET C'EST BIEN LE CHCLAI, PAS LE CONTACT SECONDAIRE. */
  check(
    'AF1 · c’est le nom du חקלאי et non celui du contact de liaison',
    values.farmerName === farm.farmerName,
  )
}
{
  /* Une fiche sans agriculteur nommé se replie sur le contact PRINCIPAL, et
     jamais sur un secondaire : c'est le מזכיר qui vous oriente, pas celui qui
     signe. */
  const bare: Farm = { ...farm, farmerName: undefined, farmerPhone: undefined }
  const values = agreementFieldValues(bare)
  const primary = farm.contacts.find((c) => c.isPrimary)
  check(
    'AF1 · à défaut, le contact PRINCIPAL et pas un autre',
    values.farmerName === primary?.name && values.phone === primary?.phone,
    values.farmerName,
  )
}
{
  /* Une case vide sort vide — c'est un formulaire, et une ligne vide veut dire
     « à remplir à la main » plutôt que de bloquer la production du document
     devant l'agriculteur. */
  const empty: Farm = { ...farm, farmerId: undefined }
  check('AF1 · une case sans valeur sort VIDE et ne bloque rien', agreementFieldValues(empty).farmerId === '')
}
{
  const shipped =
    'מאשר כי בשנת {{year}} מתבצעת בשטחים החקלאיים שבהחזקתי פעילות של מתנדבי ארגון'
  check('AF1.4 · le gabarit livré est complet', missingDeclarationTokens(shipped).length === 0)
  check(
    'AF1.4 · un gabarit sans {{year}} est REFUSÉ, et le jeton perdu est nommé',
    missingDeclarationTokens('מאשר כי בשנת 2026 מתבצעת').join(',') === 'year',
  )
  check(
    'AF1.4 · l’année s’insère',
    renderDeclaration(shipped, { year: '2026' }).includes('בשנת 2026'),
  )
  check(
    'AF1.4 · un jeton inconnu est laissé tel quel plutôt qu’effacé',
    renderDeclaration('{{annee}} {{year}}', { year: '2026' }) === '{{annee}} 2026',
  )
}

// ---------------------------------------------------------------------------
section('4 — A137 · le compte rendu, et ce qui bouge avec la période')
// ---------------------------------------------------------------------------

const WINDOWS = [7, 30, 90, 365] as const
const reports = WINDOWS.map((d) => buildProgrammeReport(d))

/* AF5.3 — la liste du brief, champ par champ. « Présent » veut dire un nombre
   fini, jamais `undefined` : un chiffre absent d'une page qu'un directeur
   transmet est un chiffre que quelqu'un inventera. */
const REQUIRED: Array<[string, (r: (typeof reports)[number]) => unknown]> = [
  ['fermes actives', (r) => r.farmsActive],
  ['fermes signées', (r) => r.farmsSigned],
  ['dounams déclarés', (r) => r.declaredDunams],
  ['dounams pondérés', (r) => r.weightedGuardedDunams],
  ['pourcentage de l’objectif', (r) => r.targetPercent],
  ['volontaires actifs', (r) => r.volunteersActive],
  ['conducteurs', (r) => r.driversTotal],
  ['gardes sur la période', (r) => r.guardsCompletedWindow],
  ['événements sur la période', (r) => r.incidentsWindowTotal],
  ['fermes jamais gardées', (r) => r.farmsNeverGuarded],
  ['fermes sans garde récente', (r) => r.farmsStaleGuard],
]
for (const [name, read] of REQUIRED) {
  const v = read(reports[1])
  check(`A137 · chiffre présent : ${name}`, typeof v === 'number' && Number.isFinite(v), String(v))
}

/**
 * ★★ « LE PO DOUTE QU'ILS BOUGENT », ET LA RÉPONSE HONNÊTE EST : CERTAINS
 *    DOIVENT, LES AUTRES NE DOIVENT PAS.
 *
 * Les gardes effectuées et les événements sont comptés DANS la fenêtre : ils
 * doivent croître avec elle. Les fermes, les dounams et le fichier de
 * volontaires sont un ÉTAT et non une période ; les faire varier avec le
 * sélecteur serait un mensonge sur ce que le nombre veut dire, et c'est ce que
 * `report.periodHint` dit à l'écran.
 */
{
  const guards = reports.map((r) => r.guardsCompletedWindow)
  const nonDecreasing = guards.every((v, i) => i === 0 || v >= guards[i - 1])
  check(
    'A137 · les gardes de la période CROISSENT avec la fenêtre',
    nonDecreasing,
    guards.join(' → '),
  )
  check(
    'A137 · et elles bougent vraiment entre 7 et 365 jours',
    guards[3] > guards[0],
    `${guards[0]} → ${guards[3]}`,
  )
  const events = reports.map((r) => r.incidentsWindowTotal)
  check(
    'A137 · les événements de la période croissent avec la fenêtre',
    events.every((v, i) => i === 0 || v >= events[i - 1]),
    events.join(' → '),
  )
  const dunams = new Set(reports.map((r) => r.guardedDunams))
  check(
    'A137 · et les chiffres CUMULATIFS ne bougent pas — ils sont un état',
    dunams.size === 1,
    [...dunams].join(' / '),
  )
  const windows = reports.map((r) => r.windowDays)
  check('A137 · la fenêtre est portée par le rapport', windows.join(',') === '7,30,90,365')
}
{
  /* AF5.4 — la section événements est une LISTE, et elle ne peut pas être lue
     comme exhaustive quand elle ne l'est pas. */
  const r = reports[3]
  check(
    'A137 · les événements sont listés, pas seulement comptés',
    Array.isArray(r.incidentsList),
    `${r.incidentsList.length} sur ${r.incidentsWindowTotal}`,
  )
  check(
    'A137 · la liste est plafonnée et le total porte le reste',
    r.incidentsList.length <= r.incidentsWindowTotal,
  )
  const ordered = r.incidentsList.every(
    (e, i) => i === 0 || new Date(r.incidentsList[i - 1].at) >= new Date(e.at),
  )
  check('A137 · les plus récents d’abord', ordered)
  check(
    'A137 · chaque entrée nomme sa ferme et sa gravité',
    r.incidentsList.every((e) => e.severity !== undefined) &&
      r.incidentsList.every((e) => typeof e.farm === 'string'),
  )
}
{
  /* L'objectif vient des réglages ; @core ne lit pas le navigateur. */
  const withTarget = buildProgrammeReport(30, { targetWeighted: 1000 })
  check(
    'A137 · l’objectif passé par l’appelant est celui du pourcentage',
    withTarget.targetWeighted === 1000 &&
      withTarget.targetPercent ===
        Math.round((withTarget.weightedGuardedDunams / 1000) * 100),
    `${withTarget.targetPercent} %`,
  )
  const strict = buildProgrammeReport(30, { neglectDays: 1 })
  const loose = buildProgrammeReport(30, { neglectDays: 3650 })
  check(
    'A137 · le seuil d’oubli passé par l’appelant change vraiment le compte',
    strict.farmsStaleGuard >= loose.farmsStaleGuard,
    `${strict.farmsStaleGuard} vs ${loose.farmsStaleGuard}`,
  )
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
