import { readFileSync } from 'node:fs'

import { FARM_BRANCHES, branchCounts, branchesOf, branchesToConfirm, confirmBranches, matchesBranches, normalizeBranches, toggleBranch } from '../src/core/branches'
import type { FarmBranch } from '../src/core/branches'
import { callRestrictions, isCallRestricted } from '../src/core/calls'
import { NO_SELECTION, coverageOrder, coverageSelect, linksOfSelection } from '../src/core/coverageSelection'
import type { CoverageSelection } from '../src/core/coverageSelection'
import { LOCALITIES } from '../src/core/gazetteer'
import { haversineKm } from '../src/core/geo'
import { nearestLocalityName, recomputeNearestLocalities, settleNearestLocality } from '../src/core/nearestLocality'
import { routeInOrder } from '../src/core/routing'
import { TOUR_STOP_MINUTES, buildDayPlan } from '../src/core/tours'
import type { Tour } from '../src/core/tours'
import type { Farm } from '../src/core/types'
import { MAPPINGS } from '../src/data/rows'
import { THEME_SYNC_KEY, mergeSettings, SYNCED_SETTING_KEYS, themeSourceOf } from '../src/ui/settings/sync'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BC — PORTE PURE.   bun run bcpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tous les noms et numéros ici sont INVENTÉS (050-000-09xx) : le dépôt ne
 * porte aucune donnée réelle.
 *
 *   A411  AZ4 : l'ordre du coordinateur, la durée sur place (tournée, étape),
 *         un départ propre, les heures par la route quand elle est mesurée ;
 *         le plan fait l'aller-retour en base ; une ligne d'avant AZ se lit
 *   A412  la carte de couverture : fermer la bulle NE désélectionne PAS, les
 *         trajets de l'institution sélectionnée restent SEULS affichés, les
 *         flèches passent d'une institution à la suivante (et la bulle garde
 *         son état) ; le fond de carte désélectionne
 *   A413  la localité de repère : le calcul choisit la PLUS PROCHE, une valeur
 *         saisie survit à un recalcul, une ferme sans point garde la sienne ;
 *         aller-retour en base
 *   A414  la nature : plusieurs valeurs par ferme, drapeau « à confirmer », le
 *         filtre retrouve les fermes par nature ; une piste convertie emporte
 *         les siennes ; aller-retour en base
 *   A415  l'avertissement d'appel : un contact dont la note restreint son
 *         téléphone est gardé dans la LISTE comme sur la fiche, par le
 *         mécanisme de BB (lu dans le code des écrans)
 *   A416  le thème : une valeur jamais choisie n'est plus écrite en base ; un
 *         appareil sans choix prend celle du compte ; deux choix anciens ne
 *         s'écrasent pas ; la phrase « d'où vient la décision »
 *   A417  la mise à jour : délai maximal, nouvelles tentatives, retour du
 *         réseau ; la version qui tourne, en petit, dans les réglages
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

const store = await import('../src/core/store')
const base = store._raw().farms[0]
const farm = (over: Partial<Farm>): Farm => ({ ...structuredClone(base), contacts: [], ...over })

// ---------------------------------------------------------------------------
section('A411 — AZ4 : le plan d’une tournée')
// ---------------------------------------------------------------------------
{
  const A = farm({ id: 'bc-a', name: 'חוות א', position: { lat: 31.40, lng: 34.60 } })
  const B = farm({ id: 'bc-b', name: 'חוות ב', position: { lat: 31.30, lng: 34.70 } })
  const C = farm({ id: 'bc-c', name: 'חוות ג', position: { lat: 31.20, lng: 34.65 } })
  const origin = { lat: 31.50, lng: 34.50 }
  const manual = routeInOrder([C, A, B], origin)
  check('A411 l’ordre choisi à la main est gardé (pas réordonné)', manual.stops.map((s) => s.farm.id).join(',') === 'bc-c,bc-a,bc-b')
  check('A411 la distance part du départ PROPRE à la tournée', Math.abs(manual.stops[0].legKm - haversineKm(origin, C.position)) < 1e-9)
  const tour: Tour = { id: 't', name: '', dayKey: '2026-10-13', departAt: '2026-10-13T05:30:00.000Z', farmIds: ['bc-c', 'bc-a', 'bc-b'] }
  const plain = buildDayPlan({ dayKey: tour.dayKey, tour, farms: [A, B, C], events: [], origin })
  check('A411 sans réglage : 45 min par étape, comme avant AZ', plain.stops.every((s) => s.stayMinutes === TOUR_STOP_MINUTES))
  const tuned = buildDayPlan({ dayKey: tour.dayKey, tour, farms: [A, B, C], events: [], origin, visitMinutes: 20, stopMinutes: { 'bc-a': 90 } })
  check('A411 la durée de la tournée et celle d’une étape sont appliquées', tuned.stops.find((s) => s.farm.id === 'bc-c')?.stayMinutes === 20 && tuned.stops.find((s) => s.farm.id === 'bc-a')?.stayMinutes === 90)
  const t0 = new Date(tuned.stops[1].arriveAt).getTime() - new Date(tuned.stops[0].arriveAt).getTime()
  const t1 = new Date(plain.stops[1].arriveAt).getTime() - new Date(plain.stops[0].arriveAt).getTime()
  check('A411 … et décalent les heures d’arrivée (25 min de moins sur la 1re étape)', Math.round((t1 - t0) / 60000) === 25, `${Math.round((t1 - t0) / 60000)} min`)
  const road = buildDayPlan({ dayKey: tour.dayKey, tour, farms: [A, B, C], events: [], origin, legOf: (a, b) => (a.lat === origin.lat && b.lat === C.position.lat ? { km: 50, minutes: 61 } : null) })
  check('A411 un tronçon mesuré sur la route sert l’horaire (non estimé)', road.stops[0].estimated === false && road.stops[0].legKm === 50)
  check('A411 un tronçon non mesuré est dit estimé', road.stops[1].estimated === true && road.returnEstimated === true)
  check('A411 l’heure de retour existe', typeof road.returnAt === 'string')
  const full: Tour = { ...tour, plan: { order: ['bc-c', 'bc-a', 'bc-b'], visitMinutes: 30, stopMinutes: { 'bc-a': 60 }, origin: { lat: 31.5, lng: 34.5, label: 'נקודה לדוגמה' } } }
  const rows = MAPPINGS.tours.toRows(full)
  const back = MAPPINGS.tours.fromRows(JSON.parse(JSON.stringify(rows[0].rows[0])), { tour_stops: JSON.parse(JSON.stringify(rows[1].rows)) }) as Tour
  check('A411 le plan fait l’aller-retour en base', JSON.stringify(back.plan) === JSON.stringify(full.plan), JSON.stringify(back.plan))
  const old = MAPPINGS.tours.fromRows({ ...rows[0].rows[0], plan: {} }, { tour_stops: rows[1].rows }) as Tour
  check('A411 une tournée d’avant AZ (plan vide) se lit sans plan', old.plan === undefined)
  const scr = src('src/ui/screens/coordinator/RoutePlannerScreen.tsx')
  check('A411 l’écran passe le plan à la sauvegarde et à l’horaire', /plan: cleanPlan\(tourPlan\)/.test(scr) && /legOf: \(a, b\) => roadLegOf/.test(scr) && /routeInOrder\(ordered, origin\)/.test(scr) && /data-testid="route-stop-up"/.test(scr) && /data-testid="route-return"/.test(scr))
}

// ---------------------------------------------------------------------------
section('A412 — la carte de couverture : sélection ≠ bulle, et les flèches')
// ---------------------------------------------------------------------------
{
  const places = [
    { id: 'i-3', name: 'ישיבת גימל', family: 'engaged' },
    { id: 'f-1', name: 'חוות', family: 'signed' },
    { id: 'i-1', name: 'ישיבת אלף', family: 'prospect' },
    { id: 'i-2', name: 'ישיבת בית', family: 'engaged' },
  ]
  const order = coverageOrder(places)
  check('A412 l’ordre des flèches : les institutions dessinées, par nom', order.join(',') === 'i-1,i-2,i-3', order.join(','))
  let s: CoverageSelection = coverageSelect(NO_SELECTION, { type: 'pick', id: 'i-2' })
  check('A412 toucher une épingle : sélectionnée, bulle ouverte', s.id === 'i-2' && s.bubble)
  s = coverageSelect(s, { type: 'closeBubble' })
  check('A412 FERMER LA BULLE NE DÉSÉLECTIONNE PAS', s.id === 'i-2' && !s.bubble)
  const links = [{ institutionId: 'i-1', farmId: 'f-1' }, { institutionId: 'i-2', farmId: 'f-1' }, { institutionId: 'i-2', farmId: 'f-2' }]
  const shown = linksOfSelection(links, s.id)
  check('A412 bulle fermée : les trajets de l’institution restent SEULS affichés', shown.length === 2 && shown.every((l) => l.institutionId === 'i-2'))
  s = coverageSelect(s, { type: 'step', dir: 1, order })
  check('A412 › passe à la suivante, la bulle reste FERMÉE', s.id === 'i-3' && !s.bubble)
  s = coverageSelect(s, { type: 'step', dir: 1, order })
  check('A412 › après la dernière : retour à la première', s.id === 'i-1')
  s = coverageSelect(s, { type: 'openBubble' })
  s = coverageSelect(s, { type: 'step', dir: -1, order })
  check('A412 ‹ passe à la précédente, la bulle reste OUVERTE', s.id === 'i-3' && s.bubble)
  s = coverageSelect(coverageSelect(s, { type: 'closeBubble' }), { type: 'pick', id: 'i-3' })
  check('A412 toucher l’épingle sélectionnée rouvre la bulle', s.id === 'i-3' && s.bubble)
  s = coverageSelect(s, { type: 'deselect' })
  check('A412 le fond de carte (ou la croix de la barre) désélectionne', s.id === null && !s.bubble && linksOfSelection(links, s.id).length === 3)
  const scr = src('src/ui/screens/coordinator/CoverageScreen.tsx')
  check('A412 l’écran : la croix de la bulle FERME (closeBubble), ne désélectionne pas', /type: 'closeBubble'/.test(scr) && !/InstitutionFigures[^\n]*onClose=\{\(\) => setSelected\(null\)\}/.test(scr))
  check('A412 l’écran : la barre de rappel, les flèches, le fond qui désélectionne', /data-testid="coverage-recall"/.test(scr) && /coverage-recall-prev/.test(scr) && /coverage-recall-next/.test(scr) && /onBackgroundTap/.test(scr) && /linksOfSelection\(/.test(scr))
}

// ---------------------------------------------------------------------------
section('A413 — la localité de repère')
// ---------------------------------------------------------------------------
{
  const sample = [LOCALITIES[10], LOCALITIES[400], LOCALITIES[900]]
  check('A413 au point d’une localité, c’est elle (3 essais)', sample.every((l) => nearestLocalityName(l.position) === l.name || haversineKm(LOCALITIES.find((x) => x.name === nearestLocalityName(l.position))!.position, l.position) === 0))
  let worst = 0
  for (let i = 0; i < 60; i++) {
    const p = { lat: 29.6 + (i * 0.061) % 3.6, lng: 34.3 + (i * 0.037) % 1.4 }
    const brute = LOCALITIES.reduce((a, b) => (haversineKm(p, b.position) < haversineKm(p, a.position) ? b : a))
    const got = LOCALITIES.find((l) => l.name === nearestLocalityName(p))!
    worst = Math.max(worst, haversineKm(p, got.position) - haversineKm(p, brute.position))
  }
  check('A413 le calcul choisit la PLUS PROCHE (60 points, contre la force brute)', worst < 1e-9, `écart max ${worst}`)
  const placed = farm({ id: 'bc-p', position: { ...LOCALITIES[400].position } })
  const auto = settleNearestLocality(placed)
  check('A413 une ferme placée reçoit la localité la plus proche', auto.nearestLocality === nearestLocalityName(placed.position) && !auto.nearestLocalityManual)
  const typed = farm({ id: 'bc-m', position: { ...LOCALITIES[400].position }, nearestLocality: 'שם שהוזן ביד', nearestLocalityManual: true })
  const again = recomputeNearestLocalities([typed])[0]
  check('A413 une valeur SAISIE survit à un recalcul', again.nearestLocality === 'שם שהוזן ביד' && again.nearestLocalityManual === true)
  const unplaced = farm({ id: 'bc-u', positionMissing: true, nearestLocality: 'שם מהשם של המשק' })
  check('A413 une ferme SANS POINT garde la sienne', settleNearestLocality(unplaced).nearestLocality === 'שם מהשם של המשק')
  const moved = settleNearestLocality({ ...auto, position: { ...LOCALITIES[900].position } })
  check('A413 le point bouge : la localité suit (calculée seulement)', moved.nearestLocality === nearestLocalityName(LOCALITIES[900].position))
  check('A413 rien ne change → même objet (rien à pousser)', settleNearestLocality(auto) === auto)
  const rows = MAPPINGS.farms.toRows(typed)
  const e = rows[0].rows[0] as Record<string, unknown>
  check('A413 colonnes écrites', e.nearest_locality === 'שם שהוזן ביד' && e.nearest_locality_manual === true)
  const kids = Object.fromEntries(rows.slice(1).map((t) => [t.table, JSON.parse(JSON.stringify(t.rows))]))
  const back = MAPPINGS.farms.fromRows(JSON.parse(JSON.stringify(e)), kids) as Farm
  check('A413 relue : valeur et origine', back.nearestLocality === 'שם שהוזן ביד' && back.nearestLocalityManual === true)
  const blank = MAPPINGS.farms.fromRows({ ...e, nearest_locality: null, nearest_locality_manual: false }, kids) as Farm
  check('A413 une fiche d’avant BC se lit sans valeur (aller-retour identique)', blank.nearestLocality === undefined && blank.nearestLocalityManual === undefined)
  const scr = src('src/core/store.ts')
  check('A413 le magasin la tient à jour à chaque écriture (settleAllFarms)', /settleNearestLocality\(settleFarmContacts\(f\)\)/.test(scr))
  const exp = src('src/core/association.ts')
  check('A413 l’export la porte (colonne « יישוב קרוב »)', /header: 'יישוב קרוב'/.test(exp) && /nearestLocality/.test(exp))
}

// ---------------------------------------------------------------------------
section('A414 — la nature de l’exploitation')
// ---------------------------------------------------------------------------
{
  const list: FarmBranch[] = normalizeBranches([{ kind: 'fieldCrops', toConfirm: true }, { kind: 'sheep', toConfirm: true }, 'cattle', { kind: 'bogus' }, { kind: 'sheep' }])
  check('A414 plusieurs valeurs, ordre de la nomenclature, inconnue écartée', list.map((b) => b.kind).join(',') === 'cattle,sheep,fieldCrops', list.map((b) => b.kind).join(','))
  check('A414 une valeur validée l’emporte sur la même « à confirmer »', list.find((b) => b.kind === 'sheep')?.toConfirm === undefined)
  check('A414 le drapeau « à confirmer » est porté', list.find((b) => b.kind === 'fieldCrops')?.toConfirm === true)
  check('A414 neuf natures dans la nomenclature', FARM_BRANCHES.length === 9 && FARM_BRANCHES.join(',') === 'cattle,sheep,orchards,vineyard,fieldCrops,vegetables,therapeutic,poultry,other')
  const confirmed = toggleBranch(list, 'fieldCrops')
  check('A414 toucher une valeur à confirmer la VALIDE', confirmed.find((b) => b.kind === 'fieldCrops')?.toConfirm === undefined)
  check('A414 toucher une valeur validée la RETIRE', !toggleBranch(confirmed, 'fieldCrops').some((b) => b.kind === 'fieldCrops'))
  check('A414 ajouter une valeur : validée (le PO vient de le dire)', toggleBranch([], 'orchards')[0]?.toConfirm === undefined)
  check('A414 « אישור הכל »', branchesToConfirm({ branches: confirmBranches(list) }).length === 0 && confirmBranches(list).length === 3)
  const farms = [
    farm({ id: 'bc-f1', branches: [{ kind: 'cattle', toConfirm: true }] }),
    farm({ id: 'bc-f2', branches: [{ kind: 'sheep', toConfirm: true }, { kind: 'fieldCrops', toConfirm: true }] }),
    farm({ id: 'bc-f3', branches: [{ kind: 'orchards' }] }),
    farm({ id: 'bc-f4' }),
  ]
  check('A414 le filtre retrouve les fermes par nature', farms.filter((f) => matchesBranches(f, ['sheep'])).map((f) => f.id).join(',') === 'bc-f2')
  check('A414 deux natures choisies : l’une OU l’autre (élevage = בקר + צאן)', farms.filter((f) => matchesBranches(f, ['cattle', 'sheep'])).map((f) => f.id).join(',') === 'bc-f1,bc-f2')
  check('A414 aucun choix : tout passe', farms.filter((f) => matchesBranches(f, [])).length === 4)
  const counts = branchCounts(farms)
  check('A414 les comptes du filtre', counts.cattle === 1 && counts.sheep === 1 && counts.fieldCrops === 1 && counts.orchards === 1 && counts.poultry === 0)
  const rows = MAPPINGS.farms.toRows(farms[1])
  const e = rows[0].rows[0] as Record<string, unknown>
  const kids = Object.fromEntries(rows.slice(1).map((t) => [t.table, JSON.parse(JSON.stringify(t.rows))]))
  const back = MAPPINGS.farms.fromRows(JSON.parse(JSON.stringify(e)), kids) as Farm
  check('A414 aller-retour en base, drapeaux compris', JSON.stringify(branchesOf(back)) === JSON.stringify(branchesOf(farms[1])))
  check('A414 une fiche sans nature se relit sans nature', (MAPPINGS.farms.fromRows({ ...e, branches: [] }, kids) as Farm).branches === undefined)
  store.createLeads([{ name: 'משק לדוגמה', contactName: '', phone: '050-0000951', place: 'נתיבות', position: { lat: 31.42, lng: 34.59 }, regionId: null, notes: '', source: 'manual' as const, raw: '', status: 'call_back' as const }])
  const lead = store._raw().leads.find((l) => l.phone === '050-0000951')!
  store.setLeadBranches(lead.id, [{ kind: 'vineyard', toConfirm: true }])
  const lrows = MAPPINGS.leads.toRows(store._raw().leads.find((l) => l.id === lead.id)!)
  const lback = MAPPINGS.leads.fromRows(JSON.parse(JSON.stringify(lrows[0].rows[0])), {}) as typeof lead
  check('A414 un contact à traiter porte le même champ (aller-retour)', lback.branches?.[0]?.kind === 'vineyard' && lback.branches?.[0]?.toConfirm === true)
  const converted = store.convertLeadToFarm(lead.id, { lat: 31.5, lng: 34.6 })
  check('A414 devenue ferme, la fiche emporte sa nature (drapeau compris)', converted?.branches?.[0]?.kind === 'vineyard' && converted?.branches?.[0]?.toConfirm === true)
  const fl = src('src/ui/screens/coordinator/FarmsListScreen.tsx')
  check('A414 l’écran des fermes filtre par nature', /matchesBranches\(/.test(fl) && /branchCounts\(/.test(fl))
}

// ---------------------------------------------------------------------------
section('A415 — l’avertissement d’appel, dans la liste comme sur la fiche')
// ---------------------------------------------------------------------------
{
  const restricted = { name: 'הרב לדוגמה', note: 'קו ציבורי — לשאלות הלכה בלבד', restrictsCalls: true }
  const plain = { name: 'איש קשר', note: 'מתקשר בערב' }
  check('A415 une note ordinaire ne garde rien', !isCallRestricted(null, plain) && callRestrictions(null, plain).length === 0)
  check('A415 une note qui restreint le téléphone garde l’appel, avec SA note', isCallRestricted(null, restricted) && callRestrictions(null, restricted)[0]?.kind === 'contact' && (callRestrictions(null, restricted)[0] as { note: string }).note === restricted.note)
  check('A415 l’institution en coordination ET le contact : les deux textes, institution d’abord', callRestrictions({ coordinationRequired: true, coordinationNote: 'דרך הרכז' }, restricted).map((r) => r.kind).join(',') === 'coordination,contact')
  const ui = src('src/ui/institutions/institutionUi.tsx')
  check('A415 un seul mécanisme : guardCall / confirmCall / callTone lisent callRestrictions (@core)', /callRestrictions\(inst, contact\)/.test(ui) && /export function guardCall\(inst: Institution \| null/.test(ui) && /confirmCall\(inst, contact, t\)/.test(ui))
  const inst = src('src/ui/screens/coordinator/InstitutionsScreen.tsx')
  check('A415 LISTE des institutions : l’appel du contact de tête passe par le garde', /onClick=\{guardCall\(i, t, institutionHead\(i\)\)\}/.test(inst) && /confirmCall\(i, institutionHead\(i\), t\)/.test(inst) && /<CallRestrictionChip contact=\{institutionHead\(i\)\} \/>/.test(inst))
  check('A415 aperçu de l’institution : idem', /guardCall\(inst, t, institutionHead\(inst\)\)/.test(inst))
  check('A415 FICHE (contacts rangés, éditeur) : chaque numéro passe par le garde du contact', /onClick=\{guardCall\(inst, t, c\)\}/.test(ui) && /onClick=\{guardCall\(inst, t, contact\)\}/.test(ui) && /institution-contact-restricts/.test(ui))
  const fl = src('src/ui/screens/coordinator/FarmsListScreen.tsx')
  const fe = src('src/ui/farm/FarmContactsEditor.tsx')
  check('A415 LISTE des fermes et aperçu : le même garde', /confirmCall\(null, callee, t\)/.test(fl) && /guardCall\(null, t, c\)/.test(fl))
  check('A415 fiche de la ferme (éditeur des contacts) : la case et le garde', /farm-contact-restricts/.test(fe) && /guardCall\(null, t, contact\)/.test(fe))
  const back = MAPPINGS.farms.fromRows(
    JSON.parse(JSON.stringify(MAPPINGS.farms.toRows(farm({ id: 'bc-c1' }))[0].rows[0])),
    { entity_contacts: [{ id: 'c1', entity_id: 'bc-c1', name: 'א', phone: '050-0000952', email: '', role: '', photo: null, is_primary: true, note: 'רק בערב', restricts_calls: true, position: 0 }] },
  ) as Farm
  check('A415 le drapeau d’un contact de ferme fait l’aller-retour', back.contacts[0]?.restrictsCalls === true)
}

// ---------------------------------------------------------------------------
section('A416 — le thème : la ligne ne ment plus, un appareil sans choix suit le compte')
// ---------------------------------------------------------------------------
{
  const blank = Object.fromEntries(SYNCED_SETTING_KEYS.map((k) => [k, null])) as Record<string, string | null>
  // L'ordinateur : sombre choisi AVANT AY1.3 (aucun instant) ; il pousse une AUTRE clé.
  const desk = { values: { ...blank, [THEME_SYNC_KEY]: 'dark', 'lo-yanum:coverage-map': '{"minutes":35}' }, stamps: { 'lo-yanum:coverage-map': 5000 } }
  const pushed = mergeSettings(desk, { values: blank, stamps: {} }, 0)
  check('A416 une poussée pour une autre clé n’écrit PAS le thème jamais horodaté', pushed.push && pushed.remote[THEME_SYNC_KEY] === undefined, String(pushed.remote[THEME_SYNC_KEY]))
  // La base porte « dark » sans instant (l'état mesuré en BC) ; le téléphone n'a rien choisi.
  const remote = { values: { ...blank, [THEME_SYNC_KEY]: 'dark' }, stamps: {} }
  const phone = mergeSettings({ values: blank, stamps: {} }, remote, 0)
  check('A416 un appareil SANS choix prend le sombre du compte', phone.applied.includes(THEME_SYNC_KEY) && phone.local.values[THEME_SYNC_KEY] === 'dark')
  check('A416 … sans lui poser d’instant (ce n’est pas SON choix)', !phone.local.stamps[THEME_SYNC_KEY])
  const legacyPhone = mergeSettings({ values: { ...blank, [THEME_SYNC_KEY]: 'light' }, stamps: {} }, remote, 0)
  check('A416 deux choix anciens différents ne s’écrasent pas (AY1.3 tient)', !legacyPhone.applied.includes(THEME_SYNC_KEY) && legacyPhone.local.values[THEME_SYNC_KEY] === 'light' && legacyPhone.remote[THEME_SYNC_KEY] === 'dark')
  const chosen = mergeSettings({ values: { ...blank, [THEME_SYNC_KEY]: 'dark' }, stamps: { [THEME_SYNC_KEY]: 9000 } }, { values: { ...blank, [THEME_SYNC_KEY]: 'light' }, stamps: {} }, 0)
  check('A416 un choix horodaté monte et gagne', chosen.push && chosen.remote[THEME_SYNC_KEY] === 'dark' && JSON.parse(chosen.remote.__stamps as string)[THEME_SYNC_KEY] === 9000)
  const src1 = themeSourceOf({ stored: 'dark', stamp: 9000, remote: 'dark', connected: true })
  const src2 = themeSourceOf({ stored: null, stamp: 0, remote: null, connected: true })
  const src3 = themeSourceOf({ stored: 'light', stamp: 0, remote: 'dark', connected: true })
  const src4 = themeSourceOf({ stored: 'system', stamp: 9000, remote: 'system', connected: true })
  check('A416 « נבחר בהגדרות, מסונכרן » / « לפי המכשיר » / « בחירה ישנה » : la phrase sait d’où vient le thème', src1.source === 'synced' && src2.source === 'device' && src3.source === 'legacy' && src4.source === 'device')
  check('A416 le compte porte un autre choix : dit (et un geste l’applique)', src3.accountDiffers && !src1.accountDiffers)
  const ds = src('src/ui/settings/DisplaySection.tsx')
  check('A416 l’écran des réglages imprime la phrase et propose le geste', /data-testid="theme-source"/.test(ds) && /theme-sync-now/.test(ds) && /theme-apply-account/.test(ds))
}

// ---------------------------------------------------------------------------
section('A417 — la mise à jour arrive sur le téléphone')
// ---------------------------------------------------------------------------
{
  const up = src('src/ui/update.ts')
  check('A417 la question part à chaque retour en avant-plan (visibilitychange · pageshow · focus)', /addEventListener\('visibilitychange', onReturn\)/.test(up) && /addEventListener\('pageshow', onReturn\)/.test(up) && /addEventListener\('focus', onReturn\)/.test(up))
  check('A417 … et au retour du réseau, sans la fenêtre des 4 s', /addEventListener\('online', onOnline\)/.test(up) && /const onOnline = \(\) => \{\s*if \(document.visibilityState === 'hidden'\) return\s*ask\(0\)/.test(up))
  check('A417 jamais une requête pendante : délai maximal (AbortController)', /FETCH_TIMEOUT_MS = 8000/.test(up) && /ctrl\.abort\(\)/.test(up))
  check('A417 un échec réessaie, rapproché (3 s, 10 s, 30 s)', /RETRY_DELAYS_MS: readonly number\[\] = \[3000, 10_000, 30_000\]/.test(up) && /ask\(attempt \+ 1\)/.test(up))
  const banner = src('src/ui/components/UpdateBanner.tsx')
  check('A417 le bandeau recharge sans fermer l’app (applyUpdate)', /applyUpdate/.test(banner))
  const set = src('src/ui/screens/coordinator/SettingsScreen.tsx')
  check('A417 la version qui tourne, en petit, sous le titre des réglages', /<AppVersionLine \/>/.test(set) && /settings-version-line/.test(src('src/ui/settings/AppVersionSection.tsx')))
}

console.log(`\n  ${passed} PASS · ${failed} FAIL`)
process.exit(failed ? 1 : 0)
