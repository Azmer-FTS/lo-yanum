import { readFileSync } from 'node:fs'

import * as XLSX from 'xlsx'

import {
  AREA_GAP_THRESHOLD_INITIAL,
  HOME_BASE,
  alignDeclaredToOutline,
  analyseProspection,
  applyProspection,
  areaGap,
  areaGapRatio,
  createFarmZone,
  declaredAreas,
  deleteFarmZone,
  effectiveAreas,
  getFarmZonesForFarm,
  getVisibleFarms,
  guardedDunamsOf,
  hasAreaGap,
  keepDeclaredArea,
  measuredAreas,
  needsOutline,
  prospectionExportMatrix,
  resetStore,
  updateFarmZoneRing,
  weightedDunams,
} from '../src/core/index'
import { _raw } from '../src/core/store'
import type { Farm, LatLng } from '../src/core/index'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A108 … A117 — LES DEUX SURFACES, LA NOTE D'ÉCART ET LA FILE DES TRACÉS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   bun run adpass
 *
 * ★ CE QU'ON DEMANDE ICI EST CE QUE LE PO A TRANCHÉ EN AD1 : deux surfaces
 *   coexistent et ne s'écrasent jamais, dans aucun sens. Le défaut G15 nommé
 *   en AC — « une surface venue d'un polygone ramasse le drapeau à
 *   l'aller-retour et cesse de suivre ses zones » — est A109, et il est posé
 *   dans l'ordre exact où il se produisait : polygone, export, import, puis
 *   REDESSIN.
 *
 *   A108  déclarée et mesurée coexistent ; aucun import ne fige un polygone ;
 *         aucun tracé n'écrase un chiffre déclaré.
 *   A109  redessiner un contour recalcule la mesurée, y compris APRÈS un
 *         aller-retour export/import complet. C'est le défaut G15.
 *   A110  la pondération porte sur la déclarée : 800 / 100 / 220 inchangés.
 *   A111  écart au-dessus du seuil : les deux valeurs, l'écart en dounams et
 *         en pourcentage.
 *   A112  « aligner sur le tracé » et « garder le chiffre » font ce qu'ils
 *         disent ; la note se tait, et elle revient si l'une des deux rechange.
 *   A113  écart sous le seuil, ou une seule surface : aucune note.
 *   A114  seuil modifié : les notes suivent immédiatement.
 *   A115  dans `bun run adui` — la file est un écran.
 *   A116  dans `bun run adcaptures` — c'est une question sur deux rectangles,
 *         posée au déployé.
 *   A117  aucun polygone automatique n'est jamais généré.
 *
 * ★ ET C'EST PUR — pas de navigateur, pas de serveur de développement. Toute
 *   affirmation d'ici est une affirmation sur @core.
 */

const FILE = 'docs/samples/prospection-sud.xlsx'
const SHEET = 'רשימה'

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

console.log('')
console.log('  A108 … A117 — AD1 · AD2 · AD3')
console.log('  =============================')

/** Le classeur du PO, tel que l'assistant le passe : en-têtes + matrice. */
function readSheet(path: string, sheetName: string): { headers: string[]; matrix: string[][] } {
  /* ⚠️ LU EN OCTETS, PAS PAR CHEMIN — le shim `readFile` de SheetJS sous Bun
     n'ouvre pas un chemin contenant une espace, et ce dépôt vit dans un. */
  const book = XLSX.read(readFileSync(path), { type: 'buffer' })
  const sheet = book.Sheets[sheetName]
  if (!sheet) throw new Error(`no sheet ${sheetName} in ${path}`)
  const grid = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })
  const headers = (grid[0] as unknown[]).map((c) => String(c ?? ''))
  const matrix = grid
    .slice(1)
    .map((r) => (r as unknown[]).map((c) => String(c ?? '')))
    .filter((r) => r.some((c) => c.trim() !== ''))
  return { headers, matrix }
}

/**
 * Un carré de `d` degrés au coin donné. Une forme, pas un dessin : ce qui
 * compte est qu'elle ait une aire et qu'on puisse la changer.
 */
function square(lat: number, lng: number, d: number): LatLng[] {
  return [
    { lat, lng },
    { lat: lat + d, lng },
    { lat: lat + d, lng: lng + d },
    { lat, lng: lng + d },
  ]
}

/**
 * Une fiche de fixture NUE : celle du jeu de démonstration, débarrassée de sa
 * surface mesurée.
 *
 * ⚠️ ET C'EST NÉCESSAIRE PARCE QUE CES CAS ÉCRIVENT `_raw().farms` DIRECTEMENT,
 *    ce qui court-circuite le seul écrivain de la mesure (`remeasureFarm`). Une
 *    fiche recopiée telle quelle arriverait avec la mesure d'un polygone qu'on
 *    vient de lui retirer, et les cas « une seule des deux surfaces existe »
 *    n'en seraient pas.
 */
function firstFarm(): Farm {
  const farm = { ...getVisibleFarms()[0] }
  delete farm.measuredFarmDunams
  delete farm.measuredGrazingDunams
  return farm
}

// ---------------------------------------------------------------------------
section('A108 — les deux surfaces coexistent, dans les deux sens')
// ---------------------------------------------------------------------------

/**
 * ★★ LE SENS QUI MANQUAIT : UN TRACÉ N'ÉCRASE PAS UN CHIFFRE DÉCLARÉ.
 *
 * Jusqu'à AD1, `syncZoneDunams` écrivait la somme des anneaux dans le champ de
 * la fiche dès que le drapeau était absent — c'est-à-dire sur toute fiche que
 * personne n'avait saisie à la main. La déclaration d'un fermier survivait
 * donc au premier polygone par ACCIDENT de drapeau, et pas par règle.
 */
{
  resetStore()
  _raw().farms = [
    {
      ...firstFarm(),
      id: 'ad-1',
      name: 'חוות AD1',
      farmDunams: 1200,
      grazingDunams: 0,
      farmDunamsManual: true,
    },
  ]
  _raw().farmZones = []
  const before = declaredAreas(getVisibleFarms()[0])
  check(
    'A108 · a farm with a declared figure and no outline has ONE surface',
    before?.total === 1200 && measuredAreas(getVisibleFarms()[0]) === null,
    `declared=${String(before?.total)} measured=${String(measuredAreas(getVisibleFarms()[0]))}`,
  )
  check(
    'A108 · and that one surface is the one everything reads (AD1.4)',
    effectiveAreas(getVisibleFarms()[0]).total === 1200,
    String(effectiveAreas(getVisibleFarms()[0]).total),
  )

  /* On trace. La déclarée ne doit pas bouger d'un dounam. */
  createFarmZone({ farmId: 'ad-1', kind: 'farm_boundary', ring: square(31.2, 34.7, 0.03) })
  const drawn = getVisibleFarms()[0]
  const measured = measuredAreas(drawn)
  check(
    'A108 · drawing an outline NEVER touches the declared figure',
    drawn.farmDunams === 1200 && drawn.grazingDunams === 0,
    `${drawn.farmDunams} / ${drawn.grazingDunams}`,
  )
  check(
    'A108 · and the outline now carries a measured surface of its own',
    measured !== null && measured.total > 0,
    String(measured?.total),
  )
  check(
    'A108 · the two coexist — neither answer erases the other',
    declaredAreas(drawn)?.total === 1200 && (measured?.total ?? 0) !== 1200,
    `${String(declaredAreas(drawn)?.total)} vs ${String(measured?.total)}`,
  )

  /**
   * ⚠️ ET LE SENS INVERSE : UN IMPORT NE FIGE PAS UN POLYGONE. La fiche
   *    ci-dessous n'a JAMAIS rien déclaré ; sa seule surface vient du contour.
   *    L'export écrit cette surface (AD1.4 — elle sert seule), et c'est
   *    exactement la cellule qui, relue comme une saisie, mettait fin au suivi.
   */
  resetStore()
  _raw().farms = [
    {
      ...firstFarm(),
      id: 'ad-2',
      name: 'חוות AD2',
      locality: 'מקום AD2',
      farmName: 'חוות AD2',
      farmerName: 'חקלאי AD2',
      localityCode: 9101,
      farmDunams: 0,
      grazingDunams: 0,
      farmDunamsManual: undefined,
      grazingDunamsManual: undefined,
    },
  ]
  _raw().farmZones = []
  createFarmZone({ farmId: 'ad-2', kind: 'farm_boundary', ring: square(31.2, 34.7, 0.02) })
  const onlyMeasured = getVisibleFarms()[0]
  check(
    'A108 · a farm whose only surface is its outline declares nothing',
    declaredAreas(onlyMeasured) === null && measuredAreas(onlyMeasured) !== null,
    String(measuredAreas(onlyMeasured)?.total),
  )
  check(
    'A108 · and that measured surface is what serves, alone and with no note',
    effectiveAreas(onlyMeasured).total === (measuredAreas(onlyMeasured)?.total ?? -1) &&
      areaGap(onlyMeasured, AREA_GAP_THRESHOLD_INITIAL) === null,
    String(effectiveAreas(onlyMeasured).total),
  )
}

// ---------------------------------------------------------------------------
section('A109 — le défaut G15 : redessiner après un aller-retour complet')
// ---------------------------------------------------------------------------

/**
 * ★★ L'ORDRE EST LE DÉFAUT LUI-MÊME, ET IL EST JOUÉ EN ENTIER.
 *
 *   1. une fiche dont la surface vient d'un polygone ;
 *   2. l'export du classeur de prospection — il écrit cette surface ;
 *   3. l'import du même fichier, c'est-à-dire un aller-retour complet ;
 *   4. LE REDESSIN — et c'est là que l'ancienne version se taisait.
 *
 * Sous G15, l'étape 3 posait `farmDunamsManual` (« a typed number IS an
 * override ») et l'étape 4 ne changeait plus rien. La surface mesurée n'ayant
 * plus ni colonne, ni cellule, ni drapeau, il n'y a plus rien à figer.
 */
{
  resetStore()
  _raw().farms = [
    {
      ...firstFarm(),
      id: 'ad-3',
      name: 'חוות G15',
      locality: 'מקום G15',
      farmName: 'חוות G15',
      farmerName: 'חקלאי G15',
      localityCode: 9102,
      farmDunams: 0,
      grazingDunams: 0,
      farmDunamsManual: undefined,
      grazingDunamsManual: undefined,
    },
  ]
  _raw().farmZones = []
  const zone = createFarmZone({
    farmId: 'ad-3',
    kind: 'farm_boundary',
    ring: square(31.2, 34.7, 0.02),
  })
  const first = measuredAreas(getVisibleFarms()[0])?.total ?? 0
  check('A109 · step 1 — the outline gives the farm its surface', first > 0, String(first))

  /* 2 — l'export, tel qu'il part chez l'association. */
  const matrix = prospectionExportMatrix(getVisibleFarms())
  const exportHeaders = matrix[0]
  const exportRows = matrix.slice(1)
  const iCult = exportHeaders.findIndex((h) => h.trim() === 'שטח מעובד (דונם)')
  check(
    'A109 · step 2 — the export writes that surface rather than a blank cell',
    Number(exportRows[0][iCult]) === first,
    `${exportRows[0][iCult]} vs ${first}`,
  )

  /* 3 — le retour. */
  const back = analyseProspection(exportHeaders, exportRows, getVisibleFarms())
  applyProspection(back.plan, HOME_BASE)
  const after = getVisibleFarms().find((f) => f.id === 'ad-3')!
  check(
    'A109 · step 3 — the round trip creates nothing and declares nothing',
    getVisibleFarms().length === 1 && declaredAreas(after) === null,
    `${getVisibleFarms().length} farm(s), declared=${String(declaredAreas(after))}`,
  )
  check(
    'A109 · and it sets NO manual flag on the areas — the G15 trap itself',
    after.farmDunamsManual !== true && after.grazingDunamsManual !== true,
    `${String(after.farmDunamsManual)} / ${String(after.grazingDunamsManual)}`,
  )

  /* 4 — LE REDESSIN, après l'aller-retour. */
  updateFarmZoneRing(zone.id, square(31.2, 34.7, 0.04))
  const redrawn = measuredAreas(getVisibleFarms().find((f) => f.id === 'ad-3')!)?.total ?? 0
  check(
    'A109 · step 4 — REDRAWING recomputes the measured surface, after all that',
    redrawn > first * 3,
    `${first} → ${redrawn} dunams`,
  )
  check(
    'A109 · and the farm still has no declaration it never made',
    declaredAreas(getVisibleFarms().find((f) => f.id === 'ad-3')!) === null,
  )

  /* Et effacer le dernier contour rend la fiche à la file, sans mettre zéro. */
  deleteFarmZone(zone.id)
  const bare = getVisibleFarms().find((f) => f.id === 'ad-3')!
  check(
    'A109 · deleting the last polygon leaves NO measured surface, not a zero',
    measuredAreas(bare) === null,
    String(measuredAreas(bare)),
  )
}

// ---------------------------------------------------------------------------
section('A110 — la pondération porte sur la déclarée')
// ---------------------------------------------------------------------------

/**
 * ★ AD1.3 — « le calcul des dounams pondérés s'appuie sur la surface DÉCLARÉE,
 *   c'est elle qui figure au contrat remis à l'État ». Les trois cas d'AA3 et
 *   d'AC3, à un dounam près, avec un contour délibérément absurde à côté.
 */
{
  const cases: Array<[number, number, number]> = [
    [800, 0, 800],
    [0, 5000, 100],
    [200, 1000, 220],
  ]
  const wrong = cases.filter(([farmDunams, grazingDunams, want]) => {
    const bare = weightedDunams({ farmDunams, grazingDunams })
    const withOutline = weightedDunams({
      farmDunams,
      grazingDunams,
      measuredFarmDunams: 999_999,
      measuredGrazingDunams: 999_999,
    })
    return bare !== want || withOutline !== want
  })
  check(
    'A110 · 800 / 100 / 220, whatever the outline says',
    wrong.length === 0,
    wrong.map(([a, b, w]) => `${a}+${b} ≠ ${w}`).join(' · ') || '800 · 100 · 220',
  )
  /* AD1.4 — et quand rien n'est déclaré, la mesurée sert seule, y compris ici. */
  check(
    'A110 · a farm with no declaration is weighted on its outline (AD1.4)',
    weightedDunams({
      farmDunams: 0,
      grazingDunams: 0,
      measuredFarmDunams: 200,
      measuredGrazingDunams: 1000,
    }) === 220,
    String(
      weightedDunams({
        farmDunams: 0,
        grazingDunams: 0,
        measuredFarmDunams: 200,
        measuredGrazingDunams: 1000,
      }),
    ),
  )
  /* AC3.4 — la surface gardée par défaut suit la même lecture, et rien d'autre. */
  check(
    'A110 · and שטחים שמירה still defaults to that same surface',
    guardedDunamsOf({ farmDunams: 800, grazingDunams: 5000 }) === 5800 &&
      guardedDunamsOf({
        farmDunams: 0,
        grazingDunams: 0,
        measuredFarmDunams: 430,
        measuredGrazingDunams: 70,
      }) === 500,
  )
}

// ---------------------------------------------------------------------------
section('A111 · A113 · A114 — la note, son contenu, son silence, son seuil')
// ---------------------------------------------------------------------------

const GAP_FARM = {
  farmDunams: 1200,
  grazingDunams: 0,
  measuredFarmDunams: 800,
  measuredGrazingDunams: 0,
}

{
  const gap = areaGap(GAP_FARM, AREA_GAP_THRESHOLD_INITIAL)
  check(
    'A111 · a 1200/800 holding is over the threshold and has a note',
    gap !== null,
  )
  check(
    'A111 · the note carries BOTH values',
    gap?.declared.total === 1200 && gap?.measured.total === 800,
    `${String(gap?.declared.total)} · ${String(gap?.measured.total)}`,
  )
  check(
    'A111 · the gap in dunams, signed towards the outline',
    gap?.deltaDunams === -400 && gap?.direction === 'short',
    `${String(gap?.deltaDunams)} ${String(gap?.direction)}`,
  )
  /**
   * ⚠️ LE POURCENTAGE EST RAPPORTÉ À LA DÉCLARÉE, et c'est la seule lecture qui
   *    a un sens devant l'État : 400 sur 1200 = 33 %. Rapporté à la mesurée, la
   *    même paire dirait 50 %, et le PO lirait deux chiffres différents pour
   *    une seule divergence selon le sens où on la regarde.
   */
  check(
    'A111 · and the percentage, against the DECLARED figure — 33 %, not 50 %',
    Math.round((gap?.ratio ?? 0) * 100) === 33,
    `${Math.round((gap?.ratio ?? 0) * 100)} %`,
  )

  /* A113 — sous le seuil : rien. */
  check(
    'A113 · a 1200/1150 holding is under the threshold and says nothing',
    areaGap(
      { farmDunams: 1200, grazingDunams: 0, measuredFarmDunams: 1150, measuredGrazingDunams: 0 },
      AREA_GAP_THRESHOLD_INITIAL,
    ) === null,
  )
  check(
    'A113 · a farm with only a declaration says nothing',
    areaGap({ farmDunams: 1200, grazingDunams: 0 }, AREA_GAP_THRESHOLD_INITIAL) === null,
  )
  check(
    'A113 · a farm with only an outline says nothing',
    areaGap(
      { farmDunams: 0, grazingDunams: 0, measuredFarmDunams: 800, measuredGrazingDunams: 0 },
      AREA_GAP_THRESHOLD_INITIAL,
    ) === null,
  )
  check(
    'A113 · and a farm with neither says nothing',
    areaGap({ farmDunams: 0, grazingDunams: 0 }, AREA_GAP_THRESHOLD_INITIAL) === null,
  )

  /**
   * A114 — LE SEUIL EST UN ARGUMENT, PAS UNE LECTURE D'UN RÉGLAGE CACHÉ.
   *
   * C'est ce qui fait que « les notes suivent immédiatement » est vrai par
   * construction plutôt que par un abonnement qu'un écran pourrait oublier :
   * il n'y a aucun état intermédiaire entre le champ des réglages et cette
   * fonction. La même paire, lue à trois seuils, donne trois réponses.
   */
  check(
    'A114 · 33 % is a note at 10 %, a note at 30 %, and silence at 40 %',
    hasAreaGap(GAP_FARM, 0.1) &&
      hasAreaGap(GAP_FARM, 0.3) &&
      !hasAreaGap(GAP_FARM, 0.4),
  )
  check(
    'A114 · the initial threshold is 10 % and it is a named constant',
    AREA_GAP_THRESHOLD_INITIAL === 0.1,
    String(AREA_GAP_THRESHOLD_INITIAL),
  )
  /* AD2.6 — de quoi trier : une proportion, et zéro quand il n'y a rien à dire. */
  check(
    'A114 · the sort key is the ratio, and it is zero when there is no note',
    Math.abs(areaGapRatio(GAP_FARM, 0.1) - 1 / 3) < 1e-9 &&
      areaGapRatio(GAP_FARM, 0.4) === 0,
  )
}

// ---------------------------------------------------------------------------
section('A112 — les deux gestes, et le retour de la note')
// ---------------------------------------------------------------------------

{
  resetStore()
  _raw().farms = [
    {
      ...firstFarm(),
      id: 'ad-4',
      name: 'חוות AD4',
      farmDunams: 1200,
      grazingDunams: 0,
      farmDunamsManual: true,
      areaGapAcceptedDeclared: null,
      areaGapAcceptedMeasured: null,
    },
  ]
  _raw().farmZones = []
  const zone = createFarmZone({
    farmId: 'ad-4',
    kind: 'farm_boundary',
    ring: square(31.2, 34.7, 0.02),
  })
  const measuredNow = measuredAreas(getVisibleFarms()[0])!.total
  check(
    'A112 · the fixture really does diverge before either gesture',
    hasAreaGap(getVisibleFarms()[0], AREA_GAP_THRESHOLD_INITIAL),
    `1200 vs ${measuredNow}`,
  )

  /* « garder le chiffre déclaré » */
  keepDeclaredArea('ad-4')
  const kept = getVisibleFarms()[0]
  check(
    'A112 · « garder le chiffre » leaves BOTH surfaces exactly as they were',
    kept.farmDunams === 1200 && measuredAreas(kept)?.total === measuredNow,
    `${kept.farmDunams} / ${String(measuredAreas(kept)?.total)}`,
  )
  check(
    'A112 · and the note goes quiet for this record',
    !hasAreaGap(kept, AREA_GAP_THRESHOLD_INITIAL),
  )

  /**
   * ⚠️ ET ELLE REVIENT SI L'UNE DES DEUX RECHANGE. C'est la raison pour
   *    laquelle la décision est enregistrée comme une PAIRE et non comme un
   *    booléen : le contour de demain n'est pas celui qu'il a tranché.
   */
  updateFarmZoneRing(zone.id, square(31.2, 34.7, 0.035))
  check(
    'A112 · redrawing the outline brings the note BACK',
    hasAreaGap(getVisibleFarms()[0], AREA_GAP_THRESHOLD_INITIAL),
    `measured ${measuredNow} → ${String(measuredAreas(getVisibleFarms()[0])?.total)}`,
  )
  /* Et un changement du côté DÉCLARÉ la ramène aussi. */
  keepDeclaredArea('ad-4')
  check(
    'A112 · quiet again once he has ruled on the new pair',
    !hasAreaGap(getVisibleFarms()[0], AREA_GAP_THRESHOLD_INITIAL),
  )
  _raw().farms[0] = { ..._raw().farms[0], farmDunams: 4000 }
  check(
    'A112 · and a change on the DECLARED side brings it back too',
    hasAreaGap(getVisibleFarms()[0], AREA_GAP_THRESHOLD_INITIAL),
  )

  /* « aligner sur le tracé » */
  const outline = measuredAreas(getVisibleFarms()[0])!
  alignDeclaredToOutline('ad-4')
  const aligned = getVisibleFarms()[0]
  check(
    'A112 · « aligner sur le tracé » gives the declared figure the measured one',
    aligned.farmDunams === outline.cultivated && aligned.grazingDunams === outline.grazing,
    `${aligned.farmDunams} / ${aligned.grazingDunams} vs ${outline.cultivated} / ${outline.grazing}`,
  )
  check(
    'A112 · the note is quiet because there is no gap left, not because it was muted',
    !hasAreaGap(aligned, AREA_GAP_THRESHOLD_INITIAL) &&
      aligned.areaGapAcceptedDeclared === null,
    String(aligned.areaGapAcceptedDeclared),
  )
  check(
    'A112 · and the outline itself is untouched by the alignment',
    measuredAreas(aligned)?.total === outline.total,
    String(measuredAreas(aligned)?.total),
  )
  /**
   * ⚠️ AD1.5 — ET L'ALIGNEMENT NE POSE PAS LE DRAPEAU SUR UN ZÉRO. Ce contour
   *    n'a pas de zone de pâture : מרעה passe à 0, et un zéro drapeauté serait
   *    une exploitation qui DÉCLARE n'avoir aucun pâturage, ce que personne
   *    n'a dit.
   */
  check(
    'A112 · aligning to an outline with no grazing ring flags no zero',
    aligned.grazingDunams === 0 && aligned.grazingDunamsManual !== true,
    `${aligned.grazingDunams} manual=${String(aligned.grazingDunamsManual)}`,
  )
}

// ---------------------------------------------------------------------------
section('A115 — la file « à contourner », côté @core')
// ---------------------------------------------------------------------------

/**
 * Le compte et le filtre sont une question sur @core ; la vignette, le geste
 * et la place à l'écran sont `bun run adui` et `bun run adcaptures`.
 */
{
  check(
    'A115 · a declared surface with no outline is in the queue',
    needsOutline({ farmDunams: 1200, grazingDunams: 0 }),
  )
  check(
    'A115 · one with an outline is NOT — even a partial one',
    !needsOutline({
      farmDunams: 1200,
      grazingDunams: 0,
      measuredFarmDunams: 800,
    }),
  )
  check(
    'A115 · and neither is one that has never declared anything',
    !needsOutline({ farmDunams: 0, grazingDunams: 0 }),
    'a lead nobody has measured is not a drawing job',
  )

  /* Sur le rôle réel : le classeur du PO, 198 lignes toutes à 0/0. */
  resetStore()
  _raw().farms = []
  const { headers, matrix } = readSheet(FILE, SHEET)
  const plan = analyseProspection(headers, matrix, getVisibleFarms())
  applyProspection(plan.plan, HOME_BASE)
  const roster = getVisibleFarms()
  const queue = roster.filter((f) => needsOutline(f))
  check(
    'A115 · on the product owner’s own 198 rows the queue is exactly the declared ones',
    queue.length === roster.filter((f) => declaredAreas(f) !== null).length,
    `${queue.length} of ${roster.length}`,
  )
  check(
    'A115 · and no imported row has a gap note — none of them has an outline',
    roster.every((f) => !hasAreaGap(f, AREA_GAP_THRESHOLD_INITIAL)),
  )
}

// ---------------------------------------------------------------------------
section('A117 — aucun polygone automatique, jamais')
// ---------------------------------------------------------------------------

/**
 * ★★ « NE PAS GÉNÉRER DE POLYGONE APPROXIMATIF, NI CERCLE NI FORME
 *    AUTOMATIQUE. Un contour faux est pire qu'un contour absent, parce qu'il a
 *    l'air d'être une donnée et que des volontaires s'en serviront pour se
 *    repérer la nuit. »
 *
 * Posé comme une observation sur le magasin après le seul chemin qui pourrait
 * en fabriquer un : un import de 198 lignes portant des surfaces, des
 * coordonnées et des noms.
 */
{
  resetStore()
  _raw().farms = []
  _raw().farmZones = []
  const { headers, matrix } = readSheet(FILE, SHEET)
  const withAreas = matrix.map((r) => [...r])
  const iCult = headers.findIndex((h) => h.trim() === 'שטח מעובד (דונם)')
  const iGraze = headers.findIndex((h) => h.trim() === 'שטח מרעה (דונם)')
  for (const row of withAreas) {
    row[iCult] = '800'
    row[iGraze] = '5000'
  }
  const plan = analyseProspection(headers, withAreas, getVisibleFarms())
  applyProspection(plan.plan, HOME_BASE)
  const roster = getVisibleFarms()
  check(
    'A117 · importing 198 rows WITH areas creates 198 records',
    roster.length === 198,
    `${roster.length} farms`,
  )
  check(
    'A117 · and not ONE polygon — a false outline is worse than none',
    _raw().farmZones.length === 0,
    `${_raw().farmZones.length} zones`,
  )
  check(
    'A117 · so every one of them is in the « to outline » queue, and has no note',
    roster.every((f) => needsOutline(f) && getFarmZonesForFarm(f.id).length === 0),
  )
}

console.log('')
console.log(`  ${passed} passed, ${failed} failed`)
console.log('')
if (failed > 0) process.exit(1)
