import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

import { finish, go, open, serveBuild } from './ayharness'

/**
 * ★★ BM (chantier 1) — LES FRONTIÈRES À L'ŒIL : avant (BL) / après (BM), même cadrage.
 *
 * Deux builds de l'application, qui ne diffèrent QUE par `sea.json` et `abroad.json` :
 *   dist-bm-before (les masques de BL) · dist-bm-after (ceux de BM).
 * Sur chacun, la couche « אזורים » d'une carte de l'application (les 13 régions LIVRÉES de la
 * base factice, jamais celles du PO), fond SATELLITE : l'aplat s'arrête là où le masque coupe.
 * Le trait rouge fin est la frontière d'OpenStreetMap à pleine résolution (la référence), le même
 * sur les deux images ; le trait jaune (lieux de côte) est le trait de côte d'OSM.
 *
 *   SKIP_BUILD=1 bun run scripts/bmimg.ts      → docs/bm/img/*.jpg
 */
const BEFORE = await serveBuild('dist-bm-before', 5561, false)
const AFTER = await serveBuild('dist-bm-after', 5562, false)
const OUT = 'docs/bm/img'
const RAW = 'private/bm/img-raw'
mkdirSync(RAW, { recursive: true })

type Pt = [number, number]
const geo = JSON.parse(readFileSync('geodata/osm-borders.json', 'utf8')) as { zones: Record<string, number[][][][]>; coast: Pt[][] }

interface View { label: string; lat: number; lng: number; zoom: number }
interface Place { key: string; title: string; views: View[]; line: 'border' | 'coast' }
const PLACES: Place[] = [
  {
    key: 'jourdain',
    title: 'Le Jourdain, du Kinneret à la mer Morte (du nord au sud)',
    line: 'border',
    views: [
      { label: 'Yarmouk et Naharayim', lat: 32.635, lng: 35.575, zoom: 13.2 },
      { label: 'Vallée de Beit Shean', lat: 32.47, lng: 35.565, zoom: 13.2 },
      { label: 'Nord de la vallée (Bezeq)', lat: 32.34, lng: 35.555, zoom: 13.2 },
      { label: 'Le pire écart de BL : 667 m', lat: 32.1769, lng: 35.5535, zoom: 13.2 },
      { label: 'Adam (Damiya)', lat: 32.1, lng: 35.545, zoom: 13.2 },
      { label: 'Gilgal', lat: 31.95, lng: 35.535, zoom: 13.2 },
      { label: 'Qasr al-Yahud, jusqu’à la mer Morte', lat: 31.82, lng: 35.545, zoom: 13.2 },
    ],
  },
  {
    key: 'gaza',
    title: 'La bande de Gaza',
    line: 'border',
    views: [
      { label: 'Toute la bande', lat: 31.41, lng: 34.4, zoom: 10.6 },
      { label: 'Erez et Zikim (nord)', lat: 31.575, lng: 34.53, zoom: 13.2 },
      { label: 'Nahal Oz (est)', lat: 31.47, lng: 34.49, zoom: 13.2 },
      { label: 'Kerem Shalom (sud)', lat: 31.24, lng: 34.28, zoom: 13.2 },
    ],
  },
  {
    key: 'syrie',
    title: 'La ligne syrienne (cessez-le-feu du Golan)',
    line: 'border',
    views: [
      { label: 'Toute la ligne', lat: 33.02, lng: 35.8, zoom: 10.3 },
      { label: 'Hermon et Majdal Shams', lat: 33.27, lng: 35.8, zoom: 13 },
      { label: 'Quneitra', lat: 33.12, lng: 35.83, zoom: 13 },
      { label: 'Sud du plateau', lat: 32.86, lng: 35.85, zoom: 13 },
      { label: 'Le Yarmouk, à l’est de Hamat Gader', lat: 32.735, lng: 35.74, zoom: 13 },
    ],
  },
  {
    key: 'cote',
    title: 'Le trait de côte',
    line: 'coast',
    views: [
      { label: 'Haïfa, le Kishon (pire écart au nord : 61 m)', lat: 32.815, lng: 35.025, zoom: 13.5 },
      { label: 'Herzliya, la marina (centre : 176 m)', lat: 32.163, lng: 34.795, zoom: 14 },
      { label: 'Ashdod, le port', lat: 31.825, lng: 34.645, zoom: 13.5 },
      { label: 'Zikim, au nord de Gaza (168 m)', lat: 31.6, lng: 34.505, zoom: 14 },
      { label: 'Eilat (137 m)', lat: 29.545, lng: 34.965, zoom: 13.5 },
    ],
  },
]

const W = 760
const layers = JSON.stringify({ __v: 2, regions: true, regionColors: true, entities: false })
async function shoot(base: string, tag: string, place: Place): Promise<string[]> {
  const o = await open(1440, { height: 900, init: { 'lo-yanum:map-layers': layers, 'lo-yanum:map-base': 'satellite' } })
  await go(o.page, base, '/coordinator/farms', 8000)
  await o.page.waitForFunction(() => !!(window as unknown as { __loYanumMap?: unknown }).__loYanumMap, null, { timeout: 30_000 })
  const files: string[] = []
  for (const [i, v] of place.views.entries()) {
    await o.page.evaluate(
      ({ v, line, ref }) => {
        type M = {
          jumpTo(o: { center: [number, number]; zoom: number }): void
          getSource(id: string): { setData(d: unknown): void } | undefined
          addSource(id: string, s: unknown): void
          addLayer(l: unknown): void
          getLayer(id: string): unknown
        }
        const m = (window as unknown as { __loYanumMap: M }).__loYanumMap
        if (!m.getSource('bm-ref')) {
          m.addSource('bm-ref', { type: 'geojson', data: { type: 'FeatureCollection', features: ref.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } })) } })
          m.addLayer({ id: 'bm-ref', type: 'line', source: 'bm-ref', paint: { 'line-color': line === 'coast' ? '#facc15' : '#ef4444', 'line-width': 1.6, 'line-dasharray': [3, 2] } })
        }
        m.jumpTo({ center: [v.lng, v.lat], zoom: v.zoom })
      },
      { v, line: place.line, ref: refLines(place.line) },
    )
    await o.page.waitForFunction(
      () => {
        const m = (window as unknown as { __loYanumMap: { loaded(): boolean; areTilesLoaded(): boolean } }).__loYanumMap
        return m.loaded() && m.areTilesLoaded()
      },
      null,
      { timeout: 45_000 },
    ).catch(() => undefined)
    await o.page.waitForTimeout(1200)
    const box = await o.page.evaluate(() => {
      const c = (window as unknown as { __loYanumMap: { getContainer(): HTMLElement } }).__loYanumMap.getContainer().getBoundingClientRect()
      return { x: c.x, y: c.y, width: c.width, height: c.height }
    })
    const f = `${RAW}/${place.key}-${i}-${tag}.png`
    await o.page.screenshot({ path: f, clip: box })
    files.push(f)
  }
  await o.ctx.close()
  return files
}

/** La référence dessinée par-dessus : la frontière terrestre d'OSM, ou son trait de côte. */
function refLines(kind: 'border' | 'coast'): Pt[][] {
  if (kind === 'coast') return geo.coast
  return Object.values(geo.zones).flatMap((z) => z.flatMap((poly) => poly)) as Pt[][]
}

for (const place of PLACES) {
  const before = await shoot(BEFORE, 'avant', place)
  const after = await shoot(AFTER, 'apres', place)
  const b64 = (f: string) => readFileSync(f).toString('base64')
  const rows = place.views
    .map(
      (v, i) => `<div class="row"><div class="lbl">${v.label}</div><div class="pair">
<figure><figcaption>Avant (BL, grille de 150 m)</figcaption><img src="data:image/png;base64,${b64(before[i])}"></figure>
<figure><figcaption>Après (BM, polygones OSM, 2 m)</figcaption><img src="data:image/png;base64,${b64(after[i])}"></figure></div></div>`,
    )
    .join('')
  const legend = place.line === 'coast' ? 'Pointillé jaune : le trait de côte d’OpenStreetMap. La couleur s’arrête là où l’application coupe la mer.' : 'Pointillé rouge : la frontière d’OpenStreetMap à pleine résolution. La couleur s’arrête là où l’application coupe la région.'
  const html = `<html><head><style>body{margin:0;background:#fff;font:15px -apple-system,sans-serif;color:#111}h1{font-size:24px;margin:18px 20px 4px}p{margin:0 20px 14px;color:#444}
.row{margin:0 20px 18px}.lbl{font-weight:600;font-size:17px;margin-bottom:6px}.pair{display:flex;gap:12px}figure{margin:0}figcaption{font-size:13px;color:#555;margin-bottom:3px}img{width:${W}px;height:auto;display:block;border:1px solid #ccc}</style></head>
<body><h1>${place.title} — avant / après</h1><p>${legend}</p>${rows}</body></html>`
  writeFileSync(`${RAW}/${place.key}.html`, html)
  const br = await chromium.launch()
  const pg = await br.newPage({ viewport: { width: 2 * W + 60, height: 800 } })
  await pg.setContent(html)
  await pg.waitForTimeout(500)
  await pg.screenshot({ path: `${OUT}/${place.key}-avant-apres.jpg`, type: 'jpeg', quality: 85, fullPage: true })
  await br.close()
  console.log(`${place.key} : ${place.views.length} vues`)
}
await finish()
