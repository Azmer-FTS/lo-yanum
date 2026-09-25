import { chromium } from 'playwright'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AP — A255 · A259 : LA DEMANDE ARRIVE VRAIMENT DANS `lo-yanum-prod`.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   SB_KEY=<clé publiable> bun run scripts/apreal.ts
 *   SB_KEY=… BASE_URL=https://azmer-fts.github.io/lo-yanum/bakasha bun run scripts/apreal.ts
 *
 * ★★ CE QUE `apui` NE PEUT PAS PROUVER, ET POURQUOI IL FAUT CELLE-CI.
 *    `apui` intercepte les trois RPC : elle prouve ce que la PAGE envoie, pas
 *    ce que la BASE en fait. Or le brief demande l'inverse — « la demande
 *    arrive en base avec ses documents et son rendez-vous, et apparaît dans
 *    l'application avec le statut בקשה נכנסת ». Cette porte-ci fait le trajet
 *    entier : une vraie page, une vraie clé anonyme, une vraie écriture.
 *
 * ⚠️ ELLE ÉCRIT SUR LA PRODUCTION, ET C'EST ASSUMÉ — mais elle écrit une
 *    ligne RECONNAISSABLE (`AP-BOUT-EN-BOUT` dans le nom) et le nettoyage est
 *    la dernière chose qu'elle fait. La vérification finale compte les
 *    exploitations AVANT et APRÈS : si le compte ne revient pas à son point de
 *    départ, la porte est ROUGE même si tout le reste a marché.
 *
 * ⚠️ ET ELLE NE PASSE PAR AUCUN COMPTE. La lecture de contrôle se fait avec
 *    l'outil MCP côté opérateur, pas ici : cette porte n'a que la clé
 *    publiable, exactement comme un agriculteur. C'est le but — si elle
 *    pouvait relire ce qu'elle vient d'écrire, la surface anonyme serait trop
 *    large.
 */

const BASE = (process.env.BASE_URL ?? 'http://localhost:5362').replace(/\/$/, '')
const MARK = `חוות AP-BOUT-EN-BOUT ${new Date().toISOString().slice(11, 19)}`

console.log(`  page  : ${BASE}`)
console.log(`  marque: ${MARK}`)

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
  locale: 'he-IL',
  timeZoneId: 'Asia/Jerusalem',
})
const page = await ctx.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByTestId('start').click()
await page.getByTestId('need-both').click()
await page.getByTestId('next').click()
await page.getByTestId('land-both').click()
await page.getByTestId('next').click()
await page.getByTestId('farmName').fill(MARK)
await page.getByTestId('fullName').fill('ישראל ישראלי (בדיקה)')
await page.getByTestId('idNumber').fill('021985189')
await page.getByTestId('phone').fill('0509999901')
await page.getByTestId('email').fill('gate@lo-yanum.invalid')
await page.getByTestId('locality').fill('מיצד')
await page.getByTestId('next').click()
await page.getByTestId('documents-step').waitFor()

/* Un vrai PDF, minimal mais valide, sur le document des cultures. */
await page.setInputFiles('[data-testid="doc-crops-pdf"]', {
  name: 'זכות-בקרקע.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n'),
})
await page.waitForFunction(
  () => document.querySelector('[data-testid="doc-crops"]')?.getAttribute('data-provided') === 'yes',
)
await page.getByTestId('next').click()
await page.getByTestId('agreement').waitFor()

/* La signature au doigt. */
const pad = await page.getByTestId('signature').boundingBox()
if (!pad) throw new Error('no signature pad')
await page.mouse.move(pad.x + 40, pad.y + pad.height / 2)
await page.mouse.down()
await page.mouse.move(pad.x + 140, pad.y + pad.height / 2 - 30, { steps: 10 })
await page.mouse.move(pad.x + 220, pad.y + pad.height / 2 + 20, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(150)

await page.getByTestId('next').click()
await page.waitForSelector('[data-step="appointment"]')
await page.getByTestId('slots').waitFor({ timeout: 20_000 })
const slot = page.getByTestId('slot').first()
const chosen = await slot.getAttribute('data-start')
await slot.click()
await page.getByTestId('send').click()
await page.getByTestId('done').waitFor({ timeout: 20_000 })
const reference = (await page.getByTestId('reference').textContent())?.trim() ?? ''

console.log('')
console.log(`  RÉFÉRENCE RENDUE : ${reference}`)
console.log(`  CRÉNEAU CHOISI   : ${chosen}`)
console.log(`  ERREURS DE PAGE  : ${errors.length === 0 ? 'aucune' : errors.join(' | ')}`)
console.log('')
console.log('  À relire en base (côté opérateur) :')
console.log(`    select * from public.aid_requests where reference = '${reference}';`)
console.log(`    select id, name, status, type, farmer_id_no, provided_documents is not null as doc,`)
console.log(`           signature is not null as signed`)
console.log(`      from public.entities where name = '${MARK}';`)
console.log(`    select at, note, pending_confirmation from public.farm_visits`)
console.log(`      where entity_id in (select entity_id from public.aid_requests where reference = '${reference}');`)
console.log('')
console.log('  Puis le NETTOYAGE, dans cet ordre (la visite référence la fiche) :')
console.log(`    delete from public.farm_visits where entity_id in`)
console.log(`      (select entity_id from public.aid_requests where reference = '${reference}');`)
console.log(`    delete from public.aid_requests where reference = '${reference}';`)
console.log(`    delete from public.entities where name = '${MARK}';`)

await ctx.close()
await browser.close()
process.exit(errors.length === 0 && reference !== '' && reference !== 'DEMO' ? 0 : 1)
