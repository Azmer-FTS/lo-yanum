/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AN — LES RÈGLES DU DOMAINE, SANS NAVIGATEUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run anpass
 *
 *   A224  aucun numéro de contact inventé dans la configuration ; la carte du
 *         coordinateur rend un téléphone VIDE plutôt qu'un faux.
 *   A225  une fiche sans position n'a pas de point (`farmPoint`), n'entre pas
 *         dans un trajet (`planRoute`, `buildDayPlan`), n'invente pas de région.
 *   A232  les מועצות אזוריות du למ״ס, et leur déduction depuis le יישוב ou
 *         l'épingle ; toute localité réelle tombe dans une région.
 */
import { readFileSync } from 'node:fs'

import { COORDINATOR, EMERGENCY_NUMBERS } from '../src/core/config'
import {
  COUNCIL_NEAR_KM,
  REGIONAL_COUNCILS,
  councilOfCode,
  matchCouncil,
  suggestCouncil,
  suggestRegion,
} from '../src/core/councils'
import { HOME_BASE, farmPoint } from '../src/core/geo'
import { LOCALITIES, findLocality } from '../src/core/gazetteer'
import { farmRegion, regionOf } from '../src/core/regions'
import { planRoute } from '../src/core/routing'
import { buildDayPlan } from '../src/core/tours'
import type { Farm } from '../src/core/types'

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
section('A224 — aucun numéro inventé')
// ---------------------------------------------------------------------------
check('la carte par défaut du coordinateur n\'a pas de téléphone', COORDINATOR.phone === '', JSON.stringify(COORDINATOR.phone))
check('aucun numéro d\'urgence en 0000', EMERGENCY_NUMBERS.every((n) => !/0000/.test(n.number)), EMERGENCY_NUMBERS.map((n) => n.number).join(' '))
{
  const store = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  }
  const { readCoordinator, writeCoordinator } = await import('../src/core/profile')
  check('rien d\'enregistré → téléphone vide', readCoordinator().phone === '')
  writeCoordinator({ name: 'דובי', phone: '052-9876543', role: 'רכז' })
  check('un numéro enregistré revient tel quel', readCoordinator().phone === '052-9876543')
  writeCoordinator({ name: 'דובי', phone: '', role: 'רכז' })
  check('un numéro effacé reste effacé (pas de repli)', readCoordinator().phone === '')
}
{
  /* Le CODE, pas les commentaires (qui racontent l'ancien numéro). */
  const code = (readFileSync('src/core/config.ts', 'utf8') + readFileSync('src/core/profile.ts', 'utf8'))
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
  check('ni 052-0000049 ni 08-0000050 dans le code', !/0000049|0000050/.test(code))
}

// ---------------------------------------------------------------------------
section('A225 — une fiche sans position n\'a pas de point')
// ---------------------------------------------------------------------------
const farm = (id: string, lat: number, lng: number, missing = false): Farm =>
  ({
    id,
    name: id,
    locality: '',
    region: '',
    type: 'agriculture',
    entityKind: 'farm',
    status: 'active',
    position: { lat, lng },
    positionMissing: missing ? true : undefined,
    farmDunams: 0,
    grazingDunams: 0,
    contacts: [],
    commitments: [],
    livestock: [],
    agreements: [],
    notes: '',
    photo: null,
    lastVisitAt: null,
    nextVisitAt: null,
  }) as unknown as Farm
const a = farm('a', 31.4, 34.8)
const b = farm('b', 31.5, 34.9)
const lost = farm('משק שלם', HOME_BASE.lat, HOME_BASE.lng, true)
check('farmPoint : une ferme placée a son point', farmPoint(a)?.lat === 31.4)
check('farmPoint : une ferme sans position n\'en a pas (jamais Jérusalem)', farmPoint(lost) === null)
const route = planRoute([a, lost, b], { lat: 31.25, lng: 34.79 })
check('planRoute : la ferme sans position n\'est pas une étape', route.stops.every((s) => s.farm.id !== lost.id), route.stops.map((s) => s.farm.id).join(','))
check('planRoute : … elle est rendue à part, toujours choisie', route.unplaced.length === 1 && route.unplaced[0].id === lost.id)
/* Beer-Sheva → a → b → Beer-Sheva ≈ 61 km ; passer par Jérusalem en ferait ~200. */
check('planRoute : aucune distance ne passe par Jérusalem', route.roundTripKm < 100, `${route.roundTripKm.toFixed(1)} km`)
const day = buildDayPlan({
  dayKey: '2026-09-17',
  tour: { id: 't', dayKey: '2026-09-17', departAt: '2026-09-17T05:00:00.000Z', farmIds: ['a', 'משק שלם', 'b'] },
  farms: [a, lost, b],
  events: [],
  origin: { lat: 31.25, lng: 34.79 },
})
check('buildDayPlan : pas d\'étape horaire pour elle', day.stops.every((s) => s.farm.id !== lost.id) && day.unplaced.length === 1)
check('buildDayPlan : pas de lien de navigation vers le repli', !(day.mapsUrl ?? '').includes('31.768300'))
check('farmRegion : le point de repli ne décide d\'aucune région', farmRegion(lost) === null, String(farmRegion(lost)))

// ---------------------------------------------------------------------------
section('A232 — les מועצות אזוריות, et la région, depuis l\'adresse')
// ---------------------------------------------------------------------------
check('54 conseils régionaux (למ״ס 2021)', REGIONAL_COUNCILS.length === 54, String(REGIONAL_COUNCILS.length))
check('רמת נגב, שדות נגב, לכיש, בני שמעון, מרחבים y sont', ['רמת נגב', 'שדות נגב', 'לכיש', 'בני שמעון', 'מרחבים'].every((c) => REGIONAL_COUNCILS.includes(c)))
check('נבטים (396) → בני שמעון', councilOfCode(396) === 'בני שמעון', String(councilOfCode(396)))
check('une ville (באר שבע) n\'a pas de מועצה אזורית', councilOfCode(findLocality('באר שבע')?.code) === null)
check('« מ.א. רמת נגב » et « מועצה אזורית רמת נגב » → רמת נגב', matchCouncil('מ.א. רמת נגב') === 'רמת נגב' && matchCouncil('מועצה אזורית רמת נגב') === 'רמת נגב')
check('un texte hors liste ne se range pas', matchCouncil('מועצה אזורית בדויה') === null)
const fromYishuv = suggestCouncil({ locality: 'נבטים', position: null })
check('depuis le יישוב', fromYishuv?.value === 'בני שמעון' && fromYishuv.source === 'locality', JSON.stringify(fromYishuv))
const fromPin = suggestCouncil({ locality: '', position: { lat: 31.215, lng: 34.87 } })
check(`depuis l'épingle (localité à moins de ${COUNCIL_NEAR_KM} km)`, fromPin?.value === 'בני שמעון' && fromPin.source === 'position', JSON.stringify(fromPin))
check('une épingle en mer ne propose rien', suggestCouncil({ locality: '', position: { lat: 32.0, lng: 34.4 } }) === null)
check('région depuis l\'épingle', suggestRegion({ locality: '', position: { lat: 31.215, lng: 34.87 } })?.value === 'negev')
check('région depuis le יישוב seul', suggestRegion({ locality: 'נבטים', position: null })?.value === 'negev')
{
  const none = LOCALITIES.filter((l) => regionOf(l.position) === null)
  check(`les ${LOCALITIES.length} localités tombent toutes dans une région (ערד, כרם שלום, סדום étaient dehors)`, none.length === 0, none.map((l) => l.name).join(' | '))
  check('la mer, Amman, le Sinaï restent sans région', [regionOf({ lat: 32.0, lng: 34.5 }), regionOf({ lat: 31.95, lng: 35.93 }), regionOf({ lat: 30.6, lng: 34.0 })].every((r) => r === null))
}

console.log(`\n  ${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
