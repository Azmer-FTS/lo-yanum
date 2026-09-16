import { chromium } from 'playwright'
import type { Page } from 'playwright'
/**
 * AN3.3 — MESURE de l'intermittence des trajets, avant correctif.
 * Échantillonne la source `route` de la carte toutes les 100 ms pendant qu'on
 * ajoute des étapes à l'itinéraire libre et qu'on sélectionne des fermes au
 * planificateur. BASE=<url d'un build> bun run scripts/anflicker.ts
 */
const base = process.env.BASE ?? 'http://localhost:5173'
async function feats(page: Page): Promise<string> {
  return page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getSource: (id: string) => { serialize: () => { data: { features?: Array<{ properties: { style: string } }> } } } | undefined } }).__loYanumMap
    try {
      const f = m?.getSource('route')?.serialize().data.features ?? []
      const c: Record<string, number> = {}
      for (const x of f) c[x.properties.style ?? 'plain'] = (c[x.properties.style ?? 'plain'] ?? 0) + 1
      return Object.entries(c).map(([k, v]) => `${k}:${v}`).join(',') || 'VIDE'
    } catch { return 'n/a' }
  })
}
async function sample(page: Page, label: string, ms: number): Promise<void> {
  const seq: string[] = []
  const end = Date.now() + ms
  while (Date.now() < end) { seq.push(await feats(page)); await page.waitForTimeout(100) }
  const runs: string[] = []
  for (const s of seq) if (runs.length === 0 || !runs[runs.length - 1].startsWith(s + ' ×')) runs.push(`${s} ×1`); else { const [k, n] = runs[runs.length - 1].split(' ×'); runs[runs.length - 1] = `${k} ×${Number(n) + 1}` }
  console.log(`  ${label}: ${runs.join('  →  ')}`)
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const page = await (await browser.newContext({ viewport: { width: 1032, height: 1376 } })).newPage()
await page.goto(`${base}/#/coordinator`); await page.waitForTimeout(1500)
await page.goto(`${base}/#/coordinator/route/free`); await page.waitForSelector('[data-testid="position-link"]', { timeout: 30000 }); await page.waitForTimeout(3000)
const STOPS = ['31.56414, 34.84146', '31.61226, 34.89577', '31.62991, 34.9551']
for (const [i, s] of STOPS.entries()) {
  const f = page.locator('[data-testid="position-link"]').first()
  await f.fill(s); await f.press('Enter')
  await sample(page, `itinéraire libre, étape ${i + 1} ajoutée`, 4000)
}
await page.locator('[data-testid="free-route-visit-minutes"]').fill('25')
await sample(page, 'itinéraire libre, durée de visite changée (aucun point ne bouge)', 2000)
for (const m of ['full', 'split', 'hidden', 'split']) {
  const b = page.locator(`[data-testid="map-mode-${m}"]`)
  if (await b.count()) { await b.first().click(); await sample(page, `itinéraire libre, mode ${m}`, 2500) }
}
await page.goto(`${base}/#/coordinator/route`); await page.waitForTimeout(4000)
const farms = page.locator('[data-testid="route-pick"]')
console.log(`  planificateur : ${await farms.count()} fermes sélectionnables`)
for (let i = 0; i < 3 && i < (await farms.count()); i++) {
  await farms.nth(i).click()
  await sample(page, `planificateur, ferme ${i + 1} cochée`, 3000)
}
await browser.close()
