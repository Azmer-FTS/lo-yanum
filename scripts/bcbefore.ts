import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

import { LIST_SCREENS, measureHeader } from './bcmeasure'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BC — L'EN-TÊTE, MESURÉ SUR UNE URL DONNÉE (par défaut : le jumeau DÉPLOYÉ,
 * c'est-à-dire le code d'AVANT BC).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run scripts/bcbefore.ts                                   # jumeau déployé
 *   BASE_URL=http://localhost:5431 OUT=docs/bc/bc-entete-apres.json bun run scripts/bcbefore.ts
 *
 * Pour chaque liste, à 390 × 844 (téléphone) et 820 × 1180 / 1180 × 820
 * (tablette), deux modes : la liste seule (carte masquée) et le mode partagé
 * (le défaut d'un appareil neuf). Voir `bcmeasure.ts` pour la définition.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = process.env.OUT ?? 'docs/bc/bc-entete-avant.json'
const VIEWPORTS = [
  { label: 'phone-390', width: 390, height: 844 },
  { label: 'tablet-820', width: 820, height: 1180 },
  { label: 'tablet-1180', width: 1180, height: 820 },
]
mkdirSync('docs/bc', { recursive: true })

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const out: Array<Record<string, unknown>> = []
for (const vp of VIEWPORTS) {
  for (const mode of ['hidden', 'split'] as const) {
    for (const s of LIST_SCREENS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: vp.width < 768, locale: 'he-IL', timezoneId: 'Asia/Jerusalem' })
      await ctx.addInitScript(([key, m]) => {
        try {
          localStorage.setItem(`lo-yanum:map-mode:${key}`, m)
          localStorage.setItem('lo-yanum:theme:coordinator', 'light')
        } catch {
          /* rien */
        }
      }, [s.key, mode])
      const page = await ctx.newPage()
      page.setDefaultTimeout(10000)
      try {
        await page.goto(`${BASE}/?bc=${Date.now()}#${s.hash}`, { waitUntil: 'load' })
        await page.waitForTimeout(2600)
        const m = await measureHeader(page)
        out.push({ ...m, viewport: vp.label, height: m.viewport, mode, screen: s.name })
        console.log(`  ${vp.label.padEnd(12)} ${mode.padEnd(7)} ${s.name.padEnd(13)} repos ${String(m.rest ?? '—').padStart(4)} px · défilé ${String(m.scrolled ?? '—').padStart(4)} px · données ${m.share ?? '—'} %`)
      } catch (e) {
        console.log(`  ${vp.label} ${mode} ${s.name} — ${(e as Error).message.split('\n')[0]}`)
        out.push({ viewport: vp.label, mode, screen: s.name, error: (e as Error).message.split('\n')[0] })
      }
      await ctx.close()
    }
  }
}
await browser.close()
writeFileSync(OUT, JSON.stringify({ base: BASE, at: new Date().toISOString(), results: out }, null, 2))
console.log(`\n  → ${OUT}`)
