/**
 * ★★ Y — EVERY GATE SCRIPT PARSES.
 *
 *   bun run parse
 *
 * ⚠️ THIS EXISTS BECAUSE A DEPLOY FAILED ON A REDECLARED VARIABLE (2026-09-04).
 *    Y8 added a section to `backdrop.ts` that reused two names already bound at
 *    the top level of the file. Nothing local caught it:
 *
 *      · `bun x tsc --noEmit` includes `src` and `vite.config.ts` and NOT
 *        `scripts` — the gates have never been typechecked, and bringing them
 *        under `tsc` today surfaces 111 pre-existing errors (mostly a missing
 *        `@types/bun`), which is a cleanup and not this pass;
 *      · and the gate itself was written and then not RUN, which is the actual
 *        mistake and no tool can fix.
 *
 *    So this is the narrow guard for the narrow failure: every file under
 *    `scripts/` is handed to Bun's own parser — the one that rejected it in CI
 *    — and a binding error is reported here in under a second instead of eight
 *    minutes into a deploy. It is deliberately NOT a typecheck.
 */
import { readdirSync } from 'node:fs'

const transpiler = new Bun.Transpiler({ loader: 'ts' })
const files = readdirSync('scripts')
  .filter((f) => f.endsWith('.ts'))
  .sort()

let failed = 0
for (const file of files) {
  const source = await Bun.file(`scripts/${file}`).text()
  try {
    transpiler.transformSync(source)
  } catch (error) {
    failed++
    console.log(`  FAIL  scripts/${file}`)
    console.log(`        ${String(error).split('\n').slice(0, 4).join('\n        ')}`)
  }
}

console.log('')
console.log(`  ${files.length - failed} of ${files.length} gate scripts parse`)
process.exit(failed === 0 ? 0 : 1)
