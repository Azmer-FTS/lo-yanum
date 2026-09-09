import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH12 (2026-09-10) — LES CAPTURES DE LA PASSE, SUR LE DÉPLOYÉ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ahcaptures
 *   BASE_URL=http://localhost:5321 bun run ahcaptures   (à blanc, build local)
 *
 * ★ SUR LE JUMEAU DÉPLOYÉ. Règle permanente depuis §29 : rien n'est livré tant
 *   que ce n'est pas montré sur une URL que le PO peut ouvrir lui-même.
 *
 * ★★ ET CE FICHIER PORTE A159, PAS SEULEMENT DES IMAGES. La plainte du PO
 *    porte sur une POSITION — « les boutons restent flottants au lieu d'être
 *    collés au bas de l'écran » — et une position se mesure sur le bundle
 *    SERVI, pas sur un build local qui lui ressemble (§29). La mesure fait
 *    ÉCHOUER le script : une capture qu'on regarde après coup n'est pas une
 *    porte.
 *
 * ⚠️ ET UNE COUPURE DE CETTE MACHINE N'EST PAS UN DÉFAUT DU DÉPLOYÉ. Trois
 *    reprises, et le total est imprimé à la fin.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(
  /\/$/,
  '',
)
const OUT = 'docs/screenshots/ahpass/deployed'

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
  /* ★★ AH1 — LE FORMULAIRE DE FERME, SECTIONS OUVERTES : c'est l'état où le PO
     l'a trouvé interminable, puisque le ת״ז vit dans une section repliée. */
  {
    name: 'ah1-formulaire-ferme',
    hash: '#/coordinator/farms/farm-01/edit',
    wait: 6500,
    act: async (page) => {
      const toggles = page.locator('[data-testid^="section-farm-form"]')
      const n = await toggles.count()
      for (let i = 0; i < n; i++) {
        const b = toggles.nth(i)
        if ((await b.getAttribute('aria-expanded')) === 'false') await b.click()
      }
      await page.waitForTimeout(900)
    },
  },
  /* ★ AH1.3 — la case « même personne », et les deux champs qu'elle recopie. */
  {
    name: 'ah1-meme-personne',
    hash: '#/coordinator/farms/farm-01/edit',
    wait: 6000,
    act: async (page) => {
      const people = page.locator('[data-testid^="section-farm-form-people"]')
      if ((await people.count()) && (await people.getAttribute('aria-expanded')) === 'false') {
        await people.click()
        await page.waitForTimeout(800)
      }
      const box = page.locator('[data-testid="liaison-same-row"]')
      if (await box.count()) {
        await box.scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
      }
    },
  },
  /* ★★ AH2 — LA BARRE D'ACTIONS, ANCRÉE, EN HAUT DU FORMULAIRE (donc au repos,
     là où une barre collante flottait au milieu de l'écran). */
  {
    name: 'ah2-barre-ancree',
    hash: '#/coordinator/farms/new',
    wait: 6000,
  },
  /* ★ AH3 — le jeu d'essai dans les réglages, et sa marque. */
  {
    name: 'ah3-jeu-essai',
    hash: '#/coordinator/settings',
    wait: 6000,
    act: async (page) => {
      const block = page.locator('[data-testid="block-settings-test-data"]')
      if (await block.count()) {
        await block.click()
        await page.waitForTimeout(900)
        await block.scrollIntoViewIfNeeded()
        await page.waitForTimeout(600)
      }
    },
  },
  /* ★★ AH5 — LE GABARIT, SON APERÇU ET SON LOGO. */
  {
    name: 'ah5-gabarit-apercu',
    hash: '#/coordinator/settings',
    wait: 6000,
    act: async (page) => {
      const block = page.locator('[data-testid="block-settings-agreement-doc"]')
      if (await block.count()) {
        await block.click()
        await page.waitForTimeout(1200)
      }
      const preview = page.locator('[data-testid="agreement-doc-preview"]')
      if (await preview.count()) {
        await preview.scrollIntoViewIfNeeded()
        await page.waitForTimeout(2500)
      }
    },
  },
  /* ★ AH5.7 — la variable inconnue, refusée et nommée. */
  {
    name: 'ah5-variable-refusee',
    hash: '#/coordinator/settings',
    wait: 6000,
    act: async (page) => {
      const block = page.locator('[data-testid="block-settings-agreement-doc"]')
      if (await block.count()) {
        await block.click()
        await page.waitForTimeout(1200)
      }
      const area = page.locator('[data-testid="agreement-doc-template"]')
      if (await area.count()) {
        await area.fill(`${await area.inputValue()}\n{{שם_החקלא}}`)
        await page.locator('[data-testid="agreement-doc-save"]').click()
        await page.waitForTimeout(700)
        await area.scrollIntoViewIfNeeded()
        await page.waitForTimeout(500)
      }
    },
  },
  /* ★★ AH6 — LE FORMULAIRE À DISTANCE, DANS SES TROIS ÉTATS. */
  {
    name: 'ah6-distant-1-porte',
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
      await page.goto(made.link, { waitUntil: 'load' })
      await page.waitForTimeout(3000)
    },
  },
  {
    name: 'ah6-distant-2-champs',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      if (!(await enterFarmer(page))) return
      await page.goto(`${page.url().split('#')[0]}#/farmer/sign`, { waitUntil: 'load' })
      await page.waitForTimeout(4500)
    },
  },
  {
    name: 'ah6-distant-3-signature',
    hash: '#/coordinator',
    wait: 3000,
    act: async (page) => {
      if (!(await enterFarmer(page))) return
      await page.goto(`${page.url().split('#')[0]}#/farmer/sign`, { waitUntil: 'load' })
      await page.waitForTimeout(5000)
      const pad = page.locator('canvas').last()
      if (await pad.count()) {
        await pad.scrollIntoViewIfNeeded()
        await page.waitForTimeout(1200)
      }
    },
  },
  /* ★ AH7.3 — le raccourci d'envoi du lien, depuis l'en-tête de la fiche. */
  {
    name: 'ah7-envoi-lien',
    hash: '#/coordinator/farms/farm-01',
    wait: 6500,
    act: async (page) => {
      const button = page.locator('[data-testid="farm-send-link"]')
      if (await button.count()) {
        await button.click()
        await page.waitForTimeout(1200)
      }
    },
  },
  /* ★★ AH9 — L'ITINÉRAIRE LIBRE, TROIS LIENS COLLÉS. */
  {
    name: 'ah9-itineraire-libre',
    hash: '#/coordinator/route/free',
    wait: 6000,
    act: async (page) => {
      const LINKS = [
        'https://www.google.com/maps/@30.6100,34.8000,15z',
        'https://waze.com/ul?ll=31.2500%2C34.7900',
        '31.0512, 34.7231',
      ]
      const field = page.locator('[data-testid="position-link"]').first()
      if (!(await field.count())) return
      for (const link of LINKS) {
        await field.fill(link)
        await field.press('Enter')
        await page.waitForTimeout(800)
      }
      await page.waitForTimeout(1500)
    },
  },
  /* ★ AH10 — les épingles fines, sur l'écran חוות. */
  {
    name: 'ah10-epingles',
    hash: '#/coordinator/farms',
    wait: 7000,
  },
]

console.log('')
console.log(`  AH12 — CAPTURES CLAIR + SOMBRE, SUR LE DÉPLOYÉ : ${BASE}`)
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

          /**
           * ⚠️★★ ET IL FAUT RECHARGER APRÈS LE NETTOYAGE, CE QUE LA PREMIÈRE
           *    VERSION NE FAISAIT PAS — ET LA MESURE D'AG N'A DONC RIEN MESURÉ
           *    DU TOUT SUR SA PREMIÈRE EXÉCUTION SUR LE DÉPLOYÉ.
           *
           *    Le nettoyage ci-dessus efface `lo-yanum:farmer-pass`, mais la
           *    page a DÉJÀ été chargée avec ce laissez-passer : AG3.1 a reposé
           *    la session en agriculteur, `RequireRole` renvoie donc toute
           *    navigation vers `/coordinator/**` sur `/farmer`, et la capture
           *    « file de renouvellement » photographiait l'espace d'un
           *    agriculteur en croyant photographier l'écran חוות. La sonde
           *    cherchait alors sa vignette là où elle n'a jamais été et
           *    concluait « aucune fiche à renouveler » — le pire genre de vert.
           *
           *    Un rechargement fait relire le stockage NETTOYÉ au démarrage,
           *    ce qui est le seul moment où il est lu.
           */
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

          /**
           * ═══════════════════════════════════════════════════════════════════
           * ★★ A159 — LA MESURE, PRISE SUR LE MÊME ÉCRAN QUE LA CAPTURE.
           * ═══════════════════════════════════════════════════════════════════
           *
           * C'est la plainte du PO, mesurée sur le BUNDLE SERVI plutôt que sur
           * un build local qui lui ressemble (règle permanente depuis §29) :
           * « les boutons שמור/ביטול restent flottants au lieu d'être collés au
           * bas de l'écran ».
           *
           * ⚠️ AU REPOS ET SANS DÉFILER, comme A116, A132 et A148 d'avant : la question
           *    n'est pas « la barre finit-elle par arriver en bas si l'on
           *    défile » — une barre collante y arrive — mais « où est-elle
           *    quand l'écran s'ouvre ». C'est là que l'ancien mécanisme
           *    échouait de 231 px.
           *
           * ⚠️ ET LA DEUXIÈME MOITIÉ EST L'ATTEIGNABILITÉ. `bun run zones` a
           *    cliqué cinquante-cinq fois sur un שמור visible et couvert par la
           *    pilule de mode : une barre au bon endroit dont les boutons ne
           *    répondent pas est un pire défaut que celui qu'on corrigeait.
           */
          if (shot.name === 'ah2-barre-ancree') {
            const geometry = await page.evaluate(() => {
              const bar = document.querySelector('[data-testid="form-actions"]')
              if (!bar) return { present: false } as const
              const r = bar.getBoundingClientRect()

              /* La valeur RÉSOLUE de `--shell-bottom` : une propriété
                 personnalisée n'est pas résolue tant que rien ne l'emploie. */
              const probe = document.createElement('div')
              probe.style.cssText =
                'position:fixed;left:0;width:0;height:0;bottom:var(--shell-bottom);pointer-events:none'
              document.body.appendChild(probe)
              const shellBottom = Math.round(
                window.innerHeight - probe.getBoundingClientRect().bottom,
              )
              probe.remove()

              const buttons = Array.from(bar.querySelectorAll('button'))
              let reachable = 0
              for (const b of buttons) {
                const q = b.getBoundingClientRect()
                const el = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2)
                if (el && (el === b || b.contains(el))) reachable += 1
              }

              return {
                present: true,
                gap: Math.round(window.innerHeight - r.bottom),
                shellBottom,
                buttons: buttons.length,
                reachable,
              } as const
            })

            if (!geometry.present) {
              console.log(
                `  ·     A159 · ${vp.name} ${theme} · pas de barre sur cet écran (mode carte plein)`,
              )
            } else {
              check(
                `A159 · ${vp.name} ${theme} · la barre est collée au bas de l'écran, AU REPOS`,
                Math.abs(geometry.gap - geometry.shellBottom) <= 2,
                `écart ${geometry.gap} px pour --shell-bottom ${geometry.shellBottom}`,
              )
              check(
                `A159 · ${vp.name} ${theme} · et ses boutons répondent au doigt`,
                geometry.buttons > 0 && geometry.reachable === geometry.buttons,
                `${geometry.reachable}/${geometry.buttons}`,
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
console.log(`  A159 : ${checks - checkFails}/${checks} mesures passées`)
console.log(`  → ${OUT}/`)
console.log('')
if (failed > 0 || checkFails > 0) process.exit(1)
