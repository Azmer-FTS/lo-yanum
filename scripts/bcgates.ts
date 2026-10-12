import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'

/**
 * BC — rejouer une liste de portes, l'une après l'autre, et noter pour chacune
 * son CODE DE SORTIE (une porte qui plante n'imprime pas de bilan : on lit
 * `exit`, jamais seulement un grep) et sa dernière ligne de bilan.
 *
 *   GATES="tokens contrast persist" bun run scripts/bcgates.ts
 *   LOG=docs/bc/portes-local.log
 */
const GATES = (process.env.GATES ?? '').split(/\s+/).filter(Boolean)
const LOG = process.env.LOG ?? 'docs/bc/portes-local.log'
const ENV = process.env.GATE_ENV ? JSON.parse(process.env.GATE_ENV) as Record<string, string> : {}
mkdirSync('docs/bc', { recursive: true })
writeFileSync(LOG, `# BC — portes rejouées ${new Date().toISOString()}\n`)
const summary: string[] = []
for (const g of GATES) {
  const t0 = Date.now()
  const p = Bun.spawn(['bun', 'run', g], { env: { ...process.env, ...ENV }, stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()])
  const code = await p.exited
  const text = `${out}\n${err}`
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const tally = [...lines].reverse().find((l) => /PASS|passed|FAIL|failed|checks|✓|✗|All pairs/i.test(l)) ?? lines[lines.length - 1] ?? ''
  const fails = lines.filter((l) => /^FAIL\b/.test(l)).slice(0, 12)
  const line = `${code === 0 ? 'OK  ' : 'ROUGE'} ${g.padEnd(14)} exit=${code} ${Math.round((Date.now() - t0) / 1000)}s  ${tally}`
  summary.push(line)
  console.log(line)
  for (const f of fails) console.log(`        ${f}`)
  appendFileSync(LOG, `\n## ${g} — exit=${code}\n${fails.join('\n')}\n${tally}\n`)
  appendFileSync(LOG.replace(/\.log$/, '-full.log'), `\n\n######## ${g} exit=${code}\n${text}`)
}
appendFileSync(LOG, `\n# BILAN\n${summary.join('\n')}\n`)
console.log(`\n${summary.join('\n')}`)
