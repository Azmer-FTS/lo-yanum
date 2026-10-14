import { NOT_FARMS, farmPin, useContextMarkers } from '../../components/placeMarkers'
import { StatusLegend } from '../../components/StatusLegend'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import {
  ALL_FARM_STATUSES,
  areaGapRatio,
  effectiveAreas,
  hasAreaGap,
  needsOutline,
  entityKindOf,
  weightedDunams,
  totalWeightedDunams,
  farmCoverage,
  farmRegion,
  regionById,
  formatDate,
  getAllVisibleAnchorPoints,
  getAllVisibleFarmZones,
  getVisibleFarms,
  getVisibleThreatVectors,
  getVisibleThreatZones,
  totalHeads,
  looseMatch,
  /* ★★ AG5.2 — la troisième file. */
  dayKeyOf,
  farmsToRenew,
  awaitingDocuments,
  getArchivedFarms,
  now,
  incomingFirst,
  isIncoming,
  formatRelative,
  requestForFarm,
  isTestId,
  /* ★★ BA — le rang 1 sous le nom, « טרם נוצר קשר ». */
  isContactEstablished,
  farmPersonName,
  farmPersonPhone,
  FARM_BRANCHES,
  branchCounts,
  matchesBranches,
  nearestLocalityOf,
} from '@core/index'
import type { Farm, FarmBranchKind, FarmCoverage, FarmStatus, FarmType, RegionId } from '@core/index'

import { EntityTable } from '../../components/EntityTable'
import type { EntityColumn, RowAction } from '../../components/EntityTable'
import { PreviewPanel, PreviewRow, PreviewSection } from '../../components/PreviewPanel'
import { useScreenSettings } from '../../settings/ScreenSettings'
import { EntityQuickCard } from '../../components/EntityQuickCard'
import { Icon } from '../../components/Icon'
import { AreaGapMark } from '../../components/areaGap'
import { FarmStatusBand, FarmMarksLegend } from '../../farm/FarmStatusBand'
import { BranchChips, branchLabel, branchText } from '../../farm/FarmBranches'
import type { CompactFilters, FilterFamily } from '../../components/ListFilters'
import { CallRestrictionChip, callNotices, callTone, confirmCall, guardCall, isCallGuarded } from '../../institutions/institutionUi'
import { TestDataBadge } from '../../components/TestDataBadge'
import { MapPanel, withInteraction } from '../../components/MapPanel'
import { OverflowMenu } from '../../components/OverflowMenu'
import { RegionFilter, regionFilterFamily } from '../../components/RegionFilter'
import {
  ThreatLegend,
  threatVectorShapes,
  threatZoneShapes,
} from '../../components/threats'
import type { MapMarker } from '../../components/MapView'
import {
  FarmStatusChip,
  FarmStatusDot,
  readStatusColor,
} from '../../components/badges'
import {
  EmptyState,
  FilterPill,
  FilterRow,
  PillGroup,
  PillSelect,
  KpiChip,
  ListTop,
} from '../../components/primitives'
import { ZoneLegend, zonePolygons } from '../../components/zones'
import { usePhoneShape } from '../../hooks/useNarrow'
import { useCoreValue } from '../../hooks/useCore'
import { useLocale } from '../../hooks/useLocale'
import { useAreaGapThreshold } from '../../settings/areaGap'
import { useCoverageSettings } from '../../settings/coverage'
import { useRenewalWindow } from '../../settings/renewal'
import { useIntakeRequests } from '../../intake/intakeState'

/* AO2 — les neuf statuts, dans l'ordre de @core. Les deux nouveaux filtrent
   comme les autres : c'est la moitié de « la fiche reste dans les listes ». */
const STATUSES: readonly FarmStatus[] = ALL_FARM_STATUSES
/**
 * ⚠️ AK2 — ET « לא ידוע » N'EST PAS UNE QUATRIÈME PASTILLE ICI, PARCE QUE LA
 *    MESURE L'INTERDIT. `bun run uipass` : à 1376 px en mode splitté le panneau
 *    fait ~578 px ; une pastille de plus — ou seulement un libellé plus long,
 *    « חקלאות ומרעה » au lieu de « מעורב » — fait basculer TOUTE la barre de
 *    filtres derrière « סינון » (AB2), le filtre de région compris. Une fiche
 *    de nature inconnue se lit sur sa tuile (« לא ידוע ») et se trouve par les
 *    files du haut ; elle ne vaut pas de replier la barre entière.
 */
const TYPES: FarmType[] = ['agriculture', 'livestock', 'mixed']

/**
 * C1.1 — farms, map-first.
 *
 * The map carries the 12 farms coloured by status; the right-hand panel holds
 * search, filter pills and the list. Hover is synchronised in both directions:
 * hovering a row grows its marker, hovering a marker highlights its row.
 */
export function FarmsListScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  /**
   * ★★ AK7.3 — LE RÔLE, ET LA FILE DES ARCHIVÉES À CÔTÉ.
   *
   * `getVisibleFarms` ne rend plus les archivées (access.ts) : elles sortent
   * donc des listes, de la carte, des vignettes et des compteurs sans qu'un
   * seul écran ait à y penser. La pastille « בארכיון » est le SEUL endroit qui
   * les demande, et elle remplace alors le rôle entier — un filtre qui les
   * ajouterait aux actives serait un rôle où l'on ne sait plus ce qu'on lit.
   */
  const activeFarms = useCoreValue(getVisibleFarms)
  const archivedFarms = useCoreValue(getArchivedFarms)
  const [archivedOnly, setArchivedOnly] = useState(false)
  const farms = archivedOnly ? archivedFarms : activeFarms
  const zones = useCoreValue(getAllVisibleFarmZones)
  // G18 — coordinator-only by construction: `access.ts` returns [] for every
  // other role, so no condition here decides who sees the layer.
  const threatZones = useCoreValue(getVisibleThreatZones)
  const threatVectors = useCoreValue(getVisibleThreatVectors)
  /*
   * ★ X2 (2026-09-04) — THE THREAT LAYER'S OWN BUTTON IS GONE. It was a pill
   *   in this header AND two checkboxes in the map legend, i.e. two controls
   *   over one remembered value, and the product owner asked for the legend
   *   to be the only place a map layer is switched. The shapes are handed to
   *   the map unconditionally now; `MapCanvas` filters them by
   *   `mapLayers.ts`, which is where every other layer has been governed
   *   since W5. The threat layers default to OFF there, as this pill did.
   */

  // The dashboard links here with ?status=… — keep it in the URL so a filtered
  // list stays shareable and survives a refresh.
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as FarmStatus | null) ?? null
  const [type, setType] = useState<FarmType | null>(null)
  // G16 — the moshav KPI-filter: entity kind joins the list's filters.
  const [moshavOnly, setMoshavOnly] = useState(false)
  // X12.4 — the standard region, as a filter. `null` is "every region".
  const [region, setRegion] = useState<RegionId | null>(null)
  /* ★★ BF — `?q=` : une localité choisie dans la recherche globale. */
  const [query, setQuery] = useState(() => params.get('q') ?? '')
  const askedQuery = params.get('q')
  useEffect(() => {
    if (askedQuery !== null) setQuery(askedQuery)
  }, [askedQuery])
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /**
   * ★ X4.3 (2026-09-04) — THE PHOTO SITUATES, IT DOES NOT ZOOM.
   *
   * U8 made the tile's photo a `flyTo`, and `flyTo` lifts the camera to at
   * least z13 — so from the national frame a tap threw away exactly the
   * context the product owner tapped it to get. It now SELECTS the entity and
   * opens its card ANCHORED to its own pin, tip and all, with the camera left
   * where it was (`MapCanvas.anchored` pans only if the pin is off screen).
   * The tight frame stays the OTHER gesture's: opening the sheet.
   */
  const [previewKey, setPreviewKey] = useState(0)
  /**
   * ★★ AA3.3 (2026-09-07) — « TOTAL PONDÉRÉ TRIABLE ET FILTRABLE EN LISTE
   *    COMME EN TABLEAU. »
   *
   * ★ ONE SORT, TWO READINGS. The tiles and the table are the same screen in
   *   two shapes (Y4 folded the old view switch into the map mode), so a sort
   *   that lived in the table would vanish the moment the coordinator went
   *   back to the split — which is the reading he uses on the road. The order
   *   is applied to `filtered` once, above both.
   *
   * ★ AND THE DEFAULT STAYS `name`. A roster that re-orders itself the first
   *   time you open it is a roster you have to re-learn; the weighted order is
   *   something he asks for, on a screen where he is deciding who to call.
   */
  const [sort, setSort] = useState<FarmSort>('name')
  /** AA3.3 — the weighted figure as a FILTER: which places have areas at all. */
  const [hasAreas, setHasAreas] = useState(false)
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★★ AC4.4 · AC4.5 — LA VUE DE RÉPARTITION.
   * ═══════════════════════════════════════════════════════════════════════
   *
   *   « trier et filtrer par nombre de gardes reçues et par ancienneté de la
   *     dernière garde, pour voir d'un coup d'œil qui est servi et qui est
   *     oublié. »
   *
   * ★ ONE WALK OVER THE GUARDS, NOT ONE PER ROW. `farmCoverage` answers for
   *   the whole roster at once and the result is indexed by id; a per-row
   *   `farmGuardStats` would re-walk every mission 198 times on every
   *   keystroke in the search box.
   */
  const { neglectDays } = useCoverageSettings()
  const coverage = useCoreValue(() => farmCoverage(getVisibleFarms(), neglectDays))
  const coverageOf = useMemo(() => {
    const by = new Map<string, FarmCoverage>()
    for (const row of coverage) by.set(row.farm.id, row)
    return by
  }, [coverage])
  /** AC4.5 — « nous ne sommes pas venus » : actives, never or long ago. */
  const [neglected, setNeglected] = useState(false)
  /**
   * ★★ BA (2026-10-12) — « טרם נוצר קשר » : les fiches venues du portail
   * (bloc-notes d'avant l'application) à qui personne n'a encore parlé.
   */
  const [notContactedOnly, setNotContactedOnly] = useState(() => params.get('filter') === 'notContacted')
  /** ★★ BC — la nature de l'exploitation : l'une OU l'autre des natures cochées. */
  const [branchFilter, setBranchFilter] = useState<FarmBranchKind[]>([])
  const toggleBranchFilter = (k: FarmBranchKind) => setBranchFilter((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]))
  const neglectedCount = useMemo(
    () => coverage.filter((c) => c.state === 'never' || c.state === 'stale').length,
    [coverage],
  )
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★★ AD2.6 · AD3 — LES DEUX FILES DE TRAVAIL DE LA SURFACE.
   * ═══════════════════════════════════════════════════════════════════════
   *
   * « פערי שטח » — les fiches dont la déclaration et le tracé ne se rejoignent
   * pas, à trancher avant que le dossier parte ; « לתיחום » — celles qui
   * portent un chiffre déclaré et AUCUN polygone, à contourner.
   *
   * ⚠️ CE SONT DEUX FILES ET NON DEUX DEGRÉS D'UNE MÊME ALERTE. Une fiche sans
   *    tracé n'a pas d'écart (il faut deux surfaces pour diverger) et ne peut
   *    donc jamais être dans les deux à la fois. Les compter séparément est ce
   *    qui rend les deux nombres lisibles.
   */
  const gapThreshold = useAreaGapThreshold()
  const [gapOnly, setGapOnly] = useState(false)
  const [noOutlineOnly, setNoOutlineOnly] = useState(false)
  const gapCount = useMemo(
    () => farms.filter((f) => hasAreaGap(f, gapThreshold)).length,
    [farms, gapThreshold],
  )
  const noOutlineCount = useMemo(() => farms.filter((f) => needsOutline(f)).length, [farms])
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ AG5.2 (2026-09-09) — LA TROISIÈME FILE : « לחידוש ».
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * ⚠️ TROISIÈME, ET LA PLACE A ÉTÉ DÉCIDÉE PAR LES DEUX ACCIDENTS D'AC ET D'AD
   *    QUE LE BRIEF RAPPELLE NOMMÉMENT. « נשכחו » tient la première place
   *    depuis AC parce qu'elle est la question quotidienne ; « לתיחום » la
   *    deuxième depuis AD3.2 et « il n'est pas question de la déplacer une
   *    troisième fois ». Celle-ci est une échéance à soixante jours : elle
   *    compte, elle n'est pas urgente à la minute, et elle vient donc juste
   *    après — avant les pastilles de statut, qui sont du filtrage et non une
   *    file.
   *
   * ⚠️ ET CE N'EST PAS UNE SONDE DOM QUI LE VÉRIFIE. A148 mesure la boîte de
   *    cette vignette contre celle de son défileur SUR LE DÉPLOYÉ, à 402 et à
   *    1376 px, au repos et sans défiler — la leçon d'AA6.2, d'AC4.5 et
   *    d'AD3.2 : « la seule question qu'on peut poser à deux boîtes opaques est
   *    une question sur deux RECTANGLES ».
   *
   * ★ ELLE NE S'AFFICHE QUE QUAND ELLE A QUELQUE CHOSE À DIRE, comme ses deux
   *   voisines. Sur un programme dont aucune fiche ne porte de תוקף ההסכם — ce
   *   qui est l'état d'une base neuve — une file vide serait un filtre qui vide
   *   la liste et qu'on apprend à ne plus croire.
   */
  const renewWindow = useRenewalWindow()
  const todayKey = dayKeyOf(now())
  const renewIds = useMemo(
    () => new Set(farmsToRenew(farms, todayKey, renewWindow).map((f) => f.id)),
    [farms, todayKey, renewWindow],
  )
  const [renewOnly, setRenewOnly] = useState(false)
  /* ★★ AK5.3 — la file « ממתינות למסמכים », même forme que les autres. */
  const [docsOnly, setDocsOnly] = useState(false)
  const docsCount = useMemo(() => farms.filter((f) => awaitingDocuments(f)).length, [farms])
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ AP4.1 (2026-09-25) — « בקשות נכנסות », LA FILE DE LA PAGE PUBLIQUE.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   *   « Le PO la retrouve dans une file dédiée sur l'écran חוות. »
   *
   * ⚠️ UNE FILE ET NON UNE PASTILLE DE STATUT, bien que ce SOIT un statut. Les
   *    pastilles de la barre de filtres servent à explorer un effectif ; une
   *    file dit « il y a quelque chose à faire aujourd'hui ». Une demande
   *    entrante est une personne qui attend une réponse : c'est une file.
   *
   * ⚠️ DEUXIÈME, ET LA PLACE N'EST PAS LIBRE DE LE DEVENIR. À 402 px, DEUX
   *    vignettes seulement tiennent au repos (AG5.2 : 3 × 152 + 20 > 370).
   *    « נשכחו » garde la première place — AC l'y a mise, AD3.2 dit qu'il n'est
   *    pas question de l'en bouger, et ç'aurait été la troisième fois. Celle-ci
   *    prend la seconde, devant « ממתינות למסמכים » : un arriéré de papiers
   *    attend depuis des semaines et peut attendre un jour de plus ; quelqu'un
   *    qui vient de demander de l'aide, non. A249 mesure les DEUX rectangles.
   */
  const [intakeOnly, setIntakeOnly] = useState(() => params.get('intake') === '1')
  /* AQ2 — le bandeau « לפתיחה » arrive ici avec `?intake=1`, écran déjà monté ou non. */
  const intakeParam = params.get('intake') === '1'
  useEffect(() => {
    if (intakeParam) setIntakeOnly(true)
  }, [intakeParam])
  const intakeRequests = useIntakeRequests()
  const intakeCount = useMemo(
    () => farms.filter((f) => f.status === 'incoming_request').length,
    [farms],
  )
  /** AA6 — where the sort control is rendered; see `sortControl`. */
  const phone = usePhoneShape()
  /** A new key is a new request to (re)anchor — and to pan only if off screen. */
  const select = (id: string | null) => {
    setSelectedId(id)
    setPreviewKey((k) => k + 1)
  }
  const anchors = useCoreValue(getAllVisibleAnchorPoints)
  const postsOf = (farmId: string) => anchors.filter((a) => a.farmId === farmId).length
  const centerOn = (farm: Farm) => select(farm.id)
  /**
   * G7 — two readings of the same roster. The MAP stays the default (A18:
   * geography first), but a farm file imported at scale needs columns to
   * scan down, and a table crammed into the map shell's one-third panel is
   * not a table.
   *
   * ★★ Y4 — WHICH READING IS SHOWN IS THE MAP MODE, not a switch of this
   *    screen's own. See the "⋯" note below: `hidden` — the coordinator has
   *    asked for the content to fill the screen — IS the table, on this
   *    screen and on the four others.
   */

  const setStatus = (value: FarmStatus | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete('status')
    else next.set('status', value)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return farms.filter((farm) => {
      if (status !== null && farm.status !== status) return false
      if (type !== null && farm.type !== type) return false
      if (moshavOnly && entityKindOf(farm) !== 'moshav') return false
      if (region !== null && farmRegion(farm) !== region) return false
      // AA3.3 — « filtrable » : 198 rows arrive from a prospection sheet with
      // no areas at all, and « which of these have we actually measured » is
      // the question that separates a lead from a holding.
      if (hasAreas && weightedDunams(farm) <= 0) return false
      /* AD2.6 · AD3.2 — les deux files, comme deux rétrécissements du rôle. */
      if (gapOnly && !hasAreaGap(farm, gapThreshold)) return false
      if (noOutlineOnly && !needsOutline(farm)) return false
      /* AG5.2 — la file du renouvellement, même forme que les deux autres. */
      if (renewOnly && !renewIds.has(farm.id)) return false
      /* AK5.3 — les fiches dont les documents de droit sur la terre manquent. */
      if (docsOnly && !awaitingDocuments(farm)) return false
      /* AP4.1 — les demandes arrivées par la page publique, pas encore traitées. */
      if (intakeOnly && farm.status !== 'incoming_request') return false
      /* ★★ BA — « טרם נוצר קשר ». */
      if (notContactedOnly && isContactEstablished(farm)) return false
      /* ★★ BC — la nature de l'exploitation. */
      if (!matchesBranches(farm, branchFilter)) return false
      /* AC4.4 — « qui est oublié », as a narrowing of the same roster. */
      if (neglected) {
        const state = coverageOf.get(farm.id)?.state
        if (state !== 'never' && state !== 'stale') return false
      }
      if (!q) return true
      /* ★ AF2.2 — même tolérance que l'autocomplétion : ponctuation hébraïque
         réconciliée, et une faute de frappe rattrapée sur un nom long. */
      return looseMatch(q, [
        farm.name,
        farm.farmName ?? '',
        farm.locality,
        farm.region,
        farm.farmerName ?? '',
        /* ★★ BC — le repère aussi : « ליד דביר » se cherche par « דביר ». */
        farm.nearestLocality ?? '',
        ...farm.contacts.map((c) => c.name),
        /* ★★ BA — le numéro aussi, chiffres seuls (« 0526… » trouve « 052-6… »). */
        ...[farm.farmerPhone ?? '', ...farm.contacts.map((c) => c.phone)].map((p) => p.replace(/\D/g, '')).filter(Boolean),
      ])
    })
  }, [
    farms,
    status,
    type,
    moshavOnly,
    region,
    hasAreas,
    neglected,
    gapOnly,
    noOutlineOnly,
    renewOnly,
    renewIds,
    docsOnly,
    intakeOnly,
    notContactedOnly,
    branchFilter,
    gapThreshold,
    coverageOf,
    query,
  ])

  /**
   * ⚠️ SORTED ON A COPY, AND STABLY. `Array.prototype.sort` mutates, and
   *    `filtered` is a memo the markers also read — sorting it in place would
   *    re-order the map's own list as a side effect of rendering the roster.
   */
  /* ★★ AQ1.2 — les demandes entrantes EN TÊTE, quel que soit le tri choisi,
     sans filtre : le tri du PO n'est pas remplacé, il est précédé
     (`incomingFirst`, une partition stable). Liste ET tableau lisent ceci. */
  const sorted = useMemo(
    () => incomingFirst(sortFarms(filtered, sort, coverageOf, gapThreshold), intakeRequests),
    [filtered, sort, coverageOf, gapThreshold, intakeRequests],
  )


  /* ★★ BD 4 — composer sa carte : les institutions et les contacts à traiter
     en contexte, chacun sous sa couche de la légende. */
  const context = useContextMarkers(NOT_FARMS)
  const farmMarkers: MapMarker[] = useMemo(
    () =>
      /* AK1 — pas d'épingle au point de repli pour une fiche sans position. */
      filtered.filter((farm) => !farm.positionMissing).map((farm) =>
        withInteraction(
          {
            id: farm.id,
            position: farm.position,
            color: readStatusColor(farm.status),
            title: farm.name,
            subtitle: farm.locality,
            ...farmPin(farm),
          },
          { hoveredId, selectedId },
          { onHover: setHoveredId, onSelect: select },
        ),
      ),
    [filtered, hoveredId, selectedId],
  )
  const markers = useMemo(() => [...farmMarkers, ...context], [farmMarkers, context])

  const selected = filtered.find((f) => f.id === selectedId) ?? null

  /* ★★ AY3 — l'aperçu (panneau latéral / feuille), et le tableau commun. */
  const [previewId, setPreviewId] = useState<string | null>(null)
  const preview = farms.find((f) => f.id === previewId) ?? null
  const tableSort = farmSortToTable(sort)
  const onTableSort = (s: { key: string; dir: 'asc' | 'desc' }) => setSort(tableToFarmSort(s))
  const dunamsText = (n: number) => n.toLocaleString(locale)
  const farmColumns: EntityColumn<Farm>[] = [
    { key: 'locality', label: t('volunteers.colLocality'), sub: (f) => f.locality, minWidth: 620, className: 'w-[8rem]', render: (f) => <span className="text-content-secondary">{f.locality || '—'}</span>, title: (f) => f.locality },
    { key: 'region', label: t('farms.colRegion'), sub: (f) => regionLabel(f), minWidth: 660, className: 'w-[7rem]', render: (f) => <span className="text-content-secondary" data-testid="farm-region-cell">{regionLabel(f) || '—'}</span> },
    { key: 'type', label: t('farms.colType'), sub: (f) => t(`farmType.${f.type}`), minWidth: 780, className: 'w-[8rem]', render: (f) => <span className="text-content-secondary">{t(`farmType.${f.type}`)}</span> },
    /* ★★ BC — la nature de l'exploitation (« ? » = à confirmer) ; sous le nom quand la colonne cède. */
    { key: 'branches', label: t('branches.title'), sub: (f) => branchText(t, f), minWidth: 700, className: 'w-[9rem]', render: (f) => <BranchChips entity={f} testId={`farm-branches-${f.id}`} />, title: (f) => branchText(t, f) },
    { key: 'status', label: t('farms.colStatus'), sort: () => 0, minWidth: 560, className: 'w-[8.5rem]', render: (f) => <FarmStatusChip status={f.status} /> },
    { key: 'dunams', label: t('farms.colDunams'), sub: (f) => `${dunamsText(effectiveAreas(f).cultivated)} / ${dunamsText(effectiveAreas(f).grazing)}`, minWidth: 900, className: 'w-[7.5rem]', render: (f) => <span className="ltr-nums numeric text-content-secondary">{dunamsText(effectiveAreas(f).cultivated)} / {dunamsText(effectiveAreas(f).grazing)}</span> },
    { key: 'weighted', label: t('farms.colWeighted'), sort: () => 0, minWidth: 600, className: 'w-[6.5rem]', render: (f) => <span className="ltr-nums numeric font-semibold text-content-primary" data-weighted={weightedDunams(f)}>{dunamsText(weightedDunams(f))}</span> },
    {
      key: 'guards',
      label: t('farms.colGuards'),
      sort: () => 0,
      minWidth: 840,
      className: 'w-[7rem]',
      render: (f) => (
        <span className="ltr-nums numeric text-content-secondary" data-guards={coverageOf.get(f.id)?.stats.guards ?? 0}>
          {(coverageOf.get(f.id)?.stats.guards ?? 0).toLocaleString(locale)}
          <span className="muted ms-1 text-micro">{coverageOf.get(f.id)?.stats.lastGuardAt ? formatDate(coverageOf.get(f.id)?.stats.lastGuardAt as string, locale) : '—'}</span>
        </span>
      ),
    },
    { key: 'nextVisit', label: t('farms.nextVisit'), sort: () => 0, minWidth: 720, className: 'w-[7rem]', render: (f) => <span className="ltr-nums text-micro text-content-muted">{f.nextVisitAt ? formatDate(f.nextVisitAt, locale) : t('farms.noVisitYet')}</span> },
  ]
  const farmActions = (f: Farm): RowAction[] => {
    const callee = f.contacts.find((c) => c.phone) ?? null
    const phoneNo = callee?.phone ?? f.farmerPhone
    /* ★★ BC — un contact dont la note restreint l'usage du téléphone : l'article
       le dit, et l'appel demande de relire (le garde de BB, `confirmCall`). */
    const guarded = isCallGuarded(null, callee)
    return [
      { key: 'view', icon: 'eye', label: t('table.view'), inline: true, onClick: () => { setPreviewId(f.id); select(f.id) }, testId: `farm-view-${f.id}` },
      { key: 'edit', icon: 'edit', label: t('table.edit'), inline: true, to: `/coordinator/farms/${f.id}/edit`, testId: `farm-edit-${f.id}` },
      { key: 'open', icon: 'external', label: t('preview.openFull'), inline: true, to: `/coordinator/farms/${f.id}`, testId: `farm-open-${f.id}` },
      ...(phoneNo
        ? [
            {
              key: 'call',
              icon: guarded ? ('alert' as const) : ('phone' as const),
              label: guarded ? callNotices(null, callee, t).join(' · ') : t('people.call'),
              danger: guarded || undefined,
              testId: guarded ? `farm-call-guarded-${f.id}` : `farm-call-${f.id}`,
              onClick: () => {
                if (confirmCall(null, callee, t)) window.open(`tel:${phoneNo.replace(/[^\d+]/g, '')}`, '_self')
              },
            },
          ]
        : []),
      { key: 'guard', icon: 'shield', label: t('farms.newGuardHere'), to: `/coordinator/missions/new?farm=${f.id}`, testId: `farm-new-guard-${f.id}` },
      { key: 'visit', icon: 'calendar', label: t('farms.planVisit'), to: `/coordinator/agenda/visit/new?farm=${f.id}` },
      { key: 'center', icon: 'pin', label: t('farms.centerOnMap'), onClick: () => centerOn(f) },
      ...(needsOutline(f) ? [{ key: 'draw', icon: 'landPlot' as const, label: t('farms.drawOutline'), to: `/coordinator/farms/${f.id}?draw=farm_boundary` }] : []),
    ]
  }

  /**
   * G14d — one KPI card per status IN USE, count big and the status's dunam
   * total underneath ("how much ground is at this stage"), and the card IS
   * the filter: it replaces the status pills. Statuses at zero are dropped,
   * same rule as the pills they replace.
   */
  const statusKpis = STATUSES.map((s) => {
    const inStatus = farms.filter((f) => f.status === s && !isTestId(f.id))
    return {
      status: s,
      count: inStatus.length,
      /* AD1.4 — « la » surface de chaque fiche : déclarée, ou mesurée à défaut. */
      dunams: inStatus.reduce((sum, f) => sum + effectiveAreas(f).total, 0),
    }
  }).filter((k) => k.count > 0)

  const moshavim = farms.filter((f) => entityKindOf(f) === 'moshav')
  /** AA3.3 — the records that have a weighted figure at all. */
  const withAreas = farms.filter((f) => weightedDunams(f) > 0)

  /** X12.4 — how many entities each region holds, for the picker's labels. */
  const regionCounts = useMemo(() => {
    const out: Partial<Record<RegionId, number>> = {}
    for (const f of farms) {
      const id = farmRegion(f)
      if (id) out[id] = (out[id] ?? 0) + 1
    }
    return out
  }, [farms])

  /**
   * U2 (2026-09-02) — THE TOP IS ONE STICKY, COMPACT BLOCK. The product owner
   * saw four farms under a bandeau that took three quarters of the panel:
   * the KPI cards were a grid, the search a row, the pills another. Now the
   * status KPIs are chips in ONE swipable row beside the search box, the
   * type pills are one line under it, and the whole thing is pinned at every
   * width — so eight to ten entities are on screen on an iPad in landscape.
   */
  const kpiChips = (
    <>
      {/**
        * ═══════════════════════════════════════════════════════════════════
        * ★★ AC4.4 · AC4.5 — « QUI EST OUBLIÉ », EN UNE VIGNETTE ET NON EN UNE
        *    PASTILLE.
        * ═══════════════════════════════════════════════════════════════════
        *
        * ⚠️ AND THE FIRST DRAFT PUT IT IN THE FILTER ROW, WHERE A86 CAUGHT IT.
        *    A new pill row makes the unfolded panel taller, and the floating
        *    « + » then lands ON it: measured on `bun run pills` as
        *    « the "+" is on nothing — farms-neglected », which is the AA1.5
        *    defect exactly — a control the button covers is a control that
        *    cannot be scrolled out from under it, and is therefore unreachable
        *    for ever. It belongs with the other count-that-is-also-a-filter
        *    (« דונם משוקלל »), in the KPI row, which is where this roster has
        *    put that shape since G14d.
        *
        * ⚠️ AND IT IS FIRST IN THE ROW, WHICH THE CAPTURES DECIDED. Placed
        *    after « דונם משוקלל » it was the ninth chip: the KPI band SCROLLS,
        *    and at 1376 px the eighth was already cut in half — so the one
        *    signal this unit exists for was off screen on the iPad the product
        *    owner actually holds. `bun run acui` could not see that (it asks
        *    the DOM, and the DOM had it); the deployed capture could, which is
        *    the AA6.2 lesson again. A106 now measures the RECTANGLE.
        *
        * ⚠️ IT IS DRAWN ONLY WHEN THERE IS SOMETHING TO SHOW. A filter always
        *    present and always emptying the list is a filter the coordinator
        *    learns to distrust; on a roster of 198 leads with no signed farm
        *    yet, « נשכחו » has nothing to say and says nothing.
        */}
      {/**
        * ═══════════════════════════════════════════════════════════════════
        * ★★ AQ1.3 — « בקשות נכנסות » PASSE PREMIÈRE, DEVANT « נשכחו ».
        * ═══════════════════════════════════════════════════════════════════
        *
        * ⚠️ AP l'avait mise DEUXIÈME, et la capture du déployé d'AQ0 a montré
        *    ce que ça coûtait : à 1 032 px (l'iPad du PO en portrait) la
        *    vignette était coupée de 14 px par le bord de la bande défilante,
        *    sous son chevron. Une personne qui attend une réponse passe devant
        *    un arriéré de gardes — c'est aussi ce que dit l'ordre du tableau
        *    de bord (AQ1.1). A262 mesure le rectangle aux trois largeurs.
        *
        * ⚠️ ET ELLE NE SUFFIT PLUS : les demandes sont EN TÊTE de la liste,
        *    sans filtre (`incomingFirst`). La vignette complète, elle ne
        *    remplace pas.
        */}
      {intakeCount > 0 && (
        /* Même découpe en deux lignes que la file des documents, et pour la
           même raison mesurée : « בקשות נכנסות » sur une ligne se coupe à
           402 px dans une vignette de 152 px. */
        <KpiChip
          label={`${t('intake.queueLine1')} ${t('intake.queueLine2')}`}
          value={intakeCount}
          icon="user"
          tone="accent"
          active={intakeOnly}
          onClick={() => setIntakeOnly((v) => !v)}
          testId="farms-intake"
        />
      )}
      {neglectedCount > 0 && (
        <KpiChip
          label={t('farms.filterNeglected')}
          value={neglectedCount}
          icon="clock"
          tone="alert"
          hint={t('farms.filterNeglectedHint', { days: neglectDays })}
          active={neglected}
          onClick={() => setNeglected((v) => !v)}
          testId="farms-neglected"
        />
      )}
      {/**
        * ═══════════════════════════════════════════════════════════════════
        * ★★ AG5.2 — « לחידוש », DEUXIÈME, ET C'EST UNE MESURE QUI L'A DÉPLACÉE.
        * ═══════════════════════════════════════════════════════════════════
        *
        * ⚠️ ELLE ÉTAIT TROISIÈME, ET A148 A TROUVÉ SUR LE DÉPLOYÉ EXACTEMENT
        *    L'ACCIDENT QUE LE BRIEF ANNONÇAIT : à 402 px la vignette était
        *    mesurée à **x = −90**, c'est-à-dire poussée hors de l'écran par la
        *    bande qui défile. Le brief le nommait d'avance — « ni recouverte
        *    par le “+” flottant ni repoussée hors écran » — et c'est le même
        *    accident qu'AC4.5 et AD3.2.
        *
        * ★★ ET L'ARITHMÉTIQUE DIT QU'IL N'Y A PAS DE TROISIÈME PLACE À 402 px.
        *    Une vignette mesure 152 px depuis Y5 — où le PO a demandé TROIS
        *    FOIS le gabarit de la feuille « à l'identique », donc la rétrécir
        *    serait défaire une décision prise trois fois. 3 × 152 + 2 × 10 =
        *    476 px de contenu pour 370 px utiles sur un téléphone. Deux
        *    vignettes tiennent au repos ; la troisième, quelle qu'elle soit,
        *    dépasse. La question n'est donc pas « comment les faire tenir »
        *    mais « laquelle des trois a le droit d'être la troisième ».
        *
        * ★ LA RÉPONSE EST : UNE ÉCHÉANCE DATÉE PASSE AVANT UN ARRIÉRÉ.
        *   « נשכחו » reste première — AC l'y a mise et AD3.2 dit qu'il n'est
        *   pas question de l'en bouger. « לחידוש » porte une DATE : passé le
        *   jour dit, le document est expiré et la ferme sort du programme.
        *   « לתיחום » est un arriéré : il est massif au démarrage, il ne
        *   périme pas, et le repousser d'une semaine ne coûte rien. C'est donc
        *   lui la troisième, et A148 mesure les deux : « לחידוש » ENTIÈREMENT
        *   visible au repos partout, et au moins partiellement à 402 px.
        */}
      {/**
        * ═══════════════════════════════════════════════════════════════════
        * ★★ AK5.3 — « ממתינות למסמכים », DEUXIÈME, JUSTE APRÈS « נשכחו ».
        * ═══════════════════════════════════════════════════════════════════
        *
        * ⚠️ LES ACCIDENTS D'AC ET D'AD RAPPELÉS PAR LE BRIEF DÉCIDENT DE LA PLACE.
        *    Dans la bande des vignettes et non la barre de filtres (le « + »
        *    flottant ne va jamais dans cette bande) ; et à une place qui est au
        *    repos DANS l'écran à 402 px, où deux vignettes seulement tiennent
        *    (AG5.2 : 3 × 152 + 20 > 370). « נשכחו » garde la première place
        *    qu'AC lui a donnée ; cette file-ci est une RÈGLE MÉTIER qui bloque
        *    la clôture, pas un arriéré : elle passe devant « לחידוש » et
        *    « לתיחום ». Mesurée sur CAPTURE du déployé à 402 et 1376 (A202).
        */}
      {/**
        * ═══════════════════════════════════════════════════════════════════
        * ★★ AP4.1 — « בקשות נכנסות », DEUXIÈME, JUSTE APRÈS « נשכחו ».
        * ═══════════════════════════════════════════════════════════════════
        *
        * Voir la note sur `intakeOnly` plus haut pour la place. Comme ses
        * voisines, elle ne s'affiche QUE quand elle a quelque chose à dire :
        * tant qu'aucun agriculteur n'a écrit, la bande est exactement celle
        * d'avant cette passe, et le PO ne voit pas une vignette à zéro dont il
        * apprendrait à ne rien attendre.
        */}
      {docsCount > 0 && (
        /* ⚠️ Le nom de la file tient sur les DEUX lignes de la vignette : à
           152 px (gabarit Y5, non négociable) « ממתינות למסמכים » sur une ligne
           se coupait en « ממתינות ל… » sur la capture à 402 px. La seconde
           ligne, réservée à la note, porte la fin du nom — le nom entier se
           lit, et la hauteur de la bande ne change pas. */
        <KpiChip
          label={`${t('docs.queueLine1')} ${t('docs.queueLine2')}`}
          value={docsCount}
          icon="document"
          tone="alert"
          active={docsOnly}
          onClick={() => setDocsOnly((v) => !v)}
          testId="farms-awaiting-docs"
        />
      )}
      {renewIds.size > 0 && (
        <KpiChip
          label={t('renewal.title')}
          value={renewIds.size}
          icon="clock"
          tone="alert"
          hint={t('renewal.hint')}
          active={renewOnly}
          onClick={() => setRenewOnly((v) => !v)}
          testId="farms-renewal"
        />
      )}
      {/**
        * ═══════════════════════════════════════════════════════════════════
        * ★★ AD3.2 — « לתיחום », DEUXIÈME, ET LA PLACE A ÉTÉ DÉCIDÉE PAR LES
        *    DEUX ACCIDENTS D'AC.
        * ═══════════════════════════════════════════════════════════════════
        *
        * Le brief nomme les deux : le « + » flottant s'est posé sur une
        * pastille mise dans la barre de filtres (A86), et une vignette
        * neuvième était hors écran à 1376 px parce que la bande DÉFILE.
        *
        * ★ LA PREMIÈRE LEÇON DIT « PAS DANS LA BARRE DE FILTRES » — donc ici,
        *   dans la bande des vignettes, où le bouton flottant ne va jamais.
        * ★ LA SECONDE DIT « PAS EN NEUVIÈME » — donc en DEUXIÈME, juste après
        *   « נשכחו », qu'AC a placée en tête pour cette raison exacte et qu'il
        *   n'est pas question de déplacer une troisième fois.
        *
        * ⚠️ ET CE N'EST PAS UNE SONDE QUI LE VÉRIFIE. A116 mesure la boîte de
        *    cette vignette contre celle de son défileur sur le DÉPLOYÉ, à
        *    1376 px et à 402 px, au repos et sans défiler — la leçon d'AA6.2 et
        *    d'AC4.5 : « la seule question qu'on peut poser à deux boîtes
        *    opaques est une question sur deux RECTANGLES ».
        *
        * ⚠️ ELLE NE S'AFFICHE QUE QUAND ELLE A QUELQUE CHOSE À DIRE, comme sa
        *    voisine : sur un rôle où personne n'a encore déclaré de surface,
        *    une file « à contourner » vide est un filtre qui vide la liste et
        *    qu'on apprend à ne plus croire.
        */}
      {noOutlineCount > 0 && (
        <KpiChip
          label={t('farms.filterNoOutline')}
          value={noOutlineCount}
          icon="landPlot"
          tone="accent"
          hint={t('farms.filterNoOutlineHint')}
          active={noOutlineOnly}
          onClick={() => setNoOutlineOnly((v) => !v)}
          testId="farms-no-outline"
        />
      )}
      {/* AD2.6 — et l'autre file de la même paire : les fiches dont les deux
          surfaces ne se rejoignent pas. Elle vient après, parce qu'elle est
          rare là où « לתיחום » est massive au démarrage d'un programme. */}
      {gapCount > 0 && (
        <KpiChip
          label={t('farms.filterGap')}
          value={gapCount}
          icon="alert"
          tone="alert"
          hint={t('farms.filterGapHint', { percent: Math.round(gapThreshold * 100) })}
          active={gapOnly}
          onClick={() => setGapOnly((v) => !v)}
          testId="farms-area-gap"
        />
      )}
    </>
  )

  /**
   * X2 — WHAT THIS SCREEN CAN DO, IN ONE "⋯".
   *
   * ★★ Y4 (2026-09-04) — AND THE MAP/TABLE PAIR IS NO LONGER ONE OF THEM.
   *    This screen carried a `view` of its own — two rows in this menu — on
   *    top of the three-mode pill every map screen already has, so the
   *    coordinator had FOUR states to think about on one screen and three on
   *    every other. His rule collapses them: the table IS the content-full
   *    mode. Choosing "contenu plein" is choosing the table, and there is one
   *    control for both because they were always one idea.
   */
  const farmSettings = useScreenSettings('farms')
  const menu = (
    <OverflowMenu
      testId="farms-menu"
      items={[
        /* ★★ AY12.1 — UNE entrée « ייבוא » : l'écran unique demande quel fichier
           (liste de fermes, portail, prospection, signatures, association). */
        {
          key: 'import',
          label: t('importHub.title'),
          icon: 'upload',
          to: '/coordinator/import?from=farms',
          testId: 'farms-import',
        },
        /* ★★ AZ4 — LES TROIS FICHIERS DE L'ASSOCIATION, À UN TOUCHER, COMME
           AVANT AY12 (AA4 · AA5 · AS1). L'écran unique reste la porte
           générale ; le portail — refait après chaque saisie chez eux — et
           ses deux voisins s'ouvrent directement dessus. */
        {
          key: 'portal',
          label: t('portal.title'),
          icon: 'upload',
          to: '/coordinator/import?kind=portal&from=farms',
          testId: 'farms-import-portal',
        },
        {
          key: 'prospection',
          label: t('import.prospectionTitle'),
          icon: 'table',
          to: '/coordinator/import?kind=prospection&from=farms',
          testId: 'farms-import-prospection',
        },
        {
          key: 'signatures',
          label: t('import.signaturesTitle'),
          icon: 'edit',
          to: '/coordinator/import?kind=signatures&from=farms',
          testId: 'farms-import-signatures',
        },
        /* ★★ AB6.6 — and the way OUT, in the same menu as the ways in. The
           coordinator's sentence is « j'importe, j'enrichis, je ressors un
           fichier » — three items of one workflow, one menu. */
        {
          key: 'export',
          label: t('export.title'),
          icon: 'download',
          to: '/coordinator/export',
          testId: 'farms-export',
        },
        /* ★★ AX9 — « les limites de mes régions sont mal tracées » : l'éditeur
           existe (Y2), mais n'était atteignable que par Réglages › מפה ואזורים.
           Il est aussi ici, là où l'on voit la région d'une ferme. */
        {
          key: 'regions',
          label: t('regionEdit.title'),
          icon: 'region',
          to: '/coordinator/settings/regions',
          testId: 'farms-edit-regions',
        },
        /* ★★ AY12.3 — les réglages des fermes, ici. */
        farmSettings.item,
      ]}
    />
  )

  /**
   * ★ AA3.3 — the order, as one control, rendered in one of two places.
   *   ONE node, moved — not two declared behind a breakpoint: the X5 lesson,
   *   and the reason a screen cannot end up sorting differently in the two
   *   readings of itself.
   */
  const sortControl = (
    <PillSelect<FarmSort>
      value={sort}
      onChange={setSort}
      active={sort !== 'name'}
      icon="sort"
      label={t('farms.sortLabel')}
      testId="farms-sort"
      options={[
        { value: 'name', label: t('farms.sortName') },
        { value: 'weightedDesc', label: t('farms.sortWeightedDesc') },
        { value: 'weightedAsc', label: t('farms.sortWeightedAsc') },
        { value: 'status', label: t('farms.sortStatus') },
        { value: 'nextVisit', label: t('farms.sortNextVisit') },
        /* AC4.4 — the three orders the equity question is asked in. */
        { value: 'guardsAsc', label: t('farms.sortGuardsAsc') },
        { value: 'guardsDesc', label: t('farms.sortGuardsDesc') },
        { value: 'lastGuardOldest', label: t('farms.sortLastGuardOldest') },
        /* AD2.6 — « trier par écart », le plus gros en tête. */
        { value: 'areaGapDesc', label: t('farms.sortGapDesc') },
      ]}
    />
  )

  const notContactedCount = farms.filter((f) => !isTestId(f.id) && !isContactEstablished(f)).length
  const branchCountsAll = branchCounts(farms.filter((f) => !isTestId(f.id)))
  const filterRow = (
    <FilterRow
      /* ★★ BA — UNE rangée, qui défile ; les statuts ont la leur (`FarmStatusBand`). */
      oneLine
      /* AB2.4 — five independent narrowings on this screen, one each. */
      activeCount={
        (notContactedOnly ? 1 : 0) +
        (status !== null ? 1 : 0) +
        (type !== null ? 1 : 0) +
        (moshavOnly ? 1 : 0) +
        (region !== null ? 1 : 0) +
        (hasAreas ? 1 : 0) +
        (neglected ? 1 : 0) +
        (gapOnly ? 1 : 0) +
        (noOutlineOnly ? 1 : 0) +
        (renewOnly ? 1 : 0) +
        (docsOnly ? 1 : 0) +
        (intakeOnly ? 1 : 0) +
        (archivedOnly ? 1 : 0) +
        (branchFilter.length > 0 ? 1 : 0)
      }
      onClear={() => {
        setStatus(null)
        setNotContactedOnly(false)
        setType(null)
        setMoshavOnly(false)
        setRegion(null)
        setHasAreas(false)
        setNeglected(false)
        setIntakeOnly(false)
        setGapOnly(false)
        setNoOutlineOnly(false)
        setDocsOnly(false)
        setArchivedOnly(false)
        setBranchFilter([])
      }}
    >
      {/* ★★ AX3.4 — le statut, les surfaces, les מושבים : des FILTRES ordinaires
          (ils se replient) ; les files de travail, elles, restent en vue. */}
      {/* ★★ AX3.5 — LE STATUT EST UN CHOIX PARMI NEUF : un sélecteur, son compte
          dans chaque option (c'étaient neuf tuiles). Les liens « ?status= » du
          tableau de bord l'ouvrent déjà réglé. */}
      {/* ★★ BA — LE STATUT N'EST PLUS ICI : il a sa propre rangée, épinglée à
          gauche (`FarmStatusBand`), pour qu'on voie d'un coup d'œil ce qui est
          un statut et ce qui est un filtre. « טרם נוצר קשר » ouvre la rangée. */}
      {notContactedCount > 0 && (
        <FilterPill
          active={notContactedOnly}
          onClick={() => setNotContactedOnly((v) => !v)}
          count={notContactedCount}
          title={t('farmContacts.filterHint')}
          testId="farms-not-contacted"
        >
          {t('farmContacts.notEstablished')}
        </FilterPill>
      )}
      <KpiChip
        label={t('farms.withAreas')}
        value={withAreas.length}
        icon="landPlot"
        tone="accent"
        hint={t('farms.withAreasHint')}
        active={hasAreas}
        onClick={() => setHasAreas((v) => !v)}
        testId="kpi-weighted"
      />
      {/* G16 — the entity-kind chip: how many of these records are moshavim,
          weighted like the status chips, and the chip is the filter. */}
      {moshavim.length > 0 && (
        <KpiChip
          label={t('farms.kpiMoshavim')}
          value={moshavim.length}
          icon="home"
          tone="accent"
          active={moshavOnly}
          onClick={() => setMoshavOnly((v) => !v)}
          testId="kpi-moshavim"
        />
      )}
      <RegionFilter value={region} onChange={setRegion} counts={regionCounts} testId="farms-region" />
      {/* G14d — the status pills are gone: the KPI chips above carry status
          filtering now. Only the type pills remain, they have no chip.
          AA1.3 — and on a phone the three of them are one grid of equal
          widths: « un libellé court ne donne pas une pastille étroite ». */}
      <PillGroup name="farm-type" cols={3}>
        {TYPES.map((ft) => (
          <FilterPill
            key={ft}
            active={type === ft}
            onClick={() => setType(type === ft ? null : ft)}
            count={farms.filter((f) => f.type === ft).length}
          >
            {t(`farmType.${ft}`)}
          </FilterPill>
        ))}
      </PillGroup>
      {/* ★★ BC — la nature de l'exploitation : les natures présentes, chacune son compte. */}
      {FARM_BRANCHES.filter((k) => branchCountsAll[k] > 0).map((k) => (
        <FilterPill key={k} active={branchFilter.includes(k)} onClick={() => toggleBranchFilter(k)} count={branchCountsAll[k]} testId={`farms-branch-${k}`}>
          {branchLabel(t, k)}
        </FilterPill>
      ))}
      {/**
        * ★★ AK7.3 — « בארכיון », UNE PASTILLE ET NON UNE VIGNETTE.
        *
        * Les vignettes du haut sont des FILES de travail — ce qu'il reste à
        * faire. L'archive n'est pas du travail en attente : c'est l'autre
        * moitié du rôle, qu'on va consulter. Elle est donc dans la barre de
        * filtres, avec son compte, et elle ne s'affiche que quand il y a
        * quelque chose dedans (la règle des trois files d'AC/AD/AG).
        */}
      {archivedFarms.length > 0 && (
        <FilterPill
          active={archivedOnly}
          onClick={() => setArchivedOnly((v) => !v)}
          count={archivedFarms.length}
          title={t('archive.filterHint')}
          testId="farms-archived"
        >
          {t('archive.filter')}
        </FilterPill>
      )}
      {/**
        * ★★ AA6 — AND THE SORT IS HERE ONLY ON A PHONE.
        *
        * `bun run uipass` measured the cost of putting it in this row on an
        * iPad in landscape: the pills wrapped to a second line, the sticky top
        * went from 244 px to **300** — over U2's quarter-of-the-height rule —
        * and **six** entities were on screen instead of eight. Sorting is not
        * filtering; on a wide screen it belongs with the search and the « ⋯ »,
        * on the row that has the room. On a phone that row has none, so it
        * comes back down into the panel, where there is space to spare.
        */}
      {phone && sortControl}
    </FilterRow>
  )

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ★★ BC (2026-10-12) — LES MÊMES FILTRES, DÉCLARÉS : la forme compacte
   *    (téléphone, panneau étroit) les lit pour la feuille, les pastilles et
   *    le bouton « סינון » ; la forme large garde la rangée de BA ci-dessus.
   * ═══════════════════════════════════════════════════════════════════════
   */
  const visibleFarmCount = farms.filter((f) => !isTestId(f.id)).length
  const queue = (key: string, label: string, count: number, active: boolean, onToggle: () => void, icon: 'user' | 'clock' | 'document' | 'landPlot' | 'alert', testId: string) =>
    count > 0 ? [{ key, label, count, active, onToggle, icon, tone: 'alert' as const, testId }] : []
  const families: FilterFamily[] = [
    {
      key: 'queues',
      title: t('filters.family.queues'),
      testId: 'farms-queues-family',
      options: [
        ...queue('intake', `${t('intake.queueLine1')} ${t('intake.queueLine2')}`, intakeCount, intakeOnly, () => setIntakeOnly((v) => !v), 'user', 'farms-intake'),
        ...queue('neglected', t('farms.filterNeglected'), neglectedCount, neglected, () => setNeglected((v) => !v), 'clock', 'farms-neglected'),
        ...queue('docs', `${t('docs.queueLine1')} ${t('docs.queueLine2')}`, docsCount, docsOnly, () => setDocsOnly((v) => !v), 'document', 'farms-awaiting-docs'),
        ...queue('renew', t('renewal.title'), renewIds.size, renewOnly, () => setRenewOnly((v) => !v), 'clock', 'farms-renewal'),
        ...queue('noOutline', t('farms.filterNoOutline'), noOutlineCount, noOutlineOnly, () => setNoOutlineOnly((v) => !v), 'landPlot', 'farms-no-outline'),
        ...queue('gap', t('farms.filterGap'), gapCount, gapOnly, () => setGapOnly((v) => !v), 'alert', 'farms-area-gap'),
      ],
    },
    {
      key: 'contact',
      title: t('filters.family.contact'),
      options: notContactedCount > 0 ? [{ key: 'notContacted', label: t('farmContacts.notEstablished'), count: notContactedCount, active: notContactedOnly, onToggle: () => setNotContactedOnly((v) => !v), hint: t('farmContacts.filterHint'), testId: 'farms-not-contacted' }] : [],
    },
    {
      key: 'branches',
      title: t('filters.family.branches'),
      testId: 'farms-branches-family',
      options: FARM_BRANCHES.map((k) => ({ key: k, label: branchLabel(t, k), count: branchCountsAll[k], active: branchFilter.includes(k), disabled: branchCountsAll[k] === 0, onToggle: () => toggleBranchFilter(k), testId: `farms-branch-${k}` })),
    },
    {
      key: 'kind',
      title: t('filters.family.kind'),
      options: [
        ...TYPES.map((ft) => ({ key: ft, label: t(`farmType.${ft}`), count: farms.filter((f) => f.type === ft).length, active: type === ft, onToggle: () => setType(type === ft ? null : ft), testId: `farms-type-${ft}` })),
        ...(moshavim.length > 0 ? [{ key: 'moshav', label: t('farms.kpiMoshavim'), count: moshavim.length, active: moshavOnly, onToggle: () => setMoshavOnly((v) => !v), testId: 'kpi-moshavim' }] : []),
      ],
    },
    {
      key: 'areas',
      title: t('filters.family.areas'),
      options: [{ key: 'withAreas', label: t('farms.withAreas'), count: withAreas.length, active: hasAreas, onToggle: () => setHasAreas((v) => !v), hint: t('farms.withAreasHint'), testId: 'kpi-weighted' }],
    },
    regionFilterFamily(t, region, setRegion, regionCounts, 'farms-region'),
    {
      key: 'archive',
      title: t('filters.family.archive'),
      options: archivedFarms.length > 0 ? [{ key: 'archived', label: t('archive.filter'), count: archivedFarms.length, active: archivedOnly, onToggle: () => setArchivedOnly((v) => !v), hint: t('archive.filterHint'), testId: 'farms-archived' }] : [],
    },
    {
      key: 'sort',
      title: t('filters.family.sort'),
      sort: true,
      single: true,
      testId: 'farms-sort-family',
      options: (['name', 'weightedDesc', 'weightedAsc', 'status', 'nextVisit', 'guardsAsc', 'guardsDesc', 'lastGuardOldest', 'areaGapDesc'] as const).map((k) => ({
        key: k,
        label: t(k === 'areaGapDesc' ? 'farms.sortGapDesc' : `farms.sort${k.charAt(0).toUpperCase()}${k.slice(1)}`),
        active: sort === k,
        onToggle: () => setSort(k),
        testId: `farms-sort-${k}`,
      })),
    },
  ].filter((fam) => fam.options.length > 0)
  const compactFilters: CompactFilters = {
    families,
    status: {
      key: 'status',
      title: t('farmMarks.statusTitle'),
      single: true,
      testId: 'farms-status-family',
      options: statusKpis.map((k) => ({
        key: k.status,
        label: t(`farmStatus.${k.status}`),
        count: k.count,
        active: status === k.status,
        onToggle: () => setStatus(status === k.status ? null : k.status),
        dot: <FarmStatusDot status={k.status} />,
        testId: `farm-status-${k.status}`,
      })),
      /* La légende des trois marques du nom, sous les statuts : une phrase au toucher. */
      note: <FarmMarksLegend neglectDays={neglectDays} gapPercent={Math.round(gapThreshold * 100)} wrap />,
    },
    statusAll: { label: t('farms.statusAll'), count: visibleFarmCount },
    activeCount:
      (notContactedOnly ? 1 : 0) +
      (type !== null ? 1 : 0) +
      (moshavOnly ? 1 : 0) +
      (region !== null ? 1 : 0) +
      (hasAreas ? 1 : 0) +
      (neglected ? 1 : 0) +
      (gapOnly ? 1 : 0) +
      (noOutlineOnly ? 1 : 0) +
      (renewOnly ? 1 : 0) +
      (docsOnly ? 1 : 0) +
      (intakeOnly ? 1 : 0) +
      (archivedOnly ? 1 : 0) +
      branchFilter.length,
    onClear: () => {
      setStatus(null)
      setNotContactedOnly(false)
      setType(null)
      setMoshavOnly(false)
      setRegion(null)
      setHasAreas(false)
      setNeglected(false)
      setIntakeOnly(false)
      setGapOnly(false)
      setNoOutlineOnly(false)
      setRenewOnly(false)
      setDocsOnly(false)
      setArchivedOnly(false)
      setBranchFilter([])
    },
    results: filtered.filter((f) => !isTestId(f.id)).length,
  }

  const top = (extra?: React.ReactNode) => (
    <ListTop
      compactFilters={compactFilters}
      wideChildren={extra}
      testId="farms-top"
      title={t('farms.title')}
      shown={filtered.filter((f) => !isTestId(f.id)).length}
      total={farms.filter((f) => !isTestId(f.id)).length}
      menu={menu}
      /* AA6 — on a wide screen the order sits with the search and the « ⋯ »,
         on the one row that already has the room. See `sortControl`. */
      actions={!phone ? sortControl : undefined}
      search={query}
      onSearch={setQuery}
      searchPlaceholder={t('farms.searchPlaceholder')}
      kpis={kpiChips}
      filters={filterRow}
      /* ★★ AX3.5 — le seul vrai CHIFFRE de la liste : il suit les filtres. */
      stat={t('farms.statDunams', {
        /* ★★ AZ3.4 — le jeu d'essai ne compte pas dans les dounams (AH3.5). */
        n: filtered.filter((f) => !isTestId(f.id)).reduce((sum, f) => sum + effectiveAreas(f).total, 0).toLocaleString(locale),
        w: totalWeightedDunams(filtered.filter((f) => !isTestId(f.id))).toLocaleString(locale),
      })}
      info={
        <>
          <p>{t('farms.info')}</p>
          <ul className="mt-1.5 list-disc ps-5">
            <li>{t('farms.filterNeglectedHint', { days: neglectDays })}</li>
            <li>{t('renewal.hint')}</li>
            <li>{t('farms.filterNoOutlineHint')}</li>
            <li>{t('farms.filterGapHint', { percent: Math.round(gapThreshold * 100) })}</li>
            <li>{t('farms.withAreasHint')}</li>
          </ul>
        </>
      }
    />
  )

  return (
    <MapPanel
      /* ★★ BC — écran de liste : liste ↔ carte au téléphone, carte à côté en tablette. */
      list
      screenKey="farms"
      ariaLabel={t('map.farmsMap')}
      markers={markers}
      /* ★★ BF — seul un filtre recadre ; une relecture, jamais. */
      fitScope={JSON.stringify([status, type, moshavOnly, region, hasAreas, neglected, gapOnly, noOutlineOnly, renewOnly, docsOnly, intakeOnly, notContactedOnly, branchFilter, query.trim()])}
      polygons={zonePolygons(zones, farms)}
      threatZones={threatZoneShapes(threatZones)}
      threatVectors={threatVectorShapes(threatVectors)}
      legend={
        <>
        <ThreatLegend zones={threatZones} vectors={threatVectors} className="mb-2" />
        <ZoneLegend zones={zones} farms={farms} className="mb-2" />
        {/* ★★ AX3.4 — la légende dit ce que veulent dire les COULEURS ; les
            comptes sont dans le filtre de statut, à un seul endroit. */}
        {/* ★★ BD 5 — les statuts présents sur la carte, avec leur compte ; les vides repliés. */}
        <StatusLegend statuses={filtered.filter((f) => !f.positionMissing).map((f) => f.status)} />
        {/* ★★ BA — les deux autres marques du nom, avec leur phrase écrite :
            une légende se lit, elle ne se survole pas. */}
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-edge-subtle pt-2" data-testid="map-legend-marks">
          <li className="flex items-start gap-2 text-caption text-content-secondary">
            <span className="mt-1 inline-flex shrink-0 items-center gap-0.5">
              <span className="inline-block size-2 rounded-pill border border-status-warn-ink/70" />
              <span className="inline-block size-2 rounded-pill border border-status-warn-ink/70 bg-status-warn-ink/25" />
            </span>
            {t('farmMarks.neglectSentence', { days: neglectDays })}
          </li>
          <li className="flex items-start gap-2 text-caption text-content-secondary">
            <span className="mt-1 inline-block size-2 shrink-0 rounded-[2px] border border-status-warn-ink/70 bg-status-warn-ink/45" />
            {t('farmMarks.gapSentence', { percent: Math.round(gapThreshold * 100) })}
          </li>
        </ul>
        </>
      }
      detailAt={selected ? { position: selected.position, key: previewKey } : undefined}
      detail={
        /* ★★ AZ2.2 — l'aperçu ancré dit déjà tout : pas de seconde fiche sur l'épingle. */
        selected && selected.id !== previewId && (
          <EntityQuickCard
            farm={selected}
            posts={postsOf(selected.id)}
            onClose={() => select(null)}
            situate
          />
        )
      }
    >
      {({ mode }) => (
        /* ★★ AY3 — LA FORME COMMUNE, dans les deux lectures : le tableau
           (photo · nom, colonnes, gestes au bout) ; à côté de la carte, la même
           liste se resserre en lignes à deux étages. Toucher une ligne ouvre
           l'APERÇU ; la fiche complète est à un geste (↗). */
        <>
          {top(
            <FarmStatusBand
              counts={statusKpis}
              value={status}
              onChange={setStatus}
              neglectDays={neglectDays}
              gapPercent={Math.round(gapThreshold * 100)}
            />,
          )}
          {filtered.length === 0 ? (
            <EmptyState icon="farm" title={t('farms.empty')} />
          ) : (
            <EntityTable
              rows={sorted}
              rowKey={(f) => f.id}
              lead={(f) => ({
                title: f.name,
                /* ★★ BA — l'agriculteur (rang 1), sous le nom de la ferme : le PO
                   cherche une PERSONNE autant qu'une exploitation. */
                person: farmPersonName(f) || undefined,
                /* ★★ BC — « ליד … », après la ferme et l'agriculteur. */
                near: nearestLocalityOf(f) ? t('farms.near', { place: nearestLocalityOf(f)!.name }) : undefined,
                phone: farmPersonPhone(f) || undefined,
                photo: f.photo,
                shape: 'square',
                dot: <FarmStatusDot status={f.status} />,
                marks: (
                  <>
                    <NeglectMark coverage={coverageOf.get(f.id) ?? null} neglectDays={neglectDays} />
                    <AreaGapMark farm={f} />
                    <TestDataBadge id={f.id} />
                  </>
                ),
                alwaysTestId: isIncoming(f) ? 'farm-tile-intake' : undefined,
                always: isIncoming(f)
                  ? [`${t('intake.tag')}${requestForFarm(f.id, intakeRequests)?.createdAt ? ` · ${t('intake.received', { when: formatRelative(requestForFarm(f.id, intakeRequests)!.createdAt, locale) })}` : ''}`]
                  : undefined,
              })}
              leadLabel={t('missions.farm')}
              leadSort={(f) => f.name}
              columns={farmColumns}
              sort={tableSort}
              onSort={onTableSort}
              onPreview={(f) => {
                setPreviewId(f.id)
                select(f.id)
              }}
              activeKey={previewId}
              actions={farmActions}
              phoneEnd={(f) => <FarmStatusChip status={f.status} />}
              rowTone={(f) => (isIncoming(f) ? 'border-s-4 border-s-farm-incoming-request bg-farm-incoming-request/10' : undefined)}
              rowAttrs={(f) => ({ 'data-testid': `farm-row-${f.id}`, 'data-intake': isIncoming(f) ? 'true' : undefined })}
              label={t('farms.title')}
              testId="farms-table"
              tiles={mode !== 'hidden'}
              tileTestId="farm-tile"
              /* ★★ AQ1.2 — la demande entrante, distincte aussi en vignette. */
              tileTone={(f) => (isIncoming(f) ? 'farm-tile-intake bg-farm-incoming-request/10 ring-2 ring-farm-incoming-request' : undefined)}
              where={(f) => [f.locality, regionLabel(f)].filter(Boolean).join(' · ')}
              hidden={mode !== 'hidden' && !!preview}
            />
          )}
          {farmSettings.dialog}
          {preview && <FarmPreview farm={preview} posts={postsOf(preview.id)} coverage={coverageOf.get(preview.id) ?? null} onClose={() => { setPreviewId(null); select(null) }} docked={mode !== 'hidden'} />}
        </>
      )}
    </MapPanel>
  )
}

export type FarmSort =
  | 'name'
  | 'weightedDesc'
  | 'weightedAsc'
  | 'status'
  | 'nextVisit'
  /** AC4.4 — « qui est servi et qui est oublié ». */
  | 'guardsAsc'
  | 'guardsDesc'
  | 'lastGuardOldest'
  /** AD2.6 — « trier par écart », comme pour les fermes oubliées. */
  | 'areaGapDesc'

function sortFarms(
  farms: Farm[],
  sort: FarmSort,
  coverageOf: ReadonlyMap<string, FarmCoverage>,
  gapThreshold: number,
): Farm[] {
  const next = [...farms]
  const guardsOf = (f: Farm) => coverageOf.get(f.id)?.stats.guards ?? 0
  switch (sort) {
    /**
     * ★★ AD2.6 — « TRIER PAR ÉCART », ET L'ÉCART EST UNE PROPORTION.
     *
     * ⚠️ PAS EN DOUNAMS. Un mochav de 20 000 dounams qui se trompe de 5 % pèse
     *    mille dounams et n'a probablement rien à trancher ; un petit
     *    exploitant qui déclare le double de son contour pèse trois cents et
     *    c'est exactement le dossier qu'il ne faut pas remettre en l'état. La
     *    question du PO est « qui a un problème », pas « qui est grand ».
     *
     * Les fiches sans note valent zéro (`areaGapRatio`) : elles se rangent
     * derrière, dans l'ordre où elles étaient, sans se mélanger à celles qui
     * parlent.
     */
    case 'areaGapDesc':
      return next.sort(
        (a, b) => areaGapRatio(b, gapThreshold) - areaGapRatio(a, gapThreshold),
      )
    /**
     * ★★ AC4.4 — « LE MOINS SERVI D'ABORD » IS THE ORDER THE DECISION IS MADE
     *    IN, so it is the one that reads first in the list.
     *
     * ⚠️ TIES BREAK ON THE LAST GUARD, NOT ON THE NAME. Two hundred farms at
     *    zero guards sorted alphabetically is a list where the answer to « who
     *    next » is always the same farm; among equals, the one nobody has been
     *    to for longest comes first, and « never » is the longest of all.
     */
    case 'guardsAsc':
      return next.sort((a, b) => guardsOf(a) - guardsOf(b) || oldestFirst(a, b, coverageOf))
    case 'guardsDesc':
      return next.sort((a, b) => guardsOf(b) - guardsOf(a))
    /* « Jamais » sorts as infinitely old — see `sinceOf`. */
    case 'lastGuardOldest':
      return next.sort((a, b) => oldestFirst(a, b, coverageOf))
    case 'weightedDesc':
      return next.sort((a, b) => weightedDunams(b) - weightedDunams(a))
    case 'weightedAsc':
      return next.sort((a, b) => weightedDunams(a) - weightedDunams(b))
    case 'status':
      return next.sort(
        (a, b) => STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status),
      )
    case 'nextVisit': {
      const at = (f: Farm) =>
        f.nextVisitAt ? new Date(f.nextVisitAt).getTime() : Infinity
      return next.sort((a, b) => at(a) - at(b))
    }
    default:
      return next.sort((a, b) => a.name.localeCompare(b.name, 'he'))
  }
}

/**
 * Days since the last guard, with « never » as the OLDEST value there is.
 *
 * ⚠️ `Infinity` AND NOT A LARGE NUMBER. A farm nobody has ever guarded is not
 *    « nine hundred days ago »; it is a different state, and the only ordering
 *    that is right for it in both directions is the unbounded one.
 */
function sinceOf(farm: Farm, coverageOf: ReadonlyMap<string, FarmCoverage>): number {
  const stats = coverageOf.get(farm.id)?.stats
  if (!stats || stats.guards === 0) return Infinity
  return stats.daysSinceLastGuard ?? Infinity
}

/**
 * ⚠️ COMPARED, NOT SUBTRACTED. Two farms that have never been guarded are both
 *    `Infinity`, and `Infinity - Infinity` is `NaN` — a comparator that
 *    returns NaN leaves the engine free to do anything, which is how a list
 *    ends up in a different order every time it is filtered.
 */
function oldestFirst(
  a: Farm,
  b: Farm,
  coverageOf: ReadonlyMap<string, FarmCoverage>,
): number {
  const x = sinceOf(a, coverageOf)
  const y = sinceOf(b, coverageOf)
  if (x === y) return 0
  return x > y ? -1 : 1
}

/**
 * G7 → X5 — the roster reading of the farms: one row per farm, window-
 * virtualised, with a sticky header. The columns are the shared roster grid
 * (`.roster` / `.roster-farms` in index.css), so header and rows cannot drift
 * and the tiers are asked of the TABLE's own width rather than the window's.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AC4.5 — « UN SIGNAL VISUEL SOBRE », ET SOBRE EST LE MOT QUI DÉCIDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A hollow ring, in the warning ink, 8 px, with its reason in the tooltip and
 * in `aria-label`. NOT a red badge and not a coloured row: the status dot two
 * characters to its left already owns the row's colour, and a second full-
 * strength signal beside it turns a roster into a warning panel where nothing
 * stands out because everything does.
 *
 * ⚠️ HOLLOW AND NOT FILLED, and that is the distinction it carries: `never`
 *    is a farm that has had nothing at all, `stale` one that had something a
 *    long time ago. Two shapes of the same mark, one glance apart.
 */
function NeglectMark({
  coverage,
  neglectDays,
}: {
  coverage: FarmCoverage | null
  neglectDays: number
}) {
  const { t } = useTranslation()
  if (!coverage) return null
  if (coverage.state !== 'never' && coverage.state !== 'stale') return null
  const label =
    coverage.state === 'never'
      ? t('farms.neglectedNever')
      : t('farms.neglectedStale', { days: coverage.stats.daysSinceLastGuard ?? neglectDays })
  return (
    <span
      data-testid="farm-neglect"
      data-neglect={coverage.state}
      title={label}
      aria-label={label}
      /* AL4.1 — `rounded-pill` et non `rounded-full` : sur une pastille de 8 px
         les deux dessinent le MÊME disque (`--radius-pill` vaut 999 px), et
         A28 n'a qu'une échelle. C'était la dernière violation de radius. */
      className={`inline-block size-2 shrink-0 rounded-pill border border-status-warn-ink/70 ${
        coverage.state === 'never' ? '' : 'bg-status-warn-ink/25'
      }`}
    />
  )
}

/**
 * ★★ AX9 — « Si l'application sait classer, elle doit savoir afficher. » La
 * colonne disait `farm.region` (texte libre, vide sur les fiches importées)
 * quand le filtre classait par `farmRegion` (la région choisie, sinon le
 * polygone du point). Une seule règle désormais : celle qui classe.
 */
export function regionLabel(farm: Farm): string {
  const id = farmRegion(farm)
  return (id ? regionById(id)?.name : null) ?? farm.region ?? ''
}

/** ★★ AY3 — le tri du tableau commun ↔ le tri des fermes (qui a ses ordres propres). */
function farmSortToTable(sort: FarmSort): { key: string; dir: 'asc' | 'desc' } {
  switch (sort) {
    case 'weightedDesc':
      return { key: 'weighted', dir: 'desc' }
    case 'weightedAsc':
      return { key: 'weighted', dir: 'asc' }
    case 'guardsAsc':
      return { key: 'guards', dir: 'asc' }
    case 'guardsDesc':
      return { key: 'guards', dir: 'desc' }
    case 'status':
      return { key: 'status', dir: 'asc' }
    case 'nextVisit':
      return { key: 'nextVisit', dir: 'asc' }
    case 'name':
      return { key: 'name', dir: 'asc' }
    default:
      return { key: sort, dir: 'desc' }
  }
}
function tableToFarmSort(s: { key: string; dir: 'asc' | 'desc' }): FarmSort {
  if (s.key === 'weighted') return s.dir === 'asc' ? 'weightedAsc' : 'weightedDesc'
  if (s.key === 'guards') return s.dir === 'asc' ? 'guardsAsc' : 'guardsDesc'
  if (s.key === 'status' || s.key === 'nextVisit') return s.key
  return 'name'
}

/**
 * ★★ AY3.3 — L'APERÇU D'UNE FERME : la carte épinglée (son contour, ses
 * points), le statut, les chiffres qui comptent, les gens et leurs numéros.
 * « לכרטיס המלא » ouvre la fiche, « עריכה » le formulaire.
 */
function FarmPreview({ farm, posts, coverage, onClose, docked }: { farm: Farm; posts: number; coverage: FarmCoverage | null; onClose: () => void; docked?: boolean }) {
  const { t } = useTranslation()
  const locale = useLocale()
  const areas = effectiveAreas(farm)
  const heads = totalHeads(farm)
  const n = (x: number) => x.toLocaleString(locale)
  return (
    <PreviewPanel
      docked={docked}
      title={farm.name}
      subtitle={[farm.locality, regionLabel(farm), t(`farmType.${farm.type}`)].filter(Boolean).join(' · ')}
      photo={farm.photo}
      shape="square"
      position={farm.positionMissing ? null : farm.position}
      editTo={`/coordinator/farms/${farm.id}/edit`}
      openTo={`/coordinator/farms/${farm.id}`}
      onClose={onClose}
      testId="farm-preview"
      chips={<FarmStatusChip status={farm.status} />}
      quick={
        <Link to={`/coordinator/missions/new?farm=${farm.id}`} className="btn-secondary min-h-11" data-testid="farm-preview-guard">
          <Icon name="shield" size={16} />
          {t('farms.newGuardHere')}
        </Link>
      }
    >
      <div className="mb-5 grid grid-cols-3 gap-2">
        {[
          { v: n(weightedDunams(farm)), l: t('farms.colWeighted') },
          { v: n(coverage?.stats.guards ?? 0), l: t('farms.colGuards') },
          { v: n(posts), l: t('preview.posts') },
        ].map((x) => (
          <div key={x.l} className="rounded-card bg-surface-raised p-2.5 text-center shadow-card">
            <p className="numeric text-title font-bold text-content-primary">{x.v}</p>
            <p className="text-micro text-content-muted">{x.l}</p>
          </div>
        ))}
      </div>
      <PreviewSection title={t('preview.details')}>
        {/* ★★ BC — le repère (« ליד … ») et la nature, en lecture ; ils se corrigent sur la fiche. */}
        <PreviewRow label={t('nearest.short')}>{nearestLocalityOf(farm)?.name ?? ''}</PreviewRow>
        <PreviewRow label={t('branches.title')}>{(farm.branches ?? []).length > 0 ? <BranchChips entity={farm} testId="farm-preview-branches" /> : ''}</PreviewRow>
        <PreviewRow label={t('farms.colDunams')}>{`${n(areas.cultivated)} / ${n(areas.grazing)}`}</PreviewRow>
        <PreviewRow label={t('livestock.heads')}>{heads ? n(heads) : ''}</PreviewRow>
        <PreviewRow label={t('farms.nextVisit')}>{farm.nextVisitAt ? formatDate(farm.nextVisitAt, locale) : ''}</PreviewRow>
        <PreviewRow label={t('preview.lastGuard')}>{coverage?.stats.lastGuardAt ? formatDate(coverage.stats.lastGuardAt, locale) : ''}</PreviewRow>
      </PreviewSection>
      {farm.contacts.length > 0 && (
        <PreviewSection title={t('people.section')}>
          {farm.contacts.map((c) => (
            <div key={c.id} className="flex items-center gap-2 border-b border-edge-subtle/60 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-semibold text-content-primary">{c.name}</span>
                <span className="muted block truncate text-micro">{c.role || (c.isPrimary ? t('people.primary') : t('people.other'))}</span>
                <CallRestrictionChip contact={c} full />
              </span>
              {c.phone && (
                <a
                  href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}
                  onClick={guardCall(null, t, c)}
                  className={`${callTone(null, 'btn-ghost', c)} h-11 w-11 min-w-0 justify-center p-0`}
                  aria-label={t('people.call')}
                  data-guarded={isCallGuarded(null, c) ? '' : undefined}
                  data-testid="farm-preview-contact-call"
                >
                  <Icon name={isCallGuarded(null, c) ? 'alert' : 'phone'} size={16} />
                </a>
              )}
            </div>
          ))}
        </PreviewSection>
      )}
      {farm.notes && (
        <PreviewSection title={t('form.notes')}>
          <p className="whitespace-pre-wrap py-2 text-caption" dir="auto">{farm.notes}</p>
        </PreviewSection>
      )}
    </PreviewPanel>
  )
}
