import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { institutionContacts, isInstitutionHeadMissing, minorsLabel, settleInstitution } from '../src/core/institutions'
import type { Institution, InstitutionContact } from '../src/core/institutions'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AZ5 — PORTE PURE.   bun run az5pass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A380  la hiérarchie : le rang 1 représente l'institution, seul ; sans lui
 *         le contact affiché est VIDE (jamais un ר״מ / רכז promu) ; rangés par
 *         rôle ; un second רכז est rétrogradé, pas perdu (★★ BB : plusieurs rangs 1 gardés)
 *   A381  un contact écrit par un chemin d'avant AZ5 (import, fusion .vcf,
 *         /add) entre comme « איש קשר », jamais comme rang 1
 *   A382  la base : `contacts` et « קטינים » font l'aller-retour ; une ligne
 *         d'avant AZ5 garde sa personne sans la promouvoir
 *   A383  (code) aucun « premier à appeler », aucun premier contact pris au
 *         hasard : l'écran lit le miroir du rang 1 ou la liste rangée
 *   A384  (code) « קטינים » est une INFORMATION : rien ne la lit hors de
 *         l'affichage et de la persistance (aucune règle, aucun blocage)
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log(`\n  ${title}\n  ${'-'.repeat(title.length)}`)
}

const base: Institution = {
  id: 'inst-x', name: 'ישיבת בדיקה', locality: 'שדרות', kind: 'hesder', audience: 'boys', network: '', position: null, positionUncertain: false,
  engagement: 'signed', contactName: '', contactPhone: '', notes: '', extra: '', source: 'manual', engagementConfirmed: true, metOn: null, students: null,
  positionSource: '', aliases: '', createdAt: '2026-10-11T00:00:00.000Z', updatedAt: '2026-10-11T00:00:00.000Z',
}
const c = (id: string, role: InstitutionContact['role'], name: string, phone = '', note = ''): InstitutionContact => ({ id, role, name, phone, note })

// ---------------------------------------------------------------------------
section('A380 — la hiérarchie, le rang 1, le rangement')
// ---------------------------------------------------------------------------
{
  const s = settleInstitution({ ...base, contacts: [c('3', 'contact', 'אחר', '050-1'), c('2', 'coordinator', 'רכז', '050-2'), c('1', 'head', 'הרב', '050-3'), c('4', 'ram', 'ר״מ', '050-4')] })
  check('A380 le contact affiché est le rang 1', s.contactName === 'הרב' && s.contactPhone === '050-3')
  check('A380 rangés : ראש → ר״מ → רכז → איש קשר', institutionContacts(s).map((x) => x.role).join(',') === 'head,ram,coordinator,contact', institutionContacts(s).map((x) => x.role).join(','))
  const noHead = settleInstitution({ ...base, contacts: [c('1', 'ram', 'הרב משה', '052-1'), c('2', 'coordinator', 'מתניה', '050-2')] })
  check('A380 sans rang 1 : contact affiché VIDE (ni le ר״מ ni le רכז)', noHead.contactName === '' && noHead.contactPhone === '')
  check('A380 … et marqué « חסר ראש ישיבה »', isInstitutionHeadMissing(noHead) && !isInstitutionHeadMissing(s))
  const two = settleInstitution({ ...base, contacts: [c('1', 'head', 'א'), c('2', 'head', 'ב'), c('3', 'coordinator', 'ג'), c('4', 'coordinator', 'ד')] })
  /* ★★ BB — plusieurs rangs 1 sont GARDÉS (deux ראשי ישיבה) ; le second רכז reste rétrogradé. */
  check('A380 (BB) deux rangs 1 gardés, un second רכז rétrogradé en איש קשר, personne perdu', two.contacts!.length === 4 && two.contacts!.filter((x) => x.role === 'head').length === 2 && two.contacts!.filter((x) => x.role === 'coordinator').length === 1 && two.contactName === 'א')
  const removed = settleInstitution({ ...s, contacts: s.contacts!.filter((x) => x.role !== 'head') }, s)
  check('A380 retirer le rang 1 vide le contact affiché (pas de remplaçant)', removed.contactName === '' && removed.contactPhone === '')
}

// ---------------------------------------------------------------------------
section('A381 — un chemin d’avant AZ5 n’écrit jamais le rang 1')
// ---------------------------------------------------------------------------
{
  const prev = settleInstitution({ ...base, contacts: [c('1', 'ram', 'הרב משה', '052-1')] })
  const imported = settleInstitution({ ...prev, contactName: 'יוסי', contactPhone: '054-9' }, prev)
  check('A381 import : la personne entre comme איש קשר', imported.contacts!.some((x) => x.name === 'יוסי' && x.role === 'contact'))
  check('A381 … et le contact affiché reste vide (rang 1 manquant)', imported.contactName === '' && isInstitutionHeadMissing(imported))
  const again = settleInstitution({ ...imported, contactName: 'יוסי', contactPhone: '054-9' }, imported)
  check('A381 réimporter la même personne ne la double pas', again.contacts!.length === imported.contacts!.length)
  const withHead = settleInstitution({ ...base, contacts: [c('1', 'head', 'הרב', '050-3')] })
  const merged = settleInstitution({ ...withHead, contactPhone: '058-7' }, withHead)
  check('A381 une fusion .vcf ne remplace pas le téléphone du rang 1', merged.contactPhone === '050-3' && merged.contacts!.some((x) => x.phone === '058-7' && x.role === 'contact'))
  const created = settleInstitution({ ...base, contactName: 'דנה', contactPhone: '050-5' })
  check('A381 une création « à l’ancienne » (/add) n’invente pas de rang 1', created.contactName === '' && created.contacts!.length === 1 && created.contacts![0].role === 'contact')
  const untouched = settleInstitution({ ...withHead, notes: 'x' }, withHead)
  check('A381 une autre modification ne touche pas aux contacts', untouched.contacts!.length === 1 && untouched.contactName === 'הרב')
}

// ---------------------------------------------------------------------------
section('A382 — la base : aller-retour, lignes d’avant AZ5')
// ---------------------------------------------------------------------------
{
  const m = MAPPINGS.institutions
  const inst = settleInstitution({ ...base, kind: 'school', minorsAge: { min: 15, max: 18 }, contacts: [c('1', 'head', 'יונתן', '054-1', 'מנהל בית הספר'), c('2', 'assistant', 'רובי', '052-2', 'העוזר')] })
  const row = m.toRows(inst)[0].rows[0]
  check('A382 la ligne porte contacts, minors_age_min/max, et le miroir', Array.isArray(row.contacts) && row.minors_age_min === 15 && row.minors_age_max === 18 && row.contact_name === 'יונתן')
  const back = m.fromRows(row) as Institution
  check('A382 aller-retour exact', JSON.stringify(back.contacts) === JSON.stringify(inst.contacts) && minorsLabel(back) === '15–18' && back.kind === 'school')
  const legacy = m.fromRows({ ...row, contacts: undefined, contact_name: 'הרב בדיקה ותיק', contact_phone: '', minors_age_min: null, minors_age_max: null }) as Institution
  check('A382 une ligne d’avant AZ5 garde sa personne, sans la promouvoir', legacy.contacts!.length === 1 && legacy.contacts![0].role === 'contact' && legacy.contacts![0].name === 'הרב בדיקה ותיק' && legacy.contactName === '')
  check('A382 sans tranche d’âge : pas de mention', minorsLabel(legacy) === null)
}

// ---------------------------------------------------------------------------
section('A383 · A384 — (code) aucun premier à appeler ; « קטינים » n’est qu’une information')
// ---------------------------------------------------------------------------
const files: string[] = []
const walk = (d: string) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(ts|tsx)$/.test(f)) files.push(p)
  }
}
walk('src')
const src = files.map((p) => ({ p, s: readFileSync(p, 'utf8') }))
const firstPick = src.filter(({ s }) => /\b(i|inst|institution|openInst|found)\.contacts(\?\.|!)?\[0\]|institutionContacts\([^)]*\)\[0\]|firstToCall|callFirst|primaryInstitutionContact/.test(s)).map(({ p }) => p).filter((p) => !p.includes('/mock/'))
check('A383 aucun « premier contact » pris dans la liste', firstPick.length === 0, firstPick.join(', '))
const minorsReaders = src.filter(({ s }) => /minorsAge|minors_age/.test(s)).map(({ p }) => p).sort()
const allowed = ['src/core/institutions.ts', 'src/data/rows.ts', 'src/ui/institutions/institutionUi.tsx']
check('A384 « קטינים » n’est lu que pour l’afficher et le garder', minorsReaders.every((p) => allowed.includes(p)), minorsReaders.join(', '))

console.log(`\n  ${passed} passed · ${failed} failed\n`)
process.exit(failed ? 1 : 0)
