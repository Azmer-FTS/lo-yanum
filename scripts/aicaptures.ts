import { chromium } from 'playwright'
import type { Page } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AI10 — LES CAPTURES DE LA PASSE, SUR LE DÉPLOYÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aicaptures
 *   BASE_URL=http://localhost:5341 bun run aicaptures   (à blanc, build local)
 *
 * Clair et sombre, iPad portrait, iPad paysage, iPhone : l'itinéraire de huit
 * étapes AVEC SON TRACÉ SUR ROUTE (carte et liste), la saisie, l'écran des
 * réglages en haut et au milieu (barre épinglée), « תצוגה » avec la ligne de
 * mesure du thème, et « נתוני הדגמה ובדיקה ».
 *
 * ★ ET DES MESURES SUR LE BUNDLE SERVI, QUI FONT ÉCHOUER LE SCRIPT : le tracé
 *   est calculé sur route (A173), aucune requête ne sort de l'origine pendant
 *   toute la série (A179), la barre des réglages est épinglée (A185).
 */
const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = process.env.OUT_DIR ?? 'docs/screenshots/aipass/deployed'
mkdirSync(OUT, { recursive: true })

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const
const THEMES = ['light', 'dark'] as const

const STOPS = [
  'https://waze.com/ul?ll=31.56414%2C34.84146',
  'https://www.google.com/maps/@31.61226,34.89577,15z',
  '31.62991, 34.9551',
  'https://maps.google.com/?q=31.53344,34.91357',
  '31.68681 34.88674',
  'https://waze.com/ul?ll=31.67041%2C34.94772',
  '31.512, 34.93505',
  'https://www.google.com/maps/@31.69687,34.91279,14z',
].join('\n')

let taken = 0
let failed = 0
let checks = 0
let checkFails = 0
function check(label: string, ok: boolean, detail = ''): void {
  checks++
  if (!ok) checkFails++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const origin = new URL(BASE).host
const outside: string[] = []

async function goto(page: Page, url: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
      return
    } catch (error) {
      if (attempt === 2) throw error
      await page.waitForTimeout(1500)
    }
  }
}

async function openSection(page: Page, block: string): Promise<void> {
  const folded = page.locator(`[data-block="${block}"][data-open="0"] [data-testid="block-${block}"]`)
  if ((await folded.count()) === 1) {
    await folded.click()
    await page.waitForTimeout(400)
  }
}

const browser = await chromium.launch()
try {
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        locale: 'he-IL',
      })
      ctx.on('request', (r) => {
        try {
          const host = new URL(r.url()).host
          if (host && host !== origin) outside.push(r.url())
        } catch {
          /* data: / blob: */
        }
      })
      await ctx.addInitScript((t) => {
        if (sessionStorage.getItem('ai-seeded')) return
        for (const role of ['coordinator', 'volunteer', 'driver', 'farmer']) localStorage.setItem(`lo-yanum:theme:${role}`, t)
        sessionStorage.setItem('ai-seeded', '1')
      }, theme)
      const page = await ctx.newPage()
      const shot = async (name: string) => {
        await page.screenshot({ path: `${OUT}/${vp.name}-${theme}-${name}.png` })
        taken++
        console.log(`  ✓ ${vp.name} ${theme} ${name}`)
      }
      try {
        // --- AI2 : l'itinéraire de huit étapes, sur route -----------------
        await goto(page, `${BASE}/#/coordinator`)
        await page.waitForTimeout(1500)
        await goto(page, `${BASE}/#/coordinator/route/free`)
        await page.waitForSelector('[data-testid="position-link"]', { timeout: 30_000 })
        await page.waitForTimeout(1500)
        const field = page.locator('[data-testid="position-link"]').first()
        await field.fill(STOPS)
        await field.press('Enter')
        await page.waitForSelector(
          '[data-testid="free-route-road-status"][data-state="routed"], [data-testid="free-route-road-status"][data-state="unavailable"]',
          { timeout: 90_000 },
        )
        const state = await page.getAttribute('[data-testid="free-route-road-status"]', 'data-state')
        const ms = await page.getAttribute('[data-testid="free-route-road-status"]', 'data-ms')
        check(`A173 · ${vp.name} ${theme} · déployé : le tracé est calculé sur route`, state === 'routed', `${state} · ${ms} ms`)
        await page.waitForTimeout(5000)
        await shot('ai2-itineraire-carte')

        // La liste des étapes, avec distances, durées « כ־ » et vol d'oiseau.
        await page.locator('[data-testid="free-route-totals"]').scrollIntoViewIfNeeded()
        await page.waitForTimeout(800)
        await shot('ai3-itineraire-liste')

        // --- AI5 : la saisie, un lien non lu gardé avec son motif -----------
        await field.scrollIntoViewIfNeeded()
        await field.fill('31.25, 34.79\nhttps://maps.app.goo.gl/AbCdEf')
        await field.press('Enter')
        await page.waitForTimeout(900)
        await shot('ai5-saisie')

        // --- AI7 : les réglages -------------------------------------------
        await goto(page, `${BASE}/#/coordinator/settings`)
        await page.waitForSelector('[data-testid="settings-toc"]', { timeout: 30_000 })
        await page.waitForTimeout(2000)
        await shot('ai7-reglages-haut')

        await page.locator('[data-testid="settings-toc-map"]').click()
        await page.waitForTimeout(2200)
        const pinned = await page.evaluate(() => {
          const nav = document.querySelector('[data-testid="settings-toc"]') as HTMLElement
          const r = nav.getBoundingClientRect()
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          return { top: Math.round(r.top), onTop: hit !== null && nav.contains(hit), active: nav.getAttribute('data-active') }
        })
        check(
          `A185 · ${vp.name} ${theme} · déployé : barre épinglée et section en cours`,
          pinned.top >= 0 && pinned.top <= 140 && pinned.onTop && pinned.active === 'map',
          JSON.stringify(pinned),
        )
        await shot('ai7-reglages-milieu')

        // --- AI6 : « תצוגה » et la ligne de mesure du thème ------------------
        await openSection(page, 'settings-display')
        await page.locator('[data-testid="theme-diagnostic"]').scrollIntoViewIfNeeded()
        await page.evaluate(() => window.scrollBy(0, -160))
        await page.waitForTimeout(900)
        await shot('ai6-affichage-theme')

        // --- AI8 : les données d'essai et de démonstration -------------------
        await page.locator('[data-testid="settings-toc-data"]').click()
        await page.waitForTimeout(1500)
        await openSection(page, 'settings-sample-data')
        await page.waitForTimeout(600)
        await shot('ai8-donnees')
      } catch (error) {
        failed++
        console.log(`  ✗ ${vp.name} ${theme} — ${String(error).slice(0, 160)}`)
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}

check('A179 · déployé : aucune requête hors de l’origine pendant toute la série', outside.length === 0, outside.slice(0, 3).join(' | '))
console.log('')
console.log(`  ${taken} captures, ${failed} échecs · mesures ${checks - checkFails}/${checks}`)
console.log(`  → ${OUT}/`)
process.exit(failed > 0 || checkFails > 0 ? 1 : 0)
