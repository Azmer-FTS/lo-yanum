import { mkdirSync } from 'node:fs'

import type { Page } from 'playwright'

import { FakeDb } from './fake-supabase'
import { LEADS, REMOTE, VOLUNTEERS, check, farms, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { MAPPINGS } from '../src/data/rows'
import type { Institution } from '../src/core/institutions'
import type { Farm } from '../src/core/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BD — AU RENDU.   A432 · A433 · A434 · A435 · A436
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bdui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bdui    # le DÉPLOYÉ
 *
 * Build réel (ou bundle déployé) + base FACTICE aux noms et numéros INVENTÉS
 * (050-000-11xx). Rien n'est écrit sur `lo-yanum-prod`. Le géocodeur
 * (OpenStreetMap) est simulé : la porte ne dépend pas du réseau.
 *
 *   A432  la fiche d'institution est un lieu : la carte à la place de celle
 *         d'une ferme ; sans position, le bouton qui mène au geste ; saisir une
 *         adresse PROPOSE un point, validé il est posé ; l'appui long le pose ;
 *         on peut le déplacer (glisser) ; à 390 et à 1440
 *   A433  la carte : les couches (institutions, contacts, replis par nature)
 *         s'activent et SE GARDENT (rechargement) ; la légende ne montre que
 *         les statuts présents, avec leur compte, et se déplie ; les épingles
 *         lisibles à 390 px (icône de la nature, sélection sans la couleur) ;
 *         la grange au menu
 *   A434  la grammaire des formulaires, sur TOUTES les familles (lieu, fiche),
 *         à 390 · 820 · 1440 : l'endroit d'ouverture, la barre du bas (ordre,
 *         libellés, 44 px), les champs à 44 px, la règle des deux colonnes
 *   A435  8a : un formulaire d'édition ouvert avant l'arrivée des données
 *         n'est PAS saisissable ; il s'ouvre rempli quand elles arrivent
 *   A436  8b : 300 volontaires — la page n'en pose qu'une fenêtre, et la
 *         dernière ligne s'atteint en défilant
 */

const OUT = process.env.DIST ?? 'dist-bdui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5447), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bd/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const at = '2026-10-12T08:00:00.000Z'
const inst = (over: Partial<Institution>): Institution => ({
  id: 'inst-bd-x', name: '', locality: 'אופקים', kind: 'mechina', audience: 'mixed', network: '', position: null, positionUncertain: false,
  engagement: 'interested', contactName: '', contactPhone: '', notes: '', extra: '', source: 'manual', engagementConfirmed: true, metOn: null, students: null,
  positionSource: '', aliases: '', createdAt: at, updatedAt: at, contacts: [], ...over,
})
const NOPOS = inst({ id: 'inst-bd-nopos', name: 'מכינת הדגמה בלי מיקום', contacts: [{ id: 'ic-bd-1', role: 'head', name: 'ראש הדגמה', phone: '050-0001101', note: '' }] })
const NOPOS2 = inst({ id: 'inst-bd-nopos2', name: 'מדרשת הדגמה בלי מיקום', kind: 'midrasha', locality: 'ירוחם' })
const PLACED = inst({ id: 'inst-bd-placed', name: 'ישיבת הדגמה ממוקמת', kind: 'hesder', engagement: 'signed', position: { lat: 31.42, lng: 34.59 }, contacts: [{ id: 'ic-bd-2', role: 'coordinator', name: 'רכז הדגמה', phone: '050-0001102', note: '' }] })

/** Les natures, posées sur les fermes du banc (invariant : la première est בקר). */
const NATURES: Array<Farm['branches']> = [[{ kind: 'cattle' }], [{ kind: 'fieldCrops' }], [{ kind: 'sheep' }, { kind: 'cattle' }], [], [{ kind: 'vineyard' }]]

const db = (extra: (d: FakeDb) => void = () => {}): FakeDb => {
  const d = new FakeDb()
  seed(d)
  for (const i of [NOPOS, NOPOS2, PLACED]) d.rows('institutions').push({ ...MAPPINGS.institutions.toRows(i)[0].rows[0] })
  d.rows('entities').forEach((r, n) => {
    r.branches = NATURES[n % NATURES.length] ?? []
  })
  extra(d)
  return d
}

/** Le géocodeur simulé : une seule adresse est connue de lui. */
async function fakeGeocoder(page: Page): Promise<void> {
  await page.route('**/nominatim.openstreetmap.org/**', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q') ?? ''
    const body = q.includes('הדגמה 7') ? [{ lat: '31.3101', lon: '34.6203', display_name: 'רחוב הדגמה 7, אופקים, ישראל' }] : []
    await route.fulfill({ status: 200, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
}

const instRow = (d: FakeDb, id: string) => d.rows('institutions').find((r) => r.id === id) as Record<string, unknown> | undefined
const waitFor = async (page: Page, ok: () => boolean, ms = 6000): Promise<boolean> => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (ok()) return true
    await page.waitForTimeout(200)
  }
  return ok()
}

/** Le centre de la carte de la fiche, en coordonnées d'écran (hors des épingles). */
async function mapPoint(page: Page, fx = 0.5, fy = 0.6): Promise<{ x: number; y: number }> {
  const box = await page.locator('[data-pin-map] .maplibregl-canvas').first().boundingBox()
  if (!box) throw new Error('pas de carte')
  return { x: box.x + box.width * fx, y: box.y + box.height * fy }
}

// ---------------------------------------------------------------------------
await guard('A432', async () => {
  section('A432 — la fiche d’institution est un lieu')
  for (const width of [1440, 390]) {
    const d = db()
    const o = await open(width, { db: d })
    await fakeGeocoder(o.page)
    await go(o.page, APP, `/coordinator/institutions/${NOPOS.id}`, 4000)
    const shape = await o.page.evaluate(() => {
      const fam = document.querySelector('[data-form-family]')?.getAttribute('data-form-family')
      const map = document.querySelector<HTMLElement>('[data-map-shell] [data-pin-map]')
      const content = document.querySelector<HTMLElement>('[data-map-content]')
      const r = map?.getBoundingClientRect()
      const c = content?.getBoundingClientRect()
      return { fam, map: !!r && r.width > 100 && r.height > 100, left: r && c ? r.right <= c.left + 2 : false, above: r && c ? r.bottom <= c.top + 2 : false, mapW: r?.width ?? 0 }
    })
    check(`A432 ${width} la fiche est une page de LIEU (carte présente)`, shape.fam === 'lieu' && shape.map, JSON.stringify(shape))
    check(`A432 ${width} la carte à la même place que pour une ferme (${width >= 1280 ? 'à gauche' : 'au-dessus'})`, width >= 1280 ? shape.left : shape.above, JSON.stringify(shape))
    // La fiche sans position le dit, et le dire est un bouton.
    const btn = o.page.locator('[data-testid="place-no-position"]')
    check(`A432 ${width} sans position : « אין מיקום · להצבה על המפה » est un BOUTON`, (await btn.count()) === 1 && /אין מיקום/.test(await btn.innerText()))
    await btn.click()
    await o.page.waitForTimeout(500)
    const focused = await o.page.evaluate(() => document.activeElement?.id)
    check(`A432 ${width} … qui mène au geste : la carte armée, le curseur dans l’adresse`, focused === 'institution-address' && (await o.page.locator('[data-pin-map][data-has-point="false"]').count()) === 1, String(focused))
    // L'adresse propose un point.
    await o.page.locator('[data-testid="place-address-input"]').fill('רחוב הדגמה 7, אופקים')
    await o.page.keyboard.press('Enter')
    const proposed = await o.page.locator('[data-testid="pin-proposal"]').waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false)
    check(`A432 ${width} saisir une adresse PROPOSE un point (pas encore posé)`, proposed && instRow(d, NOPOS.id)?.lat == null, `${instRow(d, NOPOS.id)?.lat}`)
    check(`A432 ${width} … l’adresse est enregistrée`, await waitFor(o.page, () => instRow(d, NOPOS.id)?.address === 'רחוב הדגמה 7, אופקים'), String(instRow(d, NOPOS.id)?.address))
    await o.page.screenshot({ path: `${SHOTS}/a432-proposition-${width}.png` })
    await o.page.locator('[data-testid="pin-proposal-accept"]').click()
    const placed = await waitFor(o.page, () => Math.abs(Number(instRow(d, NOPOS.id)?.lat) - 31.3101) < 1e-4)
    check(`A432 ${width} validée, la proposition POSE le point (en base)`, placed, `${instRow(d, NOPOS.id)?.lat},${instRow(d, NOPOS.id)?.lng}`)
    check(`A432 ${width} … et la fiche ne dit plus « sans position »`, (await o.page.locator('[data-testid="place-no-position"]').count()) === 0)
    // L'appui long pose (déplace) le point.
    await o.page.waitForTimeout(800)
    const before = Number(instRow(d, NOPOS.id)?.lat)
    const p = await mapPoint(o.page, 0.3, 0.75)
    await o.page.mouse.move(p.x, p.y)
    await o.page.mouse.down()
    await o.page.waitForTimeout(900)
    await o.page.mouse.up()
    const moved = await waitFor(o.page, () => Math.abs(Number(instRow(d, NOPOS.id)?.lat) - before) > 1e-6)
    check(`A432 ${width} l’appui long sur la carte pose le point ailleurs`, moved, `${before} → ${instRow(d, NOPOS.id)?.lat}`)
    // Glisser l'épingle la déplace.
    await o.page.waitForTimeout(800)
    const pin = o.page.locator('[data-pin-map] [data-marker-kind="pin"]').first()
    const pb = await pin.boundingBox()
    const latBeforeDrag = Number(instRow(d, NOPOS.id)?.lat)
    if (pb) {
      await o.page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height - 6)
      await o.page.mouse.down()
      await o.page.mouse.move(pb.x + pb.width / 2 + 40, pb.y + pb.height + 50, { steps: 8 })
      await o.page.mouse.up()
    }
    const dragged = await waitFor(o.page, () => Math.abs(Number(instRow(d, NOPOS.id)?.lat) - latBeforeDrag) > 1e-6)
    check(`A432 ${width} on peut DÉPLACER le point (glisser l’épingle)`, !!pb && dragged, `${latBeforeDrag} → ${instRow(d, NOPOS.id)?.lat}`)
    await o.page.screenshot({ path: `${SHOTS}/a432-pose-${width}.png` })
    check(`A432 ${width} aucune erreur de page`, o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
  }
  // L'aperçu et la liste : « sans position » mène au geste.
  const d = db()
  const o = await open(1440, { db: d })
  await go(o.page, APP, `/coordinator/institutions?open=${NOPOS2.id}`, 4000)
  const link = o.page.locator('[data-testid="institution-preview-no-position"]')
  const href = await link.getAttribute('href').catch(() => null)
  check('A432 l’aperçu d’une fiche sans position : « אין מיקום » est le lien vers le geste (`?place=1`)', !!href && href.includes(`/institutions/${NOPOS2.id}?place=1`), String(href))
  await go(o.page, APP, `/coordinator/institutions/${NOPOS2.id}?place=1`, 4000)
  check('A432 arrivé par ce lien : le curseur est déjà dans l’adresse', (await o.page.evaluate(() => document.activeElement?.id)) === 'institution-address')
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A433', async () => {
  section('A433 — la carte : couches, légende, épingles')
  const d = db()
  const o = await open(1440, { db: d })
  await go(o.page, APP, '/coordinator/farms', 5000)
  const count = (sel: string) => o.page.locator(`[data-map-shell] ${sel}`).count()
  const instMarkers = await count('[data-marker-kind="institution"]')
  const leadMarkers = await count('[data-marker-kind="lead"]')
  check('A433 la carte des fermes montre aussi institutions et contacts (couches allumées)', instMarkers >= 1 && leadMarkers >= 1, `inst ${instMarkers} · contacts ${leadMarkers}`)
  await o.page.locator('[data-testid="map-legend-toggle"]').first().click()
  await o.page.waitForTimeout(300)
  const legend = await o.page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-testid="status-legend"]')
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="legend-status-"]'))
    return { present: Number(el?.dataset.present), empty: Number(el?.dataset.empty), counts: rows.map((r) => Number(r.dataset.count)) }
  })
  check('A433 la légende ne montre que les statuts PRÉSENTS, chacun avec son compte', legend.counts.length === legend.present && legend.counts.every((n) => n > 0) && legend.empty > 0, JSON.stringify(legend))
  const pins = await count('[data-marker-kind="farm"], [data-marker-kind="moshav"]')
  check('A433 … et la somme des comptes = les fermes sur la carte', legend.counts.reduce((a, b) => a + b, 0) >= pins - 1 && pins > 0, `${legend.counts.reduce((a, b) => a + b, 0)} / ${pins} épingles (regroupées comprises)`)
  await o.page.locator('[data-testid="status-legend-all"]').click()
  await o.page.waitForTimeout(200)
  check('A433 « הצג את כל הסטטוסים » déplie les statuts vides (aucun supprimé)', (await o.page.locator('[data-testid^="legend-status-"]').count()) === legend.present + legend.empty)
  await o.page.screenshot({ path: `${SHOTS}/a433-legende-1440.png` })
  // Couches : institutions éteintes, gardé au rechargement.
  await o.page.locator('[data-testid="layer-institutions"]').first().uncheck()
  await o.page.waitForTimeout(400)
  check('A433 éteindre « מוסדות » retire les institutions de la carte', (await count('[data-marker-kind="institution"]')) === 0)
  // Repli par nature : seulement בקר.
  await o.page.locator('[data-testid="layer-sub-toggle-entities"]').first().click()
  await o.page.locator('[data-testid="layer-only-branch:cattle"]').first().click()
  await o.page.waitForTimeout(500)
  const glyphs = await o.page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-map-shell] [data-marker-kind="farm"]')).filter((e) => e.style.visibility !== 'hidden').map((e) => e.dataset.glyph))
  check('A433 « רק בקר » : seules les fermes à vaches restent', glyphs.length > 0 && glyphs.every((g) => g === 'cattle' || g === 'sheep'), glyphs.join(','))
  await o.page.reload({ waitUntil: 'load' })
  await o.page.waitForTimeout(4000)
  const kept = await o.page.evaluate(() => JSON.parse(localStorage.getItem('lo-yanum:map-layers') ?? '{}'))
  check('A433 le choix de couches SE GARDE (rechargement)', kept.institutions === false && kept['branch:cattle'] === true && kept['branch:fieldCrops'] === false && (await count('[data-marker-kind="institution"]')) === 0, JSON.stringify({ i: kept.institutions, c: kept['branch:cattle'], g: kept['branch:fieldCrops'] }))
  await go(o.page, APP, '/coordinator', 4000)
  check('A433 … et d’un écran à l’autre (tableau de bord)', (await count('[data-marker-kind="institution"]')) === 0)
  await o.page.evaluate(() => localStorage.removeItem('lo-yanum:map-layers'))
  // La grange au menu.
  const nav = await o.page.evaluate(() => document.querySelector('a[href$="/coordinator/farms"] svg path')?.getAttribute('d') ?? '')
  check('A433 l’icône de ferme au menu, à la place de la maison (la grange)', nav.startsWith('M3 20.5V11'), nav)
  await o.ctx.close()

  // Les épingles à 390 px.
  const p = await open(390, { db: db() })
  await go(p.page, APP, '/coordinator/farms', 4000)
  await p.page.locator('[data-testid="map-mode-full"], [data-testid="list-map-toggle"], [data-map-toggle]').first().click().catch(() => undefined)
  await p.page.waitForTimeout(2500)
  const sizes = await p.page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-marker-kind="farm"] svg[data-pin-svg]')).map((s) => {
      const r = s.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height), glyph: (s.closest('[data-marker-kind]') as HTMLElement).dataset.glyph }
    }),
  )
  check('A433 390 px : des épingles de ferme sur la carte', sizes.length > 0, `${sizes.length}`)
  check('A433 390 px : chaque tête fait au moins 30 px (à bout de bras)', sizes.length > 0 && sizes.every((s) => s.w >= 30 && s.h >= 48), JSON.stringify(sizes.slice(0, 3)))
  check('A433 390 px : chaque épingle porte l’icône de sa nature (ou la générique)', sizes.every((s) => ['cattle', 'fieldCrops', 'farm', 'vineyard', 'moshav'].includes(s.glyph ?? '')), [...new Set(sizes.map((s) => s.glyph))].join(','))
  const first = p.page.locator('[data-marker-kind="farm"]').first()
  await first.click({ force: true }).catch(() => undefined)
  await p.page.waitForTimeout(800)
  const sel = await p.page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-marker-kind="farm"][data-selected]')
    const r = el?.querySelector('svg')?.getBoundingClientRect()
    const other = Array.from(document.querySelectorAll<HTMLElement>('[data-marker-kind="farm"]:not([data-selected]) svg')).map((s) => s.getBoundingClientRect().width)
    return { ring: !!el?.querySelector('[data-pin-selected]'), w: r?.width ?? 0, other: Math.max(0, ...other) }
  })
  check('A433 l’épingle sélectionnée se distingue SANS la couleur : un anneau, plus grande', sel.ring && sel.w > sel.other, JSON.stringify(sel))
  await p.page.screenshot({ path: `${SHOTS}/a433-epingles-390.png` })
  await p.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A434', async () => {
  section('A434 — une seule forme pour tous les formulaires')
  const farm = farms[0]
  const SCREENS: Array<{ name: string; hash: string; family: 'lieu' | 'record'; actions: string }> = [
    { name: 'ferme (édition)', hash: `/coordinator/farms/${farm.id}/edit`, family: 'lieu', actions: 'cancel,save' },
    { name: 'ferme (nouvelle)', hash: '/coordinator/farms/new', family: 'lieu', actions: 'cancel,save' },
    { name: 'point de garde', hash: `/coordinator/farms/${farm.id}/anchors/new`, family: 'lieu', actions: 'cancel,save' },
    { name: 'institution', hash: `/coordinator/institutions/${PLACED.id}`, family: 'lieu', actions: 'done' },
    { name: 'contact à traiter', hash: `/coordinator/leads/${LEADS[0].id}`, family: 'lieu', actions: 'done' },
    { name: 'volontaire', hash: `/coordinator/volunteers/${VOLUNTEERS[0].id}/edit`, family: 'record', actions: 'cancel,save' },
    { name: 'conducteur (nouveau)', hash: '/coordinator/volunteers/new?driver=1', family: 'record', actions: 'cancel,save' },
    { name: 'visite', hash: '/coordinator/agenda/visit/new', family: 'record', actions: 'cancel,save' },
    { name: 'rendez-vous', hash: '/coordinator/agenda/meeting/new', family: 'record', actions: 'cancel,save' },
  ]
  for (const width of [390, 820, 1440]) {
    const o = await open(width, { db: db() })
    for (const s of SCREENS) {
      await go(o.page, APP, s.hash, 3500)
      const m = await o.page.evaluate((expected) => {
        const why: string[] = []
        const fam = document.querySelector('[data-form-family]')?.getAttribute('data-form-family') ?? null
        if (fam !== expected.family) why.push(`famille ${fam}`)
        // L'endroit d'ouverture.
        if (expected.family === 'lieu') {
          const map = document.querySelector<HTMLElement>('[data-map-shell] .maplibregl-canvas, [data-map-shell] [data-pin-map]')
          const content = document.querySelector<HTMLElement>('[data-map-content]')
          const r = map?.getBoundingClientRect()
          const c = content?.getBoundingClientRect()
          if (!r || r.width < 100) why.push('pas de carte')
          else if (window.innerWidth >= 1280 && c && !(r.right <= c.left + 2)) why.push('carte pas à gauche')
          else if (window.innerWidth < 1280 && c && !(r.bottom <= c.top + 2)) why.push('carte pas au-dessus')
        } else {
          const page = document.querySelector<HTMLElement>('[data-form-page]')
          const r = page?.getBoundingClientRect()
          if (!r) why.push('pas de page')
          else if (r.width > 768.5) why.push(`page de ${Math.round(r.width)} px`)
          if (document.querySelector('[data-form-page] .card')?.classList.contains('panel-scope') !== true) why.push('carte des champs sans panel-scope')
        }
        // La barre du bas.
        const bars = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="form-actions"]')).filter((b) => b.getBoundingClientRect().height > 0)
        if (bars.length !== 1) why.push(`${bars.length} barres`)
        const bar = bars[0]
        if (bar) {
          const r = bar.getBoundingClientRect()
          if (getComputedStyle(bar).position !== 'fixed') why.push('barre pas fixe')
          if (r.bottom < window.innerHeight - 140) why.push(`barre à ${Math.round(r.bottom)}`)
          const acts = Array.from(bar.querySelectorAll<HTMLElement>('[data-form-action]'))
          const order = acts.map((a) => a.dataset.formAction).filter((a) => a !== 'delete').join(',')
          if (order !== expected.actions) why.push(`ordre ${order}`)
          const label: Record<string, string> = { save: 'שמירה', cancel: 'ביטול', done: 'סיום', delete: 'מחיקה' }
          for (const a of acts) {
            if (a.innerText.trim() !== label[a.dataset.formAction ?? '']) why.push(`« ${a.innerText.trim()} » pour ${a.dataset.formAction}`)
            if (Math.max(a.getBoundingClientRect().height, parseFloat(getComputedStyle(a, '::before').height) || 0) < 43.5) why.push(`bouton ${a.dataset.formAction} ${Math.round(a.getBoundingClientRect().height)} px`)
          }
          const del = acts.findIndex((a) => a.dataset.formAction === 'delete')
          if (del > 0) why.push('supprimer pas au bout')
        }
        // Les champs à 44 px.
        const root = document.querySelector<HTMLElement>('[data-map-content]') ?? document.querySelector<HTMLElement>('[data-form-page]') ?? document.body
        const fields = Array.from(root.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]), select, textarea')).filter((f) => {
          const r = f.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && getComputedStyle(f).visibility !== 'hidden'
        })
        const small = fields.filter((f) => f.getBoundingClientRect().height < 43.5)
        if (small.length) why.push(`${small.length}/${fields.length} champs < 44 px : ${small.slice(0, 3).map((f) => `${f.getAttribute('data-testid') || f.getAttribute('name') || f.tagName}:${Math.round(f.getBoundingClientRect().height)}`).join(' ')}`)
        // Les cibles à 44 px : tout bouton, lien ou case du formulaire.
        const targets = Array.from(root.querySelectorAll<HTMLElement>('button, a[href], [role="radio"], [role="checkbox"], label:has(> input[type=checkbox]), label:has(> input[type=radio])')).filter((b) => {
          const r = b.getBoundingClientRect()
          if (r.width === 0 || r.height === 0 || getComputedStyle(b).visibility === 'hidden') return false
          // Un lien DANS une phrase (texte courant) n'est pas une cible isolée.
          if (b.tagName === 'A' && getComputedStyle(b).display === 'inline') return false
          return !b.closest('[data-testid="form-actions"]')
        })
        /* La zone tactile compte (le `::before` de 44 px des boutons, AA1.1),
           comme pour `bcmobile` A419 ; l'encre peut être plus petite. */
        const hit = (b: HTMLElement) => Math.max(b.getBoundingClientRect().height, parseFloat(getComputedStyle(b, '::before').height) || 0)
        const tiny = targets.filter((b) => hit(b) < 43.5)
        if (tiny.length) why.push(`${tiny.length}/${targets.length} cibles < 44 px : ${tiny.slice(0, 4).map((b) => `${b.getAttribute('data-testid') || (b.innerText || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 18)}:${Math.round(hit(b))}`).join(' | ')}`)
        // La règle des deux colonnes.
        for (const g of Array.from(root.querySelectorAll<HTMLElement>('.form-grid'))) {
          if (g.getBoundingClientRect().width === 0) continue
          const box = g.closest<HTMLElement>('.panel-scope')
          if (!box) {
            why.push('form-grid hors panel-scope')
            continue
          }
          const cs = getComputedStyle(box)
          const inner = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
          const cols = getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length
          const want = inner >= 480 ? 2 : 1
          if (cols !== want) why.push(`grille ${cols} colonnes pour ${Math.round(inner)} px`)
        }
        return why
      }, { family: s.family, actions: s.actions })
      check(`A434 ${width} ${s.name}`, m.length === 0, m.join(' · '))
      if (width !== 820) await o.page.screenshot({ path: `${SHOTS}/a434-${s.name.replace(/[^\w]+/g, '-')}-${width}.png` }).catch(() => undefined)
    }
    check(`A434 ${width} aucune erreur de page`, o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
  }
})

// ---------------------------------------------------------------------------
await guard('A435', async () => {
  section('A435 — 8a : le formulaire n’est pas saisissable avant ses données')
  /* Seules les FERMES arrivent en retard (5 s) : le reste de l'app démarre,
     comme un téléphone qui relit son cache puis le serveur. */
  const d = db()
  const o = await open(1440, { db: d })
  await o.page.route(/\/rest\/v1\/(entities|entity_)/, async (route) => {
    if (route.request().method() === 'GET') await new Promise((r) => setTimeout(r, 5000))
    await route.fallback()
  })
  await go(o.page, APP, `/coordinator/farms/${farms[0].id}/edit`, 1500)
  const early = await o.page.evaluate(() => ({
    waiting: !!document.querySelector('[data-form-waiting]'),
    inputs: Array.from(document.querySelectorAll<HTMLInputElement>('[data-map-content] input, [data-map-content] textarea')).filter((i) => i.getBoundingClientRect().height > 0 && !i.disabled && !i.readOnly).length,
    name: document.querySelector<HTMLInputElement>('[data-testid="farm-form-name"]')?.value ?? null,
  }))
  check('A435 avant l’arrivée des données : l’attente, AUCUN champ saisissable', early.waiting && early.inputs === 0, JSON.stringify(early))
  await o.page.waitForTimeout(6500)
  const late = await o.page.evaluate(() => ({
    waiting: !!document.querySelector('[data-form-waiting]'),
    fam: document.querySelector('[data-form-family]')?.getAttribute('data-form-family'),
    values: Array.from(document.querySelectorAll<HTMLInputElement>('[data-map-content] input')).map((i) => i.value),
  }))
  check('A435 les données arrivées : le formulaire s’ouvre REMPLI (le nom de la ferme y est)', !late.waiting && late.fam === 'lieu' && late.values.includes(farms[0].name), `${late.waiting} ${late.fam} ${late.values.slice(0, 4).join('|')}`)
  check('A435 aucune erreur de page', o.errors.length === 0, o.errors.join(' | '))
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A436', async () => {
  section('A436 — 8b : 300 volontaires, une fenêtre de lignes')
  const many = (d: FakeDb) => {
    const base = d.rows('volunteers')[0]
    for (let n = 0; n < 300; n++) d.rows('volunteers').push({ ...base, id: `vol-bd-${String(n).padStart(3, '0')}`, name: `מתנדב הדגמה ${String(n).padStart(3, '0')}`, phone: `050-00${String(20000 + n).slice(-5)}`, institution_id: null })
  }
  for (const width of [390, 1440]) {
    const o = await open(width, { db: db(many) })
    await go(o.page, APP, '/coordinator/volunteers', 5000)
    const m = await o.page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('[data-entity-table]:not([hidden])')
      return { rows: Number(t?.dataset.rows), virtual: t?.dataset.virtual ?? null, inDom: t?.querySelectorAll('[data-row-key]').length ?? 0 }
    })
    check(`A436 ${width} la liste a ${m.rows} volontaires, la page n’en pose que ${m.inDom}`, m.rows >= 300 && !!m.virtual && m.inDom < 120, JSON.stringify(m))
    // Défiler jusqu'au bout : la dernière ligne s'atteint.
    for (let k = 0; k < 40; k++) {
      await o.page.mouse.wheel(0, 4000)
      await o.page.waitForTimeout(80)
    }
    await o.page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) if (el.scrollHeight > el.clientHeight + 200 && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight
    })
    await o.page.waitForTimeout(800)
    const last = await o.page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-entity-table]:not([hidden]) [data-row-key]')).map((r) => r.dataset.rowKey))
    check(`A436 ${width} en défilant, la fin de la liste est rendue (et seulement elle)`, last.length > 0 && last.length < 120 && !last.includes('vol-bd-000'), `${last.length} lignes, ${last.slice(-2).join(',')}`)
    check(`A436 ${width} aucune erreur de page`, o.errors.length === 0, o.errors.join(' | '))
    await o.ctx.close()
  }
})

await finish()
