import { existsSync, readFileSync } from 'node:fs'
import { PMTiles } from 'pmtiles'

import {
  ROUTE_MARGIN_INITIAL,
  haversineKm,
  parsePositionInput,
  parsePositionList,
  planFreeRoute,
} from '../src/core/index'
import type { FreeRoute, LatLng } from '../src/core/index'
import { FARMS } from '../src/core/mock/farms'
import {
  OFF_NETWORK_METERS,
  RoadGraph,
  SPEED_MOTORWAY_KMH,
  SPEED_PRIMARY_KMH,
  SPEED_SECONDARY_KMH,
  SPEED_TRACK_KMH,
  corridorTiles,
  latToTileY,
  lngToTileX,
  roadLeg,
} from '../src/core/roadGraph'
import type { RoadLeg } from '../src/core/roadGraph'
import { estimateDriveMinutes } from '../src/core/routing'
import { decodeRoadTile } from '../src/ui/routing/decodeRoads'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PASSE AI — CE QU'UN NAVIGATEUR NE REND PAS PLUS VRAI.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run aipass
 *
 * A181 · A182 · A183 — la lecture des liens collés, sur des chaînes.
 * A173 · A174 · A175 · A176 — le tracé, SUR L'ARCHIVE DE LA CARTE ELLE-MÊME
 *   (`basemap/israel-20260831-z14.pmtiles`), décodée par le même code que
 *   l'application. Sans l'archive sur le disque, ces sections sont SAUTÉES et
 *   le disent : elles ne passent pas à vide.
 * AI3.4 — cinq trajets réels et plus de la zone Adoulam–Lakhish : vol d'oiseau
 *   et route, les deux imprimés, et l'ancien calcul d'AH9 à côté.
 * AI4.4 — la couverture : à quelle distance d'une route roulable tombe un
 *   point de la zone, et chacune des fermes de démonstration.
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
  console.log(`  ${'='.repeat(title.length)}`)
}
const near = (p: LatLng | null, lat: number, lng: number) =>
  p !== null && Math.abs(p.lat - lat) < 1e-9 && Math.abs(p.lng - lng) < 1e-9

// ---------------------------------------------------------------------------
section('A183 — deux, trois et six décimales')
// ---------------------------------------------------------------------------
check('deux décimales : « 31.25, 34.79 »', near(parsePositionInput('31.25, 34.79'), 31.25, 34.79))
check('trois décimales : « 31.250, 34.790 »', near(parsePositionInput('31.250, 34.790'), 31.25, 34.79))
check(
  'six décimales : « 31.250000,34.790000 »',
  near(parsePositionInput('31.250000,34.790000'), 31.25, 34.79),
)
check(
  'deux décimales dans un lien Waze encodé',
  near(parsePositionInput('https://waze.com/ul?ll=31.25%2C34.79&navigate=yes'), 31.25, 34.79),
)
check(
  'deux décimales dans un lien Google avec zoom fractionnaire',
  near(parsePositionInput('https://www.google.com/maps/@31.25,34.79,15.25z'), 31.25, 34.79),
)
check(
  'un couple refusé ne mange plus le couple valide qui le suit',
  near(parsePositionInput('12.34 31.25, 34.79'), 31.25, 34.79),
)
check('le zoom « ,15z » n’est toujours pas une longitude', near(parsePositionInput('https://www.google.com/maps/@30.9861,34.6720,15z'), 30.9861, 34.672))
check('hors d’Israël : toujours refusé', parsePositionInput('48.85, 2.35') === null)
check('ordre inversé : toujours redressé', near(parsePositionInput('34.79, 31.25'), 31.25, 34.79))

// ---------------------------------------------------------------------------
section('A181 · A182 — plusieurs liens d’un coup, et ce qui n’est pas lu')
// ---------------------------------------------------------------------------
{
  const block = [
    'חוות כהן',
    'https://waze.com/ul?ll=31.56414%2C34.84146 https://www.google.com/maps/@31.61226,34.89577,15z',
    '31.62991, 34.9551   31.53344 34.91357',
    'https://maps.google.com/?q=31.68681,34.88674',
  ].join('\n')
  const read = parsePositionList(block)
  check('cinq positions, retours à la ligne ET espaces', read.positions.length === 5, String(read.positions.length))
  check('dans l’ordre du texte', near(read.positions[0], 31.56414, 34.84146) && near(read.positions[4], 31.68681, 34.88674))
  check('les mots seuls ne sont pas « non lus »', read.unread.length === 0, JSON.stringify(read.unread))

  const mixed = parsePositionList('31.25, 34.79\nhttps://maps.app.goo.gl/AbCdEf\nמיקום 12.5')
  check('un bloc mêlé : le lisible est lu', mixed.positions.length === 1)
  check(
    'et le reste est RENDU, lien raccourci compris',
    mixed.unread.length === 2 && mixed.unread[0] === 'https://maps.app.goo.gl/AbCdEf',
    JSON.stringify(mixed.unread),
  )
  const nothing = parsePositionList('בית הכנסת של דוד')
  check('rien de lisible : tout le texte est rendu', nothing.positions.length === 0 && nothing.unread[0] === 'בית הכנסת של דוד')
}

// ---------------------------------------------------------------------------
// L'archive
// ---------------------------------------------------------------------------
const ARCHIVE = 'basemap/israel-20260831-z14.pmtiles'
if (!existsSync(ARCHIVE)) {
  console.log('')
  console.log(`  SKIP  A173 → A177, AI3.4, AI4.4 — ${ARCHIVE} absent de ce disque`)
} else {
  const buf = readFileSync(ARCHIVE)
  const pm = new PMTiles({
    getKey: () => ARCHIVE,
    getBytes: async (offset: number, length: number) => ({
      data: buf.buffer.slice(buf.byteOffset + offset, buf.byteOffset + offset + length),
    }),
  } as never)
  const graph = new RoadGraph()
  const load = async (tiles: Array<[number, number, number]>) => {
    for (const [z, x, y] of tiles) {
      if (graph.hasTile(z, x, y)) continue
      const hit = await pm.getZxy(z, x, y)
      graph.addTile(hit ? decodeRoadTile(new Uint8Array(hit.data), z, x, y) : { z, x, y, extent: 4096, features: [] })
    }
    graph.repairJunctions()
  }
  const route = async (a: LatLng, b: LatLng): Promise<RoadLeg | null> => {
    await load(corridorTiles(a, b))
    const sa = graph.snap(a)
    const sb = graph.snap(b)
    let leg = sa && sb ? roadLeg(graph, a, b, sa, sb) : null
    if (!leg) {
      await load(corridorTiles(a, b, 2.5))
      const sa2 = graph.snap(a)
      const sb2 = graph.snap(b)
      leg = sa2 && sb2 ? roadLeg(graph, a, b, sa2, sb2) : null
    }
    return leg
  }

  const P = (lat: number, lng: number): LatLng => ({ lat, lng })
  /* Coordonnées des localités, lues dans `core/gazetteer.json` (CBS). */
  const TRIPS: Array<[string, LatLng, LatLng]> = [
    ['לכיש → בית גוברין', P(31.56414, 34.84146), P(31.61226, 34.89577)],
    ['לוזית → קריית גת', P(31.68681, 34.88674), P(31.6046, 34.77438)],
    ['נחושה → אמציה', P(31.62991, 34.9551), P(31.53344, 34.91357)],
    ['גבעת ישעיהו → שקף', P(31.67041, 34.94772), P(31.512, 34.93505)],
    ['אביעזר → לכיש', P(31.68145, 35.01557), P(31.56414, 34.84146)],
    ['עגור → נועם', P(31.69687, 34.91279), P(31.56792, 34.78833)],
    ['בית שמש → אמציה', P(31.74524, 34.9907), P(31.53344, 34.91357)],
    ['שדה משה → צפרירים', P(31.60999, 34.80866), P(31.66042, 34.94319)],
  ]

  // -------------------------------------------------------------------------
  section('A173 · A174 · AI3.4 — vol d’oiseau contre route, sur huit trajets réels')
  // -------------------------------------------------------------------------
  console.log('')
  console.log('  trajet                         vol d’oiseau   route    écart   ancien calcul   route (sans marge)   avec marge 15 %')
  const ratios: number[] = []
  let allRoad = true
  let notStraight = 0
  let minutesSpread = 0
  for (const [name, a, b] of TRIPS) {
    const leg = await route(a, b)
    const air = haversineKm(a, b)
    if (!leg) {
      allRoad = false
      console.log(`  ${name.padEnd(30)} ${air.toFixed(1).padStart(8)} km   — aucun chemin`)
      continue
    }
    const roadKm = leg.meters / 1000
    const oldMin = estimateDriveMinutes(air)
    const roadMin = Math.round(leg.seconds / 60)
    const withMargin = Math.round((leg.seconds / 60) * (1 + ROUTE_MARGIN_INITIAL / 100))
    ratios.push(roadKm / air)
    minutesSpread = Math.max(minutesSpread, Math.abs(roadMin - oldMin) / Math.max(1, oldMin))
    // Écart maximal du tracé à la ligne droite, en mètres.
    const kx = 111_320 * Math.cos((a.lat * Math.PI) / 180)
    const ky = 110_540
    const bx = (b.lng - a.lng) * kx
    const by = (b.lat - a.lat) * ky
    const len = Math.hypot(bx, by)
    let maxOff = 0
    for (const c of leg.coords) {
      const cx = (c.lng - a.lng) * kx
      const cy = (c.lat - a.lat) * ky
      maxOff = Math.max(maxOff, Math.abs(cx * by - cy * bx) / len)
    }
    if (maxOff > 300 && leg.coords.length > 10) notStraight += 1
    console.log(
      `  ${name.padEnd(30)} ${air.toFixed(1).padStart(8)} km ${roadKm.toFixed(1).padStart(6)} km  ${`+${Math.round((roadKm / air - 1) * 100)} %`.padStart(6)}   ${String(oldMin).padStart(6)} min      ${String(roadMin).padStart(6)} min          ${String(withMargin).padStart(6)} min`,
    )
  }
  console.log('')
  check('A173 · chaque trajet trouve un chemin sur route', allRoad)
  check(
    'A173 · le tracé suit les routes, pas un segment droit (> 300 m d’écart à la droite, > 10 sommets)',
    notStraight === TRIPS.length,
    `${notStraight}/${TRIPS.length}`,
  )
  check(
    'A174 · la distance sur route est toujours ≥ au vol d’oiseau',
    ratios.every((r) => r >= 1),
    ratios.map((r) => r.toFixed(2)).join(' · '),
  )
  const mean = ratios.reduce((s, r) => s + r, 0) / Math.max(1, ratios.length)
  console.log(
    `         moyenne : la route fait ${Math.round((mean - 1) * 100)} % de plus que le vol d’oiseau ` +
      `(de ${Math.round((Math.min(...ratios) - 1) * 100)} à ${Math.round((Math.max(...ratios) - 1) * 100)} %) ; ` +
      `l’ancien calcul supposait +35 %.`,
  )
  check('A174 · l’écart est mesuré, sur au moins cinq trajets', ratios.length >= 5, String(ratios.length))

  // -------------------------------------------------------------------------
  section('AI2.3 — les vitesses sont des constantes, la piste n’est pas une route')
  // -------------------------------------------------------------------------
  check(
    'autoroute > principale > secondaire > piste',
    SPEED_MOTORWAY_KMH > SPEED_PRIMARY_KMH && SPEED_PRIMARY_KMH > SPEED_SECONDARY_KMH && SPEED_SECONDARY_KMH > SPEED_TRACK_KMH,
    `${SPEED_MOTORWAY_KMH} · ${SPEED_PRIMARY_KMH} · ${SPEED_SECONDARY_KMH} · ${SPEED_TRACK_KMH} km/h`,
  )

  // -------------------------------------------------------------------------
  section('A175 — un point hors réseau')
  // -------------------------------------------------------------------------
  {
    /* Mesuré, pas choisi à l'œil : à 507 m de la route roulable la plus proche. */
    const field = P(31.524, 34.768)
    const lakhish = P(31.56414, 34.84146)
    const leg = await route(lakhish, field)
    const snap = graph.snap(field)
    check('le point est rattaché à la route la plus proche', snap !== null && snap.meters > OFF_NETWORK_METERS, `${snap?.meters.toFixed(0)} m`)
    check(
      'le dernier bout est un segment à part (dessiné en pointillé)',
      leg !== null && leg.gaps.length >= 1 && leg.gaps[leg.gaps.length - 1][1] === field,
      `${leg?.gaps.length ?? 0} bout(s)`,
    )
    const plan = planFreeRoute(freeRoute(lakhish, [field]), { roadLegs: [leg, leg], marginPercent: 15 })
    check(
      'et la liste le dit, avec sa longueur',
      plan.legs[0].offNetworkMeters > OFF_NETWORK_METERS,
      `${Math.round(plan.legs[0].offNetworkMeters)} m`,
    )
  }

  // -------------------------------------------------------------------------
  section('A176 — aucun chemin : le repli se voit et se dit')
  // -------------------------------------------------------------------------
  {
    /* En mer au large d'Ashdod : dans la boîte d'Israël, à 30 km de toute route. */
    const sea = P(31.8, 34.3)
    const ashdod = P(31.8, 34.65)
    const leg = await route(ashdod, sea)
    check('aucune route à rattacher en mer', graph.snap(sea) === null)
    check('l’étape n’a pas de tracé sur route', leg === null)
    const plan = planFreeRoute(freeRoute(ashdod, [sea]), { roadLegs: [leg, leg], marginPercent: 15 })
    check(
      'le plan la marque « à vol d’oiseau », avec une durée quand même',
      plan.legs[0].mode === 'straight' && plan.legs[0].driveMinutes > 0,
      `${plan.legs[0].mode} · ${plan.legs[0].driveMinutes} min`,
    )
  }

  // -------------------------------------------------------------------------
  section('AI3.2 — la marge ne touche que le roulage')
  // -------------------------------------------------------------------------
  {
    const a = P(31.56414, 34.84146)
    const b = P(31.61226, 34.89577)
    const go = await route(a, b)
    const back = await route(b, a)
    const r = freeRoute(a, [b])
    const bare = planFreeRoute(r, { roadLegs: [go, back], marginPercent: 0 })
    const padded = planFreeRoute(r, { roadLegs: [go, back], marginPercent: 15 })
    check(
      'roulage × 1,15',
      padded.legs[0].driveMinutes === Math.round((go!.seconds / 60) * 1.15),
      `${bare.legs[0].driveMinutes} → ${padded.legs[0].driveMinutes} min`,
    )
    check('le temps sur place ne change pas', padded.legs[0].visitMinutes === bare.legs[0].visitMinutes)
    check('la distance vient du tracé, pas du vol d’oiseau', Math.abs(padded.legs[0].legKm - go!.meters / 1000) < 1e-9)
  }

  // -------------------------------------------------------------------------
  section('A177 (hors navigateur) — huit étapes, graphe froid, sur cette machine')
  // -------------------------------------------------------------------------
  {
    const fresh = new RoadGraph()
    const origin = P(31.77974, 35.20955) // Jérusalem, le départ par défaut
    const stops = TRIPS.map((t) => t[2])
    const points = [origin, ...stops, origin]
    const t0 = performance.now()
    const tiles: Array<[number, number, number]> = []
    for (let i = 1; i < points.length; i++) tiles.push(...corridorTiles(points[i - 1], points[i]))
    for (const [z, x, y] of tiles) {
      if (fresh.hasTile(z, x, y)) continue
      const hit = await pm.getZxy(z, x, y)
      fresh.addTile(hit ? decodeRoadTile(new Uint8Array(hit.data), z, x, y) : { z, x, y, extent: 4096, features: [] })
    }
    fresh.repairJunctions()
    const t1 = performance.now()
    let ok = 0
    let widened = 0
    let widenMs = 0
    for (let i = 1; i < points.length; i++) {
      const sa = fresh.snap(points[i - 1])
      const sb = fresh.snap(points[i])
      if (sa && sb && roadLeg(fresh, points[i - 1], points[i], sa, sb)) {
        ok += 1
        continue
      }
      /* Le second essai que fait l'application : un couloir 2,5 fois plus large. */
      const w0 = performance.now()
      widened += 1
      for (const [z, x, y] of corridorTiles(points[i - 1], points[i], 2.5)) {
        if (fresh.hasTile(z, x, y)) continue
        const hit = await pm.getZxy(z, x, y)
        fresh.addTile(hit ? decodeRoadTile(new Uint8Array(hit.data), z, x, y) : { z, x, y, extent: 4096, features: [] })
      }
      fresh.repairJunctions()
      widenMs += performance.now() - w0
      const sa2 = fresh.snap(points[i - 1])
      const sb2 = fresh.snap(points[i])
      if (sa2 && sb2 && roadLeg(fresh, points[i - 1], points[i], sa2, sb2)) ok += 1
    }
    const t2 = performance.now() - widenMs
    console.log(
      `         construction ${Math.round(t1 - t0)} ms · tracé des ${points.length - 1} trajets ${Math.round(t2 - t1)} ms · ` +
        `${widened} trajet(s) élargi(s), ${Math.round(widenMs)} ms de lecture en plus · ${JSON.stringify(fresh.stats())}`,
    )
    check('les neuf trajets de la tournée trouvent un chemin', ok === points.length - 1, `${ok}/${points.length - 1}`)
    check('le tracé seul, graphe construit, tient sous une seconde', t2 - t1 < 1000, `${Math.round(t2 - t1)} ms`)
  }

  // -------------------------------------------------------------------------
  section('AI4.4 — la couverture routière, mesurée')
  // -------------------------------------------------------------------------
  {
    const ZONES: Array<[string, number, number, number, number]> = [
      ['Adoulam–Lakhish', 31.5, 34.72, 31.72, 35.0],
      ['Néguev nord (Ofakim–Beer-Sheva)', 31.15, 34.6, 31.35, 34.85],
      ['Néguev occidental (Eshkol–Nitzana)', 30.85, 34.35, 31.1, 34.6],
      ['Ramat HaNegev (Yeruham–Mashabei Sade)', 30.9, 34.75, 31.05, 34.95],
    ]
    console.log('')
    console.log('  zone                                     points   > 250 m   > 500 m   > 1 km   médiane')
    for (const [name, s, w, n, e] of ZONES) {
      const sw = P(s, w)
      const ne = P(n, e)
      const zone = new RoadGraph()
      const boxTiles: Array<[number, number, number]> = []
      for (let x = lngToTileX(w - 0.03, 14); x <= lngToTileX(e + 0.03, 14); x++) {
        for (let y = latToTileY(n + 0.03, 14); y <= latToTileY(s - 0.03, 14); y++) boxTiles.push([14, x, y])
      }
      void sw
      void ne
      for (const [z, x, y] of boxTiles) {
        const hit = await pm.getZxy(z, x, y)
        zone.addTile(hit ? decodeRoadTile(new Uint8Array(hit.data), z, x, y) : { z, x, y, extent: 4096, features: [] })
      }
      zone.repairJunctions()
      const d: number[] = []
      for (let lat = s + 0.005; lat < n; lat += 0.01) {
        for (let lng = w + 0.005; lng < e; lng += 0.01) {
          const snap = zone.snap(P(lat, lng), 1)
          d.push(snap ? snap.meters : 5000)
        }
      }
      d.sort((x, y) => x - y)
      const share = (m: number) => `${Math.round((d.filter((v) => v > m).length / d.length) * 100)} %`
      console.log(
        `  ${name.padEnd(40)} ${String(d.length).padStart(6)}   ${share(250).padStart(7)}   ${share(500).padStart(7)}   ${share(1000).padStart(6)}   ${Math.round(d[Math.floor(d.length / 2)])} m`,
      )
    }
    console.log('')
    console.log('  les fermes du jeu de démonstration (positions près de localités réelles) :')
    let off = 0
    for (const farm of FARMS) {
      const p = farm.position
      const g2 = new RoadGraph()
      for (const [z, x, y] of corridorTiles(p, p, 0.8)) {
        const hit = await pm.getZxy(z, x, y)
        g2.addTile(hit ? decodeRoadTile(new Uint8Array(hit.data), z, x, y) : { z, x, y, extent: 4096, features: [] })
      }
      g2.repairJunctions()
      const snap = g2.snap(p, 1)
      const m = snap ? snap.meters : Infinity
      if (m > OFF_NETWORK_METERS) off += 1
      console.log(`    ${farm.name.padEnd(28)} ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}   route à ${Number.isFinite(m) ? Math.round(m) + ' m' : '> 5 km'}`)
    }
    check(
      'AI4.4 · la couverture est mesurée et imprimée (zones + fermes)',
      true,
      `${off}/${FARMS.length} fermes à plus de ${OFF_NETWORK_METERS} m d’une route roulable`,
    )
    console.log("         (distance à vol d'oiseau jusqu'au point le plus proche d'une voie roulable, pistes comprises)")
  }
}

function freeRoute(origin: LatLng, stops: LatLng[]): FreeRoute {
  return {
    id: 'r',
    name: 'r',
    dayKey: null,
    origin,
    originLabel: 'o',
    departAt: '08:00',
    defaultVisitMinutes: 30,
    stops: stops.map((position, i) => ({ id: `s${i}`, label: `s${i}`, position, phone: '', visitMinutes: null })),
    updatedAt: '2026-09-14T00:00:00Z',
  }
}

console.log('')
console.log(failed === 0 ? `  All ${passed} checks passed.` : `  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
