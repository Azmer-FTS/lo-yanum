import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AF9 (2026-09-09) — LES CAPTURES DE LA PASSE, SUR LE DÉPLOYÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run afcaptures
 *   BASE_URL=http://localhost:5231 bun run afcaptures   (à blanc, build local)
 *
 * ★ SUR LE JUMEAU DÉPLOYÉ. Règle permanente depuis §29 : rien n'est livré tant
 *   que ce n'est pas montré sur une URL que le PO peut ouvrir lui-même. Une
 *   porte qui tourne sur un aperçu local prouve que le code est juste ; elle ne
 *   prouve pas que le PO peut appuyer sur le bouton.
 *
 * ⚠️ ET UNE COUPURE DE CETTE MACHINE N'EST PAS UN DÉFAUT DU DÉPLOYÉ. Trois
 *    reprises, et le total est imprimé à la fin : un chiffre élevé veut dire
 *    que la ligne était mauvaise, et le lecteur doit le savoir plutôt que de
 *    lire un « N captures » qui a coûté une heure.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(
  /\/$/,
  '',
)
const OUT = 'docs/screenshots/afpass'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const

const THEMES = ['light', 'dark'] as const

interface Shot {
  name: string
  hash: string
  wait?: number
  act?: (page: Page) => Promise<void>
}

const SHOTS: Shot[] = [
  /* ★★ AF1 — LE DOCUMENT, AVANT LA SIGNATURE. C'est la capture de la passe :
     le logo, le titre de l'association, les quatre cases pré-remplies, le
     bloc הצהרה — et le pad EN DESSOUS. */
  {
    name: 'af1-document-avant-signature',
    hash: '#/coordinator/farms/farm-01/edit',
    wait: 7000,
    act: async (page) => {
      const open = page.locator('[data-testid="signature-open"]').first()
      if (await open.count()) {
        await open.scrollIntoViewIfNeeded()
        await page.waitForTimeout(400)
        await open.click()
        await page.waitForTimeout(5000)
      }
    },
  },

  /* ★ AF1 — le même document, signé, dans le lecteur de la fiche. */
  {
    name: 'af1-document-signe',
    hash: '#/coordinator/farms/farm-01',
    wait: 7000,
    act: async (page) => {
      const view = page.locator('[data-testid="agreement-view"]').first()
      if (await view.count()) {
        await view.scrollIntoViewIfNeeded()
        await page.waitForTimeout(400)
        await view.click()
        await page.waitForTimeout(6000)
      }
    },
  },

  /* ★★ AF2.1 — LA BARRE D'ACTIONS ET L'ÉPINGLE, sur l'écran où le PO a signalé
     les trois défauts. La capture cadre le HAUT de la carte, où le bandeau est
     passé, et la barre שמור/ביטול épinglée en bas. */
  {
    name: 'af2-formulaire-ferme',
    hash: '#/coordinator/farms/farm-01/edit',
    wait: 7000,
  },

  /* ★ AF3.1 — le champ « coller un lien de localisation » sur la création. */
  {
    name: 'af3-lien-localisation',
    hash: '#/coordinator/farms/new',
    wait: 6000,
    act: async (page) => {
      const field = page.locator('[data-testid="position-link"]')
      if (await field.count()) {
        await field.scrollIntoViewIfNeeded()
        await field.fill('https://waze.com/ul?ll=31.0583%2C34.6531')
        await page.locator('[data-testid="position-link-apply"]').click()
        await page.waitForTimeout(1200)
      }
    },
  },

  /* ★ AF3 · AF4 — le rendez-vous : lien collé, rappel, conversion en ferme. */
  {
    name: 'af3-rendez-vous',
    hash: '#/coordinator/agenda?new=meeting',
    wait: 6000,
    act: async (page) => {
      const field = page.locator('[data-testid="position-link"]')
      if (await field.count()) {
        await field.fill('https://maps.app.goo.gl/x')
        await page.locator('[data-testid="position-link-apply"]').click()
        await page.waitForTimeout(700)
        await field.fill('31.2589, 34.7995')
        await page.locator('[data-testid="position-link-apply"]').click()
        await page.waitForTimeout(1200)
      }
    },
  },

  /* ★★ AF4.1 — la grille, avec un rendez-vous déplaçable. */
  { name: 'af4-agenda', hash: '#/coordinator/agenda', wait: 7000 },

  /* ★★ AF5 — le compte rendu, ses quatre périodes et sa page 2. */
  {
    name: 'af5-compte-rendu',
    hash: '#/coordinator',
    wait: 7000,
    act: async (page) => {
      const open = page.locator('[data-testid="report-open"]').first()
      if (await open.count()) {
        await open.click()
        await page.waitForTimeout(6000)
      }
    },
  },

  /* ★★ AF6 — LA BASCULE DE RÔLE, LÀ OÙ ELLE EST. Quatrième demande du PO ;
     la capture est le chemin, écran par écran. */
  { name: 'af6-bascule-role', hash: '#/coordinator/settings', wait: 6000 },

  /* ★★ AF7 — la page de réglages rangée, avec son sommaire. */
  {
    name: 'af7-reglages-sommaire',
    hash: '#/coordinator/settings',
    wait: 6000,
    act: async (page) => {
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(500)
    },
  },

  /* ★ AF7 — le groupe « תבניות », où vivent les deux gabarits. */
  {
    name: 'af7-gabarits',
    hash: '#/coordinator/settings',
    wait: 6000,
    act: async (page) => {
      const pill = page.locator('[data-testid="settings-toc-templates"]')
      if (await pill.count()) {
        await pill.click()
        await page.waitForTimeout(1200)
      }
      const block = page.locator('[data-testid="block-settings-agreement-doc"]')
      if (await block.count()) {
        await block.click()
        await page.waitForTimeout(900)
        await block.scrollIntoViewIfNeeded()
      }
      await page.waitForTimeout(600)
    },
  },
]

console.log('')
console.log(`  AF9 — CAPTURES CLAIR + SOMBRE, SUR LE DÉPLOYÉ : ${BASE}`)
console.log('  ==================================================================')

let browser: Browser | null = null
let taken = 0
let failed = 0
let retried = 0

async function goto(page: Page, url: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(url, { waitUntil: attempt === 1 ? 'load' : 'domcontentloaded' })
      return
    } catch (error) {
      if (attempt >= 3) throw error
      retried++
      await new Promise((r) => setTimeout(r, 8000 * attempt))
    }
  }
}

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
        permissions: ['geolocation'],
        geolocation: { latitude: 31.0611, longitude: 34.6602 },
      })
      const page = await context.newPage()
      page.setDefaultTimeout(60_000)

      for (const shot of SHOTS) {
        try {
          await goto(page, `${BASE}/`)
          await page.evaluate((t) => {
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith('lo-yanum:map-mode:') || key === 'lo-yanum:view-as') {
                localStorage.removeItem(key)
              }
            }
            for (const role of ['coordinator', 'volunteer', 'driver', 'farmer']) {
              localStorage.setItem(`lo-yanum:theme:${role}`, t as string)
            }
          }, theme as string)

          await goto(page, `${BASE}/#/coordinator`)
          await page.waitForTimeout(2500)
          await goto(page, `${BASE}/${shot.hash}`)
          await page.waitForTimeout(shot.wait ?? 4000)
          if (shot.act) await shot.act(page)

          const file = `${OUT}/${vp.name}-${theme}-${shot.name}.png`
          await page.screenshot({ path: file })
          taken++
          console.log(`  ✓ ${vp.name} ${theme} ${shot.name}`)
        } catch (error) {
          failed++
          console.log(`  ✗ ${vp.name} ${theme} ${shot.name} — ${String(error).slice(0, 120)}`)
        }
      }
      await context.close()
    }
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(`  ${taken} captures, ${failed} échecs, ${retried} reprises réseau`)
console.log(`  → ${OUT}/`)
console.log('')
if (failed > 0) process.exit(1)
