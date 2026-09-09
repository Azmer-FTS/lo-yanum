import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A166 · A167 · A168 — CE QU'UN ÉCRAN SEUL RÉPOND (PASSE AH).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ahui
 *
 *   A167  AUCUNE vue plein écran ne peut être ouverte sans pouvoir être
 *         fermée — toutes les vues, pas seulement celle que le PO a signalée.
 *   A166  le formulaire à distance : champs renseignés FIGÉS, champs manquants
 *         seuls saisissables, et il tient sur un téléphone.
 *   A168  le lien envoyé depuis la fiche, jusqu'au document signé revenu
 *         dessus.
 *   AH7.2 le délai entre le geste et l'affichage du document, mesuré.
 *
 * ⚠️ CHAQUE SONDE EST UNE VRAIE FONCTION passée à `page.evaluate`, jamais un
 *    littéral gabarit — un antislash devenu une lettre a déjà coûté un
 *    après-midi (AG).
 *
 * ⚠️ ET AUCUNE SONDE NE CHERCHE UNE PHRASE RENDUE : un `data-testid`, un
 *    compte, une boîte, une durée.
 */

const PORT = Number(process.env.AHUI_PORT ?? 5291)
const OUT = process.env.OUT ?? 'dist-ahpass'
const PHONE = { width: 402, height: 874 }
const IPAD = { width: 1032, height: 1376 }

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

console.log('')
console.log('  A166 · A167 · A168 — AH6 · AH7 DANS UN VRAI NAVIGATEUR')
console.log('  ======================================================')

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
if (process.env.SKIP_BUILD !== '1') {
  const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
  if ((await build.exited) !== 0) {
    console.error(await new Response(build.stderr).text())
    throw new Error('vite build failed')
  }
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

/** Rebond par le tableau de bord : un `goto` vers le hash courant n'est pas une navigation. */
async function open(page: Page, hash: string, settle = 2400): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

/**
 * ★★ CE QUI COMPTE COMME « VUE PLEIN ÉCRAN », ET LA DÉFINITION EST LA MOITIÉ
 *    DE LA PORTE.
 *
 * Ni une classe, ni un `data-` que quelqu'un aurait oublié de poser sur la
 * prochaine — les deux ne trouveraient que ce qu'on a pensé à leur montrer.
 * Ce qui est cherché est GÉOMÉTRIQUE : un élément épinglé (`fixed`) qui
 * recouvre au moins 85 % de la fenêtre. C'est exactement la propriété qui
 * piège quelqu'un, et c'est la seule que la prochaine vue aura forcément.
 *
 * ★ ET « POUVOIR ÊTRE FERMÉE » EST MESURÉ AU TOUCHER, PAS DÉDUIT DU BALISAGE :
 *   la sortie doit être un élément CLIQUABLE dont le centre répond
 *   `elementFromPoint`. Un bouton couvert par un bandeau opaque est un bouton
 *   qui n'existe pas — la leçon d'AG.
 */
const FULLSCREENS = function findFullscreenViews(): Array<{
  tag: string
  testid: string
  area: number
  exits: number
  reachableExits: number
}> {
  const W = window.innerWidth
  const H = window.innerHeight
  const out: Array<{ tag: string; testid: string; area: number; exits: number; reachableExits: number }> = []
  const EXIT = [
    '[data-testid="modal-close"]',
    '[data-testid="map-tool-fullscreen"]',
    '[data-testid="map-mode-pill"] button',
    '[aria-label*="סגירה"]',
    '[aria-label*="יציאה"]',
    '[data-exit]',
  ].join(',')
  for (const el of Array.from(document.querySelectorAll('body *'))) {
    const e = el as HTMLElement
    const style = getComputedStyle(e)
    if (style.position !== 'fixed') continue
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue
    const r = e.getBoundingClientRect()
    const area = (r.width * r.height) / (W * H)
    if (area < 0.85) continue
    /* Un parent déjà retenu couvre l'enfant : on ne compte que le plus haut. */
    if (out.some((o) => o.tag !== '' && e.parentElement?.closest(`[data-fs-seen]`))) continue
    e.setAttribute('data-fs-seen', '')
    const candidates = Array.from(e.querySelectorAll(EXIT)) as HTMLElement[]
    let reachable = 0
    for (const c of candidates) {
      const b = c.getBoundingClientRect()
      if (b.width < 8 || b.height < 8) continue
      const x = b.left + b.width / 2
      const y = b.top + b.height / 2
      if (x < 0 || y < 0 || x > W || y > H) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && (hit === c || c.contains(hit) || hit.contains(c))) reachable += 1
    }
    out.push({
      tag: e.tagName.toLowerCase(),
      testid: e.getAttribute('data-testid') ?? '',
      area: Math.round(area * 100),
      exits: candidates.length,
      reachableExits: reachable,
    })
  }
  for (const e of Array.from(document.querySelectorAll('[data-fs-seen]'))) {
    e.removeAttribute('data-fs-seen')
  }
  return out
}

let browser: Browser | undefined
try {
  browser = await chromium.launch()

  // -------------------------------------------------------------------------
  section('1 — A167 · toutes les vues plein écran, une par une')
  // -------------------------------------------------------------------------
  {
    const ctx = await browser.newContext({ viewport: IPAD })
    const page = await ctx.newPage()

    /** Pose le jeu d'essai : sans données, la moitié des écrans n'ouvre rien. */
    await open(page, '#/coordinator/settings', 3000)
    const seedBtn = page.locator('[data-testid="test-data-seed"]')
    if ((await seedBtn.count()) === 1) {
      const block = page.locator('[data-testid="block-settings-test-data"]')
      if ((await block.count()) === 1) {
        await block.click()
        await page.waitForTimeout(700)
      }
      await seedBtn.click()
      await page.waitForTimeout(900)
    }

    /**
     * Les entrées en plein écran de l'application, une par écran. Chacune est
     * un GESTE, pas un état posé de force : ce qu'on vérifie est ce que le PO
     * peut réellement ouvrir.
     */
    const ENTRIES: Array<{ name: string; hash: string; enter: (p: Page) => Promise<boolean> }> = [
      {
        name: 'carte du formulaire de ferme (PinMap)',
        hash: '#/coordinator/farms/new',
        enter: async (p) => clickIf(p, '[data-testid="map-tool-fullscreen"]'),
      },
      {
        name: 'carte de la fiche de ferme (AnchorMap)',
        hash: '#/coordinator/farms/farm-01',
        enter: async (p) => clickIf(p, '[data-testid="map-tool-fullscreen"]'),
      },
      {
        name: 'carte de la garde (MissionDetail)',
        hash: '#/coordinator/missions',
        enter: async (p) => {
          const tile = p.locator('[data-testid="mission-tile"]').first()
          if ((await tile.count()) === 0) return false
          await tile.click()
          await p.waitForTimeout(2600)
          return clickIf(p, '[data-testid="map-tool-fullscreen"]')
        },
      },
      {
        name: 'lecteur du document de signature (Modal)',
        hash: '#/coordinator/farms/farm-01/edit',
        enter: async (p) => {
          await expandSections(p)
          return clickIf(p, '[data-testid="signature-open"]')
        },
      },
      {
        name: 'raccourci du lien de signature (Modal)',
        hash: '#/coordinator/farms/farm-01',
        enter: async (p) => clickIf(p, '[data-testid="farm-send-link"]'),
      },
      {
        name: 'mode carte plein écran (MapSplit full)',
        hash: '#/coordinator/farms',
        enter: async (p) => {
          const pill = p.locator('[data-testid="map-mode-pill"] button')
          if ((await pill.count()) < 3) return false
          await pill.nth(2).click()
          await p.waitForTimeout(1400)
          return true
        },
      },
    ]

    for (const entry of ENTRIES) {
      await open(page, entry.hash, 3200)
      const entered = await entry.enter(page)
      if (!entered) {
        check(`A167 · ${entry.name} — l’entrée existe`, false, 'geste introuvable')
        continue
      }
      await page.waitForTimeout(1200)
      const views = await page.evaluate(FULLSCREENS)
      if (views.length === 0) {
        /* Une entrée qui n'ouvre RIEN de plein écran n'est pas un piège : on
           le dit et on passe. C'est le cas du mode carte sur un iPad, où la
           carte occupe la colonne et non la fenêtre. */
        check(`A167 · ${entry.name} — pas de vue plein écran ouverte`, true, 'rien à fermer')
        continue
      }
      const worst = views.reduce((a, b) => (a.reachableExits <= b.reachableExits ? a : b))
      check(
        `A167 · ${entry.name} — une sortie VISIBLE et atteignable au doigt`,
        worst.reachableExits >= 1,
        `${views.length} vue(s), ${worst.area}% de l’écran, ${worst.reachableExits}/${worst.exits} sorties atteignables`,
      )
      /* Et la touche d'échappement referme. */
      await page.keyboard.press('Escape')
      await page.waitForTimeout(900)
      const after = await page.evaluate(FULLSCREENS)
      check(
        `A167 · ${entry.name} — la touche d’échappement referme`,
        after.length < views.length,
        `${views.length} → ${after.length}`,
      )
    }
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section('2 — A168 · AH7.2 · le lien depuis la fiche, et le délai du document')
  // -------------------------------------------------------------------------
  let farmerLink = ''
  let four = ''
  {
    const ctx = await browser.newContext({ viewport: IPAD })
    const page = await ctx.newPage()
    await open(page, '#/coordinator/farms/farm-01', 3400)

    /* ⚠️ MESURÉ SUR LE CLIC NU. Le premier jet passait par `clickIf`, qui
       attend 900 ms après le geste : la porte mesurait sa propre patience. */
    const button = page.locator('[data-testid="farm-send-link"]')
    const opened = (await button.count()) === 1
    let modalMs = -1
    if (opened) {
      const t0 = Date.now()
      await button.click()
      await page.waitForSelector('[data-testid="farm-link-modal"]', { timeout: 8000 }).catch(() => null)
      modalMs = Date.now() - t0
    }
    check('A168 · le lien s’envoie en UN geste depuis l’en-tête de la fiche', opened)
    check(
      'AH7.2 · le raccourci s’affiche en moins de 400 ms',
      modalMs >= 0 && modalMs < 400,
      `${modalMs} ms`,
    )
    const sms = await page.locator('[data-testid="farm-link-sms"]').getAttribute('href')
    check('A168 · le SMS porte un lien', (sms ?? '').includes('%23%2Ff%2F') || (sms ?? '').includes('#/f/'), (sms ?? '').slice(0, 60))

    /* Les quatre chiffres, lus sur la fiche : c'est ce que le PO dit au
       téléphone, donc c'est ce que la porte doit employer pour entrer. */
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    const linkBlock = page.locator('[data-testid="block-entity-farmer-link"]')
    if ((await linkBlock.count()) === 1) {
      await linkBlock.click()
      await page.waitForTimeout(800)
    }
    four = (await page.locator('[data-testid="farm-link-four"]').textContent().catch(() => '')) ?? ''
    four = four.trim()
    check('A166 · les quatre chiffres sont lisibles par le PO sur la fiche', /^\d{4}$/.test(four), four)
    await page.locator('[data-testid="farm-send-link"]').click()
    await page.waitForTimeout(700)

    /* Le lien lui-même, pour le parcours d'A166 juste après. */
    farmerLink = await page.evaluate(() => {
      const a = document.querySelector('[data-testid="farm-link-whatsapp"]') as HTMLAnchorElement | null
      if (!a) return ''
      const text = decodeURIComponent(a.href)
      const m = /(https?:\/\/[^\s]*#\/f\/[A-Za-z0-9._~-]+)/.exec(text)
      return m ? m[1] : ''
    })
    check('A168 · et le lien est extractible du message', farmerLink !== '', farmerLink.slice(0, 70))

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    /* AH7.2 — le document lui-même : du geste au premier pixel. */
    await open(page, '#/coordinator/farms/farm-01/edit', 3400)
    await expandSections(page)
    const t1 = Date.now()
    const readerOpened = await clickIf(page, '[data-testid="signature-open"]')
    if (readerOpened) {
      await page
        .waitForSelector('[data-testid="agreement-preview-page"]', { timeout: 20000 })
        .catch(() => null)
      const docMs = Date.now() - t1
      check(
        'AH7.2 · le document s’affiche en moins de 4 s après le geste',
        docMs < 4000,
        `${docMs} ms`,
      )
    } else {
      check('AH7.2 · le lecteur du document s’ouvre', false)
    }
    await ctx.close()
  }

  // -------------------------------------------------------------------------
  section('3 — A166 · le formulaire à distance, sur un téléphone')
  // -------------------------------------------------------------------------
  if (farmerLink !== '') {
    const ctx = await browser.newContext({ viewport: PHONE })
    const page = await ctx.newPage()
    await page.goto(farmerLink, { waitUntil: 'load' })
    await page.waitForTimeout(3200)

    /* AG2 — la porte des quatre chiffres. On la passe comme l'agriculteur. */
    const gate = page.locator('[data-testid="challenge-input"]')
    const gated = (await gate.count()) === 1
    check('A166 · le lien s’ouvre sur la porte des quatre chiffres', gated)
    if (gated && four) {
      await gate.fill(four)
      await page.locator('[data-testid="challenge-submit"]').click()
      await page.waitForTimeout(2200)
    }
    check(
      'A166 · les quatre chiffres de la fiche ouvrent l’espace',
      (await page.locator('[data-testid="challenge-input"]').count()) === 0,
    )

    /* Le formulaire de signature lui-même. */
    await page.goto(`${base}/#/farmer/sign`, { waitUntil: 'load' })
    await page.waitForTimeout(3200)
    const shape = await page.evaluate(() => {
      const given = document.querySelectorAll('[data-testid^="sign-given-"]').length
      const asked = document.querySelectorAll('[data-testid^="sign-input-"]').length
      const editable = Array.from(
        document.querySelectorAll('#root input, #root textarea, #root select'),
      ).filter((el) => {
        const e = el as HTMLInputElement
        if (e.type === 'file' || e.type === 'hidden') return false
        if (e.readOnly || e.disabled) return false
        const r = e.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }).length
      const checkboxes = Array.from(document.querySelectorAll('#root input[type="checkbox"]')).length
      const doc = document.querySelectorAll('[data-testid="sign-preview-page"]').length
      const pad = document.querySelectorAll('canvas').length
      const bodyW = document.body.scrollWidth
      return { given, asked, editable, checkboxes, doc, pad, bodyW, winW: window.innerWidth }
    })
    check(
      'A166 · les champs déjà renseignés sont AFFICHÉS, jamais redemandés',
      shape.given > 0,
      `${shape.given} figés`,
    )
    check(
      'A166 · les champs saisissables sont EXACTEMENT les champs manquants',
      shape.editable === shape.asked,
      `${shape.editable} saisissables pour ${shape.asked} demandés`,
    )
    check(
      'AH6.3 · plus AUCUNE case à cocher sur ce formulaire',
      shape.checkboxes === 0,
      `${shape.checkboxes}`,
    )
    check('A166 · le document est à l’écran avant de signer', shape.doc >= 1, `${shape.doc} page(s)`)
    check('A166 · le pad de signature est là', shape.pad >= 1)
    check(
      'A166 · rien ne déborde latéralement sur un téléphone',
      shape.bodyW <= shape.winW + 1,
      `${shape.bodyW} / ${shape.winW}`,
    )
    await page.screenshot({ path: 'docs/screenshots/ahpass/a166-formulaire-distant.png', fullPage: true })
    await ctx.close()
  } else {
    check('A166 · le lien était extractible', false, 'pas de lien')
  }
} finally {
  if (browser) await browser.close()
  serve.kill()
}

async function clickIf(page: Page, selector: string): Promise<boolean> {
  const el = page.locator(selector).first()
  if ((await el.count()) === 0) return false
  await el.click({ timeout: 5000 }).catch(() => undefined)
  await page.waitForTimeout(900)
  return true
}

/** Déplie les sections repliables d'un formulaire — le ת״ז y est. */
async function expandSections(page: Page): Promise<void> {
  const toggles = page.locator('[data-testid^="section-farm-form"]')
  const n = await toggles.count()
  for (let i = 0; i < n; i++) {
    const b = toggles.nth(i)
    if ((await b.getAttribute('aria-expanded')) === 'false') await b.click()
  }
  await page.waitForTimeout(700)
}

console.log('')
console.log(`  ${passed} PASS · ${failed} FAIL`)
console.log('')
if (failed > 0) process.exit(1)
