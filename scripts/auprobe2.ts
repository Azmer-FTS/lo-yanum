import { chromium } from 'playwright'
import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'
// AU1 — l'interrupteur « ישויות » éteint sur CET appareil.
const APP = process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum'
const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0]) as Array<Record<string, unknown>>
const placed = ROWS.find((r) => r.lat != null && !r.position_missing)!
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
for (const off of [false, true]) {
  const db = new FakeDb(); db.seed(); for (const r of ROWS) db.rows('entities').push({ ...r })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
  await installFakeSupabase(ctx, db); await installFakeSession(ctx)
  if (off) await ctx.addInitScript(() => localStorage.setItem('lo-yanum:map-layers', JSON.stringify({ entities: false })))
  const page = await ctx.newPage()
  for (const route of ['/coordinator/farms', `/coordinator/farms/${placed.id}`]) {
    await page.goto(`${APP}/?p=${Date.now()}#${route}`, { waitUntil: 'load' }); await page.waitForTimeout(5000)
    const m = await page.evaluate(() => [...document.querySelectorAll('.maplibregl-marker [data-marker-kind], .maplibregl-marker[data-marker-kind]')].map((e) => (e as HTMLElement).dataset.markerKind))
    console.log(off ? 'OFF' : 'ON ', route.padEnd(36), m.length, JSON.stringify([...new Set(m)]))
    await page.screenshot({ path: `docs/au/probe2-${off ? 'off' : 'on'}-${route.split('/').pop()}.png` })
  }
  await ctx.close()
}
await browser.close()
