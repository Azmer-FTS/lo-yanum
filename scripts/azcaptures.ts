import { mkdirSync } from 'node:fs'

import { FakeDb } from './fake-supabase'
import { REMOTE, check, finish, go, open, section, seed, serveBuild } from './ayharness'
import { buildTestData } from '../src/core/testData'
import { MAPPINGS } from '../src/data/rows'

/**
 * AZ7 — LES CAPTURES : les cinq listes, en TABLEAU (carte masquée) et en
 * VIGNETTES (mode divisé), plus l'aperçu ancré et la garde d'exemple ;
 * clair ET sombre ; 402 · 1032 · 1440 px.
 *
 *   bun run azcaptures                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run azcaptures    # le DÉPLOYÉ
 *   WIDTHS=402 THEMES=dark …                                            # une partie
 *
 * Build réel + base factice (vraies fermes, onze institutions, le jeu d'essai).
 * → docs/screenshots/azpass/<local|deployed>/captures/<liste>-<mode>-<thème>-<largeur>.png
 */
const OUT = process.env.DIST ?? 'dist-azui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5435), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/azpass/${REMOTE ? 'deployed' : 'local'}/captures`
mkdirSync(SHOTS, { recursive: true })
const WIDTHS = (process.env.WIDTHS ?? '402,1032,1440').split(',').map(Number)
const THEMES = (process.env.THEMES ?? 'light,dark').split(',')

const TEST = buildTestData()
function base(): FakeDb {
  const db = new FakeDb()
  seed(db)
  const put = (c: keyof typeof MAPPINGS, items: unknown[]) => {
    const m = MAPPINGS[c] as { toRows: (x: unknown) => Array<{ table: string; rows: Array<Record<string, unknown>> }> }
    for (const it of items) for (const g of m.toRows(it)) for (const r of g.rows) db.rows(g.table).push({ ...r })
  }
  put('institutions', TEST.institutions)
  put('farms', TEST.farms)
  put('farmZones', TEST.farmZones)
  put('anchorPoints', TEST.anchorPoints)
  put('volunteers', TEST.volunteers)
  put('drivers', TEST.drivers)
  put('missions', TEST.missions)
  return db
}

const LISTS: Array<[string, string]> = [
  ['fermes', '/coordinator/farms'],
  ['institutions', '/coordinator/institutions'],
  ['contacts', '/coordinator/leads'],
  ['volontaires', '/coordinator/volunteers'],
  ['gardes', '/coordinator/missions'],
]

section('AZ7 — captures des cinq listes')
let n = 0
for (const theme of THEMES) {
  for (const w of WIDTHS) {
    const o = await open(w, { dark: theme === 'dark', db: base(), init: { 'lo-yanum:theme:coordinator': theme } })
    const tag = `${theme === 'dark' ? 'sombre' : 'clair'}-${w}`
    for (const [name, route] of LISTS) {
      for (const mode of ['hidden', 'split'] as const) {
        await go(o.page, APP, route, 2500)
        await o.page.locator(`[data-testid="map-mode-${mode}"]`).first().click({ timeout: 4000 }).catch(() => undefined)
        await o.page.waitForTimeout(1200)
        await o.page.screenshot({ path: `${SHOTS}/${name}-${mode === 'hidden' ? 'tableau' : 'divise'}-${tag}.png` })
        n++
      }
    }
    // L'aperçu ancré (mode divisé) et la garde d'exemple.
    await go(o.page, APP, '/coordinator/farms', 2500)
    await o.page.locator('[data-testid="map-mode-split"]').first().click({ timeout: 4000 }).catch(() => undefined)
    await o.page.waitForTimeout(900)
    await o.page.locator('[data-tiles] [data-row-open]').first().click({ timeout: 4000 }).catch(() => undefined)
    await o.page.waitForTimeout(1500)
    await o.page.screenshot({ path: `${SHOTS}/fermes-apercu-ancre-${tag}.png` })
    await go(o.page, APP, '/coordinator/missions/test-mission-next', 3000)
    await o.page.screenshot({ path: `${SHOTS}/garde-exemple-${tag}.png` })
    n += 2
    check(`captures ${tag} : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
}
console.log(`  ${n} captures → ${SHOTS}`)
await finish()
