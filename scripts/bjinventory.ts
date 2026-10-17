import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SETTINGS, settingDef } from '../src/storage/registry'
import type { SettingDef } from '../src/storage/registry'
import { resolveKey, stripComments } from './bjguard'

/**
 * BJ — L'INVENTAIRE, TIRÉ DU REGISTRE ET DU CODE.   bun run scripts/bjinventory.ts
 *
 * Écrit `docs/bj/reglages.md` : une ligne par clé, avec — résolus par la même
 * mécanique que `bjguard` — les fichiers et lignes qui l'écrivent et la lisent
 * AVANT BJ (le commit `BEFORE`, accès directs à `localStorage` /
 * `sessionStorage`) et APRÈS (appels au registre).
 */

const BEFORE = process.env.BEFORE ?? '99eebab'

function walk(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(n)) acc.push(p)
  }
  return acc
}

type Site = { file: string; line: number; op: 'r' | 'w' }

function firstArg(src: string, start: number): string {
  let depth = 0
  let quote: string | null = null
  let i = start
  for (; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) {
      if (depth === 0) break
      depth--
    } else if (c === ',' && depth === 0) break
  }
  return src.slice(start, i).trim()
}

function sites(files: Map<string, string>, calls: Record<string, 'r' | 'w'>): Map<string, Site[]> {
  const out = new Map<string, Site[]>()
  const add = (key: string, s: Site) => {
    const list = out.get(key) ?? []
    if (!list.some((x) => x.file === s.file && x.line === s.line)) list.push(s)
    out.set(key, list)
  }
  const names = Object.keys(calls).map((n) => n.replace(/\./g, '\\.')).join('|')
  for (const [file, raw] of files) {
    if (/storage\/(local|account|registry|idb)\.ts$/.test(file)) continue
    const src = stripComments(raw)
    const re = new RegExp(`(${names})(?:<[^>()]*>)?\\(`, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue
      const arg = firstArg(src, m.index + m[0].length)
      const r = resolveKey(arg, file, src, files)
      const line = src.slice(0, m.index).split('\n').length
      const op = calls[m[1]] ?? (m[1].includes('get') || m[1].includes('read') || m[1].includes('peek') ? 'r' : 'w')
      let key: string | null = null
      if (r.kind === 'exact') key = settingDef(r.key) ? (settingDef(r.key)!.family ? settingDef(r.key)!.key : r.key) : r.key
      else if (r.kind === 'prefix') key = settingDef(`${r.prefix}x`)?.key ?? `${r.prefix}…`
      else if (/DataTable/.test(file)) key = '(tri : lo-yanum:*-sort)'
      else if (/fields\.tsx/.test(file)) key = 'farm-form-'
      else if (/update\.ts/.test(file)) key = '(update : pending / verdict)'
      else key = `(dynamique : ${arg})`
      add(key, { file: file.replace(/^.*?src\//, 'src/'), line, op })
    }
  }
  return out
}

const fmt = (list: Site[] | undefined, op: 'r' | 'w') =>
  [...new Set((list ?? []).filter((s) => s.op === op).map((s) => `\`${s.file.replace('src/', '')}:${s.line}\``))].join(' ') || '—'
const cell = (text: string) => text.replace(/\|/g, '\\|')

// AVANT : le commit d'avant BJ, accès directs.
const beforeFiles = new Map<string, string>()
for (const f of execSync(`git ls-tree -r --name-only ${BEFORE} src`, { encoding: 'utf8' }).split('\n').filter((x) => /\.(ts|tsx)$/.test(x))) {
  beforeFiles.set(f, execSync(`git show ${BEFORE}:"${f}"`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }))
}
const before = sites(beforeFiles, {
  'localStorage.getItem': 'r',
  'localStorage.setItem': 'w',
  'localStorage.removeItem': 'w',
  'sessionStorage.getItem': 'r',
  'sessionStorage.setItem': 'w',
  readSortState: 'r',
  readBlockOpen: 'r',
  writeBlockOpen: 'w',
})
// APRÈS : le registre.
const afterFiles = new Map<string, string>()
for (const f of walk('src')) afterFiles.set(f, readFileSync(f, 'utf8'))
const after = sites(afterFiles, { readSetting: 'r', readSettingJson: 'r', peekSetting: 'r', writeSetting: 'w', writeSettingJson: 'w', readSortState: 'r', readJson: 'r', writeJson: 'w' })

const keyOf = (d: SettingDef) => d.key
const look = (m: Map<string, Site[]>, d: SettingDef): Site[] => {
  const out: Site[] = []
  for (const [k, list] of m) {
    if (k === d.key || (d.family && k.startsWith(d.key))) out.push(...list)
    /* Une clé exacte écrite par la fonction de sa famille (`themeStorageKey(role)`). */
    if (!d.family && SETTINGS.some((f) => f.family && f.key === k && d.key.startsWith(f.key))) out.push(...list)
    if (d.key.endsWith('-sort') && k.startsWith('(tri')) out.push(...list.map((s) => ({ ...s })))
    /* ★★ BK — le même site (`fields.tsx`) : `farm-form-<section>:<ferme>` avant, `farm-section:<type>` après. */
    if (d.key === 'lo-yanum:farm-section:' && k === 'farm-form-') out.push(...list)
    if ((d.key === 'lo-yanum:update-pending' || d.key === 'lo-yanum:update-verdict') && k.startsWith('(update')) out.push(...list)
    if (d.key === 'lo-yanum:block:' && k === 'lo-yanum:block:') out.push(...list)
  }
  return out
}

const SYNC: Record<SettingDef['syncedBefore'], string> = { yes: 'oui', no: '**non**', partial: 'partiel¹', 'n/a': '—' }
const AREA: Record<SettingDef['area'], string> = { local: 'localStorage', idb: 'IndexedDB', cache: 'Cache Storage' }
const REASON: Record<string, string> = { draft: 'brouillon', offline: 'hors ligne', auth: 'authentification', diagnostic: 'diagnostic', machine: 'machine (BK)', screen: 'taille de l’écran (BK)' }

const lines: string[] = []
lines.push('# BJ — Inventaire des réglages et de l’état persistant côté client (arbitrages appliqués en BK)')
lines.push('')
lines.push(`> Généré par \`bun run scripts/bjinventory.ts\` depuis \`src/storage/registry.ts\` (la source de vérité) et le code : « avant » = le commit \`${BEFORE}\` (accès directs à \`localStorage\` / \`sessionStorage\`), « après » = les appels au registre. Lignes résolues par la mécanique de \`bjguard\`.`)
lines.push('')
lines.push('Légende — **Sync avant BJ** : la clé voyageait-elle d’un appareil à l’autre avant cette passe. ¹ *partiel* = « choisie seulement » (AY1.3 / BI) : ne voyageait qu’une fois choisie DEPUIS la passe concernée, une valeur plus ancienne restait sur l’appareil. **Destination** : `compte` = table `user_setting_values`, horodatée par le serveur ; `appareil` = reste sur cette machine, avec sa raison.')
lines.push('')
lines.push('| # | Clé | Contenu (type) | Où | Écrite par (avant → après) | Lue par (avant → après) | Sync avant BJ | Destination | Justification « appareil » · décision du PO (BK) |')
lines.push('|---|---|---|---|---|---|---|---|---|')
SETTINGS.forEach((d, i) => {
  const b = look(before, d)
  const a = look(after, d)
  const key = `\`${keyOf(d)}${d.family ? '<…>' : ''}\``
  const dest = d.scope === 'account' ? (d.decided ? 'compte — **tranché (BK)**' : 'compte') : `appareil · ${REASON[d.reason ?? 'diagnostic']}${d.decided ? ' — **tranché (BK)**' : ''}`
  const why = d.scope === 'device' ? `${d.why ?? ''}${d.decided ? ` — *${d.decided}*` : ''}` : d.decided ? `*${d.decided}*` : ''
  const w = d.area === 'local' ? `${fmt(b, 'w')} → ${fmt(a, 'w')}` : `\`${d.owner.replace('src/', '')}\``
  const r = d.area === 'local' ? `${fmt(b, 'r')} → ${fmt(a, 'r')}` : `\`${d.owner.replace('src/', '')}\``
  lines.push(`| ${i + 1} | ${key} | ${cell(d.label)} | ${AREA[d.area]} | ${w} | ${r} | ${SYNC[d.syncedBefore]} | ${dest} | ${cell(why)} |`)
})
lines.push('')
lines.push('## Les douze arbitrages du PO (BK, 2026-10-18)')
lines.push('')
lines.push('BJ avait laissé douze entrées en suspens. Le PO a tranché ; il n’en reste aucune (`bjguard` refuse une entrée sans décision). `lo-yanum:map-view` est née en BK pour le scénario que le PO attribuait à `map-last`.')
lines.push('')
lines.push('| Clé | Destination appliquée | Décision |')
lines.push('|---|---|---|')
const destOf = (d: SettingDef) => ((d.decided ?? '').startsWith('supprimée') ? '**supprimée** → table `activity_reports` (vidée puis effacée sur chaque appareil)' : d.scope === 'account' ? 'compte' : `appareil (${REASON[d.reason ?? 'diagnostic']})`)
for (const d of SETTINGS.filter((x) => x.decided)) lines.push(`| \`${d.key}${d.family ? '<…>' : ''}\` | ${destOf(d)} | ${cell(d.decided ?? '')} |`)
lines.push('')
lines.push('## Clés abandonnées (BK)')
lines.push('')
lines.push('- `farm-form-<section>:<ferme>` — le pli d’une section du formulaire de ferme, PAR FERME (BJ, portée compte provisoire ; `sessionStorage` avant BJ). Remplacée par `lo-yanum:farm-section:<type>`, par TYPE de section. **Choix énoncé : abandonnée** — ni lue, ni convertie, ni écrite. Sur le compte : 0 ligne (mesuré le 2026-10-18). Sur les appareils : les copies restent inertes (quelques octets) ; le diagnostic en dit le nombre. Le PO retrouve chaque section ouverte jusqu’à ce qu’il la replie une fois — pour toutes les fermes.')
lines.push('- `lo-yanum:activity-reports` — l’historique des comptes rendus. Lu désormais dans la table `activity_reports`. La clé n’est plus jamais écrite ; sur chaque appareil qui la porte encore, ses rapports sont envoyés à la table, RELUS, comparés champ par champ, et la clé n’est effacée que si TOUS sont identiques dans la table (`judgeDrain`). Sur le compte : 0 ligne (mesuré) ; la table : 1 rapport.')
lines.push('')
lines.push('## Restent sur l’appareil — les raisons admises')
lines.push('')
for (const r of ['draft', 'offline', 'auth', 'diagnostic', 'screen', 'machine'] as const) {
  lines.push(`- **${REASON[r]}** : ${SETTINGS.filter((d) => d.scope === 'device' && d.reason === r).map((d) => `\`${d.key}${d.family ? '<…>' : ''}\``).join(', ')}`)
}
lines.push('')
lines.push('## Écritures indirectes (bibliothèques tierces)')
lines.push('')
lines.push('- **supabase-js** : écrivait `lo-yanum:auth` (et, selon le flux, `lo-yanum:auth-code-verifier`, `lo-yanum:auth-user`) DIRECTEMENT dans `localStorage`. Depuis BJ, il reçoit l’adaptateur `authStorage` du registre (`src/data/client.ts`) : une clé qu’il voudrait écrire hors des déclarations est refusée.')
lines.push('- **Service worker** (`public/sw.js`) : Cache Storage `lo-yanum-shell-<version>` (l’application) et `lo-yanum-basemap` (la carte hors ligne). Déclarés ; `bjguard` refuse un cache non déclaré.')
lines.push('- **IndexedDB** : la seule base est `lo-yanum` (`aggregates` + `outbox`), ouverte désormais par `src/storage/idb.ts` (déplacée de `src/data/cache.ts`).')
lines.push('- **MapLibre GL, pmtiles** : aucune écriture dans `localStorage`, `sessionStorage`, IndexedDB ni Cache Storage (recherché dans `node_modules/maplibre-gl/dist/maplibre-gl.js` : 0 occurrence).')
lines.push('- **Cookies** : aucun (`document.cookie` n’apparaît nulle part ; GitHub Pages n’en pose pas).')
lines.push('- **sessionStorage** : un seul usage avant BJ, les sections repliées du formulaire de ferme (`fields.tsx`, `farm-form-*`) ; passé au registre en BJ, par type de section en BK (`lo-yanum:farm-section:<type>`). Plus aucun usage.')
lines.push('')
lines.push('## Commentaires et textes qui mentaient')
lines.push('')
for (const d of SETTINGS.filter((x) => x.lie)) lines.push(`- \`${d.key}\` — ${d.lie}.`)
lines.push('- `lo-yanum:region-rings` — `regionEdits.ts` et `core/store.ts` disaient « a setting of this device » alors que la clé voyageait avec le compte depuis AH11.2 (sens inverse du mensonge de BI, même défaut : le commentaire ne dit pas où vit la valeur).')
lines.push('- Les commentaires qui disaient « local » pour une clé désormais de compte (rail, bandeau de couverture, « déjà vu » des demandes, destinataire du compte rendu, brouillon d’itinéraire libre, disposition de la carte) portent une note BJ.')
writeFileSync('docs/bj/reglages.md', `${lines.join('\n')}\n`)
console.log(`docs/bj/reglages.md : ${SETTINGS.length} lignes`)
