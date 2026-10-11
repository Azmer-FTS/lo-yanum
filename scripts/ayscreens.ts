import type { Page } from 'playwright'

import { FakeDb } from './fake-supabase'
import { REMOTE, TOUR, VOLUNTEERS, check, farms, finish, go, guard, open, section, seed, serveBuild, shots } from './ayharness'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AY2 → AY12 — LES ÉCRANS, AU RENDU.   A359 · A360 · A361 · A362 · A364 ·
 *                                       A366 · A367 · A368 · A369
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ayscreens                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run ayscreens    # le DÉPLOYÉ
 *   GUARD=A360 …                                                       # une section
 *
 * Build réel + base factice (vraies fermes, onze institutions réelles, trois
 * volontaires rattachés). Rien n'est écrit sur `lo-yanum-prod`.
 */

const OUT = process.env.DIST ?? 'dist-ayui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5418), process.env.SKIP_BUILD !== '1'))
const SHOTS = shots('screens')
const only = (label: string) => !process.env.GUARD || label.startsWith(process.env.GUARD)
const run = (label: string, fn: () => Promise<void>) => (only(label) ? guard(label, fn) : Promise.resolve())

const LISTS = [
  { name: 'fermes', route: '/coordinator/farms', table: 'farms-table', preview: 'farm-preview', prep: async (p: Page) => void (await p.locator('[data-testid="map-mode-hidden"]').click().catch(() => undefined)) },
  { name: 'institutions', route: '/coordinator/institutions', table: 'institutions-table', preview: 'institution-preview' },
  { name: 'contacts', route: '/coordinator/leads', table: 'leads-table', preview: 'lead-preview' },
  { name: 'volontaires', route: '/coordinator/volunteers', table: 'people-table', preview: 'person-preview' },
] as Array<{ name: string; route: string; table: string; preview: string; prep?: (p: Page) => Promise<void> }>

// ===========================================================================
section('A359 · A360 — une seule forme de tableau ; en grand écran, l’aperçu latéral')
// ===========================================================================
await run('A359', async () => {
  for (const w of [1440, 402]) {
    const o = await open(w)
    for (const l of LISTS) {
      await go(o.page, APP, l.route, 3500)
      if (l.prep && w >= 1000) await l.prep(o.page)
      await o.page.waitForTimeout(500)
      const t = o.page.locator(`[data-testid="${l.table}"][data-entity-table]`)
      const ok = (await t.count()) === 1
      const stacked = ok ? (await t.getAttribute('data-stacked')) !== null : false
      const firstRow = t.locator('[data-row-key]').first()
      const actions = w >= 1000 ? await firstRow.locator('[data-row-action="view"], [data-row-action="edit"]').count() : await firstRow.locator('[data-testid$="-toggle"]').count()
      check(
        `A359 ${w} px · ${l.name} : la forme commune${w >= 1000 ? ' (tableau, gestes voir · modifier au bout)' : ' (lignes à deux étages, un seul bouton ⋯)'}`,
        ok && (w >= 1000 ? !stacked && actions === 2 : stacked && actions === 1),
        `table ${ok} · empilée ${stacked} · gestes ${actions}`,
      )
    }
    check(`A359 ${w} px : aucune erreur de page`, o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
    await o.ctx.close()
  }
})

await run('A360', async () => {
  const o = await open(1440)
  for (const l of LISTS) {
    await go(o.page, APP, l.route, 3500)
    if (l.prep) await l.prep(o.page)
    await o.page.waitForTimeout(500)
    await o.page.locator(`[data-testid="${l.table}"] [data-row-key]`).first().locator('td').first().click()
    await o.page.waitForTimeout(2500)
    const panel = o.page.locator(`[data-testid="${l.preview}"]`)
    const box = (await panel.count()) ? await panel.boundingBox() : null
    const map = (await panel.count()) ? await panel.locator(`[data-testid="${l.preview}-map"]`).boundingBox() : null
    const edit = (await panel.count()) ? await panel.locator(`[data-testid="${l.preview}-edit"]`).count() : 0
    const fullHeight = !!box && box.height >= 900 - 60
    const side = !!box && box.width < 720 && box.x < 200 // à la fin de la ligne (la gauche en hébreu)
    const mapTop = !!box && !!map && map.y - box.y < 4 && map.height >= 200
    check(`A360 ${l.name} : un clic sur la ligne ouvre un panneau LATÉRAL pleine hauteur`, fullHeight && side, box ? `${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}×${Math.round(box.height)}` : 'aucun panneau')
    check(`A360 ${l.name} : la carte est épinglée EN HAUT du panneau, et un bouton mène à l’édition`, mapTop && edit === 1, `carte ${map ? Math.round(map.height) : 0} px · édition ${edit}`)
    await o.page.screenshot({ path: `${SHOTS}/a360-${l.name}-1440.png` })
    await o.page.keyboard.press('Escape')
  }
  check('A360 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
  // Au téléphone : la même chose, en feuille plein écran.
  const p = await open(402)
  await go(p.page, APP, '/coordinator/institutions', 3500)
  await p.page.locator('[data-testid="institutions-table"] [data-row-open]').first().click()
  await p.page.waitForTimeout(2500)
  const b = await p.page.locator('[data-testid="institution-preview"]').boundingBox()
  check('A360 402 px : l’aperçu est une feuille plein écran, carte en haut', !!b && b.width >= 400 && b.height >= 700, b ? `${Math.round(b.width)}×${Math.round(b.height)}` : 'aucune')
  await p.page.screenshot({ path: `${SHOTS}/a360-institution-402.png` })
  await p.ctx.close()
})

// ===========================================================================
section('A361 — volontaires et conducteurs réunis ; ceux d’une institution, depuis sa fiche')
// ===========================================================================
await run('A361', async () => {
  const o = await open(1440)
  await go(o.page, APP, '/coordinator/drivers', 3500)
  await o.page.screenshot({ path: `${SHOTS}/a361-conducteurs-1440.png` })
  check('A361 « נהגים » mène à l’écran des volontaires, conducteurs isolés', /#\/coordinator\/volunteers\?drivers=1/.test(o.page.url()) && (await o.page.locator('[data-testid="people-filter-drivers"]').getAttribute('aria-pressed')) === 'true', o.page.url())
  const rows = await o.page.locator('[data-testid="people-table"] [data-row-key]').count()
  const driving = await o.page.locator('[data-testid="people-table"] [data-row-key][data-drives]').count()
  check('A361 avec le bouton : seulement ceux qui conduisent', rows > 0 && rows === driving, `${driving}/${rows}`)
  check('A361 le rail n’a plus d’entrée « נהגים »', (await o.page.locator('[data-testid="rail-nav"] a[href$="/coordinator/drivers"]').count()) === 0)
  // La fiche de l'institution : SES volontaires, SES conducteurs, qui part avec qui.
  await go(o.page, APP, `/coordinator/institutions/${TOUR[0].id}`, 3000)
  const people = o.page.locator('[data-testid="institution-people"]')
  const nv = Number(await people.getAttribute('data-volunteers'))
  const nd = Number(await people.getAttribute('data-drivers'))
  const expectV = VOLUNTEERS.filter((v) => v.institution_id === TOUR[0].id).length
  const expectD = VOLUNTEERS.filter((v) => v.institution_id === TOUR[0].id && v.can_drive).length
  check('A361 la fiche de l’institution montre SES volontaires et SES conducteurs', nv === expectV && nd === expectD, `${nv} volontaires (attendu ${expectV}) · ${nd} conducteurs (attendu ${expectD})`)
  const rider = VOLUNTEERS.find((v) => v.institution_id === TOUR[0].id && !v.can_drive)!
  const driver = VOLUNTEERS.find((v) => v.institution_id === TOUR[0].id && v.can_drive)!
  await o.page.locator(`[data-testid="institution-ride-${rider.id}"]`).selectOption(driver.id)
  await o.page.waitForTimeout(1500)
  check('A361 « יוצא עם » : la correspondance se pose d’un toucher et s’écrit', o.db.rows('volunteers').find((r) => r.id === rider.id)?.ride_with === driver.id)
  await o.page.screenshot({ path: `${SHOTS}/a361-institution-gens-1440.png` })
  check('A361 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A362 — confirmer avant, pouvoir annuler après')
// ===========================================================================
await run('A362', async () => {
  const o = await open(1440)
  await go(o.page, APP, '/coordinator/volunteers', 3500)
  const v = VOLUNTEERS[1]
  await o.page.locator(`[data-testid="people-table-menu-${v.id}-toggle"]`).click()
  await o.page.locator(`[data-testid="person-delete-${v.id}"]`).click()
  await o.page.waitForTimeout(400)
  const asked = await o.page.locator('[data-testid="delete-confirm"]').isVisible()
  check('A362 supprimer demande confirmation', asked)
  await o.page.locator('[data-testid="delete-confirm"]').click()
  await o.page.waitForTimeout(1500)
  const gone = !o.db.rows('volunteers').some((r) => r.id === v.id)
  const toast = o.page.locator('[data-testid="undo-toast"]')
  check('A362 … puis « ביטול » est offert', gone && (await toast.isVisible()), `supprimé ${gone}`)
  await o.page.locator('[data-testid="undo-toast-undo"]').click()
  await o.page.waitForTimeout(1500)
  check('A362 « ביטול » rend la fiche, en base', o.db.rows('volunteers').some((r) => r.id === v.id))
  // Un geste d'un seul toucher (confirmer une institution) s'annule aussi.
  await go(o.page, APP, '/coordinator/institutions?filter=toConfirm', 3500)
  const btn = o.page.locator('[data-testid^="institution-confirm-"]').first()
  const id = (await btn.getAttribute('data-testid'))!.replace('institution-confirm-', '')
  await btn.click()
  await o.page.waitForTimeout(1200)
  const confirmed = o.db.rows('institutions').find((r) => r.id === id)?.engagement_confirmed === true
  await o.page.locator('[data-testid="undo-toast-undo"]').click()
  await o.page.waitForTimeout(1500)
  check('A362 confirmer une institution (un toucher) s’annule aussi', confirmed && o.db.rows('institutions').find((r) => r.id === id)?.engagement_confirmed === false)
  check('A362 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A364 — la fiche d’institution sur la carte : quatre chiffres, le nom au toucher')
// ===========================================================================
await run('A364', async () => {
  const o = await open(1440)
  await go(o.page, APP, '/coordinator/coverage', 6000)
  const named = await o.page.locator('.maplibregl-marker[data-marker-kind="institution"] [data-marker-label]').count()
  check('A364 aucun nom d’institution affiché en permanence sur la carte', named === 0, `${named}`)
  // Le toucher sur le marqueur (la boîte de 44 px est transparente : on clique l'élément lui-même).
  await o.page.locator('.maplibregl-marker[data-marker-kind="institution"]').first().evaluate((e) => (e as HTMLElement).click())
  await o.page.waitForTimeout(1500)
  const card = o.page.locator('[data-testid="coverage-institution-card"]')
  const figs = await card.locator('[data-testid^="coverage-fig-"]').count()
  const big = await card.locator('[data-testid="coverage-fig-volunteers"] p').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize))
  check('A364 toucher l’institution : son nom et QUATRE chiffres, gros', figs === 4 && big >= 30, `${figs} chiffres · ${big}px`)
  check('A364 … et son nom apparaît alors sur la carte', (await o.page.locator('.maplibregl-marker[data-marker-kind="institution"] [data-marker-label]').count()) === 1)
  check('A364 le reste est derrière ⓘ (fermé)', (await card.locator('[data-testid="coverage-institution-info"]').count()) === 0 && (await card.locator('[data-testid="coverage-institution-info-toggle"]').count()) === 1)
  await o.page.screenshot({ path: `${SHOTS}/a364-fiche-institution-1440.png` })
  check('A363 la carte de couverture n’a plus de filtres d’engagement, mais un raccourci', (await o.page.locator('[data-testid="institutions-filter"], [data-testid^="institutions-filter-"]').count()) === 0 && (await o.page.locator('[data-testid="coverage-institutions-shortcut"]').count()) === 1)
  check('A364 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A366 — aucun encadré gris sur un bloc replié touché')
// ===========================================================================
await run('A366', async () => {
  const o = await open(1032, { touch: true })
  await go(o.page, APP, '/coordinator/settings', 3500)
  const head = o.page.locator('main [data-testid^="block-"]').first()
  await head.tap()
  await o.page.waitForTimeout(500)
  const bg = await head.evaluate((e) => getComputedStyle(e).backgroundColor)
  const outline = await head.evaluate((e) => getComputedStyle(e).boxShadow)
  check('A366 au doigt : aucun fond gris sur l’en-tête touché (plus de survol collé)', /rgba\(0, 0, 0, 0\)|transparent/.test(bg) && !/rgb/.test(outline === 'none' ? '' : outline), `fond ${bg} · ombre ${outline}`)
  await o.page.screenshot({ path: `${SHOTS}/a366-bloc-touche-1032.png` })
  await o.ctx.close()
})

// ===========================================================================
section('A367 — l’import : la photo, « X déjà présents sur Y », trois choix')
// ===========================================================================
await run('A367', async () => {
  const db = new FakeDb()
  seed(db)
  // Quinze volontaires existent déjà (dont un saisi à la main, sans photo et avec son courriel).
  const PHOTO = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg=='
  for (let i = 0; i < 15; i++) db.rows('volunteers').push({ ...VOLUNTEERS[0], id: `vol-imp-${i}`, name: `מתנדב ${i + 1}`, phone: `05${String(10000000 + i).padStart(8, '0')}`.replace(/^(\d{3})/, '$1-'), email: i === 0 ? 'saisi@example.invalid' : '', photo: null, institution_id: TOUR[0].id })
  const vcf = Array.from({ length: 20 }, (_, i) => `BEGIN:VCARD\nVERSION:3.0\nFN:מתנדב ${i + 1}\nTEL;type=CELL:05${String(10000000 + i).padStart(8, '0')}\nEMAIL:neuf${i}@example.invalid\nPHOTO;ENCODING=b;TYPE=PNG:${PHOTO}\nEND:VCARD`).join('\n')
  const o = await open(1440, { db })
  await go(o.page, APP, `/coordinator/add?type=volunteer&source=vcf&institution=${TOUR[0].id}`, 3000)
  await o.page.locator('[data-testid="add-files-input"]').setInputFiles({ name: 'vingt.vcf', mimeType: 'text/vcard', buffer: Buffer.from(vcf) })
  await o.page.waitForTimeout(2500)
  const sentence = await o.page.locator('[data-testid="add-existing-sentence"]').innerText().catch(() => '')
  check('A367 « 15 déjà présents sur 20 », en une phrase', /15/.test(sentence) && /20/.test(sentence), sentence)
  check('A367 trois boutons, « compléter » choisi par défaut', (await o.page.locator('[data-testid^="add-existing-"][role="radio"]').count()) === 3 && (await o.page.locator('[data-testid="add-existing-fill"]').getAttribute('aria-checked')) === 'true')
  const photos = await o.page.locator('[data-testid="add-draft-photo"][data-has-photo="true"]').count()
  check('A367 la photo de chaque fiche est récupérée', photos === 20, `${photos}/20`)
  await o.page.screenshot({ path: `${SHOTS}/a367-doublons-1440.png` })
  await o.page.locator('[data-testid="add-create"]').click()
  await o.page.waitForTimeout(2500)
  const rows = o.db.rows('volunteers').filter((r) => String(r.name).startsWith('מתנדב '))
  const first = o.db.rows('volunteers').find((r) => r.id === 'vol-imp-0')
  check('A367 cinq créés, quinze complétés (aucun doublon)', rows.length === 20, `${rows.length}`)
  check('A367 « compléter » : la photo arrive sur les fiches existantes', !!first?.photo && String(first.photo).startsWith('data:image/'))
  check('A367 « compléter » : ce que le PO avait saisi n’est PAS écrasé', first?.email === 'saisi@example.invalid', String(first?.email))
  check('A367 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
section('A368 — le jeu d’essai volontaires et conducteurs : marqué, hors compteurs, supprimable')
// ===========================================================================
await run('A368', async () => {
  const o = await open(1440)
  await go(o.page, APP, '/coordinator/volunteers', 3500)
  const totalOf = async () => Number(/(\d+)\/(\d+)/.exec(await o.page.locator('[data-testid="volunteers-top"]').innerText())?.[2] ?? -1)
  const total0 = await totalOf()
  await go(o.page, APP, '/coordinator/settings', 3000)
  await o.page.locator('[data-testid="block-settings-sample-data"][aria-expanded="false"]').click().catch(() => undefined)
  await o.page.locator('[data-testid="test-data-seed"]').click()
  await o.page.waitForTimeout(2000)
  const tests = o.db.rows('volunteers').filter((r) => String(r.id).startsWith('test-'))
  const cars = o.db.rows('drivers').filter((r) => String(r.id).startsWith('test-') && r.volunteer_id)
  check('A368 le jeu : volontaires rattachés à une institution d’essai, dont des conducteurs avec leur voiture', tests.length === 7 && tests.every((r) => r.institution_id === 'test-inst') && cars.length === 3, `${tests.length} volontaires · ${cars.length} voitures`)
  await go(o.page, APP, '/coordinator/volunteers', 3500)
  const badges = await o.page.locator('[data-testid="people-table"] [data-testid="test-data-badge"]').count()
  const total1 = await totalOf()
  check('A368 marqué « נתוני בדיקה » sur chaque ligne', badges >= 7, `${badges}`)
  check('A368 exclu des compteurs (le total ne bouge pas)', total0 > 0 && total0 === total1, `${total0} → ${total1}`)
  await o.page.screenshot({ path: `${SHOTS}/a368-jeu-essai-1440.png` })
  await go(o.page, APP, '/coordinator/settings', 3000)
  o.page.on('dialog', (d) => void d.accept())
  await o.page.locator('[data-testid="sample-data-purge"]').click()
  await o.page.waitForTimeout(3000)
  check('A368 supprimé en un geste (rien de « test- » ne reste)', !o.db.rows('volunteers').some((r) => String(r.id).startsWith('test-')) && !o.db.rows('institutions').some((r) => String(r.id).startsWith('test-')))
  await o.ctx.close()
})

// ===========================================================================
section('A369 — un seul écran d’import, un seul planificateur, la durée par la route')
// ===========================================================================
await run('A369', async () => {
  const o = await open(1440)
  await go(o.page, APP, '/coordinator/import', 2500)
  const cards = await o.page.locator('[data-testid^="import-choose-"]').count()
  check('A369 un écran d’import : ① ce qu’on importe (huit fichiers)', cards === 8, `${cards}`)
  for (const old of ['/coordinator/import/volunteers', '/coordinator/import/portal', '/coordinator/import/institutions', '/coordinator/import/signatures']) {
    await go(o.page, APP, old, 2500)
    check(`A369 l’ancienne adresse ${old} mène à l’écran unique`, /#\/coordinator\/import\?kind=/.test(o.page.url()) && (await o.page.locator('[data-testid="import-chosen"]').count()) === 1, o.page.url())
  }
  await go(o.page, APP, '/coordinator/route/free', 2500)
  check('A369 un seul planificateur (l’itinéraire libre y mène)', /#\/coordinator\/route(\?|$)/.test(o.page.url()))
  // La durée totale, par la route : trois fermes placées, le tracé mesuré.
  await go(o.page, APP, '/coordinator/route', 3000)
  for (const f of farms.filter((x) => !x.positionMissing).slice(0, 3)) await o.page.locator(`[data-testid="route-pick"][data-farm-id="${f.id}"]`).first().click().catch(() => undefined)
  let basis = ''
  for (let i = 0; i < 60 && basis !== 'road'; i++) {
    await o.page.waitForTimeout(1000)
    basis = (await o.page.locator('[data-testid="route-totals"]').getAttribute('data-basis').catch(() => '')) ?? ''
  }
  const minutes = Number(await o.page.locator('[data-testid="route-drive-time"]').getAttribute('data-minutes').catch(() => '0'))
  const legSum = await o.page.evaluate(() => {
    const r = (window as unknown as { __loYanumLastRoad?: { breakdown?: unknown } }).__loYanumLastRoad
    return r ? 1 : 0
  })
  check('A369 la durée totale est calculée PAR LA ROUTE (plus à vol d’oiseau)', basis === 'road' && minutes > 0 && legSum === 1, `base ${basis} · ${minutes} min`)
  await o.page.screenshot({ path: `${SHOTS}/a369-planificateur-1440.png` })
  check('A369 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

await finish()
