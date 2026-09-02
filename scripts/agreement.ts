import { chromium } from 'playwright'
import type { Browser } from 'playwright'

import he from '../src/locales/he.json'

import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'

/**
 * A89 — THE AGREEMENT PDF HAS A WAY OUT (ordre de nuit 2026-09-02, N2).
 *
 *   bun run agreement                                (the deployed real app)
 *   BASE_URL=http://localhost:5197 bun run agreement (a served real build)
 *
 * The product owner opened the contract from an entity and could not come
 * back — inside the installed app a `target="_blank"` PDF fills the window
 * with no chrome. This drives the three actions on the REAL app (fake
 * Supabase, see `fake-supabase.ts`) and asserts the one property that
 * matters: the app is still there afterwards. The document is loaded once,
 * shown in a modal with a close button, and every exit — close, Escape,
 * download, share — leaves the entity's screen exactly where it was.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const SHOTS = 'docs/screenshots/agreement'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

const db = new FakeDb()
db.seed()
db.rows('entities').push({
  id: 'farm-a89',
  name: 'חוות ההסכם',
  locality: 'באר שבע',
  region: '',
  type: 'mixed',
  entity_kind: 'farm',
  status: 'signed',
  lat: 31.25,
  lng: 34.79,
  farm_dunams: 120,
  grazing_dunams: 300,
  farm_dunams_manual: true,
  grazing_dunams_manual: true,
  notes: '',
  last_visit_at: null,
  next_visit_at: null,
  photo: null,
})
db.rows('agreements').push({
  id: 'agr-a89',
  entity_id: 'farm-a89',
  signed_at: '2026-08-20T10:00:00Z',
  signed_by: 'אבי כהן',
  file_name: 'הסכם — חוות ההסכם.pdf',
  signature: null,
  position: 0,
})

/**
 * ★ W8 (2026-09-02) — A SECOND ROW, SIGNED, so the gate can prove the two
 *   halves at once: the unsigned one still hands out the template untouched,
 *   and the signed one hands out a document that is BIGGER, because the ink
 *   is on its last page (`ui/agreement/sign.ts`). A 2×2 black PNG is enough
 *   ink to prove the path; what it looks like is a capture's job.
 */
const INK =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGNgYGD4z4AGmNAFyBQAAB6cAQ8SjKvxAAAAAElFTkSuQmCC'

db.rows('agreements').push({
  id: 'agr-a89-signed',
  entity_id: 'farm-a89',
  signed_at: '2026-08-21T10:00:00Z',
  signed_by: 'אליהו בן־חמו',
  file_name: 'הסכם חתום — חוות ההסכם.pdf',
  signature: INK,
  position: 1,
})

console.log('')
console.log('  A89 — THE AGREEMENT PDF HAS A WAY OUT')
console.log('  =====================================')
console.log(`  base:   ${BASE}`)

let browser: Browser | null = null
try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${SHOTS}`.quiet()
  const context = await browser.newContext({ viewport: { width: 1032, height: 1376 }, locale: 'he-IL' })
  await installFakeSupabase(context, db)
  await installFakeSession(context)
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  const pages: string[] = []
  context.on('page', (p) => pages.push(p.url()))

  await page.goto(`${BASE}/#/coordinator/farms/farm-a89`, { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  if (!page.url().endsWith('farm-a89')) {
    await page.goto(`${BASE}/#/coordinator/farms/farm-a89`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
  }
  const url = page.url()
  // The agreements block may be folded on a narrow column.
  const viewBtn = page.locator('[data-testid="agreement-view"]').first()
  if ((await viewBtn.count()) === 0 || !(await viewBtn.isVisible())) {
    await page.locator(`button:has-text("${he.farms.agreements}")`).first().click().catch(() => undefined)
    await page.waitForTimeout(500)
  }
  check('the entity is on screen with its agreement row', (await page.locator('body').innerText()).includes('הסכם — חוות ההסכם.pdf'))
  check('"view" is a BUTTON, not a link that navigates', (await viewBtn.evaluate((el) => el.tagName)) === 'BUTTON')
  check('W8 — the entity carries both rows, unsigned and signed', (await page.locator('[data-testid="agreement-view"]').count()) === 2)

  // ---- view --------------------------------------------------------------
  await viewBtn.click()
  await page.waitForSelector('[data-testid="agreement-document"]', { timeout: 15_000 })
  const doc = page.locator('[data-testid="agreement-document"]')
  const src = await doc.getAttribute('data')
  check('★ the PDF opens INSIDE the app, in a modal', (await doc.count()) === 1, src ?? '')
  check('on an object URL — the bytes were fetched, no navigation to the file', (src ?? '').startsWith('blob:'))
  check('the app is still on the entity', page.url() === url, page.url())
  check('with a close button in view', await page.locator('[data-testid="agreement-modal-close"]').isVisible())
  const bytes = await page.evaluate(async (u) => (await (await fetch(u)).arrayBuffer()).byteLength, src ?? '')
  check('and the document is a real PDF (the placeholder, one page)', bytes > 10_000, `${bytes} bytes`)
  await page.screenshot({ path: `${SHOTS}/1-viewer.png` })

  // ---- W8: the SIGNED row carries the signature on the document ----------
  await page.locator('[data-testid="agreement-modal-close"]').click()
  await page.waitForTimeout(400)
  await page.locator('[data-testid="agreement-view"]').nth(1).click()
  await page.waitForSelector('[data-testid="agreement-document"]', { timeout: 15_000 })
  await page.waitForTimeout(1200)
  const signedSrc = await page.locator('[data-testid="agreement-document"]').getAttribute('data')
  const signedBytes = await page.evaluate(
    async (u) => (await (await fetch(u)).arrayBuffer()).byteLength,
    signedSrc ?? '',
  )
  check(
    '★★ W8 — the SIGNED row hands out a document the signature was drawn on',
    signedBytes > bytes,
    `${bytes} → ${signedBytes} bytes`,
  )
  await page.screenshot({ path: `${SHOTS}/1b-viewer-signed.png` })
  await page.locator('[data-testid="agreement-modal-close"]').click()
  await page.waitForTimeout(400)
  await viewBtn.click()
  await page.waitForSelector('[data-testid="agreement-document"]', { timeout: 15_000 })

  // ---- close -------------------------------------------------------------
  await page.locator('[data-testid="agreement-modal-close"]').click()
  await page.waitForTimeout(400)
  check('★★ close returns to the entity, nothing else changed', (await doc.count()) === 0 && page.url() === url)

  // ---- Escape ------------------------------------------------------------
  await viewBtn.click()
  await page.waitForSelector('[data-testid="agreement-document"]')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  check('Escape closes it too', (await doc.count()) === 0)

  // ---- download ----------------------------------------------------------
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15_000 }).catch(() => null),
    page.locator('[data-testid="agreement-download"]').first().click(),
  ])
  check('★ download is a SAVE, with the entity\'s file name', download !== null && download.suggestedFilename() === 'הסכם — חוות ההסכם.pdf', download?.suggestedFilename() ?? 'no download event')
  await page.waitForTimeout(500)
  check('and the app is still on the entity afterwards', page.url() === url && pages.length === 0, `${pages.length} new pages`)

  // ---- share (no share sheet in headless Chromium → a mail draft) ----------
  const shareBtn = page.locator('[data-testid="agreement-share"]').first()
  check('share is a button as well', (await shareBtn.evaluate((el) => el.tagName)) === 'BUTTON')

  // ---- the settings section ----------------------------------------------
  await page.goto(`${BASE}/#/coordinator/settings`, { waitUntil: 'load' })
  await page.waitForTimeout(2000)
  const status = page.locator('[data-testid="agreement-template-status"]')
  check('הגדרות has the תבנית הסכם section', (await status.count()) === 1)
  check('and says the PLACEHOLDER is live until the association uploads its own', (await status.innerText()).includes('דוגמה'), await status.innerText())
  check('with an upload button', (await page.locator('[data-testid="agreement-template-upload"]').count()) === 1)
  await page.screenshot({ path: `${SHOTS}/2-settings.png`, fullPage: true })

  await context.close()
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
process.exit(failed === 0 ? 0 : 1)
