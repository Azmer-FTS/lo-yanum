import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AG8 (2026-09-09) — LES CAPTURES DE LA PASSE, SUR LE DÉPLOYÉ, ET LA SEULE
 *    MESURE QUI COMPTE POUR A148.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run agcaptures
 *   BASE_URL=http://localhost:5241 bun run agcaptures   (à blanc, build local)
 *
 * ★ SUR LE JUMEAU DÉPLOYÉ. Règle permanente depuis §29 : rien n'est livré tant
 *   que ce n'est pas montré sur une URL que le PO peut ouvrir lui-même.
 *
 * ★★ ET CE FICHIER PORTE A148, PAS SEULEMENT DES IMAGES. Le brief est explicite
 *    et il rappelle deux accidents par leur nom : « cette vignette ne doit être
 *    ni recouverte par le “+” flottant ni repoussée hors écran. Vérifie sur
 *    CAPTURE du déployé, pas seulement par sonde DOM. » La mesure de
 *    recouvrement est donc ICI, contre le build réellement servi, et elle fait
 *    ÉCHOUER le script — une capture qu'on regarde après coup n'est pas une
 *    porte.
 *
 * ⚠️ ET UNE COUPURE DE CETTE MACHINE N'EST PAS UN DÉFAUT DU DÉPLOYÉ. Trois
 *    reprises, et le total est imprimé à la fin.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(
  /\/$/,
  '',
)
const OUT = 'docs/screenshots/agpass'

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

/** Entre dans l'espace d'un agriculteur en passant la porte des quatre chiffres. */
async function enterFarmer(page: Page): Promise<boolean> {
  const made = await page.evaluate(() => {
    const w = window as unknown as {
      __loYanumFarmerLink?: () => { link: string; four: string } | null
    }
    return w.__loYanumFarmerLink ? w.__loYanumFarmerLink() : null
  })
  if (!made) return false
  await page.goto(made.link, { waitUntil: 'load' })
  await page.waitForTimeout(1800)
  const input = page.locator('[data-testid="challenge-input"]')
  if (await input.count()) {
    await input.fill(made.four)
    await page.locator('[data-testid="challenge-submit"]').click()
  }
  await page.waitForTimeout(2600)
  return true
}

const SHOTS: Shot[] = [
  /* ★★ AG2 — LA PORTE DES QUATRE CHIFFRES, telle que l'agriculteur la voit. */
  {
    name: 'ag2-porte-quatre-chiffres',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      const made = await page.evaluate(() => {
        const w = window as unknown as {
          __loYanumFarmerLink?: () => { link: string; four: string } | null
        }
        return w.__loYanumFarmerLink ? w.__loYanumFarmerLink() : null
      })
      if (!made) return
      await page.evaluate(() => {
        try {
          localStorage.removeItem('lo-yanum:link-unlock')
        } catch {
          /* rien */
        }
      })
      await page.goto(made.link, { waitUntil: 'load' })
      await page.waitForTimeout(2200)
    },
  },

  /* ★★ AG3 — L'ESPACE AGRICULTEUR. La capture de la passe : les gardes en
     premier, la fiche, les documents. */
  {
    name: 'ag3-espace-agriculteur',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      await enterFarmer(page)
    },
  },

  /* ★ AG3 — la même chose avec une garde ANNULÉE signalée en tête. */
  {
    name: 'ag3-garde-annulee',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      if (!(await enterFarmer(page))) return
      await page.evaluate(() => {
        const w = window as unknown as { __loYanumCancelNextGuard?: () => boolean }
        if (w.__loYanumCancelNextGuard) w.__loYanumCancelNextGuard()
      })
      await page.waitForTimeout(1500)
    },
  },

  /**
   * ★★ AG4 — LE FORMULAIRE DANS SES TROIS ÉTATS, ET C'EST CE QUE LE BRIEF
   *    DEMANDE NOMMÉMENT (« le formulaire dans ses trois états »).
   *
   * ⚠️ LES TROIS ÉTATS SONT FABRIQUÉS EN VIDANT DES CHAMPS DE LA FICHE, pas en
   *    ouvrant trois fermes différentes : ce qui doit être montré est le
   *    COMPORTEMENT du formulaire face à ce qui manque, et trois fermes
   *    différentes montreraient trois fiches.
   */
  {
    name: 'ag4-formulaire-tout-saisi',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      if (!(await enterFarmer(page))) return
      await page.goto(`${page.url().split('#')[0]}#/farmer/sign`, { waitUntil: 'load' })
      await page.waitForTimeout(4000)
    },
  },
  {
    name: 'ag4-formulaire-bloque',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      if (!(await enterFarmer(page))) return
      await page.goto(`${page.url().split('#')[0]}#/farmer/sign`, { waitUntil: 'load' })
      await page.waitForTimeout(4000)
      const submit = page.locator('[data-testid="sign-submit"]')
      if (await submit.count()) {
        await submit.scrollIntoViewIfNeeded()
        await submit.click()
        await page.waitForTimeout(900)
      }
    },
  },
  {
    name: 'ag4-formulaire-document',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      if (!(await enterFarmer(page))) return
      await page.goto(`${page.url().split('#')[0]}#/farmer/sign`, { waitUntil: 'load' })
      await page.waitForTimeout(4500)
      const preview = page.locator('[data-testid="sign-preview"]')
      if (await preview.count()) {
        await preview.scrollIntoViewIfNeeded()
        await page.waitForTimeout(1200)
      }
    },
  },

  /* ★ AG6 — les documents à fournir, du côté de l'agriculteur. */
  {
    name: 'ag6-documents-agriculteur',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      if (!(await enterFarmer(page))) return
      await page.goto(`${page.url().split('#')[0]}#/farmer/documents`, {
        waitUntil: 'load',
      })
      await page.waitForTimeout(3500)
    },
  },

  /* ★★ AG5.2 — LA FILE « לחידוש » SUR L'ÉCRAN חוות. C'est la capture que la
     mesure de recouvrement ci-dessous accompagne. */
  {
    name: 'ag5-file-renouvellement',
    hash: '#/coordinator/farms',
    wait: 6500,
  },

  /* ★ AG3.1 · AG5 — le lien de l'agriculteur et les documents, côté rekaz. */
  {
    name: 'ag3-lien-cote-rekaz',
    hash: '#/coordinator/farms/farm-01',
    wait: 6500,
    act: async (page) => {
      const block = page.locator('[data-testid="block-entity-farmer-link"]')
      if (await block.count()) {
        await block.click()
        await page.waitForTimeout(900)
        await block.scrollIntoViewIfNeeded()
        await page.waitForTimeout(600)
      }
    },
  },

  /* ★ AG1 — « voir comme », depuis les réglages, avec le bandeau. */
  {
    name: 'ag1-voir-comme',
    hash: '#/coordinator/settings',
    wait: 6000,
    act: async (page) => {
      const people = page.locator('[data-testid="view-as-person"]')
      if (await people.count()) {
        await people.first().click()
        await page.waitForTimeout(3000)
      }
    },
  },

  /* ★ AG7 — le bloc de diagnostic de la localisation. */
  {
    name: 'ag7-diagnostic-localisation',
    hash: '#/coordinator/settings',
    wait: 6000,
    act: async (page) => {
      const block = page.locator('[data-testid="block-settings-geo-diag"]')
      if (await block.count()) {
        await block.click()
        await page.waitForTimeout(900)
        await block.scrollIntoViewIfNeeded()
        await page.waitForTimeout(600)
      }
    },
  },
]

console.log('')
console.log(`  AG8 — CAPTURES CLAIR + SOMBRE, SUR LE DÉPLOYÉ : ${BASE}`)
console.log('  ==================================================================')

let browser: Browser | null = null
let taken = 0
let failed = 0
let retried = 0
let checks = 0
let checkFails = 0

function check(label: string, ok: boolean, detail = ''): void {
  checks++
  if (!ok) checkFails++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}

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
              if (
                key.startsWith('lo-yanum:map-mode:') ||
                key === 'lo-yanum:view-as' ||
                key === 'lo-yanum:farmer-pass' ||
                key === 'lo-yanum:link-unlock'
              ) {
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

          /**
           * ═══════════════════════════════════════════════════════════════════
           * ★★ A148 — LA MESURE, PRISE SUR LE MÊME ÉCRAN QUE LA CAPTURE.
           * ═══════════════════════════════════════════════════════════════════
           *
           * ⚠️ AU REPOS ET SANS DÉFILER, comme A116 et A132 : la question n'est
           *    pas « peut-on l'atteindre en faisant défiler la bande » — on le
           *    peut toujours — mais « est-elle là quand l'écran s'ouvre ».
           *
           * ⚠️ ET LE RECOUVREMENT SE MESURE EN PIXELS CARRÉS CONTRE **CHAQUE**
           *    OBJET FLOTTANT, pas seulement contre le « + ». AA1 a montré
           *    qu'un bouton flottant se pose sur ce qui est en dessous ; AE2 a
           *    ajouté un second objet flottant dans certaines coquilles. La
           *    sonde prend donc tout ce qui est `position: fixed` et
           *    au-dessus dans l'ordre de pile.
           */
          if (shot.name === 'ag5-file-renouvellement') {
            const geometry = await page.evaluate(() => {
              const chip = document.querySelector('[data-testid="farms-renewal"]')
              if (!chip) return { present: false } as const
              const r = chip.getBoundingClientRect()

              /* Tout ce qui flotte au-dessus du flux. */
              const floating = Array.from(document.querySelectorAll('body *'))
                .filter((el) => {
                  const s = getComputedStyle(el)
                  if (s.position !== 'fixed') return false
                  if (s.visibility === 'hidden' || s.display === 'none') return false
                  if (Number(s.opacity) === 0) return false
                  const b = el.getBoundingClientRect()
                  return b.width > 8 && b.height > 8
                })
                .map((el) => {
                  const b = el.getBoundingClientRect()
                  return {
                    tag: el.tagName.toLowerCase(),
                    testid: el.getAttribute('data-testid') ?? '',
                    x: b.x,
                    y: b.y,
                    w: b.width,
                    h: b.height,
                  }
                })

              const overlaps = floating
                .map((f) => {
                  const ox = Math.max(0, Math.min(r.right, f.x + f.w) - Math.max(r.left, f.x))
                  const oy = Math.max(0, Math.min(r.bottom, f.y + f.h) - Math.max(r.top, f.y))
                  return { ...f, area: Math.round(ox * oy) }
                })
                .filter((f) => f.area > 0)

              return {
                present: true,
                rect: {
                  x: Math.round(r.x),
                  y: Math.round(r.y),
                  w: Math.round(r.width),
                  h: Math.round(r.height),
                },
                inViewport:
                  r.top >= 0 &&
                  r.left >= -1 &&
                  r.bottom <= window.innerHeight + 1 &&
                  r.right <= window.innerWidth + 1,
                overlaps,
              } as const
            })

            if (!geometry.present) {
              /**
               * ⚠️ ABSENTE N'EST PAS UN ÉCHEC, ET C'EST VOULU. La vignette ne
               *    se dessine que quand elle a quelque chose à dire — comme
               *    « נשכחו » et « לתיחום ». Sur un jeu de fixtures dont aucune
               *    fiche n'a d'échéance proche, son absence est le comportement
               *    correct, et la porte le DIT plutôt que de le taire.
               */
              console.log(
                `  ·     A148 · ${vp.name} ${theme} · aucune fiche à renouveler : la vignette ne se dessine pas`,
              )
            } else {
              check(
                `A148 · ${vp.name} ${theme} · la vignette « לחידוש » est visible au repos`,
                geometry.inViewport,
                `x=${geometry.rect.x} y=${geometry.rect.y} ${geometry.rect.w}×${geometry.rect.h} / ${vp.width}×${vp.height}`,
              )
              check(
                `A148 · ${vp.name} ${theme} · et rien de flottant ne la recouvre`,
                geometry.overlaps.length === 0,
                geometry.overlaps
                  .map((o) => `${o.testid || o.tag}:${o.area}px²`)
                  .join(', ') || '0 px²',
              )
            }
          }
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
console.log(`  A148 : ${checks - checkFails}/${checks} mesures passées`)
console.log(`  → ${OUT}/`)
console.log('')
if (failed > 0 || checkFails > 0) process.exit(1)
