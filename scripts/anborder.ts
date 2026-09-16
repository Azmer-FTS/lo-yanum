import { chromium } from 'playwright'
/**
 * AN4 — MESURE : un bord parasite autour de la carte, par mode et par largeur.
 * Pour chaque mode (hidden, split, full, plein écran de l'outil carte) et chaque
 * largeur, capture et lit les colonnes de pixels du bord droit et du bord bas
 * de la zone carte : une colonne uniforme d'une couleur qui n'est pas celle de
 * la carte = une bordure.
 * BASE=<url> bun run scripts/anborder.ts
 */
const base = process.env.BASE ?? 'http://localhost:5173'
const OUT = process.env.SHOTS ?? 'docs/an/border'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
for (const [w, h] of [[402, 874], [1032, 1376], [1376, 1032]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 800 })
  const p = await ctx.newPage()
  await p.goto(`${base}/#/coordinator`); await p.waitForTimeout(1500)
  await p.goto(`${base}/#/coordinator/farms`); await p.waitForTimeout(5000)
  for (const mode of ['split', 'full', 'hidden', 'tool-fullscreen']) {
    if (mode === 'tool-fullscreen') {
      await p.locator('[data-testid="map-mode-split"]').first().click().catch(() => {})
      await p.waitForTimeout(800)
      await p.goto(`${base}/#/coordinator/farms/farm-07`); await p.waitForTimeout(5000)
      const fs = p.locator('[data-testid="map-tool-fullscreen"]:visible').first()
      if (!(await fs.count())) { console.log(`  ${w}×${h} ${mode}: pas de bouton`); continue }
      await fs.click(); await p.waitForTimeout(2000)
    } else {
      const btn = p.locator(`[data-testid="map-mode-${mode}"]`).first()
      if (!(await btn.count())) { console.log(`  ${w}×${h} ${mode}: pas de bouton`); continue }
      await btn.click(); await p.waitForTimeout(1500)
    }
    const info = await p.evaluate(() => {
      const canvas = document.querySelector('.maplibregl-canvas') as HTMLElement | null
      const vw = window.innerWidth, vh = window.innerHeight
      const r = canvas?.getBoundingClientRect()
      // Ce qui dessine un trait (border, outline, box-shadow en inset, ou un fond) dans la bande droite de la carte.
      const hits: string[] = []
      if (r) {
        const xs = [r.right - 1, r.right - 3, Math.min(vw - 1, r.right + 1), Math.min(vw - 1, r.right + 6)]
        for (const x of xs) for (const y of [r.top + r.height * 0.3, r.top + r.height * 0.7]) {
          for (const el of document.elementsFromPoint(x, y)) {
            const cs = getComputedStyle(el)
            const bs = ['Right', 'Left', 'Top', 'Bottom'].map((s) => `${s}:${cs.getPropertyValue(`border-${s.toLowerCase()}-width`)}`).filter((t) => !t.endsWith(':0px')).join(',')
            const tag = `${el.tagName.toLowerCase()}.${(el.className && typeof el.className === 'string' ? el.className : '').split(' ').slice(0, 3).join('.')}`
            if (bs || (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') || cs.boxShadow !== 'none') hits.push(`${Math.round(x)}: ${tag} border[${bs}] outline[${cs.outlineWidth} ${cs.outlineStyle}] shadow[${cs.boxShadow.slice(0, 40)}]`)
          }
        }
      }
      const edges = r ? { right: vw - r.right, bottom: vh - r.bottom, left: r.left, top: r.top } : null
      return { edges, vw, vh, canvas: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null, hits: [...new Set(hits)] }
    })
    const shot = `${OUT}/${w}x${h}-${mode}.png`
    await p.screenshot({ path: shot })
    console.log(`  ${w}×${h} ${mode}: canvas ${JSON.stringify(info.canvas)} / viewport ${info.vw}×${info.vh} marges ${JSON.stringify(info.edges)}`)
    for (const hh of info.hits) console.log(`      ${hh}`)
  }
  await ctx.close()
}
await b.close()
