import { readFileSync } from 'node:fs'

import {
  RECENT_MAX,
  buildSearchDocs,
  groupHits,
  normalizeSearch,
  phoneDigits,
  pushRecent,
  recentKeyOf,
  searchDocs,
} from '../src/core/search'
import type { SearchDoc, SearchWords } from '../src/core/search'
import type { Farm } from '../src/core/types'
import type { Institution } from '../src/core/institutions'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BF — PORTE PURE.   bun run bfpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Les noms d'établissements sont ceux du brief (des institutions publiques) ;
 * les personnes et les numéros sont INVENTÉS. ⚠️ Le numéro du brief n'est PAS
 * recopié ici : le dépôt est public, et un numéro réel y a déjà fini une fois
 * (AW). Les trois écritures testées sont celles d'un numéro fictif.
 *
 *   A450  LA RECHERCHE — normalisation (niqqud, gershayim, finales, tirets),
 *         numéros (+972 / 00972 / 0), tolérance aux fautes mot à mot, classement
 *         préfixe > préfixe d'un mot > sous-chaîne > approchant, requête vide,
 *         groupes rangés par leur meilleur score, récents à score égal, le
 *         surlignage dans le texte d'origine
 *   A451  LES DOCUMENTS — un agriculteur trouve SA ferme (groupe des fermes),
 *         une localité trouve ce qui s'y trouve, les contacts d'une ferme et
 *         d'une institution, itinéraires, tâches, rendez-vous ; aucune requête
 *         réseau, aucune dépendance nouvelle
 *   A452  LA CAMÉRA (structure) — le garde d'interaction, les effets de caméra
 *         gardés sur des primitives, une valeur déjà servie ne rebouge rien,
 *         la carte n'est jamais remontée par `MapSplit`
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
const src = (p: string) => readFileSync(p, 'utf8')

const doc = (kind: SearchDoc['kind'], id: string, title: string, extra: Array<{ text: string; phone?: boolean }> = []): SearchDoc => ({
  kind,
  id,
  title,
  context: '',
  fields: [{ text: title, primary: true }, ...extra],
  href: `/x/${id}`,
})
const ids = (hits: ReturnType<typeof searchDocs>) => hits.map((h) => h.doc.id)

// ---------------------------------------------------------------------------
section('A450 — la recherche')
// ---------------------------------------------------------------------------
const INST = [
  doc('institution', 'orot', 'ישיבת אורות אשקלון'),
  doc('institution', 'shomria', 'ישיבת שומריה לצעירים'),
  doc('institution', 'other', 'מכינת הדגמה'),
]
check('A450 « אשקלון » trouve ישיבת אורות אשקלון', ids(searchDocs('אשקלון', INST)).includes('orot'))
check('A450 « שומרייה » (un yod en trop) trouve שומריה', ids(searchDocs('שומרייה', INST))[0] === 'shomria', ids(searchDocs('שומרייה', INST)).join(','))
check('A450 … et c’est un APPROCHANT (rang 3), pas une correspondance exacte', searchDocs('שומרייה', INST)[0]?.score >= 6)
check('A450 une requête vide rend un tableau VIDE, pas toute la base', searchDocs('', INST).length === 0 && searchDocs('   ', INST).length === 0 && searchDocs('״ - .', INST).length === 0)
check('A450 « ישיבה » (faute sur un mot) trouve encore les deux ישיבות — mot à mot', ['orot', 'shomria'].every((x) => ids(searchDocs('ישיבה', INST)).includes(x)))
check('A450 « ישיבה שומריה » : deux mots, une faute, seul שומריה', ids(searchDocs('ישיבה שומריה', INST)).join(',') === 'shomria', ids(searchDocs('ישיבה שומריה', INST)).join(','))
check('A450 pas d’approchant sous trois caractères (« שו » ne rejoint pas tout)', ids(searchDocs('שק', INST)).length === 1 && ids(searchDocs('שק', INST))[0] === 'orot')

// Normalisation
check('A450 niqqud effacé (« שָׁלוֹם » = « שלום »)', normalizeSearch('שָׁלוֹם') === normalizeSearch('שלום'))
check('A450 gershayim / geresh / guillemets effacés (« צה״ל » = « צה\"ל » = « צהל »)', normalizeSearch('צה״ל') === 'צהל' && normalizeSearch('צה"ל') === 'צהל' && normalizeSearch('ג׳ורג׳') === normalizeSearch("ג'ורג'"))
check('A450 finales ramenées (ך ם ן ף ץ)', normalizeSearch('ךםןףץ') === 'כמנפצ')
check('A450 tirets, maqaf et espaces multiples : un seul séparateur', normalizeSearch('קריית־גת') === normalizeSearch('קריית  -  גת') && normalizeSearch('קריית-גת') === 'קריית גת')
check('A450 « קרייתגת » tapé sans espace trouve « קריית־גת »', ids(searchDocs('קרייתגת', [doc('locality', 'kg', 'קריית־גת')])).includes('kg'))
check('A450 minuscules (« OROT » = « orot »)', normalizeSearch('OROT') === 'orot')

// Numéros (fictifs)
const PHONE = [doc('contact', 'p1', 'איש קשר לדוגמה', [{ text: '050-000-0123', phone: true }]), doc('contact', 'p2', 'אחר', [{ text: '054-000-0999', phone: true }])]
const a = ids(searchDocs('0500000123', PHONE))
const b = ids(searchDocs('050-000-0123', PHONE))
const c = ids(searchDocs('+972500000123', PHONE))
const d = ids(searchDocs('00972 50 000 0123', PHONE))
check('A450 « 0500000123 », « 050-000-0123 », « +972500000123 », « 00972 50 000 0123 » : le MÊME résultat', a.join() === 'p1' && b.join() === a.join() && c.join() === a.join() && d.join() === a.join(), `${a} | ${b} | ${c} | ${d}`)
check('A450 une même forme pour les quatre écritures', new Set(['0500000123', '050-000-0123', '+972500000123', '00972500000123'].map(phoneDigits)).size === 1)
check('A450 un début de numéro suffit (« 050000 »)', ids(searchDocs('050000', PHONE)).join() === 'p1')

// Le classement, les trois (quatre) rangs à la fois.
const RANK = [
  doc('farm', 'fuzzy', 'חוות גבה'), //            approchant : « גבע » → « גבה »
  doc('farm', 'inside', 'מגבעות הנגב'), //        sous-chaîne
  doc('farm', 'word', 'חוות גבעון'), //           préfixe d’un mot
  doc('farm', 'prefix', 'גבעות עולם'), //         préfixe du nom
]
const ranked = searchDocs('גבע', RANK)
check('A450 le classement : préfixe > préfixe d’un mot > sous-chaîne > approchant (les quatre à la fois)', ids(ranked).join(',') === 'prefix,word,inside,fuzzy', ids(ranked).join(',') + ' · ' + ranked.map((h) => h.score).join(','))
check('A450 … scores strictement croissants', ranked.every((h, i) => i === 0 || h.score > ranked[i - 1].score))
// Le nom passe devant un autre champ, à rang égal.
const FIELD = [doc('farm', 'byLocality', 'חוות א', [{ text: 'גבעות' }]), doc('farm', 'byName', 'גבעות ב')]
check('A450 à rang égal, le NOM passe devant un autre champ', ids(searchDocs('גבע', FIELD)).join(',') === 'byName,byLocality')
// Les récents, à score égal.
const TIE = [doc('farm', 'x1', 'חוות אלון'), doc('farm', 'x2', 'חוות אלה')]
check('A450 à score égal, l’élément ouvert récemment passe devant', ids(searchDocs('חוות', TIE))[0] === 'x2' && ids(searchDocs('חוות', TIE, { recent: ['farm:x1'] }))[0] === 'x1')
check('A450 … mais jamais devant un meilleur score', ids(searchDocs('גבע', RANK, { recent: ['farm:fuzzy'] }))[0] === 'prefix')
let recent: string[] = []
for (let i = 0; i < 14; i++) recent = pushRecent(recent, `farm:r${i}`)
recent = pushRecent(recent, 'farm:r5')
check(`A450 récents : ${RECENT_MAX} au plus, le dernier ouvert en tête, sans doublon`, recent.length === RECENT_MAX && recent[0] === 'farm:r5' && new Set(recent).size === recent.length)

// Le surlignage
const hl = searchDocs('אשקלון', INST)[0]
const shown = hl ? hl.doc.fields[hl.field].text.slice(hl.range?.[0] ?? 0, hl.range?.[1] ?? 0) : ''
check('A450 la portion trouvée est surlignée DANS LE TEXTE D’ORIGINE', shown === 'אשקלון', shown)
const nik = searchDocs('שלום', [doc('event', 'n', 'מפגש שָׁלוֹם בכפר')])[0]
const nikShown = nik ? nik.doc.title.slice(nik.range?.[0] ?? 0, nik.range?.[1] ?? 0) : ''
check('A450 … y compris à travers le niqqud', nikShown === 'שָׁלוֹם', nikShown)

// Groupes
const MIX = [doc('locality', 'L', 'גבעות'), doc('farm', 'F1', 'חוות גבעון'), doc('farm', 'F2', 'מגבעות'), doc('institution', 'I', 'ישיבת גבעה')]
const groups = groupHits(searchDocs('גבע', MIX))
check('A450 les groupes sont rangés par leur MEILLEUR score (pas un ordre fixe)', groups.map((g) => g.kind).join(',') === 'locality,farm,institution', groups.map((g) => `${g.kind}:${g.best}`).join(','))

// ---------------------------------------------------------------------------
section('A451 — les documents, depuis ce que l’app a déjà en mémoire')
// ---------------------------------------------------------------------------
const farm = (over: Partial<Farm>): Farm =>
  ({
    id: 'f',
    name: 'חווה',
    locality: '',
    farmerName: '',
    farmerPhone: '',
    contacts: [],
    position: { lat: 31.3, lng: 34.6 },
    positionMissing: false,
    status: 'signed',
    ...over,
  }) as unknown as Farm
const inst = (over: Partial<Institution>): Institution =>
  ({
    id: 'i',
    name: 'מוסד',
    aliases: '',
    locality: '',
    network: '',
    contactName: '',
    contactPhone: '',
    contacts: [],
    position: null,
    kind: 'yeshiva',
    ...over,
  }) as unknown as Institution
const WORDS: SearchWords = {
  date: (iso) => iso.slice(0, 10),
  day: (k) => k,
  institutionRole: (_i, role, sec) => (sec ? 'מזכירות' : role),
  farmContact: 'איש קשר',
  stops: (n) => `${n} תחנות`,
  localityCounts: (f, i) => `${f}/${i}`,
}
const DOCS = buildSearchDocs(
  {
    farms: [
      farm({ id: 'farm-ofakim', name: 'חוות הדגמה', locality: 'אופקים', farmerName: 'ישראל ישראלי', farmerPhone: '050-000-0123', contacts: [{ id: 'fc1', name: 'דנה בדיקה', phone: '054-000-0456', email: '', role: 'בת הזוג', photo: null, isPrimary: false }] as Farm['contacts'] }),
      farm({ id: 'farm-other', name: 'משק בדיקה', locality: 'נתיבות', farmerName: 'משה משה' }),
    ],
    institutions: [
      inst({ id: 'inst-orot', name: 'ישיבת אורות אשקלון', locality: 'אשקלון', contacts: [{ id: 'ic1', role: 'head', name: 'הרב בדיקה', phone: '050-000-0789', note: '' }] as Institution['contacts'] }),
      inst({ id: 'inst-ofakim', name: 'מכינת הדגמה', locality: 'אופקים', aliases: 'מכינת הנגב' }),
    ],
    tours: [{ id: 'tour-1', dayKey: '2026-10-15', name: 'סבב צפוני', departAt: '2026-10-15T05:00:00Z', farmIds: ['farm-ofakim'] }],
    tasks: [
      { id: 't1', listId: 'l1', title: 'להתקשר לרכז', note: 'לגבי אופקים', rank: 0, link: null, dueOn: null, dueTime: null, doneAt: null, archivedAt: null, createdAt: '', updatedAt: '' },
      { id: 't2', listId: 'l1', title: 'משימה בארכיון', note: '', rank: 1, link: null, dueOn: null, dueTime: null, doneAt: null, archivedAt: '2026-10-01', createdAt: '', updatedAt: '' },
    ],
    taskLists: [{ id: 'l1', name: 'מוסדות', rank: 0, createdAt: '', updatedAt: '' }],
    events: [
      { id: 'm1', kind: 'meeting', at: '2026-10-15T11:30:00Z', endAt: '2026-10-15T13:00:00Z', title: 'מפגש הדגמה', subtitle: 'מכינת הדגמה', href: '', missionStatus: null, done: false, farmId: null, position: null },
      { id: 'tour:tour-1', kind: 'tour', at: '2026-10-15T05:00:00Z', endAt: '2026-10-15T09:00:00Z', title: 'סבב צפוני', subtitle: '', href: '', missionStatus: null, done: false, farmId: null, position: null },
    ] as Parameters<typeof buildSearchDocs>[0]['events'],
  },
  WORDS,
)
const farmerHits = searchDocs('ישראל ישראלי', DOCS)
check('A451 le nom de l’agriculteur trouve SA ferme, dans le groupe des fermes', farmerHits.some((h) => h.doc.kind === 'farm' && h.doc.id === 'farm-ofakim') && groupHits(farmerHits).find((g) => g.kind === 'farm')?.hits[0].doc.id === 'farm-ofakim')
const place = searchDocs('אופקים', DOCS)
check('A451 « אופקים » trouve les fermes ET les institutions de la localité', place.some((h) => h.doc.id === 'farm-ofakim') && place.some((h) => h.doc.id === 'inst-ofakim') && !place.some((h) => h.doc.id === 'farm-other'))
check('A451 … et la localité elle-même, en tête (son nom)', place[0]?.doc.kind === 'locality' && place[0].doc.context === '1/1', `${place[0]?.doc.kind} ${place[0]?.doc.context}`)
check('A451 « אשקלון » trouve ישיבת אורות אשקלון (depuis une vraie fiche)', searchDocs('אשקלון', DOCS).some((h) => h.doc.id === 'inst-orot'))
check('A451 un contact de ferme : son nom, son rôle et la ferme', (() => {
  const h = searchDocs('דנה', DOCS).find((x) => x.doc.kind === 'contact')
  return !!h && h.doc.context === 'בת הזוג · חוות הדגמה' && h.doc.href === '/coordinator/farms/farm-ofakim'
})())
check('A451 un contact d’institution, trouvé par son numéro, mène à l’institution', (() => {
  const h = searchDocs('+972500000789', DOCS)
  return h.some((x) => x.doc.kind === 'contact' && x.doc.href.startsWith('/coordinator/institutions?open=inst-orot')) && h.some((x) => x.doc.id === 'inst-orot')
})())
check('A451 le numéro de l’agriculteur trouve sa ferme', searchDocs('0500000123', DOCS).some((h) => h.doc.id === 'farm-ofakim'))
check('A451 un nom alternatif trouve l’institution', searchDocs('מכינת הנגב', DOCS)[0]?.doc.id === 'inst-ofakim')
check('A451 un itinéraire (son nom, et une de ses fermes), une seule fois (pas son reflet)', searchDocs('סבב', DOCS).filter((h) => h.doc.title === 'סבב צפוני').length === 1 && searchDocs('סבב', DOCS).find((h) => h.doc.title === 'סבב צפוני')?.doc.kind === 'tour')
check('A451 une tâche ouverte (pas l’archivée), menant à l’agenda', searchDocs('להתקשר', DOCS)[0]?.doc.href === '/coordinator/agenda?task=t1' && searchDocs('בארכיון', DOCS).length === 0)
check('A451 un rendez-vous, avec sa date, ouvert dans l’agenda', (() => {
  const h = searchDocs('מפגש', DOCS).find((x) => x.doc.kind === 'event')
  return !!h && h.doc.href === '/coordinator/agenda?event=meeting%3Am1' && h.doc.context.startsWith('2026-10-15')
})())
const searchSrc = src('src/core/search.ts')
const uiSrc = src('src/ui/search/GlobalSearch.tsx')
check('A451 AUCUN appel réseau : ni Supabase, ni `fetch`, ni la couche de données', !/supabase|fetch\(|from '\.\.\/data|from '\.\.\/\.\.\/data|refreshData/.test(searchSrc + uiSrc))
check('A451 AUCUNE dépendance nouvelle (pas de Fuse.js)', !/fuse/i.test(src('package.json')) && !/from 'fuse/.test(searchSrc + uiSrc))
check('A451 le module de recherche est pur (ni React, ni DOM)', !/from 'react|document\.|window\./.test(searchSrc))

// ---------------------------------------------------------------------------
section('A452 — la caméra, la structure du correctif')
// ---------------------------------------------------------------------------
const canvas = src('src/ui/components/MapCanvas.tsx')
check('A452 le geste du PO prend la caméra : movestart, zoomstart, rotatestart, pitchstart, dragstart, et seulement avec `originalEvent`', /\['movestart', 'zoomstart', 'rotatestart', 'pitchstart', 'dragstart'\]/.test(canvas) && /if \(e\.originalEvent\) takeCameraRef\.current\(\)/.test(canvas))
check('A452 ± et מיקומי comptent comme des gestes du PO', /onUserCamera: \(\) => takeCameraRef\.current\(\)/.test(canvas) && (src('src/ui/components/MapTools.ts').match(/this\.options\.onUserCamera\?\.\(\)/g) ?? []).length === 3)
const deps = [...canvas.matchAll(/\}, \[([^\]]*)\]\)/g)].map((m) => m[1])
const cameraDeps = ['frameKey, fit, fitScope', 'centreKey, fit', 'frameTo?.key, frameReady', 'flyTo?.key', 'anchored?.key, anchored === undefined']
check('A452 les effets de caméra ne dépendent que de primitives (clés, booléens, chaînes)', cameraDeps.every((d) => deps.includes(d)), cameraDeps.filter((d) => !deps.includes(d)).join(' / '))
check('A452 la clé de cadrage est un ENSEMBLE (positions triées), pas l’ordre des fiches', /\.map\(\(m\) => `\$\{m\.position\.lat\},\$\{m\.position\.lng\}`\)\.sort\(\)/.test(canvas))
check('A452 `fit` ne recadre qu’au premier passage et sur un changement de `fitScope`', /if \(fittedRef\.current\) \{\s*if \(fitScopeRef\.current === fitScope\) return/.test(canvas))
check('A452 une valeur déjà servie ne rebouge rien (frameTo, flyTo, anchored, centre)', /if \(framedRef\.current === frameTo\.key\) return/.test(canvas) && /if \(flownRef\.current === flyTo\.key\) return/.test(canvas) && /if \(anchoredKeyRef\.current === anchored\.key\) return/.test(canvas) && /if \(centredRef\.current === centreKey\) return/.test(canvas))
check('A452 chaque demande explicite rend la main (`releaseCamera`)', (canvas.match(/releaseCamera\(\)/g) ?? []).length >= 6)
const split = src('src/ui/components/MapSplit.tsx')
check('A452 `MapSplit` ne remonte jamais la carte (ni `key`, ni montage conditionnel autour de `map(state)`)', /\{map\(state\)\}/.test(split) && !/key=\{[^}]*\}[^]*\{map\(state\)\}/.test(split.slice(split.indexOf('data-map-panel'), split.indexOf('{map(state)}') + 14)))
for (const s of ['FarmsListScreen', 'MissionsScreen', 'IncidentsScreen', 'CoverageScreen']) {
  check(`A452 ${s} : ses filtres sont le \`fitScope\` (un filtre recadre, une relecture non)`, /fitScope=\{/.test(src(`src/ui/screens/coordinator/${s}.tsx`)))
}

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
