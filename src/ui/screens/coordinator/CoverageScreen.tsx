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
  computeCoverage,
  farmPoint,
  getInstitutions,
  getVisibleFarms,
  getVisibleLeads,
  haversineKm,
  isInstitutionEngaged,
  isInstitutionToConfirm,
  updateInstitution,
} from '@core/index'
import type { CoverageFamily, Farm, Institution, InstitutionEngagement, LatLng, Visible } from '@core/index'

import { readToken } from '../../components/badges'
import { EntityQuickCard } from '../../components/EntityQuickCard'
import { ChevronForward, Icon } from '../../components/Icon'
import { MapPanel } from '../../components/MapPanel'
import type { MapLink, MapMarker, MapRouteLine } from '../../components/MapView'
import { PageHeader, Section } from '../../components/primitives'
import { TabBar } from '../../components/TabBar'
import { useCoreValue } from '../../hooks/useCore'
import { planRoadRoute } from '../../routing/roadNetwork'

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
 * ★ LA DISTANCE (AU4.6). Toutes les paires à vol d'oiseau, pour filtrer :
 *   64 institutions × le parc, c'est un millier de trajets sur route, chacun
 *   lisant des tuiles du réseau — plusieurs minutes et des centaines de Mo sur
 *   un iPad. Le vol d'oiseau ne manque aucune ferme (la route est toujours plus
 *   longue). Choisir une institution calcule la ROUTE vers chacune de ses
 *   fermes, hors ligne ; un lien que la route met hors rayon disparaît, et
 *   toucher une ferme de la liste trace son trajet.
 *
 * ⛔ AUCUN DE CES COMPTEURS N'EST UN COMPTEUR D'OBJECTIF NI DE DOUNAMS : ils
 *    comptent des lieux atteints. Les pistes n'entrent dans aucun (AS6.8).
 */

const PREFS_KEY = 'lo-yanum:coverage'
type Usage = 'meeting' | 'prepare' | 'custom'
type Focus = null | 'covered' | 'uncovered' | 'potential'
type Selected = { kind: 'farm' | 'lead' | 'institution'; id: string } | null

interface Prefs {
  radiusKm: number
  visible: Visible
}

function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<Prefs>
      return {
        radiusKm: clampRadius(Number(p.radiusKm) || DEFAULT_RADIUS_KM),
        visible: { ...COVERAGE_PRESETS.prepare, ...(p.visible ?? {}) },
      }
    }
  } catch {
    /* une préférence perdue n'est qu'un retour au défaut */
  }
  return { radiusKm: DEFAULT_RADIUS_KM, visible: COVERAGE_PRESETS.prepare }
}
function writePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* idem */
  }
}
const clampRadius = (km: number) => Math.min(RADIUS_MAX_KM, Math.max(RADIUS_MIN_KM, Math.round(km)))

function usageOf(v: Visible): Usage {
  const same = (a: Visible, b: Visible) => (Object.keys(a) as CoverageFamily[]).every((k) => a[k] === b[k])
  if (same(v, COVERAGE_PRESETS.meeting)) return 'meeting'
  if (same(v, COVERAGE_PRESETS.prepare)) return 'prepare'
  return 'custom'
}

// --- La route, institution par institution (mémoire de la page) -------------

interface RoadHit {
  km: number | null
  coords: LatLng[]
}
const roadCache = new Map<string, RoadHit>()
const roadKey = (from: LatLng, to: LatLng) =>
  `${from.lat.toFixed(5)},${from.lng.toFixed(5)}>${to.lat.toFixed(5)},${to.lng.toFixed(5)}`

/** Calcule (une fois) la route d'une institution vers chacune de ses fermes. */
function useInstitutionRoads(inst: Institution | null, targets: Array<{ id: string; position: LatLng }>) {
  const [version, setVersion] = useState(0)
  const [pending, setPending] = useState(0)
  const ids = targets.map((t) => t.id).join(',')
  useEffect(() => {
    if (!inst?.position) return
    const from = inst.position
    const todo = targets.filter((t) => !roadCache.has(roadKey(from, t.position)))
    if (todo.length === 0) return
    let alive = true
    setPending(todo.length)
    void (async () => {
      for (const t of todo) {
        if (!alive) return
        try {
          const r = await planRoadRoute([from, t.position])
          const leg = r.legs[0]
          roadCache.set(roadKey(from, t.position), leg ? { km: leg.meters / 1000, coords: leg.coords } : { km: null, coords: [] })
        } catch {
          roadCache.set(roadKey(from, t.position), { km: null, coords: [] })
        }
        if (!alive) return
        setPending((n) => Math.max(0, n - 1))
        setVersion((v) => v + 1)
      }
    })()
    return () => {
      alive = false
      setPending(0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst?.id, inst?.position?.lat, inst?.position?.lng, ids])
  return { version, pending }
}

// --- L'écran ------------------------------------------------------------------

export function CoverageScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(() => getVisibleFarms())
  const leads = useCoreValue(() => getVisibleLeads())
  const institutions = useCoreValue(() => getInstitutions())
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  useEffect(() => writePrefs(prefs), [prefs])
  const [focus, setFocus] = useState<Focus>(null)
  const [selected, setSelected] = useState<Selected>(null)
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

  // Les fermes que l'institution choisie atteint à vol d'oiseau : ce que la route doit mesurer.
  const airTargets = useMemo(() => {
    if (!selectedInst?.position) return []
    const out: Array<{ id: string; position: LatLng }> = []
    for (const f of farms) {
      const p = farmPoint(f)
      if (p && haversineKm(selectedInst.position, p) <= prefs.radiusKm) out.push({ id: f.id, position: p })
    }
    return out
  }, [selectedInst, farms, prefs.radiusKm])
  const roads = useInstitutionRoads(selectedInst, airTargets)

  const coverage = useMemo(() => {
    const instById = new Map(institutions.map((i) => [i.id, i]))
    const farmById = new Map(farms.map((f) => [f.id, f]))
    return computeCoverage({
      farms,
      leads,
      institutions,
      radiusKm: prefs.radiusKm,
      visible: prefs.visible,
      roadKm: (iid, fid) => {
        const i = instById.get(iid)
        const p = farmById.get(fid)
        const fp = p ? farmPoint(p) : null
        if (!i?.position || !fp) return undefined
        return roadCache.get(roadKey(i.position, fp))?.km ?? undefined
      },
    })
    // `roads.version` : une route mesurée recompose le dessin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farms, leads, institutions, prefs, roads.version])

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
        .map((l) => ({ from: l.from, to: l.to, tone: l.tone, color: school, emphasis: !!selectedInst })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coverage, selectedInst, focus, school],
  )

  const routeLines: MapRouteLine[] = useMemo(() => {
    if (!selectedInst?.position || !routeTo) return []
    const f = farms.find((x) => x.id === routeTo)
    const fp = f ? farmPoint(f) : null
    const hit = fp ? roadCache.get(roadKey(selectedInst.position, fp)) : undefined
    return hit && hit.coords.length > 1 ? [{ coords: hit.coords, style: 'road' as const }] : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInst, routeTo, farms, roads.version])

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
    <InstitutionCard inst={selectedInst} reach={coverage.links.filter((l) => l.institutionId === selectedInst.id)} onClose={() => setSelected(null)} />
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
          subtitle={t('coverage.subtitle')}
          actions={
            <Link to="/coordinator/route" className="btn-ghost min-h-11" data-testid="coverage-to-route">
              <Icon name="route" size={16} />
              <span className="hidden sm:inline">{t('coverage.toRoute')}</span>
            </Link>
          }
        />

        <TabBar
          items={[
            { key: 'meeting', label: t('coverage.usage.meeting') },
            { key: 'prepare', label: t('coverage.usage.prepare') },
            ...(usage === 'custom' ? [{ key: 'custom' as const, label: t('coverage.usage.custom') }] : []),
          ]}
          active={usage}
          onSelect={choose}
          label={t('coverage.usage.label')}
          idPrefix="coverage-usage"
          testId="coverage-usage"
        />
        <p className="muted mt-2 text-caption">{t(`coverage.usage.${usage}Hint`)}</p>
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
        <label className="mt-4 block rounded-card bg-surface-raised p-3 shadow-card" data-testid="coverage-radius">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-caption font-bold text-content-secondary">{t('coverage.radius')}</span>
            <span className="numeric ltr-nums text-title text-content-primary" data-testid="coverage-radius-value">
              {t('coverage.km', { km: prefs.radiusKm })}
            </span>
          </span>
          <input
            type="range"
            min={RADIUS_MIN_KM}
            max={RADIUS_MAX_KM}
            step={5}
            value={prefs.radiusKm}
            onChange={(e) => setPrefs((p) => ({ ...p, radiusKm: clampRadius(Number(e.target.value)) }))}
            className="mt-2 h-11 w-full accent-[rgb(var(--status-violet))]"
            data-testid="coverage-radius-input"
            aria-valuetext={t('coverage.km', { km: prefs.radiusKm })}
          />
          <span className="muted block text-micro">{t('coverage.distanceRule')}</span>
        </label>

        {/* ---------------------------------------------------------------- */}
        {/* CE QU'IL FAUT VOIR D'UN COUP D'ŒIL                                */}
        {/* ---------------------------------------------------------------- */}
        <div className="mt-4 grid grid-cols-3 gap-2" data-testid="coverage-counts" data-farms={c.farms} data-covered={c.covered} data-uncovered={c.uncovered} data-potential={c.potential}>
          <Counter testId="coverage-covered" value={c.covered} of={c.farms} label={t('coverage.covered')} tone="success" active={focus === 'covered'} onClick={() => setFocus(focus === 'covered' ? null : 'covered')} />
          <Counter testId="coverage-uncovered" value={c.uncovered} of={c.farms} label={t('coverage.uncovered')} tone="warn" active={focus === 'uncovered'} onClick={() => setFocus(focus === 'uncovered' ? null : 'uncovered')} />
          <Counter testId="coverage-potential" value={c.potential} of={c.uncovered} label={t('coverage.potential')} tone="violet" plus active={focus === 'potential'} onClick={() => setFocus(focus === 'potential' ? null : 'potential')} />
        </div>
        <p className="muted mt-1.5 text-micro">
          {t('coverage.countsScope', { n: c.farms })}
          {focus ? ` · ${t('coverage.focusOn')}` : ''}
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
              {t('coverage.reachTitle', { km: prefs.radiusKm })}
              {roads.pending > 0 && <span className="muted ms-2 font-normal">{t('coverage.measuringRoad', { count: roads.pending })}</span>}
            </p>
            <ReachList
              inst={selectedInst}
              farms={farms}
              radiusKm={prefs.radiusKm}
              routeTo={routeTo}
              onRoute={(id) => setRouteTo(routeTo === id ? null : id)}
              version={roads.version}
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

const ENGAGEMENT_ON: Record<InstitutionEngagement, string> = {
  not_contacted: 'border-status-info bg-status-info/15 text-status-info-ink',
  contacted: 'border-status-warn bg-status-warn/15 text-status-warn-ink',
  interested: 'border-accent bg-accent/15 text-accent-ink',
  signed: 'border-status-violet bg-status-violet/15 text-status-violet-ink',
  not_relevant: 'border-edge-strong bg-surface-high text-content-primary',
}

export function EngagementSegments({ value, onChange, testId }: { value: InstitutionEngagement; onChange: (e: InstitutionEngagement) => void; testId: string }) {
  const { t } = useTranslation()
  return (
    <div role="radiogroup" aria-label={t('institutions.engagementLabel')} data-testid={testId} className="flex flex-nowrap gap-1">
      {INSTITUTION_ENGAGEMENTS.map((s) => {
        const on = s === value
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={t(`institutions.engagement.${s}`)}
            title={t(`institutions.engagement.${s}`)}
            data-testid={`${testId}-${s}`}
            onClick={() => onChange(s)}
            className={`flex min-h-[2.75rem] flex-auto items-center justify-center whitespace-nowrap rounded-field border px-1.5 text-caption font-semibold transition-colors duration-fast ${
              on ? ENGAGEMENT_ON[s] : 'border-edge-subtle text-content-secondary hover:bg-surface-high'
            }`}
          >
            {t(`institutions.engagementShort.${s}`)}
          </button>
        )
      })}
    </div>
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

/** Statut d'engagement, contact, téléphone, note : éditables sur place. */
function InstitutionEditor({ inst }: { inst: Institution }) {
  const { t } = useTranslation()
  const [contact, setContact] = useState(inst.contactName)
  const [phone, setPhone] = useState(inst.contactPhone)
  const [notes, setNotes] = useState(inst.notes)
  useEffect(() => {
    setContact(inst.contactName)
    setPhone(inst.contactPhone)
    setNotes(inst.notes)
  }, [inst.id, inst.contactName, inst.contactPhone, inst.notes])
  return (
    <div className="flex flex-col gap-3" data-testid="institution-editor">
      <p className="muted text-caption">
        {[inst.locality, t(`institutions.kind.${inst.kind}`), t(`institutions.audience.${inst.audience}`), inst.network].filter(Boolean).join(' · ')}
      </p>
      {inst.positionUncertain && (
        <p className="rounded-field bg-status-warn/15 px-3 py-2 text-caption font-semibold text-status-warn-ink" data-testid="institution-uncertain">
          {t('institutions.uncertainLong')}
        </p>
      )}
      {isInstitutionToConfirm(inst) && (
        <div className="flex flex-wrap items-center gap-2 rounded-field bg-status-warn/15 px-3 py-2" data-testid="institution-to-confirm">
          <p className="min-w-0 flex-1 text-caption font-semibold text-status-warn-ink">
            {t('institutions.toConfirmLong', { status: t(`institutions.engagement.${inst.engagement}`) })}
          </p>
          <button type="button" className="btn-primary min-h-11" onClick={() => updateInstitution(inst.id, { engagementConfirmed: true })} data-testid="institution-confirm">
            <Icon name="check" size={16} />
            {t('institutions.confirm')}
          </button>
        </div>
      )}
      {/* ★★ AV1 — CORRIGER = CONFIRMER : choisir un statut, c'est le dire. */}
      <EngagementSegments value={inst.engagement} onChange={(e) => updateInstitution(inst.id, { engagement: e, engagementConfirmed: true })} testId="institution-engagement" />
      {(inst.metOn || inst.students !== null || inst.positionSource) && (
        <dl className="grid gap-1 text-caption" data-testid="institution-facts">
          {inst.metOn && (
            <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.metOn')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.metOn.split('-').reverse().join('.')}</dd></div>
          )}
          {inst.students !== null && (
            <div className="flex gap-2"><dt className="text-content-muted">{t('institutions.students')}</dt><dd className="ltr-nums font-semibold text-content-primary">{inst.students}</dd></div>
          )}
          {inst.positionSource && (
            <div className="flex gap-2"><dt className="shrink-0 text-content-muted">{t('institutions.positionSource')}</dt><dd className="text-content-secondary">{inst.positionSource}</dd></div>
          )}
        </dl>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-content-secondary">{t('institutions.contactName')}</span>
          <input className="input" value={contact} onChange={(e) => setContact(e.target.value)} onBlur={() => contact !== inst.contactName && updateInstitution(inst.id, { contactName: contact.trim() })} data-testid="institution-contact" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-content-secondary">{t('institutions.contactPhone')}</span>
          <input className="input ltr-nums" inputMode="tel" dir="ltr" placeholder="05X-XXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => phone !== inst.contactPhone && updateInstitution(inst.id, { contactPhone: phone.trim() })} data-testid="institution-phone" />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold text-content-secondary">{t('institutions.notes')}</span>
        <textarea className="input min-h-[3.5rem]" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== inst.notes && updateInstitution(inst.id, { notes })} />
      </label>
      {inst.contactPhone && (
        <a href={`tel:${inst.contactPhone.replace(/[^\d+]/g, '')}`} className="btn-secondary self-start">
          <Icon name="phone" size={16} />
          {t('institutions.call')}
        </a>
      )}
    </div>
  )
}

function ReachList({
  inst,
  farms,
  radiusKm,
  routeTo,
  onRoute,
  version,
}: {
  inst: Institution
  farms: readonly Farm[]
  radiusKm: number
  routeTo: string | null
  onRoute: (id: string) => void
  version: number
}) {
  const { t } = useTranslation()
  const rows = useMemo(() => {
    if (!inst.position) return []
    const out: Array<{ farm: Farm; air: number; road: number | null | undefined }> = []
    for (const f of farms) {
      const p = farmPoint(f)
      if (!p) continue
      const air = haversineKm(inst.position, p)
      if (air > radiusKm) continue
      const road = roadCache.get(roadKey(inst.position, p))?.km
      out.push({ farm: f, air, road })
    }
    return out.sort((a, b) => (a.road ?? a.air) - (b.road ?? b.air))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inst, farms, radiusKm, version])
  if (!inst.position) return <p className="muted mt-1">{t('coverage.noInstitutionPosition')}</p>
  if (rows.length === 0) return <p className="muted mt-1">{t('coverage.reachNone')}</p>
  return (
    <ul className="mt-2 flex flex-col gap-1.5" data-testid="coverage-reach-list">
      {rows.map(({ farm, air, road }) => {
        const out = typeof road === 'number' && road > radiusKm
        return (
          <li key={farm.id}>
            <button
              type="button"
              onClick={() => onRoute(farm.id)}
              aria-pressed={routeTo === farm.id}
              className={`flex min-h-11 w-full items-center gap-2 rounded-field border px-3 py-1.5 text-start text-caption ${routeTo === farm.id ? 'border-accent bg-accent/10' : 'border-edge-subtle hover:bg-surface-high'} ${out ? 'opacity-60' : ''}`}
              data-testid={`coverage-reach-${farm.id}`}
              data-road={road ?? ''}
            >
              <span className="min-w-0 flex-1 truncate font-semibold text-content-primary">{farm.name}</span>
              <span className="ltr-nums shrink-0 text-content-secondary">
                {typeof road === 'number'
                  ? t('coverage.roadKm', { km: road.toFixed(1) })
                  : road === null
                    ? t('coverage.noRoad', { km: air.toFixed(1) })
                    : t('coverage.airKm', { km: air.toFixed(1) })}
              </span>
              {out && <span className="chip bg-surface-high text-content-muted">{t('coverage.outByRoad')}</span>}
            </button>
          </li>
        )
      })}
    </ul>
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
        <Link to="/coordinator/import/institutions" className="btn-ghost py-1.5" data-testid="coverage-import-link">
          <Icon name="upload" size={16} />
          {t('institutions.import.short')}
        </Link>
      }
    >
      <TabBar
        size="sm"
        items={([...(toConfirm > 0 ? (['toConfirm'] as const) : []), 'all', ...INSTITUTION_ENGAGEMENTS] as ListFilter[]).map((k) => ({
          key: k,
          label: k === 'all' ? t('institutions.all') : k === 'toConfirm' ? t('institutions.toConfirmTab') : t(`institutions.engagementShort.${k}`),
          count: counts(k),
          ...(k === 'toConfirm' ? { tone: 'vivid' as const } : {}),
        }))}
        active={filter}
        onSelect={setFilter}
        label={t('institutions.engagementLabel')}
        idPrefix="institutions-filter"
        testId="institutions-filter"
      />
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
