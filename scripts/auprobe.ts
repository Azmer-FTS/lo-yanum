import { chromium } from 'playwright'
import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'

// AU1 — sonde de reproduction : navigateur de BUREAU (pas d'écran tactile).
const APP = process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum'
const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0]) as Array<Record<string, unknown>>
const ENGINE = process.env.ENGINE ?? "chromium"
const { webkit, firefox } = await import("playwright")
const browser = await ({ chromium, webkit, firefox } as any)[ENGINE].launch(ENGINE === "chromium" ? { args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] } : {})
for (const touch of [false]) for (const [w, h] of [[1440, 900]]) {
  const db = new FakeDb(); db.seed(); for (const r of ROWS) db.rows('entities').push({ ...r })
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: false, locale: 'he-IL' })
  await installFakeSupabase(ctx, db); await installFakeSession(ctx)
  const page = await ctx.newPage(); const errs: string[] = []
  page.on('pageerror', (e) => errs.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)) })
  for (const route of ['/coordinator/farms', `/coordinator/farms/${ROWS[0].id}`, '/coordinator/route/free']) {
    await page.goto(`${APP}/?p=${Date.now()}#${route}`, { waitUntil: 'load' }); await page.waitForTimeout(5000)
    const m = await page.evaluate(() => ({
      domMarkers: document.querySelectorAll('.maplibregl-marker').length,
      canvases: document.querySelectorAll('canvas.maplibregl-canvas').length,
      popups: document.querySelectorAll('.maplibregl-popup').length,
      sh: document.documentElement.scrollHeight, ih: innerHeight,
      maps: [...document.querySelectorAll('.maplibregl-map')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)] }),
    }))
    console.log(touch ? 'TOUCH' : 'MOUSE', w, route.padEnd(40), JSON.stringify(m))
    if (!touch && w === 1440) await page.screenshot({ path: `docs/au/probe-${ENGINE}-${route.split('/').pop()}-${w}.png` })
  }
  if (errs.length) console.log('   errors:', errs.slice(0, 5))
  await ctx.close()
}
await browser.close()
