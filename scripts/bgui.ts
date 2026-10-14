import { mkdirSync } from 'node:fs'

import type { Page } from 'playwright'

import { REMOTE, TOUR, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { FakeDb } from './fake-supabase'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BG — AU RENDU.   A472 … A481
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run bgui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run bgui    # le DÉPLOYÉ
 *
 * Build réel (ou bundle déployé) + base FACTICE (stockage compris). ⛔ Les
 * fiches du banc portent des noms RÉELS (stock d'avant BA) : rebaptisées ici,
 * aucune capture n'en montre une, et la porte n'imprime aucun nom.
 *
 *   A472  une ferme touchée DANS le maillage affiché : centre et zoom
 *         identiques, autant de trajets dessinés, l'institution reste choisie ;
 *         seule la fiche compacte s'ouvre ; la fermer n'efface rien
 *   A473  la fiche compacte : étroite (la carte reste visible derrière),
 *         l'essentiel replié, les chiffres côte à côte, la flèche déplie et
 *         replie, l'état est retenu d'une ouverture à l'autre, cibles ≥ 44 px
 *   A474  ordinateur, panneau ouvert sur l'institution : AUCUN pop-up au clic
 *         sur son marqueur (il se met en évidence) ; carte pleine (le panneau
 *         caché) : la bulle revient — la place réelle décide
 *   A475  téléphone : le pop-up RÉDUIT (nom, type, village) ; son bouton ouvre
 *         la fiche
 *   A476  le chaînon : lier crée un lien (en base) ; sur une ferme liée
 *         ailleurs, la boîte NOMME l'institution en place, trois boutons dans
 *         l'ordre להחליף · להוסיף · ביטול ; « ביטול » ne touche rien,
 *         « להחליף » laisse un lien (le nouveau), « להוסיף » deux ; délier
 *         demande confirmation et retire ce lien seul
 *   A477  le bandeau des réglages : replié à l'ouverture d'une institution, une
 *         ligne qui dit le réglage ; rouvert au clic ; refermé par « סיום » ;
 *         l'état retenu au rechargement
 *   A478  le document : page 1 sans en-tête, bandeau jusqu'au bord supérieur
 *         (pixels), logo du bandeau plus grand que celui de l'en-tête ;
 *         en-tête dès la page 2 ; « page / total » sur toutes les pages ;
 *         marges tenues ; aucune date (texte ni métadonnée) ; aucune zone
 *         transparente (JPEG seuls, sans masque, groupe ni opacité) ; adresse
 *         stable écrasée, versions à côté et listées ; WhatsApp porte LE LIEN,
 *         le mail n'existe que si le contact a un mail
 *   A479  l'ordre des fermes suit le critère (minutes, puis kilomètres) ; la
 *         section hors seuil est repliée et son titre compte ; dedans + dehors
 *         = toutes
 *   A480  le lien du bas vers TOUTES les institutions a disparu ; l'icône en
 *         haut ouvre la fiche complète de CETTE institution
 *   A481  une ferme liée à deux institutions : signalée dans la liste et dans
 *         sa propre fiche
 */

const OUT = process.env.DIST ?? 'dist-bgui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5492), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/bg/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const INST_A = TOUR[0]
const INST_B = TOUR[3]
const R = 6371
const air = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Les fermes du banc, rebaptisées ; deux liens posés d'avance (une ferme prise par B, une ferme liée à A ET B). */
function bgDb(): { db: FakeDb; taken: { id: string; name: string }; multi: { id: string; name: string } } {
  const d = new FakeDb()
  seed(d)
  d.rows('entities').forEach((r, n) => {
    const k = String(n + 1).padStart(2, '0')
    Object.assign(r, { name: `חוות בדיקה ${k}`, farm_name: '', farmer_name: `חקלאי ${k}`, farmer_phone: `050-000-11${k}`, farmer_email: '', liaison_name: '', liaison_phone: '', standby_phone: '', notes: '', farmer_id_no: '' })
  })
  /* Le contact de tête d'A reçoit un MAIL (inventé) ; un second contact n'a qu'un numéro. */
  const a = d.rows('institutions').find((r) => r.id === INST_A.id)!
  a.contacts = [
    { id: 'ic-bg-1', role: 'head', name: 'רב בדיקה', phone: '050-0000301', phones: [{ number: '050-0000301', label: 'mobile' }], note: '', email: 'head@example.invalid' },
    { id: 'ic-bg-2', role: 'coordinator', name: 'רכז בדיקה', phone: '050-0000302', phones: [{ number: '050-0000302', label: 'mobile' }], note: '' },
  ]
  /* Les deux fermes les plus proches d'A (à vol d'oiseau) : l'une prise par B, l'autre liée à A et B. */
  const near = d
    .rows('entities')
    .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number' && !r.archived_at && ['signed', 'active', 'verbal_ok', 'contacted', 'visited', 'to_contact'].includes(String(r.status)))
    .map((r) => ({ r, km: air(INST_A.position!, { lat: r.lat as number, lng: r.lng as number }) }))
    .sort((x, y) => x.km - y.km)
  const taken = near[0].r
  const multi = near[1].r
  const at = new Date().toISOString()
  d.rows('farm_institution_links').push(
    { id: 'fil-bg-1', farm_id: taken.id, institution_id: INST_B.id, created_at: at, created_by: null },
    { id: 'fil-bg-2', farm_id: multi.id, institution_id: INST_A.id, created_at: at, created_by: null },
    { id: 'fil-bg-3', farm_id: multi.id, institution_id: INST_B.id, created_at: at, created_by: null },
  )
  return { db: d, taken: { id: String(taken.id), name: String(taken.name) }, multi: { id: String(multi.id), name: String(multi.name) } }
}

type Camera = { lat: number; lng: number; zoom: number }
const camera = (page: Page): Promise<Camera> =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number } }).__loYanumMap
    if (!m) return { lat: NaN, lng: NaN, zoom: NaN }
    const c = m.getCenter()
    return { lat: c.lat, lng: c.lng, zoom: m.getZoom() }
  })
const sameCamera = (a: Camera, b: Camera) => Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lng - b.lng) < 1e-7 && Math.abs(a.zoom - b.zoom) < 1e-6
const linkCount = (page: Page) =>
  page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getSource(id: string): unknown } }).__loYanumMap
    const s = m?.getSource('coverage-links') as { _data?: { features?: unknown[] } } | undefined
    return s?._data?.features?.length ?? -1
  })

/** Les trajets mesurés et stables (3 s sans changer). */
async function settledLinks(page: Page, ms = 60_000): Promise<number> {
  const until = Date.now() + ms
  let last = -2
  let since = Date.now()
  while (Date.now() < until) {
    const n = await linkCount(page)
    if (n !== last) {
      last = n
      since = Date.now()
    } else if (n > 0 && Date.now() - since > 3000) break
    await page.waitForTimeout(400)
  }
  return last
}
async function meshDone(page: Page, timeout = 120_000): Promise<void> {
  await page.waitForFunction(() => {
    const m = document.querySelector('[data-testid="coverage-mesh"]')
    return !!m && m.getAttribute('data-running') === 'false' && m.getAttribute('data-pending') === '0'
  }, undefined, { timeout })
  await page.waitForTimeout(600)
}

/** Une ferme du maillage dont l'épingle est visible et SOUS le doigt (rien par-dessus). */
async function freeMeshPin(page: Page, exclude: string[] = []): Promise<{ name: string; x: number; y: number } | null> {
  return page.evaluate((excl) => {
    const names = new Set([...document.querySelectorAll('[data-testid="coverage-reach-inside"] [data-testid^="coverage-reach-row-"] span.font-semibold')].map((e) => e.textContent ?? ''))
    const map = document.querySelector('[role="application"].maplibregl-map') as HTMLElement | null
    if (!map) return null
    const box = map.getBoundingClientRect()
    for (const el of document.querySelectorAll<HTMLElement>('.maplibregl-marker[data-marker-kind="farm"]')) {
      const name = el.getAttribute('aria-label') ?? ''
      if (!names.has(name) || excl.includes(name) || el.style.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (x < box.left + 60 || x > box.right - 60 || y < box.top + 120 || y > box.bottom - 120) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && (hit === el || el.contains(hit))) return { name, x, y }
    }
    return null
  }, exclude)
}
/**
 * ⚠️ Les épingles sont RECRÉÉES à chaque rendu de la carte (pendant la mesure
 * des routes, souvent) : un `locator.click()` court après un élément détaché.
 * On touche donc à l'ÉCRAN, au centre de l'épingle, comme un doigt.
 */
async function tapMarker(page: Page, kind: string, name: string): Promise<boolean> {
  const at = await page.evaluate(
    ({ kind, name }) => {
      const el = [...document.querySelectorAll<HTMLElement>(`.maplibregl-marker[data-marker-kind="${kind}"]`)].find((e) => e.getAttribute('aria-label') === name)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    },
    { kind, name },
  )
  if (!at) return false
  await page.mouse.click(at.x, at.y)
  return true
}
/** Le PO a dézoomé pour voir le maillage : un recul d'un cran et demi, autour de l'institution. */
async function showMesh(page: Page): Promise<void> {
  await page.evaluate(() => {
    const m = (window as unknown as { __loYanumMap?: { getZoom(): number; jumpTo(o: { zoom: number }): void } }).__loYanumMap
    m?.jumpTo({ zoom: (m?.getZoom() ?? 12) - 1.5 })
  })
  await page.waitForTimeout(1500)
}
const laidOut = (page: Page, testId: string) => page.evaluate((id) => {
  const el = document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
  return !!el && el.getClientRects().length > 0 && el.offsetWidth > 0
}, testId)

/** Le banc pour une ouverture : la base, la carte en mode partagé, rien d'autre de retenu. */
async function openCoverage(width: number, init: Record<string, string> = {}, db?: FakeDb) {
  const o = await open(width, { db: db ?? bgDb().db, init: { 'lo-yanum:map-mode:coverage': 'split', ...init } })
  return o
}

// ===========================================================================
await guard('A472', async () => {
  section('A472 — une ferme du maillage ne casse pas le contexte')
  const { db } = bgDb()
  const o = await openCoverage(1440, {}, db)
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  const links0 = await settledLinks(o.page)
  await meshDone(o.page)
  await showMesh(o.page)
  const found = await freeMeshPin(o.page)
  check('A472 une épingle du maillage, libre sous le doigt', !!found)
  if (!found) return
  const name = found.name
  const cam0 = await camera(o.page)
  await tapMarker(o.page, 'farm', name)
  await o.page.waitForTimeout(1500)
  const cam1 = await camera(o.page)
  const links1 = await linkCount(o.page)
  check('A472 la fiche compacte de la ferme s’ouvre', (await o.page.locator('[data-testid="coverage-farm-card"]').count()) === 1)
  check('A472 centre et zoom IDENTIQUES', sameCamera(cam0, cam1), `${cam0.lat.toFixed(6)},${cam0.lng.toFixed(6)} z${cam0.zoom.toFixed(4)} → ${cam1.lat.toFixed(6)},${cam1.lng.toFixed(6)} z${cam1.zoom.toFixed(4)}`)
  check('A472 autant de trajets dessinés', links0 > 0 && links1 === links0, `${links0} → ${links1}`)
  check('A472 l’institution reste choisie', (await o.page.locator('[data-testid="coverage-recall"]').first().getAttribute('data-inst')) === INST_A.id && (await o.page.locator('[data-testid="coverage-selected"]').getAttribute('data-inst')) === INST_A.id)
  if (process.env.CAPTURES !== '0') await o.page.screenshot({ path: `${SHOTS}/a472-ferme-dans-le-maillage-1440.png` })
  await o.page.locator('[data-testid="coverage-farm-card-close"]').click()
  await o.page.waitForTimeout(800)
  check('A472 fermer la fiche n’efface rien d’autre', (await o.page.locator('[data-testid="coverage-farm-card"]').count()) === 0 && (await linkCount(o.page)) === links0 && sameCamera(cam0, await camera(o.page)) && (await o.page.locator('[data-testid="coverage-recall"]').first().getAttribute('data-inst')) === INST_A.id)
  check('A472 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))

  // -------------------------------------------------------------------------
  section('A473 — la fiche compacte')
  await tapMarker(o.page, 'farm', name)
  await o.page.waitForTimeout(900)
  const card = o.page.locator('[data-testid="coverage-farm-card"]')
  const box = (await card.boundingBox())!
  const mapBox = (await o.page.locator('[role="application"].maplibregl-map').first().boundingBox())!
  check('A473 étroite : 17 rem au plus', box.width <= 17 * 16 + 1, `${Math.round(box.width)} px`)
  check('A473 repliée, elle laisse voir la carte (≤ 12 % de sa surface)', (box.width * box.height) / (mapBox.width * mapBox.height) <= 0.12, `${Math.round(box.width)}×${Math.round(box.height)} sur ${Math.round(mapBox.width)}×${Math.round(mapBox.height)}`)
  check('A473 repliée : rien du reste', (await card.getAttribute('data-expanded')) === 'false' && (await o.page.locator('[data-testid="coverage-farm-card-more"]').count()) === 0)
  check('A473 nom, localité · agriculteur, pastille de statut', (await o.page.locator('[data-testid="coverage-farm-card-name"]').count()) === 1 && (await o.page.locator('[data-testid="coverage-farm-card-who"]').innerText()).includes('חקלאי'))
  const km = (await o.page.locator('[data-testid="coverage-farm-card-km"]').boundingBox())!
  const min = (await o.page.locator('[data-testid="coverage-farm-card-min"]').boundingBox())!
  check('A473 distance et minutes CÔTE À CÔTE (une ligne)', Math.abs(km.y - min.y) < 4 && Math.abs(km.x - min.x) > 10, `km y=${Math.round(km.y)} min y=${Math.round(min.y)}`)
  const targets = await card.locator('button, a').evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))
  check('A473 cibles ≥ 44 px, la flèche comprise', targets.every((v) => v >= 44), targets.map(Math.round).join(','))
  await o.page.locator('[data-testid="coverage-farm-card-toggle"]').click()
  await o.page.waitForTimeout(300)
  check('A473 la flèche DÉPLIE (téléphone, branche, surfaces, actions ; le calcul de la nuit)', (await card.getAttribute('data-expanded')) === 'true' && (await o.page.locator('[data-testid="coverage-farm-card-more"]').count()) === 1 && (await o.page.locator('[data-testid="coverage-farm-card-calc"]').count()) === 1 && (await o.page.locator('[data-testid="coverage-farm-card-open"]').count()) === 1)
  const moreTargets = await card.locator('button, a').evaluateAll((els) => els.map((e) => Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height)))
  check('A473 dépliée : cibles ≥ 44 px', moreTargets.every((v) => v >= 44), moreTargets.map(Math.round).join(','))
  if (process.env.CAPTURES !== '0') await o.page.screenshot({ path: `${SHOTS}/a473-fiche-depliee-1440.png` })
  await o.page.locator('[data-testid="coverage-farm-card-close"]').click()
  await tapMarker(o.page, 'farm', name)
  await o.page.waitForTimeout(500)
  check('A473 l’état DÉPLIÉ est retenu d’une ouverture à l’autre', (await card.getAttribute('data-expanded')) === 'true')
  await o.page.locator('[data-testid="coverage-farm-card-toggle"]').click()
  await o.page.locator('[data-testid="coverage-farm-card-close"]').click()
  await tapMarker(o.page, 'farm', name)
  await o.page.waitForTimeout(500)
  check('A473 … et l’état REPLIÉ aussi', (await card.getAttribute('data-expanded')) === 'false')
  await o.ctx.close()
})

// ===========================================================================
await guard('A474', async () => {
  section('A474 — ordinateur : pas de pop-up quand le panneau montre l’institution')
  const o = await openCoverage(1440)
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await o.page.waitForTimeout(1500)
  check('A474 le panneau de droite affiche l’institution', await laidOut(o.page, 'coverage-selected'))
  check('A474 … et la bulle de la carte n’est PAS ouverte', (await o.page.locator('[data-testid="coverage-institution-card"]').count()) === 0 && (await o.page.locator('[data-testid="coverage-recall"]').first().getAttribute('data-panel')) === 'shown')
  const marker = o.page.locator(`.maplibregl-marker[data-marker-kind="institution"][aria-label="${INST_A.name}"]`).first()
  check('A474 le marqueur est touché', await tapMarker(o.page, 'institution', INST_A.name))
  await o.page.waitForTimeout(800)
  check('A474 clic sur son marqueur : AUCUN pop-up', (await o.page.locator('[data-testid="coverage-institution-card"]').count()) === 0)
  check('A474 … le marqueur se met en évidence', (await marker.getAttribute('data-selected')) !== null)
  check('A474 … pas de bouton « פרטים » qui rouvrirait un doublon', (await o.page.locator('[data-testid="coverage-recall-open"]').count()) === 0)
  await o.ctx.close()

  /* La place réelle décide : la carte pleine (le panneau CACHÉ), la bulle revient. */
  const f = await openCoverage(1440, { 'lo-yanum:map-mode:coverage': 'full' })
  await go(f.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await f.page.waitForTimeout(1500)
  check('A474 carte pleine : le panneau est caché', !(await laidOut(f.page, 'coverage-selected')))
  check('A474 … et la bulle de l’institution s’ouvre', (await f.page.locator('[data-testid="coverage-institution-card"]').count()) === 1)
  await f.ctx.close()
})

// ===========================================================================
await guard('A475', async () => {
  section('A475 — téléphone : le pop-up réduit, et son bouton')
  const o = await open(402, { db: bgDb().db, height: 874, init: { 'lo-yanum:map-mode:coverage': 'full' } })
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await o.page.waitForTimeout(1200)
  const popup = o.page.locator('[data-testid="coverage-phone-popup"]')
  check('A475 le pop-up réduit est ouvert', (await popup.count()) === 1 && (await laidOut(o.page, 'coverage-phone-popup')))
  const sheet = await o.page.locator('[data-testid="coverage-sheet"]').innerText()
  const kindHe = 'מכינה'
  check('A475 … nom et type ; pas la bulle à quatre chiffres', sheet.includes(INST_A.name) && sheet.includes(kindHe) && (await o.page.locator('[data-testid="coverage-institution-card"]').count()) === 0 && !(await laidOut(o.page, 'coverage-fig-volunteers')), sheet.replace(/\s+/g, ' ').slice(0, 80))
  if (process.env.CAPTURES !== '0') await o.page.screenshot({ path: `${SHOTS}/a475-popup-telephone-402.png` })
  await o.page.locator('[data-testid="coverage-phone-open-fiche"]').click()
  await o.page.waitForTimeout(1000)
  check('A475 son bouton ouvre la fiche (le panneau la montre)', await laidOut(o.page, 'coverage-selected'))
  check('A475 … et le pop-up s’efface (la fiche est là)', (await o.page.locator('[data-testid="coverage-phone-popup"]').count()) === 0)
  if (process.env.CAPTURES !== '0') await o.page.screenshot({ path: `${SHOTS}/a475-fiche-telephone-402.png` })
  check('A475 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
await guard('A476', async () => {
  section('A476 — lier, la boîte des trois choix, délier')
  const { db, taken } = bgDb()
  const o = await openCoverage(1440, {}, db)
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await meshDone(o.page)
  const rows = () => db.rows('farm_institution_links').map((r) => `${r.farm_id}>${r.institution_id}`).sort()
  const before = rows()
  /* Une ferme LIBRE (aucun lien) de la liste : un toucher, un lien. */
  const free = await o.page.evaluate(() => [...document.querySelectorAll('[data-testid^="coverage-reach-row-"]')].find((e) => e.getAttribute('data-links') === '0')?.getAttribute('data-testid')?.replace('coverage-reach-row-', '') ?? null)
  check('A476 une ferme libre dans la liste', !!free)
  if (!free) return
  const chain = o.page.locator(`[data-testid="coverage-chain-${free}"]`)
  check('A476 chaînon OUVERT au repos', (await chain.getAttribute('data-linked')) === 'false')
  await chain.click()
  await o.page.waitForTimeout(1800)
  check('A476 lier : chaînon FERMÉ', (await chain.getAttribute('data-linked')) === 'true')
  check('A476 … exactement un lien de plus, en base', rows().length === before.length + 1 && rows().includes(`${free}>${INST_A.id}`), rows().length + '')

  /* La ferme PRISE par B. */
  const takenChain = o.page.locator(`[data-testid="coverage-chain-${taken.id}"]`)
  await o.page.locator('[data-testid="coverage-reach-outside"] summary').click().catch(() => undefined)
  const snapshot = rows()
  await takenChain.click()
  await o.page.waitForTimeout(500)
  const box = o.page.locator('[data-testid="link-conflict"]')
  check('A476 ferme liée ailleurs : la boîte s’ouvre', (await box.count()) >= 1 && (await o.page.locator('[data-testid="link-choice-replace"]').count()) === 1)
  check('A476 … et ne crée RIEN tant qu’on n’a pas choisi', JSON.stringify(rows()) === JSON.stringify(snapshot))
  const current = await o.page.locator('[data-testid="link-conflict-current"]').innerText()
  check('A476 … elle NOMME l’institution en place', current.includes(INST_B.name))
  const order = await o.page.locator('[data-testid="link-conflict-choices"] button').evaluateAll((els) => els.map((e) => e.getAttribute('data-choice')))
  check('A476 … trois boutons, dans l’ordre remplacer · ajouter · annuler', order.join() === 'replace,add,cancel', order.join())
  const primary = await o.page.locator('[data-testid="link-choice-replace"]').evaluate((e) => e.className.includes('btn-primary'))
  check('A476 … « להחליף » mis en avant', primary)
  if (process.env.CAPTURES !== '0') await o.page.screenshot({ path: `${SHOTS}/a476-boite-trois-choix-1440.png` })
  await o.page.locator('[data-testid="link-choice-cancel"]').click()
  await o.page.waitForTimeout(1500)
  check('A476 « ביטול » : base inchangée', JSON.stringify(rows()) === JSON.stringify(snapshot))

  await takenChain.click()
  await o.page.locator('[data-testid="link-choice-replace"]').click()
  await o.page.waitForTimeout(1800)
  const mine = db.rows('farm_institution_links').filter((r) => r.farm_id === taken.id)
  check('A476 « להחליף » : un lien, et c’est le nouveau', mine.length === 1 && mine[0].institution_id === INST_A.id, mine.map((r) => r.institution_id).join())

  /* Le remettre chez B, puis « להוסיף ». */
  await takenChain.click()
  await o.page.locator('[data-testid="link-unlink-confirm"]').click()
  await o.page.waitForTimeout(1500)
  db.rows('farm_institution_links').push({ id: 'fil-bg-9', farm_id: taken.id, institution_id: INST_B.id, created_at: new Date().toISOString(), created_by: null })
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await meshDone(o.page)
  await o.page.locator('[data-testid="coverage-reach-outside"] summary').click().catch(() => undefined)
  await o.page.locator(`[data-testid="coverage-chain-${taken.id}"]`).click()
  await o.page.locator('[data-testid="link-choice-add"]').click()
  await o.page.waitForTimeout(1800)
  const both = db.rows('farm_institution_links').filter((r) => r.farm_id === taken.id).map((r) => String(r.institution_id)).sort()
  check('A476 « להוסיף » : exactement deux liens', both.length === 2 && both.includes(INST_A.id) && both.includes(INST_B.id), both.join())

  /* Délier : une confirmation, et CE lien seul. */
  const all0 = rows()
  await o.page.locator(`[data-testid="coverage-chain-${taken.id}"]`).click()
  check('A476 délier demande confirmation', (await o.page.locator('[data-testid="link-unlink-confirm"]').count()) === 1 && JSON.stringify(rows()) === JSON.stringify(all0))
  await o.page.locator('[data-testid="link-unlink-confirm"]').click()
  await o.page.waitForTimeout(1800)
  const all1 = rows()
  check('A476 délier retire CE lien, et lui seul', all1.length === all0.length - 1 && !all1.includes(`${taken.id}>${INST_A.id}`) && all1.includes(`${taken.id}>${INST_B.id}`))
  check('A476 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
await guard('A477', async () => {
  section('A477 — le bandeau des réglages se replie')
  const o = await openCoverage(1440, { 'lo-yanum:coverage-map': JSON.stringify({ unit: 'min', minutes: 35, radiusKm: 35, nightPct: 15 }) })
  await go(o.page, APP, '/coordinator/coverage', 3500)
  check('A477 sans institution : le bandeau est ouvert', (await o.page.locator('[data-testid="coverage-band"]').count()) === 1)
  const tall = (await o.page.locator('[data-testid="coverage-band"]').boundingBox())!.height
  /* Une institution que la carte montre ET qu'un doigt peut toucher. */
  const at = await o.page.evaluate(() => {
    const map = (document.querySelector('[role="application"].maplibregl-map') as HTMLElement).getBoundingClientRect()
    for (const el of document.querySelectorAll<HTMLElement>('.maplibregl-marker[data-marker-kind="institution"]')) {
      const r = el.getBoundingClientRect()
      const x = r.left + r.width / 2
      const y = r.top + r.height / 2
      if (x < map.left + 70 || x > map.right - 30 || y < map.top + 30 || y > map.bottom - 90) continue
      const hit = document.elementFromPoint(x, y)
      if (hit && (hit === el || el.contains(hit))) return { x, y }
    }
    return null
  })
  check('A477 une institution à toucher sur la carte', !!at)
  if (!at) return
  await o.page.mouse.click(at.x, at.y)
  await o.page.waitForTimeout(800)
  const folded = o.page.locator('[data-testid="coverage-band-folded"]')
  check('A477 une institution ouverte : replié en UNE ligne', (await folded.count()) === 1 && (await folded.boundingBox())!.height < 60 && (await o.page.locator('[data-testid="coverage-band"]').count()) === 0, `${Math.round(tall)} px → ${Math.round((await folded.boundingBox())!.height)} px`)
  const summary = await o.page.locator('[data-testid="coverage-band-summary"]').innerText()
  check('A477 … qui rappelle le réglage (« עד 35 דקות · לפי זמן »)', summary.includes('35') && summary.includes('דקות') && summary.includes('לפי זמן'), summary)
  const selTop = (await o.page.locator('[data-testid="coverage-selected"]').boundingBox())!.y
  /* Juste dessous : la ligne repliée, sa barre de progression pendant que les routes se mesurent, puis la fiche. */
  const meshBox = await o.page.locator('[data-testid="coverage-mesh"]').boundingBox()
  const foldBottom = Math.max((await folded.boundingBox())!.y + (await folded.boundingBox())!.height, meshBox && meshBox.height > 0 ? meshBox.y + meshBox.height : 0)
  check('A477 le gain de hauteur va à la fiche, juste dessous', selTop - foldBottom <= 24, `${Math.round(selTop - foldBottom)} px`)
  await folded.click()
  await o.page.waitForTimeout(300)
  check('A477 un clic le rouvre', (await o.page.locator('[data-testid="coverage-band"]').count()) === 1)
  await o.page.locator('[data-testid="coverage-band-apply"]').click()
  await o.page.waitForTimeout(300)
  check('A477 « סיום » : il se referme', (await folded.count()) === 1)
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 3500)
  check('A477 replié : retenu au rechargement', (await o.page.locator('[data-testid="coverage-band-folded"]').count()) === 1)
  await o.page.locator('[data-testid="coverage-band-folded"]').click()
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 3500)
  check('A477 déplié : retenu aussi', (await o.page.locator('[data-testid="coverage-band"]').count()) === 1)
  await o.ctx.close()
})

// ===========================================================================
await guard('A478', async () => {
  section('A478 — le document de l’institution')
  const { db, multi } = bgDb()
  const o = await openCoverage(1440, { 'lo-yanum:institution-doc': JSON.stringify({ site: 'artzenu.org.il', email: 'office@artzenu.org.il', phone: '08-000-0000' }) }, db)
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await meshDone(o.page)
  check('A478 avant toute génération : aucune icône d’envoi (pas de bouton mort)', (await o.page.locator('[data-testid^="coverage-doc-wa-"], [data-testid^="coverage-doc-mail-"]').count()) === 0)
  await o.page.locator('[data-testid="coverage-doc-generate"]').click()
  await o.page.waitForFunction(() => document.querySelector('[data-testid="coverage-doc-done"], [data-testid="coverage-doc-error"]'), undefined, { timeout: 60_000 })
  check('A478 le document est produit et publié', (await o.page.locator('[data-testid="coverage-doc-done"]').count()) === 1, await o.page.locator('[data-testid="coverage-doc-error"]').innerText().catch(() => ''))
  const doc = await o.page.evaluate(() => {
    const d = window.__bgLastDoc as { layout: Record<string, unknown>; bytes: Uint8Array; url: string }
    return { layout: d.layout, bytes: Array.from(d.bytes), url: d.url }
  })
  const L = doc.layout as { pages: number; band: { top: number; height: number; logoHeight: number }; headerLogoHeight: number; headerPages: number[]; footerPages: number[]; pageLabels: string[]; contentTop: number[]; contentBottom: number[]; drawn: string[] }
  check('A478 plusieurs pages (le document déborde)', L.pages >= 2, `${L.pages}`)
  check('A478 page 1 : PAS d’en-tête', !L.headerPages.includes(1))
  check('A478 en-tête et pied sur CHAQUE page dès la page 2', L.headerPages.join() === Array.from({ length: L.pages - 1 }, (_, i) => i + 2).join() && L.footerPages.join() === L.headerPages.join())
  check('A478 « page / total » sur TOUTES les pages', L.pageLabels.length === L.pages && L.pageLabels.every((l, i) => l === `${i + 1} / ${L.pages}`) && L.pageLabels.every((l) => L.drawn.includes(l)), L.pageLabels.join(' | '))
  check('A478 bandeau dès le bord supérieur, logo du bandeau plus grand que celui de l’en-tête', L.band.top === 0 && L.band.height >= 180 && L.band.logoHeight > L.headerLogoHeight)
  const PH = 841.89
  check('A478 marges garanties (rien sous le pied, rien sur l’en-tête)', L.contentBottom.every((b) => b <= PH - 72 + 0.01) && L.contentTop.every((t, i) => (i === 0 ? t >= L.band.height : t >= 70)), `haut ${L.contentTop.map(Math.round).join(',')} · bas ${L.contentBottom.map(Math.round).join(',')}`)
  const dateRe = /(^|[^\d])(\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2})(?!\d)/
  const dated = L.drawn.filter((s) => dateRe.test(s))
  check('A478 AUCUNE date dans le texte posé', dated.length === 0, dated.slice(0, 2).join(' | '))
  check('A478 le pied : site, mail, téléphone', L.drawn.some((s) => s.includes('artzenu.org.il') && s.includes('office@artzenu.org.il') && s.includes('08-000-0000')))
  /* Le FICHIER lui-même. */
  const bytes = Uint8Array.from(doc.bytes)
  const text = Buffer.from(bytes).toString('latin1')
  check('A478 aucune date dans le fichier (ni CreationDate, ni ModDate)', !/\/CreationDate|\/ModDate/.test(text))
  check('A478 aucune transparence : ni masque, ni groupe, ni opacité', !/\/SMask|\/Mask|\/Group|\/CA |\/ca |\/S \/Transparency/.test(text))
  const images = [...text.matchAll(/\/Subtype \/Image [^>]*\/Filter \/(\w+)[^>]*\/Length (\d+) >>\nstream\n/g)]
  const jpegs = images.map((m) => {
    const start = (m.index ?? 0) + m[0].length
    return bytes.slice(start, start + Number(m[2]))
  })
  check('A478 une image par page, toutes JPEG (DCTDecode)', images.length === L.pages && images.every((m) => m[1] === 'DCTDecode'))
  const components = jpegs.map((j) => {
    for (let i = 2; i < j.length - 9; i++) if (j[i] === 0xff && (j[i + 1] === 0xc0 || j[i + 1] === 0xc2)) return j[i + 9]
    return -1
  })
  check('A478 chaque page est OPAQUE (3 composantes, aucune alpha)', components.every((c) => c === 3), components.join(','))
  /* Les pixels : le bandeau touche le bord supérieur ; la page 2 a sa marge blanche puis l'en-tête. */
  const px = await o.page.evaluate(async (pages: number[][]) => {
    const read = async (arr: number[]) => {
      const bmp = await createImageBitmap(new Blob([new Uint8Array(arr)], { type: 'image/jpeg' }))
      const c = document.createElement('canvas')
      c.width = bmp.width
      c.height = bmp.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(bmp, 0, 0)
      const row = (y: number) => {
        const d = ctx.getImageData(0, y, c.width, 1).data
        let lum = 0
        for (let i = 0; i < d.length; i += 4) lum += (d[i] + d[i + 1] + d[i + 2]) / 3
        return lum / (d.length / 4)
      }
      const inkIn = (y0: number, y1: number) => {
        let dark = 0
        for (let y = y0; y < y1; y++) {
          const d = ctx.getImageData(0, y, c.width, 1).data
          for (let i = 0; i < d.length; i += 4) if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 200) dark++
        }
        return dark
      }
      return { w: c.width, h: c.height, top: row(0), top2: row(2), headInk: inkIn(40, 130), bottomInk: inkIn(c.height - 80, c.height - 40), edgeInk: inkIn(c.height - 12, c.height) }
    }
    return [await read(pages[0]), await read(pages[1])]
  }, jpegs.slice(0, 2).map((j) => Array.from(j)))
  check('A478 page 1 : le bandeau TOUCHE le bord supérieur (première ligne de pixels sombre)', px[0].top < 120, `luminance ${Math.round(px[0].top)}`)
  check('A478 page 2 : marge blanche en haut, puis l’en-tête dessiné', px[1].top2 > 245 && px[1].headInk > 200, `haut ${Math.round(px[1].top2)} · encre d’en-tête ${px[1].headInk}`)
  check('A478 pagination dessinée en bas des deux pages, rien collé au bord', px[0].bottomInk > 20 && px[1].bottomInk > 20 && px[0].edgeInk === 0 && px[1].edgeInk === 0, `${px[0].bottomInk}/${px[1].bottomInk} · bord ${px[0].edgeInk}/${px[1].edgeInk}`)

  /* L'hébergement : l'adresse stable, écrasée ; les versions à côté. */
  const stable = `institution-docs/${INST_A.id}/document.pdf`
  check('A478 publié à l’adresse STABLE de l’institution', doc.url.endsWith(`/storage/v1/object/public/${stable}`) && db.objects.has(stable))
  const v1 = [...db.objects.keys()].filter((k) => k.startsWith(`institution-docs/${INST_A.id}/versions/`))
  check('A478 … sa version horodatée à côté', v1.length === 1 && /\/versions\/\d{8}-\d{6}\.pdf$/.test(v1[0]))
  const size1 = db.objects.get(stable)!.bytes.length
  /* Envoyer : WhatsApp porte LE LIEN ; le mail n'existe que pour le contact qui en a un. */
  const wa = await o.page.locator('[data-testid="coverage-doc-wa-ic-bg-1"]').getAttribute('href')
  check('A478 WhatsApp : un message pré-rédigé avec LE LIEN du document', !!wa && wa.startsWith('https://wa.me/972') && decodeURIComponent(wa).includes(doc.url))
  check('A478 mail : seulement pour le contact qui a un mail', (await o.page.locator('[data-testid="coverage-doc-mail-ic-bg-1"]').count()) === 1 && (await o.page.locator('[data-testid="coverage-doc-mail-ic-bg-2"]').count()) === 0 && (await o.page.locator('[data-testid="coverage-doc-wa-ic-bg-2"]').count()) === 1)
  const mail = await o.page.locator('[data-testid="coverage-doc-mail-ic-bg-1"]').getAttribute('href')
  check('A478 … le mail prépare l’envoi au contact, le lien dedans', !!mail && mail.startsWith('mailto:head@example.invalid') && decodeURIComponent(mail).includes(doc.url))
  if (process.env.CAPTURES !== '0') await o.page.locator('[data-testid="coverage-doc"]').screenshot({ path: `${SHOTS}/a478-bloc-document-1440.png` })

  /* Le PO lie une ferme, puis régénère : le MÊME lien montre la nouvelle version. */
  await o.page.waitForTimeout(1200)
  const chain = o.page.locator(`[data-testid="coverage-chain-${multi.id}"]`)
  void chain
  const free = await o.page.evaluate(() => [...document.querySelectorAll('[data-testid="coverage-reach-inside"] [data-testid^="coverage-reach-row-"]')].find((e) => e.getAttribute('data-links') === '0')?.getAttribute('data-testid')?.replace('coverage-reach-row-', '') ?? null)
  if (free) await o.page.locator(`[data-testid="coverage-chain-${free}"]`).click()
  await o.page.waitForTimeout(1200)
  await o.page.locator('[data-testid="coverage-doc-generate"]').click()
  await o.page.waitForFunction(() => (document.querySelector('[data-testid="coverage-doc"]')?.getAttribute('data-versions') ?? '') === '2', undefined, { timeout: 60_000 })
  const size2 = db.objects.get(stable)!.bytes.length
  const served = await o.page.evaluate(async (u) => (await (await fetch(u)).arrayBuffer()).byteLength, doc.url)
  check('A478 régénéré : l’adresse stable est ÉCRASÉE et sert la dernière version', size2 !== size1 && served === size2, `${size1} → ${size2} (servi ${served})`)
  check('A478 … les deux versions sont gardées et listées', [...db.objects.keys()].filter((k) => k.includes('/versions/')).length === 2 && (await o.page.locator('[data-testid="coverage-doc-version"]').count()) === 2)
  if (process.env.CAPTURES !== '0') {
    for (let i = 0; i < Math.min(jpegs.length, 3); i++) await Bun.write(`${SHOTS}/a478-document-page-${i + 1}.jpg`, jpegs[i])
  }
  check('A478 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ===========================================================================
await guard('A479', async () => {
  section('A479 — l’ordre des fermes suit le critère')
  const o = await openCoverage(1440, { 'lo-yanum:coverage-map': JSON.stringify({ unit: 'min', minutes: 35, radiusKm: 35, nightPct: 0 }) })
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await meshDone(o.page)
  const read = () =>
    o.page.evaluate(() => {
      const list = document.querySelector('[data-testid="coverage-reach-list"]')!
      const inside = [...document.querySelectorAll('[data-testid="coverage-reach-inside"] button[data-road]')].map((e) => ({ km: Number(e.getAttribute('data-road')), min: Number(e.getAttribute('data-min')), state: e.getAttribute('data-state') }))
      const outsideCount = document.querySelectorAll('[data-testid="coverage-reach-outside"] button[data-road]').length
      const outside = document.querySelector('[data-testid="coverage-reach-outside"]') as HTMLDetailsElement | null
      return { unit: list.getAttribute('data-unit'), inside, outsideCount, outsideOpen: outside?.open ?? null, outsideTitle: outside?.querySelector('summary')?.textContent ?? '', insideTitle: document.querySelector('[data-testid="coverage-reach-inside-title"]')?.textContent ?? '', dIn: Number(list.getAttribute('data-inside')), dOut: Number(list.getAttribute('data-outside')) }
    })
  const asc = (xs: number[]) => xs.every((v, i) => i === 0 || v >= xs[i - 1])
  const m = await read()
  check('A479 critère « זמן » : minutes croissantes, rien hors seuil dedans', m.unit === 'min' && m.inside.length > 1 && asc(m.inside.map((r) => r.min)) && m.inside.every((r) => r.state === 'in' || r.state === 'blocked') && m.inside.every((r) => r.min <= 35), m.inside.map((r) => r.min).join(','))
  check('A479 la section hors seuil est REPLIÉE, son titre compte', m.outsideOpen === false && m.outsideTitle.includes(`(${m.dOut})`) && m.insideTitle.includes(`(${m.dIn})`), `${m.insideTitle} | ${m.outsideTitle}`)
  check('A479 dedans + dehors = toutes les lignes', m.inside.length === m.dIn && m.outsideCount === m.dOut)
  await o.page.locator('[data-testid="coverage-band-folded"]').click()
  await o.page.locator('[data-testid="coverage-unit-km"]').click()
  await o.page.waitForTimeout(800)
  await meshDone(o.page)
  const k = await read()
  check('A479 critère « מרחק » : kilomètres croissants', k.unit === 'km' && k.inside.length > 1 && asc(k.inside.map((r) => r.km)) && k.inside.every((r) => r.km <= 35), k.inside.map((r) => r.km.toFixed(1)).join(','))
  const minOrder = m.inside.map((r) => r.km.toFixed(2)).join()
  const kmOrder = k.inside.filter((r) => m.inside.some((x) => x.km === r.km)).map((r) => r.km.toFixed(2)).join()
  check('A479 sur ce banc, les deux ordres DIFFÈRENT (le tri suit vraiment le critère)', minOrder !== kmOrder)
  if (process.env.CAPTURES !== '0') await o.page.locator('[data-testid="coverage-reach-list"]').screenshot({ path: `${SHOTS}/a479-liste-par-km-1440.png` })
  await o.ctx.close()
})

// ===========================================================================
await guard('A480', async () => {
  section('A480 — le lien du bas devient un accès en haut')
  const o = await openCoverage(1440)
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 4000)
  check('A480 plus de lien vers TOUTES les institutions', (await o.page.locator('[data-testid="coverage-to-institutions"], [data-testid="coverage-institutions-shortcut"]').count()) === 0)
  const icon = o.page.locator('[data-testid="coverage-open-institution"]')
  const iconBox = (await icon.boundingBox())!
  const selBox = (await o.page.locator('[data-testid="coverage-selected"]').boundingBox())!
  check('A480 l’icône est EN HAUT de la fiche, 44 px', iconBox.y - selBox.y < 40 && iconBox.width >= 44 && iconBox.height >= 44)
  await icon.click()
  await o.page.waitForTimeout(1500)
  check('A480 … et ouvre la fiche complète de CETTE institution', o.page.url().includes(`/coordinator/institutions/${INST_A.id}`), o.page.url().split('#')[1])
  await o.ctx.close()
})

// ===========================================================================
await guard('A481', async () => {
  section('A481 — une ferme liée à deux institutions se repère')
  const { db, multi } = bgDb()
  const o = await openCoverage(1440, {}, db)
  await go(o.page, APP, `/coordinator/coverage?inst=${INST_A.id}`, 5000)
  await meshDone(o.page)
  const row = o.page.locator(`[data-testid="coverage-reach-row-${multi.id}"]`)
  check('A481 dans la liste : signalée', (await row.getAttribute('data-links')) === '2' && (await row.locator('[data-testid="coverage-reach-multi"]').count()) === 1)
  check('A481 … chaînon fermé (liée à CETTE institution aussi)', (await o.page.locator(`[data-testid="coverage-chain-${multi.id}"]`).getAttribute('data-linked')) === 'true')
  await go(o.page, APP, `/coordinator/farms/${multi.id}`, 4000)
  const line = o.page.locator('[data-testid="farm-sponsor"]')
  check('A481 dans sa propre fiche : signalée, les deux nommées', (await line.getAttribute('data-count')) === '2' && (await line.innerText()).includes(INST_A.name) && (await line.innerText()).includes(INST_B.name))
  if (process.env.CAPTURES !== '0') await line.screenshot({ path: `${SHOTS}/a481-fiche-ferme-deux-institutions-1440.png` })
  await o.ctx.close()
})

await finish()
