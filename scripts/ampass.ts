import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'

import {
  LOCALITIES,
  LOCALITY_COUNT,
  createFarm,
  findLocality,
  formatPhoneTyping,
  getFarm,
  getVisibleFarms,
  mergePeople,
  nearestLocalities,
  phoneValue,
  rankLocalities,
  resetStore,
  splitPeople,
  updateFarm,
  HOME_BASE,
} from '../src/core/index'
import type { Farm, FarmContact } from '../src/core/index'
import { MAPPINGS } from '../src/data/rows'
import he from '../src/locales/he.json'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AM — LE FORMULAIRE DE FERME, SANS NAVIGATEUR. A212 · A213 · A214 · A215 · A216
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run ampass
 *
 *   A212  la liste des localités couvre le pays (Survey + למ״ס), tous les codes
 *         du classeur de prospection s'y trouvent, la recherche tolère les
 *         fautes et les autres graphies.
 *   A213  une ferme s'enregistre SANS יישוב et SANS épingle ; « dans / rattachée
 *         à » fait l'aller-retour par la base.
 *   A214  les seules conditions qui bloquent l'enregistrement sont la liste
 *         écrite dans le rapport, et le יישוב et l'épingle n'en sont pas.
 *   A215  une personne connue devient UNE carte pré-remplie ; l'enregistrer ne
 *         crée pas de doublon ; deux personnes différentes restent deux.
 *   A216  la ת״ז appartient à la carte de l'agriculteur (même carte que nom et
 *         portable) — et la mise en forme des téléphones (A218, partie pure).
 *
 * ⚠️ Ce qui se VOIT (la liste qui défile, la suggestion sous le champ, l'ordre
 *    des blocs, les claviers) est mesuré par `bun run amui`.
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(title: string): void {
  console.log('')
  console.log(`  ${title}`)
  console.log(`  ${'-'.repeat(title.length)}`)
}

// ---------------------------------------------------------------------------
section('A212 — la liste des localités couvre tout le pays')
// ---------------------------------------------------------------------------
check('plus de 1 300 localités (Survey 1 174 + למ״ס)', LOCALITY_COUNT >= 1300, `${LOCALITY_COUNT}`)
check(
  'chaque localité a un code למ״ס',
  LOCALITIES.every((l) => l.code !== null),
  `${LOCALITIES.filter((l) => l.code === null).length} sans code`,
)
{
  const wb = XLSX.read(readFileSync('docs/samples/prospection-sud.xlsx'))
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['רשימה'], { header: 1 }) as unknown[][]
  const head = (rows[0] as unknown[]).map(String)
  const PN = head.indexOf('יישוב')
  const PC = head.findIndex((h) => h.startsWith('סמל יישוב'))
  const codes = new Set(LOCALITIES.map((l) => l.code))
  const all = rows.slice(1).filter((r) => String(r[PN] ?? '').trim() !== '')
  const lines = all.filter((r) => Number(r[PC]) > 0)
  const missingCode = lines.filter((r) => !codes.has(Number(r[PC])))
  /* Les lignes SANS code ne sont pas des localités (« חוות בודדים — רמת נגב »,
     « חוות השקמים »…) : c'est précisément le cas qu'AM1.2 rend enregistrable. */
  const missingName = lines.filter((r) => findLocality(String(r[PN])) === null)
  check('chaque code du classeur de prospection est connu', all.length === 198 && missingCode.length === 0, `${all.length} lignes, ${lines.length} avec code, ${missingCode.length} manquants`)
  check(`les ${lines.length} יישובים codés du classeur se retrouvent mot pour mot`, missingName.length === 0, missingName.map((r) => r[PN]).join(', '))
}
{
  const cases: Array<[string, string, string]> = [
    ['באר שבה', 'באר שבע', 'une lettre fausse'],
    ['דימנה', 'דימונה', 'une lettre manquante'],
    ['טלאלים', 'טללים', 'une lettre en trop'],
    ['חריש', 'קציר-חריש', 'graphie du למ״ס (alias)'],
    ['כרמיה', 'כרמייה', 'graphie du classeur (alias)'],
    ['nahal oz', 'נחל עוז', 'nom latin'],
    ['קרית גת', 'קריית גת', 'orthographe défective']
  ]
  for (const [typed, want, why] of cases) {
    const got = rankLocalities(typed).map((l) => l.name)
    check(`« ${typed} » propose ${want} (${why})`, got.slice(0, 8).includes(want), got.slice(0, 4).join(' · '))
  }
  const bedouin = LOCALITIES.filter((l) => /\(שבט\)/.test(l.name))
  check('les שבטים du Néguev sont dans la liste (absents du Survey)', bedouin.length >= 20, `${bedouin.length}`)
  check('une requête large rend TRENTE propositions, pas huit', rankLocalities('כפר').length === 30)
  const near = nearestLocalities({ lat: 30.99206, lng: 34.76999 }, 3)
  check('la localité la plus proche d\'une épingle à טללים est טללים', near[0]?.locality.name === 'טללים', near.map((n) => `${n.locality.name} ${n.km.toFixed(1)}`).join(' · '))
}

// ---------------------------------------------------------------------------
section('A213 — une ferme s\'enregistre sans יישוב et sans épingle')
// ---------------------------------------------------------------------------
resetStore()
const baseDraft = {
  photo: null,
  name: 'חוות הבודד',
  locality: '',
  region: '',
  type: 'livestock' as const,
  status: 'to_contact' as const,
  position: HOME_BASE,
  positionMissing: true,
  farmDunams: 0,
  grazingDunams: 0,
  contacts: [],
  commitments: [],
  agreements: [],
  notes: '',
}
const lone = createFarm(baseDraft)
check('créée sans יישוב', getFarm(lone.id)?.locality === '')
check('créée sans épingle, et le dit (positionMissing)', getFarm(lone.id)?.positionMissing === true)
check('elle est dans la liste des fermes', getVisibleFarms().some((f) => f.id === lone.id))
updateFarm(lone.id, { ...baseDraft, locality: 'טללים', localityRelation: 'attached', position: { lat: 30.95, lng: 34.8 }, positionMissing: undefined })
const moved = getFarm(lone.id) as Farm
check('rattachée à טללים sans y être : la relation est enregistrée', moved.localityRelation === 'attached')
check('une épingle posée fait tomber le drapeau', !moved.positionMissing)
{
  const m = MAPPINGS.farms
  const tables = m.toRows(moved)
  const parent = tables.find((t) => t.table === 'entities')?.rows[0] ?? {}
  const kids: Record<string, Record<string, unknown>[]> = {}
  for (const t of tables) if (t.table !== 'entities') kids[t.table] = t.rows
  const back = m.fromRows(parent, kids)
  check('« attached » fait l\'aller-retour par la base (locality_relation)', parent.locality_relation === 'attached' && back.localityRelation === 'attached')
  const unset = m.fromRows({ ...parent, locality_relation: null }, kids)
  check('non précisé reste absent (identité de `bun run mapping`)', unset.localityRelation === undefined)
  check('une valeur hors liste est refusée à la lecture', m.fromRows({ ...parent, locality_relation: 'x' }, kids).localityRelation === undefined)
}
{
  const sql = readFileSync('supabase/migrations/20260916000300_locality_relation.sql', 'utf8')
  check('migration additive avec contrainte in/attached', /add column if not exists locality_relation text/.test(sql) && /in \('in', 'attached'\)/.test(sql))
}

// ---------------------------------------------------------------------------
section('A214 — ce qui bloque encore l\'enregistrement, et seulement cela')
// ---------------------------------------------------------------------------
{
  const src = readFileSync('src/ui/screens/coordinator/FarmFormScreen.tsx', 'utf8')
  const block = src.slice(src.indexOf('  const errors = {'), src.indexOf('  const contactErrors'))
  const keys = [...block.matchAll(/^    ([a-zA-Z]+):/gm)].map((m) => m[1])
  const expected = ['name', 'localityCode', 'farmerPhone', 'farmerEmail', 'liaisonPhone', 'standbyPhone', 'status']
  check('la liste des conditions bloquantes est exactement celle du rapport', JSON.stringify(keys) === JSON.stringify(expected), keys.join(', '))
  check('« יישוב » n\'est plus obligatoire', !/locality:\s*!locality/.test(src) && !/label=\{t\('form\.locality'\)\}[\s\S]{0,200}required/.test(src))
  check('l\'épingle n\'est plus obligatoire (plus de form.pinRequired)', !src.includes("form.pinRequired"))
  check('un contact sans téléphone n\'est plus « שדה חובה »', !src.includes("t('form.required')"))
  check('un refus DIT combien de champs, dans la barre (form.notSaved)', src.includes("t('form.notSaved'") && Boolean((he as { form: Record<string, string> }).form.notSaved_other))
}

// ---------------------------------------------------------------------------
section('A215 — une personne déjà enregistrée s\'édite, elle ne se ré-ajoute pas')
// ---------------------------------------------------------------------------
{
  let n = 0
  const id = () => `c-${++n}`
  // Le cas du PO : דני בראל, nom et téléphone dans les colonnes, aucun contact.
  const dani = splitPeople({ farmerName: 'דני בראל', farmerPhone: '052-1234567', farmerId: '021985189', contacts: [] })
  check('la carte de l\'agriculteur est PRÉ-REMPLIE (nom, portable, ת״ז)', dani.farmer.name === 'דני בראל' && dani.farmer.phone === '052-1234567' && dani.farmer.idNumber === '021985189')
  check('aucune autre carte, donc aucun bloc vide « ajouter »', dani.others.length === 0)
  const saved = mergePeople({ ...dani.farmer, email: 'dani@example.co.il' }, dani.others, id)
  check('enregistrer écrit UNE ligne de contact, principale', saved.contacts.length === 1 && saved.contacts[0].isPrimary && saved.contacts[0].name === 'דני בראל')
  const again = splitPeople({ ...saved, contacts: saved.contacts })
  check('rouvrir : toujours UNE carte, liée à sa ligne, sans doublon', again.others.length === 0 && again.farmer.contactId === saved.contacts[0].id && again.farmer.email === 'dani@example.co.il')
  const twice = mergePeople(again.farmer, again.others, id)
  check('ré-enregistrer ne crée pas de seconde ligne', twice.contacts.length === 1 && twice.contacts[0].id === saved.contacts[0].id)

  // Le contact principal existe et l'agriculteur n'est pas renseigné : même personne.
  const contact: FarmContact = { id: 'k1', name: 'אליהו בן־חמו', phone: '052-0000001', email: '', role: 'בעל החווה', photo: null, isPrimary: true }
  const onlyContact = splitPeople({ contacts: [contact] })
  check('un contact principal sans agriculteur devient la carte de l\'agriculteur', onlyContact.farmer.contactId === 'k1' && onlyContact.others.length === 0)

  // Même personne, ponctuation différente.
  const same = splitPeople({ farmerName: 'אליהו בן חמו', farmerPhone: '0520000001', contacts: [contact] })
  check('même numéro aux chiffres près = même personne (une carte)', same.others.length === 0 && same.farmer.contactId === 'k1')

  // Deux personnes différentes.
  const other: FarmContact = { ...contact, id: 'k2', name: 'שרה', phone: '054-9999999', isPrimary: true }
  const two = splitPeople({ farmerName: 'דני בראל', farmerPhone: '052-1234567', contacts: [other] })
  check('agriculteur ≠ contact principal : DEUX cartes, jamais fondues', two.farmer.contactId === null && two.others.length === 1)
  const kept = mergePeople(two.farmer, two.others, id)
  check('… et un seul principal après enregistrement', kept.contacts.filter((c) => c.isPrimary).length === 1)

  const blank = mergePeople(dani.farmer, [{ ...contact, id: 'k3', name: '', phone: '', isPrimary: false }], id)
  check('une carte commencée puis laissée vide n\'est pas enregistrée', blank.contacts.every((c) => c.id !== 'k3'))
}

// ---------------------------------------------------------------------------
section('A216 — ת״ז, nom et portable sur la MÊME carte ; téléphones mis en forme')
// ---------------------------------------------------------------------------
{
  const src = readFileSync('src/ui/screens/coordinator/FarmFormScreen.tsx', 'utf8')
  const editor = src.slice(src.indexOf('function PersonEditor('), src.indexOf('export function FarmFormScreen'))
  check('le champ ת״ז est rendu par la carte de personne (PersonEditor)', editor.includes('testId="farm-farmer-id"') && editor.includes("kind=\"id\""))
  const outside = src.slice(src.indexOf('export function FarmFormScreen'))
  check('et nulle part ailleurs dans le formulaire', !outside.includes('farm-farmer-id') && !outside.includes("t('form.farmerId')"))
  check('plus de bloc séparé « אנשי קשר בשטח »', !src.includes('form.sectionFieldPeople') && !src.includes("t('form.sectionContacts')"))

  const typing: Array<[string, string]> = [
    ['0521234567', '(052) 123-4567'],
    ['052123', '(052) 123'],
    ['086564111', '(08) 656-4111'],
    ['+972 52-123-4567', '(052) 123-4567'],
    ['1800123456', '1-800-123-456'],
    ['*6050', '*6050'],
  ]
  for (const [raw, want] of typing) check(`frappe « ${raw} » → ${want}`, formatPhoneTyping(raw) === want, formatPhoneTyping(raw))
  check('enregistré au format de l\'app : 052-1234567', phoneValue('(052) 123-4567') === '052-1234567')
  check('fixe : 08-6564111', phoneValue('(08) 656-4111') === '08-6564111')
  check('incomplet : gardé tel quel, jamais inventé', phoneValue('(052) 12') === '(052) 12')
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
