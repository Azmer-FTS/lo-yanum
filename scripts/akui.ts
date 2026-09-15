import { chromium, webkit } from 'playwright'
import type { Browser, BrowserType, Page } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AK — LE FORMULAIRE CALQUÉ, LA FENÊTRE, LES DOCUMENTS, L'ARCHIVAGE, DANS UN
 *      VRAI NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run akui                  (build de démonstration, WebKit puis Chromium)
 *   SKIP_BUILD=1 bun run akui
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum/demo bun run akui   (le déployé)
 *
 *   A196  le formulaire reproduit celui de l'association : libellés, ordre,
 *         gras, sauts de ligne, encadré, signature et son bouton d'effacement.
 *   A197  aucune liste déroulante de lieu ; ouverture depuis la fiche.
 *   A198  ת״ז et נייד : `inputmode=numeric` ; le nom : clavier texte ; aucune
 *         case sous 16 px (Safari iOS zoome sur un champ plus petit).
 *   A199  zéro initial d'une ת״ז : sur la fiche après enregistrement.
 *   A200  fenêtre modale : focus dedans et qui y reste ; croix atteignable au
 *         toucher ; échappement ; geste (tirer l'en-tête vers le bas).
 *   A201  le parcours au doigt sur iPad (1032×1376 et 1376×1032, `hasTouch`) :
 *         toucher le bouton, taper les manquants, signer AU DOIGT (événements
 *         tactiles réels dans Chromium), enregistrer — la fenêtre se ferme,
 *         l'accord est sur la fiche, le bouton dit « נחתם », le document
 *         précédent est consultable à la réouverture ; et le formulaire tient
 *         dans l'écran sans défilement.
 */

const PORT = Number(process.env.AKUI_PORT ?? 5301)
const OUT = process.env.OUT ?? 'dist-akpass'
const REMOTE = process.env.BASE_URL?.replace(/\/$/, '') ?? null
const IPAD_PORTRAIT = { width: 1032, height: 1376 }
const IPAD_LANDSCAPE = { width: 1376, height: 1032 }
const PHONE = { width: 402, height: 874 }

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

let base = REMOTE ?? `http://localhost:${PORT}`
let serve: ReturnType<typeof Bun.spawn> | null = null
if (!REMOTE) {
  const env = { ...process.env, VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }
  if (process.env.SKIP_BUILD !== '1') {
    const build = Bun.spawn(['bun', 'x', 'vite', 'build', '--outDir', OUT], { env, stdout: 'ignore', stderr: 'pipe' })
    if ((await build.exited) !== 0) {
      console.error(await new Response(build.stderr).text())
      throw new Error('vite build failed')
    }
  }
  serve = Bun.spawn(
    ['bun', 'x', 'vite', 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'],
    { env, stdout: 'ignore', stderr: 'ignore' },
  )
  const deadline = Date.now() + 40_000
  for (;;) {
    try { if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) break } catch { /* pas encore */ }
    if (Date.now() > deadline) throw new Error('vite preview did not come up')
    await Bun.sleep(300)
  }
}

async function open(page: Page, hash: string, settle = 2600): Promise<void> {
  await page.goto(`${base}/#/coordinator`, { waitUntil: 'load' })
  await page.waitForTimeout(700)
  await page.goto(`${base}/${hash}`, { waitUntil: 'load' })
  await page.waitForTimeout(settle)
}

async function tap(page: Page, testId: string): Promise<boolean> {
  const el = page.getByTestId(testId).first()
  if ((await el.count()) === 0) return false
  /* ⚠️ Au centre de l'écran, pas au bord : l'en-tête fixe d'un téléphone
     recouvre ce que `scrollIntoViewIfNeeded` pose en haut (la leçon de
     « elementFromPoint est aveugle derrière un en-tête opaque »). */
  await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }))
  await page.waitForTimeout(150)
  const box = await el.boundingBox()
  if (!box) return false
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
  return true
}

/** Un trait AU DOIGT : événements tactiles réels (CDP) dans Chromium, souris sinon. */
async function drag(
  page: Page,
  engine: string,
  points: Array<{ x: number; y: number }>,
): Promise<void> {
  if (engine === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    const [first, ...rest] = points
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: first.x, y: first.y }] })
    for (const p of rest) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
  } else {
    const [first, ...rest] = points
    await page.mouse.move(first.x, first.y)
    await page.mouse.down()
    for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 2 })
    await page.mouse.up()
  }
  await page.waitForTimeout(300)
}

async function signOnPad(page: Page, engine: string): Promise<void> {
  const pad = page.locator('[data-testid="assoc-form"] [data-testid="signature-pad"]')
  await pad.scrollIntoViewIfNeeded()
  const box = await pad.boundingBox()
  if (!box) return
  const pts: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= 24; i++) {
    pts.push({
      x: box.x + box.width * (0.8 - (i / 24) * 0.6),
      y: box.y + box.height * (0.5 + 0.25 * Math.sin(i / 2.5)),
    })
  }
  await drag(page, engine, pts)
}


/** A148, repris pour AK5.3 : la vignette contre tout ce qui flotte, au repos. */
export async function queueGeometry(page: Page, testId = 'farms-awaiting-docs') {
  return await page.evaluate((id) => {
    const chip = document.querySelector(`[data-testid="${id}"]`)
    if (!chip) return { present: false, inViewport: false, overlaps: [] as Array<{ testid: string; area: number }> }
    const r = chip.getBoundingClientRect()
    const floating = Array.from(document.querySelectorAll('body *'))
      .filter((el) => {
        if (chip.contains(el) || el.contains(chip)) return false
        const cs = getComputedStyle(el)
        if (cs.position !== 'fixed') return false
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false
        const b = el.getBoundingClientRect()
        return b.width > 8 && b.height > 8 && b.width < innerWidth * 0.9
      })
      .map((el) => {
        const b = el.getBoundingClientRect()
        const ox = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left))
        const oy = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top))
        return { testid: el.getAttribute('data-testid') ?? el.tagName.toLowerCase(), area: Math.round(ox * oy) }
      })
      .filter((f) => f.area > 0)
    return {
      present: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      inViewport: r.top >= 0 && r.left >= -1 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1,
      overlaps: floating,
    }
  }, testId)
}

const dialogOpen = (page: Page) => page.locator('[data-testid="assoc-form"]').count()

async function formScenario(browserType: BrowserType, engine: string): Promise<void> {
  const browser: Browser = await browserType.launch()
  try {
    const context = await browser.newContext({ viewport: IPAD_PORTRAIT, hasTouch: true, isMobile: engine === 'chromium' ? false : undefined })
    const page = await context.newPage()
    const errors: string[] = []
    /* « ResizeObserver loop » est un avertissement du moteur, pas une erreur de l'app. */
    page.on('pageerror', (e) => { if (!String(e).includes('ResizeObserver loop')) errors.push(String(e)) })

    /* farm-06 : ni שם החקלאי, ni ת״ז, ni נייד sur la fiche — les trois se saisissent. */
    await open(page, '#/coordinator/farms/farm-06')

    section(`A197 · A200 — ${engine} : ouverture depuis la fiche, focus`)
    check(`A197 · ${engine} · the fiche carries the button`, (await page.getByTestId('farm-open-assoc-form').count()) === 1)
    await tap(page, 'farm-open-assoc-form')
    await page.waitForTimeout(500)
    check(`A197 · ${engine} · one tap opens the form as a modal`, (await dialogOpen(page)) === 1)
    const dim = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="assoc-form"]')
      const overlay = d?.parentElement
      if (!overlay) return null
      const cs = getComputedStyle(overlay)
      const r = overlay.getBoundingClientRect()
      return { position: cs.position, cover: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, bg: cs.backgroundColor }
    })
    check(`A200 · ${engine} · the rest of the screen is dimmed (fixed overlay over the whole window)`,
      dim?.position === 'fixed' && dim.cover === true && dim.bg !== 'rgba(0, 0, 0, 0)', JSON.stringify(dim))
    check(`A200 · ${engine} · focus is inside the dialog`,
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="assoc-form"]')))
    for (let i = 0; i < 14; i++) await page.keyboard.press('Tab')
    check(`A200 · ${engine} · and fourteen Tabs later it is still inside`,
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="assoc-form"]')))
    await page.keyboard.press('Shift+Tab')
    check(`A200 · ${engine} · Shift+Tab stays inside too`,
      await page.evaluate(() => !!document.activeElement?.closest('[data-testid="assoc-form"]')))

    section(`A196 · A197 · A198 — ${engine} : le formulaire de l'association`)
    const structure = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="assoc-form"]') as HTMLElement
      const title = d.querySelector('[data-testid="assoc-form-title"]')?.textContent?.trim() ?? ''
      const logo = !!d.querySelector('[data-testid="assoc-form-logo"]')
      /* L'ordre DANS LE DOCUMENT de chaque élément attendu. */
      const order = [
        '[data-testid="assoc-form-title"]',
        'label[for="assoc-farmerName"]',
        'label[for="assoc-farmerId"]',
        'label[for="assoc-farmerPhone"]',
        '[data-testid="assoc-declaration"]',
        '[data-testid="assoc-signature"]',
        '[data-testid="assoc-save"]',
      ].map((sel) => d.querySelector(sel))
      const inOrder = order.every((el, i) =>
        el !== null && (i === 0 || (order[i - 1]!.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
      )
      const labels = ['assoc-farmerName', 'assoc-farmerId', 'assoc-farmerPhone'].map(
        (id) => d.querySelector(`label[for="${id}"]`)?.textContent?.trim() ?? '',
      )
      const decl = d.querySelector('[data-testid="assoc-declaration"]') as HTMLElement | null
      const declCs = decl ? getComputedStyle(decl) : null
      const lines = Array.from(d.querySelectorAll('[data-testid="assoc-declaration-line"]')).map((p) => p.textContent?.trim() ?? '')
      const bold = Array.from(d.querySelectorAll('[data-testid="assoc-declaration"] strong')).map((s) => s.textContent?.trim() ?? '')
      const heading = decl?.querySelector('h3')?.textContent?.trim() ?? ''
      const selects = d.querySelectorAll('select, [role="listbox"], [role="combobox"]').length
      const placeWord = (d.textContent ?? '').includes('מקום התנדבות')
      const inputs = Array.from(d.querySelectorAll('input')).map((i) => ({
        id: i.id,
        mode: i.getAttribute('inputmode'),
        type: i.type,
        font: parseFloat(getComputedStyle(i).fontSize),
      }))
      return {
        title, logo, inOrder, labels, heading, lines, bold, selects, placeWord, inputs,
        border: declCs ? parseFloat(declCs.borderTopWidth) : 0,
        pad: !!d.querySelector('[data-testid="signature-pad"]'),
        clear: !!d.querySelector('[data-testid="signature-clear"]'),
        save: d.querySelector('[data-testid="assoc-save"]')?.textContent?.trim() ?? '',
      }
    })
    check(`A196 · ${engine} · title « הסכם התנדבות- ארצנו » with the logo`, structure.title === 'הסכם התנדבות- ארצנו' && structure.logo, structure.title)
    check(`A196 · ${engine} · labels, verbatim: שם החקלאי · תז/חפ · נייד`,
      structure.labels.join('|') === 'שם החקלאי|תז/חפ|נייד', structure.labels.join(' · '))
    check(`A196 · ${engine} · order: title → name → id → phone → box → signature → save`, structure.inOrder)
    check(`A196 · ${engine} · the box is framed and titled « הצהרה ואישור »`, structure.border >= 1 && structure.heading === 'הצהרה ואישור', `${structure.border}px · ${structure.heading}`)
    const year = String(new Date().getFullYear())
    check(`A196 · ${engine} · two lines, the line break of their form kept`,
      structure.lines.length === 2 &&
        structure.lines[0].startsWith(`מאשר כי בשנת ${year} מתבצעת בשטחים החקלאיים שבהחזקתי`) &&
        structure.lines[0].endsWith('של משרד החקלאות וביטחון המזון.') &&
        structure.lines[1] === 'מתנדבי העמותה מסייעים לפחות באחד מהתחומים הבאים: שמירה, חקלאות ומרעה.',
      structure.lines.join(' ⏎ '))
    check(`A196 · ${engine} · the two bold passages, and only those`,
      structure.bold.join('|') === 'ארגון "ארצנו" מבית עמותת שיבת ציון לרגבי אדמתה|שמירה, חקלאות ומרעה.', structure.bold.join(' | '))
    check(`A196 · ${engine} · a signature pad with its clear button, then « שמירה »`, structure.pad && structure.clear && structure.save === 'שמירה', structure.save)
    check(`A197 · ${engine} · no drop-down of places, no « מקום התנדבות » anywhere`, structure.selects === 0 && !structure.placeWord, `${structure.selects} lists`)
    const mode = Object.fromEntries(structure.inputs.map((i) => [i.id, i]))
    check(`A198 · ${engine} · ת״ז opens the numeric pad (inputmode=numeric, type text — never number)`,
      mode['assoc-farmerId']?.mode === 'numeric' && mode['assoc-farmerId']?.type === 'text')
    check(`A198 · ${engine} · נייד opens the numeric pad`, mode['assoc-farmerPhone']?.mode === 'numeric')
    check(`A198 · ${engine} · שם החקלאי opens the text keyboard`, mode['assoc-farmerName']?.mode === 'text' && mode['assoc-farmerName']?.type === 'text')
    check(`A201 · ${engine} · no field under 16 px — Safari does not zoom`,
      structure.inputs.every((i) => i.font >= 16), structure.inputs.map((i) => `${i.id}:${i.font}`).join(' '))

    section(`A199 · A201 — ${engine} : le parcours au doigt`)
    /* Enregistrer vide : le refus nomme ce qui manque, la fenêtre reste. */
    await tap(page, 'assoc-save')
    check(`A201 · ${engine} · saving empty is refused, the window stays`, (await dialogOpen(page)) === 1 &&
      (await page.locator('[data-testid="assoc-form"] [role="alert"]').count()) >= 3)
    await tap(page, 'assoc-field-farmerName')
    await page.keyboard.type('יונתן מרגי')
    await tap(page, 'assoc-field-farmerId')
    await page.keyboard.type('021985189')
    await tap(page, 'assoc-field-farmerPhone')
    await page.keyboard.type('0508912840')
    const typed = {
      id: await page.getByTestId('assoc-field-farmerId').inputValue(),
      phone: await page.getByTestId('assoc-field-farmerPhone').inputValue(),
    }
    check(`A199 · ${engine} · the id keeps its leading zero as typed`, typed.id === '021985189', typed.id)
    check(`A198 · ${engine} · the mobile takes the (0XX) XXX-XXXX shape as it is typed`, typed.phone === '(050) 891-2840', typed.phone)
    await signOnPad(page, engine)
    const inked = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="assoc-form"] [data-testid="signature-pad"]') as HTMLCanvasElement
      const ctx = c.getContext('2d')!
      const data = ctx.getImageData(0, 0, c.width, c.height).data
      let n = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n++
      return n
    })
    check(`A201 · ${engine} · the finger drew ink on the pad`, inked > 200, `${inked} px`)
    await page.screenshot({ path: `docs/screenshots/akpass/local/${engine}-form-filled.png` })
    await tap(page, 'assoc-save')
    await page.waitForTimeout(700)
    check(`A201 · ${engine} · save closes the window`, (await dialogOpen(page)) === 0)
    check(`A201 · ${engine} · and the fiche says it is signed`,
      (await page.getByTestId('assoc-saved').count()) === 1 &&
        ((await page.getByTestId('farm-paper-state').textContent()) ?? '').startsWith('נחתם'),
      (await page.getByTestId('farm-paper-state').textContent()) ?? '')
    const identity = page.locator('section, details').filter({ has: page.getByTestId('farm-farmer-id-value') })
    if ((await page.getByTestId('farm-farmer-id-value').count()) === 0 || !(await page.getByTestId('farm-farmer-id-value').isVisible())) {
      /* le bloc d'identité est replié par défaut : on le déplie comme le PO */
      const heads = page.locator('button[aria-expanded="false"]')
      for (let i = 0; i < (await heads.count()); i++) {
        await heads.nth(i).click().catch(() => undefined)
        if (await page.getByTestId('farm-farmer-id-value').isVisible().catch(() => false)) break
      }
    }
    void identity
    const shown = (await page.getByTestId('farm-farmer-id-value').textContent().catch(() => '')) ?? ''
    check(`A199 · ${engine} · the fiche shows 021985189, zero included`, shown.trim() === '021985189', shown)
    const agreementRows = await page.locator('[data-testid="farm-paper"] [data-testid="agreement-view"]').count()
    check(`A201 · ${engine} · the signed document is attached to the fiche`, agreementRows >= 1, `${agreementRows}`)

    section(`A202 — ${engine} : signée sans documents`)
    const band = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="farm-awaiting-docs"]') as HTMLElement | null
      if (!b) return null
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      return { text: b.textContent ?? '', w: Math.round(r.width), color: cs.color, bg: cs.backgroundColor }
    })
    check(`A202 · ${engine} · the signed fiche says « ממתין למסמכים », in a full-width band`,
      !!band && band.text.includes('ממתין למסמכים') && band.w > 300, JSON.stringify(band))
    check(`A202 · ${engine} · and names what is missing`, !!band && band.text.includes('אישור שטחי מרעה'))

    section(`AK4.6 · A200 — ${engine} : réouverture, et les trois sorties`)
    await tap(page, 'farm-open-assoc-form')
    check(`AK4.6 · ${engine} · a signed farm says so, and the previous document is one tap away`,
      (await page.getByTestId('assoc-signed-before').count()) === 1 &&
        (await page.locator('[data-testid="assoc-signed-before"] [data-testid="agreement-view"]').count()) === 1)
    check(`AK4.2 · ${engine} · what the fiche now knows is shown frozen, not asked again`,
      (await page.locator('[data-testid="assoc-form"] input[data-prefilled="1"]').count()) === 3)
    /* La croix : atteignable AU TOUCHER (elementFromPoint en son centre). */
    const xReach = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="assoc-form"] [data-testid="modal-close"]') as HTMLElement
      const r = b.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return { hit: !!hit && b.contains(hit), w: r.width, h: r.height }
    })
    check(`A200 · ${engine} · the cross answers to a finger at its centre, ≥ 40 px`, xReach.hit && xReach.w >= 40 && xReach.h >= 40, JSON.stringify(xReach))
    await tap(page, 'modal-close')
    check(`A200 · ${engine} · the cross closes`, (await dialogOpen(page)) === 0)
    /* ⚠️ Safari ne donne pas le focus à un bouton qu'on touche : il n'y a donc
       rien à RENDRE dans WebKit. Chromium le donne, et il doit revenir. */
    if (engine === 'chromium') {
      check(`A200 · ${engine} · and focus returns to the button that opened it`,
        await page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'farm-open-assoc-form'))
    }
    await tap(page, 'farm-open-assoc-form')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    check(`A200 · ${engine} · Escape closes`, (await dialogOpen(page)) === 0)
    await tap(page, 'farm-open-assoc-form')
    const head = await page.getByTestId('modal-drag').boundingBox()
    if (head) {
      const x = head.x + head.width * 0.5
      const y0 = head.y + head.height / 2
      await drag(page, engine, Array.from({ length: 10 }, (_, i) => ({ x, y: y0 + i * 18 })))
    }
    await page.waitForTimeout(300)
    check(`A200 · ${engine} · pulling the header down closes (the gesture)`, (await dialogOpen(page)) === 0)
    await tap(page, 'farm-open-assoc-form')
    if (head) {
      const x = head.x + head.width * 0.5
      const y0 = head.y + head.height / 2
      await drag(page, engine, Array.from({ length: 3 }, (_, i) => ({ x, y: y0 + i * 12 })))
    }
    check(`A200 · ${engine} · a short pull does not close`, (await dialogOpen(page)) === 1)
    await page.keyboard.press('Escape')

    section(`A201 — ${engine} : debout, sans défilement`)
    for (const [label, vp] of [['iPad portrait', IPAD_PORTRAIT], ['iPad paysage', IPAD_LANDSCAPE]] as const) {
      await page.setViewportSize(vp)
      await open(page, '#/coordinator/farms/farm-06', 1800)
      await tap(page, 'farm-open-assoc-form')
      const fit = await page.evaluate(() => {
        const d = document.querySelector('[data-testid="assoc-form"]') as HTMLElement
        const save = d.querySelector('[data-testid="assoc-save"]') as HTMLElement
        const r = save.getBoundingClientRect()
        return { scroll: d.scrollHeight - d.clientHeight, saveBottom: Math.round(r.bottom), h: innerHeight }
      })
      check(`A201 · ${engine} · ${label} : the whole form, save button included, without scrolling`,
        fit.scroll <= 2 && fit.saveBottom <= fit.h, JSON.stringify(fit))
      await page.screenshot({ path: `docs/screenshots/akpass/local/${engine}-form-${vp.width}x${vp.height}.png` })
      await page.keyboard.press('Escape')
    }
    await page.setViewportSize(PHONE)
    await open(page, '#/coordinator/farms/farm-06', 1800)
    await tap(page, 'farm-open-assoc-form')
    const phone = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="assoc-form"]') as HTMLElement | null
      if (!d) return { overflowX: -1, width: -1 }
      return { overflowX: d.scrollWidth - d.clientWidth, width: Math.round(d.getBoundingClientRect().width) }
    })
    check(`A201 · ${engine} · on a phone it fits the width`, phone.overflowX >= 0 && phone.overflowX <= 1 && phone.width <= PHONE.width, JSON.stringify(phone))
    await page.keyboard.press('Escape')

    section(`A202 — ${engine} : la clôture refusée, la file`)
    await page.setViewportSize(IPAD_PORTRAIT)
    await open(page, '#/coordinator/farms/farm-06/edit', 2400)
    const statusSelect = page.locator('select').filter({ has: page.locator('option[value="active"]') }).first()
    await statusSelect.scrollIntoViewIfNeeded()
    await statusSelect.selectOption('active')
    await page.waitForTimeout(300)
    const refusal = await page.getByText('לא ניתן לסמן כ״פעילה״ — ממתין למסמכים').count()
    check(`A202 · ${engine} · choosing « פעילה » on a fiche without documents is refused, in words`, refusal >= 1)
    const saveBtn = page.locator('[data-testid="form-actions"] button').last()
    await saveBtn.click()
    await page.waitForTimeout(700)
    check(`A202 · ${engine} · and saving does not leave the form`, page.url().includes('/edit'), page.url())

    for (const vp of [PHONE, IPAD_LANDSCAPE]) {
      await page.setViewportSize(vp)
      await open(page, '#/coordinator/farms', 3000)
      const geo = await queueGeometry(page)
      await page.screenshot({ path: `docs/screenshots/akpass/local/${engine}-queue-${vp.width}.png` })
      check(`A202 · ${engine} · ${vp.width} px : « ממתינות למסמכים » entirely on screen at rest`,
        geo.present && geo.inViewport, JSON.stringify(geo))
      check(`A202 · ${engine} · ${vp.width} px : covered by nothing that floats (the « + » included)`,
        geo.present && geo.overlaps.length === 0, JSON.stringify(geo.overlaps))
      if (geo.present && vp.width === PHONE.width) {
        await page.getByTestId('farms-awaiting-docs').click()
        await page.waitForTimeout(500)
        const pressed = await page.getByTestId('farms-awaiting-docs').getAttribute('aria-pressed')
        check(`A202 · ${engine} · the chip IS the queue (it filters)`, pressed === 'true', String(pressed))
      }
    }

    section(`A204 — ${engine} : l'archivage, et le retour`)
    await page.setViewportSize(IPAD_LANDSCAPE)
    await open(page, '#/coordinator/farms', 3200)
    /* ⚠️ Dans le panneau étroit du mode splitté, les pastilles se replient
       derrière « סינון » (AB2) : on l'ouvre, comme le PO. */
    const openFilters = async (): Promise<void> => {
      if ((await page.getByTestId('farms-archived').count()) > 0) return
      if ((await page.getByTestId('filter-dropdown').count()) > 0) {
        await tap(page, 'filter-dropdown')
        await page.waitForTimeout(400)
      }
    }
    const rosterCount = async () =>
      await page.evaluate(() => ({
        rows: document.querySelectorAll('[data-testid="farms-top"]')[0]?.textContent?.match(/\d+/g)?.slice(0, 2) ?? [],
        markers: document.querySelectorAll('.maplibregl-marker').length,
        archivedPill: document.querySelector('[data-testid="farms-archived"]') !== null,
      }))
    const start = await rosterCount()
    await openFilters()
    check(`A204 · ${engine} · nothing is archived yet, so the filter is not drawn`,
      (await page.getByTestId('farms-archived').count()) === 0)

    await open(page, '#/coordinator/farms/farm-04', 3000)
    const archivedName = (await page.locator('h1').first().textContent()) ?? ''
    await tap(page, 'farm-archive')
    await page.waitForTimeout(400)
    check(`A204 · ${engine} · the gesture opens one short window with an optional reason`,
      (await page.getByTestId('archive-modal').count()) === 1 &&
        (await page.getByTestId('archive-reason').count()) === 1)
    await tap(page, 'archive-reason')
    await page.keyboard.type('התחרטו')
    await tap(page, 'archive-confirm')
    await page.waitForTimeout(800)
    const banner = (await page.getByTestId('farm-archived-banner').textContent().catch(() => '')) ?? ''
    check(`A204 · ${engine} · the fiche says it is archived, with the reason and the way back`,
      banner.includes('בארכיון') && banner.includes('התחרטו') &&
        (await page.getByTestId('farm-unarchive').count()) === 1, banner.trim())

    await open(page, '#/coordinator/farms', 3200)
    const beforeOpen = await rosterCount()
    await openFilters()
    const after = { ...(await rosterCount()), markers: beforeOpen.markers }
    const listText = await page.locator('[data-testid="farms-top"]').first().innerText()
    check(`A204 · ${engine} · it is gone from the roster and from the map`,
      after.markers === start.markers - 1 && !listText.includes(archivedName),
      `markers ${start.markers} → ${after.markers}`)
    check(`A204 · ${engine} · and a filter shows it, with its count`, after.archivedPill)
    await tap(page, 'farms-archived')
    await page.waitForTimeout(900)
    const inFilter = await page.evaluate(() => document.body.innerText)
    check(`A204 · ${engine} · the filter shows the archived fiche`, inFilter.includes(archivedName.trim()))

    await open(page, '#/coordinator/farms/farm-04', 3000)
    await tap(page, 'farm-unarchive')
    await page.waitForTimeout(800)
    check(`A204 · ${engine} · one gesture brings it back`,
      (await page.getByTestId('farm-archived-banner').count()) === 0)
    await open(page, '#/coordinator/farms', 3200)
    const backBefore = await rosterCount()
    await openFilters()
    const back = { ...(await rosterCount()), markers: backBefore.markers }
    check(`A204 · ${engine} · the roster and the map are as they were`,
      back.markers === start.markers && !back.archivedPill, `markers ${back.markers}`)

    check(`AK · ${engine} · no page error`, errors.length === 0, errors.slice(0, 2).join(' | '))
    await context.close()
  } finally {
    await browser.close()
  }
}

const { mkdirSync } = await import('node:fs')
mkdirSync('docs/screenshots/akpass/local', { recursive: true })

console.log('')
console.log('  AK — FORMULAIRE, FENÊTRE, DOCUMENTS, ARCHIVAGE')
console.log('  ==============================================')
console.log(`  ${base}`)

try {
  const only = process.env.ENGINE
  if (!only || only === 'webkit') await formScenario(webkit, 'webkit')
  if (!only || only === 'chromium') await formScenario(chromium, 'chromium')
} finally {
  serve?.kill()
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
