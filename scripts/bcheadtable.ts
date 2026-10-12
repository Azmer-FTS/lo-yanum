import { readFileSync, writeFileSync } from 'node:fs'

/**
 * BC — le tableau « avant / après » des en-têtes, à partir des deux mesures de
 * `bcbefore.ts` (même définition, même jumeau de démonstration).
 *
 *   bun run scripts/bcheadtable.ts      → docs/bc/bc-entete-avant-apres.md
 */
interface M {
  viewport: string
  mode: string
  screen: string
  rest?: number | null
  scrolled?: number | null
  share?: number | null
  error?: string
}
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as { base: string; at: string; results: M[] }
const before = read(process.env.BEFORE ?? 'docs/bc/bc-entete-avant.json')
const after = read(process.env.AFTER ?? 'docs/bc/bc-entete-apres.json')
const key = (m: M) => `${m.viewport}|${m.mode}|${m.screen}`
const idx = new Map(after.results.map((m) => [key(m), m]))
const cell = (m: M | undefined) => (m && !m.error && m.rest != null ? `${m.rest} / ${m.scrolled ?? '—'} px · ${m.share ?? '—'} %` : m?.error ? 'erreur' : '—')
const MODE: Record<string, string> = { hidden: 'liste seule', split: 'mode partagé (défaut d’un appareil neuf)' }
const lines = [
  '# BC — l’en-tête des listes, avant / après',
  '',
  `Avant : ${before.base} (${before.at}). Après : ${after.base} (${after.at}).`,
  '',
  'Chaque case : **au repos / après défilement**, puis la part de l’écran laissée aux données au repos.',
  'L’en-tête = ce qui couvre la colonne de la liste au-dessus de la première ligne de données',
  '(`scripts/bcmeasure.ts`). Au téléphone, après BC, une liste n’a plus de mode partagé : un',
  '« partagé » mémorisé (ou le défaut) ouvre la liste.',
  '',
]
for (const vp of [...new Set(before.results.map((m) => m.viewport))]) {
  for (const mode of ['hidden', 'split']) {
    lines.push(`## ${vp} — ${MODE[mode] ?? mode}`, '', '| Écran | Avant | Après |', '|---|---:|---:|')
    for (const m of before.results.filter((x) => x.viewport === vp && x.mode === mode)) lines.push(`| ${m.screen} | ${cell(m)} | ${cell(idx.get(key(m)))} |`)
    lines.push('')
  }
}
writeFileSync(process.env.OUT ?? 'docs/bc/bc-entete-avant-apres.md', `${lines.join('\n')}\n`)
console.log(`  → ${process.env.OUT ?? 'docs/bc/bc-entete-avant-apres.md'}`)
