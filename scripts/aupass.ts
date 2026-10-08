import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { planInstitutionImport, readInstitutionRows, isNamedUncertain, institutionIdOf } from '../src/core/institutions'
import type { Institution } from '../src/core/institutions'
import { computeCoverage, COVERAGE_PRESETS } from '../src/core/coverage'
import { MAPPINGS } from '../src/data/rows'
import type { Farm, Lead } from '../src/core/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AU — PORTE PURE : A317 · A318 (calcul) · A320 · A321.   bun run aupass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A317 lit un classeur qui a la FORME annoncée par le PO (64 lignes, type,
 * public, réseau, coordonnées, distances) — le vrai n'est pas arrivé avec le
 * brief ; quand il arrivera, `AU_WORKBOOK=<chemin.csv>` le fait lire ici.
 * A321 / A320 lisent le CODE : aucun fichier de compteur ne touche aux
 * collections `institutions` ni `leads`.
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(t: string) {
  console.log(`\n  ${t}\n  ${'-'.repeat(t.length)}`)
}

// --- A317 ---------------------------------------------------------------------

section('A317 — lecture du classeur, statut, quatre points incertains')
const HEAD = ['שם המוסד', 'יישוב', 'סוג', 'קהל', 'רשת / עמותה', 'lat', 'lng', 'מרחק מבאר שבע (ק״מ)']
const SAMPLE: string[][] = [HEAD]
const kinds = ['מכינה קדם צבאית', 'ישיבת הסדר', 'מדרשה']
for (let i = 0; i < 60; i++) {
  SAMPLE.push([`מוסד בדיקה ${i + 1}`, `יישוב ${i % 12}`, kinds[i % 3], i % 3 === 0 ? 'מעורב' : '', i % 4 === 0 ? 'רשת בדיקה' : '', String(31 + (i % 10) * 0.05), String(34.5 + (i % 7) * 0.05), String(10 + i)])
}
// Les quatre du PO, telles qu'il les a nommées.
SAMPLE.push(['ממדבר מתנה', 'נווה', 'מכינה', '', '', '31.07', '34.32', '60'])
SAMPLE.push(['מכינת עצמונה', 'נווה', 'מכינה', 'בנים', '', '31.06', '34.31', '61'])
SAMPLE.push(['מדבר שור', 'אשכול', 'מכינה', '', '', '31.2', '34.4', '45'])
SAMPLE.push(['ישיבת מרחבעם', 'מרחב עם', 'ישיבת הסדר', '', '', '30.83', '34.86', '40'])

const matrix: string[][] = process.env.AU_WORKBOOK
  ? (await import('../src/core/portalImport')).parsePortalCsv(readFileSync(process.env.AU_WORKBOOK, 'utf8'))
  : SAMPLE
const { rows, columns } = readInstitutionRows(matrix)
check('A317 64 lignes lues', rows.length === 64, `${rows.length}`)
check('A317 colonnes reconnues : nom, localité, type, public, réseau, lat, lng', ['name', 'locality', 'kind', 'audience', 'network', 'lat', 'lng'].every((k) => k in columns), JSON.stringify(columns))
check('A317 type lu (mékhina, hesder, midrasha)', new Set(rows.map((r) => r.kind)).size === 3 && rows.every((r) => r.kind !== 'other'))
check('A317 public : hesder → garçons, midrasha → filles quand muet ; « מעורב » lu', rows.filter((r) => r.kind === 'hesder').every((r) => r.audience === 'boys' || r.audience === 'mixed') && rows.some((r) => r.audience === 'mixed'))
check('A317 les colonnes non lues (distances) sont GARDÉES', rows.every((r) => r.extra.includes('מרחק')))
const plan = planInstitutionImport({ matrix, existing: [], nowIso: '2026-10-08T00:00:00.000Z' })
const created = plan.actions.filter((a) => a.kind === 'create').map((a) => (a as { institution: Institution }).institution)
check('A317 chaque institution porte un statut d’engagement', created.length === 64 && created.every((i) => i.engagement === 'not_contacted'))
const flagged = created.filter((i) => i.positionUncertain).map((i) => i.name)
check('A317 les QUATRE points incertains sont signalés, et eux seuls', flagged.length === 4 && ['ממדבר מתנה', 'מכינת עצמונה', 'מדבר שור', 'ישיבת מרחבעם'].every((n) => flagged.includes(n)), flagged.join(' · '))
check('A317 « מדבר מתנה » ailleurs qu’à נווה n’est pas confondu', !isNamedUncertain('מדבר מתנה', 'ירוחם'))
// Réimport : identité stable, rien de dupliqué, le statut du PO jamais écrasé.
const signed = created.map((i, k) => (k === 0 ? { ...i, engagement: 'signed' as const, contactName: 'רבקה', contactPhone: '050-1234567' } : i))
const again = planInstitutionImport({ matrix, existing: signed, nowIso: '2026-10-09T00:00:00Z' })
check('A317 réimport : aucune création', again.actions.every((a) => a.kind !== 'create'))
check('A317 réimport : statut, contact et téléphone du PO intacts', again.actions.every((a) => a.kind !== 'update' || !('engagement' in a.patch || 'contactName' in a.patch || 'contactPhone' in a.patch)))
check('A317 identifiant stable', institutionIdOf('מכינת עצמונה', 'נווה') === institutionIdOf(' מכינת  עצמונה', 'נווה'))
// Un point incertain ne redevient pas sûr par un réimport sans la marque.
const certain = matrix.map((r) => [...r])
const unflagged = planInstitutionImport({ matrix: certain, existing: created, nowIso: 'x' })
check('A317 un point incertain le reste après réimport', unflagged.actions.every((a) => a.kind !== 'update' || a.patch.positionUncertain !== false))
// Aller-retour de la ligne en base.
const round = MAPPINGS.institutions.fromRows(MAPPINGS.institutions.toRows(created[0])[0].rows[0] as never, {} as never)
check('A317 aller-retour ligne ↔ institution identique', JSON.stringify(round) === JSON.stringify(created[0]))

// --- A318 (calcul) · A320 ------------------------------------------------------

section('A318 · A320 — le calcul de couverture')
const farm = (id: string, status: Farm['status'], lat: number, lng: number) => ({ id, name: id, status, position: { lat, lng }, positionMissing: false }) as unknown as Farm
const inst = (id: string, engagement: Institution['engagement'], lat: number, lng: number): Institution => ({ ...created[0], id, name: id, engagement, position: { lat, lng }, positionUncertain: false })
const F = [farm('f1', 'signed', 31.0, 34.5), farm('f2', 'active', 31.5, 34.5), farm('f3', 'visited', 31.0, 34.9), farm('f4', 'declined', 31.0, 34.51)]
const I = [inst('iA', 'signed', 31.0, 34.6), inst('iB', 'interested', 31.5, 34.6), inst('iC', 'not_relevant', 31.0, 34.5)]
const L = [{ id: 'l1', name: 'l1', position: { lat: 31, lng: 34.5 }, status: 'not_called', convertedFarmId: null }, { id: 'l2', name: 'l2', position: null, status: 'not_called', convertedFarmId: null }] as unknown as Lead[]
const r20 = computeCoverage({ farms: F, leads: L, institutions: I, radiusKm: 20, visible: COVERAGE_PRESETS.prepare })
check('A318 couvertes / non couvertes / potentiel', r20.counts.farms === 3 && r20.counts.covered === 1 && r20.counts.uncovered === 2 && r20.counts.potential === 1 && r20.counts.unreachable === 1, JSON.stringify(r20.counts))
check('A318 « לא רלוונטי » ne couvre rien et est compté à part', r20.institutionsNotRelevant === 1)
check('A318 « declined » n’est sur la carte dans aucune famille', !r20.places.some((p) => p.id === 'f4'))
const r60 = computeCoverage({ farms: F, leads: L, institutions: I, radiusKm: 60, visible: COVERAGE_PRESETS.prepare })
check('A318 le rayon élargi recompose', r60.counts.covered === 3 && r60.links.length > r20.links.length, JSON.stringify(r60.counts))
const road = computeCoverage({ farms: F, leads: L, institutions: I, radiusKm: 20, visible: COVERAGE_PRESETS.prepare, roadKm: (i, f) => (i === 'iA' && f === 'f1' ? 25 : undefined) })
check('A318 la ROUTE retire un lien que le vol d’oiseau gardait', road.counts.covered === 0 && road.roadLinks === 0)
check('A318 lien réel ≠ lien possible', r20.links.some((l) => l.tone === 'real') && r20.links.some((l) => l.tone === 'potential'))
check('A320 les pistes ne comptent dans aucune ferme', r20.counts.farms === 3 && computeCoverage({ farms: F, leads: [], institutions: I, radiusKm: 20, visible: COVERAGE_PRESETS.prepare }).counts.farms === 3)
check('A320 piste sans lieu comptée, hors carte', r20.leadsUnplaced === 1 && r20.leadsPlaced === 1)
const meet = computeCoverage({ farms: F, leads: L, institutions: I, radiusKm: 20, visible: COVERAGE_PRESETS.meeting })
check('A319 « פגישה » : ni pistes, ni en cours, ni à démarcher', meet.places.every((p) => p.family === 'signed' || p.family === 'engaged'))

// --- A328 — les onze de la tournée ne sont pas dupliquées par le classeur ------

section('A328 — un import ultérieur ne duplique aucune des onze (AV1)')
{
  const sql = readFileSync('supabase/migrations/20261008000200_av_institutions_tournee.sql', 'utf8')
  const tour: Institution[] = [...sql.matchAll(/\('(inst-[^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', '[^']*', ([\d.]+), ([\d.]+), (true|false),[\s\S]*?'([^']*)'\)(?:,|\n)/g)].map((m) => ({
    ...created[0], id: m[1], name: m[2], locality: m[3], kind: m[4] as Institution['kind'], audience: m[5] as Institution['audience'],
    position: { lat: +m[6], lng: +m[7] }, positionUncertain: m[8] === 'true', engagement: 'signed', engagementConfirmed: false,
    positionSource: 'web', aliases: m[9], contactName: 'הרב', source: 'manual',
  }))
  check('A328 onze lignes lues dans la migration', tour.length === 11, `${tour.length}`)
  // Le classeur les écrit AUTREMENT (autres noms, « קרית » au lieu de « קריית ») — et ajoute deux pièges.
  const book: string[][] = [['שם המוסד', 'יישוב', 'סוג', 'lat', 'lng'],
    ['ישיבת אפיקי דעת', 'שדרות', 'ישיבת הסדר', '31.5243', '34.5914'], ['ישיבת ההסדר קרית גת', 'קרית גת', 'ישיבת הסדר', '31.6057', '34.7618'],
    ['ישיבת ההסדר דרך חיים', 'קרית גת', 'ישיבת הסדר', '', ''], ['ישיבת נווה דקלים', 'אשדוד', 'ישיבת הסדר', '', ''],
    ['ישיבת אור עציון', 'מרכז שפירא', 'ישיבת הסדר', '', ''], ['ישיבת כרם ביבנה', 'כרם ביבנה', 'ישיבת הסדר', '', ''],
    ['ישיבת בית יהודה', 'כפר מימון', '', '', ''], ['מכינת כאייל', 'אופקים', 'מכינה', '', ''], ['שומריה לצעירים', 'שומריה', '', '', ''],
    ['מכינת עצמונה', 'נווה', 'מכינה', '31.06', '34.31'], ['ישיבה תיכונית נווה', 'נווה', '', '', ''],
    ['ממדבר מתנה', 'נווה', 'מכינה', '31.07', '34.32'], ['אולפנת נווה דקלים', 'אשדוד', '', '', '']]
  const p = planInstitutionImport({ matrix: book, existing: tour, nowIso: '2026-10-09T00:00:00.000Z' })
  const creates = p.actions.filter((a) => a.kind === 'create').map((a) => a.row.name)
  check('A328 aucune des onze n’est recréée', p.actions.filter((a) => a.kind !== 'create').length === 11, `créées : ${creates.join(' · ')}`)
  check('A328 les deux autres établissements SONT créés (ni confondus, ni perdus)', creates.length === 2 && creates.includes('ממדבר מתנה') && creates.includes('אולפנת נווה דקלים'))
  const touched = p.actions.filter((a) => a.kind === 'update') as Array<{ patch: Partial<Institution> }>
  check('A328 le réimport ne touche ni le statut, ni « à confirmer », ni le responsable', touched.every((a) => !('engagement' in a.patch) && !('engagementConfirmed' in a.patch) && !('contactName' in a.patch)))
  check('A328 un point vérifié n’est pas remplacé ni re-déclaré douteux (עצמונה)', touched.every((a) => !('position' in a.patch) && a.patch.positionUncertain !== true))
}

// --- A320 · A321 — le code --------------------------------------------------------

section('A320 · A321 — aucun compteur de dounams ou d’objectif ne lit pistes ni institutions')
const COUNTER_FILES = ['src/core/activity.ts', 'src/core/report.ts', 'src/core/fields.ts', 'src/core/prospection.ts', 'src/core/tours.ts', 'src/ui/report/activityText.ts', 'src/ui/report/activityDraw.ts']
for (const f of COUNTER_FILES) {
  const code = readFileSync(f, 'utf8')
  check(`A321 ${f} ne lit pas les institutions`, !/getInstitutions|\.institutions\b|from '\.\/institutions'/.test(code))
  check(`A320 ${f} ne lit pas les pistes`, !/getVisibleLeads|getAllLeads|\.leads\b/.test(code))
}
// Les fonctions de compteur d'access.ts : celles qui somment des dounams.
const access = readFileSync('src/core/access.ts', 'utf8')
const counterBodies = [...access.matchAll(/export function (\w*(?:Dunams|Programme|Kpi|Objective|Progress|Counts?)\w*)\([^)]*\)[^{]*\{([\s\S]*?)\n\}/g)]
check('A321 access.ts : fonctions de compteur trouvées', counterBodies.length > 0, counterBodies.map((m) => m[1]).join(', '))
for (const m of counterBodies) check(`A321 ${m[1]} ne lit ni institutions ni pistes`, !/institutions|leads/i.test(m[2]))
// Partout ailleurs : qui appelle getInstitutions ?
const callers: string[] = []
function walk(dir: string) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(n) && /getInstitutions\(/.test(readFileSync(p, 'utf8'))) callers.push(p)
  }
}
walk('src')
check('A321 seuls la carte de couverture et son import lisent les institutions', callers.every((p) => /CoverageScreen|InstitutionsImportScreen|access\.ts/.test(p)), callers.join(', '))

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
