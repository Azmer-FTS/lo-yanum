import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AM8 — LES CAPTURES DU DÉPLOYÉ : UNE FERME RÉELLE EN ÉDITION, ET LES ÉPINGLES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run amcaptures                                   # l'app RÉELLE déployée
 *   BASE_URL=http://localhost:5197 OUT=… bun run amcaptures
 *
 * ★ « UNE FERME RÉELLE » : les quinze lignes que la base de production a
 *   rendues à AK1 (`docs/ak/ak1-prod-rows.json`) sont servies au bundle
 *   DÉPLOYÉ par la base factice — le mot de passe du PO n'entre dans aucune
 *   porte (§14.4), mais le code, lui, est exactement celui qu'il ouvre.
 *   `farm-ak1-10` est דני בראל, la fiche du constat d'AM2 ; `farm-ak1-…` avec
 *   une position sert la suggestion de localité.
 *
 * Trois largeurs × clair et sombre : l'édition (en-tête, bloc « פרטים » avec
 * le יישוב, bloc « אנשים »), puis la carte des fermes sur vectoriel et sur
 * satellite.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const OUT = process.env.OUT ?? 'docs/screenshots/ampass/deployed'
mkdirSync(OUT, { recursive: true })

const rows = JSON.parse(readFileSync('docs/ak/ak1-prod-rows.json', 'utf8')) as Array<Record<string, unknown>>
const dani = 'farm-ak1-10'
const placed = rows.find((r) => r.position_missing !== true)?.id as string

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-paysage', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
]

let shots = 0
let errors = 0
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })

async function shot(page: Page, file: string, locator?: string) {
  if (locator) {
    const el = page.locator(locator).first()
    await el.scrollIntoViewIfNeeded().catch(() => undefined)
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: `${OUT}/${file}.png` })
  shots++
}

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    for (const mapBase of ['vector', 'satellite'] as const) {
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
      await ctx.addInitScript(([th, mb]) => {
        localStorage.setItem('lo-yanum:theme:coordinator', th)
        localStorage.setItem('lo-yanum:map-base', mb)
      }, [theme, mapBase])
      const page = await ctx.newPage()
      page.on('pageerror', (e) => {
        errors++
        console.log(`  pageerror ${vp.name} ${theme}: ${e.message}`)
      })
      const tag = `${vp.name}-${theme}`
      await page.goto(`${BASE}/?am=${Date.now()}#/coordinator`, { waitUntil: 'load' })
      await page.waitForTimeout(3500)

      if (mapBase === 'vector') {
        // L'édition de דני בראל : en-tête, « פרטים » (יישוב facultatif), « אנשים ».
        await page.goto(`${BASE}/?am=${Date.now()}#/coordinator/farms/${dani}/edit`, { waitUntil: 'load' })
        await page.waitForTimeout(5000)
        await shot(page, `${tag}-1-edition-daniel-barel`)
        await shot(page, `${tag}-2-edition-yishuv`, '[data-testid="farm-block-details"]')
        await shot(page, `${tag}-3-edition-personnes`, '[data-testid="person-farmer"]')
        // Une ferme positionnée : la localité la plus proche, proposée.
        await page.goto(`${BASE}/?am=${Date.now()}#/coordinator/farms/${placed}/edit`, { waitUntil: 'load' })
        await page.waitForTimeout(5000)
        await shot(page, `${tag}-4-edition-suggestion-localite`, '[data-testid="farm-locality-block"]')
      }
      await page.goto(`${BASE}/?am=${Date.now()}#/coordinator/farms`, { waitUntil: 'load' })
      await page.waitForTimeout(9000)
      await shot(page, `${tag}-5-epingles-${mapBase === 'vector' ? 'vectoriel' : 'satellite'}`)
      await ctx.close()
    }
  }
}
await browser.close()
console.log(`  ${shots} captures → ${OUT} · ${errors} erreur(s) de page`)
process.exit(errors === 0 ? 0 : 1)
