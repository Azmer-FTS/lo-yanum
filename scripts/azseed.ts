import { writeFileSync, mkdirSync } from 'node:fs'

import { buildTestData } from '../src/core/testData'
import { MAPPINGS } from '../src/data/rows'

/**
 * ★★ AZ3 — LE JEU D'ESSAI, EN SQL, POUR LA BASE DU PO.
 *
 * Le jeu d'essai (AH3, AY11) n'avait jamais été POSÉ sur `lo-yanum-prod` :
 * 0 volontaire, 0 conducteur, 0 garde, 0 ligne `test-` (relevé du
 * 2026-10-11). Le PO « ne pouvait pas juger ces écrans » parce qu'ils étaient
 * vides. Ce script produit les lignes EXACTES que l'app écrirait elle-même
 * (`MAPPINGS[…].toRows`, la synchronisation) ; le SQL est appliqué par le MCP
 * (`execute_sql`), jamais par `db push`.
 *
 *   bun run scripts/azseed.ts            → private/az/seed.sql (+ purge.sql)
 *
 * Idempotent : chaque table est d'abord vidée de ses lignes `test-` (et
 * seulement d'elles), enfants avant parents.
 */
const set = buildTestData()
const order: Array<[keyof typeof MAPPINGS, unknown[]]> = [
  ['institutions', set.institutions],
  ['farms', set.farms],
  ['farmZones', set.farmZones],
  ['anchorPoints', set.anchorPoints],
  ['volunteers', set.volunteers],
  ['drivers', set.drivers],
  ['missions', set.missions],
]
const inserts: string[] = []
const tables: string[] = []
const q = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'`
for (const [c, items] of order) {
  const m = MAPPINGS[c] as { toRows: (x: unknown) => Array<{ table: string; rows: Array<Record<string, unknown>> }> }
  const byTable = new Map<string, Array<Record<string, unknown>>>()
  for (const it of items) for (const g of m.toRows(it)) byTable.set(g.table, [...(byTable.get(g.table) ?? []), ...g.rows])
  for (const [t, rows] of byTable) {
    if (!tables.includes(t)) tables.push(t)
    if (rows.length === 0) continue
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].map((k) => `"${k}"`).join(', ')
    inserts.push(`insert into public.${t} (${cols}) select ${cols} from json_populate_recordset(null::public.${t}, ${q(rows)});`)
  }
}
mkdirSync('private/az', { recursive: true })
writeFileSync('private/az/seed.sql', `begin;\n${inserts.join('\n')}\ncommit;\n`)
console.log(tables.join(', '))
console.log(inserts.length, 'inserts', inserts.reduce((n, s) => n + s.length, 0), 'chars')
