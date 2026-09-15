import { webkit } from 'playwright'
import type { Browser, Page } from 'playwright'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

/**
 * AJ0 — A189 · A190 · A191 SUR LE DÉPLOYÉ, AVEC UN VRAI DÉPLOIEMENT AU MILIEU.
 *
 * `ajupdate` bascule un serveur local ; celui-ci attend un vrai déploiement
 * GitHub Pages (CDN, `max-age=600`, ETag) PENDANT que l'app reste ouverte :
 *
 *   1  attend que le déployé serve `FROM` (le commit du correctif) ;
 *   2  ouvre l'app installée (WebKit, `standalone`) sur le jumeau et sur l'app
 *      réelle, vérifie la version imprimée, le bouton des cartes sans
 *      rechargement, et télécharge l'archive depuis le jumeau ;
 *   3  NE FERME RIEN, et simule un retour en avant-plan toutes les 30 s
 *      jusqu'à ce qu'un autre commit soit servi (poussé entre-temps) ;
 *   4  bandeau, bouton, version appliquée — sur les deux URLs.
 *
 *   FROM=f94c32a bun run scripts/ajdeployed.ts
 */

const FROM = process.env.FROM ?? ''
const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const SHOTS = path.resolve(import.meta.dir, '../docs/screenshots/ajpass/deployed')
mkdirSync(SHOTS, { recursive: true })
const TIMEOUT_MIN = Number(process.env.TIMEOUT_MIN ?? 50)

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
const stamp = () => new Date().toISOString().slice(11, 19)

async function served(url: string): Promise<string> {
  try {
    const r = await fetch(`${url}/version.json?t=${Date.now()}`, { cache: 'no-store' })
    return r.ok ? ((await r.json()) as { id: string }).id : `http ${r.status}`
  } catch (e) {
    return `error ${e}`
  }
}

async function returnToForeground(page: Page): Promise<void> {
  await page.evaluate(() => {
    const flip = (value: string) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    flip('hidden')
    flip('visible')
  })
}

async function openInstalled(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({ locale: 'he-IL', viewport: { width: 1024, height: 1366 } })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, get: () => true })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(30_000)
  await page.goto(url, { waitUntil: 'load' })
  return page
}

const txt = async (page: Page, sel: string) =>
  ((await page.locator(sel).first().textContent({ timeout: 3000 }).catch(() => null)) ?? '').trim()

for (;;) {
  const id = await served(`${BASE}/demo`)
  if (id === FROM && (await served(BASE)) === FROM) break
  console.log(`  ${stamp()} waiting for ${FROM} to be served (demo: ${id})`)
  await Bun.sleep(30_000)
}
console.log(`  ${stamp()} ${FROM} is served on both URLs`)

const browser = await webkit.launch()
try {
  const demo = await openInstalled(browser, `${BASE}/demo/#/coordinator/settings`)
  const real = await openInstalled(browser, `${BASE}/`)
  await demo.evaluate(() => ((window as unknown as { __aj: number }).__aj = 1))
  await real.evaluate(() => ((window as unknown as { __aj: number }).__aj = 1))

  const button = await demo.waitForSelector('[data-testid="download-map"]', { timeout: 20_000 }).then(() => true).catch(() => false)
  check('A191 · déployé · bouton des cartes au premier lancement, sans rechargement', button)
  if (button) {
    await demo.locator('[data-testid="download-map"]').click()
    await demo
      .waitForFunction(() => {
        const el = document.querySelector('[data-testid="download-map"]') as HTMLButtonElement | null
        return el !== null && !/%/.test(el.textContent ?? '') && !el.disabled
      }, undefined, { timeout: 600_000, polling: 1000 })
      .catch(() => {})
    const held = await demo.evaluate(async () => {
      const cache = await caches.open('lo-yanum-basemap')
      const keys = await cache.keys()
      const hit = keys[0] ? await cache.match(keys[0]) : undefined
      return hit ? (await hit.blob()).size : 0
    })
    check('A191 · déployé · archive entière depuis l’app installée', held === 94_268_129, `${(held / 1e6).toFixed(1)} MB`)
  }
  await demo.evaluate(() => document.querySelector('[data-testid="app-version"]')?.scrollIntoView({ block: 'center' }))
  const shown = await txt(demo, '[data-testid="app-version-id"]')
  check('A190 · déployé · la version imprimée est le commit servi', shown === FROM, shown)
  check('A190 · déployé · avec sa date', /\d{2}.\d{2}.\d{4}/.test(await txt(demo, '[data-testid="app-version-date"]')))
  await demo.locator('[data-testid="app-version-check"]').click()
  await demo.waitForSelector('[data-testid="app-version-result"][data-kind="current"]', { timeout: 15_000 }).catch(() => {})
  const current = await txt(demo, '[data-testid="app-version-result"]')
  check('A190 · déployé · recherche manuelle : « à jour »', current.includes(FROM) && /מעודכנת/.test(current), current)
  await demo.screenshot({ path: path.join(SHOTS, 'a190-version-avant.png') })

  // ---- the app sleeps; a new deploy lands; return to the foreground ----
  const deadline = Date.now() + TIMEOUT_MIN * 60_000
  let next = FROM
  let banner = false
  while (Date.now() < deadline) {
    await Bun.sleep(30_000)
    await returnToForeground(demo)
    await returnToForeground(real)
    await Bun.sleep(5000)
    next = await served(`${BASE}/demo`)
    banner = (await demo.locator('[data-testid="update-banner"][data-state="available"]').count()) === 1
    console.log(`  ${stamp()} served=${next} banner=${banner} running=${await txt(demo, '[data-testid="app-version-id"]')}`)
    if (banner && next !== FROM && (await served(BASE)) === next) break
  }
  const body = await txt(demo, '[data-testid="update-banner-body"]')
  check('A189 · déployé · nouvelle version détectée au retour en avant-plan, bandeau', banner && body.includes(next), body)
  const sameDemo = await demo.evaluate(() => (window as unknown as { __aj?: number }).__aj === 1)
  check('A189 · déployé · sans que l’app ait été fermée ni rechargée', sameDemo)
  await demo.screenshot({ path: path.join(SHOTS, 'a189-bandeau-jumeau.png') })

  await Bun.sleep(6000)
  await returnToForeground(real)
  const realBanner = await real.waitForSelector('[data-testid="update-banner"][data-state="available"]', { timeout: 20_000 }).then(() => true).catch(() => false)
  check('A189 · déployé · app réelle (écran de connexion) : le bandeau aussi', realBanner, await txt(real, '[data-testid="update-banner-body"]'))
  await real.screenshot({ path: path.join(SHOTS, 'a189-bandeau-app-reelle.png') })

  for (const [label, page] of [['jumeau', demo], ['app réelle', real]] as const) {
    if ((await page.locator('[data-testid="update-apply"]').count()) === 0) continue
    await Promise.all([
      page.waitForEvent('load', { timeout: 60_000 }).catch(() => null),
      page.locator('[data-testid="update-apply"]').click(),
    ])
    await page.waitForSelector('[data-testid="update-banner"]', { timeout: 30_000 }).catch(() => {})
    const state = await page.getAttribute('[data-testid="update-banner"]', 'data-state').catch(() => null)
    const reloaded = await page.evaluate(() => (window as unknown as { __aj?: number }).__aj === undefined)
    check(`A189 · déployé · ${label} : le bouton applique réellement ${next}`, reloaded && state === 'applied',
      `${state} · ${await txt(page, '[data-testid="update-banner-body"]')}`)
    await page.screenshot({ path: path.join(SHOTS, `a189-applique-${label === 'jumeau' ? 'jumeau' : 'app-reelle'}.png`) })
  }
  await demo.evaluate(() => document.querySelector('[data-testid="app-version"]')?.scrollIntoView({ block: 'center' }))
  const after = await txt(demo, '[data-testid="app-version-id"]')
  const record = await txt(demo, '[data-testid="app-version-applied"]')
  check('A190 · déployé · les réglages impriment la nouvelle version et l’inscrivent', after === next && record.includes(FROM) && record.includes(next), `${after} · ${record}`)
  await demo.screenshot({ path: path.join(SHOTS, 'a190-version-apres.png') })
} finally {
  await browser.close()
}

console.log(`\n  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
