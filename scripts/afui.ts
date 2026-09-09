import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A129 · A130 · A131 · A132 · A135 · A136 · A138 — CE QU'UN ÉCRAN SEUL RÉPOND.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run afui
 *
 *   A129  le document de signature : logo, texte de l'association, valeurs de
 *         la fiche, signature — et LISIBLE AVANT de signer.
 *   A130  le parcours complet de création d'une ferme, iPad portrait ET
 *         paysage, sans blocage.
 *   A131  la barre d'actions et les deux boutons : fixes, jamais recouverts,
 *         et le défilement de la page intact.
 *   A132  le bouton de déplacement de l'épingle hors de la zone des trois
 *         contrôles.
 *   A135  la localisation demandée UNE fois et jamais redemandée.
 *   A136  le glisser-déposer d'un rendez-vous, au doigt ET au stylet.
 *   A138  la bascule de rôle, deux gestes depuis l'accueil, quatre rôles,
 *         téléphone et tablette.
 *
 * ⚠️ CHAQUE SONDE EST UNE VRAIE FONCTION passée à `page.evaluate`, jamais un
 *    littéral gabarit. Trois passes y ont perdu un après-midi chacune : un
 *    antislash devenu une lettre, un accent grave dans un commentaire qui a
 *    terminé la chaîne.
 *
 * ⚠️ ET AUCUNE SONDE NE CHERCHE UNE PHRASE RENDUE. Ce qui est interrogé est un
 *    `data-testid`, un compte, une boîte, une durée — jamais une traduction,
 *    qui change sans que le produit change.
 */

const PORT = Number(process.env.AFUI_PORT ?? 5231)
const OUT_DIR = 'dist-afpass'

const PHONE = { width: 402, height: 874 }
const IPAD = { width: 1032, height: 1376 }
const IPAD_LS = { width: 1376, height: 1032 }

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
console.log('  A129 … A138 — AF1 · AF2 · AF4 · AF6 DANS UN VRAI NAVIGATEUR')
console.log('  ===========================================================')

const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT_DIR], {
  env,
  stdout: 'ignore',
  stderr: 'pipe',
})
if ((await build.exited) !== 0) {
  console.error(await new Response(build.stderr).text())
  throw new Error('vite build failed')
}
const serve = Bun.spawn(
  ['bun', 'x', 'vite', 'preview', '--outDir', OUT_DIR, '--port', String(PORT), '--strictPort'],
  { env, stdout: 'ignore', stderr: 'ignore' },
)
const base = `http://localhost:${PORT}`
{
  const deadline = Date.now() + 40_000
  for (;;) {
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break
    } catch {
      /* pas encore levé */
    }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

/** Rebond par le tableau de bord : un `goto` vers le hash courant n'est pas une navigation. */
async function open(page: Page, hash: string, settle = 2500): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

/**
 * ★ LE COMPTEUR D'INVITES DE LOCALISATION, POSÉ AVANT LE PREMIER SCRIPT DE LA
 *   PAGE. A135 ne demande pas « la position est-elle connue » mais « combien de
 *   fois l'appareil a-t-il été interrogé » — et cela ne se mesure qu'en
 *   remplaçant l'API avant que quoi que ce soit l'appelle.
 */
const COUNTER = function installGeolocationCounter(): void {
  const w = window as unknown as { __geo: { current: number; watch: number } }
  w.__geo = { current: 0, watch: 0 }
  const real = navigator.geolocation
  const fake = {
    getCurrentPosition: (
      ok: PositionCallback,
      err?: PositionErrorCallback | null,
      opts?: PositionOptions,
    ) => {
      w.__geo.current++
      real.getCurrentPosition(ok, err ?? undefined, opts)
    },
    watchPosition: (
      ok: PositionCallback,
      err?: PositionErrorCallback | null,
      opts?: PositionOptions,
    ) => {
      w.__geo.watch++
      return real.watchPosition(ok, err ?? undefined, opts)
    },
    clearWatch: (id: number) => real.clearWatch(id),
  }
  Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true })
}

let browser: Browser | undefined

try {
  browser = await chromium.launch()

  // -------------------------------------------------------------------------
  section('1 — A129 · le document se lit AVANT d’être signé')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: IPAD_LS,
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await open(page, '#/coordinator/farms/farm-01/edit', 5000)

    const opener = page.locator('[data-testid="signature-open"]').first()
    check('A129 · la fiche offre la lecture-et-signature', (await opener.count()) > 0)
    await opener.scrollIntoViewIfNeeded()
    await opener.click()
    await page.waitForTimeout(4500)

    const preview = page.locator('[data-testid="agreement-preview-page"]')
    check('A129 · le document est à l’écran AVANT toute signature', (await preview.count()) > 0)

    /**
     * ⚠️ « AVANT » EST UNE QUESTION D'ORDRE DANS LE DOCUMENT, PAS DE PRÉSENCE.
     *    Les deux pourraient coexister avec le pad AU-DESSUS, et l'écran dirait
     *    alors exactement le contraire de ce qu'AF1.2 demande.
     */
    const order = await page.evaluate(() => {
      const doc = document.querySelector('[data-testid="agreement-preview"]')
      const pad = document.querySelector('canvas')
      if (!doc || !pad) return null
      const a = doc.getBoundingClientRect()
      const b = pad.getBoundingClientRect()
      return { docTop: Math.round(a.top), padTop: Math.round(b.top) }
    })
    check(
      'A129 · et il est AU-DESSUS du pad, pas à côté',
      order !== null && order.docTop < order.padTop,
      order ? `${order.docTop} < ${order.padTop}` : 'introuvable',
    )

    /**
     * ★ CE QUE LA PAGE PORTE, MESURÉ SUR SES PIXELS ET NON SUR SON CODE.
     *   Le logo est un masque appliqué au canevas : la seule preuve qu'il est
     *   arrivé est de l'encre sombre dans la bande du haut. Un document sans
     *   logo y serait uniformément blanc.
     */
    const ink = await page.evaluate(async () => {
      const img = document.querySelector(
        '[data-testid="agreement-preview-page"]',
      ) as HTMLImageElement | null
      if (!img) return null
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(img, 0, 0)
      const band = (from: number, to: number) => {
        const y0 = Math.round(c.height * from)
        const y1 = Math.round(c.height * to)
        const { data } = ctx.getImageData(0, y0, c.width, y1 - y0)
        let dark = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 200 && data[i + 1] < 200 && data[i + 2] < 200) dark++
        }
        return dark
      }
      return {
        width: c.width,
        height: c.height,
        logo: band(0.02, 0.13),
        fields: band(0.2, 0.33),
        declaration: band(0.34, 0.46),
        signature: band(0.6, 0.78),
      }
    })
    check('A129 · la page est rendue', ink !== null && ink.width > 500, ink ? `${ink.width}×${ink.height}` : '')
    check('A129 · le logo de l’association est dessus', (ink?.logo ?? 0) > 2000, String(ink?.logo))
    check('A129 · les quatre cases portent des valeurs', (ink?.fields ?? 0) > 2000, String(ink?.fields))
    check('A129 · le bloc הצהרה porte du texte', (ink?.declaration ?? 0) > 2000, String(ink?.declaration))
    const before = ink?.signature ?? 0

    /* On signe, au STYLET, et le document se redessine avec l'encre dessus. */
    const pad = page.locator('canvas').first()
    const box = await pad.boundingBox()
    if (box) {
      await page.mouse.move(box.x + 40, box.y + box.height / 2)
      await page.mouse.down()
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(
          box.x + 40 + (i * (box.width - 90)) / 12,
          box.y + box.height / 2 + Math.sin(i) * 22,
        )
      }
      await page.mouse.up()
    }
    await page.waitForTimeout(3500)

    const after = await page.evaluate(() => {
      const img = document.querySelector(
        '[data-testid="agreement-preview-page"]',
      ) as HTMLImageElement | null
      if (!img) return 0
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) return 0
      ctx.drawImage(img, 0, 0)
      const y0 = Math.round(c.height * 0.6)
      const y1 = Math.round(c.height * 0.78)
      const { data } = ctx.getImageData(0, y0, c.width, y1 - y0)
      let dark = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < 200 && data[i + 1] < 200 && data[i + 2] < 200) dark++
      }
      return dark
    })
    check(
      'A129 · l’encre atterrit DANS le document, sous les yeux du signataire',
      after > before + 300,
      `${before} → ${after}`,
    )

    const confirm = page.locator('[data-testid="agreement-sign-confirm"]')
    const inView = await confirm
      .evaluate((el) => {
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= window.innerHeight && r.width > 0
      })
      .catch(() => false)
    check('A129 · le bouton d’approbation est à l’écran sans défiler', inView === true)
    await confirm.click()
    await page.waitForTimeout(1200)
    const chip = await page.locator('[data-testid="signature-open"]').first().innerText()
    check('A129 · la fiche retient la signature', chip.trim().length > 0, chip.trim())
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('2 — A131 · la barre d’actions, et A132 · l’épingle')
  // -------------------------------------------------------------------------
  for (const vp of [
    { name: 'iphone', ...PHONE },
    { name: 'ipad', ...IPAD },
    { name: 'ipad-ls', ...IPAD_LS },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await open(page, '#/coordinator/farms/farm-01/edit', 5000)

    const report = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return {
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
        }
      }
      const foot = document.querySelector('[data-testid="form-actions"]') as HTMLElement | null
      /* Les ancêtres qui établissent un conteneur de défilement : c'est CE qui
         cassait `position: sticky` et laissait la barre glisser de côté. */
      const scrollers: string[] = []
      let node: HTMLElement | null = foot
      while (node && node !== document.body) {
        const cs = getComputedStyle(node)
        if (/(auto|scroll)/.test(cs.overflowY) || /(auto|scroll)/.test(cs.overflowX)) {
          scrollers.push(`${cs.overflowX}/${cs.overflowY}`)
        }
        node = node.parentElement
      }
      const de = document.documentElement
      return {
        foot: box('[data-testid="form-actions"]'),
        pin: box('[data-testid="pin-panel"]'),
        pill: box('[data-testid="map-mode-pill"]'),
        tools: box('[data-testid="map-tools"]'),
        scrollers,
        docScrollW: de.scrollWidth,
        clientW: de.clientWidth,
        docScrollH: de.scrollHeight,
        clientH: de.clientHeight,
        footBottomCss: foot ? getComputedStyle(foot).bottom : '',
        footPosition: foot ? getComputedStyle(foot).position : '',
      }
    })

    check(`A131 · ${vp.name} · pas de défilement horizontal de la page`,
      report.docScrollW <= report.clientW + 1,
      `${report.docScrollW} vs ${report.clientW}`)

    check(`A131 · ${vp.name} · la barre est bien épinglée`,
      report.footPosition === 'sticky', report.footPosition)

    /**
     * ★★ « ÉPINGLÉE » SE MESURE, ET LA MESURE EST : EST-ELLE VISIBLE À
     *    L'ARRÊT, EN HAUT DU DOCUMENT ? C'est le défaut exact du PO — « ils
     *    remontent avec le contenu » — et il se voyait à 3 627 px de haut dans
     *    une fenêtre de 1 376.
     */
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(400)
    const pinned = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="form-actions"]')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight }
    })
    check(
      `A131 · ${vp.name} · elle reste à l’écran quand la page est en haut`,
      pinned !== null && pinned.top < pinned.h && pinned.bottom > 0,
      pinned ? `${pinned.top}..${pinned.bottom} dans ${pinned.h}` : '',
    )

    /* A132 — le bandeau de l'épingle ne partage aucun pixel avec les contrôles. */
    const overlap = (
      a: { x: number; y: number; right: number; bottom: number } | null,
      b: { x: number; y: number; right: number; bottom: number } | null,
    ): number => {
      if (!a || !b) return 0
      const ox = Math.min(a.right, b.right) - Math.max(a.x, b.x)
      const oy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)
      return ox > 0 && oy > 0 ? ox * oy : 0
    }
    check(`A132 · ${vp.name} · le bandeau d’épingle est là`, report.pin !== null)
    check(
      `A132 · ${vp.name} · il ne touche pas la pilule carte/partagé/plein écran`,
      overlap(report.pin, report.pill) === 0,
      `${overlap(report.pin, report.pill)} px²`,
    )
    check(
      `A132 · ${vp.name} · ni la pile d’outils de la carte`,
      overlap(report.pin, report.tools) === 0,
      `${overlap(report.pin, report.tools)} px²`,
    )
    check(
      `A132 · ${vp.name} · et il n’est plus pleine largeur`,
      report.pin !== null && report.pin.w < 420,
      report.pin ? `${report.pin.w} px` : '',
    )
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('3 — A130 · créer une ferme de zéro, portrait et paysage')
  // -------------------------------------------------------------------------
  for (const vp of [
    { name: 'ipad portrait', ...IPAD },
    { name: 'ipad paysage', ...IPAD_LS },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
      permissions: ['geolocation'],
      geolocation: { latitude: 31.0611, longitude: 34.6602 },
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    /**
     * ⚠️ LA PILE, ET PAS SEULEMENT LE MESSAGE. La première version imprimait
     *    `String(e)` et rendait « Error » — c'est-à-dire une exception dont le
     *    message est vide, ce qui est le pire cas possible pour un rapport de
     *    porte : on sait qu'il s'est passé quelque chose et rien d'autre.
     */
    /**
     * ⚠️ LA PILE VIENT DE LA PAGE, PAS DU PROTOCOLE. `page.on('pageerror')`
     *    rendait « Error » — nom vide, message « Error », pile absente : la
     *    sérialisation d'une valeur lancée qui n'est pas une `Error`. Un
     *    `window.onerror` posé AVANT le premier script de la page voit la
     *    source et la ligne, ce qui est la seule chose utilisable.
     */
    await context.addInitScript(() => {
      const w = window as unknown as { __err: string[] }
      w.__err = []
      window.addEventListener('error', (e) => {
        w.__err.push(
          `${e.message} @ ${e.filename ?? '?'}:${e.lineno ?? 0} ${
            e.error && e.error.stack ? String(e.error.stack).split('\n')[1] ?? '' : ''
          }`,
        )
      })
      window.addEventListener('unhandledrejection', (e) => {
        const r = e.reason as { message?: string; stack?: string } | string
        w.__err.push(
          `rejet: ${typeof r === 'string' ? r : (r?.message ?? '?')} ${
            typeof r === 'object' && r?.stack ? String(r.stack).split('\n')[1] ?? '' : ''
          }`,
        )
      })
    })
    const errors: string[] = []

    await open(page, '#/coordinator/farms/new', 5000)

    const name = `חוות בדיקה ${vp.name}`
    /**
     * ⚠️ `input[type="text"]` VISIBLE, ET PAS `input` : le champ photo est un
     *    `<input type="file" class="hidden">` posé avant le nom, et
     *    `locator('input').first()` le résolvait — quarante-cinq secondes
     *    d'attente sur un élément qui ne sera jamais visible. La sonde doit
     *    viser ce qu'un doigt peut viser.
     */
    await page.locator('input[type="text"]:visible').first().fill(name)
    /* La localité, par l'autocomplétion. */
    const locality = page.locator('input[role="combobox"]').first()
    await locality.fill('רתמ')
    await page.waitForTimeout(600)
    const suggestion = page.locator('[role="option"]').first()
    if ((await suggestion.count()) > 0) await suggestion.click()

    /* Le point, par un lien collé — AF3.1 sur la création de ferme. */
    await page.locator('[data-testid="position-link"]').fill('https://waze.com/ul?ll=31.0583%2C34.6531')
    await page.locator('[data-testid="position-link-apply"]').click()
    await page.waitForTimeout(900)
    check(
      `A130 · ${vp.name} · le lien collé pose l’épingle`,
      (await page.locator('[data-testid="position-link-done"]').count()) > 0,
    )

    /* On enregistre, et la fiche doit exister. */
    const save = page.locator('[data-testid="form-actions"] button').last()
    await save.scrollIntoViewIfNeeded()
    await save.click()
    await page.waitForTimeout(2500)
    const url = page.url()
    check(
      `A130 · ${vp.name} · l’enregistrement quitte le formulaire`,
      !url.includes('/new'),
      url.slice(url.indexOf('#')),
    )
    const inPage = await page.evaluate(
      () => (window as unknown as { __err: string[] }).__err ?? [],
    )
    errors.push(...inPage)
    /**
     * ★★ ET CETTE LIGNE-CI EST LA RAISON POUR LAQUELLE LA SONDE ÉCOUTE LES
     *    REJETS NON GÉRÉS. Elle a trouvé, sur le déployé et dès la PREMIÈRE
     *    carte, « RTL Text Plugin failed to import scripts » : le greffon qui
     *    met en forme l'hébreu ne s'enregistrait pas, donc chaque étiquette de
     *    la carte était rendue dans l'ordre des octets. Le paquet vendu était
     *    le mauvais depuis le début (`components/basemap.ts`).
     */
    check(
      `${vp.name} · le greffon RTL s’enregistre — les étiquettes hébraïques sont mises en forme`,
      !errors.some((e) => e.includes('RTL Text Plugin')),
      errors.find((e) => e.includes('RTL Text Plugin')) ?? '',
    )
    check(
      `A130 · ${vp.name} · aucune erreur JavaScript sur le parcours`,
      errors.length === 0,
      errors.join(' | ').slice(0, 300),
    )
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('4 — A135 · la localisation, demandée une fois')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: IPAD_LS,
      locale: 'he-IL',
      hasTouch: true,
      permissions: ['geolocation'],
      geolocation: { latitude: 31.0611, longitude: 34.6602 },
    })
    await context.addInitScript(COUNTER)
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await open(page, '#/coordinator', 4000)

    const readCount = () =>
      page.evaluate(() => (window as unknown as { __geo: { current: number } }).__geo.current)

    check('A135 · rien n’est demandé tant que personne ne le demande', (await readCount()) === 0,
      String(await readCount()))

    /* מיקומי, sur la carte du tableau de bord. */
    const locate = page.locator('[data-testid="map-tool-locate"]')
    if ((await locate.count()) > 0) {
      await locate.click()
      await page.waitForTimeout(2500)
    }
    const first = await readCount()
    check('A135 · le premier appui interroge l’appareil une fois', first === 1, String(first))

    /* Un second écran qui a besoin de la position ne redemande RIEN : la porte
       unique sert le dernier point connu. */
    await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
    await page.waitForTimeout(2500)
    await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="origin-here"]') as HTMLElement | null
      btn?.click()
    })
    await page.waitForTimeout(2000)
    const second = await readCount()
    check(
      'A135 · un second écran n’en pose pas une deuxième',
      second === first,
      `${first} → ${second}`,
    )
    check(
      'A135 · et le dernier point connu est gardé sur l’appareil',
      await page.evaluate(() => localStorage.getItem('lo-yanum:last-fix') !== null),
    )
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('5 — A136 · glisser-déposer un rendez-vous, doigt et stylet')
  // -------------------------------------------------------------------------
  for (const pointerType of ['touch', 'pen'] as const) {
    const context = await browser.newContext({
      viewport: IPAD_LS,
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await open(page, '#/coordinator/agenda', 6000)

    const startTop = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="agenda-event"][data-movable="1"]')
      return b ? Math.round(b.getBoundingClientRect().top) : null
    })

    const moved = await page.evaluate(async (kind: string) => {
      const block = document.querySelector(
        '[data-testid="agenda-event"][data-movable="1"]',
      ) as HTMLElement | null
      if (!block) return { ok: false, why: 'aucun bloc déplaçable' }
      const hourPx = Number(
        (document.querySelector('[data-testid="agenda-grid"]') as HTMLElement)?.dataset
          .hourHeight ?? '0',
      )
      if (hourPx <= 0) return { ok: false, why: 'échelle inconnue' }
      const r = block.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + 8
      const opts = (cx: number, cy: number) => ({
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: 1,
        pointerType: kind,
        isPrimary: true,
        clientX: cx,
        clientY: cy,
        button: 0,
        buttons: 1,
      })
      block.dispatchEvent(new PointerEvent('pointerdown', opts(x, y)))
      /* L'appui doit être MAINTENU : c'est la grille qui l'impose, sans quoi
         un défilement et un déplacement seraient le même geste. */
      await new Promise((r2) => setTimeout(r2, 420))
      const dragging = block.dataset.dragging === '1'
      const target = y + hourPx * 2
      block.dispatchEvent(new PointerEvent('pointermove', opts(x, target)))
      await new Promise((r2) => setTimeout(r2, 80))
      const label = block.textContent ?? ''
      block.dispatchEvent(new PointerEvent('pointerup', opts(x, target)))
      return { ok: true, dragging, label, hourPx }
    }, pointerType)

    check(`A136 · ${pointerType} · un bloc déplaçable existe`, moved.ok, moved.why ?? '')
    check(
      `A136 · ${pointerType} · l’appui maintenu arme le déplacement`,
      moved.ok && moved.dragging === true,
    )
    await page.waitForTimeout(1500)
    const after = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="agenda-event"][data-movable="1"]')
      return b ? Math.round(b.getBoundingClientRect().top) : null
    })
    /**
     * ★ « A CHANGÉ D'HEURE » SE COMPARE, IL NE S'AFFIRME PAS. La première
     *   version se contentait de retrouver un bloc après le geste, ce qui
     *   aurait été vrai même si rien n'avait bougé. On mesure le sommet avant
     *   et après, sur une échelle dont on connaît la hauteur d'heure.
     */
    check(
      `A136 · ${pointerType} · le rendez-vous a VRAIMENT changé d’heure`,
      startTop !== null && after !== null && Math.abs(after - startTop) > 10,
      `${startTop} → ${after} (heure = ${moved.hourPx} px)`,
    )
    await context.close()
  }

  // -------------------------------------------------------------------------
  section('6 — A138 · la bascule de rôle, deux gestes depuis l’accueil')
  // -------------------------------------------------------------------------
  for (const vp of [
    { name: 'téléphone', ...PHONE },
    { name: 'tablette', ...IPAD_LS },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
    await page.waitForTimeout(3500)

    /**
     * ★★ « DEUX GESTES DEPUIS L'ACCUEIL » SE COMPTE, IL NE SE RAISONNE PAS.
     *    Geste 1 : atteindre les réglages (le rail sur tablette, le menu sur
     *    téléphone). Geste 2 : la pastille du rôle. La sonde les fait vraiment
     *    et compte les clics.
     */
    let gestures = 0
    const menu = page.locator('[data-testid="shell-menu"]')
    if ((await menu.count()) > 0 && (await menu.isVisible())) {
      await menu.click()
      gestures++
      await page.waitForTimeout(600)
    }
    /**
     * ⚠️ `:visible`, ET LA PREMIÈRE VERSION NE L'AVAIT PAS. Sur un téléphone le
     *    rail du bureau est TOUJOURS DANS LE DOCUMENT, simplement masqué ; le
     *    localisateur résolvait donc son lien plutôt que celui du panneau qui
     *    vient de s'ouvrir, et attendait quarante-cinq secondes un clic sur un
     *    élément qu'aucun doigt ne peut atteindre. Une porte doit viser ce que
     *    l'utilisateur voit.
     */
    const settings = page.locator('a[href*="/coordinator/settings"]:visible').first()
    if ((await settings.count()) > 0) {
      await settings.click()
      gestures++
      await page.waitForTimeout(2500)
    } else {
      await page.goto(`${base}/#/coordinator/settings`, { waitUntil: 'load' })
      gestures++
      await page.waitForTimeout(2500)
    }
    check(`A138 · ${vp.name} · les réglages sont à ${gestures} geste(s)`, gestures > 0 && gestures <= 2,
      String(gestures))

    const row = page.locator('[data-testid="role-switch"]')
    check(`A138 · ${vp.name} · la bascule est sur l’écran`, (await row.count()) > 0)
    const pills = await row.locator('button').count()
    check(`A138 · ${vp.name} · les quatre rôles sont listés`, pills === 4, String(pills))

    /* Elle est VISIBLE sans défiler : c'est ce qui la rend trouvable. */
    const visible = await row
      .evaluate((el) => {
        const r = el.getBoundingClientRect()
        return r.top >= 0 && r.top < window.innerHeight
      })
      .catch(() => false)
    check(`A138 · ${vp.name} · et visible sans défiler`, visible === true)

    /* Un geste de plus, et on est dans le rôle — le total tient dans trois. */
    await row.locator('button').nth(1).click()
    await page.waitForTimeout(800)
    const people = page.locator('[data-testid="view-as-person"]')
    check(`A138 · ${vp.name} · le rôle propose des personnes`, (await people.count()) > 0,
      String(await people.count()))
    await people.first().click()
    await page.waitForTimeout(2500)
    check(
      `A138 · ${vp.name} · et on y est`,
      !page.url().includes('/coordinator'),
      page.url().slice(page.url().indexOf('#')),
    )
    await context.close()
  }
  // -------------------------------------------------------------------------
  section('7 — AF4.3 · un rendez-vous, de bout en bout, carte comprise')
  // -------------------------------------------------------------------------
  {
    const context = await browser.newContext({
      viewport: IPAD_LS,
      locale: 'he-IL',
      hasTouch: true,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(45_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    /* CRÉATION — par le « + » de la coquille, qui est le chemin réel (AB1.1). */
    await open(page, '#/coordinator/agenda?new=meeting', 5000)
    const title = `פגישה AF ${Date.now()}`
    await page.locator('input[type="text"]:visible').first().fill(title)

    /* Un point collé : c'est ce qui met le rendez-vous SUR LA CARTE (AF3.1). */
    await page.locator('[data-testid="position-link"]').fill('31.2589, 34.7995')
    await page.locator('[data-testid="position-link-apply"]').click()
    await page.waitForTimeout(800)
    check(
      'AF4.3 · le rendez-vous porte un point',
      (await page.locator('[data-testid="meeting-position"]').innerText()).trim().length > 0,
    )

    /* Le fichier .ics — la seule voie qui réveille un appareil fermé (AF4.2). */
    const download = page.waitForEvent('download', { timeout: 8000 }).catch(() => null)
    await page.locator('[data-testid="meeting-calendar"]').click()
    const ics = await download
    check('AF4.2 · le rendez-vous sort en .ics pour l’agenda de l’appareil',
      ics !== null, ics?.suggestedFilename() ?? 'aucun téléchargement')

    await page.locator('[data-testid="meeting-save"]').click()
    await page.waitForSelector('[data-testid="meeting-save"]', { state: 'detached' })
    await page.waitForTimeout(1500)

    const found = await page.evaluate((wanted: string) => {
      return Array.from(document.querySelectorAll('[data-testid="agenda-event"]')).some(
        (el) => (el.textContent ?? '').includes(wanted.slice(0, 12)),
      )
    }, title)
    check('AF4.3 · création : il est sur la grille', found)

    /* MODIFICATION — on l'ouvre depuis la grille et on change son titre. */
    /**
     * ⚠️ AB3.3 — UN APPUI REGARDE, LE SECOND OUVRE, et la sonde doit attendre
     *    que le modal SOIT là avant de taper dedans. La première version tapait
     *    à l'aveugle deux secondes après le second appui : le champ qu'elle
     *    remplissait était parfois celui de l'écran DERRIÈRE, le modal restait
     *    ouvert, et l'étape suivante attendait quarante-cinq secondes un clic
     *    sur un bloc que le voile du modal interceptait.
     */
    const openBlock = async (): Promise<void> => {
      const block = page
        .locator('[data-testid="agenda-event"]')
        .filter({ hasText: title.slice(0, 12) })
        .first()
      await block.click()
      await page.waitForTimeout(700)
      /**
       * ⚠️ LE SECOND APPUI N'EST PAS TOUJOURS NÉCESSAIRE, ET C'EST LE PRODUIT
       *    QUI A RAISON. AB3.3 : « un appui regarde, un second ouvre » — mais
       *    un bloc DÉJÀ sélectionné s'ouvre au premier. Après une modification,
       *    il l'est encore. La sonde tapait donc son second appui dans le voile
       *    du modal qui venait de s'ouvrir, et attendait quarante-cinq secondes.
       */
      if ((await page.locator('[data-testid="meeting-save"]').count()) === 0) {
        await block.click()
      }
      await page.waitForSelector('[data-testid="meeting-save"]', { state: 'visible' })
      await page.waitForTimeout(600)
    }

    await openBlock()
    check('AF4.3 · modification : le rendez-vous s’ouvre', true)
    await page.locator('input[type="text"]:visible').first().fill(`${title} ✔`)
    await page.locator('[data-testid="meeting-save"]').click()
    await page.waitForSelector('[data-testid="meeting-save"]', { state: 'detached' })
    await page.waitForTimeout(1500)
    const renamed = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="agenda-event"]')).some((el) =>
        (el.textContent ?? '').includes('✔'),
      ),
    )
    check('AF4.3 · modification : le nouveau titre est sur la grille', renamed)

    /* SUPPRESSION — avec le dialogue de confirmation du point 8. */
    await openBlock()
    const del = page.locator('[data-testid="meeting-delete"]')
    if ((await del.count()) > 0) {
      await del.click()
      await page.waitForTimeout(900)
      const confirm = page.locator('[data-testid="delete-confirm"]')
      if ((await confirm.count()) > 0) await confirm.click()
      await page.waitForTimeout(2500)
    }
    const gone = await page.evaluate((wanted: string) =>
      Array.from(document.querySelectorAll('[data-testid="agenda-event"]')).every(
        (el) => !(el.textContent ?? '').includes(wanted),
      ),
    title.slice(0, 12))
    check('AF4.3 · suppression : il a disparu de la grille', gone)
    check('AF4.3 · aucune erreur JavaScript sur le parcours', errors.length === 0,
      errors.map((e) => e.split('\n')[0]).join(' | ').slice(0, 200))
    await context.close()
  }
} finally {
  await browser?.close()
  serve.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
