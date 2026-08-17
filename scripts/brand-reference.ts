import * as fs from 'node:fs'
import { chromium } from 'playwright'

/**
 * Capture the reference screenshots that back docs/brand-artzenu.md (Lot 0.8 E1).
 *
 * The palette itself is extracted from the site's real Elementor CSS, not from
 * pixels — but a written charter with no pictures cannot be checked by a human,
 * and "the CTA is a 30 px orange pill" is a claim that has to be verifiable.
 * Run it again if artzenu.org.il is redesigned.
 */

const OUT = 'docs/brand'
const PAGES = [
  { name: 'artzenu-home', url: 'https://artzenu.org.il/' },
  { name: 'artzenu-settlement', url: 'https://artzenu.org.il/settlement/' },
]

fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })

for (const p of PAGES) {
  await page.goto(p.url, { waitUntil: 'networkidle', timeout: 60_000 })
  // Elementor animates sections in on scroll; walk the page so nothing stays
  // at opacity 0 in the capture, then come back to the top.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 90))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(1200)
  // JPEG on purpose: these are photographic reference plates, and a full-page
  // PNG of a site built on landscape photography is ~5 MB of repo for no gain.
  await page.screenshot({
    path: `${OUT}/${p.name}-hero.jpg`,
    type: 'jpeg',
    quality: 78,
  })
  await page.screenshot({
    path: `${OUT}/${p.name}-full.jpg`,
    type: 'jpeg',
    quality: 68,
    fullPage: true,
  })
  console.log(`  ${p.name}`)
}

await browser.close()
console.log(`\n  Reference captures written to ${OUT}/`)
