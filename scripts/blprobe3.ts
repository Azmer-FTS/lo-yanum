import { check, finish, go, open, seed, serveBuild } from './ayharness'
import { FakeDb } from './fake-supabase'
const APP = await serveBuild(process.env.DIST ?? 'dist-bl-before', 5533, false)
const SH = 'private/bl/before'
for (const base of ['vector', 'satellite']) for (const zoom of [8, 10]) {
  const db = new FakeDb(); seed(db)
  const o = await open(1440, { db, height: 900, touch: false, init: { 'lo-yanum:map-base': base } })
  await go(o.page, APP, '/coordinator/settings/regions', 6000)
  await o.page.locator('[data-testid="region-pick-negev"]').scrollIntoViewIfNeeded()
  await o.page.locator('[data-testid="region-pick-negev"]').click()
  await o.page.waitForTimeout(1500)
  // centre map on node 2
  const n2 = await o.page.evaluate(async (z) => {
    const m = (window as any).__loYanumMap
    return { z: m.getZoom() }
  }, zoom)
  const nb = await o.page.locator('[data-testid="editor-node-2"]').boundingBox()
  const c = { x: nb!.x + nb!.width / 2, y: nb!.y + nb!.height / 2 }
  await o.page.evaluate(({ c, z }) => { const m = (window as any).__loYanumMap; const r = m.getContainer().getBoundingClientRect(); const ll = m.unproject([c.x - r.left, c.y - r.top]); m.jumpTo({ center: ll, zoom: z }) }, { c, z: zoom })
  await o.page.waitForTimeout(2500)
  const road = await o.page.evaluate(() => {
    const m = (window as any).__loYanumMap
    const r = m.getContainer().getBoundingClientRect()
    let best: any = null; let n = 0
    for (const f of m.querySourceFeatures('protomaps', { sourceLayer: 'roads' })) {
      n++
      const g = f.geometry; const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
      for (const l of lines) for (let i = 1; i < l.length; i++) {
        const a = m.project(l[i - 1]); const b = m.project(l[i])
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
        if (Math.hypot(a.x - b.x, a.y - b.y) > 40 && mx > 200 && mx < r.width - 200 && my > 200 && my < r.height - 300) {
          const d = Math.hypot(mx - r.width / 2, my - r.height / 2)
          if (!best || d < best.d) best = { ax: a.x + r.left, ay: a.y + r.top, bx: b.x + r.left, by: b.y + r.top, d }
        }
      }
    }
    return { best, n }
  })
  console.log(base, zoom, 'road features', road.n, 'candidate', !!road.best)
  if (!road.best) { await o.ctx.close(); continue }
  await o.page.locator('[data-testid="editor-menu"]').click()
  await o.page.locator('[data-testid="editor-snap"]').click()
  await o.page.waitForTimeout(300)
  const R = road.best
  const len = Math.hypot(R.bx - R.ax, R.by - R.ay); const nx = -(R.by - R.ay) / len, ny = (R.bx - R.ax) / len
  const tx = (R.ax + R.bx) / 2 + nx * 9, ty = (R.ay + R.by) / 2 + ny * 9
  const p = await o.page.locator('[data-testid="editor-node-2"]').boundingBox()
  await o.page.mouse.move(p!.x + p!.width / 2, p!.y + p!.height / 2); await o.page.mouse.down(); await o.page.mouse.move(tx, ty, { steps: 12 }); await o.page.mouse.up()
  await o.page.waitForTimeout(600)
  const q = await o.page.locator('[data-testid="editor-node-2"]').boundingBox()
  const qx = q!.x + q!.width / 2, qy = q!.y + q!.height / 2
  const dist = Math.abs((R.bx - R.ax) * (R.ay - qy) - (R.ax - qx) * (R.by - R.ay)) / len
  console.log(base, zoom, 'dropped 9px off → distance to road after release', dist.toFixed(2), 'px')
  await o.page.screenshot({ path: `${SH}/snap-${base}-z${zoom}.png` })
  await o.ctx.close()
}
check('p', true); await finish()
