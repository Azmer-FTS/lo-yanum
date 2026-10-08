import { chromium } from 'playwright'
import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
const APP = process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const db = new FakeDb(); db.seed()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'he-IL' })
await installFakeSupabase(ctx, db); await installFakeSession(ctx)
const page = await ctx.newPage()
for (const r of [process.env.R ?? '/coordinator/route/free']) {
await page.goto(`${APP}/?p=${Date.now()}#${r}`, { waitUntil: 'load' }); await page.waitForTimeout(5000)
console.log(await page.evaluate(() => {
  const map = document.querySelector('.maplibregl-map')!
  const out: string[] = []
  let e: Element | null = map
  while (e && e !== document.body) { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); out.push(`${e.tagName}.${String(e.className).slice(0, 90)} top=${Math.round(r.top)} h=${Math.round(r.height)} pos=${cs.position} ov=${cs.overflowY} mt=${cs.marginTop}`); e = e.parentElement }
  const tall = [...document.querySelectorAll('body *')].filter((x) => { const r = x.getBoundingClientRect(); return r.bottom > innerHeight + 2 && r.height > 0 }).slice(0, 8).map((x) => `${x.tagName}.${String(x.className).slice(0, 60)} b=${Math.round(x.getBoundingClientRect().bottom)}`)
  return out.join('\n') + '\n--- overflow:\n' + tall.join('\n') + `\nscrollH=${document.documentElement.scrollHeight}`
}))
}
await browser.close()
