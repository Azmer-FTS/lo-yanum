import type { Page } from 'playwright'

import { REMOTE, go, open, seed, serveBuild } from './ayharness'
import { FakeDb } from './fake-supabase'

/* BI — exploration : quel état d'appareil empêche les formes d'être dessinées ? */
const APP = REMOTE ?? (await serveBuild(process.env.DIST ?? 'dist-biexplore', 5496, process.env.SKIP_BUILD !== '1'))
const FARM = 'farm-ak1-11'

function db2(): FakeDb {
  const d = new FakeDb()
  seed(d)
  const f = d.rows('entities').find((r) => r.id === FARM)!
  const at = new Date().toISOString()
  const ring = (id: string, kind: string, n: number, rLat: number, rLng: number) => {
    d.rows('zones').push({ id, entity_id: FARM, kind, created_at: at, updated_at: at })
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      d.rows('zone_vertices').push({ zone_id: id, position: i, lat: (f.lat as number) + rLat * Math.sin(a), lng: (f.lng as number) + rLng * Math.cos(a) })
    }
  }
  ring('zone-bi-1', 'farm_boundary', 31, 0.0016, 0.0023)
  ring('zone-bi-2', 'grazing_area', 29, 0.016, 0.018)
  d.cascades.set('zones', [{ table: 'zone_vertices', fk: 'zone_id' }])
  return d
}

const probe = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: any }).__loYanumMap
    if (!m) return { map: false }
    const src = m.getSource('zones')
    const feats = src?._data?.features ?? []
    const layers = (m.getStyle()?.layers ?? []).map((l: any) => l.id)
    let rendered = -1
    try {
      rendered = m.getLayer('zones-line') ? m.queryRenderedFeatures({ layers: ['zones-line'] }).length : -2
    } catch (e) {
      rendered = -3
    }
    return {
      map: true,
      source: !!src,
      features: feats.length,
      vertices: feats.map((f: any) => f.geometry.coordinates[0].length - 1),
      hasFill: layers.includes('zones-fill'),
      hasLine: layers.includes('zones-line'),
      rendered,
      zoom: Math.round(m.getZoom() * 10) / 10,
      theme: document.documentElement.getAttribute('data-theme'),
      ls: localStorage.getItem('lo-yanum:map-layers'),
    }
  })

const variants: Array<{ name: string; dark?: boolean; init?: Record<string, string>; width?: number }> = [
  { name: 'base 1440' },
  { name: 'theme dark (compte)', dark: true, init: { 'lo-yanum:theme:coordinator': 'dark' } },
  { name: 'theme absent + compte dark', init: {} },
  { name: 'couches limites/pâturage éteintes', init: { 'lo-yanum:map-layers': JSON.stringify({ boundaries: false, grazing: false }) } },
  { name: 'satellite', init: { 'lo-yanum:map-base': 'satellite' } },
  { name: 'mode full', init: { 'lo-yanum:map-mode:farm-detail': 'full' } },
  { name: '1920', width: 1920 },
]

for (const v of variants) {
  const d = db2()
  if (v.name.includes('compte')) {
    d.rows('user_settings').push({ user_id: 'gate-user', updated_at: new Date().toISOString(), data: { 'lo-yanum:theme:coordinator': JSON.stringify('dark') } })
  }
  const o = await open(v.width ?? 1440, { db: d, dark: v.dark, init: v.init })
  if (v.name === 'theme absent + compte dark') await o.page.addInitScript(() => localStorage.removeItem('lo-yanum:theme:coordinator'))
  await go(o.page, APP, `/coordinator/farms/${FARM}`, 7000)
  console.log(v.name.padEnd(36), JSON.stringify(await probe(o.page)), o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
}
process.exit(0)
