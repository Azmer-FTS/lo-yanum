import { chromium, webkit } from 'playwright'
import type { BrowserContext, Page } from 'playwright'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AJ0 — A189 · A190 · A191 : LA VERSION INSTALLÉE SE MET À JOUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux builds RÉELS du même arbre, A et B, qui ne diffèrent que par leur
 * identité (`LO_YANUM_BUILD_ID`). Un serveur qui imite GitHub Pages
 * (`cache-control: max-age=600` et un ETag, mesurés au curl sur le déployé)
 * sert A, puis bascule sur B pendant que la page reste ouverte : c'est le
 * déploiement pendant que l'app dort sur l'écran d'accueil.
 *
 *   A191  premier lancement de l'app installée (contexte neuf, `standalone`),
 *         SANS AUCUN RECHARGEMENT : le bouton de téléchargement des cartes
 *         apparaît, et l'archive entière arrive dans le cache.
 *   A190  la version et sa date sont imprimées ; « חיפוש עדכון עכשיו » dit
 *         « à jour » quand c'est vrai, applique quand ce ne l'est pas, et
 *         nomme l'échec quand il n'y a pas de réseau ou que le serveur refuse.
 *   A189  B est déployé ; retour en avant-plan SANS fermer l'app ; le bandeau
 *         apparaît, RESTE, et son bouton fait vraiment tourner B.
 *
 * Moteurs : WebKit (celui de l'iPad) puis Chromium.
 *
 * ★ LE ROUGE AVANT CORRECTIF : `DIST_A=dist-aj-before bun run ajupdate`, où
 *   `dist-aj-before` est un build du commit d'avant AJ. Sans `DIST_B`, B en est
 *   une copie dont seul `index.html` change (ce build-là n'a pas d'identité).
 *
 *   bun run ajupdate                 (construit dist-aj-a et dist-aj-b)
 *   SKIP_BUILD=1 bun run ajupdate    (les réutilise)
 *   ENGINES=webkit bun run ajupdate
 */

const ROOT = path.resolve(import.meta.dir, '..')
const PORT = Number(process.env.PORT ?? 5351)
const SHOTS = path.join(ROOT, 'docs/screenshots/ajpass/local')
mkdirSync(SHOTS, { recursive: true })
const ENGINES = (process.env.ENGINES ?? 'webkit,chromium').split(',')
const SKIP_DOWNLOAD = process.env.SKIP_DOWNLOAD === '1'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

async function build(outDir: string, id: string): Promise<void> {
  const proc = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', outDir], {
    cwd: ROOT,
    env: { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', LO_YANUM_BUILD_ID: id },
    stdout: 'ignore',
    stderr: 'pipe',
  })
  if ((await proc.exited) !== 0) {
    console.error(await new Response(proc.stderr).text())
    throw new Error(`vite build failed for ${outDir}`)
  }
}

let DIST_A = path.join(ROOT, process.env.DIST_A ?? 'dist-aj-a')
let DIST_B = path.join(ROOT, process.env.DIST_B ?? 'dist-aj-b')
const BEFORE = Boolean(process.env.DIST_A) && !process.env.DIST_B
const ID_A = BEFORE ? '(sans identité)' : 'aj-a'
const ID_B = BEFORE ? '(sans identité)' : 'aj-b'

if (BEFORE) {
  DIST_B = `${DIST_A}-b`
  rmSync(DIST_B, { recursive: true, force: true })
  cpSync(DIST_A, DIST_B, { recursive: true, filter: (s) => !s.includes(`${path.sep}basemap${path.sep}`) })
  const html = readFileSync(path.join(DIST_A, 'index.html'), 'utf8')
  writeFileSync(path.join(DIST_B, 'index.html'), html.replace('<head>', '<head><meta name="deploy" content="B">'))
} else if (process.env.SKIP_BUILD !== '1') {
  console.log('  building A and B… (two real production builds of this tree)')
  await build(path.basename(DIST_A), ID_A)
  await build(path.basename(DIST_B), ID_B)
}

// ------------------------------------------------------------------ server --
let root = DIST_A
let versionStatus = 200
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
}
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    let p = decodeURIComponent(new URL(req.url).pathname)
    if (p.endsWith('/')) p += 'index.html'
    if (p.endsWith('/version.json') && versionStatus !== 200) {
      return new Response('refused', { status: versionStatus })
    }
    // One archive on disk for both deploys, as on Pages.
    const dir = p.includes('/basemap/') ? DIST_A : root
    const file = path.join(dir, p)
    if (!existsSync(file) || statSync(file).isDirectory()) return new Response('not found', { status: 404 })
    const st = statSync(file)
    const tag = `"${Math.round(st.mtimeMs).toString(16)}-${st.size.toString(16)}-${root === DIST_A ? 'a' : 'b'}"`
    const headers = {
      'cache-control': 'max-age=600',
      etag: tag,
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    }
    if (req.headers.get('if-none-match') === tag) return new Response(null, { status: 304, headers })
    return new Response(Bun.file(file), { headers })
  },
})
const BASE = `http://localhost:${PORT}`

// ------------------------------------------------------------------- probes --
/** Return to the foreground without closing: what a resumed iOS app receives. */
async function returnToForeground(page: Page): Promise<void> {
  await page.evaluate(() => {
    const flip = (value: string) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    flip('hidden')
    flip('visible')
    window.dispatchEvent(new Event('focus'))
  })
}

async function text(page: Page, selector: string): Promise<string> {
  return ((await page.locator(selector).first().textContent({ timeout: 2000 }).catch(() => null)) ?? '').trim()
}

async function waitSelector(page: Page, selector: string, ms: number): Promise<boolean> {
  return page
    .waitForSelector(selector, { timeout: ms, state: 'visible' })
    .then(() => true)
    .catch(() => false)
}

/** The settings section is foldable and remembered: open it before reading. */
async function openVersionSection(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelector('[data-testid="app-version"]')?.scrollIntoView({ block: 'center' })
  })
}

async function runEngine(name: string): Promise<void> {
  const engine = name === 'webkit' ? webkit : chromium
  console.log(`\n  ═══ ${name}`)
  root = DIST_A
  versionStatus = 200
  const browser = await engine.launch()
  const context: BrowserContext = await browser.newContext({
    locale: 'he-IL',
    viewport: { width: 1024, height: 1366 },
  })
  // The home-screen app: `navigator.standalone`, which `isStandalone()` reads.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)

  try {
    // ------------------------------------------------------------- A191 ---
    console.log('\n  A191 — first launch of the installed app, never reloaded')
    await page.goto(`${BASE}/#/coordinator/settings`, { waitUntil: 'load' })
    await page.evaluate(() => {
      ;(window as unknown as { __ajNoReload?: number }).__ajNoReload = 1
    })
    const button = await waitSelector(page, '[data-testid="download-map"]', 15_000)
    const stillSamePage = await page.evaluate(() =>
      Boolean((window as unknown as { __ajNoReload?: number }).__ajNoReload),
    )
    check('A191 · le bouton des cartes hors ligne apparaît sans rechargement', button && stillSamePage,
      `bouton=${button} même page=${stillSamePage}`)
    check('A191 · plus de « rechargez » sans moyen de le faire',
      (await page.locator('[data-testid="offline-inactive"]').count()) === 0 &&
        !(await page.evaluate(() => document.body.innerText.includes('יש לרענן את הדף פעם אחת'))))

    if (button && !SKIP_DOWNLOAD) {
      await page.locator('[data-testid="download-map"]').click()
      const done = await page
        .waitForFunction(() => {
          const el = document.querySelector('[data-testid="download-map"]')
          return el !== null && !/%/.test(el.textContent ?? '') && !(el as HTMLButtonElement).disabled
        }, undefined, { timeout: 240_000, polling: 500 })
        .then(() => true)
        .catch(() => false)
      const held = await page.evaluate(async () => {
        const cache = await caches.open('lo-yanum-basemap')
        const keys = await cache.keys()
        const hit = keys[0] ? await cache.match(keys[0]) : undefined
        return hit ? (await hit.blob()).size : 0
      })
      const error = await text(page, '[data-testid="map-error"]')
      check('A191 · l’archive entière est téléchargée depuis l’app installée', done && held === 94_268_129,
        `${(held / 1e6).toFixed(1)} MB${error ? ` · ${error}` : ''}`)
    }
    await page.screenshot({ path: path.join(SHOTS, `${name}-a191-cartes.png`) })

    // ------------------------------------------------------------- A190 ---
    console.log('\n  A190 — version, date, and the manual check')
    await openVersionSection(page)
    const id = await text(page, '[data-testid="app-version-id"]')
    const date = await text(page, '[data-testid="app-version-date"]')
    check('A190 · la version installée est imprimée', id === ID_A, id || 'absente')
    check('A190 · avec sa date', /\d{2}.\d{2}.\d{4}/.test(date), date || 'absente')
    const modeRow = await page.evaluate(() => document.querySelector('[data-testid="app-version"]')?.textContent ?? '')
    check('A190 · et le mode d’ouverture (app installée)', modeRow.includes('אפליקציה מותקנת'))

    const hasCheck = (await page.locator('[data-testid="app-version-check"]').count()) === 1
    if (hasCheck) {
      await page.locator('[data-testid="app-version-check"]').click()
      await page.waitForSelector('[data-testid="app-version-result"][data-kind="current"]', { timeout: 10_000 }).catch(() => {})
      const result = await text(page, '[data-testid="app-version-result"]')
      check('A190 · « à jour » quand c’est vrai, en le nommant', /מעודכנת/.test(result) && result.includes(ID_A), result)

      await context.setOffline(true)
      await page.locator('[data-testid="app-version-check"]').click()
      await page.waitForSelector('[data-testid="app-version-result"][data-kind="error"]', { timeout: 10_000 }).catch(() => {})
      const offline = await text(page, '[data-testid="app-version-result"]')
      check('A190 · sans réseau, il le dit (pas « à jour »)', /אין רשת|השרת לא ענה/.test(offline), offline)
      await context.setOffline(false)

      versionStatus = 500
      await page.waitForTimeout(4500) // past the return-burst throttle
      await page.locator('[data-testid="app-version-check"]').click()
      await page.waitForFunction(() => /500/.test(document.querySelector('[data-testid="app-version-result"]')?.textContent ?? ''), undefined, { timeout: 10_000 }).catch(() => {})
      const refused = await text(page, '[data-testid="app-version-result"]')
      check('A190 · un serveur qui refuse est nommé, avec son code', refused.includes('500'), refused)
      versionStatus = 200
    } else {
      check('A190 · le bouton « חיפוש עדכון עכשיו » existe', false)
    }

    // ------------------------------------------------------------- A189 ---
    console.log('\n  A189 — deploy B while the app sleeps; return to the foreground')
    await page.evaluate(() => {
      ;(window as unknown as { __ajNoReload?: number }).__ajNoReload = 2
    })
    root = DIST_B
    await page.waitForTimeout(4500) // past the throttle, as a real absence would be
    await returnToForeground(page)
    const banner = await waitSelector(page, '[data-testid="update-banner"][data-state="available"]', 10_000)
    const body = await text(page, '[data-testid="update-banner-body"]')
    check('A189 · nouvelle version détectée au retour en avant-plan, bandeau affiché',
      banner && body.includes(ID_B), body || 'aucun bandeau')
    await page.screenshot({ path: path.join(SHOTS, `${name}-a189-bandeau.png`) })
    // Phone width, dark theme: the banner has to hold there too.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.waitForTimeout(400)
    const fits = await page.evaluate(() => {
      const card = document.querySelector('[data-testid="update-banner"] > div') as HTMLElement | null
      const apply = document.querySelector('[data-testid="update-apply"]') as HTMLElement | null
      if (!card || !apply) return { ok: false, detail: 'absent' }
      const r = card.getBoundingClientRect()
      const b = apply.getBoundingClientRect()
      const title = card.querySelector('p') as HTMLElement
      const lines = Math.round(title.getBoundingClientRect().height / parseFloat(getComputedStyle(title).lineHeight))
      return {
        ok: r.left >= 0 && r.right <= window.innerWidth && b.left >= 0 && b.right <= window.innerWidth && b.height >= 36 && lines <= 2,
        detail: `carte ${Math.round(r.left)}–${Math.round(r.right)} / ${window.innerWidth} · bouton ${Math.round(b.width)}×${Math.round(b.height)} · titre sur ${lines} ligne(s)`,
      }
    })
    check('A189 · au téléphone, le bandeau et son bouton tiennent dans l’écran, titre lisible', fits.ok, fits.detail)
    await page.screenshot({ path: path.join(SHOTS, `${name}-a189-bandeau-telephone-sombre.png`) })
    await page.setViewportSize({ width: 1024, height: 1366 })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.waitForTimeout(8000)
    check('A189 · le bandeau reste (ce n’est pas un message qui disparaît)',
      (await page.locator('[data-testid="update-banner"][data-state="available"]').count()) === 1)
    const runningBefore = await page.evaluate(() => (window as unknown as { __ajNoReload?: number }).__ajNoReload)
    check('A189 · rien ne s’est appliqué en silence : la page tourne toujours sur A', runningBefore === 2)

    if (banner) {
      await Promise.all([
        page.waitForEvent('load', { timeout: 30_000 }).catch(() => null),
        page.locator('[data-testid="update-apply"]').click(),
      ])
      await page.waitForSelector('[data-testid="app-version-id"]', { timeout: 20_000 }).catch(() => {})
      await openVersionSection(page)
      const after = await text(page, '[data-testid="app-version-id"]')
      const reloaded = await page.evaluate(() => (window as unknown as { __ajNoReload?: number }).__ajNoReload === undefined)
      check('A189 · le bouton applique réellement B', reloaded && after === ID_B, `version=${after}`)
      const applied = await page.getAttribute('[data-testid="update-banner"]', 'data-state').catch(() => null)
      check('A189 · et le dit après coup', applied === 'applied', String(applied))
      const record = await page.getAttribute('[data-testid="app-version-applied"]', 'data-ok').catch(() => null)
      check('A190 · « עדכון אחרון » l’inscrit dans les réglages', record === '1',
        await text(page, '[data-testid="app-version-applied"]'))
      await page.screenshot({ path: path.join(SHOTS, `${name}-a189-applique.png`) })
      const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller))
      check('A189 · le service worker contrôle toujours la page', controlled)

      // A190 again: a deploy the manual button finds and applies by itself.
      console.log('\n  A190 — the manual check finds a newer deploy and applies it')
      await page.locator('[data-testid="update-close"]').click().catch(() => {})
      root = DIST_A
      await page.waitForTimeout(4500)
      await Promise.all([
        page.waitForEvent('load', { timeout: 30_000 }).catch(() => null),
        page.locator('[data-testid="app-version-check"]').click(),
      ])
      await page.waitForSelector('[data-testid="app-version-id"]', { timeout: 20_000 }).catch(() => {})
      await openVersionSection(page)
      const manual = await text(page, '[data-testid="app-version-id"]')
      const manualRecord = await text(page, '[data-testid="app-version-applied"]')
      check('A190 · recherche manuelle : nouvelle version trouvée ET appliquée', manual === ID_A && manualRecord.includes(ID_B) && manualRecord.includes(ID_A),
        `${manual} · ${manualRecord}`)
      await page.screenshot({ path: path.join(SHOTS, `${name}-a190-manuel.png`) })

      // Nothing about updating may cost the offline shell.
      await context.setOffline(true)
      await page.reload({ waitUntil: 'load' }).catch(() => {})
      const offlineShell = await waitSelector(page, '[data-testid="app-version-id"]', 15_000)
      check('non-régression · après deux mises à jour, l’app s’ouvre toujours hors ligne', offlineShell)
      await context.setOffline(false)
    }
  } finally {
    await browser.close()
  }
}

try {
  for (const name of ENGINES) await runEngine(name)
} finally {
  server.stop(true)
}

console.log(`\n  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
