import { chromium } from 'playwright'
import type { Browser } from 'playwright'

import { COLLECTIONS } from '../src/core/backend'
import { MAPPINGS } from '../src/data/rows'
import type { Mapping } from '../src/data/rows'

import { DEMO_PREFIX, demoData } from './demo-data'
import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * A90 — SEED → PURGE → ONLY THE REAL DATA SURVIVES (ordre de nuit 2026-09-02, N3).
 *
 *   bun run demo                                (the deployed real app)
 *   BASE_URL=http://localhost:5197 bun run demo (a served real build)
 *
 * The same rows `scripts/demo-data.ts` produced for the production database
 * are loaded into the gate's fake PostgREST, next to ONE entity that is not
 * demo data — the product owner's. The real app then shows the full
 * programme, הגדרות counts the demo rows, the purge is pressed through its
 * two confirmations, and the fake database must hold exactly the non-demo
 * entity afterwards, on every one of the 26 tables.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const SHOTS = 'docs/screenshots/demo'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const db = new FakeDb()
db.seed()

// The dataset, table by table, exactly as the mapper writes it — and the
// schema's cascades, so the fake forgets children where Postgres would.
const data = demoData()
for (const collection of COLLECTIONS) {
  const mapping = MAPPINGS[collection] as Mapping<unknown>
  db.cascades.set(mapping.table, mapping.children.map((c) => ({ table: c.table, fk: c.fk })))
  for (const value of data[collection] as unknown[]) {
    for (const t of mapping.toRows(value)) db.rows(t.table).push(...t.rows)
  }
}
// And the one real entity, which the purge must not touch.
const REAL_ID = 'farm-real-po'
db.rows('entities').push({
  id: REAL_ID,
  name: 'חוות חלומותי',
  locality: 'אלון שבות',
  region: '',
  type: 'mixed',
  entity_kind: 'farm',
  status: 'signed',
  lat: 31.6522,
  lng: 35.1315,
  farm_dunams: 78,
  grazing_dunams: 268,
  farm_dunams_manual: true,
  grazing_dunams_manual: true,
  notes: '',
  last_visit_at: null,
  next_visit_at: null,
  photo: null,
})
db.rows('zones').push({ id: 'zone-real-1', entity_id: REAL_ID, kind: 'farm_boundary' })
for (const [i, [lat, lng]] of [[31.653, 35.13], [31.653, 35.133], [31.651, 35.133]].entries()) {
  db.rows('zone_vertices').push({ zone_id: 'zone-real-1', position: i, lat, lng })
}

const demoRows = () => [...db.tables.values()].flat().filter((r) => Object.values(r).some((v) => typeof v === 'string' && v.startsWith(DEMO_PREFIX))).length
const before = demoRows()

console.log('')
console.log('  A90 — SEED → PURGE → ONLY THE REAL DATA SURVIVES')
console.log('  ================================================')
console.log(`  base:   ${BASE}`)
console.log(`  fake database: ${before} demo rows across ${db.tables.size} tables, plus the real entity`)

let browser: Browser | null = null
try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()
  const context = await browser.newContext({ viewport: { width: 1032, height: 1376 }, locale: 'he-IL' })
  await installFakeSupabase(context, db)
  await installFakeSession(context)
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)

  // ---- the programme, full ----------------------------------------------
  await page.goto(`${BASE}/#/coordinator/farms`, { waitUntil: 'load' })
  await page.waitForTimeout(3500)
  const list = await page.locator('body').innerText()
  check('the real app shows the seeded programme', list.includes('חוות רתם') && list.includes('חוות בקר אודם') && list.includes('חוות חלומותי'))
  check(`the entities count reads ${data.farms.length + 1}`, new RegExp(`מוצגים ${data.farms.length + 1} מתוך ${data.farms.length + 1}`).test(list), (list.match(/מוצגים \d+ מתוך \d+/) ?? ['—'])[0])
  await page.screenshot({ path: `${SHOTS}/1-seeded.png` })

  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/2-dashboard.png`, fullPage: true })

  // ---- N8: the captures the product owner will compare his iPad against ----
  // The same rows as production, on the deployed bundle: what he sees on the
  // demo morning, minus his own entity. Taken before the purge.
  const waitMap = () =>
    page.waitForFunction(() => Boolean((window as unknown as { __loYanumMap?: { isStyleLoaded: () => boolean } }).__loYanumMap?.isStyleLoaded()), undefined, { timeout: 60_000 }).catch(() => null)
  await page.goto(`${BASE}/#/coordinator/farms?view=map`, { waitUntil: 'load' })
  await waitMap()
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${SHOTS}/4-national-map.png` })
  await page.goto(`${BASE}/#/coordinator/farms/demo-farm-01`, { waitUntil: 'load' })
  await waitMap()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${SHOTS}/5-entity-with-zones.png`, fullPage: true })
  const zoneRows = await page.locator('button', { hasText: 'ערוך' }).count()
  check('the entity screen lists its two persisted zones', zoneRows === 2, `${zoneRows} rows`)
  await page.goto(`${BASE}/#/coordinator/agenda`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${SHOTS}/6-agenda.png`, fullPage: true })
  await page.goto(`${BASE}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  await page.locator('[data-testid="report-open"]').first().click()
  await page.waitForSelector('[data-testid="report-to"]', { timeout: 20_000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${SHOTS}/7-report.png` })
  check('the report builds on the demo programme', (await page.locator('object[type="application/pdf"]').count()) === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---- הגדרות: the count, then the purge ---------------------------------
  await page.goto(`${BASE}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(2500)
  const status = page.locator('[data-testid="demo-data-status"]')
  check('הגדרות counts the demo rows', (await status.count()) === 1 && /\d+ רשומות הדגמה/.test(await status.innerText()), await status.innerText().catch(() => '—'))
  check(`and names ${data.farms.length} entities`, (await status.innerText()).includes(`${data.farms.length} יישויות`))

  let dialogs = 0
  page.on('dialog', (d) => {
    dialogs++
    void d.accept()
  })
  await page.locator('[data-testid="demo-data-purge"]').click()
  await page.waitForTimeout(6000)
  check('★ the purge asks TWICE before it acts', dialogs === 2, `${dialogs} confirmations`)

  const after = demoRows()
  check('★★ every demo row is gone from every table', after === 0, `${before} → ${after}`)
  check('★★ the real entity survived, with its zone', db.rows('entities').some((r) => r.id === REAL_ID) && db.rows('zones').some((r) => r.id === 'zone-real-1') && db.rows('zone_vertices').filter((v) => v.zone_id === 'zone-real-1').length === 3)
  check('the grant row survived too', db.rows('app_users').length === 1)
  check('the screen says how many were removed', /נמחקו \d+ רשומות/.test(await page.locator('body').innerText()))
  await page.screenshot({ path: `${SHOTS}/3-purged.png`, fullPage: true })

  await page.goto(`${BASE}/#/coordinator/farms`, { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  const afterList = await page.locator('body').innerText()
  check('and the list shows only the real entity, without a reload', afterList.includes('חוות חלומותי') && !afterList.includes('חוות רתם') && /מוצגים 1 מתוך 1/.test(afterList), (afterList.match(/מוצגים \d+ מתוך \d+/) ?? ['—'])[0])

  await context.close()
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
process.exit(failed === 0 ? 0 : 1)
