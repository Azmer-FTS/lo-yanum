import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AD4 (2026-09-08) — LES CAPTURES DE CETTE PASSE, ET A116.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run adcaptures
 *   BASE_URL=http://localhost:5220 bun run adcaptures   (à blanc, build local)
 *
 * ★ SUR LE JUMEAU DÉPLOYÉ. Règle permanente depuis §29 : rien n'est livré tant
 *   que ce n'est pas montré sur une URL que le PO peut ouvrir lui-même.
 *
 * ★★ ET A116 EST POSÉE ICI PARCE QU'ELLE NE PEUT PAS L'ÊTRE AILLEURS.
 *
 *    « La vignette de cette file est visible à 1376 px et à 402 px, aucun
 *      élément ne se pose dessus — vérifié sur capture du déployé. »
 *
 *    Le brief le demande en toutes lettres, et il a raison deux fois : AC a
 *    posé « נשכחו » en neuvième position, `bun run acui` l'a trouvée
 *    parfaitement (il interroge le DOM, et le DOM l'avait) et la capture du
 *    déployé a montré qu'elle était hors écran sur l'iPad du PO. La bande de
 *    vignettes DÉFILE : « présente dans le document » et « visible » sont deux
 *    faits différents.
 *
 *    ⚠️ DEUX QUESTIONS, ET PAS UNE.
 *       · le RECTANGLE — la boîte de la vignette contre celle de son propre
 *         défileur, au repos, sans défiler ;
 *       · le POINT — qui répond à un clic en son centre. C'est l'autre
 *         accident d'AC : le « + » flottant s'est posé sur une pastille, et un
 *         contrôle que le bouton couvre est inatteignable pour toujours.
 *
 *       Aucune des deux ne suffit seule. Un rectangle entièrement dans le
 *       cadre peut être couvert ; un point qui répond « moi » peut appartenir
 *       à une vignette à moitié hors écran.
 */

const BASE = (process.env.BASE_URL ?? 'https://azmer-fts.github.io/lo-yanum/demo').replace(/\/$/, '')
const OUT = 'docs/screenshots/adpass'

const VIEWPORTS = [
  { name: 'ipad', width: 1032, height: 1376 },
  { name: 'ipad-ls', width: 1376, height: 1032 },
  { name: 'iphone', width: 402, height: 874 },
] as const

const THEMES = ['light', 'dark'] as const

interface Shot {
  name: string
  hash: string
  mode?: { key: string; value: 'split' | 'hidden' | 'full' }
  wait?: number
  act?: (page: Page) => Promise<void>
  /** Sauter la lecture de recouvrement — un écran sans en-tête de liste épinglé. */
  noRest?: boolean
}

const SHOTS: Shot[] = [
  /* AD2.5 · AD3.2 — le rôle avec ses deux nouvelles vignettes en tête et le
     signal discret sur les rangées qui divergent. */
  { name: 'fermes', hash: '#/coordinator/farms', mode: { key: 'farms', value: 'split' }, wait: 6500 },
  {
    name: 'fermes-tableau',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'hidden' },
    wait: 6000,
  },
  {
    /* ★ AD3 — la file « לתיחום » ouverte, et le geste sur chaque rangée. */
    name: 'fermes-a-contourner',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'split' },
    wait: 6000,
    act: async (page) => {
      const chip = page.locator('[data-testid="farms-no-outline"]')
      if (await chip.count()) {
        await chip.click()
        await page.waitForTimeout(1400)
      }
    },
  },
  {
    /* ★ AD2.6 — la file des écarts, ouverte. */
    name: 'fermes-ecarts',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'hidden' },
    wait: 6000,
    act: async (page) => {
      const chip = page.locator('[data-testid="farms-area-gap"]')
      if (await chip.count()) {
        await chip.click()
        await page.waitForTimeout(1400)
      }
    },
  },
  {
    /* ★ AD2.6 — le tri par écart. */
    name: 'fermes-tri-ecart',
    hash: '#/coordinator/farms',
    mode: { key: 'farms', value: 'hidden' },
    wait: 6000,
    act: async (page) => {
      const select = page.locator('[data-testid="farms-sort"] select')
      if (await select.count()) {
        await select.selectOption('areaGapDesc')
        await page.waitForTimeout(1400)
      }
    },
  },
  /* ★★ AD2 — LA NOTE ELLE-MÊME, sur une fiche qui diverge de 52 %. */
  { name: 'fiche-ecart', hash: '#/coordinator/farms/farm-04', wait: 6500, noRest: true },
  /* AD1 — les deux surfaces dans la bande, sur une fiche qui n'a que sa
     mesure (un mochav dont personne n'a déclaré la surface). */
  { name: 'fiche-mesuree', hash: '#/coordinator/farms/farm-13', wait: 6500, noRest: true },
  /* AD1 — et une fiche déclarée sans aucun tracé : « אין תיחום ». */
  { name: 'fiche-sans-tracé', hash: '#/coordinator/farms/farm-05', wait: 6500, noRest: true },
  /* AD3.3 — l'arrivée par le geste : la carte déjà armée en mode tracé. */
  {
    name: 'fiche-mode-trace',
    hash: '#/coordinator/farms/farm-05?draw=farm_boundary',
    wait: 7000,
    noRest: true,
  },
  /* AD1 — le formulaire : le champ déclaré et la mesure sous lui. */
  { name: 'formulaire-ferme', hash: '#/coordinator/farms/farm-01/edit', wait: 6500, noRest: true },
  /* AD2.3 — le seuil dans les réglages, sous celui de l'oubli. */
  { name: 'reglages', hash: '#/coordinator/settings', wait: 5000, noRest: true },
  /* AD1.3 — la pondération, inchangée, sur le tableau de bord. */
  { name: 'tableau-de-bord', hash: '#/coordinator', wait: 6000 },
  /* Les écrans que la passe n'a pas touchés, gardés pour qu'une régression
     apparaisse ici. */
  { name: 'export', hash: '#/coordinator/export', wait: 5000, noRest: true },
  { name: 'volontaires', hash: '#/coordinator/volunteers', mode: { key: 'volunteers', value: 'split' }, wait: 6500 },
  { name: 'gardes', hash: '#/coordinator/missions', mode: { key: 'missions', value: 'split' }, wait: 6500 },
]

/**
 * AA6.2 — la lecture Z1bis. DEUX RECTANGLES, au repos, et rien d'autre.
 *
 * ⚠️ ELLE INTERROGE LA PREMIÈRE CHOSE SOUS L'EN-TÊTE, pas une grille de points
 *    à l'intérieur. `elementFromPoint` y est aveugle par construction ; le bord
 *    bas de la boîte épinglée contre le bord haut de la première rangée ne
 *    l'est pas.
 */
function restingOverlap(): Array<{ what: string; by: number }> {
  const out: Array<{ what: string; by: number }> = []
  const bars = document.querySelectorAll('[data-list-top]')
  bars.forEach((bar, i) => {
    const head = bar.getBoundingClientRect()
    if (head.height < 8) return
    let scroller: Element | null = bar.parentElement
    while (scroller) {
      const s = getComputedStyle(scroller)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') break
      scroller = scroller.parentElement
    }
    const root = scroller ?? document.body
    const items = [...root.querySelectorAll('[data-tile], .roster-row, article, li')].filter(
      (el) => !bar.contains(el) && el.getBoundingClientRect().height > 8,
    )
    const first = items[0]
    if (!first) return
    const box = first.getBoundingClientRect()
    if (box.top < head.bottom - 1 && box.bottom > head.top) {
      out.push({ what: `list ${i + 1}`, by: Math.round(head.bottom - box.top) })
    }
  })
  return out
}

/**
 * A116 — la vignette « לתיחום » : son rectangle et son point.
 *
 * Rendue comme une valeur plutôt que comme un booléen, pour que l'échec dise
 * de combien de pixels et par quoi.
 */
function outlineChipReading(): {
  found: boolean
  left: number
  right: number
  width: number
  frameWidth: number
  hit: string
} | null {
  const chip = document.querySelector('[data-testid="farms-no-outline"]') as HTMLElement | null
  if (!chip) return null
  let scroller: HTMLElement | null = chip.parentElement
  while (scroller) {
    const s = getComputedStyle(scroller)
    if (s.overflowX === 'auto' || s.overflowX === 'scroll') break
    scroller = scroller.parentElement
  }
  const b = chip.getBoundingClientRect()
  const frame = (scroller ?? document.documentElement).getBoundingClientRect()
  const point = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
  return {
    found: true,
    left: Math.round(b.left - frame.left),
    right: Math.round(frame.right - b.right),
    width: Math.round(b.width),
    frameWidth: Math.round(frame.width),
    hit: point === null ? 'nothing' : chip.contains(point) ? 'the chip itself' : 'SOMETHING ELSE',
  }
}

console.log('')
console.log(`  AD4 — CAPTURES CLAIR + SOMBRE, ET A116 SUR LE DÉPLOYÉ : ${BASE}`)
console.log('  ==================================================================')

let browser: Browser | null = null
let taken = 0
let failed = 0
let a116 = 0

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
        await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
        await page.evaluate(
          (t) => {
            for (const key of Object.keys(localStorage)) {
              if (key.startsWith('lo-yanum:map-mode:') || key === 'lo-yanum:view-as') {
                localStorage.removeItem(key)
              }
            }
            localStorage.setItem('lo-yanum:theme:coordinator', t as string)
          },
          theme as string,
        )
        if (shot.mode) {
          await page.evaluate(
            ([k, v]) => localStorage.setItem(`lo-yanum:map-mode:${k}`, v as string),
            [shot.mode.key, shot.mode.value] as [string, string],
          )
        }
        await page.goto(`${BASE}/${shot.hash}`, { waitUntil: 'load' })
        await page.waitForTimeout(shot.wait ?? 4000)
        if (shot.act) await shot.act(page)

        const file = `${OUT}/${vp.name}-${theme}-${shot.name}.png`
        await page.screenshot({ path: file })
        taken++

        let verdict = ''
        if (!shot.noRest) {
          const covered = (await page.evaluate(restingOverlap)) as Array<{
            what: string
            by: number
          }>
          if (covered.length > 0) {
            failed++
            verdict = `  FAIL — ${covered.map((c) => `${c.what} hidden by ${c.by}px`).join(', ')}`
          } else {
            verdict = '  at rest: clear'
          }
        }

        /**
         * ═══════════════════════════════════════════════════════════════════
         * ★★ A116 — POSÉE SUR LA FRAME « fermes », AU REPOS, AUX DEUX LARGEURS
         *    QUE LE BRIEF NOMME : 1376 px ET 402 px, DANS LES DEUX THÈMES.
         * ═══════════════════════════════════════════════════════════════════
         *
         * ⚠️ ET L'IPAD PORTRAIT EST LU SANS ÊTRE EXIGÉ, POUR UNE RAISON QUI SE
         *    MESURE ET QUI N'EST PAS UN RENONCEMENT.
         *
         *    À 1032 px en mode PARTAGÉ, la colonne de contenu fait 320 px et la
         *    bande y réserve 20 px de marge de chaque côté : il reste **280 px
         *    utiles**. Une vignette de cette famille fait **152 px** et l'écart
         *    entre deux en fait 10, donc deux vignettes en demandent 314.
         *    **AUCUNE SECONDE VIGNETTE NE PEUT Y ÊTRE ENTIÈRE**, quel que soit
         *    son contenu, son libellé ou son ordre — c'est une propriété de la
         *    bande et non de celle-ci. AC l'a déjà rencontrée et l'a résolue
         *    pour « נשכחו » de la seule façon possible : en la mettant
         *    première, ce qu'on ne peut pas faire deux fois.
         *
         *    Ce qui est vrai à cette largeur est que la vignette est COUPÉE de
         *    14 px et non hors écran : son libellé, son compte et son point
         *    central répondent. C'est matériellement autre chose que le défaut
         *    d'AC, où la neuvième vignette n'était pas là du tout. Le chiffre
         *    est imprimé à chaque exécution pour que personne n'ait à le
         *    redécouvrir, et le PO a la réponse entière dès qu'il passe en
         *    contenu plein — où la bande fait 992 px.
         */
        if (shot.name === 'fermes') {
          const reading = (await page.evaluate(outlineChipReading)) as ReturnType<
            typeof outlineChipReading
          >
          /* Les deux largeurs qu'AD3.2 nomme. L'iPad portrait est lu, imprimé,
             et n'est pas une condition — voir la note ci-dessus, avec le
             calcul qui dit pourquoi. */
          const required = vp.name === 'ipad-ls' || vp.name === 'iphone'
          if (reading === null) {
            if (required) {
              failed++
              a116++
            }
            verdict += `  ${required ? 'FAIL' : 'note'} A116 — no « לתיחום » chip at all`
          } else {
            const whole = reading.left >= -1 && reading.right >= -1 && reading.width > 40
            const clear = reading.hit === 'the chip itself'
            if (required && (!whole || !clear)) {
              failed++
              a116++
            }
            const verdictWord = whole && clear ? 'OK' : required ? 'FAIL' : 'clipped'
            verdict +=
              `  A116 ${verdictWord} — ${reading.width}px chip, ` +
              `${reading.left}px from the start, ${reading.right}px from the end of a ` +
              `${reading.frameWidth}px band; the point answers « ${reading.hit} »`
          }
        }

        console.log(`  ${vp.name.padEnd(8)} ${theme.padEnd(5)} ${shot.name.padEnd(22)}${verdict}`)
      }
      await context.close()
    }
  }
} finally {
  await browser?.close()
}

console.log('')
console.log(
  `  ${taken} captures dans ${OUT}/ — ${failed} problème(s), dont ${a116} sur A116`,
)
console.log('')
if (failed > 0) process.exit(1)
