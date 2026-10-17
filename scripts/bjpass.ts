import { readFileSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BJ — PORTE PURE.   bun run bjpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A512  le registre : chaque réglage a sa portée, son défaut, son validateur ;
 *         une valeur illisible rend le défaut (qui MONTRE) ; une clé non
 *         déclarée n'est ni lue ni écrite ; même la session de supabase-js
 *         passe par le registre
 *   A513  ★ la migration d'un appareil, règle par règle (le compte gagne ;
 *         l'ancien bloc, puis l'appareil, sont promus ; illisible → défaut)
 *   A514  ★ la relecture : la valeur du compte s'applique ; une modification
 *         en file plus RÉCENTE garde son tour, plus ANCIENNE cède (et c'est dit)
 *   A515  ★ l'heure du SERVEUR : le déclencheur (SQL et banc), l'envoi sans
 *         instant d'appareil, la correction d'horloge d'une file hors ligne
 *   A516  le bloc des réglages du diagnostic et le texte de « העתקה »
 *   A517  les branchements : le moteur démarre avant le premier rendu, la
 *         façade n'enveloppe plus `localStorage`, « choisie seulement » n'est
 *         plus, la table naît fermée à `anon`
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
const report = await import('../src/ui/diagnostic/report')
const layers = await import('../src/ui/components/mapLayers')
const sync = await import('../src/ui/settings/sync')
const { FakeDb } = await import('./fake-supabase')

// ===========================================================================
section('A512 — le registre : portée, défaut, validateur ; rien de non déclaré')
{
  const { SETTINGS, settingDef, ACCOUNT_KEYS, DECIDED } = reg
  check(`A512 ${SETTINGS.length} entrées, ${SETTINGS.filter((d) => d.scope === 'account').length} de compte, ${SETTINGS.filter((d) => d.scope === 'device').length} d’appareil`, SETTINGS.length >= 60)
  check('A512 les réglages qui avaient causé les trois pannes sont de COMPTE (thème, couches, fond)', ['lo-yanum:theme:coordinator', 'lo-yanum:map-layers', 'lo-yanum:map-base'].every((k) => settingDef(k)?.scope === 'account'))
  check('A512 les 18 clés qui voyageaient avant BJ voyagent toujours', ['lo-yanum:target', 'lo-yanum:coverage', 'lo-yanum:coverage-map', 'lo-yanum:vigil', 'lo-yanum:renewal-window', 'lo-yanum:area-gap', 'lo-yanum:require-id-photo', 'lo-yanum:summons-template', 'lo-yanum:agreement-doc-template', 'lo-yanum:agreement-doc-logo', 'lo-yanum:region-rings', 'lo-yanum:coordinator', 'lo-yanum:origin', 'lo-yanum:free-routes', 'lo-yanum:route-margin', 'lo-yanum:institution-doc', 'lo-yanum:theme:coordinator', 'lo-yanum:map-layers'].every((k) => ACCOUNT_KEYS.includes(k)))
  check('A512 une famille se résout (`farm-section:<type>`, `farm-tab:<ferme>`, `zone-draft:<ferme>` ; ★★ BK : `map-mode:<écran>` sur l’appareil)', settingDef('lo-yanum:farm-section:people')?.scope === 'account' && settingDef('lo-yanum:map-mode:farms')?.scope === 'device' && settingDef('lo-yanum:farm-tab:farm-x')?.scope === 'account' && settingDef('lo-yanum:zone-draft:farm-x')?.scope === 'device')
  check('A512 la clé exacte passe avant la famille (`theme:coordinator` vs `theme:<rôle>`)', settingDef('lo-yanum:theme:coordinator')?.family !== true && settingDef('lo-yanum:theme:volunteer')?.family === true)
  check('A512 une clé inconnue n’est PAS déclarée', settingDef('lo-yanum:inventee') === null && settingDef('lo-yanum:map-mode:') === null)
  check('A512 les brouillons de tracé, la file, la session, les drapeaux : sur l’appareil, chacun avec sa raison', ['lo-yanum:zone-draft:f', 'lo-yanum:settings-queue', 'lo-yanum:auth', 'lo-yanum:view-as'].map((k) => settingDef(k)?.reason).join() === 'draft,offline,auth,diagnostic')
  check(`A512 ★★ BK — plus aucun réglage « à arbitrer » ; ${DECIDED.length} portent la décision du PO`, SETTINGS.every((d) => !('arbitrate' in d)) && DECIDED.length >= 12 && DECIDED.every((d) => (d.decided ?? '').length > 20))

  mem.clear()
  mem.set('lo-yanum:people-grouped', 'peut-être')
  mem.set('lo-yanum:map-base', 'satellite')
  check('A512 ★ valeur illisible → défaut (le module montre son défaut) ; lisible → rendue', local.readSetting('lo-yanum:people-grouped') === null && local.readSetting('lo-yanum:map-base') === 'satellite')
  check('A512 une clé non déclarée n’est pas lue', local.readSetting('lo-yanum:inventee') === null)
  check('A512 ★ une clé non déclarée n’est PAS écrite', local.writeSetting('lo-yanum:inventee', '1') === false && !mem.has('lo-yanum:inventee'))
  check('A512 une valeur que le validateur refuse n’est pas écrite', local.writeSetting('lo-yanum:map-base', 'lune') === false && mem.get('lo-yanum:map-base') === 'satellite')
  check('A512 … et chaque refus est compté (diagnostic)', local.refusedSettings().some((r) => r.key === 'lo-yanum:inventee' && r.why === 'undeclared') && local.refusedSettings().some((r) => r.key === 'lo-yanum:map-base' && r.why === 'invalid'))
  check('A512 `null` = retour au défaut (l’effacement est une écriture comme une autre)', local.writeSetting('lo-yanum:map-base', null) && !mem.has('lo-yanum:map-base'))
  local.authStorage.setItem('lo-yanum:auth', '{"t":1}')
  local.authStorage.setItem('sb-pirate-auth-token', 'x')
  check('A512 ★ la session de supabase-js passe par le registre (clé déclarée admise, clé étrangère refusée)', mem.get('lo-yanum:auth') === '{"t":1}' && !mem.has('sb-pirate-auth-token'))
  const d = layers.parseMapLayers(null).layers
  check('A512 « le défaut montre » : couches absentes → formes et fermes montrées', d.boundaries && d.grazing && d.entities)
  check('A512 tous les défauts déclarés passent leur propre validateur', SETTINGS.every((s) => s.fallback === null || s.validate(s.fallback)))
}

// ===========================================================================
section('A513 — ★ la migration d’un appareil')
{
  const row = (key: string, value: string | null, at = '2026-10-15T10:00:00.000Z') => ({ key, value, updated_at: at, written_at: at })
  const plan = acc.planMigration({
    rows: [row('lo-yanum:people-grouped', '0'), row('lo-yanum:farm-tab:farm-x', 'people')],
    legacy: { 'lo-yanum:theme:coordinator': 'dark', 'lo-yanum:vigil': '{"a":1}', 'lo-yanum:route-margin': 'pas-un-nombre', __stamps: '{}' },
    local: {
      'lo-yanum:people-grouped': '1',
      'lo-yanum:farm-tab:farm-x': 'people',
      'lo-yanum:theme:coordinator': 'light',
      'lo-yanum:map-base': 'satellite',
      'lo-yanum:route-margin': '20',
      'lo-yanum:map-layers': '{cassé',
      'lo-yanum:block:settings-display': '0',
      'lo-yanum:zone-draft:f1': '[]',
      'lo-yanum:auth': '{}',
    },
  })
  const applied = (k: string) => plan.apply.find((a) => a.key === k)
  const inserted = (k: string) => plan.insert.find((a) => a.key === k)
  check('A513 ★ le compte a une valeur différente → elle GAGNE, la locale est remplacée', plan.accountWon.includes('lo-yanum:people-grouped') && applied('lo-yanum:people-grouped')?.value === '0' && !inserted('lo-yanum:people-grouped'))
  check('A513 le compte a la même valeur → rien à faire', !plan.accountWon.includes('lo-yanum:farm-tab:farm-x') && !applied('lo-yanum:farm-tab:farm-x'))
  check('A513 ★ l’ancien bloc portait le thème → c’est « le compte » : promu, et il remplace la locale', plan.legacy.includes('lo-yanum:theme:coordinator') && inserted('lo-yanum:theme:coordinator')?.value === 'dark' && applied('lo-yanum:theme:coordinator')?.value === 'dark')
  check('A513 une valeur ILLISIBLE de l’ancien bloc est ignorée : la valeur de l’appareil passe', !plan.legacy.includes('lo-yanum:route-margin') && plan.promoted.includes('lo-yanum:route-margin') && inserted('lo-yanum:route-margin')?.value === '20')
  check('A513 ★ le compte n’a rien, l’appareil oui → PROMUE (y compris une famille : un pli de bloc)', plan.promoted.includes('lo-yanum:map-base') && plan.promoted.includes('lo-yanum:block:settings-display'))
  check('A513 ★ illisible → DÉFAUT (effacée, jamais promue)', plan.defaulted.includes('lo-yanum:map-layers') && applied('lo-yanum:map-layers')?.value === null && !inserted('lo-yanum:map-layers'))
  check('A513 les clés d’APPAREIL ne montent jamais (brouillon, session)', !plan.insert.some((i) => i.key.includes('zone-draft') || i.key === 'lo-yanum:auth'))
  check('A513 `__stamps` (l’ancienne mémoire) n’est pas un réglage', !plan.insert.some((i) => i.key === '__stamps'))
  const empty = acc.planMigration({ rows: [], legacy: null, local: {} })
  check('A513 un appareil neuf sur un compte neuf : rien à faire', empty.insert.length === 0 && empty.apply.length === 0)
}

// ===========================================================================
section('A514 — ★ la relecture et la file')
{
  const at = (iso: string) => Date.parse(iso)
  const rows = [
    { key: 'lo-yanum:map-base', value: 'satellite', updated_at: '2026-10-15T10:00:05.000Z', written_at: '2026-10-15T10:00:05.000Z' },
    { key: 'lo-yanum:theme:coordinator', value: 'dark', updated_at: '2026-10-15T10:00:01.000Z', written_at: '2026-10-15T10:00:06.000Z' },
    { key: 'lo-yanum:people-grouped', value: '0', updated_at: '2026-10-15T10:00:09.000Z', written_at: '2026-10-15T10:00:09.000Z' },
    { key: 'cle-retiree-du-registre', value: 'x', updated_at: '2026-10-15T10:00:10.000Z', written_at: '2026-10-15T10:00:10.000Z' },
  ]
  const queue = {
    /* Geste plus ANCIEN que la valeur du compte (10:00:05) → cède. */
    'lo-yanum:map-base': { value: 'vector', at: at('2026-10-15T10:00:03.000Z'), offline: true },
    /* Geste plus RÉCENT que la valeur du compte (10:00:01) → garde son tour. */
    'lo-yanum:theme:coordinator': { value: 'light', at: at('2026-10-15T10:00:04.000Z'), offline: true },
  }
  const localValues: Record<string, string | null> = { 'lo-yanum:map-base': 'vector', 'lo-yanum:theme:coordinator': 'light', 'lo-yanum:people-grouped': '1' }
  const p = acc.planPull(rows, (k) => localValues[k] ?? null, queue, 0, '2026-10-15T09:00:00.000Z')
  check('A514 ★ une valeur choisie ailleurs APRÈS le geste en file : la file cède, la valeur s’applique, c’est un conflit DIT', p.dropQueue.includes('lo-yanum:map-base') && p.apply.some((a) => a.key === 'lo-yanum:map-base' && a.value === 'satellite') && p.conflicts.includes('lo-yanum:map-base'))
  check('A514 ★ une valeur choisie ailleurs AVANT le geste en file : la file garde son tour, rien n’est écrasé ici', !p.dropQueue.includes('lo-yanum:theme:coordinator') && !p.apply.some((a) => a.key === 'lo-yanum:theme:coordinator'))
  check('A514 sans file : la valeur du compte s’applique', p.apply.some((a) => a.key === 'lo-yanum:people-grouped' && a.value === '0'))
  check('A514 une clé que le registre ne connaît plus est ignorée (mais le curseur avance)', !p.apply.some((a) => a.key === 'cle-retiree-du-registre') && p.cursor === '2026-10-15T10:00:10.000Z')
  check('A514 le curseur est l’ARRIVÉE (`written_at`), pas l’instant du choix', p.cursor! > rows[1].updated_at)
  /* La correction d'horloge : un appareil en avance d'une heure, écart mesuré −1 h. */
  const HOUR = 3_600_000
  const skewed = acc.planPull([rows[0]], () => 'vector', { 'lo-yanum:map-base': { value: 'vector', at: at('2026-10-15T10:00:03.000Z') + HOUR, offline: true } }, -HOUR, null)
  check('A514 ★ l’instant d’un geste est jugé à l’horloge du SERVEUR (appareil en avance d’1 h, écart −1 h → il cède)', skewed.dropQueue.includes('lo-yanum:map-base'))
  const naive = acc.planPull([rows[0]], () => 'vector', { 'lo-yanum:map-base': { value: 'vector', at: at('2026-10-15T10:00:03.000Z') + HOUR, offline: true } }, 0, null)
  check('A514 (sans la correction, l’heure de l’appareil aurait gagné — c’est ce que BJ abolit)', !naive.dropQueue.includes('lo-yanum:map-base'))
}

// ===========================================================================
section('A515 — ★ l’heure du serveur')
{
  const sql = readFileSync('supabase/migrations/20261015000100_bj_user_setting_values.sql', 'utf8')
  check('A515 le déclencheur borne l’instant revendiqué à now() (jamais dans le futur)', /least\(coalesce\(new\.client_at, now\(\)\), now\(\)\)/.test(sql))
  check('A515 ★ une écriture plus ancienne que la valeur en place est IGNORÉE (`return old`)', /if eff <= old\.updated_at then\s+return old;/.test(sql))
  check('A515 `updated_at` et `written_at` sont posés par la BASE', /new\.updated_at := eff;/.test(sql) && /new\.written_at := now\(\);/.test(sql))
  check('A515 la table naît fermée : RLS activée ET forcée, `anon` révoqué, le propriétaire seul', /enable row level security/.test(sql) && /force row level security/.test(sql) && /revoke all on public\.user_setting_values from anon/.test(sql) && /using \(user_id = auth\.uid\(\)\) with check \(user_id = auth\.uid\(\)\)/.test(sql))
  const net = readFileSync('src/data/settingValues.ts', 'utf8')
  const pushShape = /export interface SettingPush \{([\s\S]*?)\n\}/.exec(net)?.[1] ?? ''
  const payloads = [...net.matchAll(/rows\.map\(\(r\) => \(([^)]*)\)\)/g)].map((m) => m[1])
  check('A515 ★ le client n’envoie JAMAIS `updated_at` ni `written_at` (forme envoyée : clé, valeur, `client_at`, appareil)', pushShape !== '' && !/updated_at|written_at/.test(pushShape) && payloads.length === 2 && payloads.every((p) => p.trim() === '{ user_id: u.id, ...r }'), payloads.join(' | '))
  check('A515 une écriture EN LIGNE part sans instant (le serveur pose `now()`)', acc.serverTimeOf({ value: 'x', at: 123, offline: false }, 5000) === null)
  check('A515 ★ une écriture HORS LIGNE part avec l’instant du geste CORRIGÉ de l’écart mesuré', acc.serverTimeOf({ value: 'x', at: Date.parse('2026-10-15T11:00:00.000Z'), offline: true }, -3_600_000) === '2026-10-15T10:00:00.000Z')
  /* Le banc rejoue le déclencheur. */
  const db = new FakeDb()
  const t = db.triggers.get('user_setting_values')!
  const first = t({ user_id: 'u', key: 'k', value: 'a', client_at: null }, null)
  const future = t({ user_id: 'u', key: 'k', value: 'b', client_at: new Date(Date.now() + 3_600_000).toISOString() }, first)
  check('A515 banc : un instant revendiqué dans le FUTUR est ramené à maintenant', Date.parse(String(future.updated_at)) <= Date.now() + 5 && future.value === 'b')
  const stale = t({ user_id: 'u', key: 'k', value: 'c', client_at: new Date(Date.now() - 60_000).toISOString() }, future)
  check('A515 ★ banc : une file plus ANCIENNE que la valeur en place n’écrase rien', stale === future && stale.value === 'b')
  check('A515 plus aucune fusion à l’instant d’appareil (`mergeSettings` n’existe plus)', !('mergeSettings' in sync))
}

// ===========================================================================
section('A516 — le bloc des réglages du diagnostic')
{
  const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`
  const when = (v: number | string) => `@${v}`
  check('A516 une longue valeur est résumée, jamais recopiée', report.shortValue('x'.repeat(500), t).length < 120 && report.shortValue('#h:abcd1234:200000', t).includes('200000'))
  check('A516 l’empreinte d’une longue valeur reconnaît la même valeur', acc.sameAsRemembered('y'.repeat(5000), acc.remember('y'.repeat(5000))) && !acc.sameAsRemembered('y'.repeat(5001), acc.remember('y'.repeat(5000))))
  const rowA = { key: 'lo-yanum:map-base', scope: 'account' as const, reason: null, device: 'satellite', account: 'vector', accountAt: '2026', pending: true, differs: true, syncedAt: 0 }
  const rowB = { key: 'lo-yanum:theme:coordinator', scope: 'account' as const, reason: null, device: 'dark', account: 'vector', accountAt: '2026', pending: false, differs: true, syncedAt: 5 }
  check('A516 ★ une différence en attente d’envoi est DITE comme telle', report.differsText(rowA, t).includes('differsPending'))
  check('A516 ★ une différence reçue est DITE avec les deux valeurs', report.differsText(rowB, t).includes('"device":"dark"') && report.differsText(rowB, t).includes('"account":"vector"'))
  check('A516 la ligne copiée porte la portée, les deux valeurs, la synchronisation', report.settingRowText(rowB, t, when).includes('lo-yanum:theme:coordinator [diagnostic.settings.scope.account]') && report.settingRowText(rowB, t, when).includes('@5'))
  const dev = { key: 'lo-yanum:auth', scope: 'device' as const, reason: 'auth', device: '{}', account: undefined, accountAt: null, pending: false, differs: false, syncedAt: 0 }
  check('A516 une clé d’appareil dit sa raison, sans colonne « compte »', report.settingRowText(dev, t, when).includes('reason.auth') && !report.settingRowText(dev, t, when).includes('columns.account'))
}

// ===========================================================================
section('A517 — les branchements')
{
  const main = readFileSync('src/main.tsx', 'utf8')
  check('A517 ★ le moteur de compte démarre, et le premier rendu attend son cycle (2,5 s au plus)', /account\.startAccountSync\(/.test(main) && /await account\.syncAccountSettings\('boot'\)/.test(main) && /Promise\.race\(\[\s*settingsReady/.test(main))
  check('A517 la réactivation des couches de BI part AVANT le moteur', main.indexOf('migrateMapLayers()') < main.indexOf('account.startAccountSync('))
  const facade = readFileSync('src/ui/settings/sync.ts', 'utf8')
  check('A517 ★ plus aucune enveloppe autour de `localStorage.setItem`', !/storage\.setItem\s*=/.test(facade) && !/localStorage/.test(facade.replace(/\/\*[\s\S]*?\*\//g, '')))
  check('A517 « choisie seulement » n’est plus (la migration a tranché pour le compte)', sync.STAMPED_ONLY_KEYS.size === 0)
  const client = readFileSync('src/data/client.ts', 'utf8')
  check('A517 supabase-js range sa session par l’adaptateur du registre', /storage:\s*authStorage/.test(client))
  const he = JSON.parse(readFileSync('src/locales/he.json', 'utf8')) as { settings: { display: { hint: string }; vigil: { intro: string } } }
  check('A517 ★ les deux textes qui disaient « במכשיר הזה » disent « בחשבון »', he.settings.display.hint.includes('בחשבון') && he.settings.vigil.intro.includes('בחשבון'))
}

console.log(`\n  ${passed} PASS · ${failed} FAIL\n`)
process.exit(failed === 0 ? 0 : 1)
