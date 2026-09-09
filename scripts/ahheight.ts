import { chromium } from 'playwright'

/**
 * ★★ AH1.7 · A158 — LA HAUTEUR DU FORMULAIRE DE FERME, MESURÉE.
 *
 *   OUT=dist-ahbefore PORT=5261 bun run scripts/ahheight.ts
 *
 * Une seule question, posée aux trois largeurs : combien de hauteurs d'écran
 * fait le formulaire de création d'une ferme, sections repliées comme le PO
 * les trouve à l'ouverture. C'est le chiffre d'A30 (plafond six) et c'est
 * celui que le PO a décrit par « interminable sur iPad ».
 */
const OUT = process.env.OUT ?? 'dist-ahpass'
const PORT = Number(process.env.PORT ?? 5261)
const VIEWPORTS = [
  { name: 'iPhone 402', width: 402, height: 874 },
  { name: 'iPad portrait 1032', width: 1032, height: 1376 },
  { name: 'iPad paysage 1376', width: 1376, height: 1032 },
]

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
if (process.env.SKIP_BUILD !== '1') {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], {
    env, stdout: 'ignore', stderr: 'pipe',
  })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

const browser = await chromium.launch()
console.log('')
console.log(`  A158 — hauteur du formulaire de ferme (${OUT})`)
console.log('  ================================================')
try {
  for (const v of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height } })
    const page = await ctx.newPage()
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForTimeout(700)
    await page.goto(`${base}/#/coordinator/farms/new`, { waitUntil: 'load' })
    await page.waitForTimeout(2600)
    const measure = () => page.evaluate(() => {
      const doc = document.scrollingElement as HTMLElement
      /* La colonne du formulaire défile elle-même au-delà du point de rupture
         de `MapSplit` ; en dessous, c'est la page. On prend le plus grand des
         deux, qui est toujours celui qui défile. */
      let col = 0
      for (const el of Array.from(document.querySelectorAll('main, main *'))) {
        const e = el as HTMLElement
        if (e.scrollHeight > e.clientHeight + 4 && e.clientHeight > 200) {
          col = Math.max(col, e.scrollHeight)
        }
      }
      const sections = document.querySelectorAll('.form-grid').length
      return {
        page: doc.scrollHeight,
        col,
        viewport: window.innerHeight,
        sections,
      }
    })
    const folded = await measure()
    /* ★ ET LA MESURE QUI COMPTE EST CELLE DU PO : il OUVRE les sections
       repliées pour saisir le ת״ז et le סוג הישות, et c'est là qu'il a trouvé
       le formulaire interminable. Les deux chiffres sont donnés. */
    const toggles = page.locator('[data-testid^="section-farm-form"]')
    const n = await toggles.count()
    for (let i = 0; i < n; i++) {
      const b = toggles.nth(i)
      if ((await b.getAttribute('aria-expanded')) === 'false') await b.click()
    }
    await page.waitForTimeout(900)
    const open = await measure()
    const one = (m: { page: number; col: number }) => Math.max(m.page, m.col)
    console.log(
      `  ${v.name.padEnd(20)}  repliées ${String(one(folded)).padStart(5)} px (${(one(folded) / v.height).toFixed(2)} écrans)` +
        `   ·   ouvertes ${String(one(open)).padStart(5)} px (${(one(open) / v.height).toFixed(2)} écrans)`,
    )
    await ctx.close()
  }
} finally {
  await browser.close()
  serve.kill()
}
console.log('')
