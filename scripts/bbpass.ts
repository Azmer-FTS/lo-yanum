import { readFileSync } from 'node:fs'

import {
  contactPhones,
  institutionHead,
  institutionHeads,
  institutionMatchesQuery,
  isInstitutionHeadMissing,
  needsPriorCoordination,
  primaryPhone,
  settleInstitution,
} from '../src/core/institutions'
import type { Institution, InstitutionContact } from '../src/core/institutions'
import { importMayMoveStatus, planPortalImport, statusForNewFarm } from '../src/core/portalImport'
import type { Farm } from '../src/core/types'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BB — PORTE PURE.   bun run bbpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tous les noms et numéros ici sont INVENTÉS (050-000-0xxx, 08-600-0xxx) : le
 * dépôt ne porte aucune donnée réelle.
 *
 *   A401  le rang : plusieurs contacts de tête gardés, dans l'ordre ; les écrans
 *         étroits montrent le PREMIER qui a un téléphone ; aucune
 *         rétrogradation ; « חסר ראש ישיבה » = aucun contact de tête
 *   A402  les numéros : le premier sert aux boutons d'appel des listes, l'ordre
 *         est stable, le portable d'abord ; tous restent dans la fiche
 *   A403  la מזכירות n'apparaît JAMAIS à la place du contact de tête
 *   A404  « נדרש תיאום מוקדם » : aucun bouton d'appel ordinaire, le texte
 *         accompagne toujours le marqueur (lu dans le code des écrans)
 *   A405  une recherche sur un alias trouve la fiche
 *   A406  l'import : une fiche NOUVELLE ne reçoit pas un statut que
 *         l'indicateur de premier contact ne soutient pas ; une fiche
 *         existante n'est jamais rétrogradée
 *   A407  la base : numéros, מזכירות, coordination, liens font l'aller-retour
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

const at = '2026-10-12T08:00:00.000Z'
const inst = (over: Partial<Institution>): Institution => ({
  id: 'inst-bb-x', name: 'ישיבת הדגמה', locality: 'נתיבות', kind: 'hesder', audience: 'boys', network: '', position: null, positionUncertain: false,
  engagement: 'not_contacted', contactName: '', contactPhone: '', notes: '', extra: '', source: 'manual', engagementConfirmed: true, metOn: null, students: null,
  positionSource: '', aliases: '', createdAt: at, updatedAt: at, contacts: [], ...over,
})
const c = (id: string, role: InstitutionContact['role'], name: string, phone = '', extra: Partial<InstitutionContact> = {}): InstitutionContact => ({ id, role, name, phone, note: '', ...extra })

// ---------------------------------------------------------------------------
section('A401 — plusieurs contacts de tête')
// ---------------------------------------------------------------------------
{
  const two = settleInstitution(inst({ contacts: [c('r', 'ram', 'הרב רם'), c('h1', 'head', 'ראש ראשון'), c('h2', 'head', 'ראש שני', '050-0000702')] }))
  check('A401 deux ראשי ישיבה gardés, aucun rétrogradé', institutionHeads(two).length === 2 && two.contacts!.length === 3)
  check('A401 dans l’ordre de la liste', institutionHeads(two).map((x) => x.id).join(',') === 'h1,h2')
  check('A401 l’écran étroit montre le PREMIER qui a un téléphone (ראש שני)', institutionHead(two)?.id === 'h2' && two.contactName === 'ראש שני' && two.contactPhone === '050-0000702', `${two.contactName} ${two.contactPhone}`)
  const both = settleInstitution(inst({ contacts: [c('h1', 'head', 'ראש ראשון', '050-0000701'), c('h2', 'head', 'ראש שני', '050-0000702')] }))
  check('A401 deux avec téléphone : le premier de la liste', both.contactName === 'ראש ראשון' && both.contactPhone === '050-0000701')
  const none = settleInstitution(inst({ contacts: [c('h1', 'head', 'ראש בלי טלפון'), c('h2', 'head', 'ראש שני בלי טלפון')] }))
  check('A401 aucun téléphone : le premier de tête, sans numéro', none.contactName === 'ראש בלי טלפון' && none.contactPhone === '')
  const ram = settleInstitution(inst({ contacts: [c('r', 'ram', 'הרב רם', '050-0000703')] }))
  check('A401 « חסר ראש ישיבה » quand aucun contact ne porte le rôle de tête', isInstitutionHeadMissing(ram) && ram.contactName === '' && ram.contactPhone === '')
  check('A401 … et inchangée quand il y en a deux', !isInstitutionHeadMissing(two))
  const again = settleInstitution({ ...two }, two)
  check('A401 réécrire la fiche ne change ni l’ordre ni les rôles', JSON.stringify(again.contacts) === JSON.stringify(two.contacts))
}

// ---------------------------------------------------------------------------
section('A402 — plusieurs numéros par contact')
// ---------------------------------------------------------------------------
{
  const head = c('h', 'head', 'ראש עם שני מספרים', '', { phones: [{ number: '08-6000701', label: 'home' }, { number: '050-0000704', label: 'mobile' }] })
  const s = settleInstitution(inst({ contacts: [head] }))
  const h = s.contacts![0]
  check('A402 le portable passe d’abord', contactPhones(h).map((p) => p.label).join(',') === 'mobile,home', contactPhones(h).map((p) => p.label).join(','))
  check('A402 le premier numéro = celui des boutons d’appel des listes', primaryPhone(h) === '050-0000704' && h.phone === '050-0000704' && s.contactPhone === '050-0000704')
  check('A402 les deux restent sur la fiche', contactPhones(h).length === 2)
  const three = contactPhones({ phone: '', phones: [{ number: '08-6000702', label: 'office' }, { number: '08-6000703', label: 'home' }, { number: '050-0000705', label: 'mobile' }] })
  check('A402 ordre STABLE à étiquette égale (office avant home, comme saisis)', three.map((p) => p.number).join(' ') === '050-0000705 08-6000702 08-6000703')
  check('A402 un contact d’avant BB (un seul `phone`) garde son numéro', contactPhones({ phone: '050-0000706' }).length === 1 && primaryPhone({ phone: '050-0000706' }) === '050-0000706')
  check('A402 un numéro vide n’est pas un numéro', contactPhones({ phone: '', phones: [{ number: ' ', label: 'mobile' }, { number: '050-0000707', label: 'home' }] }).length === 1)
  check('A402 settle est idempotent', JSON.stringify(settleInstitution(s, s).contacts) === JSON.stringify(s.contacts))
}

// ---------------------------------------------------------------------------
section('A403 — la מזכירות ne prend jamais la place du contact de tête')
// ---------------------------------------------------------------------------
{
  /* ★★ BD — la מזכירות est une ENTRÉE sans nom, étiquetée « secretariat » (plus un champ). */
  const office = (n: string): InstitutionContact => ({ id: 'o', role: 'contact', name: '', phone: n, phones: [{ number: n, label: 'secretariat' }], note: '' })
  const noHead = settleInstitution(inst({ address: 'רח׳ הדגמה 1', contacts: [office('08-6000710'), c('r', 'ram', 'הרב רם', '050-0000711')] }))
  check('A403 sans rang 1 : le miroir des listes reste VIDE, même avec une מזכירות', noHead.contactPhone === '' && noHead.contactName === '')
  check('A403 … et « חסר ראש ישיבה » reste vrai', isInstitutionHeadMissing(noHead))
  const withHead = settleInstitution(inst({ contacts: [office('08-6000710'), c('h', 'head', 'ראש', '050-0000712')] }))
  check('A403 avec rang 1 : la liste montre son numéro, pas celui de la מזכירות', withHead.contactPhone === '050-0000712')
  const src = readFileSync('src/ui/screens/coordinator/InstitutionsScreen.tsx', 'utf8')
  const columns = src.slice(src.indexOf('const columns'), src.indexOf('const rows = sortRows'))
  const actions = src.slice(src.indexOf('const instActions'), src.indexOf('const markers'))
  check('A403 ni les colonnes ni les gestes de la liste ne lisent la מזכירות', !/officePhone|isSecretariatEntry|institutionSecretariats/.test(columns + actions))
}

// ---------------------------------------------------------------------------
section('A404 — « נדרש תיאום מוקדם »')
// ---------------------------------------------------------------------------
{
  check('A404 le marqueur se lit d’un seul endroit', needsPriorCoordination(inst({ coordinationRequired: true })) && !needsPriorCoordination(inst({})))
  const files = ['src/ui/screens/coordinator/InstitutionsScreen.tsx', 'src/ui/institutions/institutionUi.tsx']
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    // Chaque lien d'appel d'une institution passe par `guardCall` ; chaque geste « call » de la liste a sa variante gardée.
    const telLinks = [...src.matchAll(/href=\{telOf\(([^)]*)\)\}([^>]*)>/g)]
    const unguarded = telLinks.filter((m) => !m[2].includes('guardCall'))
    check(`A404 ${f.split('/').pop()} : ${telLinks.length} liens d’appel, tous gardés`, telLinks.length > 0 && unguarded.length === 0, unguarded.map((m) => m[0].slice(0, 80)).join(' | '))
    check(`A404 ${f.split('/').pop()} : aucun « tel: » écrit à la main hors telOf`, !/[`'"]tel:/.test(src.replace(/export const telOf[^\n]*/, '')))
  }
  const list = readFileSync('src/ui/screens/coordinator/InstitutionsScreen.tsx', 'utf8')
  /* ★★ BC — le garde est étendu au contact dont la note restreint le téléphone :
     la variante gardée dit désormais TOUS les textes (`callNotices`), la
     coordination de l'institution d'abord. Même forme, même obligation. */
  check('A404 le geste « appeler » du menu a une variante gardée qui DIT le texte', /(needsPriorCoordination\(i\)|isCallGuarded\(i, institutionHead\(i\)\))\s*\?\s*\{ key: 'call', icon: 'alert'[^}]*label: (coordinationText\(i, t\)|callNotices\(i, institutionHead\(i\), t\)\.join)/.test(list))
  const ui = readFileSync('src/ui/institutions/institutionUi.tsx', 'utf8')
  const chip = ui.slice(ui.indexOf('export function CoordinationChip'), ui.indexOf('export function CoordinationBanner'))
  check('A404 la puce porte le texte (pas seulement le mot)', chip.includes('coordinationNote') && chip.includes('${note}'))
  check('A404 la bannière porte le texte', ui.slice(ui.indexOf('export function CoordinationBanner')).slice(0, 900).includes('inst.coordinationNote'))
  check('A404 la puce est dans la ligne de la liste, l’aperçu et la carte de couverture',
    list.includes('<CoordinationChip inst={i} />') && list.includes('<CoordinationChip inst={inst} full />') && readFileSync('src/ui/screens/coordinator/CoverageScreen.tsx', 'utf8').includes('<CoordinationChip inst={inst} full />'))
  /* ★★ BD — les files de l'écran sont une table (`FLAG_TEST`) : même filtre, une seule écriture. */
  check('A404 un filtre les retrouve (`?filter=coordination`)', /'coordination'/.test(list) && list.includes('coordination: needsPriorCoordination') && list.includes('isFlag(f) ? f'))
}

// ---------------------------------------------------------------------------
section('A405 — la recherche trouve les alias')
// ---------------------------------------------------------------------------
{
  const i = inst({ name: 'ישיבת ההסדר הדגמה', aliases: 'ישיבת כפר הדגמה · כרם דהדגמה', locality: 'נוה הדגמה', contacts: [c('h', 'head', 'הרב פלוני', '050-0000720')] })
  check('A405 un alias', institutionMatchesQuery(i, 'כרם דהדגמה'))
  check('A405 un alias, guillemets différents', institutionMatchesQuery(inst({ name: 'מכינה ישיבתית "הדגמה"', aliases: 'מכינת הדגמה' }), 'מכינה ישיבתית הדגמה'))
  check('A405 נוה / נווה', institutionMatchesQuery(i, 'נווה הדגמה'))
  check('A405 מיימון / מימון', institutionMatchesQuery(inst({ aliases: 'ישיבת כפר מיימון' }), 'כפר מימון'))
  check('A405 un contact, par son nom', institutionMatchesQuery(i, 'הרב פלוני'))
  check('A405 un numéro, en 05… ou en +972', institutionMatchesQuery(i, '0500000720') && institutionMatchesQuery(settleInstitution(inst({ contacts: [c('h', 'head', 'x', '+972500000721')] })), '050-0000721'))
  check('A405 rien d’autre', !institutionMatchesQuery(i, 'אשקלון'))
}

// ---------------------------------------------------------------------------
section('A406 — l’import : l’indicateur de premier contact gagne')
// ---------------------------------------------------------------------------
{
  check('A406 nouvelle fiche, sans contact, « הסכמה בעל פה » → « ליצירת קשר »', JSON.stringify(statusForNewFarm('verbal_ok', false)) === JSON.stringify({ status: 'to_contact', capped: true }))
  check('A406 … « נחתם » aussi', statusForNewFarm('signed', false).status === 'to_contact')
  check('A406 … avec contact : le statut du portail est gardé', statusForNewFarm('verbal_ok', true).status === 'verbal_ok')
  check('A406 existante : l’import AVANCE (נוצר קשר → הסכמה בעל פה)', importMayMoveStatus('contacted', 'verbal_ok'))
  check('A406 existante : jamais de recul (נחתם → ליצירת קשר)', !importMayMoveStatus('signed', 'to_contact') && !importMayMoveStatus('verbal_ok', 'contacted'))
  check('A406 existante : un statut de côté ne remplace pas un statut de l’app', !importMayMoveStatus('verbal_ok', 'declined') && !importMayMoveStatus('on_hold', 'verbal_ok'))

  const H = ['שם המקום', 'מיקום', 'איש קשר', 'נייד איש קשר', 'סטטוס חתימה', 'הערות פנימי']
  const matrix = [
    H,
    ['גד״ש חדש בלי קשר', '', 'אחד', '0500000731', 'הסכמה בעל פה', ''],
    ['גד״ש חדש עם הערה', '', 'שניים', '0500000732', 'הסכמה בעל פה', 'דיברנו בטלפון'],
    ['חוות קיימת', '', 'שלושה', '0500000733', 'ליצירת קשר', ''],
  ]
  const farm = (f: Partial<Farm> & { id: string; name: string }): Farm => ({ locality: '', status: 'verbal_ok', position: { lat: 31.5, lng: 34.6 }, positionMissing: true, farmDunams: 0, grazingDunams: 0, notes: '', ...f }) as Farm
  const plan = planPortalImport({ matrix, farms: [farm({ id: 'farm-bb-1', name: 'חוות קיימת', status: 'signed', farmerName: 'שלושה', farmerPhone: '050-0000733' })], leads: [], fileName: 'bb.csv', nowIso: at })
  const created = (n: string) => plan.actions.find((a) => a.row.name === n)
  const a1 = created('גד״ש חדש בלי קשר')
  const a2 = created('גד״ש חדש עם הערה')
  const a3 = created('חוות קיימת')
  check('A406 plan : nouvelle sans contact → « ליצירת קשר », et le rapport le dit', a1?.kind === 'create-farm' && a1.farm.status === 'to_contact' && a1.farm.contactEstablished === false && plan.warnings.some((w) => w.code === 'status-capped-no-contact' && w.name === 'גד״ש חדש בלי קשר'), a1?.kind === 'create-farm' ? String(a1.farm.status) : a1?.kind)
  check('A406 plan : nouvelle avec note interne → statut du portail', a2?.kind === 'create-farm' && a2.farm.status === 'verbal_ok')
  check('A406 plan : existante « נחתם » n’est PAS rétrogradée par le portail', a3?.kind === 'update' ? a3.patch.status === undefined : a3?.kind === 'same', a3?.kind === 'update' ? String(a3.patch.status) : String(a3?.kind))
  check('A406 plan : … et le rapport le dit', plan.warnings.some((w) => w.code === 'status-not-downgraded'))
}

// ---------------------------------------------------------------------------
section('A407 — la base : aller-retour')
// ---------------------------------------------------------------------------
{
  const i = settleInstitution(inst({
    id: 'inst-bb-rt', address: 'ת.ד. 1, הדגמה', coordinationRequired: true, coordinationNote: 'דרך רכז ההדגמה', relatedIds: ['inst-bb-other'],
    contacts: [c('h', 'head', 'ראש', '', { phones: [{ number: '08-6000741', label: 'home' }, { number: '050-0000742', label: 'mobile' }] }), c('h2', 'head', 'ראש שני', '050-0000743')],
  }))
  const row = MAPPINGS.institutions.toRows(i)[0].rows[0] as Record<string, unknown>
  /* ★★ BD — `office_phone` / `office_address` ont disparu : `address` reste, la מזכירות est dans `contacts`. */
  check('A407 colonnes écrites', row.address === 'ת.ד. 1, הדגמה' && !('office_phone' in row) && row.coordination_required === true && row.coordination_note === 'דרך רכז ההדגמה' && Array.isArray(row.related_ids))
  const back = MAPPINGS.institutions.fromRows(JSON.parse(JSON.stringify(row)), {} as never) as Institution
  check('A407 relu : adresse, coordination, liens', back.address === 'ת.ד. 1, הדגמה' && back.coordinationRequired === true && back.coordinationNote === 'דרך רכז ההדגמה' && back.relatedIds?.[0] === 'inst-bb-other')
  check('A407 relu : deux têtes, deux numéros, portable d’abord', institutionHeads(back).length === 2 && contactPhones(back.contacts![0]).map((p) => p.number).join(' ') === '050-0000742 08-6000741' && back.contactPhone === '050-0000742')
  const old = MAPPINGS.institutions.fromRows({ ...row, address: undefined, office_phone: undefined, coordination_required: undefined, coordination_note: undefined, related_ids: undefined, office_address: undefined, contacts: [{ id: 'x', role: 'head', name: 'ישן', phone: '050-0000744', note: '' }] }, {} as never) as Institution
  check('A407 une ligne d’avant BB se lit : sans marqueur, un numéro', !needsPriorCoordination(old) && (old.address ?? '') === '' && contactPhones(old.contacts![0]).length === 1)
  const mig = readFileSync('supabase/migrations/20261012000200_bb_institutions_office_coordination.sql', 'utf8')
  check('A407 la migration est additive et ne touche pas `anon`', /add column if not exists office_phone/.test(mig) && !/drop column|grant|anon\b.*to/i.test(mig.replace(/--[^\n]*/g, '')))
}

console.log(`\n  ${passed} PASS · ${failed} FAIL`)
process.exit(failed ? 1 : 0)
