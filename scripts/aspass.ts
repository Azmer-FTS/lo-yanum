import { existsSync, readFileSync } from 'node:fs'

import {
  classifyLocationCell,
  parsePortalCsv,
  planPortalImport,
  portalPlanSummary,
  readPortalArea,
  readPortalRows,
} from '../src/core/portalImport'
import type { PortalPlan } from '../src/core/portalImport'
import type { Farm, Lead } from '../src/core/types'
import { allowedUrl, processEntity } from '../supabase/functions/portal-document/copy'
import type { Deps, LandDoc } from '../supabase/functions/portal-document/copy'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS — PORTE PURE. A284 · A285 · A286 · A287 · A288 (et la suite d'AS au fil
 * de la passe). Aucune base, aucun navigateur.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aspass
 *
 * ⚠️ LE JEU COMMITÉ EST FICTIF (`samples/as-portal-fictif.csv`) : le dépôt est
 *    PUBLIC, et le vrai export porte des signatures et des ת״ז. Il reproduit
 *    les pièges du vrai fichier (BOM, en-têtes répétés, courriel dans
 *    « מיקום », coordonnées dans « כתובת », milliers, PNG base64, lien S3).
 *    Si le vrai fichier est présent HORS DÉPÔT (`private/`), la porte le
 *    rejoue aussi contre l'instantané relu de la base.
 */

let pass = 0
let fail = 0
function check(label: string, cond: boolean, detail = ''): void {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
const section = (t: string): void => console.log(`\n${t}\n${'-'.repeat(70)}`)

const NOW = '2026-10-07T12:00:00.000Z'
const farm = (f: Partial<Farm> & { id: string; name: string }): Farm =>
  ({
    locality: '',
    status: 'verbal_ok',
    position: { lat: 31.7683, lng: 35.2137 },
    positionMissing: true,
    farmDunams: 0,
    grazingDunams: 0,
    notes: '',
    ...f,
  }) as Farm

const FARMS: Farm[] = [
  farm({ id: 'farm-x1', name: 'חוות אלף', farmerPhone: '052-0000003', position: { lat: 31.6009, lng: 34.8004 }, positionMissing: false }),
  farm({ id: 'farm-x2', name: '02 - חוות בית', farmerName: 'בית', farmerPhone: '054-0000004', farmerId: '', positionMissing: true }),
  farm({ id: 'farm-old', name: 'חוות ישנה', status: 'to_contact', farmerName: 'שלמה בדיקה', farmerPhone: '050-0000009' }),
  farm({ id: 'farm-st', name: 'גד״ש בדיקה', status: 'not_relevant_now', farmerName: 'דני', farmerPhone: '050-0000001', notes: 'יש להם שומר קבוע' }),
  farm({ id: 'farm-hist', name: 'גד״ש עם הערה', status: 'to_contact', farmerName: 'רינה', farmerPhone: '050-0000002' }),
]
const HISTORY: Record<string, string[]> = { 'farm-hist': ['visit'] }

const csvText = readFileSync('samples/as-portal-fictif.csv', 'utf8')
const matrix = parsePortalCsv(csvText)
const plan = planPortalImport({ matrix, farms: FARMS, leads: [], fileName: 'as-portal-fictif.csv', nowIso: NOW, historyOf: (id) => HISTORY[id] ?? [] })
const { rows } = readPortalRows(matrix)
const byName = (n: string) => rows.find((r) => r.name === n)!
const action = (n: string) => plan.actions.find((a) => a.row.name === n)

section('A284 — le CSV lu en TEXTE : aucun zéro perdu, aucun inventé, surfaces nettoyées, מיקום typée')
check('le BOM est retiré et la ligne d’en-tête est lue', matrix[0][0] === 'שם המקום')
check('les 8 lignes sont lues', rows.length === 8, String(rows.length))
check('aucune cellule n’est un nombre : la matrice ne porte que des chaînes', matrix.every((r) => r.every((c) => typeof c === 'string')))
check('le téléphone garde son zéro initial et prend la forme de l’app', byName('גד״ש בדיקה').phone === '050-0000001', byName('גד״ש בדיקה').phone)
check('un ת״ז / ח״פ à zéros de tête est gardé tel quel', byName('01 - חוות אלף').idNo === '0012345', byName('01 - חוות אלף').idNo)
check('⛔ AUCUN zéro inventé : 57000000 reste à huit chiffres', byName('החווה של שלמה').idNo === '57000000', byName('החווה של שלמה').idNo)
check('« 0 » est la case vide du portail, pas un numéro', byName('חוות גימל').idNo === '')
check('« 26,000 » → 26000', readPortalArea('26,000') === 26000)
check('« 1,058 » → 1058 ; « 1 000 » → 1000 ; vide → null', readPortalArea('1,058') === 1058 && readPortalArea('1 000') === 1000 && readPortalArea('') === null)
check('les surfaces de la ligne réelle sont nettoyées', byName('02 - חוות בית').grazing === 26000 && byName('01 - חוות אלף').cultivated === 1280)
check('מיקום : un courriel est typé courriel', classifyLocationCell('a@example.com').kind === 'email')
check('מיקום : un nom est typé texte (« ניר עקובא » dans le vrai fichier)', classifyLocationCell('שם חופשי').kind === 'text')
check('מיקום : vide → vide', classifyLocationCell('  ').kind === 'empty')
check('le courriel trouvé dans מיקום devient le courriel de l’agriculteur', byName('01 - חוות אלף').email === 'a@example.com')
check('un texte dans מיקום est SIGNALÉ, jamais interprété', plan.warnings.some((w) => w.code === 'location-text' && w.detail === 'שם חופשי'))
const short = plan.warnings.filter((w) => w.code === 'id-not-9-digits').map((w) => w.name)
check('les numéros qui n’ont pas neuf chiffres sont signalés', short.includes('01 - חוות אלף') && short.includes('החווה של שלמה') && !short.includes('02 - חוות בית'), short.join(' · '))
check('pas de colonne de statut : dit dans le rapport', plan.warnings.some((w) => w.code === 'status-column-missing'))

section('A285 — chaque point en Israël ; aucune épingle du PO écrasée')
check('ordre du portail lat, lng : lu', classifyLocationCell('31.6000000, 34.8000000').order === 'lat-lng')
check('ordre inverse lng, lat : détecté, retourné, SIGNALÉ', byName('חוות גימל').position?.lat === 31.4 && plan.warnings.some((w) => w.name === 'חוות גימל' && w.code === 'swapped-order'))
check('un point hors du pays est refusé et signalé', byName('חוות דלת').position === null && plan.warnings.some((w) => w.code === 'outside-israel'))
const inIsrael = rows.every((r) => !r.position || (r.position.lat >= 29.4 && r.position.lat <= 33.4 && r.position.lng >= 34.2 && r.position.lng <= 35.95))
check('tout point retenu tombe en Israël', inIsrael)
const x1 = action('01 - חוות אלף')
check('l’épingle posée par le PO n’est PAS écrasée', x1?.kind === 'update' && x1.patch.position === undefined)
check('… et l’écart est dit au PO', plan.warnings.some((w) => w.name === '01 - חוות אלף' && w.code === 'pin-kept'))
const x2 = action('02 - חוות בית')
check('une fiche jamais placée reçoit le point du portail', x2?.kind === 'update' && x2.patch.position?.lat === 31.5 && x2.patch.positionMissing === false)

section('A286 — signatures et contrats rattachés comme documents')
check('la signature PNG comble un vide', x2?.kind === 'update' && typeof x2.patch.signature === 'string' && x2.patch.signatureOrigin?.kind === 'imported')
check('le contrat S3 est mis en FILE (pending), lien d’origine gardé', x2?.kind === 'update' && x2.patch.landDocuments?.[0]?.status === 'pending' && x2.patch.landDocuments[0].url!.startsWith('https://1234-application-data'))
check('« הורדה » sans lien est signalé', plan.warnings.some((w) => w.code === 'contract-mention-without-link' && w.name === 'חוות דלת'))
check('la liste des fiches signées est rendue', plan.signatures.map((s) => s.name).sort().join('|') === ['02 - חוות בית', 'חוות גימל', 'החווה של שלמה'].sort().join('|'))
check('une signature sans statut « נחתם » est signalée, pas tranchée', plan.warnings.some((w) => w.code === 'signature-without-signed-status'))
check('une signature DÉJÀ présente n’est jamais remplacée', (() => {
  const signed = FARMS.map((f) => (f.id === 'farm-x2' ? { ...f, signature: 'data:image/png;base64,AAAA' } : f))
  const p = planPortalImport({ matrix, farms: signed, leads: [], fileName: 'x', nowIso: NOW })
  const a = p.actions.find((y) => y.row.name === '02 - חוות בית')
  return a?.kind === 'update' && a.patch.signature === undefined
})())
check('fonction Edge : seul l’hôte des fichiers Tadabase est autorisé', allowedUrl('https://8232-application-data-2273.s3.amazonaws.com/a.pdf') && !allowedUrl('https://evil.example.com/a.pdf') && !allowedUrl('http://8232-application-data-2273.s3.amazonaws.com/a.pdf') && !allowedUrl('https://169.254.169.254/'))
await (async () => {
  const docs: LandDoc[] = [
    { id: 'land-a', source: 'portal', url: 'https://1-application-data-2.s3.amazonaws.com/a.pdf', fileName: 'a.pdf', addedAt: NOW, status: 'pending', storageKey: null, size: null },
    { id: 'land-b', source: 'portal', url: 'https://evil.example.com/b.pdf', fileName: 'b.pdf', addedAt: NOW, status: 'pending', storageKey: null, size: null },
  ]
  let store = docs
  const uploads: string[] = []
  const deps: Deps = {
    readDocs: async () => store,
    fetchFile: async () => ({ ok: true, status: 200, type: 'application/pdf', bytes: new Uint8Array([37, 80, 68, 70]) }),
    upload: async (k) => void uploads.push(k),
    writeDocs: async (_id, d) => void (store = d),
  }
  const first = await processEntity('farm-x2', deps)
  check('fonction Edge : le PDF autorisé est recopié dans land/<fiche>/', first.stored === 1 && uploads[0] === 'land/farm-x2/land-a.pdf' && store[0].status === 'stored')
  check('fonction Edge : un autre hôte est refusé sans être lu', first.failed === 1 && store[1].status === 'failed' && store[1].error === 'host')
  const second = await processEntity('farm-x2', deps)
  check('fonction Edge : rappelée, elle ne refait rien (rien en file)', second.stored === 0 && uploads.length === 1)
  check('fonction Edge : un identifiant malformé ne lit rien', (await processEntity('x; drop', deps)).stored === 0)
})()

section('A287 — une seule fiche pour la même exploitation, aucune piste pour le vestige')
const shlomo = action('החווה של שלמה')
check('la ligne complète retrouve l’ANCIENNE fiche par son téléphone', shlomo?.kind === 'update' && shlomo.farmId === 'farm-old' && shlomo.pairedBy === 'phone')
check('… et prend le nom du portail', shlomo?.kind === 'update' && shlomo.patch.name === 'החווה של שלמה')
const ghost = action('חוות ישנה')
check('la ligne étoilée jumelle est ignorée (vestige)', ghost?.kind === 'skip-duplicate')
check('aucune piste, aucune fiche n’est créée pour le vestige', !plan.actions.some((a) => (a.kind === 'lead-create' || a.kind === 'create-farm' || a.kind === 'farm-to-lead') && a.row.name === 'חוות ישנה'))
check('l’import suivant, sans la ligne en double, apparie par NOM', (() => {
  const renamed = FARMS.map((f) => (f.id === 'farm-old' ? { ...f, name: 'החווה של שלמה' } : f))
  const m2 = matrix.filter((r) => !(r[0] ?? '').includes('חוות ישנה'))
  const p = planPortalImport({ matrix: m2, farms: renamed, leads: [], fileName: 'x', nowIso: NOW })
  const a = p.actions.find((y) => y.row.name === 'החווה של שלמה')
  return a?.kind === 'update' && a.farmId === 'farm-old' && a.pairedBy === 'name'
})())

section('A288 — les noms à astérisques sont des pistes ; aucune astérisque ; la note est gardée')
const conv = action('גד״ש בדיקה')
check('une fiche existante sans histoire est CONVERTIE en piste', conv?.kind === 'farm-to-lead' && conv.farmId === 'farm-st')
check('la note de la fiche suit la piste', conv?.kind === 'farm-to-lead' && conv.lead.notes === 'יש להם שומר קבוע')
check('« לא רלוונטי כרגע » devient « לא רלוונטי כרגע » côté piste', conv?.kind === 'farm-to-lead' && conv.lead.status === 'not_now')
const hist = action('גד״ש עם הערה')
check('une fiche AVEC histoire n’est pas convertie : elle est signalée', hist === undefined && plan.warnings.some((w) => w.code === 'has-history'))
const leadNames = plan.actions.flatMap((a) => (a.kind === 'farm-to-lead' || a.kind === 'lead-create' ? [a.lead.name] : []))
check('aucune astérisque dans un libellé de piste', leadNames.every((n) => !n.includes('*')), leadNames.join(' · '))
check('aucune ligne étoilée ne devient une ferme', !plan.actions.some((a) => a.row.starred && (a.kind === 'update' || a.kind === 'create-farm')))
check('׳׳ et ’’ deviennent ״', rows.every((r) => !/׳׳|’’/u.test(r.name)))
check('une piste déjà là est mise à jour, pas dupliquée', (() => {
  const lead = { id: 'lead-1', name: 'גד״ש בדיקה', contactName: '', phone: '050-0000001', position: null, convertedFarmId: null } as unknown as Lead
  const p = planPortalImport({ matrix, farms: FARMS.filter((f) => f.id !== 'farm-st'), leads: [lead], fileName: 'x', nowIso: NOW })
  const a = p.actions.find((y) => y.row.name === 'גד״ש בדיקה')
  return a?.kind === 'lead-update' && a.patch.contactName === 'דני'
})())

section('Idempotence — appliquer puis réimporter ne change plus rien')
check('réimport après application : 0 changement', (() => {
  const after = applyInMemory(FARMS, plan)
  const p = planPortalImport({ matrix, farms: after.farms, leads: after.leads, fileName: 'x', nowIso: NOW, historyOf: (id) => HISTORY[id] ?? [] })
  const changes = p.actions.reduce((n, a) => n + ('changes' in a ? a.changes.length : 0) + (a.kind === 'farm-to-lead' || a.kind === 'lead-create' || a.kind === 'create-farm' ? 1 : 0), 0)
  if (changes) console.log(p.actions.filter((a) => ('changes' in a && a.changes.length) || a.kind === 'farm-to-lead' || a.kind === 'lead-create').map((a) => a.kind + ':' + a.row.name + ':' + JSON.stringify('changes' in a ? a.changes : '')))
  return changes === 0
})())

function applyInMemory(farms: Farm[], p: PortalPlan): { farms: Farm[]; leads: Lead[] } {
  let out = farms.map((f) => ({ ...f }))
  const leads: Lead[] = []
  for (const a of p.actions) {
    if (a.kind === 'update') out = out.map((f) => (f.id === a.farmId ? { ...f, ...a.patch } : f))
    if (a.kind === 'create-farm') out.push(farm({ id: `new-${a.row.line}`, ...a.farm }))
    if (a.kind === 'farm-to-lead') {
      out = out.filter((f) => f.id !== a.farmId)
      leads.push({ ...a.lead, id: `l-${a.row.line}`, rank: 0 })
    }
    if (a.kind === 'lead-create') leads.push({ ...a.lead, id: `l-${a.row.line}`, rank: 0 })
  }
  return { farms: out, leads }
}

section('A290 · AS4 — la fusion des réglages, clé par clé (pure)')
{
  const { mergeSettings, readRemoteSide, SYNCED_SETTING_KEYS, LOCAL_ONLY_KEYS } = await import('../src/ui/settings/sync')
  const T = 'lo-yanum:target'
  const C = 'lo-yanum:coordinator'
  const side = (values: Record<string, string | null>, stamps: Record<string, number>) => ({ values, stamps })
  let m = mergeSettings(side({ [T]: 'old' }, { [T]: 100 }), side({ [T]: 'new' }, { [T]: 200 }), 150)
  check('distant plus récent → appliqué ici, sans conflit (rien changé ici depuis la synchro)', m.local.values[T] === 'new' && m.applied.includes(T) && m.conflicts.length === 0 && !m.push)
  m = mergeSettings(side({ [T]: 'mine' }, { [T]: 180 }), side({ [T]: 'theirs' }, { [T]: 200 }), 150)
  check('changé ici ET plus récent ailleurs → le plus récent gagne, CONFLIT signalé', m.local.values[T] === 'theirs' && m.conflicts.includes(T))
  m = mergeSettings(side({ [T]: 'mine' }, { [T]: 300 }), side({ [T]: 'theirs' }, { [T]: 200 }), 150)
  check('local plus récent → il MONTE, le distant ne l’écrase pas', m.local.values[T] === 'mine' && m.push && m.remote[T] === 'mine')
  m = mergeSettings(side({ [T]: 'a', [C]: 'stale' }, { [T]: 300, [C]: 10 }), side({ [T]: 'b', [C]: 'fresh' }, { [T]: 200, [C]: 250 }), 260)
  check('un appareil aux valeurs d’hier ne pousse QUE ce qu’il a changé', m.remote[T] === 'a' && m.remote[C] === 'fresh' && m.local.values[C] === 'fresh')
  m = mergeSettings(side({ [C]: null }, { [C]: 300 }), side({ [C]: 'card' }, { [C]: 200 }), 250)
  check('un EFFACEMENT plus récent monte (la clé quitte le bloc)', m.push && m.remote[C] === undefined)
  m = mergeSettings(side({ [T]: 'local' }, {}), side({ [T]: 'server' }, {}), 0)
  check('réglages d’avant AS4 (aucun instant) : le compte gagne, comme AH11.2', m.local.values[T] === 'server')
  m = mergeSettings(side({ [T]: 'local' }, {}), side({}, {}), 0)
  check('… et un compte vide reçoit ce que l’appareil porte', m.push && m.remote[T] === 'local')
  check('le bloc porte ses instants (`__stamps`)', typeof m.remote.__stamps === 'string')
  check('readRemoteSide lit un bloc d’avant AS4 sans instants', readRemoteSide({ [T]: 'x' }).values[T] === 'x')
  const want = ['lo-yanum:target', 'lo-yanum:coverage', 'lo-yanum:vigil', 'lo-yanum:area-gap', 'lo-yanum:summons-template', 'lo-yanum:agreement-doc-template', 'lo-yanum:region-rings', 'lo-yanum:coordinator', 'lo-yanum:origin']
  check('carte, seuils, gabarits, régions, objectif, point de départ VOYAGENT', want.every((k) => SYNCED_SETTING_KEYS.includes(k)))
  check('laissez-passer et temporisation restent LOCAUX', !SYNCED_SETTING_KEYS.some((k) => /farmer-pass|guard-pass|link-unlock|theme/.test(k)) && LOCAL_ONLY_KEYS.some((l) => l.key === 'lo-yanum:farmer-pass') && LOCAL_ONLY_KEYS.some((l) => l.key === 'lo-yanum:link-unlock'))
}

section('A292 · AS6 — un bloc collé de plusieurs contacts → autant de pistes')
{
  const { parseLeadBlock } = await import('../src/core/leads')
  const block = [
    'שלום, הנה אנשי קשר מהקבוצה:',
    'משה כהן 050-1234567 נתיבות',
    'דנה לוי - 0527654321 - משק לוי בשדרות',
    '+972 54 111 2233 יוסי מאופקים',
    'רפת השקמה',
    '052 999 8888',
    'אופקים',
    '[7.10.2026, 12:13:09] אבי: חוות האלה 0501112222',
    'BEGIN:VCARD', 'VERSION:3.0', 'N:מזרחי;יוסי;;;', 'FN:יוסי מזרחי', 'TEL;type=CELL;waid=972503334444:+972 50-333-4444', 'END:VCARD',
    'משה כהן 050 123 4567',
    'תודה!',
  ].join('\n')
  const got = parseLeadBlock(block, { farms: [{ name: 'חוות קיימת', farmerPhone: '052-9998888' }] })
  const withPhone = got.filter((g) => !g.noPhone)
  check('six contacts distincts avec numéro (le doublon fusionné)', withPhone.length === 6, String(withPhone.length))
  check('la carte de contact WhatsApp (vCard) est lue', got.some((g) => g.contactName === 'יוסי מזרחי' && g.phone === '050-3334444'))
  check('+972 et espaces → 054-1112233, lieu « מאופקים » reconnu', got.some((g) => g.phone === '054-1112233' && g.place === 'אופקים'))
  check('nom sur la ligne d’AVANT, lieu sur la ligne d’APRÈS', got.some((g) => g.name === 'רפת השקמה' && g.place === 'אופקים'))
  check('« משק לוי » est l’exploitation, « דנה לוי » la personne', got.some((g) => g.name === 'משק לוי' && g.contactName === 'דנה לוי' && g.place === 'שדרות'))
  check('l’horodatage et l’expéditeur d’un export de discussion sont retirés', got.some((g) => g.phone === '050-1112222' && !g.name.includes('אבי')))
  check('un numéro déjà connu d’une ferme est SIGNALÉ', got.some((g) => g.phone === '052-9998888' && g.duplicateOf?.kind === 'farm'))
  check('le bavardage sans numéro est proposé décoché, jamais perdu', got.some((g) => g.noPhone && g.name === 'תודה!'))
  check('le préambule « שלום, הנה… » ne devient pas une piste', !got.some((g) => g.raw.startsWith('שלום')))
}

section('A296 · AS6 — aucune piste ne compte, nulle part')
{
  const store = await import('../src/core/store')
  const access = await import('../src/core/access')
  const { buildProgrammeReport } = await import('../src/core/report')
  const { buildActivityReport } = await import('../src/core/activity')
  const kpi0 = JSON.stringify(access.getDunamKpis())
  const counts0 = JSON.stringify(access.getFarmStatusCounts())
  const farms0 = access.getCountableFarms().length
  const leads0 = store._raw().leads.length
  store.createLeads(
    Array.from({ length: 20 }, (_, i) => ({
      name: `פיסה ${i}`, contactName: '', phone: `050-00011${String(i).padStart(2, '0')}`, place: 'נתיבות',
      position: { lat: 31.42, lng: 34.59 }, regionId: null, notes: '', source: 'paste' as const, raw: '', status: 'meeting_set' as const,
    })),
  )
  check('20 pistes ajoutées', store._raw().leads.length === leads0 + 20)
  check('l’objectif et les dounams ne bougent pas', JSON.stringify(access.getDunamKpis()) === kpi0)
  check('les compteurs par statut ne bougent pas', JSON.stringify(access.getFarmStatusCounts()) === counts0)
  check('les fermes comptables ne bougent pas', access.getCountableFarms().length === farms0)
  check('les fermes comptables ne sont pas vides (le test mesure quelque chose)', farms0 > 0, String(farms0))
  check('ni le compte rendu ni le rapport d’activité ne lisent `leads`', !/\bleads\b/u.test(readFileSync('src/core/report.ts', 'utf8')) && !/\bleads\b/u.test(readFileSync('src/core/activity.ts', 'utf8')) && typeof buildProgrammeReport === 'function' && typeof buildActivityReport === 'function')
  const lead = store._raw().leads[0]
  const farm = store.convertLeadToFarm(lead.id, { lat: 31.5, lng: 34.6 })
  check('A294 · convertie : une ferme SANS ressaisie (nom, téléphone, lieu, point)', !!farm && farm.name === lead.name && farm.farmerPhone === lead.phone && farm.locality === lead.place && farm.position.lat === lead.position!.lat)
  check('A294 · … et la piste quitte la salle d’attente', !access.getVisibleLeads().some((l) => l.id === lead.id))
  const refused = store._raw().leads.find((l) => !l.convertedFarmId)!
  store.moveLead(refused.id, { status: 'not_interested' })
  check('une piste refusée RESTE, marquée « לא מעוניין »', access.getVisibleLeads().some((l) => l.id === refused.id && l.status === 'not_interested'))
}

const REAL = 'private/portal-export-2026-10-07.csv'
if (existsSync(REAL) && existsSync('private/as-db-avant.json')) {
  section('Le VRAI export (hors dépôt) contre la base relue avant écriture')
  const { buildPlan } = await import('./asdata')
  const real = buildPlan()
  const s = portalPlanSummary(real)
  check('19 fiches mises à jour, 6 converties en pistes, 1 vestige, 0 création', s.update === 19 && s['farm-to-lead'] === 6 && s['skip-duplicate'] === 1 && s['create-farm'] === 0, JSON.stringify(s))
  const z = real.actions.find((a) => a.row.name === 'החווה של צביקה')
  check('צביקה : la fiche d’אורחאן est reprise par téléphone', z?.kind === 'update' && z.farmId === 'farm-ak1-06' && z.pairedBy === 'phone')
  const ids = real.warnings.filter((w) => w.code === 'id-not-9-digits').map((w) => w.detail.split(' ')[0])
  check('les cinq numéros hors neuf chiffres sont signalés', ids.sort().join(',') === ['21985189', '23505696', '24015877', '57739120', '7010797'].sort().join(','), ids.join(','))
  check('10 signatures, 4 contrats', real.signatures.length === 10 && real.contracts.length === 4)
  const realRows = readPortalRows(parsePortalCsv(readFileSync(REAL, 'utf8'))).rows
  check('A285 : chaque point du vrai fichier tombe en Israël', realRows.every((r) => !r.position || (r.position.lat > 29.4 && r.position.lat < 33.4 && r.position.lng > 34.2 && r.position.lng < 35.95)))
  check('aucun téléphone n’a perdu son zéro', realRows.every((r) => r.phone === '' || r.phone.startsWith('0')))
} else {
  console.log('\n(le vrai export n’est pas présent dans private/ — section sautée)')
}

console.log(`\n${fail === 0 ? `All ${pass} checks passed.` : `${fail} of ${pass + fail} checks FAILED.`}`)
if (fail > 0) process.exit(1)
