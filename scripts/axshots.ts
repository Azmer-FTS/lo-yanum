import { chromium } from 'playwright'
/** AX — captures rapides d'une liste d'écrans du JUMEAU (avant/après), pour l'œil. */
const DIST = process.env.DIST ?? 'dist-ax-before-demo'
const OUT = process.env.OUT ?? 'docs/ax/avant'
const W = Number(process.env.W ?? 1440)
const PORT = 5403
const ROUTES = (process.env.ROUTES ?? '/coordinator,/coordinator/farms,/coordinator/leads,/coordinator/route,/coordinator/coverage,/coordinator/add,/coordinator/route/free,/coordinator/agenda').split(',')
const serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'ignore' })
const APP = `http://localhost:${PORT}`
for (let i = 0; i < 100; i++) { try { if ((await fetch(APP)).ok) break } catch {} await Bun.sleep(300) }
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: W > 1000 ? 900 : 874 }, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: process.env.DARK ? 'dark' : 'light' })
const page = await ctx.newPage()
await Bun.$`mkdir -p ${OUT}`
for (const r of ROUTES) {
  await page.goto(`${APP}/?s=${Date.now()}#${r}`, { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  if (process.env.CLICK) {
    for (const sel of process.env.CLICK.split('|')) {
      await page.locator(sel).first().click({ timeout: 3000 }).catch(() => console.log(`  (clic impossible : ${sel})`))
      await page.waitForTimeout(900)
    }
  }
  const name = r.replace(/^\/coordinator\/?/, '').replace(/[/?=&]/g, '-') || 'dashboard'
  await page.screenshot({ path: `${OUT}/${name}${process.env.TAG ?? ''}-${W}.png`, fullPage: process.env.FULL === '1' })
  console.log(`  ${r} → ${OUT}/${name}-${W}.png`)
}
await b.close(); serve.kill()
