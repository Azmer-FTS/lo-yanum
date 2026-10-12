import { mkdirSync } from 'node:fs'

import type { Page } from 'playwright'

import { FakeDb } from './fake-supabase'
import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { MAPPINGS } from '../src/data/rows'
import type { Institution } from '../src/core/institutions'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BB — LE MENU « ⋯ » ET LES INSTITUTIONS, AU RENDU.   A408 · A409 · A410
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bbui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bbui    # le DÉPLOYÉ
 *
 * Build réel (ou bundle déployé) + base FACTICE aux noms et numéros INVENTÉS
 * (050-000-08xx, 08-600-08xx). Rien n'est écrit sur `lo-yanum-prod`.
 *
 *   A408  le menu « ⋯ » sort de sa rangée : ouvert depuis une vignette (mode
 *         carte), une rangée de tableau, la DERNIÈRE rangée ; entièrement
 *         visible (rien ne le recouvre, rien ne le coupe), à 390 px et en
 *         pleine largeur, clair et sombre ; Échap le ferme et rend le focus
 *   A409  la fiche : deux ראשי ישיבה dans l'ordre, ר״מ derrière, deux numéros
 *         (portable d'abord) chacun appelable, la מזכירות appelable, les
 *         notes visibles, la fiche liée, « ראש המכינה »
 *   A410  la liste : le premier rang 1 qui a un téléphone ; jamais la
 *         מזכירות ; « נדרש תיאום מוקדם » avec son texte, appel non ordinaire,
 *         filtre ; un alias trouve la fiche ; l'aperçu
 */

const OUT = process.env.DIST ?? 'dist-bbui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5443), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bb/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const at = '2026-10-12T08:00:00.000Z'
const inst = (over: Partial<Institution>): Institution => ({
  id: 'inst-bb-x', name: '', locality: 'נתיבות', kind: 'hesder', audience: 'boys', network: '', position: { lat: 31.42, lng: 34.59 }, positionUncertain: false,
  engagement: 'signed', contactName: '', contactPhone: '', notes: '', extra: '', source: 'manual', engagementConfirmed: true, metOn: null, students: null,
  positionSource: '', aliases: '', createdAt: at, updatedAt: at, contacts: [], ...over,
})
const TWO = inst({
  id: 'inst-bb-two', name: 'ישיבת הדגמה שני ראשים', aliases: 'ישיבת כפר הדגמה · כפר הדגמה', notes: 'הישיבה שוכנת זמנית במקום אחר.', officePhone: '08-6000801', officeAddress: 'רח׳ הדגמה 1',
  contacts: [
    { id: 'ic-bb-1', role: 'head', name: 'הרב ראשון בלי טלפון', phone: '', note: '' },
    { id: 'ic-bb-2', role: 'head', name: 'הרב שני', phone: '', note: 'רב היישוב', phones: [{ number: '08-6000802', label: 'home' }, { number: '050-0000802', label: 'mobile' }] },
    { id: 'ic-bb-3', role: 'ram', name: 'הרב רם הדגמה', phone: '050-0000803', note: '' },
  ],
  relatedIds: ['inst-bb-mech'],
})
const MECH = inst({
  id: 'inst-bb-mech', name: 'מכינת הדגמה', kind: 'mechina', position: { lat: 31.3, lng: 34.62 }, officePhone: '08-6000804',
  contacts: [
    { id: 'ic-bb-4', role: 'ram', name: 'הרב אלבז הדגמה', phone: '050-0000805', note: 'נציג ראש המכינה מול הארגון' },
    { id: 'ic-bb-5', role: 'head', name: 'הרב ראש מכינה', phone: '050-0000804', note: '' },
  ],
})
const BLOCKED = inst({
  id: 'inst-bb-block', name: 'ישיבת הדגמה בהמתנה', kind: 'yeshiva_hs', engagement: 'not_contacted', position: { lat: 31.25, lng: 34.4 },
  coordinationRequired: true, coordinationNote: 'יש ליצור קשר דרך רכז ההדגמה לפני כל פנייה.', officePhone: '08-6000806',
  contacts: [{ id: 'ic-bb-6', role: 'head', name: 'הרב חסום', phone: '050-0000806', note: '' }],
})
const OFFICE_ONLY = inst({ id: 'inst-bb-office', name: 'ישיבת הדגמה בלי ראש', position: { lat: 31.6, lng: 34.7 }, officePhone: '08-6000807', contacts: [{ id: 'ic-bb-7', role: 'ram', name: 'הרב רם לבד', phone: '050-0000807', note: '' }] })
const ALL = [TWO, MECH, BLOCKED, OFFICE_ONLY]

const db = (): FakeDb => {
  const d = new FakeDb()
  seed(d)
  for (const i of ALL) d.rows('institutions').push({ ...MAPPINGS.institutions.toRows(i)[0].rows[0] })
  return d
}

// ---------------------------------------------------------------------------
// Le menu : où il est, ce qui le recouvre, qui le contient.
// ---------------------------------------------------------------------------
async function measureMenu(page: Page, toggleSel: string): Promise<{ ok: boolean; why: string }> {
  return page.evaluate((sel) => {
    const btn = document.querySelector(sel) as HTMLElement | null
    const menu = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"][data-overlay]')).find((m) => m.getBoundingClientRect().height > 0)
    if (!btn || !menu) return { ok: false, why: `bouton ${!!btn} menu ${!!menu}` }
    const r = menu.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const why: string[] = []
    if (menu.parentElement !== document.body) why.push('pas dans <body>')
    if (getComputedStyle(menu).position !== 'fixed') why.push('pas fixed')
    if (r.left < 0 || r.right > vw + 0.5 || r.top < 0 || r.bottom > vh + 0.5) why.push(`hors écran ${Math.round(r.left)},${Math.round(r.top)}→${Math.round(r.right)},${Math.round(r.bottom)} / ${vw}x${vh}`)
    if (menu.scrollHeight > menu.clientHeight + 1) why.push('menu tronqué (défile)')
    // Rien ne le recouvre ni ne le coupe : chaque point de son intérieur est à lui.
    const pts: Array<[number, number]> = []
    for (const fx of [0.08, 0.5, 0.92]) for (const fy of [0.06, 0.5, 0.94]) pts.push([r.left + r.width * fx, r.top + r.height * fy])
    const lost = pts.filter(([x, y]) => !menu.contains(document.elementFromPoint(x, y)))
    if (lost.length) why.push(`${lost.length}/9 points recouverts`)
    // Accroché au bouton : juste dessous ou juste au-dessus.
    const gap = Math.min(Math.abs(r.top - b.bottom), Math.abs(b.top - r.bottom))
    if (gap > 16) why.push(`loin du bouton (${Math.round(gap)} px)`)
    const items = menu.querySelectorAll('[role="menuitem"]').length
    if (items === 0) why.push('aucun article')
    if (btn.getAttribute('aria-expanded') !== 'true') why.push('aria-expanded ≠ true')
    return { ok: why.length === 0, why: why.join(' · ') || `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.left)},${Math.round(r.top)}, ${items} articles` }
  }, toggleSel)
}

async function tryMenu(page: Page, label: string, toggleSel: string, shot: string): Promise<void> {
  const t = page.locator(toggleSel).first()
  await t.scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  await t.click()
  await page.waitForTimeout(400)
  const m = await measureMenu(page, toggleSel)
  check(`A408 ${label} : entièrement visible`, m.ok, m.why)
  await page.screenshot({ path: `${SHOTS}/${shot}.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  const closed = await page.evaluate((sel) => {
    const open = Array.from(document.querySelectorAll('[role="menu"][data-overlay]')).length
    return { open, focus: document.activeElement === document.querySelector(sel) }
  }, toggleSel)
  check(`A408 ${label} : Échap le ferme et rend le focus au bouton`, closed.open === 0 && closed.focus, JSON.stringify(closed))
}

const toggles = async (page: Page, prefix: string): Promise<string[]> =>
  page.locator(`[data-testid^="${prefix}"][data-testid$="-toggle"]`).evaluateAll((els) =>
    els.filter((e) => (e as HTMLElement).getBoundingClientRect().width > 0 || (e as HTMLElement).offsetParent !== null).map((e) => `[data-testid="${e.getAttribute('data-testid')}"]`),
  )

await guard('A408', async () => {
  section('A408 — le menu « ⋯ » n’est plus coupé par sa rangée')
  for (const width of [1440, 390]) {
    for (const dark of [false, true]) {
      const tag = `${width}${dark ? '-sombre' : ''}`
      /* Mode carte : les vignettes. */
      const o = await open(width, { db: db(), dark })
      await go(o.page, APP, '/coordinator/farms')
      await o.page.locator('[data-testid="map-mode-split"]').first().click({ timeout: 6000 }).catch(() => undefined)
      await o.page.waitForTimeout(1200)
      const inTiles = await o.page.locator('[data-testid="farm-tile"] [data-testid^="farms-table-menu-"][data-testid$="-toggle"]').evaluateAll((els) => els.map((e) => `[data-testid="${e.getAttribute('data-testid')}"]`))
      if (inTiles.length > 0) {
        await tryMenu(o.page, `${tag} vignette (mode carte), la première`, inTiles[0], `a408-vignette-${tag}`)
        await tryMenu(o.page, `${tag} vignette (mode carte), la dernière`, inTiles[inTiles.length - 1], `a408-vignette-derniere-${tag}`)
      } else {
        check(`A408 ${tag} des vignettes avec « ⋯ » en mode carte`, width < 700, 'aucune vignette')
      }
      await o.ctx.close()
      /* Mode tableau : une rangée, puis la dernière. */
      const p = await open(width, { db: db(), dark })
      await go(p.page, APP, '/coordinator/farms')
      await p.page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 6000 }).catch(() => undefined)
      await p.page.waitForTimeout(1000)
      const rows = await toggles(p.page, 'farms-table-menu-')
      check(`A408 ${tag} le tableau a ses « ⋯ »`, rows.length > 3, String(rows.length))
      if (rows.length > 3) {
        await tryMenu(p.page, `${tag} rangée de tableau`, rows[1], `a408-rangee-${tag}`)
        await tryMenu(p.page, `${tag} DERNIÈRE rangée`, rows[rows.length - 1], `a408-derniere-${tag}`)
      }
      check(`A408 ${tag} aucune erreur de page`, o.errors.length === 0 && p.errors.length === 0, [...o.errors, ...p.errors].slice(0, 2).join(' | '))
      await p.ctx.close()
    }
  }
  /* Une autre liste : le composant est commun. */
  const q = await open(1440, { db: db() })
  await go(q.page, APP, '/coordinator/institutions')
  await q.page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 6000 }).catch(() => undefined)
  await q.page.waitForTimeout(800)
  const inst = await toggles(q.page, 'institutions-table-menu-')
  if (inst.length) await tryMenu(q.page, 'institutions, dernière rangée', inst[inst.length - 1], 'a408-institutions')
  else check('A408 institutions : des « ⋯ »', false)
  /* Le clavier : ↓ passe à l'article suivant, dans le menu. */
  const sel = inst[0]
  await q.page.locator(sel).click()
  await q.page.waitForTimeout(300)
  const kb = await q.page.evaluate(() => {
    const first = document.activeElement?.getAttribute('role')
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    const menu = document.querySelector('[role="menu"][data-overlay]')
    return { first, inMenu: !!menu && menu.contains(document.activeElement) }
  })
  check('A408 le focus entre dans le menu (premier article), ↓ y reste', kb.first === 'menuitem' && kb.inMenu, JSON.stringify(kb))
  await q.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A409', async () => {
  section('A409 — la fiche d’une institution')
  for (const dark of [false, true]) {
    const o = await open(1440, { db: db(), dark })
    await go(o.page, APP, `/coordinator/institutions/${TWO.id}`)
    const box = o.page.locator('[data-testid="institution-contacts"]')
    const roles = await box.locator('[data-testid^="institution-contact-ic-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-role')}:${e.getAttribute('data-testid')}`))
    check('A409 deux ראשי ישיבה, dans l’ordre, le ר״מ derrière', roles.join(',') === 'head:institution-contact-ic-bb-1,head:institution-contact-ic-bb-2,ram:institution-contact-ic-bb-3', roles.join(','))
    const two = o.page.locator('[data-testid="institution-contact-ic-bb-2"]')
    const calls = await two.locator('[data-testid="institution-contact-call"]').evaluateAll((els) => els.map((e) => e.getAttribute('href')))
    check('A409 deux numéros sur la fiche du second, chacun appelable, le portable d’abord', calls.join(' ') === 'tel:0500000802 tel:086000802', calls.join(' '))
    const office = o.page.locator('[data-testid="institution-office"] [data-testid="institution-office-call"]')
    check('A409 la מזכירות, étiquetée et appelable', (await office.count()) === 1 && (await office.getAttribute('href')) === 'tel:086000801' && (await office.innerText()).includes('מזכירות'), await office.innerText().catch(() => '∅'))
    const notes = await o.page.locator('[data-testid="institution-editor"] textarea').first().inputValue()
    check('A409 la note de la fiche est visible', notes.includes('שוכנת זמנית'))
    check('A409 la note d’un contact est visible', (await two.locator('[data-testid="institution-contact-note"]').inputValue()) === 'רב היישוב')
    check('A409 la fiche liée (et le lien est réciproque)', (await o.page.locator(`[data-testid="institution-related-${MECH.id}"]`).count()) === 1)
    await o.page.screenshot({ path: `${SHOTS}/a409-fiche${dark ? '-sombre' : ''}.png`, fullPage: true })
    await go(o.page, APP, `/coordinator/institutions/${MECH.id}`)
    const mech = await o.page.locator('[data-testid="institution-contacts"] [data-testid^="institution-contact-ic-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-role')))
    check('A409 la מכינה : ראש המכינה en tête, le ר״מ derrière', mech.join(',') === 'head,ram', mech.join(','))
    const label = await o.page.locator('[data-testid="institution-contact-ic-bb-5"] [data-testid="institution-contact-role"] option:checked').innerText()
    check('A409 … son libellé est « ראש המכינה »', label.trim() === 'ראש המכינה', label)
    check('A409 … et la fiche liée y paraît aussi', (await o.page.locator(`[data-testid="institution-related-${TWO.id}"]`).count()) === 1)
    /* Ajouter un numéro : gardé en base, portable d'abord. */
    if (!dark) {
      const c = o.page.locator('[data-testid="institution-contact-ic-bb-4"]')
      await c.locator('[data-testid="institution-contact-phone-add"]').click()
      await c.locator('[data-testid="institution-contact-phone-1"] input[data-kind="phone"]').fill('086000809')
      await c.locator('[data-testid="institution-contact-phone-1"] select').selectOption('home')
      await o.page.waitForTimeout(1500)
      const row = o.db.rows('institutions').find((r) => r.id === MECH.id) as { contacts?: Array<{ id: string; phones?: Array<{ number: string }> }> } | undefined
      const kept = row?.contacts?.find((x) => x.id === 'ic-bb-4')?.phones?.map((p) => p.number.replace(/\D/g, '')) ?? []
      check('A409 un second numéro saisi est gardé en base, le portable d’abord', kept.join(' ') === '0500000805 086000809', kept.join(' '))
      const mode = await c.locator('[data-testid="institution-contact-phone-1"] input[data-kind="phone"]').getAttribute('inputmode')
      check('A409 … le champ ouvre le pavé numérique', mode === 'numeric', String(mode))
    }
    check('A409 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
})

// ---------------------------------------------------------------------------
await guard('A410', async () => {
  section('A410 — la liste : tête, מזכירות, coordination préalable, alias')
  for (const width of [1440, 390]) {
    const o = await open(width, { db: db() })
    await go(o.page, APP, '/coordinator/institutions')
    await o.page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 6000 }).catch(() => undefined)
    await o.page.waitForTimeout(900)
    const row = (id: string) => o.page.locator(`[data-testid="institution-row-${id}"]`).first()
    const two = await row(TWO.id).innerText()
    check(`A410 ${width} la ligne montre le PREMIER rang 1 qui a un téléphone`, two.includes('הרב שני') && !two.includes('הרב ראשון בלי טלפון'), two.replace(/\s+/g, ' ').slice(0, 140))
    const officeOnly = await row(OFFICE_ONLY.id).innerText()
    check(`A410 ${width} sans rang 1 : « חסר ראש ישיבה », jamais la מזכירות`, officeOnly.includes('חסר ראש ישיבה') && !officeOnly.replace(/\D/g, '').includes('86000807'), officeOnly.replace(/\s+/g, ' ').slice(0, 140))
    const blocked = await row(BLOCKED.id).innerText()
    check(`A410 ${width} « נדרש תיאום מוקדם » AVEC son texte dans la ligne`, blocked.includes('נדרש תיאום מוקדם') && blocked.includes('דרך רכז ההדגמה'), blocked.replace(/\s+/g, ' ').slice(0, 160))
    if (width > 700) {
      const call = row(BLOCKED.id).locator(`[data-testid="institution-call-${BLOCKED.id}"]`)
      check(`A410 ${width} son bouton d’appel n’est pas ordinaire`, (await call.count()) === 1 && (await call.getAttribute('data-guarded')) === '')
      /* L'appel demande de relire le texte : refusé, rien ne part. */
      let asked = ''
      o.page.once('dialog', (d) => {
        asked = d.message()
        void d.dismiss()
      })
      await call.click()
      await o.page.waitForTimeout(300)
      check(`A410 ${width} toucher l’appel montre le texte d’abord`, asked.includes('דרך רכז ההדגמה'), asked.slice(0, 80))
      const normal = row(TWO.id).locator(`[data-testid="institution-call-${TWO.id}"]`)
      check(`A410 ${width} une institution sans marqueur garde un appel ordinaire`, (await normal.count()) === 1 && (await normal.getAttribute('data-guarded')) === null)
    }
    /* Le menu de la ligne : l'article d'appel DIT le texte. */
    await row(BLOCKED.id).locator(`[data-testid="institutions-table-menu-${BLOCKED.id}-toggle"]`).click()
    await o.page.waitForTimeout(300)
    const guarded = o.page.locator(`[data-testid="institution-call-guarded-${BLOCKED.id}"]`)
    check(`A410 ${width} le menu : « appeler » remplacé par le texte`, (await guarded.count()) === 1 && (await guarded.innerText()).includes('דרך רכז ההדגמה'))
    await o.page.keyboard.press('Escape')
    /* Le filtre. ★★ BC — ADAPTÉE : à 390 px, les filtres sont dans la FEUILLE
       derrière « סינון » (brief BC 3b) ; la valeur y porte `-option`, et la
       pastille à croix sous la barre l'enlève. */
    const sheetMode = (await o.page.locator('[data-testid="institutions-filter-coordination"]').count()) === 0
    if (sheetMode) {
      await o.page.locator('[data-testid="filter-sheet-open"]').first().click().catch(() => undefined)
      await o.page.waitForTimeout(450)
    }
    const pill = o.page.locator(sheetMode ? '[data-testid="institutions-filter-coordination-option"]' : '[data-testid="institutions-filter-coordination"]')
    check(`A410 ${width} le filtre « תיאום מוקדם » existe`, (await pill.count()) === 1)
    if (await pill.count()) {
      await pill.click()
      await o.page.waitForTimeout(500)
      if (sheetMode) {
        await o.page.locator('[data-testid="filter-sheet-show"]').click()
        await o.page.waitForTimeout(400)
      }
      const shown = await o.page.locator('[data-testid^="institution-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
      check(`A410 ${width} … il ne garde que les fiches marquées`, shown.length === 1 && shown[0] === `institution-row-${BLOCKED.id}`, shown.join(','))
      await o.page.screenshot({ path: `${SHOTS}/a410-filtre-${width}.png` })
      if (sheetMode) {
        await o.page.locator('[data-testid="institutions-filter-coordination-chip"]').click()
      } else {
        await pill.click()
        await o.page.waitForTimeout(300)
        await o.page.locator('[data-testid="institutions-filter-all"]').click().catch(() => undefined)
      }
      await o.page.waitForTimeout(300)
    }
    /* Un alias. */
    await o.page.locator('[data-testid="list-search-open"]').first().click().catch(() => undefined)
    await o.page.locator('[data-testid="list-search-panel"] input, [data-testid="institutions-top"] input[type="search"]').first().fill('כפר הדגמה')
    await o.page.waitForTimeout(600)
    const found = await o.page.locator('[data-testid^="institution-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
    check(`A410 ${width} un alias trouve la fiche`, found.length === 1 && found[0] === `institution-row-${TWO.id}`, found.join(','))
    check(`A410 ${width} aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
  /* L'aperçu. */
  const p = await open(1440, { db: db() })
  await go(p.page, APP, '/coordinator/institutions')
  await p.page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 6000 }).catch(() => undefined)
  await p.page.waitForTimeout(800)
  await p.page.locator(`[data-testid="institution-view-${BLOCKED.id}"]`).first().click()
  await p.page.waitForTimeout(800)
  const prev = p.page.locator('[data-testid="institution-preview"]').first()
  check('A410 l’aperçu : la bannière de coordination et son texte', (await prev.locator('[data-testid="institution-coordination-banner"]').innerText()).includes('דרך רכז ההדגמה'))
  check('A410 l’aperçu : l’appel n’est pas ordinaire', (await prev.locator('[data-testid="institution-preview-call"]').getAttribute('data-guarded')) === '')
  check('A410 l’aperçu : la מזכירות appelable', (await prev.locator('[data-testid="institution-office-call"]').getAttribute('href')) === 'tel:086000806')
  await p.page.screenshot({ path: `${SHOTS}/a410-apercu.png` })
  await p.page.locator(`[data-testid="institution-view-${TWO.id}"]`).first().click()
  await p.page.waitForTimeout(800)
  const lines = await prev.locator('[data-testid^="institution-contact-line-ic-"]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-role')}:${e.getAttribute('data-phones')}`))
  check('A410 l’aperçu : les deux rangs 1, le second avec ses deux numéros', lines.join(',') === 'head:0,head:2,ram:1', lines.join(','))
  await p.ctx.close()
})

await finish()
