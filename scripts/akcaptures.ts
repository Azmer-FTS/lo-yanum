import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AK9 — LES CAPTURES DU DÉPLOYÉ, ET LA MESURE D'A202 SUR LE BUNDLE SERVI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run akcaptures
 *   BASE_URL=http://localhost:5301 bun run akcaptures   (un build local)
 *
 * Trois écrans que le brief nomme — le formulaire ouvert DEPUIS une fiche, la
 * file des documents manquants, les fiches archivées — en clair ET en sombre,
 * aux trois largeurs du PO.
 *
 * ★★ ET CE FICHIER PORTE A202, PAS SEULEMENT DES IMAGES : la vignette
 *    « ממתינות למסמכים » est MESURÉE sur le déployé, à 402 et à 1376 px, au
 *    repos et sans défiler — entièrement dans l'écran et recouverte par rien
 *    de ce qui flotte, le « + » compris. C'est la leçon d'AA6.2, d'AC4.5 et
 *    d'AD3.2 : « la seule question qu'on peut poser à deux boîtes opaques est
 *    une question sur deux RECTANGLES ».
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = 'docs/screenshots/akpass/deployed'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const
const THEMES = ['light', 'dark'] as const

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

async function goto(page: Page, url: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: attempt === 1 ? 'load' : 'domcontentloaded' })
      return
    } catch (error) {
      if (attempt >= 3) throw error
      await new Promise((r) => setTimeout(r, 6000 * attempt))
    }
  }
}

async function tap(page: Page, testId: string): Promise<boolean> {
  const el = page.getByTestId(testId).first()
  if ((await el.count()) === 0) return false
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }))
  await page.waitForTimeout(200)
  const box = await el.boundingBox()
  if (!box) return false
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(500)
  return true
}

/** La barre de filtres se replie derrière « סינון » dans un panneau étroit. */
async function openFilters(page: Page): Promise<void> {
  if ((await page.getByTestId('farms-archived').count()) > 0) return
  if ((await page.getByTestId('filter-dropdown').count()) > 0) {
    await tap(page, 'filter-dropdown')
  }
}

interface Shot {
  name: string
  hash: string
  wait?: number
  act?: (page: Page) => Promise<void>
}

const SHOTS: Shot[] = [
  {
    /* AK4 — le formulaire de l'association, ouvert DEPUIS la fiche. */
    name: 'ak-formulaire',
    hash: '#/coordinator/farms/farm-06',
    act: async (page) => {
      await tap(page, 'farm-open-assoc-form')
      await page.waitForTimeout(900)
    },
  },
  {
    /* AK5 — la bande permanente « ממתין למסמכים » sur une fiche. */
    name: 'ak-fiche-attente',
    hash: '#/coordinator/farms/farm-01',
    act: async (page) => {
      await page.getByTestId('farm-awaiting-docs').first().scrollIntoViewIfNeeded().catch(() => undefined)
      await page.waitForTimeout(400)
    },
  },
  {
    /* AK5.3 — la file, dans la bande des vignettes. */
    name: 'ak-file-documents',
    hash: '#/coordinator/farms',
    wait: 5000,
  },
  {
    /* AK7 — une fiche archivée, et la file « בארכיון » sur le rôle. */
    name: 'ak-archivee',
    hash: '#/coordinator/farms/farm-04',
    act: async (page) => {
      await tap(page, 'farm-archive')
      await tap(page, 'archive-reason')
      await page.keyboard.type('התחרטו')
      await tap(page, 'archive-confirm')
      await page.waitForTimeout(900)
    },
  },
  {
    name: 'ak-file-archive',
    hash: '#/coordinator/farms/farm-04',
    act: async (page) => {
      await tap(page, 'farm-archive')
      await tap(page, 'archive-confirm')
      await goto(page, `${BASE}/#/coordinator/farms`)
      await page.waitForTimeout(4000)
      await openFilters(page)
      await tap(page, 'farms-archived')
      await page.waitForTimeout(800)
    },
  },
]

/** A202 — la vignette contre tout ce qui flotte. */
async function queueGeometry(page: Page) {
  return await page.evaluate(() => {
    const chip = document.querySelector('[data-testid="farms-awaiting-docs"]')
    if (!chip) return { present: false, inViewport: false, overlaps: [] as string[], rect: null }
    const r = chip.getBoundingClientRect()
    const overlaps = Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        if (chip.contains(el) || el.contains(chip)) return false
        const cs = getComputedStyle(el)
        if (cs.position !== 'fixed') return false
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
        const b = el.getBoundingClientRect()
        if (b.width <= 8 || b.height <= 8 || b.width > innerWidth * 0.9) return false
        const ox = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left))
        const oy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top))
        return ox * oy > 0
      })
      .map((el) => el.getAttribute('data-testid') ?? el.tagName.toLowerCase())
    return {
      present: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inViewport: r.top >= 0 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1,
      overlaps,
    }
  })
}

let browser: Browser | null = null
let taken = 0

console.log('')
console.log('  AK9 — LES CAPTURES DU DÉPLOYÉ')
console.log('  =============================')
console.log(`  ${BASE}`)

try {
  browser = await chromium.launch()
  await Bun.$`mkdir -p ${OUT}`.quiet()

  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        locale: 'he-IL',
        hasTouch: true,
        colorScheme: theme,
      })
      const page = await context.newPage()
      page.setDefaultTimeout(60_000)

      for (const shot of SHOTS) {
        try {
          await goto(page, `${BASE}/`)
          /* Les préférences d'appareil d'une session précédente fausseraient la
             capture — et le rechargement est ce qui les fait relire (AG). */
          await page.evaluate((t) => {
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith('lo-yanum:map-mode:') || key === 'lo-yanum:view-as' || key === 'lo-yanum:farmer-pass') {
                localStorage.removeItem(key)
              }
            }
            for (const role of ['coordinator', 'volunteer', 'driver', 'farmer']) {
              localStorage.setItem(`lo-yanum:theme:${role}`, t as string)
            }
          }, theme as string)
          await page.reload({ waitUntil: 'load' })
          await page.waitForTimeout(1200)

          await goto(page, `${BASE}/#/coordinator`)
          await page.waitForTimeout(2500)
          await goto(page, `${BASE}/${shot.hash}`)
          await page.waitForTimeout(shot.wait ?? 4000)
          if (shot.act) await shot.act(page)

          const file = `${OUT}/${vp.name}-${theme}-${shot.name}.png`
          await page.screenshot({ path: file })
          taken++
          console.log(`  ✓ ${vp.name} ${theme} ${shot.name}`)

          /* A202, sur la capture elle-même. */
          if (shot.name === 'ak-file-documents' && theme === 'light') {
            const geometry = await queueGeometry(page)
            check(
              `A202 · ${vp.width} px · la vignette « ממתינות למסמכים » est dessinée`,
              geometry.present,
            )
            if (geometry.present) {
              check(
                `A202 · ${vp.width} px · entièrement dans l'écran, au repos`,
                geometry.inViewport,
                JSON.stringify(geometry.rect),
              )
              check(
                `A202 · ${vp.width} px · recouverte par rien de ce qui flotte (le « + » compris)`,
                geometry.overlaps.length === 0,
                geometry.overlaps.join(', ') || 'aucun',
              )
            }
          }
        } catch (error) {
          failed++
          console.log(`  ✗ ${vp.name} ${theme} ${shot.name} — ${String(error).slice(0, 140)}`)
        }
      }

      await context.close()
    }
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${taken} captures dans ${OUT}`)
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
