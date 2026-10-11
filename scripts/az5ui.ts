import { FakeDb } from './fake-supabase'
import { REMOTE, check, finish, go, guard, open, section, seed, serveBuild } from './ayharness'
import { MAPPINGS } from '../src/data/rows'
import type { Institution } from '../src/core/institutions'
import { mkdirSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AZ5 — LES CONTACTS D'UNE INSTITUTION, AU RENDU.   A385 · A386 · A387
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run az5ui                                                  # build local
 *   BASE_URL=https://azmer-fts.github.io/lo-yanum bun run az5ui    # le DÉPLOYÉ
 *
 * Build réel (ou bundle déployé) + base FACTICE : trois institutions aux noms
 * et numéros INVENTÉS, de la même forme que la production après AZ5 (le dépôt
 * est public : aucun vrai numéro ici). Rien n'est écrit sur `lo-yanum-prod`.
 *
 *   A385  la liste : « le contact » = le rang 1 ; sans lui « חסר ראש ישיבה »,
 *         jamais le ר״מ ; la mention « קטינים · 15–18 » ; le filtre « חסר ראש »
 *   A386  la fiche : les contacts rangés par rôle ; en ajouter un, il est
 *         gardé en base, le rang 1 affiché ne change pas
 *   A387  l'aperçu : les contacts rangés ; « להתקשר » appelle le rang 1
 */

const OUT = process.env.DIST ?? 'dist-az5ui'
const APP = REMOTE ?? (await serveBuild(OUT, Number(process.env.PORT ?? 5437), process.env.SKIP_BUILD !== '1'))
const SHOTS = `docs/screenshots/az5/${REMOTE ? 'deployed' : 'local'}`
mkdirSync(SHOTS, { recursive: true })

const at = '2026-10-08T12:21:25.000Z'
const inst = (over: Partial<Institution>): Institution => ({
  id: 'inst-az5-x', name: '', locality: 'נתיבות', kind: 'hesder', audience: 'boys', network: '', position: { lat: 31.42, lng: 34.59 }, positionUncertain: false,
  engagement: 'signed', contactName: '', contactPhone: '', notes: '', extra: '', source: 'manual', engagementConfirmed: false, metOn: null, students: null,
  positionSource: '', aliases: '', createdAt: at, updatedAt: at, contacts: [], ...over,
})
const FULL = inst({
  id: 'inst-az5-full', name: 'ישיבת הדגמה מלאה', contactName: 'הרב ראשי', contactPhone: '050-0000601',
  contacts: [
    { id: 'ic-az5-a', role: 'contact', name: 'איש קשר הדגמה', phone: '050-0000604', note: '' },
    { id: 'ic-az5-b', role: 'coordinator', name: 'רכז הדגמה', phone: '050-0000603', note: 'תלמיד' },
    { id: 'ic-az5-c', role: 'head', name: 'הרב ראשי', phone: '050-0000601', note: '' },
    { id: 'ic-az5-d', role: 'ram', name: 'הרב רם', phone: '050-0000602', note: '' },
  ],
})
const RAM_ONLY = inst({ id: 'inst-az5-ram', name: 'ישיבת הדגמה בלי ראש', position: { lat: 31.3, lng: 34.62 }, contacts: [{ id: 'ic-az5-e', role: 'ram', name: 'הרב רם בלבד', phone: '050-0000605', note: '' }] })
const SCHOOL = inst({
  id: 'inst-az5-school', name: 'תיכון הדגמה', kind: 'school', audience: 'unknown', position: { lat: 31.43, lng: 34.88 }, minorsAge: { min: 15, max: 18 },
  contactName: 'מנהל הדגמה', contactPhone: '050-0000606', contacts: [{ id: 'ic-az5-f', role: 'head', name: 'מנהל הדגמה', phone: '050-0000606', note: 'מנהל בית הספר' }],
})
const db = () => {
  const d = new FakeDb()
  seed(d)
  for (const i of [FULL, RAM_ONLY, SCHOOL]) d.rows('institutions').push({ ...MAPPINGS.institutions.toRows(i)[0].rows[0] })
  return d
}
const rowOf = (d: FakeDb, id: string) => d.rows('institutions').find((r) => r.id === id) as Record<string, unknown> | undefined

// ---------------------------------------------------------------------------
await guard('A385', async () => {
  section('A385 — la liste : le rang 1, « חסר ראש ישיבה », « קטינים »')
  const o = await open(1440, { db: db() })
  await go(o.page, APP, '/coordinator/institutions')
  await o.page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 20_000 }).catch(() => undefined)
  await o.page.waitForTimeout(800)
  const row = (id: string) => o.page.locator(`[data-testid="institution-row-${id}"]`).first()
  const full = await row(FULL.id).innerText()
  check('A385 la ligne montre le rang 1', full.includes('הרב ראשי'), full.replace(/\s+/g, ' ').slice(0, 120))
  check('A385 … et aucun autre rôle à sa place', !full.includes('הרב רם') && !full.includes('רכז הדגמה'))
  const ram = await row(RAM_ONLY.id).innerText()
  check('A385 sans rang 1 : « חסר ראש ישיבה »', ram.includes('חסר ראש ישיבה'), ram.replace(/\s+/g, ' ').slice(0, 120))
  check('A385 … et JAMAIS le ר״מ comme contact', !ram.includes('הרב רם בלבד'))
  const school = await row(SCHOOL.id).innerText()
  check('A385 l’école : « קטינים · 15–18 » dans la liste', school.includes('קטינים') && school.includes('15–18'), school.replace(/\s+/g, ' ').slice(0, 140))
  check('A385 l’école : son chef est « le contact »', school.includes('מנהל הדגמה'))
  const pill = o.page.locator('[data-testid="institutions-filter-headMissing"]')
  check('A385 le filtre « חסר ראש » existe', (await pill.count()) === 1)
  await pill.click()
  await o.page.waitForTimeout(500)
  const shown = await o.page.locator('[data-testid^="institution-row-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))
  check('A385 il retrouve la fiche sans rang 1, et pas les autres', shown.includes(`institution-row-${RAM_ONLY.id}`) && !shown.includes(`institution-row-${FULL.id}`) && !shown.includes(`institution-row-${SCHOOL.id}`), shown.join(', '))
  await o.page.screenshot({ path: `${SHOTS}/a385-liste-chef-manquant.png` })
  check('A385 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A386', async () => {
  section('A386 — la fiche : rangés par rôle, en ajouter un')
  const d = db()
  const o = await open(1440, { db: d })
  await go(o.page, APP, `/coordinator/institutions/${FULL.id}`)
  const roles = await o.page.locator('[data-testid="institution-contacts"] li[data-role]').evaluateAll((els) => els.map((e) => e.getAttribute('data-role')))
  check('A386 rangés : ראש → ר״מ → רכז → איש קשר', roles.join(',') === 'head,ram,coordinator,contact', roles.join(','))
  const firstLabel = await o.page.locator('[data-testid="institution-contacts"] li[data-role] select').first().evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.text ?? '')
  check('A386 le rang 1 d’une yeshiva s’appelle « ראש ישיבה »', firstLabel === 'ראש ישיבה', firstLabel)
  await o.page.locator('[data-testid="institution-contact-add"]').click()
  /* La ligne se RANGE dès qu'elle est gardée : on la suit par son identifiant. */
  const draftId = await o.page.locator('[data-testid="institution-contacts"] li[data-role]').last().getAttribute('data-testid')
  const draft = o.page.locator(`[data-testid="${draftId}"]`)
  await draft.locator('[data-testid="institution-contact-role"]').selectOption('ram')
  await draft.locator('[data-testid="institution-contact-name"]').fill('הרב חדש')
  await draft.locator('[data-testid="institution-contact-phone"]').fill('050-0000609')
  await draft.locator('[data-testid="institution-contact-phone"]').blur()
  await o.page.waitForTimeout(400)
  await draft.locator('[data-testid="institution-contact-note"]').fill('נוסף בבדיקה')
  await draft.locator('[data-testid="institution-contact-note"]').blur()
  await o.page.waitForTimeout(2500)
  const after = await o.page.locator('[data-testid="institution-contacts"] li[data-role]').evaluateAll((els) => els.map((e) => e.getAttribute('data-role')))
  check('A386 le nouveau ר״מ prend sa place (après les ר״מ, avant le רכז)', after.join(',') === 'head,ram,ram,coordinator,contact', after.join(','))
  const r = rowOf(d, FULL.id)
  const saved = (r?.contacts ?? []) as Array<Record<string, string>>
  check('A386 gardé en base (5 contacts, le nouveau avec sa note)', saved.length === 5 && saved.some((c) => c.name === 'הרב חדש' && c.phone === '050-0000609' && c.role === 'ram' && c.note === 'נוסף בבדיקה'), JSON.stringify(saved.map((c) => c.name)))
  check('A386 le rang 1 affiché n’a pas changé', r?.contact_name === 'הרב ראשי' && r?.contact_phone === '050-0000601', `${r?.contact_name} ${r?.contact_phone}`)
  await o.page.screenshot({ path: `${SHOTS}/a386-fiche-contacts.png`, fullPage: true })
  await go(o.page, APP, `/coordinator/institutions/${SCHOOL.id}`)
  const schoolLabel = await o.page.locator('[data-testid="institution-contacts"] li[data-role="head"] select').evaluate((s) => (s as HTMLSelectElement).selectedOptions[0]?.text ?? '')
  check('A386 le rang 1 d’une école s’appelle « מנהל »', schoolLabel === 'מנהל', schoolLabel)
  check('A386 la fiche de l’école porte « קטינים · 15–18 »', (await o.page.locator(`[data-testid="institution-minors-${SCHOOL.id}"]`).first().innerText()).includes('15–18'))
  const warn = await o.page.locator(`[data-testid="institution-minors-${SCHOOL.id}"]`).first().evaluate((e) => e.className)
  check('A386 … sur un ton neutre (une information, pas une alerte)', !/warn|danger|error/.test(warn), warn)
  check('A386 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

// ---------------------------------------------------------------------------
await guard('A387', async () => {
  section('A387 — l’aperçu : rangés, « להתקשר » appelle le rang 1')
  const o = await open(1440, { db: db() })
  await go(o.page, APP, '/coordinator/institutions')
  await o.page.locator('[data-testid="map-mode-hidden"]').first().click({ timeout: 20_000 }).catch(() => undefined)
  await o.page.waitForTimeout(600)
  await o.page.locator(`[data-testid="institution-view-${FULL.id}"]`).first().click()
  await o.page.waitForTimeout(800)
  const prev = o.page.locator('[data-testid="institution-preview"]').first()
  const roles = await prev.locator('[data-testid="institution-contacts-list"] li[data-role]').evaluateAll((els) => els.map((e) => e.getAttribute('data-role')))
  check('A387 l’aperçu range les contacts par rôle', roles.join(',') === 'head,ram,coordinator,contact', roles.join(','))
  const call = await prev.locator('a.btn-primary[href^="tel:"]').first().getAttribute('href')
  check('A387 « להתקשר » appelle le rang 1', call === 'tel:0500000601', String(call))
  await o.page.screenshot({ path: `${SHOTS}/a387-apercu.png` })
  check('A387 aucune erreur de page', o.errors.length === 0, o.errors.slice(0, 2).join(' | '))
  await o.ctx.close()
})

await finish()
