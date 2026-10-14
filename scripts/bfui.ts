import { mkdirSync } from 'node:fs'

import type { Page } from 'playwright'

import { REMOTE, TOUR, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { FakeDb } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BF — AU RENDU.   A453 · A454 · A455 · A456 · A457 · A458 · A459 · A460
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bfui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bfui    # le DÉPLOYÉ
 *   DIST=dist-bf-before SKIP_BUILD=1 ONLY=A457 bun run bfui      # le build d'AVANT BF
 *
 * Build réel (ou bundle déployé) + base FACTICE. Les fiches ajoutées ici sont
 * INVENTÉES ; la porte n'imprime aucun nom ni numéro des fiches du banc.
 *
 *   A453  ⌘K / Ctrl+K : la fenêtre s'ouvre PAR-DESSUS l'écran (rien ne bouge
 *         derrière), le champ a le focus et il est vide ; Échap, un toucher
 *         dehors et le bouton retour la ferment ; le focus revient ; RTL et
 *         sombre ; rien ne s'ouvre par-dessus une fenêtre bloquante
 *   A454  deux ou trois lettres : au moins deux groupes, chacun son intertitre
 *         et son compte ; la portion trouvée surlignée ; « לא נמצאו תוצאות »
 *   A455  ↓ ↓ Entrée : la bonne fiche, la fenêtre fermée ; la ligne active
 *         annoncée (listbox / option / aria-activedescendant) ; « נצפו
 *         לאחרונה » à la réouverture
 *   A456  la loupe : 44 px au téléphone (et dans le rail) ; lignes de 48 px
 *   A457  ★ TÂCHE 1 — LA PREUVE : la carte ouverte, un zoom et un glissé du PO,
 *         25 secondes et DEUX relectures des données (l'ordre des fiches changé
 *         côté serveur, comme Postgres le fait) : centre et zoom IDENTIQUES —
 *         sur l'écran des institutions et sur la carte de couverture
 *   A458  … mais une autre institution choisie recadre bien, la main est
 *         rendue ; « מרכוז מחדש » n'apparaît qu'après un geste et y ramène
 *   A459  un résultat de recherche (institution, ferme) centre la carte dessus
 *   A460  non-régression : le menu « ⋯ » entièrement hors de sa ligne ; la
 *         bulle de la couverture se ferme sans effacer les trajets
 */

const OUT = process.env.DIST ?? 'dist-bfui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5471), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bf/${REMOTE ? 'deployed' : OUT === 'dist-bfui' ? 'local' : OUT}`
mkdirSync(SHOTS, { recursive: true })

// --- La base : celle du banc, plus une ferme et une institution INVENTÉES ----

const BF_FARM = { id: 'farm-bf-1', name: 'חוות הדגמה במדבר', locality: 'אופקים', lat: 31.3105, lng: 34.6201 }
const BF_INST = { id: 'inst-bf-1', name: 'מכינת בדיקה אופקים', locality: 'אופקים', lat: 31.3172, lng: 34.6297 }
const INST_A = TOUR[0]
const INST_B = TOUR[3]

function bfDb(): FakeDb {
  const d = new FakeDb()
  seed(d)
  /* ⚠️ Les fiches du banc de base portent des noms et des numéros RÉELS (le
     stock d'avant BA). Rebaptisées ici, pour qu'aucune capture de cette porte
     — publiée dans le dépôt — n'en montre un. Les localités (des lieux
     publics) et les positions restent. */
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-11${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
  })
  const farm = { ...d.rows('entities')[0], id: BF_FARM.id, name: BF_FARM.name, locality: BF_FARM.locality, farmer_name: 'ישראל בדיקה', farmer_phone: '050-000-0123', lat: BF_FARM.lat, lng: BF_FARM.lng, position_missing: false, archived_at: null, status: 'signed' }
  d.rows('entities').push(farm)
  const inst = { ...d.rows('institutions')[0], id: BF_INST.id, name: BF_INST.name, locality: BF_INST.locality, lat: BF_INST.lat, lng: BF_INST.lng, contacts: [], contact_name: '', contact_phone: '', aliases: '' }
  d.rows('institutions').push(inst)
  serverOrder(d)
  return d
}

/**
 * ★ L'ORDRE DU SERVEUR N'EST PAS CELUI DU CACHE. Postgres rend les lignes dans
 *   l'ordre physique de la table (sans `order by`) ; IndexedDB les rend triées
 *   par clé. On les range ici À L'ENVERS des clés, et on les remue à chaque
 *   relecture : c'est ce que fait la production.
 */
function serverOrder(d: FakeDb, shuffle = 0): void {
  for (const table of ['entities', 'institutions', 'leads', 'volunteers']) {
    const rows = d.rows(table)
    rows.sort((x, y) => String(y.id).localeCompare(String(x.id)))
    for (let i = 0; i < shuffle % Math.max(rows.length, 1); i++) rows.push(rows.shift()!)
  }
}

type Camera = { lat: number; lng: number; zoom: number; loaded: boolean }
const camera = (page: Page): Promise<Camera> =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number; loaded(): boolean } }).__loYanumMap
    if (!m) return { lat: NaN, lng: NaN, zoom: NaN, loaded: false }
    const c = m.getCenter()
    /* Publiée au `load` : sa présence suffit (les tuiles, elles, arrivent sans fin). */
    return { lat: c.lat, lng: c.lng, zoom: m.getZoom(), loaded: true }
  })
const fmt = (c: Camera) => `${c.lat.toFixed(5)},${c.lng.toFixed(5)} z${c.zoom.toFixed(3)}`
const sameCamera = (a: Camera, b: Camera) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7 && Math.abs(a.zoom - b.zoom) < 1e-6
const near = (c: Camera, p: { lat: number; lng: number }, deg = 0.02) => Math.abs(c.lat - p.lat) < deg && Math.abs(c.lng - p.lng) < deg

async function waitMap(page: Page, ms = 12000): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if ((await camera(page)).loaded) return true
    await page.waitForTimeout(250)
  }
  return false
}

/** Le PO : la molette au milieu de la carte, puis un glissé. Des VRAIS événements. */
async function userMoves(page: Page): Promise<void> {
  /* Un point où la TOILE de la carte est vraiment sous le doigt (pas l'aperçu
     docké, ni la légende, ni la barre de rappel). */
  const at = await page.evaluate(() => {
    const map = document.querySelector('[role="application"].maplibregl-map') as HTMLElement | null
    if (!map) return null
    const r = map.getBoundingClientRect()
    for (const fy of [0.55, 0.45, 0.65, 0.35, 0.75])
      for (const fx of [0.5, 0.35, 0.65, 0.25, 0.75]) {
        const x = r.left + r.width * fx
        const y = r.top + r.height * fy
        const el = document.elementFromPoint(x, y)
        if (el && el.classList.contains('maplibregl-canvas')) return { x, y }
      }
    return null
  })
  if (!at) throw new Error('aucun point libre sur la carte')
  const cx = at.x
  const cy = at.y
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, -360)
  await page.waitForTimeout(900)
  await page.mouse.down()
  await page.mouse.move(cx + 70, cy + 35, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
}

const readsOf = (page: Page, table: string): { count: number } => {
  const box = { count: 0 }
  page.on('request', (r) => {
    if (r.method() === 'GET' && r.url().includes(`/rest/v1/${table}`)) box.count += 1
  })
  return box
}

const searchOpen = (page: Page) => page.locator('[data-testid="global-search"]').count().then((n) => n === 1)

// ---------------------------------------------------------------------------
await guard('A453', async () => {
  section('A453 — ⌘K / Ctrl+K, par-dessus l’écran')
  const o = await open(1440, { db: bfDb(), height: 900 })
  const page = o.page
  await go(page, APP, '/coordinator/farms', 4000)
  const hash0 = await page.evaluate(() => location.hash)
  const field = page.locator('[data-testid="rail-farms"]').first()
  await field.focus()
  await page.evaluate(() => document.activeElement?.setAttribute('data-bf-opener', '1'))
  const boxBefore = await page.locator('[data-map-panel]').first().boundingBox()
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  const focus = await page.evaluate(() => ({ id: document.activeElement?.getAttribute('data-testid'), value: (document.activeElement as HTMLInputElement | null)?.value }))
  check('A453 Ctrl+K — depuis un champ — ouvre la recherche', await searchOpen(page))
  check('A453 … le champ a le focus, et il est vide', focus.id === 'global-search-input' && focus.value === '', JSON.stringify(focus))
  const shape = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="global-search"]') as HTMLElement
    const dialog = root.querySelector('[role="dialog"]') as HTMLElement
    const r = dialog.getBoundingClientRect()
    return { pos: getComputedStyle(root).position, inset: root.getBoundingClientRect().width === innerWidth, overlay: root.hasAttribute('data-overlay'), modal: dialog.getAttribute('aria-modal'), dir: getComputedStyle(dialog).direction, centre: Math.abs(r.left + r.width / 2 - innerWidth / 2) }
  })
  const boxAfter = await page.locator('[data-map-panel]').first().boundingBox()
  check('A453 … PAR-DESSUS l’écran : fixe, plein écran, centrée, rien derrière n’a bougé', shape.pos === 'fixed' && shape.inset && shape.overlay && shape.centre < 2 && JSON.stringify(boxBefore) === JSON.stringify(boxAfter) && (await page.evaluate(() => location.hash)) === hash0, JSON.stringify(shape))
  check('A453 … une fenêtre (aria-modal), en hébreu de droite à gauche', shape.modal === 'true' && shape.dir === 'rtl')
  await page.screenshot({ path: `${SHOTS}/a453-ouverte-1440.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const back = await page.evaluate(() => document.activeElement?.getAttribute('data-bf-opener'))
  check('A453 Échap la ferme et rend le focus à l’élément d’avant', !(await searchOpen(page)) && back === '1', String(back))
  check('A453 … et l’écran est le même (adresse)', (await page.evaluate(() => location.hash)) === hash0)

  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(300)
  check('A453 ⌘K (macOS) ouvre aussi', await searchOpen(page))
  await page.mouse.click(30, 870)
  await page.waitForTimeout(300)
  check('A453 un toucher en dehors la ferme', !(await searchOpen(page)))

  await page.keyboard.press('Control+k')
  await page.waitForTimeout(300)
  await page.goBack()
  await page.waitForTimeout(600)
  check('A453 le bouton retour (Android) la ferme, sans quitter l’écran', !(await searchOpen(page)) && (await page.evaluate(() => location.hash)) === hash0, await page.evaluate(() => location.hash))
  check('A453 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()

  const dark = await open(1440, { db: bfDb(), height: 900, dark: true })
  await go(dark.page, APP, '/coordinator', 3500)
  await dark.page.keyboard.press('Control+k')
  await dark.page.waitForTimeout(400)
  const lum = await dark.page.evaluate(() => {
    const bg = getComputedStyle(document.querySelector('[data-testid="global-search"] [role="dialog"]') as HTMLElement).backgroundColor
    const n = (bg.match(/[\d.]+/g) ?? []).map(Number)
    return { bg, l: (0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2]) / 255 }
  })
  check('A453 en sombre, la fenêtre est sombre (les jetons de l’app)', lum.l < 0.3, lum.bg)
  await dark.page.screenshot({ path: `${SHOTS}/a453-sombre-1440.png` })
  await dark.ctx.close()

  const phone = await open(390, { db: bfDb(), height: 844 })
  await go(phone.page, APP, '/coordinator', 3500)
  await phone.page.locator('[data-testid="shell-menu"]').click()
  await phone.page.waitForTimeout(400)
  await phone.page.keyboard.press('Control+k')
  await phone.page.waitForTimeout(400)
  check('A453 une fenêtre bloquante déjà ouverte garde la main (rien ne s’ouvre dessus)', !(await searchOpen(phone.page)) && (await phone.page.locator('[data-testid="shell-menu-grid"]').count()) === 1)
  await phone.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A454', async () => {
  section('A454 — les groupes, le surlignage, l’absence de résultat')
  const o = await open(1440, { db: bfDb(), height: 900 })
  const page = o.page
  await go(page, APP, '/coordinator', 3500)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('אופ')
  await page.waitForTimeout(500)
  const heads = await page.locator('[data-testid="global-search-heading"]').allTextContents()
  check('A454 trois lettres : au moins DEUX groupes, chacun son intertitre et son compte', heads.length >= 2 && heads.every((h) => /\(\d+\)$/.test(h.trim())), heads.join(' | '))
  check('A454 … les intertitres en hébreu (יישובים, מוסדות, חוות…)', heads.some((h) => h.startsWith('חוות')) && heads.some((h) => h.startsWith('מוסדות')))
  check('A454 … la portion trouvée est surlignée', (await page.locator('[data-testid="global-search-row"] mark[data-search-mark]').count()) >= 2)
  const kinds = await page.locator('[data-testid="global-search-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))
  check('A454 … une ligne dit son type (pastille) et son contexte', (await page.locator('[data-testid="global-search-row"] .chip').count()) === kinds.length && kinds.length > 0)
  await page.screenshot({ path: `${SHOTS}/a454-groupes-1440.png` })
  await page.locator('[data-testid="global-search-input"]').fill('זזזזזזזז')
  await page.waitForTimeout(500)
  const none = (await page.locator('[data-testid="global-search-none"]').textContent())?.trim()
  check('A454 sans résultat : « לא נמצאו תוצאות עבור «…» », et rien d’autre', none === 'לא נמצאו תוצאות עבור «זזזזזזזז»' && (await page.locator('[data-testid="global-search-row"]').count()) === 0, none ?? '')
  /* Une faute de frappe (un yod en trop) trouve l'institution inventée. */
  await page.locator('[data-testid="global-search-input"]').fill('מכינת בדיקה אופקיים')
  await page.waitForTimeout(500)
  check('A454 une faute de frappe trouve encore (« אופקיים »)', (await page.locator(`[data-testid="global-search-row"][data-doc="${BF_INST.id}"]`).count()) === 1)
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A455', async () => {
  section('A455 — ↓ ↓ Entrée')
  const o = await open(1440, { db: bfDb(), height: 900 })
  const page = o.page
  await go(page, APP, '/coordinator', 3500)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('אופ')
  await page.waitForTimeout(500)
  const roles = await page.evaluate(() => ({
    list: document.querySelector('#global-search-list')?.getAttribute('role'),
    options: document.querySelectorAll('#global-search-list [role="option"]').length,
    combo: document.querySelector('[data-testid="global-search-input"]')?.getAttribute('role'),
  }))
  check('A455 listbox / option / combobox', roles.list === 'listbox' && roles.options > 2 && roles.combo === 'combobox', JSON.stringify(roles))
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  const target = await page.evaluate(() => {
    const id = document.querySelector('[data-testid="global-search-input"]')?.getAttribute('aria-activedescendant') ?? ''
    const row = id ? document.getElementById(id) : null
    const all = Array.from(document.querySelectorAll('#global-search-list [role="option"]'))
    return { id, index: row ? all.indexOf(row) : -1, selected: row?.getAttribute('aria-selected'), href: row?.getAttribute('data-href') ?? '', kind: row?.getAttribute('data-kind') ?? '' }
  })
  check('A455 ↓ ↓ : la troisième ligne est active et annoncée (aria-activedescendant, aria-selected)', target.index === 2 && target.selected === 'true', JSON.stringify(target))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1500)
  const hash = await page.evaluate(() => decodeURIComponent(location.hash.slice(1)))
  const want = decodeURIComponent(target.href)
  check('A455 Entrée : la fenêtre se ferme et l’app est sur la bonne fiche', !(await searchOpen(page)) && hash.startsWith(want), `${hash} ⇐ ${want}`)
  await page.screenshot({ path: `${SHOTS}/a455-arrivee-1440.png` })
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(400)
  const recent = await page.locator('[data-testid="global-search-heading"]').allTextContents()
  const firstRecent = await page.locator('[data-testid="global-search-row"]').first().getAttribute('data-href')
  check('A455 rouverte, le champ vide : « נצפו לאחרונה », la fiche ouverte en tête', recent[0]?.trim() === 'נצפו לאחרונה' && firstRecent === target.href, `${recent.join('|')} · ${firstRecent}`)
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A456', async () => {
  section('A456 — la loupe et les lignes, au doigt')
  const o = await open(390, { db: bfDb(), height: 844, touch: true })
  const page = o.page
  await go(page, APP, '/coordinator/farms', 3500)
  const btn = page.locator('[data-testid="global-search-button"]').filter({ visible: true }).first()
  const b = await btn.boundingBox()
  check('A456 la loupe est dans l’en-tête du téléphone, 44 px au moins', !!b && b.width >= 44 && b.height >= 44 && b.y < 80, b ? `${Math.round(b.width)}×${Math.round(b.height)} @y${Math.round(b.y)}` : 'absente')
  await btn.tap()
  await page.waitForTimeout(400)
  check('A456 un toucher l’ouvre, le champ prêt', (await searchOpen(page)) && (await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'global-search-input')
  await page.keyboard.type('אופ')
  await page.waitForTimeout(500)
  const heights = await page.locator('[data-testid="global-search-row"]').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  check('A456 les lignes font au moins 48 px au téléphone', heights.length > 0 && heights.every((h) => h >= 48), heights.map(Math.round).join(','))
  const xs = await page.evaluate(() => document.scrollingElement!.scrollWidth - window.innerWidth)
  check('A456 rien ne défile de côté', xs <= 1, String(xs))
  await page.screenshot({ path: `${SHOTS}/a456-telephone-390.png` })
  await o.ctx.close()

  const d = await open(1440, { db: bfDb(), height: 900 })
  await go(d.page, APP, '/coordinator', 3000)
  const rail = await d.page.locator('[data-testid="global-search-button"]').filter({ visible: true }).first().boundingBox()
  check('A456 sur ordinateur, la loupe est en haut du rail, 44 px', !!rail && rail.height >= 44 && rail.width >= 44 && rail.y < 160, rail ? `${Math.round(rail.width)}×${Math.round(rail.height)} @y${Math.round(rail.y)}` : 'absente')
  await d.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A457', async () => {
  section('A457 — ★ la carte ne bouge plus toute seule (25 s, deux relectures)')
  /* Deux écrans à la fois, chacun sa base : les institutions (une institution
     ouverte, la carte y est allée) et la couverture (une institution choisie). */
  const run = async (label: string, path: string) => {
    const d = bfDb()
    const o = await open(1440, { db: d, height: 900 })
    const reads = readsOf(o.page, 'institutions')
    await go(o.page, APP, path, 4500)
    const ready = await waitMap(o.page)
    return { label, d, o, reads, ready }
  }
  const screens = [
    await run('institutions', `/coordinator/institutions?open=${INST_A.id}`),
    await run('couverture', `/coordinator/coverage?inst=${INST_A.id}`),
  ]
  const before: Camera[] = []
  for (const s of screens) {
    check(`A457 ${s.label} : la carte est chargée`, s.ready)
    await userMoves(s.o.page)
    before.push(await camera(s.o.page))
    const reads0 = s.reads.count
    ;(s as unknown as { reads0: number }).reads0 = reads0
  }
  const t0 = Date.now()
  for (const at of [11_000, 22_000]) {
    await screens[0].o.page.waitForTimeout(Math.max(0, at - (Date.now() - t0)))
    for (const s of screens) {
      serverOrder(s.d, Math.round(at / 1000))
      await s.o.page.evaluate(() => window.dispatchEvent(new Event('focus')))
    }
  }
  await screens[0].o.page.waitForTimeout(Math.max(0, 25_000 - (Date.now() - t0)))
  for (const [i, s] of screens.entries()) {
    const after = await camera(s.o.page)
    const reads = s.reads.count - (s as unknown as { reads0: number }).reads0
    check(`A457 ${s.label} : les données ONT été relues deux fois pendant l’attente`, reads >= 2, `${reads} lectures`)
    check(`A457 ${s.label} : après 25 s et deux relectures, centre et zoom IDENTIQUES`, sameCamera(before[i], after), `${fmt(before[i])} → ${fmt(after)}`)
    check(`A457 ${s.label} : « מרכוז מחדש » est proposé (le PO a la main)`, (await s.o.page.locator('[data-testid="map-recenter"]').count()) === 1)
    await s.o.page.screenshot({ path: `${SHOTS}/a457-${s.label}-apres-25s.png` })
    check(`A457 ${s.label} : aucune erreur de page`, s.o.errors.length === 0, s.o.errors.slice(0, 2).join(' | '))
  }

  /* A458 — sur la même page : une AUTRE institution choisie recadre. */
  section('A458 — une nouvelle sélection recadre ; « מרכוז מחדש »')
  const page = screens[0].o.page
  const pos = { lat: Number(INST_B.position!.lat), lng: Number(INST_B.position!.lng) }
  /* L'aperçu ouvert tient la colonne : on le ferme, puis on touche une autre
     institution de la liste — le geste du PO. */
  await page.locator('[data-testid="institution-preview"] button[aria-label="סגירה"], [data-testid="institution-preview-close"]').first().click({ timeout: 4000 }).catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(500)
  await page.locator(`[data-testid="institution-row-${INST_B.id}"]`).first().click()
  await page.waitForTimeout(1500)
  const moved = await camera(page)
  check('A458 choisir une autre institution DÉPLACE la caméra sur elle', near(moved, pos) && !sameCamera(moved, before[0]), fmt(moved))
  check('A458 … et rend la main (plus de « מרכוז מחדש »)', (await page.locator('[data-testid="map-recenter"]').count()) === 0)
  await userMoves(page)
  check('A458 un geste du PO fait paraître « מרכוז מחדש »', (await page.locator('[data-testid="map-recenter"]').count()) === 1)
  const rb = await page.locator('[data-testid="map-recenter"]').boundingBox()
  check('A458 … 44 px au moins, en bas de la carte', !!rb && rb.height >= 44, rb ? `${Math.round(rb.width)}×${Math.round(rb.height)}` : '')
  await page.locator('[data-testid="map-recenter"]').click()
  await page.waitForTimeout(1200)
  const back = await camera(page)
  check('A458 « מרכוז מחדש » ramène sur la sélection, et disparaît', near(back, pos) && (await page.locator('[data-testid="map-recenter"]').count()) === 0, fmt(back))

  const cov = screens[1].o.page
  const c0 = await camera(cov)
  await cov.locator('[data-testid="coverage-recall-next"]').first().click()
  await cov.waitForTimeout(1500)
  const c1 = await camera(cov)
  check('A458 couverture : › (l’institution voisine) recadre bien', !sameCamera(c0, c1), `${fmt(c0)} → ${fmt(c1)}`)

  /* A459 — un résultat de recherche centre la carte dessus. */
  section('A459 — un résultat de recherche centre la carte')
  await userMoves(page)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('מכינת בדיקה')
  await page.waitForTimeout(500)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1800)
  const onInst = await camera(page)
  check('A459 une institution choisie dans la recherche : la carte y va, même après un geste du PO', near(onInst, BF_INST) && (await page.evaluate(() => location.hash)).includes(`open=${BF_INST.id}`), fmt(onInst))
  check('A459 … et la main est rendue', (await page.locator('[data-testid="map-recenter"]').count()) === 0)
  await page.keyboard.press('Control+k')
  await page.keyboard.type('חוות הדגמה במדבר')
  await page.waitForTimeout(500)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  await waitMap(page)
  const onFarm = await camera(page)
  check('A459 une ferme choisie : sa fiche, la carte cadrée sur elle', (await page.evaluate(() => location.hash)).includes(`/coordinator/farms/${BF_FARM.id}`) && near(onFarm, BF_FARM, 0.05), fmt(onFarm))
  await page.screenshot({ path: `${SHOTS}/a459-ferme-1440.png` })
  for (const s of screens) await s.o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A460', async () => {
  section('A460 — non-régression : « ⋯ » et la bulle de la couverture')
  const o = await open(1440, { db: bfDb(), height: 900 })
  const page = o.page
  await go(page, APP, '/coordinator/farms', 3500)
  await page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 6000 }).catch(() => undefined)
  await page.waitForTimeout(900)
  const toggles = await page.locator('[data-testid^="farms-table-menu-"][data-testid$="-toggle"]').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => `[data-testid="${e.getAttribute('data-testid')}"]`))
  for (const sel of [toggles[1], toggles[toggles.length - 1]].filter(Boolean)) {
    await page.locator(sel).scrollIntoViewIfNeeded()
    await page.locator(sel).click()
    await page.waitForTimeout(400)
    const m = await page.evaluate((s) => {
      const menu = Array.from(document.querySelectorAll<HTMLElement>('[role="menu"][data-overlay]')).find((x) => x.getBoundingClientRect().height > 0)
      if (!menu) return { ok: false, why: 'pas de menu' }
      const r = menu.getBoundingClientRect()
      const pts: Array<[number, number]> = []
      for (const fx of [0.08, 0.5, 0.92]) for (const fy of [0.06, 0.5, 0.94]) pts.push([r.left + r.width * fx, r.top + r.height * fy])
      const lost = pts.filter(([x, y]) => !menu.contains(document.elementFromPoint(x, y))).length
      const inView = r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5
      const row = (document.querySelector(s) as HTMLElement).closest('li,tr,[data-row]')?.getBoundingClientRect()
      const outside = row ? r.bottom > row.bottom || r.top < row.top : true
      return { ok: lost === 0 && inView && menu.parentElement === document.body && outside, why: `${lost}/9 recouverts · écran ${inView} · hors de sa ligne ${outside}` }
    }, sel)
    check(`A460 le menu « ⋯ » s’affiche entièrement, hors de sa ligne (${sel === toggles[1] ? 'une rangée' : 'la dernière'})`, m.ok, m.why)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  check('A460 le tableau a ses « ⋯ »', toggles.length > 3, String(toggles.length))
  await o.ctx.close()

  /* ★★ BG 3 — la bulle ne s'ouvre que là où le panneau ne montre pas déjà
     l'institution : carte pleine. */
  const c = await open(1440, { db: bfDb(), height: 900, init: { 'lo-yanum:map-mode:coverage': 'full' } })
  await go(c.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 4500)
  await waitMap(c.page)
  await c.page.waitForTimeout(1500)
  const links = () =>
    c.page.evaluate(() => {
      const m = (window as unknown as { __loYanumMap?: { getSource(id: string): unknown } }).__loYanumMap
      const s = m?.getSource('coverage-links') as { _data?: { features?: unknown[] } } | undefined
      return s?._data?.features?.length ?? -1
    })
  /* Les trajets arrivent quand les paires sont mesurées sur la route : on
     les attend avant de fermer la bulle (sinon on compare zéro à zéro). */
  const until = Date.now() + 30_000
  let last = -1
  let stableSince = Date.now()
  while (Date.now() < until) {
    const n = await links()
    if (n !== last) {
      last = n
      stableSince = Date.now()
    } else if (n > 0 && Date.now() - stableSince > 3000) break
    await c.page.waitForTimeout(400)
  }
  const before = await links()
  const card = c.page.locator('[data-testid="coverage-institution-card"]')
  check('A460 la bulle de l’institution est ouverte', (await card.count()) === 1)
  await card.locator(`button[aria-label="${'סגירה'}"]`).first().click().catch(async () => card.locator('button').last().click())
  await c.page.waitForTimeout(600)
  const after = await links()
  check('A460 la bulle se ferme, la sélection reste', (await card.count()) === 0 && (await c.page.locator('[data-testid="coverage-recall"]').first().getAttribute('data-bubble')) === 'closed')
  check('A460 … et les trajets ne sont PAS effacés', before > 0 && after === before, `${before} → ${after}`)
  await c.page.screenshot({ path: `${SHOTS}/a460-bulle-fermee-1440.png` })
  await c.ctx.close()
})

await finish()
