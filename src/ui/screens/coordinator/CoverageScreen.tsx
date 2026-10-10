import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  COVERAGE_PRESETS,
  DEFAULT_RADIUS_KM,
  INSTITUTION_ENGAGEMENTS,
  RADIUS_MAX_KM,
  RADIUS_MIN_KM,
  clampRadiusKm,
  airBoundKm,
  computeCoverage,
  farmPoint,
  linkMinutes,
  getInstitutions,
  getVisibleFarms,
  getVisibleLeads,
  haversineKm,
  isInstitutionEngaged,
  isInstitutionToConfirm,
  updateInstitution,
} from '@core/index'
import type { CoverageFamily, Farm, Institution, InstitutionEngagement, LatLng, Visible } from '@core/index'
import type { PairRoad } from '@core/roadMesh'

import { readToken } from '../../components/badges'
import { EntityQuickCard } from '../../components/EntityQuickCard'
import { ChevronForward, Icon } from '../../components/Icon'
import { MapPanel } from '../../components/MapPanel'
import type { MapLink, MapMarker, MapRouteLine } from '../../components/MapView'
import { FilterPill, PageHeader, Section } from '../../components/primitives'
import { ENGAGEMENT_ON, InstitutionEditor } from '../../institutions/institutionUi'
import { useCoreValue } from '../../hooks/useCore'
import { measureMeshPair } from '../../routing/roadNetwork'
import { meshPair, requestMeshPairs, useRoadMesh } from '../../routing/roadMesh'
import { useRouteMargin } from '../../settings/routeMargin'
import { onSettingsApplied } from '../../settings/applied'
import { InfoTip } from '../../components/InfoTip'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AU4 (2026-10-08) — LA CARTE DE COUVERTURE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La stratégie d'affectation du PO rendue visible, et sa carte de démarchage.
 *
 * ★ UN LANGAGE EN TROIS VARIABLES, POUR SE PASSER DE LÉGENDE :
 *     la TEINTE dit le côté      — sarcelle = terres, violet = institutions ;
 *     la FORME dit la chose      — épingle = ferme, carré à toque = institution,
 *                                  petit rond pointillé = piste ;
 *     le REMPLISSAGE dit l'acquis — plein = à moi, creux = à conquérir.
 *   Les liens suivent la même règle : trait plein = couverture réelle, tirets =
 *   couverture possible. Les interrupteurs du panneau portent le même dessin
 *   que la carte : ils SONT la légende.
 *
 * ★ DEUX USAGES, UN GESTE CHACUN (onglets en tête) :
 *   « פגישה » — le parc et les institutions engagées, NOMMÉES sur la carte ;
 *   rien d'interne (pistes, comptes de pistes sans lieu) : l'écran se montre.
 *   « הכנה » — tout, pistes comprises, avec ce qui manque.
 *   Toucher un interrupteur fait passer en « מותאם » sans rien perdre.
 *
 * ★★ LA DISTANCE — AW1 (2026-10-09), QUI ANNULE AU4.6. « À 35 km, TOUT est
 *   relié à TOUT » : le vol d'oiseau filtrait, et la route fait +69 % dans la
 *   zone. Désormais TOUTES les paires sont mesurées sur la route, hors ligne
 *   (`routing/roadMesh.ts` : une fois, gardées sur l'appareil, seules les
 *   paires neuves ou déplacées recalculées, progression affichée). Le vol
 *   d'oiseau n'écarte que l'impossible. Chaque lien porte ses kilomètres
 *   routiers et sa durée ; un lien dont la seule route franchit la Ligne verte
 *   est en pointillé d'alerte, et ne compte pas.
 *
 * ⛔ AUCUN DE CES COMPTEURS N'EST UN COMPTEUR D'OBJECTIF NI DE DOUNAMS : ils
 *    comptent des lieux atteints. Les pistes n'entrent dans aucun (AS6.8).
 */

/**
 * ⚠️★★ AX (2026-10-10) — UNE CLÉ À ELLE. Cet écran écrivait `lo-yanum:coverage`,
 *    que le réglage « פריסת שמירות » (`settings/coverage.ts`, le seuil des
 *    fermes oubliées) écrit AUSSI : chacun effaçait l'autre, et ouvrir cette
 *    carte remettait le seuil à son défaut — synchronisé vers l'autre
 *    appareil. Lue une fois depuis l'ancienne clé (rayon, familles), puis plus
 *    jamais touchée.
 */
const PREFS_KEY = 'lo-yanum:coverage-map'
const LEGACY_PREFS_KEY = 'lo-yanum:coverage'
type Usage = 'meeting' | 'prepare' | 'custom'
/** ★★ AX7 — la borne : kilomètres de route, ou minutes de trajet. */
type Unit = 'km' | 'min'
export const DEFAULT_LIMIT_MINUTES = 35
export const NIGHT_PCT_INITIAL = 0
type Focus = null | 'covered' | 'uncovered' | 'potential'
type Selected = { kind: 'farm' | 'lead' | 'institution'; id: string } | null

interface Prefs {
  radiusKm: number
  /** ★★ AX7 — la borne en minutes, gardée même quand l'unité choisie est le km. */
  minutes: number
  unit: Unit
  /**
   * ★★ AX7.2 — LA NUIT. Les gardes sont de nuit. La durée de base suppose des
   * routes VIDES (vitesses de circulation libre par type de route) — c'est
   * déjà la nuit pour le trafic ; ce pourcentage, que le PO règle, ajoute ce
   * que la nuit coûte en plus : routes non éclairées, pistes, barrages.
   */
  nightPct: number
  visible: Visible
}

function parsePrefs(raw: string | null): Partial<Prefs> | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as Partial<Prefs>
  } catch {
    return null
  }
}
function readPrefs(): Prefs {
  try {
    const p = parsePrefs(localStorage.getItem(PREFS_KEY)) ?? parsePrefs(localStorage.getItem(LEGACY_PREFS_KEY)) ?? {}
    const minutes = Number(p.minutes)
    const night = Number(p.nightPct)
    return {
      radiusKm: clampRadius(Number(p.radiusKm) || DEFAULT_RADIUS_KM),
      minutes: Number.isFinite(minutes) && minutes >= 1 ? Math.round(minutes) : DEFAULT_LIMIT_MINUTES,
      unit: p.unit === 'min' ? 'min' : 'km',
      nightPct: Number.isFinite(night) && night >= 0 && night <= 200 ? Math.round(night) : NIGHT_PCT_INITIAL,
      visible: { ...COVERAGE_PRESETS.prepare, ...(p.visible ?? {}) },
    }
  } catch {
    /* une préférence perdue n'est qu'un retour au défaut */
  }
  return { radiusKm: DEFAULT_RADIUS_KM, minutes: DEFAULT_LIMIT_MINUTES, unit: 'km', nightPct: NIGHT_PCT_INITIAL, visible: COVERAGE_PRESETS.prepare }
}
function writePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* idem */
  }
}
/* ★ AW1.7 — AUCUN PLAFOND : la réglette s'arrête à RADIUS_MAX_KM, le champ chiffré non. */
const clampRadius = clampRadiusKm

function usageOf(v: Visible): Usage {
  const same = (a: Visible, b: Visible) => (Object.keys(a) as CoverageFamily[]).every((k) => a[k] === b[k])
  if (same(v, COVERAGE_PRESETS.meeting)) return 'meeting'
  if (same(v, COVERAGE_PRESETS.prepare)) return 'prepare'
  return 'custom'
}

// --- La route d'une paire, tracé compris (mémoire de la page) -----------------

/**
 * Le TRACÉ d'une paire n'est pas gardé sur l'appareil (seuls km et durée le
 * sont) : toucher une ferme le redemande, et le graphe déjà chargé répond en
 * dizaines de millisecondes.
 */
const traceCache = new Map<string, LatLng[]>()
const traceKey = (a: LatLng, b: LatLng) => `${a.lat.toFixed(5)},${a.lng.toFixed(5)}>${b.lat.toFixed(5)},${b.lng.toFixed(5)}`
function useTrace(from: LatLng | null | undefined, to: LatLng | null | undefined): LatLng[] {
  const [, bump] = useState(0)
  const key = from && to ? traceKey(from, to) : ''
  useEffect(() => {
    if (!from || !to || traceCache.has(key)) return
    let alive = true
    void measureMeshPair(from, to).then((r) => {
      if (r && r.kind !== 'none' && r.coords) traceCache.set(key, r.coords)
      if (alive) bump((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return traceCache.get(key) ?? []
}

/**
 * « 23 ק״מ · 28 דק׳ » — TOUJOURS les deux (AX7.3), quelle que soit la borne.
 * La durée = la route (vitesses de circulation libre) × la marge du PO
 * (AI3.2) × la tenue de nuit (AX7.2).
 */
export function useLinkLabel(nightPct = 0): (km: number, seconds: number) => string {
  const { t } = useTranslation()
  const factor = useTimeFactor(nightPct)
  return (km, seconds) => t('coverage.linkLabel', { km: km.toFixed(km < 10 ? 1 : 0), min: linkMinutes(seconds, factor) })
}
export function useTimeFactor(nightPct: number): number {
  const margin = useRouteMargin()
  return (1 + margin / 100) * (1 + nightPct / 100)
}

// --- L'écran ------------------------------------------------------------------

export function CoverageScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(() => getVisibleFarms())
  const leads = useCoreValue(() => getVisibleLeads())
  const institutions = useCoreValue(() => getInstitutions())
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs)
  /* ⚠️ ÉCRIT SUR UN GESTE, PAS AU MONTAGE : une clé synchronisée réécrite à
     chaque ouverture deviendrait « la plus récente » et écraserait le choix
     fait sur l'autre appareil. */
  const setPrefs = (f: (p: Prefs) => Prefs) =>
    setPrefsState((p) => {
      const next = f(p)
      writePrefs(next)
      return next
    })
  /* ★ AS4 — un choix fait sur l'autre appareil arrive ici. */
  useEffect(() => onSettingsApplied([PREFS_KEY], () => setPrefsState(readPrefs())), [])
  const margin = useRouteMargin()
  const factor = useTimeFactor(prefs.nightPct)
  const limitMinutes = prefs.unit === 'min' ? { minutes: prefs.minutes, factor } : null
  const airBound = airBoundKm({ radiusKm: prefs.radiusKm, limitMinutes })
  const limitText = prefs.unit === 'min' ? t('coverage.minutes', { min: prefs.minutes }) : t('coverage.km', { km: prefs.radiusKm })
  const [focus, setFocus] = useState<Focus>(null)
  /* ★★ AX1 — ouverte depuis l'écran מוסדות : l'institution arrive choisie. */
  const [selected, setSelected] = useState<Selected>(() => {
    const inst = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('inst')
    return inst ? { kind: 'institution', id: inst } : null
  })
  const [selectKey, setSelectKey] = useState(0)
  const [routeTo, setRouteTo] = useState<string | null>(null)
  /* ★ AV1 — `null` = automatique : « לאשר » tant qu'il en reste, sinon « הכול ».
     Décidé à CHAQUE rendu et non au premier : l'hydratation arrive après,
     et un choix figé sur une liste encore vide changeait selon la vitesse
     du réseau (vu par `auui` sur le déployé). Le choix du PO, lui, reste. */
  const [chosenFilter, setListFilter] = useState<ListFilter | null>(null)
  const toConfirmCount = institutions.filter(isInstitutionToConfirm).length
  const listFilter: ListFilter = chosenFilter ?? (toConfirmCount > 0 ? 'toConfirm' : 'all')
  const usage = usageOf(prefs.visible)

  const selectedInst = selected?.kind === 'institution' ? (institutions.find((i) => i.id === selected.id) ?? null) : null

  /* ★★ AW1 — LES PAIRES À MESURER SUR LA ROUTE : toute institution placée ×
     toute ferme affichable que le vol d'oiseau laisse dans le rayon. Les
     paires déjà gardées ne coûtent rien ; les autres partent dans la file. */
  const mesh = useRoadMesh()
  const linkLabel = useLinkLabel(prefs.nightPct)
  const wanted = useMemo(() => {
    const out: Array<{ from: LatLng; to: LatLng }> = []
    const pts: LatLng[] = []
    for (const f of farms) {
      const p = farmPoint(f)
      if (!p) continue
      const fam = f.status === 'signed' || f.status === 'active' ? 'signed' : ['incoming_request', 'to_contact', 'contacted', 'visited', 'verbal_ok'].includes(f.status) ? 'pipeline' : null
      if (fam && prefs.visible[fam]) pts.push(p)
    }
    for (const i of institutions) {
      if (!i.position || i.engagement === 'not_relevant') continue
      for (const p of pts) if (haversineKm(i.position, p) <= airBound) out.push({ from: i.position, to: p })
    }
    return out
  }, [farms, institutions, airBound, prefs.visible])
  const wantedKey = wanted.map((w) => `${w.from.lat},${w.from.lng}>${w.to.lat},${w.to.lng}`).join('|')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    requestMeshPairs(wanted)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey, retry])

  const coverage = useMemo(
    () =>
      computeCoverage({
        farms,
        leads,
        institutions,
        radiusKm: prefs.radiusKm,
        limitMinutes,
        visible: prefs.visible,
        road: (from, to) => meshPair(from, to),
      }),
    // `mesh.version` : une paire mesurée recompose le dessin et les compteurs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [farms, leads, institutions, prefs, mesh.version, factor],
  )

  const land = readToken('--status-success')
  const school = readToken('--status-violet')

  const shownFarm = (id: string): boolean => {
    if (!focus) return true
    const r = coverage.reach.get(id)
    if (!r) return true
    if (focus === 'covered') return r.real > 0
    if (focus === 'uncovered') return r.real === 0
    return r.real === 0 && r.potential > 0
  }

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = []
    for (const p of coverage.places) {
      const isSel = selected?.id === p.id
      const pick = () => {
        setSelected({ kind: p.family === 'leads' ? 'lead' : p.family === 'engaged' || p.family === 'prospect' ? 'institution' : 'farm', id: p.id })
        setSelectKey((k) => k + 1)
        setRouteTo(null)
      }
      if (p.family === 'signed' || p.family === 'pipeline') {
        if (!shownFarm(p.id)) continue
        out.push({ id: p.id, position: p.position, color: land, title: p.name, kind: 'farm', hollow: p.family === 'pipeline', emphasis: isSel, essential: isSel, onSelect: pick })
      } else if (p.family === 'leads') {
        out.push({ id: p.id, position: p.position, color: land, title: p.name, kind: 'lead', emphasis: isSel, onSelect: pick })
      } else {
        const inst = institutions.find((i) => i.id === p.id)
        out.push({
          id: p.id,
          position: p.position,
          color: school,
          title: p.name,
          kind: 'institution',
          hollow: p.family === 'prospect',
          uncertain: inst?.positionUncertain,
          // ★ En rendez-vous, les engagées sont NOMMÉES ; une à démarcher l'est quand on la choisit.
          label: p.family === 'engaged' || isSel ? p.name : undefined,
          emphasis: isSel,
          onSelect: pick,
        })
      }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coverage, selected?.id, focus, land, school, institutions])

  const links: MapLink[] = useMemo(
    () =>
      coverage.links
        .filter((l) => shownFarm(l.farmId))
        // Une institution choisie : seuls ses liens, épaissis.
        .filter((l) => !selectedInst || l.institutionId === selectedInst.id)
        .map((l) => ({
          from: l.from,
          to: l.to,
          tone: l.blocked ? ('blocked' as const) : l.tone,
          color: school,
          emphasis: !!selectedInst,
          label: `${l.blocked || l.fastestBeyond ? '⚠ ' : ''}${linkLabel(l.km, l.seconds)}`,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverage, selectedInst, focus, school, linkLabel],
  )

  const routeFarm = routeTo ? farms.find((x) => x.id === routeTo) : undefined
  const trace = useTrace(routeTo ? selectedInst?.position : null, routeFarm ? farmPoint(routeFarm) : null)
  const routeLines: MapRouteLine[] = useMemo(
    () => (trace.length > 1 ? [{ coords: trace, style: 'road' as const }] : []),
    [trace],
  )

  const setVisible = (family: CoverageFamily, on: boolean) => setPrefs((p) => ({ ...p, visible: { ...p.visible, [family]: on } }))
  const choose = (u: Usage) => {
    if (u === 'custom') return
    setPrefs((p) => ({ ...p, visible: COVERAGE_PRESETS[u] }))
    setFocus(null)
  }

  const selectedPlace = selected ? coverage.places.find((p) => p.id === selected.id) : undefined
  const selectedFarm = selected?.kind === 'farm' ? farms.find((f) => f.id === selected.id) : undefined
  const selectedLead = selected?.kind === 'lead' ? leads.find((l) => l.id === selected.id) : undefined

  const detail: ReactNode = selectedFarm ? (
    <EntityQuickCard farm={selectedFarm} onClose={() => setSelected(null)} situate />
  ) : selectedInst ? (
    <InstitutionCard inst={selectedInst} reach={coverage.links.filter((l) => l.institutionId === selectedInst.id && !l.blocked)} onClose={() => setSelected(null)} />
  ) : selectedLead ? (
    <div className="w-[min(18rem,calc(100vw-2rem))] rounded-card bg-surface-overlay/95 p-4 shadow-lift backdrop-blur" data-testid="coverage-lead-card">
      <p className="text-heading text-content-primary">{selectedLead.name}</p>
      <p className="muted mt-0.5">{[selectedLead.contactName, selectedLead.place].filter(Boolean).join(' · ')}</p>
      <p className="mt-2 text-caption text-content-secondary">{t('coverage.leadNotCounted')}</p>
      <Link to="/coordinator/leads" className="btn-secondary mt-3 w-full">
        {t('coverage.openLeads')}
      </Link>
    </div>
  ) : null

  const c = coverage.counts
  const meeting = usage === 'meeting'

  return (
    <MapPanel
      screenKey="coverage"
      ariaLabel={t('coverage.mapLabel')}
      markers={markers}
      links={links}
      routeLines={routeLines}
      fit
      detail={detail}
      detailAt={selectedPlace ? { position: selectedPlace.position, key: selectKey } : undefined}
    >
      <div data-testid="coverage-screen" data-usage={usage}>
        <PageHeader
          title={t('coverage.title')}
          info={
            <>
              <p>{t('coverage.subtitle')}</p>
              <p className="mt-1">{t(`coverage.usage.${usage}Hint`)}</p>
            </>
          }
          actions={
            <Link to="/coordinator/route" className="btn-ghost min-h-11" data-testid="coverage-to-route">
              <Icon name="route" size={16} />
              <span className="hidden sm:inline">{t('coverage.toRoute')}</span>
            </Link>
          }
        />

        {/* ★★ AX3 — « פגישה » N'ÉTAIT NI UN ONGLET NI UN FILTRE : c'est un MODE
            de l'écran (on le montre à une institution : rien d'interne). Un
            interrupteur, à sa place ; les familles ci-dessous sont LES filtres. */}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-card bg-surface-raised px-3 py-2 shadow-card" data-testid="coverage-usage" data-usage={usage}>
          <input
            type="checkbox"
            role="switch"
            className="h-5 w-5 shrink-0 accent-[rgb(var(--accent))]"
            checked={usage === 'meeting'}
            onChange={(e) => choose(e.target.checked ? 'meeting' : 'prepare')}
            data-testid="coverage-usage-meeting"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-caption font-semibold text-content-primary">{t('coverage.meetingMode')}</span>
            <span className="block truncate text-micro text-content-muted">{t(`coverage.usage.${usage}Short`)}</span>
          </span>
        </label>
        {usage !== 'meeting' && toConfirmCount > 0 && (
          <button
            type="button"
            data-testid="coverage-to-confirm"
            data-count={toConfirmCount}
            onClick={() => {
              setListFilter('toConfirm')
              document.querySelector('[data-testid="institutions-list"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-field bg-status-warn/15 px-3 py-2 text-start text-caption font-semibold text-status-warn-ink"
          >
            <Icon name="alert" size={16} />
            <span className="min-w-0 flex-1">{t('institutions.toConfirmBanner', { count: toConfirmCount })}</span>
            <ChevronForward size={16} />
          </button>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* LES CINQ FAMILLES — les interrupteurs SONT la légende            */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-4 grid gap-3" data-testid="coverage-families">
          <fieldset className="min-w-0 rounded-card bg-surface-raised p-3 shadow-card">
            <legend className="px-1 text-caption font-bold text-content-secondary">{t('coverage.side.land')}</legend>
            <FamilyToggle family="signed" on={prefs.visible.signed} onChange={setVisible} count={coverage.places.filter((p) => p.family === 'signed').length || countFamily(farms, 'signed')} swatch={<Swatch kind="pin" color={land} />} />
            <FamilyToggle family="pipeline" on={prefs.visible.pipeline} onChange={setVisible} count={countFamily(farms, 'pipeline')} swatch={<Swatch kind="pin" color={land} hollow />} />
            <FamilyToggle family="leads" on={prefs.visible.leads} onChange={setVisible} count={coverage.leadsPlaced} swatch={<Swatch kind="lead" color={land} />} />
          </fieldset>
          <fieldset className="min-w-0 rounded-card bg-surface-raised p-3 shadow-card">
            <legend className="px-1 text-caption font-bold text-content-secondary">{t('coverage.side.institutions')}</legend>
            <FamilyToggle family="engaged" on={prefs.visible.engaged} onChange={setVisible} count={institutions.filter((i) => isInstitutionEngaged(i) && i.position).length} swatch={<Swatch kind="school" color={school} />} />
            <FamilyToggle family="prospect" on={prefs.visible.prospect} onChange={setVisible} count={institutions.filter((i) => !isInstitutionEngaged(i) && i.engagement !== 'not_relevant' && i.position).length} swatch={<Swatch kind="school" color={school} hollow />} />
            <div className="mt-2 flex items-center gap-3 border-t border-edge-subtle pt-2 text-micro text-content-secondary">
              <span className="flex items-center gap-1.5"><Swatch kind="line" color={school} /> {t('coverage.linkReal')}</span>
              <span className="flex items-center gap-1.5"><Swatch kind="line" color={school} hollow /> {t('coverage.linkPotential')}</span>
            </div>
          </fieldset>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* LE RAYON                                                          */}
        {/* ---------------------------------------------------------------- */}
        {/* ★★ AX7 — LA BORNE, EN KILOMÈTRES OU EN MINUTES : le choix est au PO.
            Son engagement auprès des institutions est de 35 MINUTES. */}
        <div className="mt-4 block rounded-card bg-surface-raised p-3 shadow-card" data-testid="coverage-radius" data-unit={prefs.unit}>
          <span className="flex flex-nowrap items-center justify-between gap-3">
            <span className="flex items-center text-caption font-bold text-content-secondary">
              {t('coverage.limit')}
              <InfoTip label={t('coverage.durationWhat')} testId="coverage-duration-info" className="contents">
                <p>{t('coverage.durationIs')}</p>
                <p className="mt-1">{t('coverage.durationSpeeds')}</p>
                <p className="mt-1">{t('coverage.durationMargin', { percent: margin })}</p>
                <p className="mt-1">{t('coverage.durationNight', { percent: prefs.nightPct })}</p>
                <p className="mt-1">{t('coverage.distanceRule')}</p>
              </InfoTip>
            </span>
            <span className="numeric ltr-nums text-title text-content-primary" data-testid="coverage-radius-value">
              {limitText}
            </span>
          </span>
          <span role="radiogroup" aria-label={t('coverage.unitLabel')} className="mt-2 flex flex-nowrap gap-1" data-testid="coverage-unit">
            {(['min', 'km'] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={prefs.unit === u}
                onClick={() => setPrefs((p) => ({ ...p, unit: u }))}
                data-testid={`coverage-unit-${u}`}
                className={`flex min-h-11 flex-1 items-center justify-center rounded-field border text-caption font-semibold ${
                  prefs.unit === u ? 'border-accent bg-accent/15 text-accent-ink' : 'border-edge-subtle text-content-secondary hover:bg-surface-high'
                }`}
              >
                {t(`coverage.unit.${u}`)}
              </button>
            ))}
          </span>
          {prefs.unit === 'km' ? (
            <>
              <input
                type="range"
                min={RADIUS_MIN_KM}
                max={Math.max(RADIUS_MAX_KM, prefs.radiusKm)}
                step={5}
                value={prefs.radiusKm}
                onChange={(e) => setPrefs((p) => ({ ...p, radiusKm: clampRadius(Number(e.target.value)) }))}
                className="mt-2 h-11 w-full accent-[rgb(var(--status-violet))]"
                data-testid="coverage-radius-input"
                aria-valuetext={t('coverage.km', { km: prefs.radiusKm })}
              />
              <span className="mt-1 flex items-center gap-2 text-caption text-content-secondary">
                {/* ★ AW1.7 — un champ chiffré, SANS plafond : la réglette n'est qu'un raccourci. */}
                <span>{t('coverage.radiusAny')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={prefs.radiusKm}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n) && n >= 1) setPrefs((p) => ({ ...p, radiusKm: clampRadius(n) }))
                  }}
                  className="input ltr-nums h-11 w-24 text-center"
                  data-testid="coverage-radius-number"
                  aria-label={t('coverage.radius')}
                />
                <span>{t('coverage.kmUnit')}</span>
              </span>
            </>
          ) : (
            <>
              <input
                type="range"
                min={10}
                max={Math.max(90, prefs.minutes)}
                step={5}
                value={prefs.minutes}
                onChange={(e) => setPrefs((p) => ({ ...p, minutes: Math.max(1, Math.round(Number(e.target.value))) }))}
                className="mt-2 h-11 w-full accent-[rgb(var(--status-violet))]"
                data-testid="coverage-minutes-input"
                aria-valuetext={t('coverage.minutes', { min: prefs.minutes })}
              />
              <span className="mt-1 flex flex-wrap items-center gap-2 text-caption text-content-secondary">
                <span>{t('coverage.minutesAny')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={prefs.minutes}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    if (Number.isFinite(n) && n >= 1) setPrefs((p) => ({ ...p, minutes: Math.round(n) }))
                  }}
                  className="input ltr-nums h-11 w-20 text-center"
                  data-testid="coverage-minutes-number"
                  aria-label={t('coverage.limit')}
                />
                <span>{t('coverage.minUnit')}</span>
              </span>
            </>
          )}
          {/* ★★ AX7.2 — LA NUIT, RÉGLABLE PAR LE PO, ET DITE EN UNE LIGNE. */}
          <span className="mt-2 flex flex-wrap items-center gap-2 border-t border-edge-subtle pt-2 text-caption text-content-secondary">
            <Icon name="moon" size={14} />
            <span>{t('coverage.nightLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={200}
              value={prefs.nightPct}
              onChange={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n >= 0 && n <= 200) setPrefs((p) => ({ ...p, nightPct: Math.round(n) }))
              }}
              className="input ltr-nums h-11 w-20 text-center"
              data-testid="coverage-night"
              aria-label={t('coverage.nightLabel')}
            />
            <span>%</span>
            <span className="muted ms-auto text-micro" data-testid="coverage-duration-line">
              {t('coverage.durationLine', { margin, night: prefs.nightPct })}
            </span>
          </span>
        </div>

        <MeshStatus
          progress={mesh.progress}
          mesh={coverage.mesh}
          limitText={limitText}
          onRetry={() => setRetry((n) => n + 1)}
        />

        {/* ---------------------------------------------------------------- */}
        {/* CE QU'IL FAUT VOIR D'UN COUP D'ŒIL                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-4 grid grid-cols-3 gap-2" data-testid="coverage-counts" data-farms={c.farms} data-covered={c.covered} data-uncovered={c.uncovered} data-potential={c.potential}>
          <Counter testId="coverage-covered" value={c.covered} of={c.farms} label={t('coverage.covered')} tone="success" active={focus === 'covered'} onClick={() => setFocus(focus === 'covered' ? null : 'covered')} />
          <Counter testId="coverage-uncovered" value={c.uncovered} of={c.farms} label={t('coverage.uncovered')} tone="warn" active={focus === 'uncovered'} onClick={() => setFocus(focus === 'uncovered' ? null : 'uncovered')} />
          <Counter testId="coverage-potential" value={c.potential} of={c.uncovered} label={t('coverage.potential')} tone="violet" plus active={focus === 'potential'} onClick={() => setFocus(focus === 'potential' ? null : 'potential')} />
        </div>
        {/* ★★ AX3.5 — ICI, CHIFFRES ET FILTRES À LA FOIS, ET L'ÉCRAN LE DIT : ce
            sont les nombres qu'on montre à une institution (gros, lisibles de
            loin) ; les toucher isole ces fermes sur la carte. */}
        <p className="muted mt-1.5 text-micro">
          {t('coverage.countsScope', { n: c.farms })} · {focus ? t('coverage.focusOn') : t('coverage.countsTap')}
        </p>
        {!meeting && c.unreachable > 0 && (
          <p className="mt-1 text-caption font-semibold text-status-warn-ink" data-testid="coverage-unreachable">
            {t('coverage.unreachable', { count: c.unreachable })}
          </p>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* CE QUI MANQUE (préparation seulement : rien d'interne en rendez-vous) */}
        {/* ---------------------------------------------------------------- */}
        {!meeting && (
          <ul className="mt-3 flex flex-col gap-1.5 text-caption" data-testid="coverage-missing">
            {coverage.leadsUnplaced > 0 && (
              <li data-testid="coverage-leads-unplaced" data-count={coverage.leadsUnplaced}>
                <Link to="/coordinator/leads" className="flex items-center gap-2 font-semibold text-status-warn-ink underline-offset-2 hover:underline">
                  <Icon name="pin" size={14} />
                  {t('coverage.leadsUnplaced', { count: coverage.leadsUnplaced })}
                </Link>
              </li>
            )}
            {coverage.institutionsUnplaced > 0 && (
              <li className="flex items-center gap-2 text-content-secondary" data-testid="coverage-institutions-unplaced">
                <Icon name="pin" size={14} />
                {t('coverage.institutionsUnplaced', { count: coverage.institutionsUnplaced })}
              </li>
            )}
            {coverage.uncertainLinks > 0 && (
              <li className="flex items-center gap-2 text-content-secondary" data-testid="coverage-uncertain">
                <Icon name="alert" size={14} />
                {t('coverage.uncertainLinks', { count: coverage.uncertainLinks })}
              </li>
            )}
            {coverage.institutionsNotRelevant > 0 && (
              <li className="text-content-muted">{t('coverage.notRelevantHidden', { count: coverage.institutionsNotRelevant })}</li>
            )}
          </ul>
        )}

        {institutions.length === 0 && (
          <div className="mt-4 rounded-card border border-dashed border-edge-strong p-4" data-testid="coverage-no-institutions">
            <p className="font-semibold text-content-primary">{t('coverage.noInstitutions')}</p>
            <p className="muted mt-1">{t('coverage.noInstitutionsHint')}</p>
            <Link to="/coordinator/import/institutions" className="btn-primary mt-3">
              <Icon name="upload" size={16} />
              {t('institutions.import.title')}
            </Link>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* L'INSTITUTION CHOISIE : sa couverture, mesurée sur la route       */}
        {/* ---------------------------------------------------------------- */}
        {selectedInst && (
          <div data-testid="coverage-selected">
          <Section title={selectedInst.name} className="mt-4">
            <InstitutionEditor inst={selectedInst} />
            <p className="mt-3 text-caption font-bold text-content-secondary">
              {t('coverage.reachTitleLimit', { limit: limitText })}
              {mesh.progress.pending > 0 && <span className="muted ms-2 font-normal">{t('coverage.measuringRoad', { count: mesh.progress.pending })}</span>}
            </p>
            <ReachList
              inst={selectedInst}
              farms={farms}
              airBound={airBound}
              inLimit={(r) => (limitMinutes ? linkMinutes(r.seconds, factor) <= limitMinutes.minutes : r.km <= prefs.radiusKm)}
              nightPct={prefs.nightPct}
              routeTo={routeTo}
              onRoute={(id) => setRouteTo(routeTo === id ? null : id)}
              version={mesh.version}
            />
          </Section>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* LES INSTITUTIONS — le démarchage, en liste                        */}
        {/* ---------------------------------------------------------------- */}
        {!meeting && institutions.length > 0 && (
          <InstitutionList
            institutions={institutions}
            filter={listFilter}
            setFilter={setListFilter}
            selectedId={selectedInst?.id ?? null}
            onPick={(id) => {
              setSelected({ kind: 'institution', id })
              setSelectKey((k) => k + 1)
              setRouteTo(null)
            }}
          />
        )}
      </div>
    </MapPanel>
  )
}

function countFamily(farms: readonly Farm[], family: 'signed' | 'pipeline'): number {
  const signed = ['signed', 'active']
  const pipe = ['incoming_request', 'to_contact', 'contacted', 'visited', 'verbal_ok']
  return farms.filter((f) => farmPoint(f) && (family === 'signed' ? signed : pipe).includes(f.status)).length
}

// --- Petits morceaux ---------------------------------------------------------

/** Le même dessin que sur la carte, en miniature : l'interrupteur EST la légende. */
function Swatch({ kind, color, hollow = false }: { kind: 'pin' | 'lead' | 'school' | 'line'; color: string; hollow?: boolean }) {
  const ring = 'rgb(var(--surface-base))'
  if (kind === 'line') {
    return (
      <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
        <line x1="1" y1="4" x2="25" y2="4" stroke={color} strokeWidth={hollow ? 1.8 : 3} strokeDasharray={hollow ? '4 3' : undefined} strokeLinecap="round" />
      </svg>
    )
  }
  if (kind === 'lead') {
    return <span aria-hidden="true" className="inline-block h-3.5 w-3.5 rounded-pill" style={{ border: `2.5px dashed ${color}`, background: ring }} />
  }
  if (kind === 'school') {
    return (
      <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-field" style={{ background: hollow ? ring : color, border: `2.5px solid ${hollow ? color : '#141b26'}` }}>
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={hollow ? color : ring} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 9.5 12 5l10 4.5L12 14Z M6 11.5v4.2c0 1.3 2.7 2.8 6 2.8s6-1.5 6-2.8v-4.2 M22 9.5v5" />
        </svg>
      </span>
    )
  }
  return (
    <svg width="18" height="28" viewBox="1.75 -1.25 20.5 33.5" aria-hidden="true">
      <path d="M12 31.2 9.6 17.6a9 9 0 1 1 4.8 0z" fill={hollow ? ring : color} stroke={hollow ? color : '#141b26'} strokeWidth={hollow ? 2.4 : 1.6} strokeLinejoin="round" />
    </svg>
  )
}

function FamilyToggle({
  family,
  on,
  onChange,
  count,
  swatch,
}: {
  family: CoverageFamily
  on: boolean
  onChange: (f: CoverageFamily, on: boolean) => void
  count: number
  swatch: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      data-testid={`coverage-family-${family}`}
      onClick={() => onChange(family, !on)}
      className={`flex min-h-11 w-full items-center gap-3 rounded-field px-2 py-1.5 text-start transition-colors duration-fast hover:bg-surface-high ${on ? '' : 'opacity-50'}`}
    >
      <span className="flex w-7 shrink-0 justify-center">{swatch}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-caption font-semibold text-content-primary">{t(`coverage.family.${family}`)}</span>
        <span className="block truncate text-micro text-content-muted">{t(`coverage.familyHint.${family}`)}</span>
      </span>
      <span className="numeric ltr-nums text-caption font-bold text-content-secondary">{count}</span>
      <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-pill transition-colors duration-fast ${on ? 'bg-accent' : 'bg-surface-high'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-pill bg-surface-overlay shadow-card transition-all duration-fast ${on ? 'end-0.5' : 'start-0.5'}`} />
      </span>
    </button>
  )
}

function Counter({
  value,
  of,
  label,
  tone,
  active,
  onClick,
  testId,
  plus = false,
}: {
  value: number
  of: number
  label: string
  tone: 'success' | 'warn' | 'violet'
  active: boolean
  onClick: () => void
  testId: string
  plus?: boolean
}) {
  const ink = { success: 'text-status-success-ink', warn: 'text-status-warn-ink', violet: 'text-status-violet-ink' }[tone]
  const bg = { success: 'bg-status-success/15', warn: 'bg-status-warn/15', violet: 'bg-status-violet/15' }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      data-value={value}
      className={`flex min-h-[5.5rem] min-w-0 flex-col items-start justify-between rounded-card p-3 text-start shadow-card transition-colors duration-fast ${active ? bg : 'bg-surface-raised hover:bg-surface-high'}`}
    >
      <span className={`numeric ltr-nums text-title font-bold leading-none ${ink}`}>
        {plus && value > 0 ? '+' : ''}
        {value}
        <span className="text-caption font-semibold text-content-muted"> /{of}</span>
      </span>
      <span className="text-caption font-semibold text-content-primary">{label}</span>
    </button>
  )
}

function InstitutionCard({ inst, reach, onClose }: { inst: Institution; reach: Array<{ tone: 'real' | 'potential' }>; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="w-[min(20rem,calc(100vw-2rem))] rounded-card bg-surface-overlay/95 p-4 shadow-lift backdrop-blur lg:w-[26rem] lg:p-5" data-testid="coverage-institution-card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-heading text-content-primary lg:text-title">{inst.name}</p>
          <p className="mt-1 flex items-center gap-1.5 text-caption font-semibold text-content-primary lg:text-body">
            <span className="shrink-0 text-accent-ink"><Icon name="pin" size={16} /></span>
            {inst.locality || t('farms.noPosition')}
          </p>
          <p className="muted mt-0.5 text-caption">
            {[t(`institutions.kind.${inst.kind}`), t(`institutions.audience.${inst.audience}`), inst.network].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="shrink-0 rounded-field p-1 text-content-muted hover:bg-surface-high hover:text-content-primary">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-edge-subtle pt-3">
        <span className={`chip border ${ENGAGEMENT_ON[inst.engagement]}`}>{t(`institutions.engagement.${inst.engagement}`)}</span>
        <span className="chip bg-surface-high text-content-secondary">{t('coverage.reaches', { count: reach.length })}</span>
        {inst.positionUncertain && (
          <span className="chip bg-status-warn/15 text-status-warn-ink" data-testid="coverage-uncertain-chip">{t('institutions.uncertain')}</span>
        )}
        {isInstitutionToConfirm(inst) && <span className="chip bg-status-warn/15 text-status-warn-ink">{t('institutions.toConfirm')}</span>}
      </div>
      {(inst.contactName || inst.metOn || inst.students !== null) && (
        <p className="mt-2 text-caption text-content-secondary" data-testid="coverage-institution-facts">
          {[
            inst.contactName,
            inst.metOn ? t('institutions.metOnShort', { date: inst.metOn.split('-').reverse().join('.') }) : '',
            inst.students !== null ? t('institutions.studentsShort', { count: inst.students }) : '',
          ].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  )
}

function ReachList({
  inst,
  farms,
  airBound,
  inLimit,
  nightPct,
  routeTo,
  onRoute,
  version,
}: {
  inst: Institution
  farms: readonly Farm[]
  /** ★★ AX7 — ce que le vol d'oiseau laisse passer (km, ou minutes × 95 km/h). */
  airBound: number
  inLimit: (road: { km: number; seconds: number }) => boolean
  nightPct: number
  routeTo: string | null
  onRoute: (id: string) => void
  version: number
}) {
  const { t } = useTranslation()
  const label = useLinkLabel(nightPct)
  const rows = useMemo(() => {
    if (!inst.position) return []
    const out: Array<{ farm: Farm; air: number; road: PairRoad | undefined }> = []
    for (const f of farms) {
      const p = farmPoint(f)
      if (!p) continue
      const air = haversineKm(inst.position, p)
      if (air > airBound) continue
      out.push({ farm: f, air, road: meshPair(inst.position, p) })
    }
    const km = (r: PairRoad | undefined, air: number) => (r && r.kind !== 'none' ? r.km : 1e6 + air)
    return out.sort((a, b) => km(a.road, a.air) - km(b.road, b.air))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst, farms, airBound, version])
  if (!inst.position) return <p className="muted mt-1">{t('coverage.noInstitutionPosition')}</p>
  if (rows.length === 0) return <p className="muted mt-1">{t('coverage.reachNone')}</p>
  return (
    <ul className="mt-2 flex flex-col gap-1.5" data-testid="coverage-reach-list">
      {rows.map(({ farm, road }) => {
        const measured = road && road.kind !== 'none' ? road : null
        const out = !!measured && !inLimit(measured)
        const blocked = road?.kind === 'beyondOnly'
        const beyond = road?.kind === 'road' ? road.fastestBeyond : null
        return (
          <li key={farm.id}>
            <button
              type="button"
              onClick={() => onRoute(farm.id)}
              aria-pressed={routeTo === farm.id}
              className={`flex min-h-11 w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-field border px-3 py-1.5 text-start text-caption ${routeTo === farm.id ? 'border-accent bg-accent/10' : 'border-edge-subtle hover:bg-surface-high'} ${out ? 'opacity-60' : ''}`}
              data-testid={`coverage-reach-${farm.id}`}
              data-road={measured ? measured.km.toFixed(2) : ''}
              data-state={road === undefined ? 'pending' : road.kind === 'none' ? 'none' : blocked ? 'blocked' : out ? 'out' : 'in'}
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-content-primary">{farm.name}</span>
              <span className="ltr-nums shrink-0 text-content-secondary">
                {measured ? label(measured.km, measured.seconds) : road?.kind === 'none' ? t('coverage.noRoadShort') : t('coverage.measuringOne')}
              </span>
              {out && <span className="chip bg-surface-high text-content-muted">{t('coverage.outByRoad')}</span>}
              {blocked && <span className="chip bg-status-danger/15 text-status-danger-ink" data-testid="coverage-reach-blocked">{t('coverage.beyondOnly')}</span>}
              {beyond && (
                <span className="w-full text-micro text-status-warn-ink" data-testid="coverage-reach-beyond">
                  {t('coverage.fastestBeyond', { km: beyond.km.toFixed(1) })}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * ★★ AW1.3 · AW1.4 — CE QUE FAIT LE CALCUL, DIT À L'ÉCRAN : la progression la
 * première fois, puis le bilan du maillage — combien de paires le vol
 * d'oiseau laissait passer, combien la route garde, combien elle écarte.
 */
function MeshStatus({
  progress,
  mesh,
  limitText,
  onRetry,
}: {
  progress: ReturnType<typeof useRoadMesh>['progress']
  mesh: { airPairs: number; roadPairs: number; dropped: number; pending: number; noRoad: number; blocked: number; fastestBeyond: number }
  limitText: string
  onRetry: () => void
}) {
  const { t } = useTranslation()
  const running = progress.running && progress.total > 0
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div
      className="mt-3 rounded-card bg-surface-raised p-3 shadow-card"
      data-testid="coverage-mesh"
      data-running={running ? 'true' : 'false'}
      data-air={mesh.airPairs}
      data-road={mesh.roadPairs}
      data-dropped={mesh.dropped}
      data-pending={mesh.pending}
      data-blocked={mesh.blocked}
      data-beyond={mesh.fastestBeyond}
      data-last-ms={progress.lastMs ?? ''}
    >
      <p className="flex items-center gap-2 text-caption font-bold text-content-secondary">
        <Icon name="route" size={16} />
        {t('coverage.mesh.title')}
      </p>
      {progress.unavailable ? (
        <div className="mt-1.5" data-testid="coverage-mesh-unavailable">
          <p className="text-caption font-semibold text-status-warn-ink">{t('coverage.mesh.unavailable')}</p>
          <button type="button" className="btn-secondary mt-2 min-h-11" onClick={onRetry}>
            {t('coverage.mesh.retry')}
          </button>
        </div>
      ) : running || mesh.pending > 0 ? (
        <div className="mt-1.5" data-testid="coverage-mesh-progress">
          <div className="h-2 overflow-hidden rounded-pill bg-surface-high" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-pill bg-status-violet transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="ltr-nums mt-1 text-caption text-content-secondary">
            {progress.phase === 'tiles' ? t('coverage.mesh.loadingRoads') : t('coverage.mesh.progress', { done: progress.done, total: progress.total })}
          </p>
          <p className="muted text-micro">{t('coverage.mesh.provisional')}</p>
        </div>
      ) : (
        <p className="ltr-nums mt-1 text-caption text-content-primary" data-testid="coverage-mesh-summary">
          {t('coverage.mesh.summaryLimit', { road: mesh.roadPairs, air: mesh.airPairs, dropped: mesh.dropped, limit: limitText })}
        </p>
      )}
      {mesh.blocked > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-caption font-semibold text-status-danger-ink" data-testid="coverage-mesh-blocked">
          <Icon name="alert" size={14} />
          {t('coverage.mesh.blocked', { count: mesh.blocked })}
        </p>
      )}
      {mesh.fastestBeyond > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-caption text-status-warn-ink" data-testid="coverage-mesh-beyond">
          <Icon name="alert" size={14} />
          {t('coverage.mesh.beyond', { count: mesh.fastestBeyond })}
        </p>
      )}
      {mesh.noRoad > 0 && <p className="muted mt-1 text-micro">{t('coverage.mesh.noRoad', { count: mesh.noRoad })}</p>}
    </div>
  )
}

type ListFilter = 'all' | 'toConfirm' | InstitutionEngagement

function InstitutionList({
  institutions,
  selectedId,
  onPick,
  filter,
  setFilter,
}: {
  institutions: readonly Institution[]
  selectedId: string | null
  onPick: (id: string) => void
  filter: ListFilter
  setFilter: (f: ListFilter) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLUListElement | null>(null)
  const q = query.trim()
  const toConfirm = institutions.filter(isInstitutionToConfirm).length
  const rows = institutions
    .filter((i) => filter === 'all' || (filter === 'toConfirm' ? isInstitutionToConfirm(i) : i.engagement === filter))
    .filter((i) => !q || `${i.name} ${i.locality} ${i.network}`.includes(q))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
  const counts = (e: ListFilter) =>
    e === 'all' ? institutions.length : e === 'toConfirm' ? toConfirm : institutions.filter((i) => i.engagement === e).length
  return (
    <Section
      title={t('institutions.title', { count: institutions.length })}
      className="mt-4"
      collapseKey="coverage-institutions"
      action={
        <span className="flex flex-wrap gap-1">
          {/* ★ AW2 — une institution avec son responsable, d'une fiche ou à la main. */}
          <Link to="/coordinator/add?type=institution" className="btn-ghost py-1.5" data-testid="coverage-add-link">
            <Icon name="userPlus" size={16} />
            {t('add.entry')}
          </Link>
          <Link to="/coordinator/import/institutions" className="btn-ghost py-1.5" data-testid="coverage-import-link">
            <Icon name="upload" size={16} />
            {t('institutions.import.short')}
          </Link>
        </span>
      }
    >
      {/* ★★ AX3 — L'ENGAGEMENT EST UN FILTRE (les mêmes institutions, moins
          nombreuses), pas un onglet. */}
      <div className="pill-row" role="group" aria-label={t('institutions.engagementLabel')} data-testid="institutions-filter" data-filter-row="">
        {([...(toConfirm > 0 ? (['toConfirm'] as const) : []), 'all', ...INSTITUTION_ENGAGEMENTS] as ListFilter[]).map((k) => (
          <FilterPill
            key={k}
            active={filter === k}
            onClick={() => setFilter(k)}
            count={counts(k)}
            testId={`institutions-filter-${k}`}
          >
            {k === 'all' ? t('institutions.all') : k === 'toConfirm' ? t('institutions.toConfirmTab') : t(`institutions.engagementShort.${k}`)}
          </FilterPill>
        ))}
      </div>
      <input type="search" className="input mt-3 w-full" placeholder={t('institutions.search')} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="institutions-search" />
      <ul ref={listRef} className="mt-3 flex flex-col gap-1.5" data-testid="institutions-list">
        {rows.map((i) => (
          <li key={i.id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPick(i.id)}
              aria-pressed={selectedId === i.id}
              data-testid={`institution-row-${i.id}`}
              data-to-confirm={isInstitutionToConfirm(i) ? '' : undefined}
              className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-field border px-3 py-1.5 text-start ${selectedId === i.id ? 'border-accent bg-accent/10' : 'border-edge-subtle hover:bg-surface-high'}`}
            >
              {/* ★ AV1 — le NOM d'abord, en entier : à 1 032 px les pastilles le
                  réduisaient à « … ». Elles passent sous lui. */}
              <span className="min-w-0 flex-1">
                <span className="block text-caption font-semibold leading-snug text-content-primary">{i.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1 text-micro text-content-muted">
                  <span>{[i.locality, t(`institutions.kind.${i.kind}`)].filter(Boolean).join(' · ')}</span>
                  <span className={`chip border ${ENGAGEMENT_ON[i.engagement]}`}>{t(`institutions.engagementShort.${i.engagement}`)}</span>
                  {isInstitutionToConfirm(i) && <span className="chip bg-status-warn/15 text-status-warn-ink">{t('institutions.toConfirm')}</span>}
                  {!i.position && <span className="chip bg-surface-high text-content-muted">{t('institutions.noPoint')}</span>}
                  {i.positionUncertain && <span className="chip bg-status-warn/15 text-status-warn-ink">{t('institutions.uncertainShort')}</span>}
                </span>
              </span>
            </button>
            {/* ★★ AV1 — confirmer : UN toucher, sans ouvrir la fiche. */}
            {isInstitutionToConfirm(i) && (
              <button
                type="button"
                onClick={() => updateInstitution(i.id, { engagementConfirmed: true })}
                data-testid={`institution-confirm-${i.id}`}
                aria-label={t('institutions.confirmAria', { name: i.name, status: t(`institutions.engagement.${i.engagement}`) })}
                className="btn-secondary min-h-11 shrink-0 px-3"
              >
                <Icon name="check" size={16} />
                {t('institutions.confirm')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}
