import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BK — CHANTIER 1 · LES DOUZE ARBITRAGES, PORTE PURE.   bun run bkpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A526  ★ le registre porte les douze décisions du PO, et plus aucune entrée
 *         « à arbitrer » : `map-mode`, `map-ratio`, `rail` sur l'APPAREIL
 *         (raison `screen`), `map-last`, `theme:<rôle>`, `free-route-draft` sur
 *         le compte, les quatre « machine » sur l'appareil ; `map-view` née
 *   A527  ★ `activity-reports` : la vidange ne supprime l'ancienne clé QUE si
 *         la table relue porte chacun de ses rapports À L'IDENTIQUE ; un seul
 *         qui manque, un seul qui diffère, une absence de réponse → elle reste
 *   A528  ★ les plis de la fiche de ferme sont PAR TYPE DE SECTION : aucune clé
 *         par ferme n'est écrite par le code ; `farm-form-` n'est plus déclarée
 *   A529  la zone regardée (`map-view`) : son validateur, ses écrans
 */

const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
} as Storage
;(globalThis as unknown as { window: unknown }).window = globalThis
const quiet = console.error
console.error = (...a: unknown[]) => {
  if (!String(a[0]).startsWith('[réglages]')) quiet(...a)
}

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

const reg = await import('../src/storage/registry')
const local = await import('../src/storage/local')
const acc = await import('../src/storage/account')
const hist = await import('../src/ui/report/activityHistory')
const camera = await import('../src/ui/components/mapCamera')
const { settingDef, SETTINGS, DECIDED, ABANDONED_PREFIXES, VALIDATORS } = reg

// ===========================================================================
section('A526 — ★ les douze arbitrages, appliqués dans le registre')
{
  const dest = (k: string) => {
    const d = settingDef(k)
    return d ? (d.scope === 'account' ? 'account' : `device:${d.reason}`) : 'absent'
  }
  const table: Array<[string, string]> = [
    ['lo-yanum:map-ratio:farms', 'device:screen'],
    ['lo-yanum:rail:expanded', 'device:screen'],
    ['lo-yanum:map-mode:farms', 'device:screen'],
    ['lo-yanum:last-fix', 'device:machine'],
    ['lo-yanum:geo-granted', 'device:machine'],
    ['lo-yanum:update-pending', 'device:machine'],
    ['lo-yanum:road-mesh:v1', 'device:machine'],
    ['lo-yanum:theme:volunteer', 'account'],
    ['lo-yanum:map-last', 'account'],
    ['lo-yanum:free-route-draft', 'account'],
    ['lo-yanum:farm-section:people', 'account'],
    ['lo-yanum:activity-reports', 'device:offline'],
  ]
  for (const [k, want] of table) check(`A526 ${k} → ${want}`, dest(k) === want, dest(k))
  check('A526 ★ map-mode : la décision dit qu’elle est CONTRAIRE à la recommandation de BJ', /CONTRAIRE/.test(settingDef('lo-yanum:map-mode:farms')?.decided ?? ''))
  check('A526 ★ plus aucune entrée « à arbitrer » (le champ n’existe plus)', SETTINGS.every((d) => !('arbitrate' in d)))
  check(`A526 ★ les douze portent la décision du PO (${DECIDED.length} au total, avec map-view)`, table.every(([k]) => (settingDef(k)?.decided ?? '').length > 20) && DECIDED.length === 13)
  check('A526 map-view est NÉE sur le compte (le scénario du PO)', dest('lo-yanum:map-view') === 'account')
  check('A526 ★ une valeur de compte d’une clé passée sur l’appareil est IGNORÉE à la relecture (map-mode, ratio, rail)', (() => {
    const rows = ['lo-yanum:map-mode:farms', 'lo-yanum:map-ratio:farms', 'lo-yanum:rail:expanded'].map((key, i) => ({ key, value: key.includes('ratio') ? '40' : key.includes('rail') ? '0' : 'full', updated_at: `2026-10-18T10:00:0${i}.000Z`, written_at: `2026-10-18T10:00:0${i}.000Z` }))
    const p = acc.planPull(rows, () => null, {}, 0, null)
    return p.apply.length === 0
  })())
  check('A526 ★ … et la migration d’un appareil ne les fait plus monter', (() => {
    const plan = acc.planMigration({ rows: [], legacy: null, local: { 'lo-yanum:map-mode:farms': 'full', 'lo-yanum:rail:expanded': '1', 'lo-yanum:map-ratio:farms': '40', 'lo-yanum:map-last': 'farms' } })
    return !plan.insert.some((i) => /map-mode|map-ratio|rail/.test(i.key)) && plan.insert.some((i) => i.key === 'lo-yanum:map-last')
  })())
}

// ===========================================================================
section('A527 — ★ activity-reports : la table d’abord, la preuve ensuite, l’effacement en dernier')
{
  type R = Parameters<typeof hist.sameReport>[0]
  const rec = (id: string, extra: Partial<R> = {}): R => ({
    id,
    period: { id: 'month', from: '2026-09-01', to: '2026-09-30' },
    generatedAt: '2026-10-01T08:00:00.000Z',
    previousId: null,
    totals: { farms: 3, cultivatedDunams: 12, grazingDunams: 4, weightedDunams: 14, targetPercent: 7, signed: 1, signedWithDocuments: 1, contacts: 2 } as R['totals'],
    farms: [{ id: 'f1', name: 'א', status: 'signed', weightedDunams: 3 }] as unknown as R['farms'],
    body: 'דוח\nשורה',
    ...extra,
  })
  const a = rec('r-a')
  const b = rec('r-b', { period: { id: 'week', from: '2026-10-05', to: '2026-10-11' } })
  /* La table rend les dates et les clés jsonb autrement : même rapport. */
  const fromTable = (r: R): R => ({
    ...r,
    generatedAt: r.generatedAt.replace('.000Z', '+00:00'),
    totals: Object.fromEntries(Object.entries(r.totals).reverse()) as R['totals'],
  })
  check('A527 un rapport relu de la table (date `+00:00`, clés jsonb dans un autre ordre) est le MÊME', hist.sameReport(a, fromTable(a)))
  check('A527 un texte différent d’un caractère n’est PAS le même', !hist.sameReport(a, { ...a, body: `${a.body}.` }))
  check('A527 un instantané d’exploitation différent n’est PAS le même', !hist.sameReport(a, { ...a, farms: [] }))
  check('A527 une période de même bornes mais d’autre nature n’est PAS la même', !hist.sameReport(a, { ...a, period: { ...a.period, id: 'custom' } }))

  const plan = hist.planDrain([a, b], [], new Set(['r-a']))
  check('A527 ★ à envoyer : seulement ce que la table n’a pas (r-b)', plan.send.map((r) => r.id).join() === 'r-b')
  check('A527 la file hors ligne passe aussi, sans doublon', hist.planDrain([a], [a, rec('r-c')], new Set()).send.map((r) => r.id).join() === 'r-a,r-c')

  const ok = hist.judgeDrain([a, b], [], [fromTable(a), fromTable(b)])
  check('A527 ★ la table porte TOUT, à l’identique → la clé PEUT être effacée', ok.eraseLegacy && ok.missing.length === 0)
  const oneMissing = hist.judgeDrain([a, b], [], [fromTable(a)])
  check('A527 ★ UN rapport manque dans la table → la clé RESTE (et il est nommé)', !oneMissing.eraseLegacy && oneMissing.missing.join() === 'r-b')
  const differs = hist.judgeDrain([a, b], [], [fromTable(a), { ...b, body: 'autre' }])
  check('A527 ★ UN rapport diffère dans la table → la clé RESTE', !differs.eraseLegacy && differs.missing.join() === 'r-b')
  const noAnswer = hist.judgeDrain([a, b], [], null)
  check('A527 ★ pas de réponse (hors ligne) → rien n’est effacé', !noAnswer.eraseLegacy)
  check('A527 rien à vider → rien à effacer (et rien de faux)', !hist.judgeDrain([], [], []).eraseLegacy)
  check('A527 la file hors ligne se vide de ce que la table a reçu, garde le reste', hist.judgeDrain([], [a, b], [fromTable(a)]).pending.map((r) => r.id).join() === 'r-b')

  const src = readFileSync('src/ui/report/activityHistory.ts', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const writes = [...src.matchAll(/writeSetting\(\s*([A-Z_]+)\s*,\s*([^)]*)\)/g)].map((m) => `${m[1]}=${m[2].trim()}`)
  check('A527 ★ le code n’écrit plus JAMAIS l’ancienne clé, sauf pour l’effacer (`null`)', writes.filter((w) => w.startsWith('LEGACY_KEY')).every((w) => w === 'LEGACY_KEY=null'), writes.join(' ; '))
  check('A527 ★ l’effacement est gardé par le verdict de la relecture', /if \(verdict\.eraseLegacy\)\s*\{\s*try\s*\{\s*writeSetting\(LEGACY_KEY, null\)/.test(src))
  check('A527 l’historique est LU dans la table (loadRemoteActivityReports, puis par identifiants)', /loadRemoteActivityReports\(KEEP\)/.test(src) && /loadRemoteActivityReportsByIds\(ids\)/.test(src))
  check('A527 un rapport sorti entre d’abord dans la file hors ligne, puis dans la table', /pending: order\(\[record, \.\.\.offline\.pending\]\)[\s\S]*saveRemoteActivityReport\(record\)/.test(src))
}

// ===========================================================================
section('A528 — ★ les plis de la fiche de ferme, par type de section')
{
  check('A528 `farm-form-` n’est plus déclarée (abandonnée)', settingDef('farm-form-people:farm-07') === null && ABANDONED_PREFIXES.includes('farm-form-'))
  check('A528 … et l’écrire est refusé à l’exécution', local.writeSetting('farm-form-people:farm-07', '0') === false && !mem.has('farm-form-people:farm-07'))
  check('A528 la clé par type est déclarée, sur le compte', settingDef('lo-yanum:farm-section:people')?.scope === 'account' && local.writeSetting('lo-yanum:farm-section:people', '0') && mem.get('lo-yanum:farm-section:people') === '0')
  const form = readFileSync('src/ui/screens/coordinator/FarmFormScreen.tsx', 'utf8')
  const keys = [...form.matchAll(/storageKey=("[^"]*"|\{[^}]*\})/g)].map((m) => m[1])
  const TYPES = ['status', 'details', 'people', 'emergency', 'commitments', 'agreements', 'notes']
  check(`A528 ★ les ${keys.length} sections de la fiche rangent leur pli PAR TYPE (aucun identifiant de ferme dans la clé)`, keys.length === 7 && keys.every((k) => /^"lo-yanum:farm-section:[a-z]+"$/.test(k) && TYPES.includes(k.slice(23, -1))), keys.join(' '))
  /* Partout dans src/ : aucun accès au stockage ne vise une clé `farm-form-…`. */
  const walk = (d: string, acc: string[] = []): string[] => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p, acc)
      else if (/\.(ts|tsx)$/.test(n)) acc.push(p)
    }
    return acc
  }
  const offenders: string[] = []
  for (const f of walk('src')) {
    const s = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
    if (/(storageKey=|writeSetting\(|readSetting\(|writeSettingJson\(|peekSetting\()\s*[{(]?\s*[`'"]farm-form-/.test(s)) offenders.push(f)
  }
  check('A528 ★ aucun fichier n’écrit ni ne lit une clé `farm-form-…`', offenders.length === 0, offenders.join(', '))
}

// ===========================================================================
section('A529 — la zone regardée')
{
  const v = VALIDATORS.mapView
  check('A529 validateur : {screen, lng, lat, zoom} admis', v(JSON.stringify({ screen: 'farms', lng: 35.1, lat: 31.9, zoom: 9.5 })))
  check('A529 validateur : sans écran, ou un nombre manquant → refusé', !v(JSON.stringify({ lng: 35.1, lat: 31.9, zoom: 9 })) && !v(JSON.stringify({ screen: 'farms', lng: 35.1, lat: 'x', zoom: 9 })) && !v('farms'))
  check('A529 ★ écrans GÉNÉRAUX seulement : une fiche cadre toujours son objet', camera.VIEW_SCREENS.has('farms') && camera.VIEW_SCREENS.has('coverage') && !camera.VIEW_SCREENS.has('farm-detail') && !camera.VIEW_SCREENS.has('farm-form') && !camera.VIEW_SCREENS.has('mission-detail'))
  camera.writeMapView({ screen: 'farms', lng: 35.123456789, lat: 31.987654321, zoom: 10.123456 })
  check('A529 écrite arrondie (6 décimales, zoom 2)', mem.get('lo-yanum:map-view') === JSON.stringify({ screen: 'farms', lng: 35.123457, lat: 31.987654, zoom: 10.12 }), mem.get('lo-yanum:map-view'))
  check('A529 relue pour SON écran seulement', camera.readMapView('farms')?.zoom === 10.12 && camera.readMapView('coverage') === null)
  const canvas = readFileSync('src/ui/components/MapCanvas.tsx', 'utf8')
  check('A529 ★ écrite après un geste DU PO seulement (userControlledRef), jamais par un cadrage', /if \(!screen \|\| !userControlledRef\.current\) return/.test(canvas))
  check('A529 ★ retrouvée, la caméra est au PO : l’arrivée des données ne la recadre pas', /if \(storedView\) \{\s*userControlledRef\.current = true/.test(canvas))
}

console.log(`\n  ${passed} PASS · ${failed} FAIL\n`)
process.exit(failed === 0 ? 0 : 1)
