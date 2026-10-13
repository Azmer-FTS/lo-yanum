import { mkdirSync } from 'node:fs'

import { FakeDb } from './fake-supabase'
import { REMOTE, check, finish, go, guard, open, section, serveBuild } from './ayharness'
import { MAPPINGS } from '../src/data/rows'
import type { Farm, FarmContact } from '../src/core/types'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BA — LE TABLEAU DES FERMES, AU RENDU.   A396 · A397 · A398 · A399 · A400
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run baui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run baui    # le DÉPLOYÉ
 *
 * Build réel (ou bundle déployé) + base FACTICE : des fermes aux noms et
 * numéros INVENTÉS (050-000-07xx). Rien n'est écrit sur `lo-yanum-prod`.
 *
 *   A396  le nom de l'agriculteur (rang 1) SOUS le nom de la ferme, dans la
 *         cellule de tête, en texte secondaire — tableau ET vignettes ; la
 *         recherche le trouve
 *   A397  les filtres tiennent sur UNE rangée qui défile (1440 · 1032 · 402)
 *   A398  les statuts ont LEUR rangée, distincte, hors des filtres, sur une
 *         ligne, calée à gauche ; un statut filtre la liste
 *   A399  la légende des trois marques, et leur phrase au TOUCHER (402 px)
 *
 *   ★★ BC — ADAPTÉES au téléphone (A397 · A398 · A399 à 402 px) : le brief BC
 *   (3b, 3c) range les filtres dans une FEUILLE derrière un seul « סינון » et
 *   donne aux statuts leur propre déclencheur, qui ouvre la même feuille sur
 *   leur section (la légende des marques y est, sous les statuts) ; la rangée
 *   de BA reste en grand écran, vérifiée telle quelle à 1440 et 1032 px.
 *   A400  « טרם נוצר קשר » (filtre + fiche) ; la fiche : contacts ordonnés,
 *         rang 2 avec sa note, gardé en base ; la photo d'une personne
 *         retrouvée par son TÉLÉPHONE (bucket privé, URL signée)
 */

const OUT = process.env.DIST ?? 'dist-baui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5441), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/ba/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const at = '2026-10-12T08:00:00.000Z'
const fc = (id: string, name: string, phone: string, extra: Partial<FarmContact> = {}): FarmContact => ({ id, name, phone, email: '', role: '', photo: null, isPrimary: false, ...extra })
const farm = (f: Partial<Farm> & { id: string; name: string }): Farm =>
  ({
    locality: 'נתיבות', region: '', regionId: null, type: 'agriculture', status: 'verbal_ok', position: { lat: 31.42, lng: 34.59 }, farmDunams: 120, grazingDunams: 0,
    contacts: [], commitments: [], agreements: [], notes: '', photo: null, lastVisitAt: null, nextVisitAt: null, ...f,
  }) as Farm
const PERSON = 'ישראל הדגמה'
const F1 = farm({ id: 'farm-ba-t1', name: 'חוות הדגמה אלף', status: 'signed', farmerName: PERSON, farmerPhone: '050-0000701', contacts: [fc('fc-t1-1', PERSON, '050-0000701', { isPrimary: true }), fc('fc-t1-2', 'רונית הדגמה', '050-0000702', { note: 'מטפלת בבקר' })] })
const F2 = farm({ id: 'farm-ba-t2', name: 'גד״ש הדגמה', farmerName: 'גלעד הדגמה', farmerPhone: '050-0000703', contactEstablished: false, positionMissing: true, contacts: [fc('fc-t2-1', 'גלעד הדגמה', '050-0000703', { isPrimary: true })] })
const F3 = farm({ id: 'farm-ba-t3', name: 'משק הדגמה בית', status: 'on_hold', type: 'livestock', farmDunams: 0, grazingDunams: 400, position: { lat: 31.3, lng: 34.62 }, farmerName: 'דוד הדגמה', farmerPhone: '050-0000704', contacts: [fc('fc-t3-1', 'דוד הדגמה', '050-0000704', { isPrimary: true })] })
const FARMS = [F1, F2, F3]

const db = (): FakeDb => {
  const d = new FakeDb()
  d.seed()
  for (const f of FARMS) {
    for (const g of MAPPINGS.farms.toRows(f)) for (const r of g.rows) d.rows(g.table).push({ ...(r as Record<string, unknown>) })
  }
  /* La photo du rang 1 de F1, reliée par son NUMÉRO (aucun lien sur la fiche). */
  d.rows('contact_photos').push({ phone_e164: '+972500000701', object_key: '972500000701.jpg', kind: 'face' })
  return d
}

/* Le bucket privé, simulé : la signature d'URL et l'image. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64')
async function storage(o: { ctx: import('playwright').BrowserContext }, signed: string[]): Promise<void> {
  await o.ctx.route('**/storage/v1/object/sign/contact-photos**', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { paths?: string[] }
    signed.push(...(body.paths ?? []))
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify((body.paths ?? []).map((p) => ({ path: p, signedURL: `/object/sign/contact-photos/${p}?token=fake`, error: null }))),
    })
  })
  await o.ctx.route('**/storage/v1/object/sign/contact-photos/*.jpg**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'image/png' }, body: PNG }))
}

const tableMode = async (page: import('playwright').Page): Promise<void> => {
  await page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(800)
}

// ---------------------------------------------------------------------------
await guard('A396', async () => {
  section('A396 — l’agriculteur sous le nom de la ferme')
  const o = await open(1440, { db: db() })
  await go(o.page, APP, '/coordinator/farms')
  await tableMode(o.page)
  const row = o.page.locator(`[data-testid="farm-row-${F1.id}"]`).first()
  const title = row.locator('[data-entity-title]').first()
  const person = row.locator('[data-entity-person]').first()
  check('A396 le tableau montre l’agriculteur dans la ligne', (await person.count()) === 1 && (await person.innerText()).trim() === PERSON, await person.innerText().catch(() => '∅'))
  const tb = await title.boundingBox()
  const pb = await person.boundingBox()
  check('A396 … JUSTE SOUS le nom de la ferme (même cellule, en dessous)', !!tb && !!pb && pb.y >= tb.y + tb.height - 2 && pb.y - (tb.y + tb.height) < 12, `${tb?.y}/${tb?.height} → ${pb?.y}`)
  const sameCell = await person.evaluate((p) => {
    const cell = p.closest('td,th')
    return !!cell && !!cell.querySelector('[data-entity-title]')
  })
  check('A396 … dans la cellule de tête', sameCell)
  const [tSize, pSize, tColor, pColor] = await Promise.all([title.evaluate((e) => getComputedStyle(e).fontSize), person.evaluate((e) => getComputedStyle(e).fontSize), title.evaluate((e) => getComputedStyle(e).color), person.evaluate((e) => getComputedStyle(e).color)])
  check('A396 … en texte SECONDAIRE (plus petit ou d’une autre encre)', parseFloat(pSize) < parseFloat(tSize) || pColor !== tColor, `${tSize}/${pSize} ${tColor}/${pColor}`)
  check('A396 le rang 2 n’est PAS montré comme « le contact »', !(await row.innerText()).includes('רונית הדגמה'))
  await o.page.screenshot({ path: `${SHOTS}/a396-agriculteur-sous-ferme.png` })
  /* La recherche trouve la personne. */
  await o.page.locator('[data-testid="list-search-open"]').first().click().catch(() => undefined)
  const search = o.page.locator('[data-testid="list-search-panel"] input').first()
  await search.fill('ישראל הדגמה')
  await o.page.waitForTimeout(600)
  const shown = await o.page.locator('[data-testid^="farm-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  check('A396 chercher la PERSONNE retrouve sa ferme', shown.length === 1 && shown[0] === `farm-row-${F1.id}`, shown.join(','))
  await o.ctx.close()
  /* Les vignettes (carte visible) : la personne sous le nom aussi. */
  const v = await open(1440, { db: db() })
  await go(v.page, APP, '/coordinator/farms')
  await v.page.locator('[data-testid="map-mode-split"]').first().click({ timeout: 20_000 }).catch(() => undefined)
  await v.page.waitForTimeout(1200)
  const tile = v.page.locator('[data-testid="farm-tile"]').filter({ hasText: F1.name }).first()
  check('A396 la vignette montre l’agriculteur sous le nom', (await tile.locator('[data-entity-person]').first().innerText().catch(() => '')).trim() === PERSON)
  check('A396 aucune erreur de page', o.errors.length === 0 && v.errors.length === 0, [...o.errors, ...v.errors].slice(0, 2).join(' | '))
  await v.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A397', async () => {
  section('A397 — les filtres : une rangée, qui défile')
  /* ★★ BD — arbitrage du PO : la rangée de BA ne reste que sur l'ordinateur
     (≥ 80 rem) ; la tablette en « liste seule » prend la forme compacte. */
  for (const width of [1440]) {
    const o = await open(width, { db: db() })
    await go(o.page, APP, '/coordinator/farms')
    if (width > 700) await tableMode(o.page)
    const m = await o.page.evaluate(() => {
      const bar = document.querySelector('[data-filter-row]') as HTMLElement | null
      if (!bar) return null
      const line = (bar.querySelector('[data-testid="filter-one-line"]') ?? bar.querySelector('[data-kpis-inline]')) as HTMLElement | null
      const items = line ? (Array.from(line.querySelectorAll(':scope > *, :scope > .contents > *')) as HTMLElement[]).filter((e) => e.getBoundingClientRect().height > 0 && !e.classList.contains('contents')) : []
      const tops = items.map((e) => Math.round(e.getBoundingClientRect().top))
      const st = line ? getComputedStyle(line) : null
      /* Une seule rangée = toutes les pastilles sur la MÊME ligne (au pixel près). */
      return {
        oneLine: bar.hasAttribute('data-one-line'),
        items: items.length,
        lines: new Set(tops.map((t) => Math.round(t / 6))).size,
        wrap: st?.flexWrap,
        overflowX: st?.overflowX,
        barH: Math.round(bar.getBoundingClientRect().height),
        statusInside: !!bar.querySelector('[data-testid="farms-status"], [data-testid="farm-status-row"]'),
      }
    })
    check(`A397 ${width} px : la rangée de filtres est en mode « une ligne »`, !!m?.oneLine, JSON.stringify(m))
    check(`A397 ${width} px : ses ${m?.items ?? 0} éléments tiennent sur UNE ligne (nowrap, défile)`, !!m && m.items > 0 && m.lines === 1 && m.wrap === 'nowrap' && (m.overflowX === 'auto' || m.overflowX === 'scroll'), `lignes=${m?.lines} wrap=${m?.wrap} x=${m?.overflowX}`)
    check(`A397 ${width} px : la barre ne fait qu’une ligne de haut (≤ 64 px)`, !!m && m.barH <= 64, `${m?.barH} px`)
    check(`A397 ${width} px : aucun statut dans la rangée des filtres`, !!m && !m.statusInside)
    await o.page.screenshot({ path: `${SHOTS}/a397-filtres-${width}.png` })
    await o.ctx.close()
  }
  /* ★★ BC — au téléphone : la barre fine, UN « סינון », la feuille.
     ★★ BD — et en tablette « liste seule » (1032 px), la même. */
  {
    const t = await open(1032, { db: db() })
    await go(t.page, APP, '/coordinator/farms')
    await tableMode(t.page)
    const tm = await t.page.evaluate(() => ({ compact: !!document.querySelector('[data-list-top][data-compact]'), sheet: document.querySelectorAll('[data-testid="filter-sheet-open"]').length, oldRow: !!document.querySelector('[data-filter-row]') }))
    check('A397 1032 px, liste seule : la FORME COMPACTE (arbitrage du PO), plus la rangée de BA', tm.compact && tm.sheet === 1 && !tm.oldRow, JSON.stringify(tm))
    await t.page.screenshot({ path: `${SHOTS}/a397-compacte-1032.png` })
    await t.ctx.close()
  }
  const o = await open(402, { db: db() })
  await go(o.page, APP, '/coordinator/farms')
  const m = await o.page.evaluate(() => {
    const bar = document.querySelector('[data-list-top][data-compact]') as HTMLElement | null
    const row = bar?.firstElementChild as HTMLElement | null
    return {
      bar: !!bar,
      buttons: document.querySelectorAll('[data-testid="filter-sheet-open"]').length,
      count: document.querySelector('[data-testid="filter-sheet-open"]')?.getAttribute('data-count') ?? null,
      rowH: row ? Math.round(row.getBoundingClientRect().height) : 0,
      oldRow: !!document.querySelector('[data-filter-row]'),
    }
  })
  check('A397 402 px : la barre fine, UN bouton « סינון » qui porte le nombre de filtres actifs', m.bar && m.buttons === 1 && m.count !== null && !m.oldRow, JSON.stringify(m))
  check('A397 402 px : la rangée de la barre ne fait qu’une ligne de haut (≤ 64 px)', m.rowH > 0 && m.rowH <= 64, `${m.rowH} px`)
  await o.page.locator('[data-testid="filter-sheet-open"]').click()
  await o.page.waitForTimeout(450)
  const fams = await o.page.locator('[data-testid="filter-sheet"] section[data-family]').evaluateAll((els) => els.map((e) => e.getAttribute('data-family')))
  /* La MÊME feuille porte les statuts (brief BC 3c : leur déclencheur l'ouvre
     sur leur section) ; « סינון » l'ouvre en haut, sur toutes les familles. */
  check('A397 402 px : la feuille porte toutes les familles (les statuts compris, en section à part)', fams.length >= 4 && fams.includes('status') && fams.includes('region') && fams.includes('sort'), fams.join(','))
  await o.page.screenshot({ path: `${SHOTS}/a397-feuille-402.png` })
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A398', async () => {
  section('A398 — les statuts : leur rangée, à gauche')
  for (const width of [1440]) {
    const o = await open(width, { db: db() })
    await go(o.page, APP, '/coordinator/farms')
    if (width > 700) await tableMode(o.page)
    const m = await o.page.evaluate(() => {
      const row = document.querySelector('[data-testid="farm-status-row"]') as HTMLElement | null
      const chips = document.querySelector('[data-testid="farm-status-chips"]') as HTMLElement | null
      const bar = document.querySelector('[data-filter-row]') as HTMLElement | null
      if (!row || !chips) return null
      const segs = Array.from(chips.children) as HTMLElement[]
      const tops = segs.map((e) => Math.round(e.getBoundingClientRect().top))
      const cr = chips.getBoundingClientRect()
      const lefts = segs.map((e) => e.getBoundingClientRect().left)
      const rowBg = getComputedStyle(row).backgroundColor
      const barBg = bar ? getComputedStyle(bar).backgroundColor : ''
      return {
        segs: segs.length,
        oneLine: new Set(tops).size === 1,
        outsideFilters: !!bar && !bar.contains(row),
        below: !!bar && row.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 1,
        /* « complètement à gauche » : le segment le plus à gauche touche le bord gauche de sa rangée. */
        leftGap: Math.round(Math.min(...lefts) - cr.left),
        scrollable: chips.scrollWidth > chips.clientWidth + 1,
        rowBg,
        barBg,
        ring: getComputedStyle(row).boxShadow,
        dots: segs.filter((s) => s.querySelector('span.rounded-pill')).length,
      }
    })
    check(`A398 ${width} px : une rangée de statuts existe, HORS de la rangée des filtres`, !!m && m.outsideFilters && m.segs >= 3, JSON.stringify(m && { segs: m.segs, out: m.outsideFilters }))
    check(`A398 ${width} px : sur UNE ligne`, !!m && m.oneLine)
    check(`A398 ${width} px : calée complètement à gauche (ou défilante)`, !!m && (m.leftGap <= 4 || m.scrollable), `écart ${m?.leftGap}px défile=${m?.scrollable}`)
    check(`A398 ${width} px : visuellement distincte (fond + filet, pastilles de couleur)`, !!m && m.rowBg !== 'rgba(0, 0, 0, 0)' && m.rowBg !== m.barBg && m.dots >= 2, `${m?.rowBg} vs ${m?.barBg}`)
    if (width === 1440) {
      await o.page.locator(`[data-testid="farm-status-on_hold"]`).click()
      await o.page.waitForTimeout(500)
      const shown = await o.page.locator('[data-testid^="farm-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
      check('A398 toucher un statut filtre la liste', shown.length === 1 && shown[0] === `farm-row-${F3.id}`, shown.join(','))
      check('A398 … et le segment se dit choisi', (await o.page.locator('[data-testid="farm-status-on_hold"]').getAttribute('aria-checked')) === 'true')
    }
    await o.page.screenshot({ path: `${SHOTS}/a398-statuts-${width}.png` })
    await o.ctx.close()
  }
  /* ★★ BC — au téléphone : leur PROPRE déclencheur (statut courant + compte),
     hors du bouton des filtres ; il ouvre la feuille sur leur section. */
  const o = await open(402, { db: db() })
  await go(o.page, APP, '/coordinator/farms')
  const trig = o.page.locator('[data-testid="status-sheet-open"]')
  const text = (await trig.innerText().catch(() => '')).replace(/\s+/g, ' ')
  check('A398 402 px : les statuts ont leur déclencheur, qui dit le statut courant et son compte', (await trig.count()) === 1 && /\d/.test(text), text)
  await trig.click()
  await o.page.waitForTimeout(450)
  const inView = await o.page.evaluate(() => {
    const sec = document.querySelector('[data-testid="filter-sheet"] section[data-family="status"]') as HTMLElement | null
    if (!sec) return false
    const r = sec.getBoundingClientRect()
    return r.top >= 0 && r.top < innerHeight * 0.6
  })
  check('A398 402 px : il ouvre la feuille SUR les statuts', inView)
  await o.page.locator('[data-testid="farm-status-on_hold-option"]').click()
  await o.page.waitForTimeout(400)
  await o.page.locator('[data-testid="filter-sheet-show"]').click()
  await o.page.waitForTimeout(500)
  const shown = await o.page.locator('[data-testid^="farm-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  check('A398 402 px : choisir un statut filtre la liste', shown.length === 1 && shown[0] === `farm-row-${F3.id}`, shown.join(','))
  check('A398 402 px : … et le déclencheur le dit', (await trig.getAttribute('data-status')) === 'on_hold')
  await o.page.screenshot({ path: `${SHOTS}/a398-statuts-402.png` })
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A399', async () => {
  section('A399 — la légende des trois marques, au toucher')
  const o = await open(402, { db: db(), touch: true })
  await go(o.page, APP, '/coordinator/farms')
  /* ★★ BC — au téléphone, la légende est SOUS les statuts, dans la feuille
     qu'ouvre leur déclencheur (un toucher). */
  if ((await o.page.locator('[data-testid="farm-marks-legend"]').count()) === 0) {
    await o.page.locator('[data-testid="status-sheet-open"]').tap()
    await o.page.waitForTimeout(450)
  }
  const legend = o.page.locator('[data-testid="farm-marks-legend"]')
  check('A399 la légende est là, à 402 px', (await legend.count()) === 1)
  const want: Array<[string, RegExp]> = [
    ['status', /סטטוס/],
    ['neglect', /טבעת ריקה.*לא נשמרה אף פעם.*טבעת מלאה/],
    ['gap', /פער.*המוצהר.*במפה/],
  ]
  for (const [key, re] of want) {
    const btn = o.page.locator(`[data-testid="farm-mark-legend-${key}"]`)
    const box = await btn.boundingBox()
    check(`A399 « ${key} » : une cible de 44 px`, !!box && box.height >= 43.5, `${box?.height}`)
    await btn.tap()
    await o.page.waitForTimeout(250)
    const s = o.page.locator('[data-testid="farm-marks-sentence"]')
    const text = (await s.innerText().catch(() => '')).replace(/\s+/g, ' ')
    check(`A399 « ${key} » : toucher déplie SA phrase`, (await s.getAttribute('data-mark').catch(() => null)) === key && re.test(text), text.slice(0, 90))
  }
  await o.page.screenshot({ path: `${SHOTS}/a399-legende-402.png` })
  /* La légende de la carte porte les phrases écrites. */
  check('A399 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A400', async () => {
  section('A400 — « טרם נוצר קשר », la fiche, la photo par téléphone')
  const d = db()
  const o = await open(1440, { db: d })
  const signed: string[] = []
  await storage(o, signed)
  await go(o.page, APP, '/coordinator/farms')
  await tableMode(o.page)
  const pill = o.page.locator('[data-testid="farms-not-contacted"]')
  check('A400 le filtre « טרם נוצר קשר » est dans la rangée des filtres', (await pill.count()) === 1 && (await pill.innerText()).includes('טרם נוצר קשר'))
  await pill.click()
  await o.page.waitForTimeout(500)
  const shown = await o.page.locator('[data-testid^="farm-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  check('A400 … il ne garde que la fiche sans contact établi', shown.length === 1 && shown[0] === `farm-row-${F2.id}`, shown.join(','))
  await pill.click()
  await o.page.waitForTimeout(800)
  /* La photo du rang 1 de F1 : demandée par son numéro, montrée dans la ligne. */
  const img = o.page.locator(`[data-testid="farm-row-${F1.id}"] img`).first()
  const src = await img.getAttribute('src').catch(() => null)
  check('A400 la photo du rang 1 arrive par son TÉLÉPHONE (bucket privé, URL signée)', signed.includes('972500000701.jpg') && !!src && src.includes('972500000701.jpg'), `${signed.join(',')} · ${src?.slice(-40)}`)
  /* La fiche. */
  await go(o.page, APP, `/coordinator/farms/${F2.id}?tab=people`)
  const toggle = o.page.locator('[data-testid="farm-contact-established"]:visible').first()
  check('A400 la fiche dit « טרם נוצר קשר »', (await toggle.getAttribute('data-established')) === 'false' && (await toggle.innerText()).includes('טרם נוצר קשר'))
  await toggle.locator('input').click()
  await o.page.waitForTimeout(2500)
  const row2 = d.rows('entities').find((r) => r.id === F2.id)
  check('A400 … modifiable à la main, et gardé en base', (await toggle.getAttribute('data-established')) === 'true' && row2?.contact_established === true, String(row2?.contact_established))
  await go(o.page, APP, `/coordinator/farms/${F1.id}?tab=people`)
  await o.page.locator('[data-testid="farm-contacts-edit"]:visible').first().click()
  const ranks = await o.page.locator('[data-testid="farm-contacts-editor"] [data-rank]').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-rank')}:${(e.querySelector('[data-testid="farm-contact-name"]') as HTMLInputElement).value}`))
  check('A400 les contacts dans l’ordre : rang 1 l’agriculteur, rang 2 ensuite', ranks.join('|') === `1:${PERSON}|2:רונית הדגמה`, ranks.join('|'))
  check('A400 la note du rang 2 est montrée', (await o.page.locator('[data-testid="farm-contacts-editor"] [data-rank="2"] [data-testid="farm-contact-note"]').inputValue()) === 'מטפלת בבקר')
  await o.page.locator('[data-testid="farm-contact-add"]').click()
  const draft = o.page.locator('[data-testid="farm-contacts-editor"] [data-rank="3"]')
  await draft.locator('[data-testid="farm-contact-name"]').fill('חדש הדגמה')
  await draft.locator('[data-testid="farm-contact-phone"]').fill('050-0000709')
  await draft.locator('[data-testid="farm-contact-phone"]').blur()
  await o.page.waitForTimeout(400)
  await o.page.locator('[data-testid="farm-contacts-editor"] [data-rank="3"] [data-testid="farm-contact-note"]').fill('נוסף בבדיקה')
  await o.page.locator('[data-testid="farm-contacts-editor"] [data-rank="3"] [data-testid="farm-contact-note"]').blur()
  await o.page.waitForTimeout(2500)
  const kids = d.rows('entity_contacts').filter((r) => r.entity_id === F1.id).sort((a, b) => Number(a.position) - Number(b.position))
  check('A400 un rang 3 ajouté est gardé en base, avec sa note, à sa place', kids.length === 3 && kids[2].name === 'חדש הדגמה' && kids[2].note === 'נוסף בבדיקה' && kids[2].position === 2, kids.map((k) => `${k.position}:${k.name}`).join(','))
  const ent = d.rows('entities').find((r) => r.id === F1.id)
  check('A400 le miroir reste le rang 1', ent?.farmer_name === PERSON && ent?.farmer_phone === '050-0000701', `${ent?.farmer_name}`)
  /* Faire monter le rang 2 au rang 1. */
  await o.page.locator('[data-testid="farm-contacts-editor"] [data-rank="2"] [data-testid="farm-contact-up"]').click()
  await o.page.waitForTimeout(2500)
  const ent2 = d.rows('entities').find((r) => r.id === F1.id)
  check('A400 « ↑ » : le rang 2 devient le rang 1 et « le contact » de la ferme', ent2?.farmer_name === 'רונית הדגמה' && ent2?.farmer_phone === '050-0000702', `${ent2?.farmer_name}`)
  await o.page.screenshot({ path: `${SHOTS}/a400-fiche-contacts.png`, fullPage: true })
  check('A400 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

await finish()
