import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * BC — captures de travail (pas une porte) : un build de démonstration local,
 * des écrans à une largeur donnée, une action facultative.
 *
 *   SHOTS="farms:/coordinator/farms:hidden" WIDTH=390 bun run scripts/bcshot.ts
 *   … ACT=scroll | ACT=filters | ACT=status   SKIP_BUILD=1 pour réutiliser dist-bcdemo
 */
const DIST = process.env.DIST ?? 'dist-bcdemo'
const PORT = Number(process.env.PORT ?? 5433)
const OUT = process.env.OUT ?? 'docs/screenshots/bc/work'
const WIDTH = Number(process.env.WIDTH ?? 390)
const HEIGHT = Number(process.env.HEIGHT ?? 844)
const ACT = process.env.ACT ?? ''
const THEME = process.env.THEME ?? 'light'
mkdirSync(OUT, { recursive: true })

if (process.env.SKIP_BUILD !== '1') {
  const b = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', DIST], { env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }, stdout: 'ignore', stderr: 'pipe' })
  if ((await b.exited) !== 0) throw new Error(await new Response(b.stderr).text())
}
const serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'ignore' })
const base = `http://localhost:${PORT}`
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(base, { signal: AbortSignal.timeout(800) })).ok) break
  } catch {
    /* pas encore */
  }
  await Bun.sleep(300)
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
try {
  for (const spec of (process.env.SHOTS ?? 'farms:/coordinator/farms:hidden').split(',')) {
    const [name, hash, mode] = spec.split(':')
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, hasTouch: true, isMobile: WIDTH < 768, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: THEME === 'dark' ? 'dark' : 'light' })
    const key = hash.split('/').filter(Boolean)[1] ?? ''
    await ctx.addInitScript(([k, m, th]) => {
      try {
        if (m) localStorage.setItem(`lo-yanum:map-mode:${k}`, m)
        localStorage.setItem('lo-yanum:theme:coordinator', th)
      } catch {
        /* rien */
      }
    }, [key, mode ?? '', THEME])
    const page = await ctx.newPage()
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`${base}/?s=${Date.now()}#${hash}`, { waitUntil: 'load' })
    await page.waitForTimeout(2200)
    if (ACT === 'scroll') {
      await page.evaluate(() => window.scrollTo(0, 700))
      await page.waitForTimeout(500)
    }
    if (ACT === 'filters') {
      await page.locator('[data-testid="filter-sheet-open"]').first().click()
      await page.waitForTimeout(500)
    }
    if (ACT === 'status') {
      await page.locator('[data-testid="status-sheet-open"]').first().click()
      await page.waitForTimeout(500)
    }
    const file = `${OUT}/${name}-${WIDTH}${ACT ? `-${ACT}` : ''}${THEME === 'dark' ? '-sombre' : ''}.png`
    await page.screenshot({ path: file })
    console.log(`  ${file}${errors.length ? `  ⚠ ${errors.join(' | ')}` : ''}`)
    await ctx.close()
  }
} finally {
  await browser.close()
  serve.kill()
}
