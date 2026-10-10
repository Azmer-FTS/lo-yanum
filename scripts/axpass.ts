import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { airBoundKm, computeCoverage, linkMinutes } from '../src/core/coverage'
import { haversineKm } from '../src/core/geo'
import { SPEED_MOTORWAY_KMH } from '../src/core/roadGraph'
import type { Institution } from '../src/core/institutions'
import type { Farm, LatLng } from '../src/core/types'
import { AW_FARMS, AW_INSTITUTIONS } from './awdata'
import { makeTruth } from './awroadtruth'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AX — PORTE PURE.   bun run axpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A343  l'inventaire est dans le dépôt, doublons nommés, architecture dite
 *   A344  tout ce qui était atteignable l'est encore (avant / après, `axmap`)
 *   A345  la règle onglets / filtres, lue dans le CODE
 *   A346  plus de bande de tuiles au-dessus d'une rangée de filtres
 *   A347  une seule forme pour l'information secondaire
 *   A350  la borne en minutes, sur le jeu réel et le réseau routier réel
 *   A353  un seul point d'entrée pour ajouter
 *   +     la clé `lo-yanum:coverage` n'est plus partagée par deux réglages
 *
 * Le rendu (A345–A354 à l'écran) est dans `bun run axui`.
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(t: string) {
  console.log(`\n— ${t}`)
}
const read = (p: string) => readFileSync(p, 'utf8')
function files(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) files(p, out)
    else if (/\.(ts|tsx)$/.test(n)) out.push(p)
  }
  return out
}
const UI = files('src/ui')

// ---------------------------------------------------------------------------
section('A343 — l’inventaire, avant toute modification')
// ---------------------------------------------------------------------------
{
  const inv = existsSync('docs/ax/ax2-inventaire.md') ? read('docs/ax/ax2-inventaire.md') : ''
  check('A343 docs/ax/ax2-inventaire.md existe', inv.length > 2000, `${inv.length} caractères`)
  for (const h of ['Les écrans, un par un', 'Doublons et chevauchements', 'Écrans à réunir', 'Chemins sans retour', 'Clics des gestes', 'architecture proposée', 'Trop vaste pour une passe']) {
    check(`A343 section « ${h} »`, inv.includes(h))
  }
  const dups = [...inv.matchAll(/^\| D(\d+) \|/gm)].map((m) => Number(m[1]))
  check('A343 les doublons sont NOMMÉS (D1…D12)', dups.length >= 12, dups.join(','))
  check('A343 les 35 écrans de la sonde y sont comptés', /35 écrans/.test(inv))
}

// ---------------------------------------------------------------------------
section('A344 — aucune fonction n’a disparu (sonde `axmap`, avant / après)')
// ---------------------------------------------------------------------------
{
  const BEFORE = 'docs/ax/atteignable-avant.json'
  const AFTER = process.env.AX_AFTER ?? 'docs/ax/atteignable-apres.json'
  if (!existsSync(AFTER)) {
    check('A344 la carte « après » existe (bun run scripts/axmap.ts)', false, AFTER)
  } else {
    const before = JSON.parse(read(BEFORE)) as { reachable: string[] }
    const after = JSON.parse(read(AFTER)) as { reachable: string[] }
    const lost = before.reachable.filter((r) => !after.reachable.includes(r))
    check(`A344 les ${before.reachable.length} écrans atteignables avant le sont encore`, lost.length === 0, lost.length ? `perdus : ${lost.join(', ')}` : `${after.reachable.length} après`)
    const gained = after.reachable.filter((r) => !before.reachable.includes(r))
    check('A344 l’écran des institutions est NEUF et atteignable', gained.includes('/coordinator/institutions'), gained.join(', '))
  }
}

// ---------------------------------------------------------------------------
section('A345 — un onglet découpe le contenu, un filtre restreint une liste')
// ---------------------------------------------------------------------------
{
  const tabUsers = UI.filter((p) => /<TabBar\b/.test(read(p)) && !p.endsWith('TabBar.tsx'))
  check(
    'A345 <TabBar> ne reste que là où il découpe un CONTENU (fiche de ferme, imports)',
    tabUsers.every((p) => /farmTabs\.tsx|importTabs\.tsx/.test(p)),
    tabUsers.join(', '),
  )
  check('A345 les statuts des contacts sont des FILTRES (FilterPill), plus une TabBar', !/TabBar/.test(read('src/ui/screens/coordinator/LeadsScreen.tsx')) && /FilterPill/.test(read('src/ui/screens/coordinator/LeadsScreen.tsx')))
  const cov = read('src/ui/screens/coordinator/CoverageScreen.tsx')
  check('A345 couverture : l’engagement des institutions est un filtre ; « פגישה » est un MODE (interrupteur)', !/TabBar/.test(cov) && /role="switch"/.test(cov))
}

// ---------------------------------------------------------------------------
section('A346 — une seule rangée de filtres par écran')
// ---------------------------------------------------------------------------
{
  const prim = read('src/ui/components/primitives.tsx')
  const listTop = prim.slice(prim.indexOf('export function ListTop('), prim.indexOf('export function RowLink('))
  check('A346 `ListTop` ne dessine plus de bande de tuiles (kpi-strip) au-dessus des filtres', !/testId="kpi-strip"/.test(listTop))
  const filterRow = prim.slice(prim.indexOf('export function FilterRow('), prim.indexOf('export function PillSelect'))
  check('A346 les files (`kpis`) entrent DANS la rangée de filtres (KpiSlot), visibles même repliée', /KpiSlot\.Provider/.test(listTop) && (filterRow.match(/data-testid="work-queues"/g) ?? []).length === 2)
  const kpiChip = prim.slice(prim.indexOf('export function KpiChip('), prim.indexOf('const KpiSlot'))
  check('A346 une file a la FORME d’un filtre (FilterPill), plus d’une tuile', /<FilterPill/.test(kpiChip) && !/<KpiFilter/.test(kpiChip))
}

// ---------------------------------------------------------------------------
section('A347 — l’information secondaire : une seule forme')
// ---------------------------------------------------------------------------
{
  const defs = UI.filter((p) => /export function (InfoTip|useInfoTip)\b/.test(read(p)))
  check('A347 UNE définition (components/InfoTip.tsx)', defs.length === 1 && defs[0].endsWith('InfoTip.tsx'), defs.join(', '))
  const competing = UI.filter((p) => /(Popover|Tooltip|HelpBubble|HintBubble)\s*\(/.test(read(p)) && !/GrowthCharts/.test(p))
  check('A347 aucune autre bulle d’aide maison', competing.length === 0, competing.join(', '))
  const prim = read('src/ui/components/primitives.tsx')
  check('A347 PageHeader, ListTop et Section portent `info`', (prim.match(/useInfoTip\(info/g) ?? []).length >= 3)
  const fields = read('src/ui/components/fields.tsx')
  check('A347 une aide de champ LONGUE passe derrière ⓘ, une COURTE reste visible', /HINT_LINE/.test(fields) && /useInfoTip\(long/.test(fields))
  const info = read('src/ui/components/InfoTip.tsx')
  check('A347 fermé par défaut, refermable par une ×', /useState\(false\)/.test(info) && /data-info-close/.test(info))
}

// ---------------------------------------------------------------------------
section('A350 — kilomètres OU minutes, sur le jeu réel et le réseau routier réel')
// ---------------------------------------------------------------------------
{
  const P = (lat: number, lng: number): LatLng => ({ lat, lng })
  const farms = AW_FARMS.map((f) => ({ id: f.id, name: f.id, status: f.status, position: P(f.lat, f.lng), positionMissing: false }) as unknown as Farm)
  const institutions = AW_INSTITUTIONS.map((i) => ({ id: i.id, name: i.name, engagement: 'signed', engagementConfirmed: true, position: P(i.lat, i.lng), positionUncertain: false }) as unknown as Institution)
  const ALL = { signed: true, pipeline: true, leads: true, engaged: true, prospect: true }
  const truth = makeTruth()
  const factor = 1.15
  /* Toutes les paires que la plus large des deux bornes laisse passer, mesurées
     sur la route (comme l'app : couloirs lus d'abord, puis chaque paire). */
  const bound = Math.max(35, airBoundKm({ radiusKm: 35, limitMinutes: { minutes: 35, factor: 1 } }))
  const pairs: Array<{ from: LatLng; to: LatLng }> = []
  for (const i of institutions) for (const f of farms) if (haversineKm(i.position!, f.position) <= bound) pairs.push({ from: i.position!, to: f.position })
  await truth.preload(pairs)
  for (const p of pairs) await truth.measure(p.from, p.to)
  const byKm = computeCoverage({ farms, leads: [], institutions, radiusKm: 35, visible: ALL, road: truth.road })
  const byMin = computeCoverage({ farms, leads: [], institutions, radiusKm: 35, limitMinutes: { minutes: 35, factor }, visible: ALL, road: truth.road })
  console.log(`  35 km → ${byKm.links.length} liens ; 35 min (marge 15 %) → ${byMin.links.length} liens`)
  check('A350 la borne en minutes donne un AUTRE maillage que la borne en km', byMin.links.length !== byKm.links.length || byMin.mesh.roadPairs !== byKm.mesh.roadPairs)
  check('A350 en minutes, CHAQUE lien tient dans 35 minutes (marge comprise)', byMin.links.every((l) => linkMinutes(l.seconds, factor) <= 35))
  check('A350 en km, CHAQUE lien tient dans 35 km de route', byKm.links.every((l) => l.km <= 35))
  check('A350 chaque lien porte les DEUX : km ET durée', [...byKm.links, ...byMin.links].every((l) => l.km > 0 && l.seconds > 0))
  check('A350 le vol d’oiseau d’une durée est exact : minutes × 95 km/h', Math.abs(airBoundKm({ radiusKm: 35, limitMinutes: { minutes: 30, factor: 1 } }) - (30 / 60) * SPEED_MOTORWAY_KMH) < 1e-9)
  const night = computeCoverage({ farms, leads: [], institutions, radiusKm: 35, limitMinutes: { minutes: 35, factor: factor * 1.25 }, visible: ALL, road: truth.road })
  check('A350 la tenue de NUIT (+25 %) resserre le maillage', night.links.length <= byMin.links.length, `${byMin.links.length} → ${night.links.length}`)
  const cov = read('src/ui/screens/coordinator/CoverageScreen.tsx')
  check('A350 l’écran offre le choix de l’unité (min / km) et la tenue de nuit', /coverage-unit-\$\{u\}/.test(cov) && /coverage-night/.test(cov))
}

// ---------------------------------------------------------------------------
section('A353 — un seul point d’entrée pour ajouter')
// ---------------------------------------------------------------------------
{
  const fab = read('src/ui/components/ActionFab.tsx')
  const creations = fab.slice(fab.indexOf('const CREATIONS'), fab.indexOf('export const FAB_ROUTES'))
  check('A353 aucun « + » ne mène plus directement à un formulaire de ferme, volontaire ou chauffeur', !/NEW_FARM|NEW_MOSHAV|NEW_VOLUNTEER|NEW_DRIVER/.test(creations))
  check('A353 les ajouts du « + » vont TOUS à /coordinator/add', (creations.match(/addOf\(/g) ?? []).length >= 9)
  const add = read('src/ui/screens/coordinator/AddContactsScreen.tsx')
  check('A353 l’ajout est PAR ÉTAPES : ② n’existe qu’avec un nom, ③ qu’avec un type', /const showType = source !== 'name' \|\| named/.test(add) && /const showDetails = showType && ready/.test(add))
  check('A353 cinq types, dont la ferme complète et le chauffeur', /'farm', 'farmFile', 'institution', 'volunteer', 'driver'/.test(add))
  check('A353 quatre sources : saisie, .vcf, collage, liste Excel/CSV', /'name' \| 'vcf' \| 'paste' \| 'list'/.test(add))
  check('A353 une liste de volontaires se rattache à SON institution', /institution=\$\{institution\.id\}/.test(add) && /listInstitution/.test(read('src/ui/screens/coordinator/ImportWizardScreen.tsx')))
}

// ---------------------------------------------------------------------------
section('Au passage — deux réglages ne partagent plus une clé')
// ---------------------------------------------------------------------------
{
  const cov = read('src/ui/screens/coordinator/CoverageScreen.tsx')
  check('la carte de couverture écrit `lo-yanum:coverage-map`, plus `lo-yanum:coverage`', /PREFS_KEY = 'lo-yanum:coverage-map'/.test(cov))
  check('…et ne l’écrit plus au montage (une clé synchronisée réécrite à chaque ouverture écrase l’autre appareil)', !/useEffect\(\(\) => writePrefs\(prefs\)/.test(cov))
  const sync = read('src/ui/settings/sync.ts')
  check('…et la nouvelle clé voyage entre les appareils', /'lo-yanum:coverage-map'/.test(sync))
  const wiz = read('src/ui/screens/coordinator/ImportWizardScreen.tsx')
  check('la fin d’un import renvoie à la liste DU TYPE importé', /navigate\(back\.to\)/.test(wiz) && !/navigate\('\/coordinator\/volunteers'\)/.test(wiz))
}

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
