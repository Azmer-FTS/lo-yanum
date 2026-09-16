import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AN13 — LES CAPTURES DU DÉPLOYÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ancaptures                                   # l'app RÉELLE déployée
 *   BASE_URL=http://localhost:5197 OUT=… bun run ancaptures
 *
 * Les quinze fiches que la base de production a rendues (AK1,
 * `docs/ak/ak1-prod-rows.json`) servies au bundle DÉPLOYÉ par la base factice.
 * Trois largeurs × clair et sombre, le thème du coordinateur sur « לפי
 * המכשיר » (c'est l'appareil, émulé, qui est clair ou sombre) :
 *   1  l'édition de דני בראל (en-tête épinglé, en haut) ;
 *   2  la même, descendue aux personnes (le contact en résumé) ;
 *   3  « פרטים » déplié (סוג המקום, אזור, מועצה) ;
 *   4  la fenêtre de signature À L'OUVERTURE ;
 *   5  le planificateur avec des fermes sans position (dont משק שלם).
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const OUT = process.env.OUT ?? 'docs/screenshots/anpass/deployed-captures'
mkdirSync(OUT, { recursive: true })

const rows = JSON.parse(readFileSync('docs/ak/ak1-prod-rows.json', 'utf8')) as Array<Record<string, unknown>>
const dani = 'farm-ak1-10'
const shalem = rows.find((r) => String(r.name).includes('משק שלם'))?.id as string
const placed = rows.filter((r) => r.position_missing !== true).map((r) => String(r.name))

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-paysage', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
]

let shots = 0
let errors = 0
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })

async function shot(page: Page, file: string) {
  await page.screenshot({ path: `${OUT}/${file}.png` })
  shots++
}

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    const db = new FakeDb()
    db.seed()
    for (const r of rows) db.rows('entities').push({ ...r })
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
    const go = async (hash: string, settle = 5000) => {
      await page.goto(`${BASE}/?an=${Date.now()}#${hash}`, { waitUntil: 'load' })
      await page.waitForTimeout(settle)
    }
    await go('/coordinator', 3500)

    await go(`/coordinator/farms/${dani}/edit`)
    await shot(page, `${tag}-1-edition-daniel-barel`)
    await page.locator('[data-testid="farm-block-people"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await shot(page, `${tag}-2-edition-personnes-entete-epingle`)
    const fold = page.locator('[data-testid^="section-farm-form-details:"][aria-expanded="false"]')
    if (await fold.count()) await fold.first().click()
    await page.locator('[data-testid="farm-council-block"]').scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await shot(page, `${tag}-3-edition-details-un-champ-par-verite`)

    await go(`/coordinator/farms/${dani}`)
    await page.locator('[data-testid="farm-open-assoc-form"]').first().click()
    await page.waitForSelector('[data-testid="assoc-form"]', { timeout: 20000 }).catch(() => undefined)
    await page.waitForTimeout(1500)
    await shot(page, `${tag}-4-signature-a-louverture`)

    await go('/coordinator/route', 6000)
    for (const name of [String(rows.find((r) => r.id === shalem)?.name), String(rows.find((r) => r.id === dani)?.name), ...placed.slice(0, 3)]) {
      const card = page.locator('[data-testid="route-pick"][aria-pressed="false"]', { hasText: name }).first()
      if (await card.count()) await card.click()
    }
    await page.waitForTimeout(6000)
    await shot(page, `${tag}-5-planificateur-sans-position`)
    await page.locator('[data-testid="route-unplaced"]').scrollIntoViewIfNeeded().catch(() => undefined)
    await page.waitForTimeout(600)
    await shot(page, `${tag}-6-planificateur-liste-position-manquante`)
    await ctx.close()
  }
}
await browser.close()
console.log(`  ${shots} captures → ${OUT} · ${errors} erreur(s) de page`)
process.exit(errors === 0 ? 0 : 1)
