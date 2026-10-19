import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
/** BL — l'image du rapport : la barre d'outils sur iPad, avant (BK) et après (BL, déployé). */
const a = readFileSync('docs/screenshots/bl/avant/ipad-barre-avant.png').toString('base64')
const b = readFileSync(process.env.AFTER ?? 'docs/screenshots/bl/c1-deployed/ipad-barre-apres.png').toString('base64')
const html = `<div style="display:flex;gap:16px;padding:16px;background:#fff;font:600 22px sans-serif">
<div><div style="margin-bottom:8px">Avant (BK) — le panneau flotte en bas de la carte</div><img src="data:image/png;base64,${a}" width="516"></div>
<div><div style="margin-bottom:8px">Après (BL, déployé) — la barre en haut, la carte libre</div><img src="data:image/png;base64,${b}" width="516"></div></div>`
const br = await chromium.launch()
const p = await br.newPage({ viewport: { width: 1080, height: 760 } })
await p.setContent(html)
await p.waitForTimeout(300)
await p.screenshot({ path: 'docs/bl/img/ipad-barre-avant-apres.png', fullPage: true })
await br.close()
