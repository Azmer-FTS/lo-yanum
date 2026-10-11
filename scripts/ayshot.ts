import { chromium } from 'playwright'

/**
 * AY — une capture rapide du jumeau pour REGARDER ce qu'on vient de faire.
 *
 *   bun run scripts/ayshot.ts <nom> <route> [largeur=402] [clic=sélecteur] [sombre=0]
 *   DIST=dist-aydemo (par défaut) · BASE_URL=… pour le déployé
 *
 * Écrit `docs/screenshots/aypass/look/<nom>-<largeur>.png`. Ce n'est pas une
 * porte : c'est l'œil.
 */
const [name, route, w = '402', click = '', dark = '0'] = process.argv.slice(2)
const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const DIST = process.env.DIST ?? 'dist-aydemo'
const PORT = Number(process.env.PORT ?? 5431)
let serve: ReturnType<typeof Bun.spawn> | null = null
let base = REMOTE
if (!base) {
  serve = Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', DIST, '--port', String(PORT), '--strictPort'], { stdout: 'ignore', stderr: 'ignore' })
  base = `http://localhost:${PORT}`
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base)).ok) break
    } catch {
      /* pas encore */
    }
    await Bun.sleep(200)
  }
}
const width = Number(w)
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width, height: width >= 1300 ? 900 : width >= 1000 ? 1376 : 874 }, hasTouch: width < 700, locale: 'he-IL', timezoneId: 'Asia/Jerusalem', colorScheme: dark === '1' ? 'dark' : 'light' })
const p = await ctx.newPage()
p.on('pageerror', (e) => console.log('pageerror', e.message))
await p.goto(`${base}/?s=${Date.now()}#${route}`, { waitUntil: 'load' })
await p.waitForTimeout(3000)
for (const c of click.split('||').filter(Boolean)) {
  await p.locator(c).first().click({ timeout: 5000 }).catch((e) => console.log('clic raté', c, (e as Error).message.split('\n')[0]))
  await p.waitForTimeout(1200)
}
const out = `docs/screenshots/aypass/look/${name}-${width}${dark === '1' ? '-sombre' : ''}.png`
await p.screenshot({ path: out })
console.log(out)
await b.close()
serve?.kill()
