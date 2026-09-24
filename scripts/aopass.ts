/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AO — LA PASSE, SANS NAVIGATEUR. A238 · A243 · A244 · A245 · A246 · A247 · A248
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aopass
 *
 *   A238  toute migration qui crée une table porte ses autorisations d'API ;
 *         la règle est écrite dans PROJECT_STATE.md.
 *   A243  les deux nouveaux statuts sortent des compteurs SANS quitter les
 *         listes, et ne se confondent avec « סירבה » sur aucun des deux
 *         chemins de lecture.
 *   A244  les chiffres du rapport sont JUSTES sur une période choisie,
 *         recalculés indépendamment depuis le store.
 *   A245  la comparaison avec le rapport précédent est exacte.
 *   A246  les commentaires des fiches sont repris TELS QUELS.
 *   A247  l'export texte est lisible dans WhatsApp ; le PDF se dessine.
 *   A248  les rapports sont conservés et retrouvables.
 *
 *   A239 · A240 · A241 · A242 (la reprise des données) sont dans
 *   `bun run aodata`, qui les joue sur le jeu construit ET sur l'aller-retour.
 */
import { readFileSync, readdirSync } from 'node:fs'

import { DEMO_BACKEND } from '../src/core/demo'
import { installBackend, _raw } from '../src/core/store'
import {
  ALL_FARM_STATUSES,
  FARM_PIPELINE,
  FARM_STATUSES_OFF_PIPELINE,
  FARM_STATUS_OPTIONS,
  buildActivityReport,
  countsTowardProgramme,
  createFarm,
  customPeriod,
  effectiveAreas,
  getCountableFarms,
  getDunamKpis,
  getFarmStatusCounts,
  getVisibleFarms,
  localDayKey,
  optionLabel,
  periodFor,
  readOption,
  setSession,
  snapshotFarm,
  toRecord,
  totalsOf,
  updateFarm,
  weightedDunams,
} from '../src/core/index'
import { readFarmStatus } from '../src/core/templates'
import type { ActivityReportRecord, Farm } from '../src/core/index'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}

// ---------------------------------------------------------------------------
section('A238 — toute migration qui crée une table porte ses autorisations')
// ---------------------------------------------------------------------------
{
  const dir = 'supabase/migrations'
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  check(`${files.length} migrations lues`, files.length > 0)

  /* Les tables créées, et les tables qui reçoivent un `grant`. Le fichier est
     lu LIGNE À LIGNE hors commentaires : une règle prouvée par un commentaire
     n'est pas prouvée. */
  const offending: string[] = []
  const created: string[] = []
  for (const file of files) {
    const sql = readFileSync(`${dir}/${file}`, 'utf8')
    const code = sql
      .split('\n')
      .filter((l) => !/^\s*--/.test(l))
      .join('\n')
    /**
     * ⚠️ LE SCHÉMA COMPTE. `20260909000200_reset_business_data.sql` contient
     *    `create table if not exists archive.%I as table public.%I` — une
     *    sauvegarde dans le schéma `archive`, fabriquée par `format()` à
     *    l'intérieur d'une fonction PL/pgSQL. Ce n'est PAS une table de
     *    `public`, l'API ne la sert pas, et la règle des `grant` ne la
     *    concerne pas. Une première version de cette porte l'a comptée comme
     *    une table nommée « archive » : une porte rouge devant du code juste.
     */
    const tables = [
      ...code.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?(?!if\b)(?:([a-z_]+)\.)?([a-z_][a-z_0-9]*)(?![a-z_0-9.])/gi,
      ),
    ]
      /* Un schéma explicite autre que `public` n'est pas servi par l'API. */
      .filter((m) => m[1] === undefined || m[1].toLowerCase() === 'public')
      .map((m) => m[2])
    for (const table of tables) {
      created.push(`${file}:${table}`)
      const granted = new RegExp(`grant[^;]*\\son\\s+(?:public\\.)?${table}\\s+to\\s+authenticated`, 'i').test(code)
      const service = new RegExp(`grant[^;]*\\son\\s+(?:public\\.)?${table}\\s+to\\s+service_role`, 'i').test(code)
      if (!granted || !service) offending.push(`${file} → ${table}${granted ? '' : ' (authenticated)'}${service ? '' : ' (service_role)'}`)
    }
  }
  check(`${created.length} tables créées dans les migrations`, created.length >= 29, String(created.length))
  check('chacune porte ses `grant` DANS SA PROPRE migration', offending.length === 0, offending.join(' | '))

  /* ⛔ Et rien pour `anon` : le besoin réel de ce projet. */
  const anon: string[] = []
  for (const file of files) {
    const code = readFileSync(`${dir}/${file}`, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*--/.test(l))
      .join('\n')
    if (/grant[^;]*\sto\s+anon\b/i.test(code)) anon.push(file)
  }
  check('aucune table n\'est ouverte à `anon` (Lo Yanum n\'a aucune surface anonyme)', anon.length === 0, anon.join(', '))

  const state = readFileSync('PROJECT_STATE.md', 'utf8')
  check('la règle est écrite dans PROJECT_STATE.md', /RÈGLE PERMANENTE[^\n]*AUTORISATIONS/u.test(state))
  check('… avec la date du 30 octobre et le motif', /30 octobre 2026/.test(state) && /grant select, insert, update, delete on public\.<table> to authenticated/.test(state))
  check('… et l\'interdit sur `anon`', /RIEN POUR `anon`/.test(state))

  /* La table neuve de cette passe est bien celle qui porte l'exemple. */
  const fresh = readFileSync(`${dir}/20260924000200_activity_reports.sql`, 'utf8')
  check('`activity_reports` : RLS activée, forcée, quatre politiques',
    /enable row level security/.test(fresh) &&
      /force row level security/.test(fresh) &&
      (fresh.match(/create policy/g) ?? []).length === 4)
  check('`activity_reports` : ses `grant` sont dans la même migration',
    /grant select, insert, update, delete on public\.activity_reports to authenticated/.test(fresh))
}

// ---------------------------------------------------------------------------
section('A243 — les deux statuts : hors compteurs, dans les listes')
// ---------------------------------------------------------------------------
check('neuf statuts en tout', ALL_FARM_STATUSES.length === 9, String(ALL_FARM_STATUSES.length))
check('six dans le pipeline, trois dehors', FARM_PIPELINE.length === 6 && FARM_STATUSES_OFF_PIPELINE.length === 3)
check('`not_relevant_now` et `on_hold` sont hors compteurs',
  !countsTowardProgramme('not_relevant_now') && !countsTowardProgramme('on_hold'))
check('`declined` aussi, et par la MÊME fonction', !countsTowardProgramme('declined'))
check('les six du pipeline comptent tous', FARM_PIPELINE.every((s) => countsTowardProgramme(s)))
check('libellés : « לא רלוונטי כרגע » et « בהמתנה »',
  optionLabel('not_relevant_now', FARM_STATUS_OPTIONS) === 'לא רלוונטי כרגע' &&
    optionLabel('on_hold', FARM_STATUS_OPTIONS) === 'בהמתנה')

/* ⚠️ LES DEUX CHEMINS DE LECTURE, parce qu'ils ne sont pas écrits pareil :
   `readOption` compare des chaînes ENTIÈRES, `readFarmStatus` fait un
   `includes` trié par longueur. « לא רלוונטי כרגע » doit gagner sur
   « לא רלוונטי » dans les deux. */
check('readOption : « לא רלוונטי כרגע » → not_relevant_now',
  readOption('לא רלוונטי כרגע', FARM_STATUS_OPTIONS)?.id === 'not_relevant_now')
check('readOption : « לא רלוונטי » reste declined',
  readOption('לא רלוונטי', FARM_STATUS_OPTIONS)?.id === 'declined')
check('readFarmStatus : « לא רלוונטי כרגע » → not_relevant_now',
  readFarmStatus('לא רלוונטי כרגע') === 'not_relevant_now', readFarmStatus('לא רלוונטי כרגע'))
check('readFarmStatus : « לא רלוונטי » reste declined',
  readFarmStatus('לא רלוונטי') === 'declined', readFarmStatus('לא רלוונטי'))
check('readFarmStatus : « בהמתנה » → on_hold', readFarmStatus('בהמתנה') === 'on_hold')
check('readFarmStatus : « יש להם שומר קבוע » → not_relevant_now',
  readFarmStatus('יש להם שומר קבוע') === 'not_relevant_now')

/* Les couleurs et les libellés existent pour les neuf — une pastille sans
   couleur serait grise et illisible, et `badges.tsx` est typé par `Record`. */
{
  const badges = readFileSync('src/ui/components/badges.tsx', 'utf8')
  const tokens = readFileSync('src/styles/tokens.css', 'utf8')
  const he = JSON.parse(readFileSync('src/locales/he.json', 'utf8')) as { farmStatus: Record<string, string> }
  for (const status of ALL_FARM_STATUSES) {
    check(`« ${status} » : libellé hébreu`, typeof he.farmStatus[status] === 'string' && he.farmStatus[status] !== '')
  }
  for (const name of ['not-relevant-now', 'on-hold']) {
    check(`--farm-${name} : clair ET sombre, vif ET encre`,
      (tokens.match(new RegExp(`--farm-${name}:`, 'g')) ?? []).length >= 3 &&
        (tokens.match(new RegExp(`--farm-${name}-ink:`, 'g')) ?? []).length >= 3,
      `${(tokens.match(new RegExp(`--farm-${name}:`, 'g')) ?? []).length} / ${(tokens.match(new RegExp(`--farm-${name}-ink:`, 'g')) ?? []).length}`)
    check(`badges.tsx connaît farm-${name}`, badges.includes(`bg-farm-${name}/15`))
  }
  /* Les trois listes d'écran passent par @core et non par une copie locale. */
  for (const file of [
    'src/ui/screens/coordinator/FarmsListScreen.tsx',
    'src/ui/screens/coordinator/FarmFormScreen.tsx',
    'src/ui/screens/StyleguideScreen.tsx',
  ]) {
    const src = readFileSync(file, 'utf8')
    check(`${file.split('/').pop()} : la liste vient de @core`,
      src.includes('ALL_FARM_STATUSES') && !/\[\.\.\.FARM_PIPELINE, 'declined'\]/.test(src))
  }
}

// ---------------------------------------------------------------------------
section('A243 (suite) — mesuré sur un vrai store')
// ---------------------------------------------------------------------------
installBackend(DEMO_BACKEND)
setSession({ role: 'coordinator', personId: null, entityId: null })

const newFarm = (over: Partial<Farm>): Farm =>
  createFarm({
    photo: null,
    name: 'AO',
    locality: '',
    region: '',
    type: 'agriculture',
    entityKind: 'farm',
    status: 'to_contact',
    position: { lat: 31.4, lng: 34.7 },
    farmDunams: 0,
    grazingDunams: 0,
    contacts: [],
    commitments: [],
    agreements: [],
    notes: '',
    ...over,
  })

{
  const before = getDunamKpis()
  const beforeVisible = getVisibleFarms().length
  const hold = newFarm({ name: 'AO · בהמתנה', status: 'on_hold', farmDunams: 4242, notes: 'קיבל 6 בני שירות לכל השנה' })
  const away = newFarm({ name: 'AO · לא רלוונטי כרגע', status: 'not_relevant_now', grazingDunams: 50000, notes: 'יש להם שומר קבוע' })
  const after = getDunamKpis()
  check('★ 4 242 dounams « בהמתנה » ne bougent pas le potentiel',
    after.potentialDunams === before.potentialDunams,
    `${before.potentialDunams} → ${after.potentialDunams}`)
  check('★ 50 000 dounams « לא רלוונטי כרגע » non plus',
    after.guardedDunams === before.guardedDunams && after.weightedSigned === before.weightedSigned)
  check('★ et les DEUX fiches sont bien dans les listes',
    getVisibleFarms().length === beforeVisible + 2)
  check('★ … et dans le compte par statut (donc filtrables)',
    getFarmStatusCounts().find((c) => c.status === 'on_hold')?.count === 1 &&
      getFarmStatusCounts().find((c) => c.status === 'not_relevant_now')?.count === 1)
  check('le compte par statut couvre les neuf', getFarmStatusCounts().length === 9)

  /* AO2.4 — le commentaire est sur la fiche et survit à une relecture. */
  check('le commentaire libre est enregistré tel quel',
    getVisibleFarms().find((f) => f.id === hold.id)?.notes === 'קיבל 6 בני שירות לכל השנה')
  check('… et pour l\'autre aussi',
    getVisibleFarms().find((f) => f.id === away.id)?.notes === 'יש להם שומר קבוע')

  /* AO2.5 / AK5 — une signature sans documents reste la moitié du chemin. */
  const signed = newFarm({ name: 'AO · נחתם', status: 'signed', farmDunams: 100 })
  const t = totalsOf(getCountableFarms(), 60000)
  check('★ une fiche signée SANS documents compte comme « ממתינה למסמכים »',
    t.signedAwaitingDocuments >= 1 && t.signedWithDocuments + t.signedAwaitingDocuments === t.signed,
    `${t.signedWithDocuments} + ${t.signedAwaitingDocuments} = ${t.signed}`)
  /* ⚠️ `updateFarm` NE REND RIEN (`void`) : on relit la fiche. */
  updateFarm(signed.id, { status: 'active' })
  check('★ et elle N\'EST PAS « פעילה » : la transition est refusée',
    getVisibleFarms().find((f) => f.id === signed.id)?.status === 'signed',
    String(getVisibleFarms().find((f) => f.id === signed.id)?.status))
}

// ---------------------------------------------------------------------------
section('A244 — les chiffres du rapport, recalculés indépendamment')
// ---------------------------------------------------------------------------
/**
 * ⚠️ « INDÉPENDAMMENT » EST LE MOT. Comparer `buildActivityReport` à
 *    `totalsOf` serait le rapport d'accord avec lui-même. Les totaux sont donc
 *    refaits ICI, à la main, en parcourant `_raw().farms`.
 */
{
  const month = periodFor('month')
  const report = buildActivityReport(month, { targetWeighted: 60000 })

  const farms = getCountableFarms()
  const counted = farms.filter((f) => countsTowardProgramme(f.status))
  /**
   * ⚠️ « LA » SURFACE EST `effectiveAreas` (AD1.4) : déclarée d'abord, mesurée
   *    à défaut. C'est la définition que le tableau de bord additionne, donc
   *    c'est celle que le rapport doit additionner. Sommer `farmDunams` brut
   *    ici a d'abord donné 4 880 contre 5 594 — l'écart, ce sont les fiches
   *    dont la surface vient de leur polygone.
   */
  let cultivated = 0
  let grazing = 0
  let weighted = 0
  for (const f of counted) {
    const areas = effectiveAreas(f)
    cultivated += areas.cultivated
    grazing += areas.grazing
    weighted += weightedDunams(f)
  }
  check('יישויות במניין', report.totals.farms === counted.length, `${report.totals.farms} / ${counted.length}`)
  check('hors compteurs', report.totals.offCount === farms.length - counted.length)
  check('dounams מעובד', report.totals.cultivatedDunams === cultivated, `${report.totals.cultivatedDunams} / ${cultivated}`)
  check('dounams מרעה', report.totals.grazingDunams === grazing, `${report.totals.grazingDunams} / ${grazing}`)
  check('dounams pondérés', report.totals.weightedDunams === weighted, `${report.totals.weightedDunams} / ${weighted}`)
  check('pourcentage du יעד', report.totals.targetPercent === Math.round((weighted / 60000) * 100))
  check('signées = avec documents + en attente',
    report.totals.signed === report.totals.signedWithDocuments + report.totals.signedAwaitingDocuments)
  check('l\'instantané porte UNE ligne par exploitation comptée ou non',
    report.farms.length === farms.length)

  /* La période est bien une BORNE : une visite hors période ne compte pas. */
  const narrow = customPeriod('2000-01-01', '2000-01-02')
  const empty = buildActivityReport(narrow, { targetWeighted: 60000 })
  check('★ une période de janvier 2000 n\'a ni visite, ni signature, ni document',
    empty.visited.length === 0 && empty.signedInPeriod.length === 0 && empty.documentsReceived.length === 0)
  check('★ mais les totaux restent l\'ÉTAT du jour (ce n\'est pas une période)',
    empty.totals.farms === report.totals.farms && empty.totals.weightedDunams === report.totals.weightedDunams)
  check('« היום » est un seul jour', periodFor('today').from === periodFor('today').to)
  check('« השבוע » commence un dimanche',
    new Date(`${periodFor('week').from}T12:00:00`).getDay() === 0, periodFor('week').from)
  check('« החודש » commence le 1er', periodFor('month').from.endsWith('-01'), periodFor('month').from)
  check('une période à l\'envers se remet à l\'endroit',
    customPeriod('2026-09-30', '2026-09-01').from === '2026-09-01')
  check('la période du jour se termine aujourd\'hui',
    periodFor('today').to === localDayKey(new Date()))
}

// ---------------------------------------------------------------------------
section('A245 — la comparaison avec le rapport précédent')
// ---------------------------------------------------------------------------
{
  const period = periodFor('month')
  const first = buildActivityReport(period, { targetWeighted: 60000 })
  const kept: ActivityReportRecord = toRecord(first, 'texte du premier rapport')

  check('★ sans rapport précédent, AUCUN écart n\'est inventé',
    first.delta === null && first.previous === null && first.created.length === 0 &&
      first.statusChanges.length === 0)

  /* On bouge le monde : une fiche neuve, un statut, un contact. */
  const fresh = newFarm({ name: 'AO · nouvelle', status: 'verbal_ok', farmDunams: 700 })
  const moved = getCountableFarms().find((f) => f.status === 'to_contact' && f.id !== fresh.id)!
  updateFarm(moved.id, { status: 'visited' })
  const gained = getCountableFarms().find((f) => f.id !== fresh.id && f.id !== moved.id)!
  updateFarm(gained.id, {
    contacts: [
      ...gained.contacts,
      { id: 'ao-contact', name: 'רותם', phone: '055-0505055', email: '', role: '', photo: null, isPrimary: false },
    ],
  })

  const second = buildActivityReport(period, { targetWeighted: 60000, previous: kept })
  check('le repère est nommé', second.previous?.id === kept.id)
  check('★ la fiche neuve est LA seule « nouvelle »',
    second.created.length === 1 && second.created[0] === 'AO · nouvelle', second.created.join(', '))
  check('★ le changement de statut est nommé, avec son avant et son après',
    second.statusChanges.some((c) => c.farm === moved.name && c.from === 'to_contact' && c.to === 'visited'),
    JSON.stringify(second.statusChanges))
  check('★ le contact gagné est compté sur la BONNE fiche',
    second.newContacts.length === 1 && second.newContacts[0].farm === gained.name &&
      second.newContacts[0].added === 1,
    JSON.stringify(second.newContacts))
  check('★ l\'écart de dounams est exactement celui de la fiche ajoutée',
    second.delta?.cultivatedDunams === 700, String(second.delta?.cultivatedDunams))
  check('★ l\'écart d\'exploitations est +1', second.delta?.farms === 1, String(second.delta?.farms))
  check('l\'écart pondéré est cohérent avec les totaux',
    second.delta?.weightedDunams === second.totals.weightedDunams - kept.totals.weightedDunams)
  check('les points de pourcentage sont des POINTS',
    second.delta?.targetPercentPoints === second.totals.targetPercent - kept.totals.targetPercent)

  /* Se comparer à soi-même ne mesure rien : tout doit être à zéro. */
  const same = buildActivityReport(period, { targetWeighted: 60000, previous: toRecord(second, '') })
  check('★ deux rapports identiques ne montrent AUCUN mouvement',
    same.delta?.farms === 0 && same.created.length === 0 && same.statusChanges.length === 0 &&
      same.newContacts.length === 0)

  // -------------------------------------------------------------------------
  section('A246 — les commentaires, repris TELS QUELS')
  // -------------------------------------------------------------------------
  const odd = 'יש להם שומר קבוע — 24/7, «בדוק», 50% מהזמן\nשורה שנייה'
  const commented = newFarm({ name: 'AO · הערה', status: 'to_contact', notes: odd })
  const withComment = buildActivityReport(period, { targetWeighted: 60000 })
  const line = withComment.comments.find((c) => c.farm === 'AO · הערה')
  check('★ le commentaire est byte pour byte celui de la fiche',
    line?.text === odd, JSON.stringify(line?.text))
  check('… guillemets, barre oblique, pourcentage et saut de ligne compris',
    line?.text.includes('«בדוק»') === true && line?.text.includes('\n') === true)
  check('une fiche sans commentaire n\'apparaît pas dans la liste',
    !withComment.comments.some((c) => c.text.trim() === ''))
  check('l\'instantané garde aussi le commentaire',
    snapshotFarm(getCountableFarms().find((f) => f.id === commented.id)!).note === odd)

  /* AO3.7 — hors compteurs, mais DANS le rapport, avec leur raison. */
  const off = withComment.offCount
  /* ⚠️ `declined` EN FAIT PARTIE — le jeu de démonstration en porte une
     (« חוות מעיין חצבה »). Les TROIS statuts hors pipeline sortent des
     compteurs, et le rapport les nomme tous les trois avec leur raison. */
  check('★ les fiches hors compteurs sont NOMMÉES dans le rapport',
    off.length === getCountableFarms().filter((f) => !countsTowardProgramme(f.status)).length &&
      off.every((o) => FARM_STATUSES_OFF_PIPELINE.includes(o.status)),
    JSON.stringify(off.map((o) => `${o.farm}/${o.status}`)))
  check('★ … les deux nouveaux statuts y sont',
    off.some((o) => o.status === 'on_hold') && off.some((o) => o.status === 'not_relevant_now'))
  check('★ … avec la raison que le PO a écrite',
    off.every((o) => o.note !== ''), JSON.stringify(off.map((o) => o.note)))
  check('★ … et elles ne sont PAS dans `totals.farms`',
    withComment.totals.farms === getCountableFarms().filter((f) => countsTowardProgramme(f.status)).length)
}

// ---------------------------------------------------------------------------
section('A247 — le texte WhatsApp et le PDF')
// ---------------------------------------------------------------------------
{
  const { activityReportText, activityReportTitle } = await import('../src/ui/report/activityText')
  const period = periodFor('month')
  const report = buildActivityReport(period, { targetWeighted: 60000 })
  const text = activityReportText(report)

  check('le texte n\'est pas vide', text.length > 200, `${text.length} caractères`)
  check('★ il commence par un titre en gras WhatsApp', text.startsWith('*דוח פעילות'))
  check('★ il ne contient AUCUNE syntaxe que WhatsApp ne sait pas rendre',
    !text.includes('|') && !text.includes('\t') && !/^#{1,6}\s/m.test(text) && !text.includes('<'),
    text.split('\n').filter((l) => l.includes('|') || l.includes('\t')).join(' / '))
  check('★ aucune ligne vide triple (WhatsApp les garde toutes)', !/\n{3}/.test(text))
  check('★ il ne se termine pas par du blanc', text === text.trimEnd())
  check('les astérisques de gras vont par paires',
    (text.match(/\*/g) ?? []).length % 2 === 0, String((text.match(/\*/g) ?? []).length))
  check('les nombres sont en chiffres groupés (he-IL)',
    text.includes(report.totals.weightedDunams.toLocaleString('he-IL')))
  check('le pourcentage du יעד y est', text.includes(`${report.totals.targetPercent}% מהיעד`))
  check('★ la section de comparaison existe TOUJOURS, même vide',
    text.includes('מה זז מאז הדוח הקודם'))
  check('★ sans repère, elle le DIT au lieu d\'inventer',
    report.previous === null ? text.includes('זהו הדוח הראשון') : true)
  check('les commentaires du PO sont dans le texte',
    report.comments.length === 0 || report.comments.every((c) => text.includes(c.text.split('\n')[0])))
  check('les hors-compteurs sont dans le texte avec leur statut',
    report.offCount.length === 0 || text.includes('מחוץ למניין'))
  check('le titre du fichier porte la période', activityReportTitle(report).includes('דוח פעילות'))

  /* ⚠️ ZÉRO ARITHMÉTIQUE DANS LA MISE EN FORME — la règle de PO POINT 7c,
     étendue aux deux fichiers d'AO3. Un `+` entre deux champs du rapport
     serait une seconde arithmétique capable de contredire l'écran. */
  for (const file of ['src/ui/report/activityText.ts', 'src/ui/report/activityDraw.ts']) {
    const code = readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    const sums = [...code.matchAll(/\b(?:report|totals|t|d)\.[a-zA-Z.]+\s*[+\-*/]\s*\b(?:report|totals|t|d)\./g)]
    check(`${file.split('/').pop()} : aucun calcul entre deux champs du rapport`,
      sums.length === 0, sums.map((m) => m[0]).join(' | '))
  }
}

// ---------------------------------------------------------------------------
section('A248 — les rapports conservés, et le choix du repère')
// ---------------------------------------------------------------------------
{
  /* `activityHistory` vit dans `localStorage` : on lui en donne un. */
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
  const { previousReportFor } = await import('../src/ui/report/activityHistory')

  const record = (from: string, to: string, weighted: number): ActivityReportRecord => ({
    id: `r-${from}-${to}`,
    period: customPeriod(from, to),
    generatedAt: `${to}T18:00:00.000Z`,
    previousId: null,
    totals: {
      farms: 1, offCount: 0, cultivatedDunams: 0, grazingDunams: 0,
      weightedDunams: weighted, targetWeighted: 60000, targetPercent: 0,
      signed: 0, signedWithDocuments: 0, signedAwaitingDocuments: 0, contacts: 0,
    },
    farms: [],
    body: `texte ${from}`,
  })
  const rows = [
    record('2026-09-01', '2026-09-30', 300),
    record('2026-08-01', '2026-08-31', 200),
    record('2026-07-01', '2026-07-31', 100),
  ]
  check('★ le repère d\'octobre est SEPTEMBRE, le dernier qui se termine avant',
    previousReportFor(customPeriod('2026-10-01', '2026-10-31'), rows)?.id === 'r-2026-09-01-2026-09-30')
  check('★ le repère d\'août est JUILLET, pas septembre (qui vient après)',
    previousReportFor(customPeriod('2026-08-01', '2026-08-31'), rows)?.id === 'r-2026-07-01-2026-07-31')
  check('★ sans aucun rapport antérieur, on ne se compare pas à SOI-MÊME',
    previousReportFor(customPeriod('2026-07-01', '2026-07-31'), [rows[2]]) === null)
  check('★ mais un rapport d\'une AUTRE période sert de repli',
    previousReportFor(customPeriod('2026-07-01', '2026-07-31'), rows)?.id === 'r-2026-09-01-2026-09-30')
  check('aucun rapport gardé → aucun repère', previousReportFor(periodFor('month'), []) === null)

  /* Le texte envoyé est gardé MOT POUR MOT (AO3.6). */
  const period = periodFor('month')
  const report = buildActivityReport(period, { targetWeighted: 60000 })
  const body = 'שלום, הנה הדוח: 1,234 דונם.\n*בגדול*'
  const kept = toRecord(report, body)
  check('★ le texte envoyé est conservé au caractère près', kept.body === body)
  check('l\'identifiant porte la période', kept.id.includes(period.from) && kept.id.includes(period.to))
  check('l\'instantané par exploitation est gardé (sinon pas de comparaison)',
    kept.farms.length === report.farms.length && kept.farms.length > 0)
  check('le repère du rapport gardé est nommé', kept.previousId === (report.previous?.id ?? null))
}

// ---------------------------------------------------------------------------
section('A249 — un préfixe d\'ordre n\'est pas une initiale')
// ---------------------------------------------------------------------------
/**
 * ★ VU SUR LES CAPTURES DU BUILD RÉEL, pas déduit : dix des vingt-cinq noms du
 *   portail commencent par « 0N - », et l'avatar de la liste rendait « 0- »
 *   pour toutes les dix — dans un écran où l'avatar EST ce qui distingue une
 *   ligne de la suivante du coin de l'œil.
 */
{
  const { initialsOf } = await import('../src/core/photo')
  check('« 01 - תומר שדה משה חקלאות » → les initiales de תומר שדה',
    initialsOf('01 - תומר שדה משה חקלאות') === 'תש', initialsOf('01 - תומר שדה משה חקלאות'))
  check('« 02 - שדה משה חקלאות » → שמ', initialsOf('02 - שדה משה חקלאות') === 'שמ',
    initialsOf('02 - שדה משה חקלאות'))
  check('« 05 - גד״ש תדהר — החווה של אופק » → גת',
    initialsOf('05 - גד״ש תדהר — החווה של אופק') === 'גת',
    initialsOf('05 - גד״ש תדהר — החווה של אופק'))
  check('★ aucune des dix fiches préfixées ne rend « 0- »',
    !['01 - א ב', '02 - ג ד', '07 - מושב איתן'].some((n) => initialsOf(n).startsWith('0')))
  check('un nom SANS préfixe est inchangé (חוות מרגי)', initialsOf('חוות מרגי') === 'חמ')
  check('un nom qui commence par un chiffre SANS tiret est inchangé',
    initialsOf('2 חוות') === '2ח', initialsOf('2 חוות'))
  check('★ un nom qui n\'est QUE son numéro ne devient pas « ? »',
    initialsOf('03 - ') !== '?', initialsOf('03 - '))
  check('un nom vide rend toujours « ? »', initialsOf('   ') === '?')
}

console.log(`\n  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
