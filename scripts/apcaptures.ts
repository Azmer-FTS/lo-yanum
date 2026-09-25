import { chromium } from 'playwright'
import type { BrowserContext, Page, Route } from 'playwright'
import { mkdirSync } from 'node:fs'

import { jerusalemInstant } from '../src/core/availability'
import { FakeDb, installFakeSession, installFakeSupabase } from './fake-supabase'
import { buildFarms } from './aodata'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AP6 — LES CAPTURES DU DÉPLOYÉ : L'ACCUEIL ET CHAQUE ÉTAPE, CLAIR ET SOMBRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run apcaptures                                  # la page DÉPLOYÉE
 *   BASE_URL=http://localhost:5362 bun run apcaptures
 *
 * ⚠️ TROIS LARGEURS, ET LA PREMIÈRE EST CELLE QUI COMPTE. « Le téléphone n'est
 *    pas un cas à supporter, c'est le cas principal » : 402 px est donc la
 *    largeur de référence, et les deux autres sont là pour qu'une tablette ne
 *    montre pas une page cassée à quelqu'un de l'association.
 *
 * ⚠️ LES TROIS RPC SONT INTERCEPTÉES, comme dans `apui`, et pour la même
 *    raison : une capture du choix de créneau doit montrer des créneaux, ce
 *    qu'un agenda réel ne garantit pas le jour où on la prend. Ce qui arrive
 *    VRAIMENT en base est prouvé par `scripts/apreal.ts`, contre la production.
 *
 * ★ ET DEUX CAPTURES DE L'APPLICATION, à la fin : l'écran חוות avec la file
 *   « בקשות נכנסות » et la fiche qui en vient. Elles sont prises sur le bundle
 *   DÉPLOYÉ de l'app, avec une base factice qui porte les vingt-cinq PLUS une
 *   demande — c'est-à-dire exactement ce que le PO verra.
 */

const PAGE_BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/bakasha').replace(/\/$/, '')
const APP_BASE = (process.env.APP_URL ?? 'https://azmer-fts.github.io/lo-yanum').replace(/\/$/, '')
const OUT = process.env.OUT ?? 'docs/screenshots/appass/deployed'
mkdirSync(OUT, { recursive: true })

console.log(`  page : ${PAGE_BASE}`)
console.log(`  app  : ${APP_BASE}`)

let shots = 0
let errors = 0

const VIEWPORTS = [
  { key: '402', width: 402, height: 874 },
  { key: '1032', width: 1032, height: 1376 },
  { key: '1376', width: 1376, height: 1032 },
] as const

/** Un jour de la semaine prochaine, entièrement occupé — pour la capture. */
function busyDayKey(): string {
  for (let i = 8; i < 16; i += 1) {
    const key = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10)
    const dow = new Date(`${key}T12:00:00Z`).getUTCDay()
    if (dow !== 5 && dow !== 6) return key
  }
  throw new Error('no open day')
}
const BUSY_DAY = busyDayKey()

async function installRpc(ctx: BrowserContext): Promise<void> {
  await ctx.route('**/rest/v1/rpc/**', async (route: Route) => {
    const url = route.request().url()
    if (url.includes('public_busy_intervals')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            starts_at: jerusalemInstant(BUSY_DAY, 6).toISOString(),
            ends_at: jerusalemInstant(BUSY_DAY, 23).toISOString(),
          },
        ]),
      })
      return
    }
    if (url.includes('public_agreement_template')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
      return
    }
    if (url.includes('submit_aid_request')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, reference: 'A4K2P9' }),
      })
      return
    }
    await route.fulfill({ status: 404, body: '{}' })
  })
}

const browser = await chromium.launch()

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(220)
  await page.screenshot({ path: `${OUT}/${name}.png` })
  shots += 1
  console.log(`  ${name}.png`)
}

// ---------------------------------------------------------------------------
// La page publique : l'accueil et les sept étapes
// ---------------------------------------------------------------------------

for (const vp of VIEWPORTS) {
  for (const theme of ['light', 'dark'] as const) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: true,
      isMobile: vp.key === '402',
      locale: 'he-IL',
      colorScheme: theme,
      timeZoneId: 'Asia/Jerusalem',
    })
    await installRpc(ctx)
    const page = await ctx.newPage()
    page.on('pageerror', (e) => {
      errors += 1
      console.log(`  ⚠️ erreur de page : ${String(e).slice(0, 120)}`)
    })
    const tag = `${vp.key}-${theme}`
    await page.goto(PAGE_BASE, { waitUntil: 'networkidle' })

    await page.getByTestId('landing').waitFor()
    await shot(page, `ap-${tag}-0-accueil`)

    await page.getByTestId('start').click()
    await page.getByTestId('need-both').click()
    await shot(page, `ap-${tag}-1-mah-atem-mechapsim`)

    await page.getByTestId('next').click()
    await page.getByTestId('land-both').click()
    await shot(page, `ap-${tag}-2-mah-yesh-lachem`)

    await page.getByTestId('next').click()
    await page.getByTestId('farmName').fill('חוות מעיין הבשור')
    await page.getByTestId('fullName').fill('יוסי כהן')
    await page.getByTestId('idNumber').fill('021985189')
    await page.getByTestId('phone').fill('0521234567')
    await page.getByTestId('locality').fill('מיצד')
    await shot(page, `ap-${tag}-3-mi-atem`)

    await page.getByTestId('next').click()
    await page.getByTestId('documents-step').waitFor()
    await shot(page, `ap-${tag}-4-mismachim`)

    await page.setInputFiles('[data-testid="doc-crops-pdf"]', {
      name: 'זכות-בקרקע.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% capture\n'),
    })
    await page.waitForFunction(
      () => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes',
    )
    await shot(page, `ap-${tag}-4b-mismach-tsoraf`)

    await page.getByTestId('next').click()
    await page.getByTestId('agreement').waitFor()
    const pad = await page.getByTestId('signature').boundingBox()
    if (pad) {
      await page.mouse.move(pad.x + 40, pad.y + pad.height / 2)
      await page.mouse.down()
      await page.mouse.move(pad.x + 120, pad.y + pad.height / 2 - 34, { steps: 12 })
      await page.mouse.move(pad.x + 190, pad.y + pad.height / 2 + 26, { steps: 12 })
      await page.mouse.move(pad.x + 250, pad.y + pad.height / 2 - 10, { steps: 12 })
      await page.mouse.up()
    }
    await shot(page, `ap-${tag}-5-heskem-vechatima`)

    await page.getByTestId('next').click()
    await page.waitForSelector('[data-step="appointment"]')
    await page.getByTestId('slots').waitFor()
    await page.getByTestId('slot').first().click()
    await shot(page, `ap-${tag}-6-moed`)

    await page.getByTestId('send').click()
    await page.getByTestId('done').waitFor()
    await shot(page, `ap-${tag}-7-ishur`)

    await ctx.close()
  }
}

// ---------------------------------------------------------------------------
// L'application : la file « בקשות נכנסות » et la fiche qui en vient
// ---------------------------------------------------------------------------

/**
 * ⚠️ LA BASE FACTICE PORTE LES VINGT-CINQ **PLUS** UNE DEMANDE. Une base qui
 *    ne porterait QUE la demande montrerait une file de 1 sur un programme de
 *    1 — ce qui ne ressemble à rien de ce que le PO ouvrira. Ce qu'on veut
 *    voir, c'est la vignette au milieu des siennes.
 */
const { farms } = buildFarms()
const ROWS = farms.map((f) => MAPPINGS.farms.toRows(f)[0].rows[0])
const REQUEST_ID = 'farm-req-capture01'
const REQUEST_ROW = {
  ...ROWS[0],
  id: REQUEST_ID,
  name: 'חוות מעיין הבשור',
  status: 'incoming_request',
  type: 'mixed',
  locality: 'מיצד',
  region: '',
  position_missing: true,
  farm_dunams: 0,
  grazing_dunams: 0,
  guarded_dunams: null,
  farmer_name: 'יוסי כהן',
  farmer_phone: '052-1234567',
  farmer_id_no: '021985189',
  farmer_email: null,
  notes: 'בקשה שהתקבלה מהעמוד הציבורי · שמירה ועזרה בעבודה חקלאית · אסמכתא A4K2P9',
  signature: null,
  signature_origin: null,
  provided_documents: null,
  archived_at: null,
}

for (const theme of ['light', 'dark'] as const) {
  const db = new FakeDb()
  db.seed()
  db.rows('entities').length = 0
  for (const r of ROWS) db.rows('entities').push({ ...r })
  db.rows('entities').push({ ...REQUEST_ROW })
  const ctx = await browser.newContext({
    viewport: { width: 1376, height: 1032 },
    hasTouch: true,
    locale: 'he-IL',
    colorScheme: theme,
    timeZoneId: 'Asia/Jerusalem',
  })
  await installFakeSupabase(ctx, db)
  await installFakeSession(ctx)
  await ctx.addInitScript(() => localStorage.setItem('lo-yanum:theme:coordinator', 'system'))
  const page = await ctx.newPage()
  page.on('pageerror', (e) => {
    errors += 1
    console.log(`  ⚠️ erreur de page (app) : ${String(e).slice(0, 120)}`)
  })
  await page.goto(`${APP_BASE}/#/coordinator/farms`, { waitUntil: 'networkidle' })
  await page.getByTestId('farms-intake').waitFor({ timeout: 30_000 })
  await shot(page, `ap-app-${theme}-8-file-bakashot`)
  await page.getByTestId('farms-intake').click()
  await page.waitForTimeout(400)
  await shot(page, `ap-app-${theme}-9-file-filtree`)
  await page.goto(`${APP_BASE}/#/coordinator/farms/${REQUEST_ID}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await shot(page, `ap-app-${theme}-10-fiche-bakasha`)
  await ctx.close()
}

await browser.close()

console.log('')
console.log(`  ${shots} captures dans ${OUT}, ${errors} erreur(s) de page`)
process.exit(errors === 0 ? 0 : 1)
