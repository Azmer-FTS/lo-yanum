import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { createLandmark, updateLandmark, _raw } from '../src/core/store'
import { isPinNameValid } from '../src/core/landmarks'
import { MAPPINGS } from '../src/data/rows'

/**
 * AV — PORTE PURE : A324 (dans le domaine et la base) · A326 (dans le code).
 *   bun run avpass
 */
let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

console.log('\n  A324 — pas d’épingle sans nom, à chaque étage')
check('A324 nom vide refusé', !isPinNameValid('') && !isPinNameValid('   ') && isPinNameValid('א'))
const n0 = _raw().landmarks.length
check('A324 createLandmark("  ") ne crée rien', createLandmark({ name: '  ', position: { lat: 31, lng: 34.5 } }) === null && _raw().landmarks.length === n0)
const made = createLandmark({ name: ' שער ', position: { lat: 31, lng: 34.5 } })
check('A324 un nom est gardé, sans ses espaces', made?.name === 'שער')
updateLandmark(made!.id, { name: '' })
check('A324 renommer en vide est refusé', _raw().landmarks.find((l) => l.id === made!.id)?.name === 'שער')
const mig = readFileSync('supabase/migrations/20261008000300_av_landmarks.sql', 'utf8')
check('A324 la BASE refuse aussi un nom vide (check)', /check \(length\(btrim\(name\)\) > 0\)/.test(mig))
check('A324 la table naît avec ses grant, rien pour anon', /grant select, insert, update, delete on public\.landmarks to authenticated/.test(mig) && /revoke all on public\.landmarks from anon/.test(mig))
const round = MAPPINGS.landmarks.fromRows(MAPPINGS.landmarks.toRows(made!)[0].rows[0] as never, {} as never)
check('A324 aller-retour ligne ↔ repère identique', JSON.stringify(round) === JSON.stringify(made))

console.log('\n  A326 — un repère n’entre dans AUCUN compteur')
const COUNTERS = ['src/core/activity.ts', 'src/core/report.ts', 'src/core/fields.ts', 'src/core/coverage.ts', 'src/core/prospection.ts', 'src/ui/report/activityText.ts', 'src/ui/report/activityDraw.ts']
for (const f of COUNTERS) check(`A326 ${f} ne lit pas les repères`, !/landmark/i.test(readFileSync(f, 'utf8')))
const callers: string[] = []
function walk(dir: string) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(n) && /getLandmarks\(/.test(readFileSync(p, 'utf8'))) callers.push(p)
  }
}
walk('src')
check('A326 seule la carte (MapCanvas) lit les repères', callers.every((p) => /MapCanvas\.tsx|access\.ts/.test(p)), callers.join(', '))

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
