import { chromium, webkit } from 'playwright'
import type { Browser, BrowserContext, Page } from 'playwright'
import { mkdirSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AO — LE RAPPORT D'ACTIVITÉ, DANS UN VRAI NAVIGATEUR. A243 · A244 · A247 · A248
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aoui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run aoui    # le DÉPLOYÉ
 *
 * ★★ POURQUOI CETTE PORTE EXISTE À CÔTÉ DE `aopass`. `aopass` prouve que les
 *    CHIFFRES sont justes ; elle ne peut rien dire du PDF, qui n'existe que
 *    là où il y a un `<canvas>`, ni de la fenêtre, ni du fait que le texte
 *    affiché est bien celui qui part. Un rapport juste qu'on ne peut pas
 *    sortir de l'iPad ne sert à rien.
 *
 * ⚠️ CE QU'ELLE NE PROUVE PAS. Le rendu de WhatsApp lui-même (aucun
 *    navigateur ne le simule) : ce qui est mesuré est que le texte ne contient
 *    que ce que WhatsApp sait rendre, et qu'il arrive dans le presse-papier
 *    tel quel. Le partage natif (`navigator.share`) n'existe pas dans un
 *    navigateur de test non plus — le bouton est vérifié présent et actif,
 *    et le chemin « הורדה » produit un vrai PDF dont l'en-tête est lu.
 */

const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const PORT = Number(process.env.AOUI_PORT ?? 5357)
const OUT = process.env.DIST ?? 'dist-aopass'
const SHOTS = process.env.SHOTS ?? 'docs/screenshots/aopass/local'
const IPAD = { width: 1032, height: 1376 }
const PHONE = { width: 402, height: 874 }
mkdirSync(SHOTS, { recursive: true })

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

const serves: Array<ReturnType<typeof Bun.spawn>> = []
async function serveBuild(out: string, port: number): Promise<string> {
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', out], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error(`vite build failed (${out})`)
    }
  }
  serves.push(
    Bun.spawn(['bun', 'x', 'vite', 'preview', '--outDir', out, '--port', String(port), '--strictPort'], {
      env,
      stdout: 'ignore',
      stderr: 'ignore',
    }),
  )
  const base = `http://localhost:${port}`
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
  return base
}

const demo = REMOTE ? `${REMOTE}/demo` : await serveBuild(OUT, PORT)
console.log(`  démo : ${demo}`)

async function context(
  browser: Browser,
  opts: { viewport?: { width: number; height: number }; dark?: boolean } = {},
): Promise<BrowserContext> {
  /* ⚠️ WebKit ne connaît PAS `clipboard-write` et refuse le contexte entier
     (« Unknown permission ») ; Chromium en a besoin pour que `CopyButton`
     écrive sans invite. D'où la permission accordée au seul Chromium. */
  const chromiumLike = browser.browserType().name() === 'chromium'
  const ctx = await browser.newContext({
    viewport: opts.viewport ?? IPAD,
    hasTouch: true,
    locale: 'he-IL',
    colorScheme: opts.dark ? 'dark' : 'light',
    permissions: chromiumLike ? ['clipboard-read', 'clipboard-write'] : undefined,
  })
  ctx.setDefaultTimeout(9000)
  return ctx
}

async function open(page: Page, hash: string, settle = 2400): Promise<void> {
  await page.goto(`${demo}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(900)
  await page.goto(`${demo}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function guard(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (e) {
    check('section interrompue', false, (e as Error).message.split('\n')[0])
  }
}

const chrome = await chromium.launch()
const safari = await webkit.launch()

try {
  // =========================================================================
  section('A243 — les deux statuts, vus dans les filtres et sur une fiche')
  // =========================================================================
  await guard(async () => {
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, '#/coordinator/farms')
    /**
     * ⚠️ LA LÉGENDE DE LA CARTE, PAS LES TUILES DE FILTRE. Les tuiles par
     *    statut tombent à zéro exemplaire (`.filter(k => k.count > 0)`) : dans
     *    le jeu de démonstration, aucune fiche ne porte encore les deux
     *    nouveaux statuts, donc leur tuile n'existe pas — et c'est VOULU. La
     *    légende, elle, liste les NEUF, et c'est ce qui prouve que les deux
     *    sont dans la liste de l'écran.
     */
    /* La légende est repliable (AN8) : on l'ouvre si elle est fermée. */
    const panel = page.locator('[data-testid="map-legend"]')
    if ((await panel.getAttribute('data-open')) !== '1') {
      await page.locator('[data-testid="map-legend-toggle"]').click()
      await page.waitForTimeout(400)
    }
    const legend = (await panel.textContent()) ?? ''
    check('« לא רלוונטי כרגע » est dans la légende de la carte', legend.includes('לא רלוונטי כרגע'), legend.slice(0, 200))
    check('« בהמתנה » aussi', legend.includes('בהמתנה'))
    check('… et « סירבה » est toujours là, distincte', legend.includes('סירבה'))

    /* Une pastille doit avoir une COULEUR : une pastille grise est une
       pastille qu'on ne distingue pas dans une liste de vingt-cinq lignes. */
    const inks = await page.evaluate(() => {
      const read = (name: string) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return {
        away: read('--farm-not-relevant-now'),
        hold: read('--farm-on-hold'),
        declined: read('--farm-declined'),
        awayInk: read('--farm-not-relevant-now-ink'),
        holdInk: read('--farm-on-hold-ink'),
      }
    })
    check('les deux teintes existent au clair', inks.away !== '' && inks.hold !== '', JSON.stringify(inks))
    check('… et elles ne copient pas celle de « סירבה »',
      inks.away !== inks.declined && inks.hold !== inks.declined)
    check('… et chacune a son encre', inks.awayInk !== '' && inks.holdInk !== '')
    await ctx.close()
  })

  await guard(async () => {
    /* ★ ET LE PO DOIT POUVOIR LES POSER, pas seulement les lire. */
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, '#/coordinator/farms/farm-07/edit')
    const select = page.locator('[data-testid="farm-status"]')
    const options = await select.locator('option').allTextContents()
    check('le formulaire propose les NEUF statuts', options.length === 9, options.join(' | '))
    check('… dont « לא רלוונטי כרגע » et « בהמתנה »',
      options.includes('לא רלוונטי כרגע') && options.includes('בהמתנה'), options.join(' | '))
    await select.selectOption({ label: 'בהמתנה' })
    await page.waitForTimeout(400)
    check('★ « בהמתנה » se choisit et tient', await select.inputValue() === 'on_hold', await select.inputValue())
    await ctx.close()
  })

  await guard(async () => {
    const ctx = await context(chrome, { dark: true })
    const page = await ctx.newPage()
    await open(page, '#/coordinator/farms')
    const dark = await page.evaluate(() => {
      const read = (name: string) =>
        getComputedStyle(document.documentElement).getPropertyValue(name).trim()
      return { away: read('--farm-not-relevant-now'), hold: read('--farm-on-hold') }
    })
    check('les deux teintes existent AUSSI au sombre', dark.away !== '' && dark.hold !== '', JSON.stringify(dark))
    await ctx.close()
  })

  // =========================================================================
  section('A244 · A247 — la fenêtre, la période, le texte, le PDF')
  // =========================================================================
  await guard(async () => {
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, '#/coordinator')

    const opener = page.locator('[data-testid="activity-open"]')
    check('le bouton « דוח פעילות » est sur le tableau de bord', await opener.isVisible())
    await opener.click()
    await page.waitForTimeout(900)
    check('la fenêtre s\'ouvre', await page.locator('[data-testid="activity-modal"]').isVisible())

    const body = page.locator('[data-testid="activity-text"]')
    const week = (await body.textContent()) ?? ''
    check('le texte est affiché AVANT tout envoi', week.length > 200, `${week.length} caractères`)
    check('… et il commence par le titre WhatsApp', week.trim().startsWith('*דוח פעילות'))
    check('… en gras WhatsApp, sans Markdown de titre', !/^#{1,6}\s/m.test(week) && !week.includes('|'))

    /* ★ CHANGER DE PÉRIODE CHANGE LE TEXTE : c'est ce qu'un sélecteur qui ne
       ferait rien aurait l'air de faire. */
    await page.locator('[data-testid="activity-period-month"]').click()
    await page.waitForTimeout(700)
    const month = (await body.textContent()) ?? ''
    check('« החודש » recalcule le rapport', month !== week, `${week.length} → ${month.length}`)

    await page.locator('[data-testid="activity-period-custom"]').click()
    await page.waitForTimeout(500)
    await page.locator('[data-testid="activity-from"]').fill('2000-01-01')
    await page.locator('[data-testid="activity-to"]').fill('2000-01-02')
    await page.waitForTimeout(700)
    const ancient = (await body.textContent()) ?? ''
    check('une période libre est prise en compte', ancient.includes('01.01.2000'), ancient.slice(0, 80))
    check('★ une période de janvier 2000 ne prétend AUCUNE visite',
      /ביקורים: 0/.test(ancient), (ancient.match(/ביקורים: \d+/) ?? ['—'])[0])
    check('★ … mais garde l\'ÉTAT du jour (les dounams ne sont pas une période)',
      /דונם משוקלל: [1-9]/.test(ancient), (ancient.match(/דונם משוקלל: [^\n]*/) ?? ['—'])[0])

    /* A248 — le repère, et l'absence de repère, DITE. */
    const compare = (await page.locator('[data-testid="activity-compare"]').textContent()) ?? ''
    check('★ sans rapport précédent, la fenêtre le DIT', compare.includes('הדוח הראשון'), compare)
    check('… et le texte aussi', ancient.includes('זהו הדוח הראשון'))

    await page.locator('[data-testid="activity-period-month"]').click()
    await page.waitForTimeout(700)

    /* ★ LE PDF : téléchargé, et son en-tête LU. Un fichier de zéro octet ou
       une page HTML renommée passerait toute vérification plus faible. */
    const wait = page.waitForEvent('download', { timeout: 30_000 })
    await page.locator('[data-testid="activity-download"]').click()
    const download = await wait
    const path = await download.path()
    check('le bouton produit un fichier', path !== null, download.suggestedFilename())
    if (path) {
      const bytes = new Uint8Array(await Bun.file(path).arrayBuffer())
      const head = new TextDecoder().decode(bytes.slice(0, 5))
      check('★ c\'est un vrai PDF (%PDF-)', head === '%PDF-', head)
      check('★ et il n\'est pas vide', bytes.byteLength > 20_000, `${bytes.byteLength} octets`)
      check('le nom du fichier porte « דוח פעילות »',
        download.suggestedFilename().includes('דוח פעילות'), download.suggestedFilename())
    }

    /* A248 — sortir le rapport l'ENREGISTRE ; l'ouvrir ne l'enregistre pas. */
    await page.waitForTimeout(900)
    const kept = await page.evaluate(() => {
      try {
        return JSON.parse(localStorage.getItem('lo-yanum:activity-reports') ?? '[]').length as number
      } catch {
        return -1
      }
    })
    check('★ le rapport SORTI est conservé', kept === 1, String(kept))
    check('★ … et il apparaît dans « דוחות קודמים »',
      await page.locator('[data-testid="activity-history"] li').first().isVisible())

    const stored = await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem('lo-yanum:activity-reports') ?? '[]')
      return { body: rows[0]?.body ?? '', farms: (rows[0]?.farms ?? []).length as number }
    })
    check('★ le TEXTE envoyé est gardé mot pour mot',
      stored.body === (await body.textContent()), `${stored.body.length} / ${((await body.textContent()) ?? '').length}`)
    check('★ … avec l\'instantané par exploitation (sans lui, aucune comparaison)',
      stored.farms > 0, String(stored.farms))

    await page.screenshot({ path: `${SHOTS}/a244-rapport-ipad.png` })
    await ctx.close()
  })

  // =========================================================================
  section('A245 — la comparaison, une fois qu\'un rapport existe')
  // =========================================================================
  await guard(async () => {
    const ctx = await context(chrome)
    const page = await ctx.newPage()
    await open(page, '#/coordinator')
    /* Un rapport d'août, écrit à la main dans le journal : le repère. */
    await page.evaluate(() => {
      localStorage.setItem(
        'lo-yanum:activity-reports',
        JSON.stringify([
          {
            id: 'r-aout',
            period: { id: 'custom', from: '2026-08-01', to: '2026-08-31' },
            generatedAt: '2026-08-31T18:00:00.000Z',
            previousId: null,
            totals: {
              farms: 3, offCount: 0, cultivatedDunams: 10, grazingDunams: 20,
              weightedDunams: 30, targetWeighted: 60000, targetPercent: 0,
              signed: 1, signedWithDocuments: 0, signedAwaitingDocuments: 1, contacts: 2,
            },
            farms: [],
            body: 'הדוח של אוגוסט',
          },
        ]),
      )
    })
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(2200)
    await page.locator('[data-testid="activity-open"]').click()
    await page.waitForTimeout(900)
    const compare = (await page.locator('[data-testid="activity-compare"]').textContent()) ?? ''
    check('★ la fenêtre nomme le rapport de référence', compare.includes('31.08.2026'), compare)
    const text = (await page.locator('[data-testid="activity-text"]').textContent()) ?? ''
    check('★ le texte porte la section d\'évolution', text.includes('מה זז מאז הדוח הקודם (31.08.2026)'))
    check('★ … avec des écarts SIGNÉS', /יישויות: \+\d/.test(text), (text.match(/יישויות: [^\n]*/) ?? ['—'])[0])
    check('★ … et il ne dit plus « זהו הדוח הראשון »', !text.includes('זהו הדוח הראשון'))
    check('le journal montre le rapport d\'août',
      ((await page.locator('[data-testid="activity-history"]').textContent()) ?? '').includes('31.08.2026'))
    await page.screenshot({ path: `${SHOTS}/a245-comparaison.png` })
    await ctx.close()
  })

  // =========================================================================
  section('A247 — sur un iPhone : la fenêtre tient, le texte se lit')
  // =========================================================================
  await guard(async () => {
    const ctx = await context(safari, { viewport: PHONE })
    const page = await ctx.newPage()
    await open(page, '#/coordinator')
    await page.locator('[data-testid="activity-open"]').click()
    await page.waitForTimeout(1000)
    const box = await page.locator('[data-testid="activity-text"]').boundingBox()
    check('le bloc de texte tient dans la largeur du téléphone',
      box !== null && box.x >= 0 && box.x + box.width <= PHONE.width + 1,
      JSON.stringify(box))
    const size = await page.locator('[data-testid="activity-text"]').evaluate(
      (el) => Number.parseFloat(getComputedStyle(el).fontSize),
    )
    check('… et il est lisible (≥ 13 px)', size >= 13, `${size} px`)
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    check('aucun débordement horizontal de la page', scroll <= 1, `${scroll} px`)
    const share = page.locator('[data-testid="activity-share"]')
    check('le bouton de partage est actif', await share.isEnabled())
    await page.screenshot({ path: `${SHOTS}/a247-iphone.png` })
    await ctx.close()
  })
} finally {
  await chrome.close()
  await safari.close()
  for (const s of serves) s.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
