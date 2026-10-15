import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { SETTINGS, settingDef } from '../src/storage/registry'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BJ — A511 · LA PORTE QUI REND LA RÈGLE INFRANCHISSABLE.   bun run bjguard
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Trois pannes (BC, AU1, BI) : un réglage rangé sur l'appareil au lieu du
 * compte. Cette porte empêche la quatrième. Elle est PURE (aucun navigateur)
 * et échoue si, dans `src/` (commentaires retirés) :
 *
 *   1. `localStorage`, `sessionStorage`, `indexedDB` (ou un type IDB),
 *      `document.cookie` ou le Cache Storage (`caches.`) apparaît HORS de
 *      `src/storage/` — le registre et ses deux modules d'accès ;
 *   2. une clé est employée sans être déclarée dans `src/storage/registry.ts` :
 *        · chaque premier argument des fonctions d'accès (`readSetting`,
 *          `writeSetting`, `readSettingJson`, `writeSettingJson`, `peekSetting`,
 *          `writeDeviceRecord`, `applyAccountValue`, `readSortState`,
 *          `readBlockOpen`/`writeBlockOpen`, `storageKey=` d'un `FormSection`)
 *          est RÉSOLU (littéral, constante, gabarit, fonction de clé du même
 *          fichier) et doit tomber sur une déclaration ;
 *        · tout littéral `'lo-yanum:…'` du code qui n'est pas un nom
 *          d'événement doit être déclaré (une clé ne naît pas en douce) ;
 *   3. le service worker (`public/sw.js`) ouvre un cache non déclaré ;
 *   4. le registre lui-même est mal formé (doublon ; « appareil » sans raison
 *      admise ni justification ; un défaut que son propre validateur refuse).
 *
 * ★ ET ELLE PROUVE QU'ELLE MORD : avant de juger `src/`, elle juge des
 *   SOURCES FABRIQUÉES qui violent chaque règle, et exige qu'elles soient
 *   refusées (section « auto-contrôle »). `BJGUARD_ROOT=<dossier>` la fait
 *   juger un autre arbre (c'est ainsi que la preuve « rouge » est faite sur
 *   une copie de `src/` qui porte une violation fabriquée).
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

// ---------------------------------------------------------------------------
// Retirer les commentaires en gardant les chaînes (et les gabarits imbriqués)
// ---------------------------------------------------------------------------

export function stripComments(src: string): string {
  let out = ''
  let i = 0
  const stack: Array<'tpl' | 'expr'> = []
  let braces: number[] = []
  while (i < src.length) {
    const c = src[i]
    const n = src[i + 1]
    const inTpl = stack[stack.length - 1] === 'tpl'
    if (inTpl) {
      if (c === '\\') {
        out += c + (n ?? '')
        i += 2
        continue
      }
      if (c === '`') {
        stack.pop()
        out += c
        i++
        continue
      }
      if (c === '$' && n === '{') {
        stack.push('expr')
        braces.push(0)
        out += '${'
        i += 2
        continue
      }
      out += c
      i++
      continue
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i++
      }
      i += 2
      continue
    }
    if (c === "'" || c === '"') {
      const q = c
      out += c
      i++
      while (i < src.length && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        i++
      }
      out += src[i] ?? ''
      i++
      continue
    }
    if (c === '`') {
      stack.push('tpl')
      out += c
      i++
      continue
    }
    if (stack[stack.length - 1] === 'expr') {
      if (c === '{') braces[braces.length - 1]++
      if (c === '}') {
        if (braces[braces.length - 1] === 0) {
          stack.pop()
          braces = braces.slice(0, -1)
          out += c
          i++
          continue
        }
        braces[braces.length - 1]--
      }
    }
    out += c
    i++
  }
  return out
}

// ---------------------------------------------------------------------------
// Les règles
// ---------------------------------------------------------------------------

export interface Violation {
  file: string
  line: number
  rule: 'raw-storage' | 'undeclared-key' | 'unresolved-key' | 'sw-cache'
  text: string
}

const RAW = /\b(localStorage|sessionStorage|indexedDB|IDBDatabase|IDBObjectStore|IDBOpenDBRequest|IDBFactory)\b|document\s*\.\s*cookie|\bcaches\s*\.|['"`](localStorage|sessionStorage|indexedDB)['"`]/
const ACCESSORS = ['readSetting', 'writeSetting', 'readSettingJson', 'writeSettingJson', 'peekSetting', 'writeDeviceRecord', 'applyAccountValue', 'readSortState']
/** Relais propres à un fichier : leur argument est une clé, vérifiée comme les autres. */
const FILE_ACCESSORS: Array<{ file: RegExp; fns: string[] }> = [{ file: /ui\/update\.ts$/, fns: ['readJson', 'writeJson'] }]
/** Fonctions dont l'argument est un SUFFIXE de famille (`lo-yanum:block:<type>`). */
const SUFFIX_ACCESSORS: Record<string, string> = { readBlockOpen: 'lo-yanum:block:', writeBlockOpen: 'lo-yanum:block:' }
/** Noms d'ÉVÉNEMENTS de la page (jamais des clés de stockage). */
export const EVENT_NAMES = new Set(['lo-yanum:settings-applied', 'lo-yanum:settings-conflict', 'lo-yanum:search-open', 'lo-yanum:legend-sub', 'lo-yanum:ground'])

const lineOf = (src: string, index: number): number => src.slice(0, index).split('\n').length

/** Le premier argument d'un appel ouvert à `start` (juste après la parenthèse). */
function firstArg(src: string, start: number): string {
  let depth = 0
  let i = start
  let quote: string | null = null
  for (; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') {
        i++
        continue
      }
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c
      continue
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) break
      depth--
    } else if (c === ',' && depth === 0) break
  }
  return src.slice(start, i).trim()
}

type Resolved = { kind: 'exact'; key: string } | { kind: 'prefix'; prefix: string } | { kind: 'dynamic'; why: string }

/** ★ Résoudre l'expression d'une clé dans son fichier. */
export function resolveKey(expr: string, file: string, src: string, files: Map<string, string>, depth = 0): Resolved {
  const e = expr.replace(/\s+as\s+\w+$/, '').trim()
  if (depth > 6) return { kind: 'dynamic', why: 'trop profond' }
  let m: RegExpExecArray | null
  if ((m = /^'([^'\\]*)'$/.exec(e)) || (m = /^"([^"\\]*)"$/.exec(e))) return { kind: 'exact', key: m[1] }
  if ((m = /^`([^`$]*)`$/.exec(e))) return { kind: 'exact', key: m[1] }
  if ((m = /^`([^`$]*)\$\{/.exec(e))) {
    if (m[1]) return { kind: 'prefix', prefix: m[1] }
    /* `${PREFIX}${id}` : le préfixe est une constante du fichier. */
    const head = /^`\$\{([A-Za-z_$][\w$]*)\}/.exec(e)
    if (head) {
      const r = resolveKey(head[1], file, src, files, depth + 1)
      if (r.kind === 'exact') return { kind: 'prefix', prefix: r.key }
    }
    return { kind: 'dynamic', why: 'gabarit sans préfixe' }
  }
  if ((m = /^(.+?)\s*\?\?\s*''$/.exec(e))) return resolveKey(m[1], file, src, files, depth + 1)
  if ((m = /^([A-Za-z_$][\w$]*)\s*\+\s*.+$/.exec(e))) {
    const left = resolveKey(m[1], file, src, files, depth + 1)
    return left.kind === 'exact' ? { kind: 'prefix', prefix: left.key } : left
  }
  if ((m = /^([A-Za-z_$][\w$]*)\((.*)\)$/s.exec(e))) {
    const fn = m[1]
    const def = new RegExp(`(?:const|let)\\s+${fn}\\s*=\\s*\\([^)]*\\)\\s*(?::\\s*\\w+\\s*)?=>\\s*([^\\n]+)`).exec(src) ?? new RegExp(`function\\s+${fn}\\s*\\([^)]*\\)[^{]*\\{\\s*return\\s+([^\\n]+)`).exec(src)
    if (def) return resolveKey(def[1].replace(/;$/, ''), file, src, files, depth + 1)
    /* Importée (directement ou par un fichier-barrière) : sa définition, où qu'elle soit. */
    if (new RegExp(`import\\s*\\{[^}]*\\b${fn}\\b[^}]*\\}\\s*from`).test(src)) {
      for (const [f, s] of files) {
        if (f === file || !new RegExp(`export\\s+(?:function\\s+${fn}\\b|const\\s+${fn}\\b)`).test(s)) continue
        const r = resolveKey(e, f, stripComments(s), files, depth + 1)
        if (r.kind !== 'dynamic') return r
      }
    }
    return { kind: 'dynamic', why: `fonction ${fn} introuvable` }
  }
  if ((m = /^([A-Za-z_$][\w$]*)$/.exec(e))) {
    const id = m[1]
    const def = new RegExp(`(?:export\\s+)?(?:const|let)\\s+${id}\\s*(?::[^=]+)?=\\s*([^\\n]+)`).exec(src)
    if (def) return resolveKey(def[1].replace(/;$/, ''), file, src, files, depth + 1)
    const imported = new RegExp(`import\\s*\\{[^}]*\\b${id}\\b[^}]*\\}\\s*from\\s*'([^']+)'`).exec(src)
    if (imported) {
      const target = imported[1].replace(/^\.\.?\//, '').replace(/^(\.\.\/)+/, '')
      for (const [f, s] of files) {
        if (!f.replace(/\.(ts|tsx)$/, '').endsWith(target.replace(/^.*?\b(ui|core|data|storage)\//, '$1/'))) continue
        const r = resolveKey(id, f, s, files, depth + 1)
        if (r.kind !== 'dynamic') return r
      }
    }
    return { kind: 'dynamic', why: `paramètre ou valeur ${id}` }
  }
  return { kind: 'dynamic', why: 'expression' }
}

function declared(r: Resolved): boolean {
  if (r.kind === 'exact') return settingDef(r.key) !== null
  if (r.kind === 'prefix') return SETTINGS.some((d) => d.family && (r.prefix.startsWith(d.key) || d.key === r.prefix)) || settingDef(`${r.prefix}x`) !== null
  return false
}

/**
 * ★ Les sites DYNAMIQUES admis : une fonction d'accès qui reçoit sa clé en
 * paramètre. Chacun est admis SEULEMENT si ses appelants sont vérifiés
 * ci-dessous (`FORWARDED`).
 */
const DYNAMIC_OK: Array<{ file: RegExp; expr: RegExp; forwardedBy: string }> = [
  { file: /ui\/components\/DataTable\.tsx$/, expr: /^storageKey$/, forwardedBy: 'readSortState' },
  { file: /ui\/components\/fields\.tsx$/, expr: /^storageKey( \?\? '')?$/, forwardedBy: 'FormSection storageKey=' },
  { file: /ui\/update\.ts$/, expr: /^key$/, forwardedBy: 'readJson/writeJson (PENDING_KEY, VERDICT_KEY)' },
]

export function judge(files: Map<string, string>, sw: string | null): Violation[] {
  const out: Violation[] = []
  for (const [file, raw] of files) {
    const src = stripComments(raw)
    const inStorage = /(^|\/)storage\//.test(file)
    // 1 — l'accès brut
    if (!inStorage) {
      src.split('\n').forEach((line, i) => {
        if (RAW.test(line)) out.push({ file, line: i + 1, rule: 'raw-storage', text: line.trim().slice(0, 140) })
      })
    }
    // 2a — les arguments des fonctions d'accès
    if (!/storage\/(local|account|registry)\.ts$/.test(file)) {
      const local = FILE_ACCESSORS.filter((x) => x.file.test(file)).flatMap((x) => x.fns)
      const re = new RegExp(`\\b(${[...ACCESSORS, ...local, ...Object.keys(SUFFIX_ACCESSORS)].join('|')})(?:<[^>()]*>)?\\(`, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        if (/function\s+$/.test(src.slice(Math.max(0, m.index - 12), m.index))) continue
        const arg = firstArg(src, m.index + m[0].length)
        if (arg === '') continue
        const suffixOf = SUFFIX_ACCESSORS[m[1]]
        if (suffixOf) {
          if (!settingDef(`${suffixOf}x`)) out.push({ file, line: lineOf(src, m.index), rule: 'undeclared-key', text: `${m[1]}(${arg}) → ${suffixOf}…` })
          continue
        }
        const r = resolveKey(arg, file, src, files)
        if (r.kind === 'dynamic') {
          if (!DYNAMIC_OK.some((d) => d.file.test(file) && d.expr.test(arg)))
            out.push({ file, line: lineOf(src, m.index), rule: 'unresolved-key', text: `${m[1]}(${arg}) — ${r.why}` })
          continue
        }
        if (!declared(r)) out.push({ file, line: lineOf(src, m.index), rule: 'undeclared-key', text: `${m[1]}(${arg}) → ${r.kind === 'exact' ? r.key : `${r.prefix}…`}` })
      }
      // 2b — `storageKey=` d'un FormSection
      const fs = /\bstorageKey=\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g
      while ((m = fs.exec(src))) {
        const r = resolveKey(m[1], file, src, files)
        if (!declared(r)) out.push({ file, line: lineOf(src, m.index), rule: r.kind === 'dynamic' ? 'unresolved-key' : 'undeclared-key', text: `storageKey=${m[1]}` })
      }
    }
    // 2c — tout littéral `lo-yanum:…` est une clé déclarée ou un nom d'événement
    const lit = /(['"`])(lo-yanum:[a-z0-9][^'"`$\s]*?)(\$\{|\1)/g
    let l: RegExpExecArray | null
    while ((l = lit.exec(src))) {
      const text = l[2]
      const isPrefix = l[3] === '${'
      if (EVENT_NAMES.has(text)) continue
      if (/^lo-yanum:[a-z]+-(open|sub)$/.test(text) && EVENT_NAMES.has(text)) continue
      const ok = isPrefix ? declared({ kind: 'prefix', prefix: text }) : settingDef(text) !== null || declared({ kind: 'prefix', prefix: text })
      if (!ok) out.push({ file, line: lineOf(src, l.index), rule: 'undeclared-key', text: `'${text}${isPrefix ? '${…}' : ''}'` })
    }
  }
  // 3 — le service worker
  if (sw !== null) {
    const names = [...sw.matchAll(/caches\.(?:open|delete)\(\s*([^)]+)\)/g)].map((m) => m[1].trim())
    const consts = new Map([...sw.matchAll(/const\s+(\w+)\s*=\s*(['`])([^'`$]*)/g)].map((m) => [m[1], m[3]]))
    for (const n of names) {
      const v = consts.get(n) ?? n.replace(/^['`]|['`]$/g, '')
      if (n === 'key' || n === 'cacheName') continue
      if (!settingDef(v) && !settingDef(`${v}x`)) out.push({ file: 'public/sw.js', line: 0, rule: 'sw-cache', text: `cache non déclaré : ${n} = ${v}` })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Le registre lui-même
// ---------------------------------------------------------------------------

export function registryProblems(): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const REASONS = new Set(['draft', 'offline', 'auth', 'diagnostic', 'machine'])
  for (const d of SETTINGS) {
    const id = `${d.key}${d.family ? '<…>' : ''}`
    if (seen.has(id)) out.push(`doublon : ${id}`)
    seen.add(id)
    if (d.scope === 'device' && (!d.reason || !REASONS.has(d.reason))) out.push(`« appareil » sans raison admise : ${id}`)
    if (d.scope === 'device' && !(d.why && d.why.length > 10)) out.push(`« appareil » sans justification : ${id}`)
    if (d.scope === 'device' && d.reason === 'machine' && !d.arbitrate) out.push(`« machine » non soumise à l'arbitrage : ${id}`)
    if (d.scope === 'account' && d.reason) out.push(`« compte » avec une raison d'appareil : ${id}`)
    if (d.fallback !== null && !d.validate(d.fallback)) out.push(`le défaut est refusé par son validateur : ${id}`)
    if (!d.label || !d.fallbackNote || !d.owner) out.push(`déclaration incomplète : ${id}`)
  }
  return out
}

// ---------------------------------------------------------------------------
// LA PORTE
// ---------------------------------------------------------------------------

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p)
  }
  return acc
}

if (import.meta.main) {
  console.log('\n  BJ — A511 · la règle « un réglage suit le compte » est-elle infranchissable ?')

  section('A511 · auto-contrôle — la porte MORD sur des violations fabriquées')
  {
    const sources = new Map<string, string>([
      ['src/ui/fab/rawWrite.ts', "export function f() { localStorage.setItem('lo-yanum:theme:coordinator', 'dark') }"],
      ['src/ui/fab/rawSession.ts', "export const g = () => window.sessionStorage.setItem('x', '1')"],
      ['src/ui/fab/rawIdb.ts', "export const h = () => indexedDB.open('autre-base')"],
      ['src/ui/fab/bracket.ts', "export const k = () => (window as any)['localStorage'].setItem('a', 'b')"],
      ['src/ui/fab/undeclared.ts', "import { writeSetting } from '../../storage/local'\nconst KEY = 'lo-yanum:nouvelle-cle'\nexport const w = () => writeSetting(KEY, '1')"],
      ['src/ui/fab/undeclaredTpl.ts', "import { readSetting } from '../../storage/local'\nexport const r = (id: string) => readSetting(`lo-yanum:inconnue:${id}`)"],
      ['src/ui/fab/literal.ts', "export const NAME = 'lo-yanum:cle-en-douce'"],
      ['src/ui/fab/unresolved.ts', "import { writeSetting } from '../../storage/local'\nexport const u = (k: string) => writeSetting(k, '1')"],
      ['src/ui/fab/commented.ts', "// localStorage.setItem('x', '1') — un commentaire ne compte pas\nexport const ok = 1"],
      ['src/ui/fab/declared.ts', "import { writeSetting } from '../../storage/local'\nconst KEY = 'lo-yanum:map-base'\nexport const d = () => writeSetting(KEY, 'satellite')"],
    ])
    const v = judge(sources, "const MAP_CACHE = 'lo-yanum-basemap'\nconst X = 'cache-pirate'\ncaches.open(X)")
    const has = (file: string, rule: Violation['rule']) => v.some((x) => x.file === file && x.rule === rule)
    check('écriture directe dans localStorage → refusée', has('src/ui/fab/rawWrite.ts', 'raw-storage'))
    check('écriture directe dans sessionStorage → refusée', has('src/ui/fab/rawSession.ts', 'raw-storage'))
    check('ouverture IndexedDB hors du registre → refusée', has('src/ui/fab/rawIdb.ts', 'raw-storage'))
    check('accès déguisé `window["localStorage"]` → refusé', has('src/ui/fab/bracket.ts', 'raw-storage'))
    check('clé non déclarée, par une constante → refusée', has('src/ui/fab/undeclared.ts', 'undeclared-key'))
    check('famille non déclarée, par un gabarit → refusée', has('src/ui/fab/undeclaredTpl.ts', 'undeclared-key'))
    check('littéral `lo-yanum:` non déclaré → refusé', has('src/ui/fab/literal.ts', 'undeclared-key'))
    check('clé non résolue (un paramètre libre) → refusée', has('src/ui/fab/unresolved.ts', 'unresolved-key'))
    check('cache du service worker non déclaré → refusé', v.some((x) => x.rule === 'sw-cache' && x.text.includes('cache-pirate')))
    check('un commentaire ne déclenche rien', !v.some((x) => x.file === 'src/ui/fab/commented.ts'))
    check('une clé déclarée, par le registre → admise', !v.some((x) => x.file === 'src/ui/fab/declared.ts'))
  }

  section('A511 · le registre est bien formé')
  {
    const problems = registryProblems()
    check('aucun doublon, chaque « appareil » a sa raison admise et sa justification, chaque défaut passe son validateur', problems.length === 0, problems.join(' ; '))
    const device = SETTINGS.filter((d) => d.scope === 'device')
    check('les raisons d’appareil sont les quatre du PO, plus « machine » soumise à l’arbitrage', device.every((d) => ['draft', 'offline', 'auth', 'diagnostic', 'machine'].includes(d.reason ?? '')))
    check('« compte » est le défaut : plus de réglages de compte que d’appareil hors raisons techniques', SETTINGS.filter((d) => d.scope === 'account').length > device.filter((d) => d.reason === 'machine').length)
  }

  const ROOT = process.env.BJGUARD_ROOT ?? '.'
  section(`A511 · ${ROOT === '.' ? 'le code de l’application' : `l’arbre ${ROOT}`} (src/, public/sw.js)`)
  {
    const files = new Map<string, string>()
    for (const f of walk(join(ROOT, 'src'))) files.set(relative(ROOT, f), readFileSync(f, 'utf8'))
    let sw: string | null = null
    try {
      sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8')
    } catch {
      sw = null
    }
    const v = judge(files, sw)
    const by = (rule: Violation['rule']) => v.filter((x) => x.rule === rule)
    const fmt = (list: Violation[]) => list.map((x) => `${x.file}:${x.line} ${x.text}`).join('\n          ')
    check(`aucun accès direct au stockage hors de src/storage/ (${files.size} fichiers)`, by('raw-storage').length === 0, fmt(by('raw-storage')))
    check('chaque clé employée est déclarée dans le registre', by('undeclared-key').length === 0, fmt(by('undeclared-key')))
    check('chaque clé employée se résout (aucun paramètre libre non vérifié)', by('unresolved-key').length === 0, fmt(by('unresolved-key')))
    check('le service worker n’ouvre que des caches déclarés', by('sw-cache').length === 0, fmt(by('sw-cache')))
    const storageFiles = [...files.keys()].filter((f) => /(^|\/)storage\//.test(f))
    check('le registre et ses modules d’accès sont tout src/storage/', storageFiles.every((f) => /storage\/(registry|local|idb|account)\.ts$/.test(f)), storageFiles.join(', '))
  }

  console.log(`\n  ${passed} PASS · ${failed} FAIL\n`)
  process.exit(failed === 0 ? 0 : 1)
}
