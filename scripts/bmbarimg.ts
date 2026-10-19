import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

import { finish, go, open, serveBuild } from './ayharness'

/**
 * ★★ BM (chantier 2) — LA BARRE, AVANT / APRÈS, DANS LES TROIS TAILLES DE L'IPAD.
 *
 * Deux builds : `BEFORE` (la barre de BL : dist-bm-after = chantier 1 seul) et `AFTER` (BM).
 * Même écran (les régions, « בקעת הירדן » ouverte), mêmes tailles : l'iPad plein écran (1 032) et en
 * écran partagé (678, 507). Une image par taille, avant à gauche, après à droite, coupées au même
 * endroit sous le haut de la carte.
 *
 *   BEFORE=dist-bm-after AFTER=dist-bmui bun run scripts/bmbarimg.ts  → docs/bm/img/barre-*.jpg
 */
const before = await serveBuild(process.env.BEFORE ?? 'dist-bm-after', 5566, false)
const after = await serveBuild(process.env.AFTER ?? 'dist-bmui', 5567, false)
const RAW = 'private/bm/bar'
mkdirSync(RAW, { recursive: true })

async function shot(base: string, w: number, tag: string): Promise<{ file: string; mapTop: number; blockH: number }> {
  const o = await open(w, { height: 1366, touch: true })
  await go(o.page, base, '/coordinator/settings/regions', 6000)
  if (await o.page.locator('[data-testid="region-picker"]').count()) await o.page.locator('[data-testid="region-picker"]').click()
  await o.page.locator('[data-testid="region-pick-jordan-valley"]').click({ timeout: 20_000 })
  await o.page.waitForTimeout(1500)
  const r = await o.page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap: { getContainer(): HTMLElement } }).__loYanumMap.getContainer().getBoundingClientRect()
    return { mapTop: m.top }
  })
  const file = `${RAW}/${tag}-${w}.png`
  await o.page.screenshot({ path: file, clip: { x: 0, y: 0, width: w, height: 900 } })
  await o.ctx.close()
  return { file, mapTop: Math.round(r.mapTop), blockH: 0 }
}

const br = await chromium.launch()
for (const w of [1032, 678, 507]) {
  const a = await shot(before, w, 'avant')
  const b = await shot(after, w, 'apres')
  const img = (f: string) => `data:image/png;base64,${readFileSync(f).toString('base64')}`
  const html = `<html><body style="margin:0;background:#fff;font:600 18px -apple-system,sans-serif;color:#111;padding:16px">
<div style="font-size:22px;margin-bottom:10px">iPad ${w === 1032 ? 'plein écran' : 'en écran partagé'} — ${w} px de large</div>
<div style="display:flex;gap:16px;align-items:flex-start">
<div><div style="margin-bottom:6px">Avant (BL) — la carte commence à ${a.mapTop} px</div><img src="${img(a.file)}" style="width:${Math.min(w, 620)}px;border:1px solid #ccc"></div>
<div><div style="margin-bottom:6px">Après (BM) — la carte commence à ${b.mapTop} px</div><img src="${img(b.file)}" style="width:${Math.min(w, 620)}px;border:1px solid #ccc"></div>
</div></body></html>`
  const pg = await br.newPage({ viewport: { width: 2 * Math.min(w, 620) + 60, height: 900 } })
  await pg.setContent(html)
  await pg.waitForTimeout(400)
  await pg.screenshot({ path: `docs/bm/img/barre-${w}-avant-apres.jpg`, type: 'jpeg', quality: 85, fullPage: true })
  await pg.close()
  console.log(`${w} : la carte commence à ${a.mapTop} px avant, ${b.mapTop} px après`)
}
await br.close()
await finish()
