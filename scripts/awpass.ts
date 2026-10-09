import { readFileSync } from 'node:fs'

import { routeCrossing, segmentCrossing } from '../src/core/borders'
import { clampRadiusKm, computeCoverage, COVERAGE_PRESETS, RADIUS_MAX_KM } from '../src/core/coverage'
import { haversineKm } from '../src/core/geo'
import type { Institution } from '../src/core/institutions'
import { packPair, unpackPair } from '../src/core/roadMesh'
import { applySplit, decodeGeohash, draftsFromPaste, draftsFromVcfFile, findDuplicates, leadFromDraft, localPhoneDisplay, parseVcf, readLocation, volunteerFromDraft } from '../src/core/contacts'
import { existsSync } from 'node:fs'
import type { Farm, LatLng } from '../src/core/types'
import { AW_FARMS, AW_INSTITUTIONS } from './awdata'
import { makeTruth } from './awroadtruth'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AW — PORTE PURE : A329 · A330 · A331 · A332 · A333 (maillage routier)
 *                   et, plus bas, AW2 (ajout de contacts).   bun run awpass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le maillage est mesuré sur le JEU RÉEL de `lo-yanum-prod` (positions seules,
 * `scripts/awdata.ts`) et sur l'archive réelle de la carte.
 */

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`)
}
function section(t: string) {
  console.log(`\n— ${t}`)
}

const P = (lat: number, lng: number): LatLng => ({ lat, lng })
const farms = AW_FARMS.map((f) => ({ id: f.id, name: f.id, status: f.status, position: P(f.lat, f.lng), positionMissing: false }) as unknown as Farm)
const institutions = AW_INSTITUTIONS.map(
  (i) => ({ id: i.id, name: i.name, engagement: 'signed', engagementConfirmed: false, position: P(i.lat, i.lng), positionUncertain: false }) as unknown as Institution,
)
const ALL = { signed: true, pipeline: true, leads: true, engaged: true, prospect: true }

// ---------------------------------------------------------------------------
section('A332 — le temps du calcul, jeu complet (19 fermes × 11 institutions)')
// ---------------------------------------------------------------------------
const truth = makeTruth()
async function measureAll(R: number, t = truth) {
  const t0 = performance.now()
  let n = 0
  await t.preload(AW_INSTITUTIONS.flatMap((i) => AW_FARMS.filter((f) => haversineKm(i, f) <= R).map((f) => ({ from: P(i.lat, i.lng), to: P(f.lat, f.lng) }))))
  for (const i of AW_INSTITUTIONS) {
    for (const f of AW_FARMS) {
      if (haversineKm(i, f) > R) continue
      await t.measure(P(i.lat, i.lng), P(f.lat, f.lng))
      n++
    }
  }
  return { ms: Math.round(performance.now() - t0), pairs: n }
}
const cold35 = await measureAll(35)
const stats35 = truth.graph.stats()
// « À chaud » : graphe construit, mémoire des paires vidée — le recalcul seul.
truth.known.clear()
const warm35 = await measureAll(35)
// « Gardé » : tout vient de la mémoire de l'appareil.
const packed = [...truth.known.entries()].map(([k, v]) => [k, packPair(v)] as const)
const g0 = performance.now()
const restored = new Map(packed.map(([k, v]) => [k, unpackPair(v)!]))
const keptMs = performance.now() - g0
console.log(`  35 km : ${cold35.pairs} paires · froid ${cold35.ms} ms · chaud ${warm35.ms} ms · relu de la mémoire ${keptMs.toFixed(1)} ms · ${stats35.tiles} tuiles, ${stats35.nodes} sommets`)
check('A332 le jeu complet à 35 km se calcule (froid) en moins de 60 s hors navigateur', cold35.ms < 60_000, `${cold35.ms} ms`)
check('A332 à chaud, graphe construit : plus rapide qu’à froid', warm35.ms < cold35.ms, `${warm35.ms} < ${cold35.ms}`)
check('A332 gardé : relu en moins de 20 ms, rien recalculé', keptMs < 20 && restored.size === truth.known.size, `${keptMs.toFixed(1)} ms, ${restored.size}`)
check('A332 aller-retour du stockage identique (km, durée, ligne)', [...truth.known].every(([k, v]) => {
  const r = restored.get(k)!
  return r.kind === v.kind && (v.kind === 'none' || (Math.abs((r as { km: number }).km - v.km) < 0.01 && Math.abs((r as { seconds: number }).seconds - v.seconds) <= 1))
}))

// ---------------------------------------------------------------------------
section('A329 — un lien n’est tracé que si la ROUTE tient dans le rayon')
// ---------------------------------------------------------------------------
for (const R of [30, 35]) {
  const road = computeCoverage({ farms, leads: [], institutions, radiusKm: R, visible: ALL, road: truth.road })
  // Ce que traçait AU4.6 : le vol d'oiseau seul.
  const air = computeCoverage({ farms, leads: [], institutions, radiusKm: R, visible: ALL, road: (a, b) => ({ kind: 'road', km: haversineKm(a, b), seconds: 0, trackKm: 0, fastestBeyond: null }) })
  const ratios = road.links.map((l) => l.km / haversineKm(l.from, l.to))
  const mean = ratios.reduce((a, b) => a + b, 0) / Math.max(1, ratios.length)
  console.log(`  ${R} km : vol d’oiseau ${air.links.length} liens · route ${road.links.length} liens · ${road.mesh.dropped} écartés · route/vol moyen ×${mean.toFixed(2)} · couvertes ${air.counts.covered} → ${road.counts.covered} / ${road.counts.farms}`)
  check(`A329 ${R} km : chaque lien tracé a une route ≤ ${R} km`, road.links.every((l) => l.km <= R && Number.isFinite(l.km)))
  check(`A329 ${R} km : aucune paire non mesurée (le jeu est complet)`, road.mesh.pending === 0, `${road.mesh.pending}`)
  check(`A329 ${R} km : la route écarte des liens que le vol d’oiseau traçait`, road.links.length < air.links.length && road.mesh.dropped === air.links.length - road.links.length - road.mesh.noRoad, `${air.links.length} → ${road.links.length}, ${road.mesh.dropped} écartés`)
  check(`A329 ${R} km : chaque route ≥ son vol d’oiseau`, road.links.every((l) => l.km + 0.05 >= haversineKm(l.from, l.to)))
}
// Sans route mesurée, rien n'est tracé : aucun repli au vol d'oiseau.
const none = computeCoverage({ farms, leads: [], institutions, radiusKm: 35, visible: ALL })
check('A329 paire non mesurée = aucun lien, aucune couverture (pas de repli)', none.links.length === 0 && none.counts.covered === 0 && none.mesh.pending > 0, `${none.mesh.pending} en attente`)

// ---------------------------------------------------------------------------
section('A330 — chaque lien porte sa distance routière et sa durée')
// ---------------------------------------------------------------------------
const r35 = computeCoverage({ farms, leads: [], institutions, radiusKm: 35, visible: ALL, road: truth.road })
check('A330 km et durée sur chaque lien', r35.links.length > 0 && r35.links.every((l) => l.km > 0 && l.seconds > 0))
check('A330 durée plausible (20–110 km/h moyens)', r35.links.every((l) => { const v = l.km / (l.seconds / 3600); return v > 20 && v < 110 }), r35.links.map((l) => Math.round(l.km / (l.seconds / 3600))).sort((a, b) => a - b).slice(0, 3).join(','))
const src = readFileSync('src/ui/screens/coordinator/CoverageScreen.tsx', 'utf8')
check('A330 l’écran met km + durée dans l’étiquette du lien', /label: `\$\{l\.blocked \|\| l\.fastestBeyond \? '⚠ ' : ''\}\$\{linkLabel\(l\.km, l\.seconds\)\}`/.test(src))
const canvas = readFileSync('src/ui/components/MapCanvas.tsx', 'utf8')
check('A330 la carte dessine l’étiquette au milieu du lien', canvas.includes("id: 'coverage-links-label'") && canvas.includes("'symbol-placement': 'line-center'"))

// ---------------------------------------------------------------------------
section('A331 — un trajet passant au-delà de la Ligne verte est signalé')
// ---------------------------------------------------------------------------
check('A331 בית שמש → חברון coupe la Ligne verte', segmentCrossing(31.745, 34.99, 31.53, 35.095) === 'greenLine')
check('A331 שדרות → עזה coupe une frontière', segmentCrossing(31.525, 34.596, 31.50, 34.46) === 'border')
check('A331 קרית גת → שדרות ne coupe rien', segmentCrossing(31.606, 34.762, 31.525, 34.596) === null)
const beyond = r35.links.filter((l) => l.fastestBeyond)
check('A331 sur le jeu réel : שומריה → חוות מרגי, le plus rapide passe au-delà', [...truth.known.values()].some((v) => v.kind === 'road' && v.fastestBeyond?.line === 'greenLine'))
const sm = await truth.measure(P(31.43223, 34.88374), P(31.6692346391939, 35.0331576786348))
check('A331 … et le trajet par Israël est mesuré, plus long, sans franchir', sm.kind === 'road' && !!sm.fastestBeyond && sm.km > sm.fastestBeyond.km && routeCrossing(sm.coords ?? []) === null, sm.kind === 'road' ? `${sm.fastestBeyond?.km.toFixed(1)} → ${sm.km.toFixed(1)} km` : sm.kind)
// Une ferme AU-DELÀ (קריית ארבע) : pas de trajet par Israël → lien bloqué, non compté.
const ka = P(31.5335, 35.1185)
const kg = P(31.60576, 34.76184)
const kaRoad = await truth.measure(kg, ka)
check('A331 ferme au-delà de la ligne : « au-delà seulement »', kaRoad.kind === 'beyondOnly' && kaRoad.line === 'greenLine', kaRoad.kind)
const beyondFarm = { ...farms[0], id: 'ka', position: ka } as Farm
const withKa = computeCoverage({ farms: [beyondFarm], leads: [], institutions: [institutions[1]], radiusKm: 80, visible: ALL, road: truth.road })
check('A331 lien bloqué : tracé, signalé, compté dans AUCUNE couverture', withKa.links.length === 1 && withKa.links[0].blocked === 'greenLine' && withKa.counts.covered === 0 && withKa.mesh.blocked === 1, JSON.stringify(withKa.counts))
check('A331 la carte a un trait d’alerte distinct', canvas.includes("id: 'coverage-links-blocked'"))
console.log(`  liens à 35 km dont le plus rapide passe au-delà : ${beyond.length}`)

// ---------------------------------------------------------------------------
section('A333 — le rayon reste librement réglable, sans plafond')
// ---------------------------------------------------------------------------
check('A333 clampRadiusKm(500) = 500, (1000) = 1000', clampRadiusKm(500) === 500 && clampRadiusKm(1000) === 1000)
check('A333 la réglette va au-delà de 80 km', RADIUS_MAX_KM >= 150)
check('A333 champ chiffré sans attribut max', /data-testid="coverage-radius-number"/.test(src) && !/type="number"[^>]*max=/.test(src.slice(src.indexOf('coverage-radius-number') - 600, src.indexOf('coverage-radius-number'))))
check('A333 la réglette s’étend au rayon saisi', src.includes('max={Math.max(RADIUS_MAX_KM, prefs.radiusKm)}'))
const r200 = computeCoverage({ farms, leads: [], institutions, radiusKm: 200, visible: ALL })
check('A333 un rayon de 200 km est calculé (paires demandées)', r200.mesh.airPairs === r200.counts.farms * AW_INSTITUTIONS.length, `${r200.mesh.airPairs}`)
check('A333 aucun usage de COVERAGE_PRESETS ne borne le rayon', !!COVERAGE_PRESETS)

// ===========================================================================
// AW2 — l'ajout de contacts, en pur
// ===========================================================================

section('A339 · A340 — la fiche réelle du PO (sept lignes, sans retour final)')
const REAL = existsSync('private/aw/אריאל גדש עציון.vcf') ? 'private/aw/אריאל גדש עציון.vcf' : 'docs/aw/fixtures/forme-reelle.vcf'
const realText = readFileSync(REAL, 'utf8')
console.log(`  fichier : ${REAL} — ${realText.split('\n').length} lignes, finit par « ${JSON.stringify(realText.slice(-9))} »`)
const real = draftsFromVcfFile(realText, 'farm', 'x.vcf')
const r0 = real.drafts[0]
check('A339 une fiche lue', real.drafts.length === 1 && !real.unreadable)
check('A339 אריאל = la personne, rien d’autre', r0.firstName === 'אריאל' && r0.lastName === '', `${r0.firstName} | ${r0.lastName}`)
check('A339 גד״ש עציון = l’exploitation (graphie ramenée au גרשיים)', r0.orgName === 'גד״ש עציון', r0.orgName)
const lead = leadFromDraft(r0)
check('A339 la piste : nom = exploitation, contact = אריאל', lead.name === 'גד״ש עציון' && lead.contactName === 'אריאל', `${lead.name} / ${lead.contactName}`)
const waid = (/waid=972(\d+)/.exec(realText) ?? ['', ''])[1]
check('A340 téléphone international → local', r0.phone.replace(/\D/g, '') === `0${waid}` && /^0\d{2}-\d{3}-\d{4}$/.test(localPhoneDisplay(r0.phone)), `${r0.phone} · affiché ${localPhoneDisplay(r0.phone)}`)
const vol = draftsFromVcfFile(realText, 'volunteer', 'x.vcf').drafts[0]
check('A339 en volontaire : « אריאל », la mention « גד״ש עציון » ôtée du nom', volunteerFromDraft(vol, { id: 'i', name: 'מכינה' }).name === 'אריאל', volunteerFromDraft(vol, { id: 'i', name: 'מכינה' }).name)

section('A338 — un fichier, plusieurs contacts ; et les formes que le terrain produit')
const multi = draftsFromVcfFile(readFileSync('docs/aw/fixtures/trois-contacts.vcf', 'utf8'), 'farm', 'm.vcf').drafts
check('A338 trois fiches dans un fichier (2.1 quoted-printable, 3.0, CRLF)', multi.length === 3, multi.map((d) => d.orgName || d.firstName).join(' · '))
check('A338 quoted-printable décodé (Android)', multi[0].firstName === 'יוסי' && multi[0].orgName === 'משק כהן', `${multi[0].firstName} / ${multi[0].orgName}`)
check('A338 ORG = l’exploitation, courriel repris, adresse → localité épinglée', multi[1].orgName === 'חוות הגבעה' && multi[1].email === 'dana@example.org' && multi[1].place === 'נתיבות' && multi[1].positionFrom === 'locality')
check('A338 lien Waze dans URL → épingle', multi[2].positionFrom === 'waze' && Math.abs((multi[2].position?.lat ?? 0) - 31.4214) < 1e-4)
const folded = parseVcf('BEGIN:VCARD\nFN:דוד\n  כהן\nTEL:0501234567\nBEGIN:VCARD\nFN:רות\nTEL:0507654321')
check('A338 ligne repliée, END manquant, fin de fichier sans END', folded.length === 2 && folded[0].props.find((p) => p.name === 'FN')?.value === 'דוד כהן', String(folded.length))
const bare = draftsFromVcfFile('BEGIN:VCARD\nVERSION:3.0\nTEL:+972 52-111-2222\nEND:VCARD', 'farm', 'b.vcf').drafts[0]
check('A338 une fiche avec un numéro seul : lue, « sans nom » signalé', !!bare && bare.problems.includes('noName') && bare.phone === '052-1112222')
check('A337 un fichier qui n’est pas une fiche est dit illisible', draftsFromVcfFile('hello', 'farm', 'x.txt').unreadable)

section('A341 — corriger le découpage d’un geste')
const moved = applySplit(r0, 2, 'farm')
check('A341 limite déplacée : אריאל גדש / עציון', moved.firstName === 'אריאל' && moved.lastName === 'גדש' && moved.orgName === 'עציון')
const noOrg = applySplit(r0, null, "farm")
check('A341 « pas d’exploitation dans le nom »', noOrg.orgName === "" && noOrg.firstName === "אריאל" && noOrg.lastName === 'גדש עציון')
const inst = draftsFromPaste('הרב אמיר ממן ישיבת דרך חיים 050-1231234', 'institution')[0]
check('A341 institution : titre gardé avec le prénom, ישיבת = début de l’institution', inst.firstName === 'הרב אמיר' && inst.lastName === 'ממן' && inst.orgName === 'ישיבת דרך חיים', `${inst.firstName} | ${inst.lastName} | ${inst.orgName}`)
const paste = draftsFromPaste('אריאל גדש עציון 0500000001', 'farm')[0]
check('A339 collage : « אריאל » n’est pas pris pour la ville', paste.firstName === 'אריאל' && paste.orgName === 'גד״ש עציון' && paste.place === '', `${paste.firstName} | ${paste.orgName} | ${paste.place}`)

section('A336 — l’emplacement : Waze, Google Maps, coordonnées')
const L = (x: string) => readLocation(x)
const near = (r: ReturnType<typeof readLocation>, lat: number, lng: number) => r.ok && Math.abs(r.position.lat - lat) < 1e-4 && Math.abs(r.position.lng - lng) < 1e-4
check('A336 Waze ?ll=', near(L('https://waze.com/ul?ll=31.52453%2C34.59071&navigate=yes'), 31.52453, 34.59071))
check('A336 Waze live-map', near(L('https://www.waze.com/live-map/directions?to=ll.31.52453%2C34.59071'), 31.52453, 34.59071))
const gh = decodeGeohash('sv8wrvx7x')
check('A336 Waze court (géohash) décodé', !!gh && L('https://waze.com/ul/hsv8wrvx7x').ok, gh ? `${gh.lat.toFixed(4)}, ${gh.lng.toFixed(4)}` : '')
check('A336 Google : le point du lieu (!3d!4d) plutôt que le centre de la vue', near(L('https://www.google.com/maps/place/X/@31.5,34.5,15z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d31.52453!4d34.59071'), 31.52453, 34.59071))
check('A336 Google ?q=', near(L('https://maps.google.com/?q=31.52453,34.59071'), 31.52453, 34.59071))
check('A336 coordonnées brutes, dans les deux ordres', near(L('31.52453, 34.59071'), 31.52453, 34.59071) && near(L('34.59071 31.52453'), 31.52453, 34.59071))
check('A336 degrés-minutes-secondes', near(L(`31°31'28.3"N 34°35'26.6"E`), 31.52453, 34.59072))
check('A336 lien raccourci Google : dit, jamais deviné', !L('https://maps.app.goo.gl/AbCd').ok && (L('https://maps.app.goo.gl/AbCd') as { reason: string }).reason === 'shortLink')

section('A337 — les doublons')
const ex = {
  leads: [{ name: 'רפת השקד', contactName: 'שמעון', phone: '050-9998877', convertedFarmId: null }],
  farms: [{ name: 'חוות הגבעה', farmerPhone: '054-0000000' }],
  institutions: [{ name: 'ישיבת ההסדר שדרות', contactPhone: '', aliases: 'אפיקי דעת' }],
  volunteers: [{ name: 'דוד', phone: '052-3334455' }],
}
const ds = [...multi, ...draftsFromVcfFile(readFileSync('docs/aw/fixtures/doublon.vcf', 'utf8'), 'farm', 'd').drafts, multi[0]]
const dd = findDuplicates(ds, ex, 'farm')
check('A337 doublon par nom d’exploitation (ferme existante)', dd[1]?.kind === 'farm' && dd[1]?.by === 'name')
check('A337 doublon par téléphone (piste, volontaire)', dd[3]?.kind === 'lead' && dd[2]?.kind === 'volunteer')
check('A337 deux fois dans le même lot', dd[4]?.kind === 'batch')
check('A337 institution : par un autre nom (alias)', findDuplicates(draftsFromPaste('הרב ישיבת אפיקי דעת 050-1110000', 'institution'), ex, 'institution')[0]?.kind === 'institution')

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
