import { readFileSync } from 'node:fs'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BI — PORTE PURE.   bun run bipass
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   A498  PAR DÉFAUT, ON MONTRE : le réglage des couches absent, illisible,
 *         d'une forme inconnue ou non booléen montre les formes ; une valeur
 *         d'avant BI a ses couches de formes rallumées (et le dit) ; un choix
 *         fait depuis BI est respecté
 *   A499  le réglage des couches VOYAGE une fois choisi, et une valeur d'avant
 *         BI n'éteint jamais l'autre appareil (la fusion)
 *   A500  le relevé de diagnostic : la phrase nomme la première étape qui casse,
 *         et le texte copié porte les versions, les nombres et les couches
 *   A501  ★ LA SURFACE : la tuile « מדוד » (le magasin) et l'étiquette de la
 *         carte rendent le MÊME nombre pour un même anneau — à la création,
 *         après une retouche — et chaque geste d'édition est écrit
 *   A502  le brouillon d'un tracé non terminé : lu, validé, jamais effacé par
 *         un tracé vide
 *   A503  les branchements : la réactivation AVANT la synchronisation, la
 *         pastille des formes cachées, le relevé de ce que la carte a reçu
 */

/* Un `localStorage` de mémoire, posé AVANT les modules qui le lisent à l'import. */
const mem = new Map<string, string>()
;(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (mem.has(k) ? (mem.get(k) as string) : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size
  },
} as Storage

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

const layers = await import('../src/ui/components/mapLayers')
const sync = await import('../src/ui/settings/sync')
const report = await import('../src/ui/diagnostic/report')
const draftMod = await import('../src/ui/farm/zoneDraft')
const geo = await import('../src/core/geo')
const store = await import('../src/core/store')
const access = await import('../src/core/access')

// ===========================================================================
section('A498 — par défaut, on montre')
{
  const shown = (raw: string | null) => {
    const p = layers.parseMapLayers(raw)
    return p.layers.boundaries === true && p.layers.grazing === true
  }
  check('A498 réglage ABSENT : contours et pâturages montrés', shown(null))
  for (const raw of ['', 'xyz', '[]', 'null', '42', '"false"', '{"boundaries":"false","grazing":0}', '{"boundaries":null}']) {
    check(`A498 réglage ILLISIBLE ou INCONNU ${JSON.stringify(raw)} : montrés`, shown(raw))
  }
  check('A498 une clé inconnue est ignorée, sans rien éteindre', shown('{"__v":2,"zones":false,"shapes":false}'))
  const legacy = layers.parseMapLayers('{"boundaries":false,"grazing":false,"entities":false,"threatZones":true}')
  check('A498 valeur d’AVANT BI qui éteignait les formes : rallumées', legacy.legacy && legacy.layers.boundaries && legacy.layers.grazing)
  check('A498 … et le relevé le dit (les deux couches rallumées nommées)', legacy.restored.join(',') === 'boundaries,grazing')
  check('A498 … les AUTRES couches gardent ce que l’appareil avait choisi', legacy.layers.entities === false && legacy.layers.threatZones === true)
  const chosen = layers.parseMapLayers('{"__v":2,"boundaries":false,"grazing":true}')
  check('A498 un choix fait DEPUIS BI (format 2) est respecté', !chosen.legacy && chosen.layers.boundaries === false && chosen.restored.length === 0)
  const round = layers.parseMapLayers(layers.serializeMapLayers({ ...legacy.layers, posts: false }))
  check('A498 écrit puis relu : identique, au format 2', !round.legacy && round.layers.posts === false && round.layers.boundaries === true)

  /* La réactivation au démarrage, sur un `localStorage` d'appareil réel d'avant BI. */
  mem.clear()
  mem.set(layers.MAP_LAYERS_KEY, '{"boundaries":false,"grazing":false,"regions":true}')
  const migrated = layers.migrateMapLayers()
  const after = layers.parseMapLayers(mem.get(layers.MAP_LAYERS_KEY) ?? null)
  check('A498 au démarrage, la valeur d’avant BI est RÉÉCRITE formes montrées', migrated?.legacy === true && !after.legacy && after.layers.boundaries && after.layers.grazing && after.layers.regions)
  check('A498 … et la carte la lit aussitôt (le cache du module suit)', layers.getMapLayers().boundaries && layers.getMapLayers().grazing)
  check('A498 … la trace est gardée pour le diagnostic', layers.mapLayersMigration()?.restored.join(',') === 'boundaries,grazing')
  check('A498 … une seconde fois, plus rien à faire', layers.migrateMapLayers()?.legacy === false)
  mem.clear()
  check('A498 rien de stocké : aucune réécriture, aucune trace', layers.migrateMapLayers() === null && !mem.has(layers.MAP_LAYERS_MIGRATION_KEY))
}

// ===========================================================================
section('A499 — le réglage voyage une fois choisi')
{
  const K = layers.MAP_LAYERS_KEY
  check('A499 la clé des couches est synchronisée', sync.SYNCED_SETTING_KEYS.includes(K))
  check('A499 … « choisie seulement » (comme le thème)', sync.STAMPED_ONLY_KEYS.has(K))
  check('A499 … et n’est plus listée comme locale', !sync.LOCAL_ONLY_KEYS.some((e) => /(^|[ ,])map-layers(,|$)/.test(e.key)))
  const side = (v: string | null, stamp = 0) => ({ values: { [K]: v }, stamps: stamp ? { [K]: stamp } : {} })
  const old = '{"__v":2,"boundaries":true,"grazing":true,"entities":false}'
  const m1 = sync.mergeSettings(side(old), side(null), 0)
  check('A499 valeur sans instant, compte vide : RIEN ne monte (l’autre appareil n’est pas éteint)', !m1.pushed.includes(K) && m1.remote[K] === undefined)
  const m2 = sync.mergeSettings(side(null), side(old), 0)
  check('A499 appareil sans réglage, compte qui en porte un : il le prend', m2.applied.includes(K) && m2.local.values[K] === old)
  const pick = '{"__v":2,"boundaries":true,"grazing":false}'
  const m3 = sync.mergeSettings(side(pick, 2000), side(old, 1000), 1500)
  check('A499 un choix plus récent ICI monte vers le compte', m3.push && m3.pushed.includes(K) && m3.remote[K] === pick)
  const m4 = sync.mergeSettings(side(old, 1000), side(pick, 2000), 1500)
  check('A499 un choix plus récent AILLEURS est appliqué ici', m4.applied.includes(K) && m4.local.values[K] === pick)
}

// ===========================================================================
section('A500 — le relevé de diagnostic')
{
  const base: import('../src/ui/diagnostic/report').DiagnosticSnapshot = {
    at: 1_760_000_000_000,
    running: { id: 'abc1234', builtAt: '2026-10-15T10:00:00Z' },
    served: { id: 'abc1234', builtAt: '2026-10-15T10:00:00Z' },
    worker: { supported: true, controlled: true },
    standalone: false,
    address: 'https://example.test/app/',
    userAgent: 'Chrome/154',
    screen: '1440×900 @2',
    theme: 'dark',
    ground: 'vector',
    data: { status: 'ready', loadedAt: 1_760_000_000_000, pending: 0, stale: false, message: null },
    memory: { zones: 3, vertices: 77 },
    farm: {
      id: 'farm-x',
      name: 'חוות בדיקה',
      shapes: [
        { id: 'z1', kind: 'farm_boundary', vertices: 31 },
        { id: 'z2', kind: 'grazing_area', vertices: 29 },
      ],
    },
    drawn: [
      { id: 'z1', vertices: 31 },
      { id: 'z2', vertices: 29 },
    ],
    layers: { zonesOff: [], off: [], stamp: 0, migration: null },
    viewAs: null,
    settingsSyncAt: 0,
  }
  const v = report.diagnosticVerdict
  check('A500 tout est dessiné : « ok », 2 sur 2', v(base).code === 'ok' && v(base).drawn === 2 && v(base).shapes === 2)
  check('A500 ★ le cas de l’ordinateur : en mémoire, couches éteintes → « cachées par les couches »', v({ ...base, drawn: [], layers: { ...base.layers, zonesOff: ['boundaries', 'grazing'], off: ['boundaries', 'grazing'] } }).code === 'hidden-by-layers')
  check('A500 un bundle plus vieux que le servi passe AVANT tout le reste', v({ ...base, served: { id: 'def5678', builtAt: '' } }).code === 'stale-bundle')
  check('A500 jamais relu : dit tel quel', v({ ...base, data: { ...base.data!, loadedAt: null } }).code === 'no-data-read')
  check('A500 la ferme n’a aucune forme en mémoire : dit tel quel', v({ ...base, farm: { ...base.farm!, shapes: [] } }).code === 'farm-no-shapes')
  check('A500 en mémoire, couches allumées, mais pas reçues par la carte : dit tel quel', v({ ...base, drawn: [{ id: 'z1', vertices: 31 }] }).code === 'map-missing-shapes')
  check('A500 version.json illisible : n’empêche pas le reste', v({ ...base, served: { error: 'offline' } }).code === 'ok')
  const t = (k: string, o?: Record<string, unknown>) => `${k}${o ? JSON.stringify(o) : ''}`
  const text = report.diagnosticText({ ...base, served: { id: 'def5678', builtAt: '2026-10-14T00:00:00Z' } }, t, (x) => String(x))
  check('A500 le texte copié porte la version QUI TOURNE et la version SERVIE', text.includes('abc1234') && text.includes('def5678'))
  check('A500 … le nombre de zones et de sommets en mémoire', text.includes('"shapes":3') && text.includes('"vertices":77'))
  check('A500 … les formes de la ferme ouverte, sommets compris', text.includes('farm-x') && text.includes('31') && text.includes('29'))
  check('A500 … ce que la carte a reçu, et l’état des couches de formes', text.includes('diagnostic.drawnOf') && text.includes('diagnostic.zoneLayersOn'))
  check('A500 … la dernière relecture réussie', text.includes('diagnostic.rows.lastRead') && text.includes(String(base.data!.loadedAt)))
}

// ===========================================================================
section('A501 — la surface : un seul nombre')
{
  const label = (ring: import('../src/core/types').LatLng[]) => Math.round(geo.ringAreaDunams(ring))
  const ring = (n: number, c: { lat: number; lng: number }, rLat: number, rLng: number) =>
    Array.from({ length: n }, (_, i) => ({ lat: c.lat + rLat * Math.sin((i / n) * 2 * Math.PI), lng: c.lng + rLng * Math.cos((i / n) * 2 * Math.PI) }))
  const farm = store._raw().farms.find((f) => access.getFarmZonesForFarm(f.id).length === 0)!
  const c = farm.position
  const rings = [ring(6, c, 0.0035, 0.0042), ring(31, c, 0.0016, 0.0023), ring(29, c, 0.016, 0.018)]
  for (const r of rings) {
    for (const z of access.getFarmZonesForFarm(farm.id)) store.deleteFarmZone(z.id)
    const made = store.createFarmZone({ farmId: farm.id, kind: 'farm_boundary', ring: r })
    const tile = store._raw().farms.find((f) => f.id === farm.id)?.measuredFarmDunams
    check(`A501 anneau de ${r.length} sommets : tuile « מדוד » ${tile} = étiquette ${label(r)}`, made !== null && tile === label(r))
  }
  /* L'hexagone EXACT du banc BH (`bhui`, la capture A493) : ferme du banc + (0,004 ; 0,005). */
  const { buildFarms } = await import('./aodata')
  const bench = buildFarms().farms.find((f) => f.id === 'farm-ak1-11')!
  const hexa = ring(6, { lat: bench.position.lat + 0.004, lng: bench.position.lng + 0.005 }, 0.0035, 0.0042)
  check('A501 l’hexagone du banc BH fait 403 דונם : le chiffre de la tuile de la capture A493', label(hexa) === 403, String(label(hexa)))
  const z = access.getFarmZonesForFarm(farm.id)[0]
  store.updateFarmZoneRing(z.id, hexa)
  const before = store._raw().farms.find((f) => f.id === farm.id)?.measuredFarmDunams
  const moved = hexa.map((p, i) => (i === 0 ? { lat: p.lat + 0.0004, lng: p.lng - 0.0003 } : p))
  store.updateFarmZoneRing(z.id, moved)
  const tile = store._raw().farms.find((f) => f.id === farm.id)?.measuredFarmDunams
  check(`A501 hexagone écrit : tuile ${before} = 403`, before === 403)
  check(`A501 un sommet tiré, écrit : tuile ${tile} = étiquette ${label(moved)} (la tuile a suivi)`, tile === label(moved) && tile !== 403)
  const g = store.createFarmZone({ farmId: farm.id, kind: 'grazing_area', ring: rings[2] })
  check('A501 le pâturage : même égalité', g !== null && store._raw().farms.find((f) => f.id === farm.id)?.measuredGrazingDunams === label(rings[2]))
  const src = readFileSync('src/ui/components/AnchorMap.tsx', 'utf8')
  const fnBody = (name: string) => {
    const i = src.indexOf(`const ${name} = `)
    return i < 0 ? '' : src.slice(i, i + 400)
  }
  check('A501 ★ chaque GESTE d’édition est écrit (pas seulement « סיום עריכה »)', fnBody('gesture').includes('commitRing(next)'))
  check('A501 … chaque ANNULATION aussi', fnBody('undo').includes('commitRing(next)'))
  check('A501 la barre et l’étiquette lisent la même fonction de surface', (src.match(/ringAreaDunams\(/g) ?? []).length >= 4 && !/turf|area\(/.test(src.replace(/ringAreaDunams\(/g, '')))
}

// ===========================================================================
section('A502 — le brouillon du tracé')
{
  const one = draftMod.parseZoneDrafts(JSON.stringify([{ id: 'd1', zone: 'farm_boundary', draft: [{ lat: 31, lng: 34 }, { lat: 31.1, lng: 34 }], at: 5 }]))
  check('A502 un brouillon valide est lu (id, genre, sommets, instant)', one.length === 1 && one[0].id === 'd1' && one[0].zone === 'farm_boundary' && one[0].draft.length === 2 && one[0].at === 5)
  check('A502 genre inconnu : pas un brouillon', draftMod.parseZoneDrafts('[{"zone":"x","draft":[{"lat":1,"lng":2}]}]').length === 0)
  check('A502 sommets abîmés écartés, les bons gardés', draftMod.parseZoneDrafts('[{"id":"a","zone":"grazing_area","draft":[{"lat":1,"lng":2},{"lat":"a"},null]}]')[0]?.draft.length === 1)
  check('A502 illisible ou vide : rien', draftMod.parseZoneDrafts('{').length === 0 && draftMod.parseZoneDrafts(null).length === 0 && draftMod.parseZoneDrafts('[{"zone":"farm_boundary","draft":[]}]').length === 0)
  mem.clear()
  const thirty = Array.from({ length: 30 }, (_, i) => ({ lat: 31 + i / 1000, lng: 34 }))
  draftMod.writeZoneDraft('farm-a', { id: 'd30', zone: 'farm_boundary', draft: thirty })
  check('A502 trente sommets écrits, trente relus', draftMod.readZoneDrafts('farm-a')[0]?.draft.length === 30)
  draftMod.writeZoneDraft('farm-a', { id: 'd-new', zone: 'grazing_area', draft: [] })
  check('A502 ★ commencer un tracé vide N’EFFACE PAS le brouillon gardé', draftMod.readZoneDrafts('farm-a').length === 1)
  await Bun.sleep(5)
  draftMod.writeZoneDraft('farm-a', { id: 'd-new', zone: 'farm_boundary', draft: thirty.slice(0, 3) })
  const two = draftMod.readZoneDrafts('farm-a')
  check('A502 ★ un SECOND tracé ne remplace pas le premier : deux brouillons, le plus récent d’abord', two.length === 2 && two[0].id === 'd-new' && two[1].draft.length === 30)
  draftMod.writeZoneDraft('farm-a', { id: 'd-new', zone: 'farm_boundary', draft: thirty.slice(0, 4) })
  check('A502 un sommet de plus met à jour SON brouillon, pas un troisième', draftMod.readZoneDrafts('farm-a').length === 2 && draftMod.readZoneDrafts('farm-a')[0].draft.length === 4)
  check('A502 un brouillon par tracé, rangés par ferme : l’autre ferme n’en a pas', draftMod.readZoneDrafts('farm-b').length === 0)
  draftMod.clearZoneDraft('farm-a', 'd-new')
  check('A502 effacer UN brouillon garde l’autre', draftMod.readZoneDrafts('farm-a').map((d) => d.id).join() === 'd30')
  draftMod.clearZoneDraft('farm-a', null)
  check('A502 sans id, rien n’est effacé', draftMod.readZoneDrafts('farm-a').length === 1)
  draftMod.clearZoneDraft('farm-a', 'd30')
  check('A502 seul le geste nommé l’efface ; la clé part avec le dernier', draftMod.readZoneDrafts('farm-a').length === 0 && !mem.has(draftMod.zoneDraftKey('farm-a')))
  check('A502 une valeur d’un seul objet (forme de la première écriture) se lit encore', draftMod.parseZoneDrafts('{"zone":"grazing_area","draft":[{"lat":1,"lng":2}],"at":1}').length === 1)
  const src = readFileSync('src/ui/components/AnchorMap.tsx', 'utf8')
  const clears = (src.match(/clearZoneDraft\(/g) ?? []).length
  check('A502 trois effacements, tous nommés : polygone fermé, dernier sommet retiré, « מחיקת הטיוטה »', clears === 3 && /onZoneCreate\?\.\(drawing\.zone, ring\)[^]{0,200}clearZoneDraft\(farm\.id, draftIdRef\.current\)/.test(src))
  check('A502 aucun bouton de tracé n’est bloqué par un brouillon (on recommence un trait raté)', !/disabled=\{storedDraft/.test(src))
  check('A502 le lien « לתיחום » n’arme pas un tracé neuf par-dessus un brouillon (la bande passe d’abord)', /!existing && readZoneDrafts\(farm\.id\)\.length === 0/.test(src))
  check('A502 la clé est déclarée locale dans la liste des réglages', sync.LOCAL_ONLY_KEYS.some((e) => e.key.includes('zone-draft')))
}

// ===========================================================================
section('A503 — les branchements')
{
  const main = readFileSync('src/main.tsx', 'utf8')
  const mig = main.indexOf('migrateMapLayers()')
  check('A503 la réactivation part AVANT la synchronisation des réglages', mig > 0 && mig < main.indexOf('sync.startSettingsSync('))
  const canvas = readFileSync('src/ui/components/MapCanvas.tsx', 'utf8')
  check('A503 une forme cachée par une couche se voit (pastille `map-hidden-zones`)', canvas.includes('data-testid="map-hidden-zones"') && /setMapLayers\(\{ boundaries: true, grazing: true \}\)/.test(canvas))
  check('A503 la carte inscrit ce qu’elle reçoit (`recordDrawnZones`) et l’efface en partant', (canvas.match(/recordDrawnZones\(/g) ?? []).length === 2)
  const hooks = readFileSync('src/ui/settings/appliedHooks.ts', 'utf8')
  check('A503 une valeur arrivée d’un autre appareil est relue sans rechargement', hooks.includes('reloadMapLayers()'))
  const legend = readFileSync('src/ui/components/MapLegend.tsx', 'utf8')
  check('A503 la légende ne prétend plus une synchronisation qui n’existait pas', !/synchronisé\s*\n?\s*\*?\s*avec le compte comme les autres réglages d'écran/.test(legend) && legend.includes('DeviceDiagnosticButton'))
}

console.log(`\n  ${passed} PASS, ${failed} FAIL`)
process.exit(failed === 0 ? 0 : 1)
