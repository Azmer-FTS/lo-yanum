import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

import { duplicatePhones, pairByPhone, phoneE164, samePhone } from '../src/core/phone'
import { farmPersonName, farmRank1, isContactEstablished, portalContactEstablished, settleFarmContacts, withFarmContacts } from '../src/core/people'
import { parsePortalCsv, planPortalImport, readPortalRows } from '../src/core/portalImport'
import type { Farm, FarmContact, Lead } from '../src/core/types'
import { MAPPINGS } from '../src/data/rows'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BA — PORTE PURE.   bun run bapass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tous les numéros ici sont INVENTÉS (050-000-0xxx, 052-000-0xxx…) : le dépôt
 * ne porte aucun numéro réel, ni dans les portes ni dans les fixtures.
 *
 *   A390  E.164 : toutes les écritures d'un même numéro se rejoignent ; un
 *         code court, un fragment ou un numéro étranger ne s'apparient jamais
 *   A391  l'appairage se fait par le TÉLÉPHONE, jamais par le nom ; deux
 *         candidats au même numéro sont un doublon SIGNALÉ, pas un choix
 *   A392  les contacts d'une ferme : liste ordonnée, le rang 1 reflété dans
 *         `farmerName` / `farmerPhone`, seul `isPrimary` ; un chemin d'avant
 *         BA qui écrit l'agriculteur le fait monter, sans perdre personne
 *   A393  l'import du portail : téléphone d'abord ; la piste au même numéro
 *         est CONVERTIE (pas doublée) ; toute ligne devient une ferme ;
 *         « טרם נוצר קשר » = ni coordonnées ni note interne
 *   A394  la base : la note d'un contact et « טרם נוצר קשר » font
 *         l'aller-retour ; le rang = la position
 *   A395  aucune donnée réelle indexée : les numéros, ת״ז, noms et liens du
 *         lot privé (private/ba/, s'il est là) n'apparaissent dans AUCUN
 *         fichier suivi ni dans l'index
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

// ---------------------------------------------------------------------------
section('A390 — un numéro, une forme : E.164')
// ---------------------------------------------------------------------------
{
  const forms = ['0500000123', '050-0000123', '(050) 000-0123', '+972500000123', '+972 50-000-0123', '972500000123', '00972500000123', '050 000 0123']
  const all = forms.map(phoneE164)
  check('A390 huit écritures → +972500000123', all.every((x) => x === '+972500000123'), all.join(' '))
  check('A390 l’exemple du brief, sous sa forme : 05XXXXXXXX = +9725XXXXXXXX', phoneE164('0520000344') === '+972520000344' && samePhone('0520000344', '+972520000344'))
  check('A390 un fixe (08…) garde ses 8 chiffres', phoneE164('08-6000000') === '+97286000000', String(phoneE164('08-6000000')))
  check('A390 un code court, un fragment, un vide → null', [phoneE164('*6050'), phoneE164('050-000'), phoneE164(''), phoneE164(null)].every((x) => x === null))
  check('A390 un numéro étranger ne devient pas israélien', phoneE164('+33600000000') === null)
  check('A390 samePhone est faux quand l’un est illisible', !samePhone('', '') && !samePhone('050-000', '050-000'))
}

// ---------------------------------------------------------------------------
section('A391 — l’appairage par téléphone, jamais par le nom')
// ---------------------------------------------------------------------------
{
  const photos = [{ phone: '+972500000201', file: '972500000201.jpg' }, { phone: '+972500000202', file: '972500000202.jpg' }, { phone: '+972500000299', file: '972500000299.jpg' }]
  const people = [
    { name: 'משה בדיקה', phone: '050-0000201' },
    /* même nom que le premier, autre numéro : ne doit PAS recevoir sa photo */
    { name: 'משה בדיקה', phone: '050-0000203' },
    /* nom écrit autrement (RTL, guillemets), même numéro : doit la recevoir */
    { name: 'חווה ״בדיקה״ — ב', phone: '(050) 000-0202' },
  ]
  const { pairs } = pairByPhone(people, photos, (p) => p.phone, (ph) => [ph.phone])
  check('A391 même numéro sous deux écritures → appariés', pairs[0].match?.file === '972500000201.jpg' && pairs[2].match?.file === '972500000202.jpg')
  check('A391 même NOM, autre numéro → pas apparié', pairs[1].match === null)
  check('A391 une photo sans personne reste sans personne (pas de rapprochement au nom)', !pairs.some((p) => p.match?.file === '972500000299.jpg'))
  const farms = [{ id: 'a', phones: ['050-0000301'] }, { id: 'b', phones: ['+972500000301'] }, { id: 'c', phones: ['050-0000302'] }]
  const r = pairByPhone([{ phone: '0500000301' }], farms, (x) => x.phone, (f) => f.phones)
  check('A391 deux fiches au même numéro : doublon SIGNALÉ, aucune choisie', r.pairs[0].match === null && r.ambiguous.length === 1 && r.ambiguous[0].matches.length === 2)
  const dups = duplicatePhones(farms, (f) => f.phones)
  check('A391 duplicatePhones les trouve, aux écritures près', dups.length === 1 && dups[0].phone === '+972500000301' && dups[0].records.length === 2)
}

// ---------------------------------------------------------------------------
section('A392 — les contacts d’une ferme : le rang 1 et son miroir')
// ---------------------------------------------------------------------------
const fc = (id: string, name: string, phone: string, extra: Partial<FarmContact> = {}): FarmContact => ({ id, name, phone, email: '', role: '', photo: null, isPrimary: false, ...extra })
const farm = (f: Partial<Farm> & { id: string; name: string }): Farm =>
  ({
    locality: '', region: '', regionId: null, type: 'unknown', status: 'verbal_ok', position: { lat: 31.5, lng: 34.6 }, farmDunams: 0, grazingDunams: 0,
    contacts: [], commitments: [], agreements: [], notes: '', photo: null, lastVisitAt: null, nextVisitAt: null, ...f,
  }) as Farm
{
  const f = settleFarmContacts(farm({ id: 'f1', name: 'חוות בדיקה', farmerName: 'אבי בדיקה', farmerPhone: '050-0000401' }))
  check('A392 une fiche sans liste : l’agriculteur devient le rang 1', f.contacts.length === 1 && farmRank1(f)?.name === 'אבי בדיקה' && farmRank1(f)?.isPrimary === true)
  check('A392 settle est idempotent (même référence)', settleFarmContacts(f) === f)
  const two = withFarmContacts(f, [...f.contacts, fc('c2', 'דנה בדיקה', '050-0000402', { note: 'אשתו' })])
  check('A392 l’éditeur ajoute un rang 2 ; le miroir reste le rang 1', two.farmerName === 'אבי בדיקה' && two.contacts[1].note === 'אשתו' && !two.contacts[1].isPrimary)
  const swapped = withFarmContacts(two, [two.contacts[1], two.contacts[0]])
  check('A392 faire monter le rang 2 : il devient « le contact » (miroir + seul primaire)', swapped.farmerName === 'דנה בדיקה' && swapped.farmerPhone === '050-0000402' && swapped.contacts[0].isPrimary && !swapped.contacts[1].isPrimary)
  check('A392 farmPersonName lit le rang 1', farmPersonName(swapped) === 'דנה בדיקה')
  /* Un chemin d'avant BA (import) écrit l'agriculteur : il est DÉJÀ rang 2 → il remonte. */
  const legacy = settleFarmContacts({ ...two, farmerName: 'דנה בדיקה', farmerPhone: '+972500000402' })
  check('A392 l’agriculteur écrit par un import et déjà dans la liste remonte au rang 1', legacy.contacts[0].id === 'c2' && legacy.contacts.length === 2, legacy.contacts.map((c) => c.id).join(','))
  /* Un inconnu : il entre au rang 1, l'ancien rang 1 descend — personne n'est perdu. */
  const stranger = settleFarmContacts({ ...two, farmerName: 'יוסי בדיקה', farmerPhone: '050-0000409' })
  check('A392 un agriculteur inconnu entre au rang 1 sans écraser personne', stranger.contacts.length === 3 && stranger.contacts[0].name === 'יוסי בדיקה' && stranger.contacts[1].name === 'אבי בדיקה')
  const prim = settleFarmContacts(farm({ id: 'f2', name: 'חוות ב', contacts: [fc('a', 'א', '050-0000411'), fc('b', 'ב', '050-0000412', { isPrimary: true })] }))
  check('A392 sans miroir, le contact principal d’avant BA prend le rang 1', prim.contacts[0].id === 'b' && prim.farmerName === 'ב')
  /* Deux personnes collées dans un champ du portail : le cas se répare à la main, et le
     modèle le permet — la chaîne n'a pas à rester au rang 1. */
  const glued = withFarmContacts(farm({ id: 'f3', name: 'מושב בדיקה', farmerName: 'ובדיקה ראשון', farmerPhone: '050-0000421' }), [fc('r1', 'ראשון בדיקה', '050-0000421'), fc('r2', 'בדיקה', '050-0000422', { role: 'אשתו' })])
  check('A392 deux personnes collées → deux rangs, le rang 1 propre', glued.farmerName === 'ראשון בדיקה' && glued.contacts.length === 2)
}

// ---------------------------------------------------------------------------
section('A393 — l’import du portail : téléphone d’abord, pistes converties, « טרם נוצר קשר »')
// ---------------------------------------------------------------------------
{
  const header = '"שם המקום","איש קשר","נייד איש קשר",חתימה,"מייל חקלאי","סטאטוס חתימה","הערות פנימי",תז,"הסכם רעיה/חכירה","שטחי מרעה","שטחים מעובדים","שטחים שמירה","כמות התנדבויות","כמות מתנדבים קבועים",מיקום,"שם המקום"'
  const line = (cells: string[]) => cells.map((c) => `"${c}"`).join(',')
  const csv = [
    header,
    /* 1. nom DIFFÉRENT de la fiche, même téléphone → la fiche, pas une nouvelle */
    line(['חוות בדיקה חדשה', 'אבי', '0500000501', '', '', 'נחתם', '', '012345678', '', '0', '120', '0', '', '0', '31.5, 34.6', '']),
    /* 2. même NOM qu'une fiche, téléphone différent → jamais apparié au nom */
    line(['חוות שם זהה', 'בני', '0500000502', '', '', 'מוכן לחתימה', '', '0', '', '0', '0', '0', '', '0', '31.4, 34.7', '']),
    /* 3. une piste au même téléphone, ni point ni note → convertie, « טרם נוצר קשר » */
    line(['גד״ש בדיקה', 'גלעד', '0500000503', '', '', 'מוכן לחתימה', '', '0', '', '0', '0', '0', '', '0', '', '']),
    /* 4. étoilée, une note interne, pas de point → une FERME, contact établi */
    line(['*משק בדיקה*', 'דוד', '0500000504', '', '', 'מוכן לחתימה', 'הערה פנימית לבדיקה', '0', '', '0', '0', '0', '', '0', '', '']),
  ].join('\n')
  const matrix = parsePortalCsv(csv)
  const { rows } = readPortalRows(matrix)
  check('A393 « סטאטוס חתימה », « תז » et « הערות פנימי » sont lus', rows[0].status === 'signed' && rows[0].idNo === '012345678' && rows[3].notes === 'הערה פנימית לבדיקה', `${rows[0].status} ${rows[0].idNo} ${rows[3].notes}`)
  const FARMS: Farm[] = [
    farm({ id: 'farm-a', name: 'חוות בדיקה ישנה', farmerName: 'אבי', farmerPhone: '050-0000501' }),
    farm({ id: 'farm-b', name: 'חוות שם זהה', farmerName: 'אחר', farmerPhone: '050-0000599' }),
  ]
  const LEADS: Lead[] = [
    { id: 'lead-c', name: 'גד״ש בדיקה', contactName: 'גלעד', phone: '+972500000503', email: '', place: '', position: null, regionId: null, status: 'not_called', notes: '', source: 'farm', raw: '', rank: 0, createdAt: '', updatedAt: '', convertedFarmId: null, convertedAt: null } as unknown as Lead,
  ]
  const plan = planPortalImport({ matrix, farms: FARMS, leads: LEADS, fileName: 'ba-fictif.csv', nowIso: '2026-10-12T00:00:00.000Z' })
  const of = (name: string) => plan.actions.find((a) => a.row.name.includes(name))
  const a1 = of('חוות בדיקה חדשה')
  check('A393 nom différent, même téléphone → MISE À JOUR de la fiche (par téléphone)', a1?.kind === 'update' && a1.farmId === 'farm-a' && a1.pairedBy === 'phone', `${a1?.kind}`)
  const a2 = of('חוות שם זהה')
  check('A393 même nom, autre téléphone → PAS apparié au nom (nouvelle fiche)', a2?.kind === 'create-farm', `${a2?.kind}`)
  const a3 = of('גד״ש בדיקה')
  check('A393 une piste au même téléphone → CONVERTIE (fromLeadId), pas doublée', a3?.kind === 'create-farm' && a3.fromLeadId === 'lead-c', JSON.stringify(a3 && a3.kind === 'create-farm' ? a3.fromLeadId : a3?.kind))
  check('A393 … ni point ni note : « טרם נוצר קשר »', a3?.kind === 'create-farm' && a3.farm.contactEstablished === false)
  const a4 = of('משק בדיקה')
  check('A393 une ligne étoilée devient une FERME (règle du PO, AS3 levée)', a4?.kind === 'create-farm', `${a4?.kind}`)
  check('A393 … sa note interne suffit : contact établi', a4?.kind === 'create-farm' && a4.farm.contactEstablished === undefined && a4.farm.notes === 'הערה פנימית לבדיקה')
  check('A393 la règle, seule : point OU note', portalContactEstablished({ position: { lat: 1, lng: 1 } }) && portalContactEstablished({ position: null, notes: 'x' }) && !portalContactEstablished({ position: null, notes: ' ' }))
  check('A393 aucune piste n’est créée par l’import', !plan.actions.some((a) => a.kind === 'lead-create' || a.kind === 'farm-to-lead'))
}

// ---------------------------------------------------------------------------
section('A394 — la base : la note, le rang, « טרם נוצר קשר »')
// ---------------------------------------------------------------------------
{
  const f = settleFarmContacts(
    farm({ id: 'farm-rt', name: 'חוות הלוך ושוב', farmerName: 'אבי', farmerPhone: '050-0000601', contactEstablished: false, contacts: [fc('x1', 'אבי', '050-0000601', { isPrimary: true }), fc('x2', 'רונית', '050-0000602', { note: 'מטפלת בבקר' })] }),
  )
  const groups = MAPPINGS.farms.toRows(f)
  const ent = groups.find((g) => g.table === 'entities')!.rows[0]
  const kids = groups.find((g) => g.table === 'entity_contacts')!.rows
  check('A394 « טרם נוצר קשר » s’écrit `contact_established = false`', ent.contact_established === false)
  check('A394 le rang est la position (0 = rang 1), la note est écrite', kids[0].position === 0 && kids[1].position === 1 && kids[1].note === 'מטפלת בבקר')
  const back = MAPPINGS.farms.fromRows(ent, { entity_contacts: kids, entity_commitments: [], entity_livestock: [], agreements: [] } as never)
  check('A394 l’aller-retour garde la note et l’ordre', back.contacts.map((c) => c.id).join(',') === 'x1,x2' && back.contacts[1].note === 'מטפלת בבקר' && back.contacts[0].note === undefined)
  check('A394 … et « טרם נוצר קשר »', back.contactEstablished === false && !isContactEstablished(back))
  const est = MAPPINGS.farms.fromRows({ ...ent, contact_established: true }, { entity_contacts: [], entity_commitments: [], entity_livestock: [], agreements: [] } as never)
  check('A394 établi = clé absente (identité de l’aller-retour)', !('contactEstablished' in est) && isContactEstablished(est))
}

// ---------------------------------------------------------------------------
section('A395 — aucune donnée réelle dans le dépôt')
// ---------------------------------------------------------------------------
{
  const tracked = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean)
  check('A395 private/ n’est pas suivi', !tracked.some((p) => p.startsWith('private/')))
  const ignored = execSync('git check-ignore private/ba/x.csv || true', { encoding: 'utf8' }).trim()
  check('A395 private/ba/ est ignoré par git', ignored === 'private/ba/x.csv', ignored)
  const PRIVATE = 'private/ba'
  if (!existsSync(`${PRIVATE}/data-export-2026-10-12.csv`)) {
    console.log('  (lot privé absent de cette machine : seule la règle de suivi est vérifiée)')
  } else {
    /* Les aiguilles : chaque numéro (9 chiffres nationaux), chaque ת״ז, le début de
       chaque signature et chaque lien du portail, lus du lot privé — jamais écrits ici. */
    const needles = new Set<string>()
    const rows = readPortalRows(parsePortalCsv(readFileSync(`${PRIVATE}/data-export-2026-10-12.csv`, 'utf8'))).rows
    for (const r of rows) {
      const e = phoneE164(r.phone)
      if (e) needles.add(e.slice(4))
      if (r.idNo.replace(/\D/g, '').length >= 7) needles.add(r.idNo.replace(/\D/g, ''))
      if (r.signature) needles.add(r.signature.slice(22, 80))
      if (r.contract?.url) needles.add(r.contract.url.split('/').pop()!)
    }
    for (const f of ['spec.json']) {
      if (!existsSync(`${PRIVATE}/${f}`)) continue
      for (const m of readFileSync(`${PRIVATE}/${f}`, 'utf8').matchAll(/\+972(\d{8,9})/g)) needles.add(m[1])
    }
    for (const dir of ['p1/farmer-photos', 'p2/photos-pass2']) {
      const j = `${PRIVATE}/${dir}/photos.json`
      if (!existsSync(j)) continue
      for (const m of readFileSync(j, 'utf8').matchAll(/\+972(\d{8,9})/g)) needles.add(m[1])
    }
    const list = [...needles].filter((n) => n.length >= 7)
    const variantsOf = (n: string): string[] => [...new Set([n, n.length === 9 ? `0${n.slice(0, 2)}-${n.slice(2)}` : n, n.length === 9 ? `0${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}` : n, n.length === 9 ? `0${n}` : n])]
    /* 1. CE QUE LA PASSE AJOUTE : les lignes ajoutées par l'index par rapport à HEAD
          (`git diff --cached`), plus l'arbre de travail par rapport à HEAD. */
    const plus = (w: string): string =>
      execSync(`git diff ${w} -U0 --no-color -- . ':!*.png' ':!*.jpg' ':!*.webp' ':!*.xlsx' || true`, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
        .split('\n')
        .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
        .join('\n')
    /* Ce qui PART : l'index par rapport à HEAD (c'est ce que le commit emporte). */
    const staged = plus('--cached HEAD')
    const fresh = list.filter((n) => variantsOf(n).some((v) => staged.includes(v)))
    check(`A395 l’index n’ajoute aucune des ${list.length} aiguilles du lot privé (ce que le commit emporte)`, fresh.length === 0, fresh.map((n) => `${n.slice(0, 3)}…`).join(' '))
    /* L'arbre de travail, pour information (d'autres sessions y laissent des fichiers). */
    const tree = plus('HEAD')
    const inTree = list.filter((n) => variantsOf(n).some((v) => tree.includes(v)))
    if (inTree.length) console.log(`  INFO  l’arbre de travail (non indexé) porte ${inTree.length} aiguille(s) : ne pas l’indexer tel quel`)
    /* 2. LE STOCK D'AVANT : ce que HEAD porte déjà (passes AK/AO/AS) — signalé, pas imputé. */
    const old = new Map<string, Set<string>>()
    for (const n of list) {
      for (const v of variantsOf(n)) {
        const out = execSync(`git grep -I -l -F -e ${JSON.stringify(v)} HEAD -- . ':!*.png' ':!*.jpg' || true`, { encoding: 'utf8' }).trim()
        for (const f of out.split('\n').filter(Boolean)) old.set(f.replace(/^HEAD:/, ''), (old.get(f.replace(/^HEAD:/, '')) ?? new Set()).add(n.slice(0, 3)))
      }
    }
    console.log(`  INFO  données réelles DÉJÀ dans HEAD avant BA : ${old.size} fichier(s)${old.size ? ' — ' + [...old.keys()].join(', ') : ''}`)
    const photos = execSync('git ls-files --cached | grep -E "(^|/)972[0-9]{9}\\.jpg$" || true', { encoding: 'utf8' }).trim()
    check('A395 aucune photo nommée par un numéro dans l’index', photos === '', photos.slice(0, 120))
  }
}

console.log(`\n  ${passed} PASS · ${failed} FAIL\n`)
process.exit(failed === 0 ? 0 : 1)
