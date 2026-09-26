// AR4 — l'historique des migrations de lo-yanum-prod est-il aligné ?
//
// LIT SEULEMENT : `supabase migration list` ne touche ni schéma ni donnée.
// ⛔ Cette porte ne lance JAMAIS `db push`, même en --dry-run : c'est la
//    commande qui aurait vidé la base en AO.
//
// A273 : chaque version distante a son fichier, chaque fichier sa version
// distante ; chaque jalon est VIDE (aucune instruction réelle) ; chaque
// version MCP (horodatage réel, pas `…000N00`) a son jalon.
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

let pass = 0
let fail = 0
const ok = (cond: boolean, label: string, detail = '') => {
  if (cond) pass++
  else fail++
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const DIR = 'supabase/migrations'
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()

// 1. Les jalons n'exécutent rien.
const jalons = files.filter((f) => f.includes('_jalon_historique_mcp'))
for (const f of jalons) {
  const body = readFileSync(`${DIR}/${f}`, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('--') && l.trim() !== '')
    .join(' ')
    .trim()
  ok(body === 'select 1 where false;', `A273 jalon vide : ${f}`, body === 'select 1 where false;' ? '' : body.slice(0, 80))
}

// 2. La liste distante.
const res = spawnSync('supabase', ['migration', 'list'], { encoding: 'utf8' })
let rows: { local: string; remote: string }[] = []
try {
  const out = res.stdout.slice(res.stdout.indexOf('{'))
  rows = JSON.parse(out).migrations
} catch {
  ok(false, 'A273 `supabase migration list` répond', (res.stderr || res.stdout).slice(-300))
}
if (rows.length) {
  ok(true, `A273 \`supabase migration list\` répond (${rows.length} versions)`)
  const pending = rows.filter((r) => r.local && !r.remote).map((r) => r.local)
  const orphans = rows.filter((r) => r.remote && !r.local).map((r) => r.remote)
  ok(pending.length === 0, 'A273 aucun fichier local « jamais appliqué »', pending.join(' '))
  ok(orphans.length === 0, 'A273 aucune version distante sans fichier', orphans.join(' '))
  ok(rows.length === files.length, `A273 autant de versions que de fichiers (${files.length})`)
  // Une version à horodatage réel (MCP) doit être un jalon.
  const mcpLike = files.filter((f) => !/^\d{8}0{2}\d{2}0{2}_/.test(f) && !f.includes('_jalon_historique_mcp'))
  ok(mcpLike.length === 0, 'A273 toute version MCP porte un jalon, pas du DDL en double', mcpLike.join(' '))
}

console.log(`\n${pass} PASS, ${fail} FAIL`)
process.exit(fail ? 1 : 0)
