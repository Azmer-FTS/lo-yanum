import type { Page } from 'playwright'

import { FakeDb } from './fake-supabase'
import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { buildTestData } from '../src/core/testData'
import { MAPPINGS } from '../src/data/rows'
import { mkdirSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AZ — LE TABLEAU RENDU, LES VIGNETTES, LES EXEMPLES.   A370 · A371 · A372 ·
 *                                                         A373 · A374
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run azui                                                   # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run azui     # le DÉPLOYÉ
 *   GUARD=A371 …                                                   # une section
 *
 * Build réel + base factice : les vraies fermes, les onze institutions, et le
 * JEU D'ESSAI (`buildTestData`, le même que l'app pose) — plus assez de gardes
 * et de contacts pour que chaque liste DÉFILE (sans quoi « l'en-tête reste
 * collé » ne se vérifie pas). Rien n'est écrit sur `lo-yanum-prod`.
 */

const OUT = process.env.DIST ?? 'dist-azui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5432), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/azpass/${REMOTE ? 'deployed' : 'local'}/ui`
mkdirSync(SHOTS, { recursive: true })
const only = (label: string) => !process.env.GUARD || label.startsWith(process.env.GUARD)
const run = (label: string, fn: () => Promise<void>) => (only(label) ? guard(label, fn) : Promise.resolve())

// --- La base : celle d'AY + le jeu d'essai + de quoi défiler ----------------
const TEST = buildTestData()
function azSeed(db: FakeDb, withTest = true): void {
  seed(db)
  const put = (c: keyof typeof MAPPINGS, items: unknown[]) => {
    const m = MAPPINGS[c] as { toRows: (x: unknown) => Array<{ table: string; rows: Array<Record<string, unknown>> }> }
    for (const it of items) for (const g of m.toRows(it)) for (const r of g.rows) db.rows(g.table).push({ ...r })
  }
  if (withTest) {
    put('institutions', TEST.institutions)
    put('farms', TEST.farms)
    put('farmZones', TEST.farmZones)
    put('anchorPoints', TEST.anchorPoints)
    put('volunteers', TEST.volunteers)
    put('drivers', TEST.drivers)
    put('missions', TEST.missions)
  }
  // De quoi défiler : vingt volontaires, vingt gardes (sur la ferme d'essai) et vingt contacts.
  const v0 = db.rows('volunteers')[0]
  for (let n = 0; n < 20; n++) db.rows('volunteers').push({ ...v0, id: `vol-az-${n}`, name: `מתנדב ${n + 1}`, phone: `050-00008${String(n).padStart(2, '0')}` })
  // (gardes) (sur la ferme d'essai) et vingt contacts.
  const next = TEST.missions[1]
  const day = 86_400_000
  put(
    'missions',
    Array.from({ length: 20 }, (_, n) => ({
      ...next,
      id: `az-mission-${n}`,
      startAt: new Date(Date.parse(next.startAt) + (n + 1) * day).toISOString(),
      endAt: new Date(Date.parse(next.endAt) + (n + 1) * day).toISOString(),
    })),
  )
  const now = new Date().toISOString()
  for (let n = 0; n < 20; n++) {
    db.rows('leads').push({ id: `lead-az-${n}`, name: `משק בדיקה ${n + 1}`, contact_name: `איש קשר ${n + 1}`, phone: `050-00007${String(n).padStart(2, '0')}`, status: 'not_called', email: '', place: 'נתיבות', lat: null, lng: null, region_id: null, notes: '', source: 'paste', raw: '', rank: 10 + n, converted_farm_id: null, converted_at: null, created_at: now, updated_at: now })
  }
}
const db = () => {
  const d = new FakeDb()
  azSeed(d)
  return d
}

const LISTS = [
  { name: 'fermes', route: '/coordinator/farms' },
  { name: 'institutions', route: '/coordinator/institutions' },
  { name: 'contacts', route: '/coordinator/leads' },
  { name: 'volontaires', route: '/coordinator/volunteers' },
  { name: 'gardes', route: '/coordinator/missions' },
]

async function mode(p: Page, m: 'hidden' | 'split' | 'full'): Promise<void> {
  // Attendre l'ÉLÉMENT (jusqu'à 20 s sur une machine chargée), pas un délai fixe.
  await p.locator(`[data-testid="map-mode-${m}"]`).first().click({ timeout: 20_000 })
  await p.waitForTimeout(900)
}

/** Le tableau de l'écran (EntityTable, ou la grille « roster » des gardes). */
const TABLE = '[data-entity-table]:not([data-tiles]), .roster-missions.card'
const HEAD = '[data-entity-table]:not([data-tiles]) thead th:first-child, [data-list-top] [data-roster-head]'
const ROWS = '[data-entity-table]:not([data-tiles]) tbody tr[data-row-key], .roster-missions.card .roster-row'

// --- Couleurs ------------------------------------------------------------------
type RGB = [number, number, number]
const parse = (c: string): { rgb: RGB; a: number } => {
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) return { rgb: [0, 0, 0], a: 0 }
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number)
  return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 }
}
const over = (top: { rgb: RGB; a: number }, under: RGB): RGB => top.rgb.map((v, i) => v * top.a + under[i] * (1 - top.a)) as RGB
const lin = (v: number) => {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const lum = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}
const lab = (c: RGB): RGB => {
  const [r, g, b] = c.map(lin)
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)]
}
const dE = (a: RGB, b: RGB) => {
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}
const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** Le fond EFFECTIF d'un élément : ses couleurs empilées jusqu'à la page. */
async function bg(p: Page, sel: string, nth = 0): Promise<RGB | null> {
  const stack = await p.evaluate(
    ([s, i]) => {
      const el = document.querySelectorAll(s as string)[i as number] as HTMLElement | undefined
      if (!el) return null
      const out: string[] = []
      for (let n: HTMLElement | null = el; n; n = n.parentElement) out.push(getComputedStyle(n).backgroundColor)
      out.push(getComputedStyle(document.documentElement).backgroundColor)
      return out
    },
    [sel, nth],
  )
  if (!stack) return null
  let c: RGB = [255, 255, 255]
  for (const layer of stack.reverse()) c = over(parse(layer), c)
  return c
}

// ===========================================================================
section('A370 — les cinq tableaux ont un fond propre et des lignes qui se détachent (clair ET sombre)')
// ===========================================================================
await run('A370', async () => {
  for (const theme of ['light', 'dark'] as const) {
    const o = await open(1440, { dark: theme === 'dark', db: db(), init: { 'lo-yanum:theme:coordinator': theme } })
    for (const l of LISTS) {
      await go(o.page, APP, l.route, 3000)
      await mode(o.page, 'hidden')
      const page = await bg(o.page, 'main')
      const table = await bg(o.page, TABLE)
      const r0 = await bg(o.page, ROWS, 0)
      const r1 = await bg(o.page, ROWS, 1)
      const sep = await o.page.evaluate((s) => {
        const td = document.querySelector(s) as HTMLElement | null
        if (!td) return 0
        const cell = (td.querySelector('td') as HTMLElement | null) ?? td
        return parseFloat(getComputedStyle(cell).borderBottomWidth)
      }, ROWS)
      const head = await bg(o.page, HEAD)
      if (!page || !table || !r0 || !r1 || !head) {
        check(`A370 ${theme} · ${l.name} : tableau trouvé`, false, `page ${!!page} table ${!!table} lignes ${!!r0}/${!!r1} en-tête ${!!head}`)
        continue
      }
      const dTable = dE(page, table)
      const dRows = dE(r0, r1)
      const dHead = dE(head, table)
      check(
        `A370 ${theme} · ${l.name} : le tableau se détache de la page (ΔE ≥ 3)`,
        dTable >= 3,
        `page ${hex(page)} · tableau ${hex(table)} · ΔE ${dTable.toFixed(1)} · contraste ${ratio(page, table).toFixed(2)}:1`,
      )
      check(
        `A370 ${theme} · ${l.name} : une ligne sur deux se distingue (ΔE ≥ 1,5) et un filet les sépare`,
        dRows >= 1.5 && sep >= 1,
        `ligne 1 ${hex(r0)} · ligne 2 ${hex(r1)} · ΔE ${dRows.toFixed(1)} · filet ${sep} px`,
      )
      check(`A370 ${theme} · ${l.name} : l’en-tête a son propre fond (ΔE ≥ 1,5)`, dHead >= 1.5, `en-tête ${hex(head)} · ΔE ${dHead.toFixed(1)}`)
      await o.page.screenshot({ path: `${SHOTS}/a370-${l.name}-${theme === 'dark' ? 'sombre' : 'clair'}.png` })
    }
    check(`A370 ${theme} : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
})

// ===========================================================================
section('A371 — l’en-tête reste visible pendant tout le défilement, sur les cinq listes')
// ===========================================================================
await run('A371', async () => {
  for (const [w, h] of [[1440, 700], [1032, 900], [402, 874]] as const) {
    /* ★★ BC — ADAPTÉE : au téléphone, le tableau étroit n'a plus de ligne
       d'en-têtes (elle mangeait 56 px collés pour dire « חווה » au-dessus d'une
       seule colonne ; le tri est dans la feuille de filtres). L'en-tête qui
       reste collé y est la BARRE FINE (recherche, statuts, « סינון ») ; le grand
       titre, lui, défile (brief BC 3a). */
    const headSel = w < 768 ? '[data-list-top][data-compact]' : HEAD
    const o = await open(w, { height: h, db: db() })
    for (const l of LISTS) {
      await go(o.page, APP, l.route, 3000)
      await mode(o.page, 'hidden')
      const head = o.page.locator(headSel).first()
      const before = await head.boundingBox()
      const steps: number[] = []
      let visible = true
      let detail = ''
      for (let s = 0; s < 4; s++) {
        await o.page.mouse.move(w / 2, h - 120)
        await o.page.mouse.wheel(0, 500)
        await o.page.waitForTimeout(450)
        const b = await head.boundingBox()
        const hit = b
          ? await o.page.evaluate(
              ([x, y, sel]) => {
                const el = document.elementFromPoint(x as number, y as number)
                const heads = [...document.querySelectorAll(sel as string)]
                return heads.some((hd) => hd.contains(el) || hd.closest('tr, [data-roster-head]')?.contains(el))
              },
              [b.x + b.width / 2, b.y + b.height / 2, headSel],
            )
          : false
        if (!b || b.y < -1 || b.y + b.height > h || !hit) {
          visible = false
          detail = b ? `y ${Math.round(b.y)} · au premier plan ${hit}` : 'disparu'
        }
        if (b) steps.push(Math.round(b.y))
      }
      // A-t-on vraiment défilé ? La première ligne doit être passée sous l'en-tête.
      const first = await o.page.locator(ROWS).first().boundingBox()
      const scrolled = !!first && !!before && first.y < before.y
      check(
        `A371 ${w} px · ${l.name} : l’en-tête reste en haut, visible, pendant le défilement`,
        visible && scrolled,
        `${detail || 'y ' + steps.join(' → ')} · défilé ${scrolled}`,
      )
      if (w === 1440) await o.page.screenshot({ path: `${SHOTS}/a371-${l.name}-defile-1440.png` })
    }
    check(`A371 ${w} px : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
})

// ===========================================================================
section('A372 — les vignettes du mode divisé sont lisibles (taille de texte mesurée)')
// ===========================================================================
await run('A372', async () => {
  /* ★★ BC — ADAPTÉE : au téléphone, une liste n'a plus de mode divisé (liste ↔
     carte, brief BC 3h) ; ses vignettes du mode divisé n'y existent plus. Le
     téléphone est vérifié plus bas : deux états seulement, et la liste (le
     tableau étroit, règle AZ2 du PO : carte masquée → tableau) garde la
     lisibilité des vignettes. */
  for (const w of [1440, 1032]) {
    const o = await open(w, { db: db() })
    for (const l of LISTS) {
      await go(o.page, APP, l.route, 3000)
      await mode(o.page, 'split')
      const m = await o.page.evaluate(() => {
        const tile = document.querySelector('[data-tiles] li [data-testid$="-tile"], [data-tiles] li, [data-testid="mission-tile"]') as HTMLElement | null
        const scope = (tile?.closest('li') ?? tile) as HTMLElement | null
        const title = (scope?.querySelector('[data-entity-title]') ?? document.querySelector('[data-entity-title]')) as HTMLElement | null
        const where = scope?.querySelector('[data-entity-where]') as HTMLElement | null
        const table = document.querySelector('[data-entity-table]:not([data-tiles]), .roster-missions.card')
        return {
          tiles: !!document.querySelector('[data-tiles], [data-testid="mission-tile"]'),
          table: !!table && (table as HTMLElement).offsetParent !== null,
          name: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
          where: where ? parseFloat(getComputedStyle(where).fontSize) : 0,
          height: scope ? scope.getBoundingClientRect().height : 0,
        }
      })
      check(
        `A372 ${w} px · ${l.name} : carte visible → vignettes (pas de tableau)`,
        m.tiles && !m.table,
        `vignettes ${m.tiles} · tableau ${m.table}`,
      )
      check(
        `A372 ${w} px · ${l.name} : le nom ≥ 18 px, ce qui situe ≥ 16 px, vignette ≥ 88 px de haut`,
        m.name >= 18 && m.where >= 16 && m.height >= 88,
        `nom ${m.name} px · lieu ${m.where} px · hauteur ${Math.round(m.height)} px`,
      )
      if (w !== 1032) await o.page.screenshot({ path: `${SHOTS}/a372-${l.name}-vignettes-${w}.png` })
    }
    check(`A372 ${w} px : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
  const o = await open(402, { db: db() })
  for (const l of LISTS) {
    await go(o.page, APP, l.route, 3000)
    const modes = await o.page.evaluate(() => [...document.querySelectorAll('[data-testid^="map-mode-"]')].map((b) => b.getAttribute('data-testid')).filter((id) => id !== 'map-mode-pill'))
    check(`A372 402 px · ${l.name} : deux états, la liste et la carte (plus de mode divisé)`, modes.length === 2 && modes.includes('map-mode-hidden') && modes.includes('map-mode-full'), modes.join(','))
    await mode(o.page, 'hidden')
    const m = await o.page.evaluate((rows) => {
      const row = document.querySelector(rows) as HTMLElement | null
      const px = (sel: string) => {
        const el = row?.querySelector(sel)
        return el ? parseFloat(getComputedStyle(el).fontSize) : null
      }
      return { tiles: !!document.querySelector('[data-tiles]:not([hidden])'), row: !!row, name: px('[data-entity-title]'), person: px('[data-entity-person]'), sub: px('[data-entity-sub]') }
    }, ROWS)
    check(`A372 402 px · ${l.name} : carte masquée → le tableau (pas de vignettes)`, m.row && !m.tiles, `ligne ${m.row} · vignettes ${m.tiles}`)
    check(
      `A372 402 px · ${l.name} : la ligne garde la lisibilité des vignettes (nom ≥ 18 px, ce qui situe ≥ 16 px)`,
      (m.name ?? 0) >= 18 && (m.person === null || m.person >= 16) && (m.sub === null || m.sub >= 16),
      `nom ${m.name} px · personne ${m.person ?? '—'} px · ce qui situe ${m.sub ?? '—'} px`,
    )
    await o.page.screenshot({ path: `${SHOTS}/a372-${l.name}-liste-402.png` })
  }
  check('A372 402 px : aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A373 — toucher une vignette n’empile pas deux cartes à l’écran')
// ===========================================================================
await run('A373', async () => {
  const visibleMaps = (p: Page) =>
    p.evaluate(() => {
      const vw = innerWidth
      const vh = innerHeight
      return [...document.querySelectorAll('canvas.maplibregl-canvas')].filter((c) => {
        const r = c.getBoundingClientRect()
        const w = Math.min(r.right, vw) - Math.max(r.left, 0)
        const h = Math.min(r.bottom, vh) - Math.max(r.top, 0)
        if (w < 40 || h < 40) return false
        const el = document.elementFromPoint(Math.max(r.left, 0) + w / 2, Math.max(r.top, 0) + h / 2)
        return !!el && (c.parentElement?.contains(el) ?? false)
      }).length
    })
  /* ★★ BC — ADAPTÉE : au téléphone, plus de mode divisé pour une liste ; on y
     touche une LIGNE de la liste (carte masquée) et l'aperçu est la feuille
     plein écran d'AY3.3, avec SA carte — la seule à l'écran. Vérifié plus bas. */
  for (const w of [1440, 1032]) {
    const o = await open(w, { db: db() })
    for (const l of LISTS.filter((x) => x.name !== 'gardes')) {
      await go(o.page, APP, l.route, 3500)
      await mode(o.page, 'split')
      const before = await visibleMaps(o.page)
      const tile = o.page.locator('[data-tiles] li[data-row-key]').nth(2)
      const key = await tile.getAttribute('data-row-key')
      await tile.locator('[data-row-open]').click()
      await o.page.waitForTimeout(2000)
      const after = await visibleMaps(o.page)
      const docked = await o.page.locator('[data-docked]').isVisible().catch(() => false)
      check(
        `A373 ${w} px · ${l.name} : l’aperçu s’ouvre DANS la colonne, une seule carte à l’écran`,
        docked && after === 1,
        `cartes visibles avant ${before} · après ${after} · aperçu ancré ${docked}`,
      )
      if (l.name === 'fermes' && w !== 1032) await o.page.screenshot({ path: `${SHOTS}/a373-${l.name}-apercu-${w}.png` })
      await o.page.locator('[data-docked] [data-testid$="-close"]').click()
      await o.page.waitForTimeout(800)
      const back = await o.page.evaluate((k) => {
        const li = document.querySelector(`[data-tiles] li[data-row-key="${CSS.escape(k ?? '')}"]`)
        if (!li) return false
        const r = li.getBoundingClientRect()
        return r.top >= 0 && r.bottom <= innerHeight && (li as HTMLElement).offsetParent !== null
      }, key)
      check(`A373 ${w} px · ${l.name} : « ✕ » ramène aux vignettes, sur celle qu’on avait touchée`, back)
    }
    // Carte masquée : l'aperçu reste le panneau latéral, avec SA carte (il n'y en a pas d'autre).
    if (w === 1440) {
      await go(o.page, APP, '/coordinator/farms', 3500)
      await mode(o.page, 'hidden')
      await o.page.locator('[data-entity-table] tbody [data-row-open]').first().click()
      await o.page.waitForTimeout(2000)
      const n = await visibleMaps(o.page)
      check('A373 tableau seul : l’aperçu latéral porte sa carte, et c’est la seule', n === 1, `${n} carte(s)`)
    }
    check(`A373 ${w} px : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
  const o = await open(402, { db: db() })
  for (const l of LISTS.filter((x) => x.name !== 'gardes')) {
    await go(o.page, APP, l.route, 3500)
    await mode(o.page, 'hidden')
    const row = o.page.locator(ROWS).nth(2)
    const key = await row.getAttribute('data-row-key')
    await row.locator('[data-row-open]').first().click()
    await o.page.waitForTimeout(2000)
    const after = await visibleMaps(o.page)
    const sheetOpen = await o.page.locator('[role="dialog"][data-testid$="-preview"]').first().isVisible().catch(() => false)
    check(`A373 402 px · ${l.name} : l’aperçu s’ouvre en feuille, une seule carte à l’écran`, sheetOpen && after <= 1, `aperçu ${sheetOpen} · cartes visibles ${after}`)
    if (l.name === 'fermes') await o.page.screenshot({ path: `${SHOTS}/a373-${l.name}-apercu-402.png` })
    await o.page.locator('[role="dialog"][data-testid$="-preview"] [data-testid$="-close"]').first().click()
    await o.page.waitForTimeout(800)
    const back = await o.page.evaluate((k) => {
      const tr = document.querySelector(`[data-entity-table] tbody tr[data-row-key="${CSS.escape(k ?? '')}"]`)
      if (!tr) return false
      const r = tr.getBoundingClientRect()
      return r.top >= 0 && r.bottom <= innerHeight && (tr as HTMLElement).offsetParent !== null
    }, key)
    check(`A373 402 px · ${l.name} : « ✕ » ramène à la liste, sur la ligne touchée`, back)
  }
  check('A373 402 px : aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A374 — exemples : volontaire, conducteur ET garde — marqués, hors compteurs, supprimables')
// ===========================================================================
await run('A374', async () => {
  // La base factice SANS le jeu : on le POSE par le geste de l'écran de réglages.
  const empty = new FakeDb()
  azSeed(empty, false)
  const o = await open(1440, { db: empty })
  o.page.on('dialog', (d) => void d.accept())
  await go(o.page, APP, '/coordinator/settings', 3000)
  const seedBtn = o.page.locator('[data-testid="test-data-seed"]')
  await seedBtn.waitFor({ state: 'attached', timeout: 20_000 })
  await seedBtn.scrollIntoViewIfNeeded()
  await seedBtn.click()
  await o.page.waitForTimeout(2500)
  const written = {
    volunteers: empty.rows('volunteers').filter((r) => String(r.id).startsWith('test-')).length,
    drivers: empty.rows('drivers').filter((r) => String(r.id).startsWith('test-')).length,
    missions: empty.rows('missions').filter((r) => String(r.id).startsWith('test-')).length,
    team: empty.rows('mission_assignments').filter((r) => r.mission_id === 'test-mission-next').length,
  }
  check('A374 le geste de réglages ÉCRIT le jeu en base (volontaires, conducteurs, gardes)', written.volunteers === 7 && written.drivers === 3 && written.missions === 2, JSON.stringify(written))

  // Le volontaire d'exemple, complet.
  await go(o.page, APP, '/coordinator/volunteers', 3000)
  await mode(o.page, 'hidden')
  const volRow = o.page.locator('[data-row-key="test-vol"]')
  const badge = await volRow.locator('[data-testid="test-data-badge"]').count()
  const count = await o.page.locator('[data-list-count]').first().innerText()
  check('A374 le volontaire d’exemple est dans la liste, marqué « נתוני בדיקה »', (await volRow.count()) === 1 && badge === 1, `ligne ${await volRow.count()} · marque ${badge}`)
  check('A374 … et il ne compte pas (le total ne compte que les vrais : 23)', /^23\/23$|מתוך 23\b/.test(count.trim()), count)
  await volRow.locator('[data-row-open]').click()
  await o.page.waitForTimeout(1500)
  const pv = await o.page.locator('[data-testid="person-preview"]').innerText()
  check('A374 sa fiche dit son institution, son téléphone, avec qui il part', /ישיבת בדיקה/.test(pv) && /050-0000002/.test(pv) && /נהג בדיקה/.test(pv), pv.replace(/\s+/g, ' ').slice(0, 160))
  await o.page.screenshot({ path: `${SHOTS}/a374-volontaire.png` })
  await o.page.keyboard.press('Escape')

  // Le conducteur d'exemple, sa voiture, ses places.
  await go(o.page, APP, '/coordinator/volunteers?drivers=1', 3000)
  await o.page.locator('[data-row-key="test-vol-drv1"] [data-row-open]').click()
  await o.page.waitForTimeout(1500)
  const dv = await o.page.locator('[data-testid="person-preview"]').innerText()
  check('A374 le conducteur d’exemple : son véhicule et ses places', /טרנזיט/.test(dv) && /8/.test(dv), dv.replace(/\s+/g, ' ').slice(0, 160))
  await o.page.screenshot({ path: `${SHOTS}/a374-conducteur.png` })
  await o.page.keyboard.press('Escape')

  // La garde d'exemple : ferme, volontaires, conducteur, horaire, point de garde.
  await go(o.page, APP, '/coordinator/missions/test-mission-next', 3500)
  const g = await o.page.locator('main').innerText()
  const ok = {
    ferme: /חוות בדיקה/.test(g),
    marque: (await o.page.locator('[data-testid="test-data-badge"]').count()) > 0,
    volontaires: ['מתנדב בדיקה', 'מתנדב בדיקה א׳', 'מתנדב בדיקה ב׳', 'מתנדב בדיקה ג׳'].every((n) => g.includes(n)),
    conducteur: /נהג בדיקה/.test(g),
    horaire: /21:00/.test(g) && /05:00/.test(g),
    point: /עמדת בדיקה/.test(g),
  }
  check('A374 la garde d’exemple : ferme, quatre volontaires, conducteur, 21:00–05:00, point de garde, marquée', Object.values(ok).every(Boolean), JSON.stringify(ok))
  await o.page.screenshot({ path: `${SHOTS}/a374-garde.png`, fullPage: true })

  // Hors compteurs : la liste des gardes.
  await go(o.page, APP, '/coordinator/missions', 3000)
  const mc = await o.page.locator('[data-list-count]').first().innerText()
  check('A374 la liste des gardes ne compte pas les gardes d’essai', /^20\/20$|מתוך 20\b/.test(mc.trim()), mc)

  // Supprimable d'un geste.
  await go(o.page, APP, '/coordinator/settings', 3000)
  const purge = o.page.locator('[data-testid="sample-data-purge"]')
  await purge.scrollIntoViewIfNeeded()
  await purge.click()
  await o.page.waitForTimeout(3000)
  const left = ['volunteers', 'drivers', 'missions', 'entities', 'institutions'].reduce((n, t) => n + empty.rows(t).filter((r) => String(r.id).startsWith('test-')).length, 0)
  check('A374 « מחיקה » retire tout le jeu d’essai, et rien d’autre', left === 0 && empty.rows('volunteers').length === 23, `restant test- ${left} · vrais volontaires ${empty.rows('volunteers').length}`)
  check('A374 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

await finish()
