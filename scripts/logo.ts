/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★ AF1 (2026-09-09) — LE LOGO DE L'ASSOCIATION, REPRIS À LA SOURCE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le document de signature d'AF1 porte « הסכם התנדבות- ארצנו » et le logo de
 * l'association en tête. Ce logo avait été extrait en Lot 0.8
 * (`docs/brand-artzenu.md` §2) puis SUPPRIMÉ de l'arbre avec l'identité
 * Artzenu en G17 — la charte a été abandonnée, pas le nom de l'association qui
 * signe le document.
 *
 * ★ IL EST BLANC SUR TRANSPARENT, ET C'EST CE QUI DICTE TOUT LE RESTE. Le
 *   fichier de l'association est fait pour son bandeau vert foncé : posé tel
 *   quel sur une page A4 blanche il est invisible. Il n'est donc jamais dessiné
 *   comme une image mais comme un MASQUE — `source-in` avec l'encre de la page
 *   (`agreement/document.ts`), exactement comme `.artzenu-mark` le faisait en
 *   CSS. Le canal alpha est la forme ; la couleur vient du document.
 *
 * ★ RECADRÉ À SON CONTENU. L'original est 2560 × 1440 dont 87 % de vide : sans
 *   recadrage la marque occuperait un tiers de la largeur qu'on lui donne. La
 *   boîte est mesurée sur l'alpha (> 8/255), pas devinée.
 *
 * Relancer : `bun run logo`. Le résultat est versionné dans `public/`, donc
 * l'app n'appelle jamais artzenu.org.il — ni en démo, ni hors ligne.
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const SOURCE = 'https://artzenu.org.il/wp-content/uploads/2023/05/logo-hd-new-colors3.png'
const OUT = fileURLToPath(new URL('../public/artzenu-mark.png', import.meta.url))
/** Assez large pour rester net à 2× A4 (`report/pdf.ts` PAGE.scale). */
const TARGET_W = 640

const response = await fetch(SOURCE)
if (!response.ok) throw new Error(`logo: ${response.status}`)
const b64 = Buffer.from(await response.arrayBuffer()).toString('base64')

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<html><body></body></html>')
const result = await page.evaluate(
  async ({ dataUri, targetW }) => {
    const img = new Image()
    await new Promise((res, rej) => {
      img.onload = res
      img.onerror = rej
      img.src = dataUri
    })
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const ctx = c.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    let x0 = c.width
    let y0 = c.height
    let x1 = -1
    let y1 = -1
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (data[(y * c.width + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
        }
      }
    }
    const w = x1 - x0 + 1
    const h = y1 - y0 + 1
    const k = targetW / w
    const out = document.createElement('canvas')
    out.width = Math.round(w * k)
    out.height = Math.round(h * k)
    const octx = out.getContext('2d')!
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(img, x0, y0, w, h, 0, 0, out.width, out.height)
    return {
      box: [x0, y0, w, h],
      size: [out.width, out.height],
      png: out.toDataURL('image/png'),
    }
  },
  { dataUri: `data:image/png;base64,${b64}`, targetW: TARGET_W },
)
await browser.close()

writeFileSync(OUT, Buffer.from(result.png.split(',')[1], 'base64'))
console.log(
  `logo — boîte de contenu ${result.box.join(' ')} → ${result.size.join(' × ')} px, ` +
    `écrit dans public/artzenu-mark.png`,
)
