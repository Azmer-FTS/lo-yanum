import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AO4 — LES CAPTURES DU DÉPLOYÉ, AVEC LES VINGT-CINQ EXPLOITATIONS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aocaptures                                        # l'app DÉPLOYÉE
 *   BASE_URL=http://localhost:5197 OUT=… bun run aocaptures
 *
 * ★★ LE BUNDLE EST CELUI QUI EST SERVI ; LA BASE EST FACTICE, ET LES DONNÉES
 *    SONT LES VRAIES. `lo-yanum-prod` n'est pas joignable depuis cette
 *    session (le compte Supabase du MCP a changé — voir ETAT.md §AO0), donc
 *    les 25 lignes d'AO1 sont servies au bundle déployé par `FakeDb`, dans la
 *    forme EXACTE que `docs/ao/ao1-prod.sql` écrira en base. Ce qui est montré
 *    est donc ce que le PO verra le jour où le SQL sera joué, à la ligne près.
 *
 *   1  la liste des exploitations : vingt-cinq, avec les deux statuts neufs
 *   2  la fiche « גד״ש להב » : « לא רלוונטי כרגע » et sa raison
 *   3  le rapport d'activité, ouvert, PREMIER rapport (pas de comparaison)
 *   4  le même après un rapport précédent : l'évolution
 *   5  la période libre
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const OUT = process.env.OUT ?? 'docs/screenshots/aopass/deployed'
mkdirSync(OUT, { recursive: true })

const { farms, pairing } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0])
const LAHAV = farms.find((f) => f.name === 'גד״ש להב')!.id
console.log(
  `  ${ROWS.length} exploitations servies au bundle déployé (${pairing.updates.length} mises à jour, ${pairing.creations.length} créations)`,
)

/** Le rapport « précédent » qui rend la comparaison visible sur la capture. */
const PREVIOUS = [
  {
    id: 'ao-capture-precedent',
    period: { id: 'custom', from: '2026-08-01', to: '2026-08-31' },
    generatedAt: '2026-08-31T18:00:00.000Z',
    previousId: null,
    totals: {
      farms: 15,
      offCount: 0,
      cultivatedDunams: 1100,
      grazingDunams: 53000,
      weightedDunams: 2160,
      targetWeighted: 100000,
      targetPercent: 2,
      signed: 3,
      signedWithDocuments: 0,
      signedAwaitingDocuments: 3,
      contacts: 15,
    },
    farms: [],
    body: 'הדוח של אוגוסט',
  },
]

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-paysage', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
]

let shots = 0
let errors = 0
const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})

async function shot(page: Page, file: string) {
  await page.screenshot({ path: `${OUT}/${file}.png` })
  shots++
}

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    const db = new FakeDb()
    db.seed()
    /* ⚠️ La base factice ne porte QUE les 25 : une capture qui montrerait
       aussi le jeu de démonstration ne prouverait rien sur la reprise. */
    db.rows('entities').length = 0
    for (const r of ROWS) db.rows('entities').push({ ...r })

    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      locale: 'he-IL',
      colorScheme: theme,
    })
    await installFakeSupabase(ctx, db)
    await installFakeSession(ctx)
    await ctx.addInitScript(() => localStorage.setItem('lo-yanum:theme:coordinator', 'system'))
    const page = await ctx.newPage()
    page.on('pageerror', (e) => {
      errors++
      console.log(`  pageerror ${vp.name} ${theme}: ${e.message}`)
    })

    const tag = `${vp.name}-${theme}`
    const go = async (hash: string, settle = 4500) => {
      await page.goto(`${BASE}/?ao=${Date.now()}#${hash}`, { waitUntil: 'load' })
      await page.waitForTimeout(settle)
    }

    await go('/coordinator', 3500)

    await go('/coordinator/farms', 5000)
    await shot(page, `${tag}-1-vingt-cinq-exploitations`)

    await go(`/coordinator/farms/${LAHAV}`, 4000)
    await shot(page, `${tag}-2-lo-relevanti-karega`)

    await go('/coordinator', 4000)
    await page.locator('[data-testid="activity-open"]').click()
    await page.waitForTimeout(1200)
    await shot(page, `${tag}-3-rapport-premier`)

    /* Le même écran, une fois qu'un rapport précédent existe. */
    await page.evaluate((rows) => {
      localStorage.setItem('lo-yanum:activity-reports', JSON.stringify(rows))
    }, PREVIOUS)
    await go('/coordinator', 4000)
    await page.locator('[data-testid="activity-open"]').click()
    await page.waitForTimeout(1400)
    await shot(page, `${tag}-4-rapport-evolution`)

    await page.locator('[data-testid="activity-period-custom"]').click()
    await page.waitForTimeout(500)
    await page.locator('[data-testid="activity-from"]').fill('2026-09-01')
    await page.locator('[data-testid="activity-to"]').fill('2026-09-24')
    await page.waitForTimeout(900)
    await shot(page, `${tag}-5-periode-libre`)

    await ctx.close()
  }
}
await browser.close()
console.log(`  ${shots} captures → ${OUT} · ${errors} erreur(s) de page`)
process.exit(errors === 0 ? 0 : 1)
