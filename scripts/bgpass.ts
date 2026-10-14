import { readFileSync } from 'node:fs'

import { COLLECTIONS } from '../src/core/backend'
import { applyLink, applyUnlink, institutionsOfFarm, isMultiLinked, planLink } from '../src/core/farmLinks'
import type { FarmInstitutionLink } from '../src/core/farmLinks'
import {
  hasDate,
  institutionDocFarms,
  institutionDocPath,
  institutionDocVersionPath,
  parseVersionName,
  publicDocUrl,
  sortVersions,
  versionStamp,
} from '../src/core/institutionDoc'
import { isInside, splitReach } from '../src/core/reachOrder'
import type { ReachCriterion, ReachRow } from '../src/core/reachOrder'
import type { PairRoad } from '../src/core/roadMesh'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BG — PORTE PURE.   bun run bgpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tout ce qui est nommé ici est INVENTÉ (fermes et institutions de banc).
 *
 *   A461  lier une ferme NON liée crée exactement un lien
 *   A462  lier une ferme DÉJÀ liée ailleurs ne crée rien tant qu'un choix n'est
 *         pas fait — le plan NOMME l'institution en place
 *   A463  « להחליף » laisse exactement un lien, et c'est le nouveau
 *   A464  « להוסיף » laisse exactement deux liens
 *   A465  « ביטול » laisse la base inchangée
 *   A466  délier supprime CE lien, et uniquement lui
 *   A467  le tri suit le critère : minutes croissantes / kilomètres croissants,
 *         sur un jeu où les deux ordres DIFFÈRENT réellement
 *   A468  la section hors seuil est EXACTEMENT le complément de la section
 *         dans le seuil
 *   A469  le document : adresse stable, versions horodatées dans le NOM et
 *         triées, aucune date dans un texte, fermes liées / proposées
 *   A470  la base : la migration (aucune unicité, deux index, RLS, rien pour
 *         `anon`, `created_by` posé par la base, le bucket public et ses
 *         écritures réservées), l'aller-retour du lien, la collection
 *   A471  le magasin : `linkFarmToInstitution` / `unlinkFarmFromInstitution`
 *         tiennent les mêmes règles sur le vrai magasin
 */

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

let n = 0
const mk = (farmId: string, institutionId: string) => (): FarmInstitutionLink => ({ id: `l-${++n}`, farmId, institutionId, createdAt: '2026-10-14T08:00:00.000Z', createdBy: null })
const base: FarmInstitutionLink[] = [
  { id: 'l-a', farmId: 'f-taken', institutionId: 'i-old', createdAt: '2026-10-01T08:00:00.000Z', createdBy: null },
  { id: 'l-b', farmId: 'f-other', institutionId: 'i-old', createdAt: '2026-10-01T08:00:00.000Z', createdBy: null },
]
const snapshot = JSON.stringify(base)

// ---------------------------------------------------------------------------
section('A461 — lier une ferme non liée')
// ---------------------------------------------------------------------------
{
  const plan = planLink(base, 'f-free', 'i-new')
  const after = applyLink(base, 'f-free', 'i-new', null, mk('f-free', 'i-new'))
  check('A461 plan « create »', plan.kind === 'create')
  check('A461 exactement un lien de plus', after.length === base.length + 1 && after.filter((l) => l.farmId === 'f-free').length === 1)
  check('A461 c’est le lien demandé', institutionsOfFarm(after, 'f-free').join() === 'i-new')
  check('A461 lier deux fois ne double rien', applyLink(after, 'f-free', 'i-new', null, mk('f-free', 'i-new')).length === after.length && planLink(after, 'f-free', 'i-new').kind === 'already')
}

// ---------------------------------------------------------------------------
section('A462 — déjà liée ailleurs : rien sans choix')
// ---------------------------------------------------------------------------
{
  const plan = planLink(base, 'f-taken', 'i-new')
  check('A462 plan « conflict », qui NOMME l’institution en place', plan.kind === 'conflict' && plan.others.join() === 'i-old', JSON.stringify(plan))
  const after = applyLink(base, 'f-taken', 'i-new', null, mk('f-taken', 'i-new'))
  check('A462 sans choix : aucun lien créé', JSON.stringify(after) === snapshot)
}

// ---------------------------------------------------------------------------
section('A463 · A464 · A465 — les trois choix')
// ---------------------------------------------------------------------------
{
  const replaced = applyLink(base, 'f-taken', 'i-new', 'replace', mk('f-taken', 'i-new'))
  const mine = replaced.filter((l) => l.farmId === 'f-taken')
  check('A463 « להחליף » : exactement un lien pour la ferme', mine.length === 1)
  check('A463 … et c’est le NOUVEAU', mine[0]?.institutionId === 'i-new')
  check('A463 les autres fermes de l’ancienne institution ne bougent pas', replaced.some((l) => l.id === 'l-b'))

  const added = applyLink(base, 'f-taken', 'i-new', 'add', mk('f-taken', 'i-new'))
  check('A464 « להוסיף » : exactement deux liens', added.filter((l) => l.farmId === 'f-taken').length === 2)
  check('A464 … vers les deux institutions', institutionsOfFarm(added, 'f-taken').sort().join() === 'i-new,i-old')
  check('A464 la ferme est signalée (plus d’une institution)', isMultiLinked(added, 'f-taken') && !isMultiLinked(replaced, 'f-taken'))

  const cancelled = applyLink(base, 'f-taken', 'i-new', 'cancel', mk('f-taken', 'i-new'))
  check('A465 « ביטול » : base inchangée', JSON.stringify(cancelled) === snapshot)
  check('A465 l’entrée n’a pas été modifiée en place', JSON.stringify(base) === snapshot)
}

// ---------------------------------------------------------------------------
section('A466 — délier')
// ---------------------------------------------------------------------------
{
  const two = applyLink(base, 'f-taken', 'i-new', 'add', mk('f-taken', 'i-new'))
  const after = applyUnlink(two, 'f-taken', 'i-new')
  check('A466 le lien délié a disparu', !after.some((l) => l.farmId === 'f-taken' && l.institutionId === 'i-new'))
  check('A466 … et UNIQUEMENT lui', after.length === two.length - 1 && after.some((l) => l.id === 'l-a') && after.some((l) => l.id === 'l-b'))
  check('A466 délier ce qui n’existe pas ne touche rien', applyUnlink(base, 'f-free', 'i-old').length === base.length)
}

// ---------------------------------------------------------------------------
section('A467 · A468 — l’ordre suit le critère, le hors-seuil est le complément')
// ---------------------------------------------------------------------------
{
  type F = { id: string; name: string; locality: string }
  const road = (km: number, min: number): PairRoad => ({ kind: 'road', km, seconds: min * 60, trackKm: 0, fastestBeyond: null })
  /* Les deux ordres DIFFÈRENT : la plus proche en km (A, 12 km par une piste
     lente) est la plus LENTE ; la plus rapide (C, autoroute) est la plus loin. */
  const rows: Array<ReachRow<F>> = [
    { farm: { id: 'A', name: 'א', locality: '' }, air: 9, road: road(12, 30) },
    { farm: { id: 'B', name: 'ב', locality: '' }, air: 14, road: road(20, 22) },
    { farm: { id: 'C', name: 'ג', locality: '' }, air: 24, road: road(30, 18) },
    { farm: { id: 'D', name: 'ד', locality: '' }, air: 40, road: road(55, 50) },
    { farm: { id: 'E', name: 'ה', locality: '' }, air: 20, road: undefined },
    { farm: { id: 'F', name: 'ו', locality: '' }, air: 22, road: { kind: 'none' } },
  ]
  const byMin: ReachCriterion = { unit: 'min', minutes: 35, radiusKm: 35, factor: 1 }
  const byKm: ReachCriterion = { unit: 'km', minutes: 35, radiusKm: 35, factor: 1 }
  const m = splitReach(rows, byMin, (f) => f.id)
  const k = splitReach(rows, byKm, (f) => f.id)
  const ids = (xs: Array<ReachRow<F>>) => xs.map((r) => r.farm.id).join('')
  check('A467 en minutes : minutes croissantes', ids(m.inside) === 'CBA', ids(m.inside))
  check('A467 en kilomètres : kilomètres croissants', ids(k.inside) === 'ABC', ids(k.inside))
  check('A467 les deux ordres diffèrent réellement', ids(m.inside) !== ids(k.inside))
  const minsInside = m.inside.map((r) => (r.road && r.road.kind !== 'none' ? r.road.seconds : 0))
  check('A467 jamais contredit : chaque minute ≥ la précédente', minsInside.every((v, i) => i === 0 || v >= minsInside[i - 1]))
  /* La marge et la nuit comptent : à +50 %, C (18 → 27) reste, B (22 → 33) reste, A (30 → 45) sort. */
  const night = splitReach(rows, { ...byMin, factor: 1.5 }, (f) => f.id)
  check('A467 la marge et la nuit déplacent le seuil (A sort à +50 %)', ids(night.inside) === 'CB' && night.outside.some((r) => r.farm.id === 'A'), ids(night.inside))

  for (const [label, s, c] of [['minutes', m, byMin], ['kilomètres', k, byKm]] as const) {
    const all = new Set(rows.map((r) => r.farm.id))
    const inIds = new Set(s.inside.map((r) => r.farm.id))
    const outIds = new Set(s.outside.map((r) => r.farm.id))
    const disjoint = [...inIds].every((x) => !outIds.has(x))
    const union = inIds.size + outIds.size === all.size && [...all].every((x) => inIds.has(x) || outIds.has(x))
    check(`A468 ${label} : hors seuil = complément EXACT (disjoint, union = tout)`, disjoint && union, `${[...inIds].join('')} | ${[...outIds].join('')}`)
    check(`A468 ${label} : rien dans le seuil qui n’y soit pas, rien dehors qui y soit`, s.inside.every((r) => isInside(r.road, c)) && s.outside.every((r) => !isInside(r.road, c)))
  }
  check('A468 non mesurées et sans route : hors seuil', ['E', 'F'].every((x) => m.outside.some((r) => r.farm.id === x)))
  check('A468 hors seuil, l’ordre suit aussi le critère (mesurées d’abord)', ids(k.outside).startsWith('D'), ids(k.outside))

  // A469 — le document
  const docs = institutionDocFarms(rows, new Set(['D', 'B']), byMin, (r) => isInside(r.road, byMin))
  check('A469 fermes liées : toutes celles du PO, même hors seuil, dans l’ordre du critère', docs.linked.map((r) => r.id).join('') === 'BD', docs.linked.map((r) => r.id).join(''))
  check('A469 fermes proposées : dans le seuil, pas encore liées', docs.proposed.map((r) => r.id).join('') === 'CA', docs.proposed.map((r) => r.id).join(''))
  check('A469 km et minutes portés par chaque ligne', docs.proposed.every((r) => r.km !== null && r.minutes !== null))
}

// ---------------------------------------------------------------------------
section('A469 — le document : adresse stable, versions, aucune date')
// ---------------------------------------------------------------------------
{
  check('A469 adresse stable bâtie sur l’identifiant', institutionDocPath('inst-x1') === 'inst-x1/document.pdf')
  const at = new Date(Date.UTC(2026, 9, 14, 7, 5, 9))
  check('A469 version horodatée À CÔTÉ', institutionDocVersionPath('inst-x1', at) === 'inst-x1/versions/20261014-070509.pdf' && versionStamp(at) === '20261014-070509')
  check('A469 le nom se relit en instant', parseVersionName('20261014-070509.pdf')?.getTime() === at.getTime() && parseVersionName('document.pdf') === null)
  const sorted = sortVersions(['20261001-090000.pdf', 'x.pdf', '20261014-070509.pdf', '20261005-120000.pdf'])
  check('A469 versions : la plus récente d’abord, noms étrangers ignorés', sorted.map((v) => v.name).join() === '20261014-070509.pdf,20261005-120000.pdf,20261001-090000.pdf')
  check('A469 adresse publique (le lien envoyé)', publicDocUrl('https://p.supabase.co/', 'inst-x1/document.pdf') === 'https://p.supabase.co/storage/v1/object/public/institution-docs/inst-x1/document.pdf')
  const dated = ['14.10.2026', 'עד 14/10', 'נכון ל־2026-10-14', 'נפגשנו ב־3.9.26']
  const clean = ['23 ק״מ · 28 דק׳', '7.4 ק״מ', 'עד 35 דקות', '050-000-0123', '‎+15%‎ לילה', 'office@example.org', '120 תלמידים', '1 / 3']
  check('A469 une date se reconnaît', dated.every(hasDate), dated.filter((d) => !hasDate(d)).join(' | '))
  check('A469 distances, durées, numéros, pagination ne sont pas des dates', clean.every((c) => !hasDate(c)), clean.filter(hasDate).join(' | '))
  const he = JSON.parse(readFileSync('src/locales/he.json', 'utf8')) as { instDoc: Record<string, unknown> }
  const flat: string[] = []
  const walk = (o: unknown) => (typeof o === 'string' ? flat.push(o) : o && typeof o === 'object' && Object.values(o).forEach(walk))
  walk(he.instDoc)
  check('A469 aucun libellé du document ne porte une date', flat.every((s) => !hasDate(s)), flat.filter(hasDate).join(' | '))
}

// ---------------------------------------------------------------------------
section('A470 — la base')
// ---------------------------------------------------------------------------
{
  const sql = readFileSync('supabase/migrations/20261014000100_bg_farm_institution_links.sql', 'utf8')
  const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  check('A470 la table de liaison, ses deux clés et leurs index', /create table if not exists public\.farm_institution_links/.test(code) && /farm_id\s+text not null references public\.entities/.test(code) && /institution_id\s+text not null references public\.institutions/.test(code) && /on public\.farm_institution_links \(farm_id\)/.test(code) && /on public\.farm_institution_links \(institution_id\)/.test(code))
  check('A470 date de création et auteur', /created_at\s+timestamptz not null default now\(\)/.test(code) && /created_by\s+uuid default auth\.uid\(\)/.test(code) && /coalesce\(new\.created_by, auth\.uid\(\)\)/.test(code))
  check('A470 ⛔ AUCUNE contrainte d’unicité (plusieurs institutions par ferme)', !/\bunique\b/i.test(code))
  check('A470 RLS forcée, coordinateur seulement, rien pour anon', /enable row level security/.test(code) && /force row level security/.test(code) && /using \(private\.is_coordinator\(\)\) with check \(private\.is_coordinator\(\)\)/.test(code) && /revoke all on public\.farm_institution_links from anon/.test(code) && !/grant [^;]* to anon/.test(code))
  check('A470 le bucket public des documents, écritures coordinateur seulement, aucune lecture de liste anonyme', /'institution-docs', 'institution-docs', true/.test(code) && /bucket_id = 'institution-docs' and private\.is_coordinator\(\)/.test(code) && !/to anon/.test(code))

  const link: FarmInstitutionLink = { id: 'fil-x', farmId: 'f-1', institutionId: 'i-1', createdAt: '2026-10-14T08:00:00.000Z', createdBy: '00000000-0000-4000-8000-000000000001' }
  const rowsOut = MAPPINGS.farmInstitutionLinks.toRows(link)
  const back = MAPPINGS.farmInstitutionLinks.fromRows(rowsOut[0].rows[0], {})
  check('A470 aller-retour du lien en base', JSON.stringify(back) === JSON.stringify(link) && rowsOut[0].table === 'farm_institution_links')
  check('A470 la collection, après les fermes et les institutions', COLLECTIONS.indexOf('farmInstitutionLinks') > COLLECTIONS.indexOf('farms') && COLLECTIONS.indexOf('farmInstitutionLinks') > COLLECTIONS.indexOf('institutions'))
}

// ---------------------------------------------------------------------------
section('A471 — le magasin tient les mêmes règles')
// ---------------------------------------------------------------------------
{
  const store = await import('../src/core/store')
  const access = await import('../src/core/access')
  const raw = store._raw()
  const [fa, fb] = raw.farms
  const [i1, i2] = raw.institutions
  raw.farmInstitutionLinks = []
  const count = () => access.getFarmInstitutionLinks().length
  const r1 = store.linkFarmToInstitution(fa.id, i1.id)
  check('A471 lier : un lien', r1.changed && count() === 1)
  const before = JSON.stringify(access.getFarmInstitutionLinks())
  const r2 = store.linkFarmToInstitution(fa.id, i2.id)
  check('A471 déjà liée ailleurs, sans choix : RIEN, et le plan nomme l’autre', !r2.changed && r2.plan.kind === 'conflict' && r2.plan.others.join() === i1.id && JSON.stringify(access.getFarmInstitutionLinks()) === before)
  check('A471 « ביטול » : rien', !store.linkFarmToInstitution(fa.id, i2.id, 'cancel').changed && JSON.stringify(access.getFarmInstitutionLinks()) === before)
  store.linkFarmToInstitution(fa.id, i2.id, 'replace')
  const afterReplace = access.getFarmInstitutionLinks().filter((l) => l.farmId === fa.id)
  check('A471 « להחליף » : un lien, le nouveau', afterReplace.length === 1 && afterReplace[0].institutionId === i2.id)
  store.linkFarmToInstitution(fa.id, i1.id, 'add')
  check('A471 « להוסיף » : deux liens', access.getFarmInstitutionLinks().filter((l) => l.farmId === fa.id).length === 2)
  store.linkFarmToInstitution(fb.id, i1.id)
  store.unlinkFarmFromInstitution(fa.id, i1.id)
  const left = access.getFarmInstitutionLinks()
  check('A471 délier : ce lien seul', left.length === 2 && left.some((l) => l.farmId === fa.id && l.institutionId === i2.id) && left.some((l) => l.farmId === fb.id && l.institutionId === i1.id))
  check('A471 le lien neuf ne prétend pas savoir qui l’a créé (la base le pose)', left.every((l) => l.createdBy === null))
}

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
