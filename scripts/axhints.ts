import { chromium } from 'playwright'
const PORT = 5404
const serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', 'dist-axdemo', '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'ignore', cwd: '/Users/clyoapple/Desktop/CLAUDE PROJECT/LO YANOUM' })
const APP = `http://localhost:${PORT}`
for (let i = 0; i < 100; i++) { try { if ((await fetch(APP)).ok) break } catch {} await Bun.sleep(300) }
const b = await chromium.launch()
const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })).newPage()
const routes = (process.env.ROUTES ?? '/coordinator,/coordinator/agenda,/coordinator/farms,/coordinator/leads,/coordinator/institutions,/coordinator/volunteers,/coordinator/drivers,/coordinator/coverage,/coordinator/route,/coordinator/route/free,/coordinator/missions,/coordinator/incidents,/coordinator/add,/coordinator/settings,/coordinator/export,/coordinator/import/farms,/coordinator/import/portal,/coordinator/import/institutions,/coordinator/missions/new').split(',')
for (const r of routes) {
  await page.goto(`${APP}/?h=${Date.now()}#${r}`)
  await page.waitForTimeout(2500)
  const found = await page.evaluate(() => {
    const out: string[] = []
    for (const el of document.querySelectorAll('main p, main span.muted, main span.block, main [class*="text-micro"], main [class*="text-caption"]')) {
      const e = el as HTMLElement
      if (e.closest('[data-info-panel]') || e.closest('[role="dialog"]') || e.closest('table') || e.closest('li')) continue
      const r = e.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      const cs = getComputedStyle(e)
      const muted = e.classList.contains('muted') || cs.color !== getComputedStyle(document.body).color
      const txt = (e.innerText || '').trim()
      if (txt.length > 80 && muted && e.children.length < 3) out.push(txt.slice(0, 90))
    }
    return [...new Set(out)]
  })
  console.log(`\n${r}  (${found.length})`)
  for (const f of found) console.log('   · ' + f)
}
await b.close(); serve.kill()
