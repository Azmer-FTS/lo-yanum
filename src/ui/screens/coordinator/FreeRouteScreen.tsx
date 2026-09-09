import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  formatCoords,
  googleMapsPointsUrl,
  newFreeStopId,
  positionParam,
  moveStop,
  planFreeRoute,
  readCoordinator,
  renderArrivalMessage,
  routeKm,
  shortestOrder,
  smsHref,
  whatsappHref,
} from '@core/index'
import type { FreeRoute, FreeStop, LatLng } from '@core/index'

import { originLabel, originPosition } from '../../settings/origin'
import {
  blankFreeRoute,
  deleteFreeRoute,
  saveFreeRoute,
  useFreeRoutes,
} from '../../settings/freeRoutes'
import { Icon } from '../../components/Icon'
import { MapPanel } from '../../components/MapPanel'
import type { MapMarker } from '../../components/MapView'
import { PositionLinkField } from '../../components/PositionLinkField'
import { readToken } from '../../components/badges'
import { Callout, EmptyState, PageHeader, Section } from '../../components/primitives'
import { Field, TextField } from '../../components/fields'
import { useLocale } from '../../hooks/useLocale'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AH9 (2026-09-09) — L'ITINÉRAIRE LIBRE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Le PO appelle des agriculteurs, chacun lui envoie sa localisation par
 *     WhatsApp, et il doit bâtir sa tournée du lendemain. Ces fermes ne sont
 *     pas dans la base. »
 *
 * ★★ ET C'EST POURQUOI CET ÉCRAN N'EST PAS LE PLANIFICATEUR EXISTANT.
 *    `RoutePlannerScreen` choisit des FICHES dans une liste ; ici il n'y a pas
 *    de liste, il y a un champ où l'on colle. Fusionner les deux aurait demandé
 *    au PO de créer quatorze fiches avant de pouvoir savoir dans quel ordre les
 *    visiter — c'est-à-dire de faire le travail dans l'ordre inverse de celui
 *    où il se présente.
 *
 * ★ LE CHAMP DE COLLAGE EST CELUI D'AF3 (`PositionLinkField`), réutilisé tel
 *   quel : il connaît déjà les quatre formes de lien et refuse un couple
 *   inversé par la boîte d'Israël (AB6, piège n°1).
 *
 * ⛔ AH9.7 — AUCUN SERVICE EXTERNE. Les distances et les durées sont calculées
 *    sur l'appareil ; ce que cela coûte en exactitude et ce qu'il faudrait pour
 *    faire mieux sont écrits en tête de `core/freeRoute.ts`. Rien ne sort.
 */
export function FreeRouteScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const saved = useFreeRoutes()
  const coordinator = readCoordinator()

  const [route, setRoute] = useState<FreeRoute>(() =>
    blankFreeRoute(t('freeRoute.newName'), originLabel() || t('settings.origin.title')),
  )
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [proposed, setProposed] = useState<FreeStop[] | null>(null)

  const plan = useMemo(() => planFreeRoute(route), [route])

  const patch = (p: Partial<FreeRoute>) => setRoute((r) => ({ ...r, ...p }))

  const addStop = (position: LatLng) => {
    setProposed(null)
    setRoute((r) => ({
      ...r,
      stops: [
        ...r.stops,
        {
          id: newFreeStopId(),
          label: t('freeRoute.stopN', { n: r.stops.length + 1 }),
          position,
          phone: '',
          visitMinutes: null,
        },
      ],
    }))
  }

  const patchStop = (id: string, p: Partial<FreeStop>) =>
    setRoute((r) => ({
      ...r,
      stops: r.stops.map((s) => (s.id === id ? { ...s, ...p } : s)),
    }))

  const removeStop = (id: string) =>
    setRoute((r) => ({ ...r, stops: r.stops.filter((s) => s.id !== id) }))

  /**
   * ★★ AH9.3 — LA PROPOSITION EST OFFERTE, JAMAIS APPLIQUÉE. « Une proposition
   *    d'ordre le plus court que le PO peut ACCEPTER OU IGNORER » : elle
   *    s'affiche avec ce qu'elle ferait gagner, et rien ne bouge tant qu'il
   *    n'a pas appuyé. Le PO connaît des raisons que la distance ignore — un
   *    agriculteur qui n'est là qu'après la traite, une route fermée.
   */
  const suggestion = useMemo(() => {
    if (route.stops.length < 3) return null
    const best = shortestOrder(route.stops, route.origin)
    const current = routeKm(route.stops, route.origin)
    const shorter = routeKm(best, route.origin)
    if (shorter >= current - 0.5) return null
    return { order: best, saved: current - shorter }
  }, [route.stops, route.origin])

  const markers: MapMarker[] = [
    {
      id: 'origin',
      position: route.origin,
      color: readToken('--accent'),
      title: route.originLabel,
      kind: 'origin' as const,
    },
    ...plan.legs.map((leg) => ({
      id: leg.stop.id,
      position: leg.stop.position,
      color: readToken('--status-info'),
      title: `${leg.order}. ${leg.stop.label}`,
      subtitle: leg.arriveAt,
      kind: 'pin' as const,
      badge: String(leg.order),
    })),
  ]

  const line =
    plan.legs.length === 0
      ? undefined
      : [route.origin, ...plan.legs.map((l) => l.stop.position), route.origin]

  const mapsUrl = googleMapsPointsUrl(
    route.origin,
    plan.legs.map((l) => l.stop.position),
  )

  const message = (leg: (typeof plan.legs)[number]) =>
    renderArrivalMessage(t('freeRoute.messageTemplate'), {
      name: leg.stop.label,
      time: leg.arriveAt,
      coordinator: coordinator.name,
    })

  return (
    <MapPanel
      screenKey="free-route"
      ariaLabel={t('freeRoute.title')}
      markers={markers}
      line={line}
      fit
    >
      <PageHeader
        title={t('freeRoute.title')}
        subtitle={t('freeRoute.subtitle')}
        back={{ to: '/coordinator/route', label: t('route.title') }}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 1 — COLLER LES LIENS (AH9.1)                                        */}
      {/* ------------------------------------------------------------------ */}
      <Section title={t('freeRoute.pasteTitle')} collapseKey="free-route-paste">
        <p className="muted mb-2">{t('freeRoute.pasteHint')}</p>
        <PositionLinkField onResolve={addStop} label={t('freeRoute.pasteLabel')} />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 2 — LE DÉPART (AH9.2 · AH9.4)                                       */}
      {/* ------------------------------------------------------------------ */}
      <Section title={t('freeRoute.startTitle')} collapseKey="free-route-start" className="mt-4">
        <div className="auto-cols gap-3 [--col-min:11rem]">
          <TextField
            label={t('freeRoute.startLabel')}
            value={route.originLabel}
            onChange={(v) => patch({ originLabel: v })}
            testId="free-route-origin-label"
          />
          <Field label={t('freeRoute.departAt')}>
            <input
              type="time"
              className="input ltr-nums"
              data-testid="free-route-depart"
              value={route.departAt}
              onChange={(e) => patch({ departAt: e.target.value })}
            />
          </Field>
          <TextField
            label={t('freeRoute.visitMinutes')}
            value={String(route.defaultVisitMinutes)}
            onChange={(v) => patch({ defaultVisitMinutes: Math.max(0, Number(v) || 0) })}
            testId="free-route-visit-minutes"
            type="number"
            ltr
          />
        </div>
        {/* ★ AH9.2 — le point de départ se déplace en collant un lien, comme
            une étape : c'est le même geste et il n'y en a donc qu'un à
            apprendre. Jérusalem est la valeur initiale (`FREE_ROUTE_ORIGIN`). */}
        <div className="mt-3">
          <PositionLinkField
            onResolve={(position) => patch({ origin: position })}
            label={t('freeRoute.startPaste')}
          />
        </div>
        <p className="muted mt-2 ltr-nums" data-testid="free-route-origin">
          {formatCoords(route.origin)}
        </p>
        <button
          type="button"
          className="btn-ghost mt-2 py-1.5"
          data-testid="free-route-origin-reset"
          onClick={() => patch({ origin: originPosition(), originLabel: originLabel() || t('settings.origin.title') })}
        >
          <Icon name="history" size={15} />
          {t('freeRoute.startReset')}
        </button>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 3 — LE TRAJET (AH9.2 · AH9.3 · AH9.4 · AH9.5)                       */}
      {/* ------------------------------------------------------------------ */}
      <Section
        title={t('freeRoute.stopsTitle')}
        collapseKey="free-route-stops"
        className="mt-4"
      >
        {plan.legs.length === 0 ? (
          <EmptyState icon="pin" title={t('freeRoute.empty')} hint={t('freeRoute.emptyHint')} />
        ) : (
          <>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption" data-testid="free-route-totals">
              <span>
                {t('freeRoute.totalKm')}{' '}
                <span className="numeric ltr-nums font-semibold">
                  {plan.roundTripKm.toFixed(1)}
                </span>
              </span>
              <span>
                {t('freeRoute.backAt')}{' '}
                <span className="numeric ltr-nums font-semibold">{plan.returnAt}</span>
              </span>
            </p>

            {suggestion && (
              <div className="mt-3">
                <Callout
                  tone="info"
                  icon="route"
                  title={t('freeRoute.suggestTitle', { km: suggestion.saved.toFixed(1) })}
                >
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary py-1.5"
                      data-testid="free-route-accept-order"
                      onClick={() => {
                        setRoute((r) => ({ ...r, stops: suggestion.order }))
                        setProposed(null)
                      }}
                    >
                      {t('freeRoute.suggestAccept')}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost py-1.5"
                      data-testid="free-route-ignore-order"
                      onClick={() => setProposed([])}
                    >
                      {t('freeRoute.suggestIgnore')}
                    </button>
                  </div>
                </Callout>
              </div>
            )}
            {proposed !== null && proposed.length === 0 && (
              <p className="muted mt-2">{t('freeRoute.suggestIgnored')}</p>
            )}

            <ul className="mt-3 flex flex-col gap-2" data-testid="free-route-stops">
              {plan.legs.map((leg, i) => (
                <li
                  key={leg.stop.id}
                  data-testid="free-route-stop"
                  data-order={leg.order}
                  /**
                   * ★★ AH9.3 — LE GLISSER-DÉPOSER, ET LES DEUX FLÈCHES À CÔTÉ.
                   *
                   * ⚠️ LES DEUX, PAS L'UN OU L'AUTRE. Le glisser natif de HTML
                   *    ne marche pas au doigt sur iPadOS sans une couche de
                   *    gestes, et le PO travaille sur un iPad dans un camion.
                   *    Deux flèches font le même travail avec une cible de
                   *    44 px, se testent, et ne dépendent d'aucune API tactile.
                   */
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex === null) return
                    setRoute((r) => ({ ...r, stops: moveStop(r.stops, dragIndex, i) }))
                    setDragIndex(null)
                  }}
                  className="rounded-field border border-edge-subtle bg-surface-high p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="chip bg-accent/15 text-accent-ink ltr-nums">
                      {leg.order}
                    </span>
                    <input
                      className="input min-w-0 flex-1"
                      data-testid="free-route-stop-label"
                      value={leg.stop.label}
                      onChange={(e) => patchStop(leg.stop.id, { label: e.target.value })}
                    />
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        className="btn-ghost h-11 w-11 justify-center p-0"
                        data-testid="free-route-up"
                        aria-label={t('freeRoute.moveUp')}
                        disabled={i === 0}
                        onClick={() =>
                          setRoute((r) => ({ ...r, stops: moveStop(r.stops, i, i - 1) }))
                        }
                      >
                        {/* La flèche « vers le haut » est le chevron tourné :
                            il n'y en a qu'un dans le jeu d'icônes, et en
                            ajouter un second pour une rotation serait une
                            icône de plus à tenir d'accord avec la première. */}
                        <Icon name="chevronDown" size={16} className="-rotate-180" />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost h-11 w-11 justify-center p-0"
                        data-testid="free-route-down"
                        aria-label={t('freeRoute.moveDown')}
                        disabled={i === plan.legs.length - 1}
                        onClick={() =>
                          setRoute((r) => ({ ...r, stops: moveStop(r.stops, i, i + 1) }))
                        }
                      >
                        <Icon name="chevronDown" size={16} />
                      </button>
                      <button
                        type="button"
                        className="btn-ghost h-11 w-11 justify-center p-0 text-status-danger-ink"
                        data-testid="free-route-remove"
                        aria-label={t('common.remove')}
                        onClick={() => removeStop(leg.stop.id)}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </span>
                  </div>

                  <p className="muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span data-testid="free-route-arrive">
                      {t('freeRoute.arriveAt')}{' '}
                      <span className="ltr-nums font-semibold text-content-primary">
                        {leg.arriveAt}
                      </span>
                    </span>
                    <span className="ltr-nums">
                      {leg.legKm.toFixed(1)} {t('freeRoute.km')} · {leg.driveMinutes}{' '}
                      {t('freeRoute.minutes')}
                    </span>
                    <span className="ltr-nums">{formatCoords(leg.stop.position)}</span>
                  </p>

                  <div className="mt-2 auto-cols gap-2 [--col-min:9rem]">
                    <TextField
                      label={t('form.contactPhone')}
                      value={leg.stop.phone}
                      onChange={(v) => patchStop(leg.stop.id, { phone: v })}
                      type="tel"
                      ltr
                    />
                    <TextField
                      label={t('freeRoute.stopMinutes')}
                      value={leg.stop.visitMinutes === null ? '' : String(leg.stop.visitMinutes)}
                      onChange={(v) =>
                        patchStop(leg.stop.id, {
                          visitMinutes: v.trim() === '' ? null : Math.max(0, Number(v) || 0),
                        })
                      }
                      placeholder={String(route.defaultVisitMinutes)}
                      type="number"
                      ltr
                    />
                  </div>

                  {/* ★★ AH9.5 — DEUX GESTES DEPUIS UNE ÉTAPE. */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={smsHref([leg.stop.phone], message(leg))}
                      data-testid="free-route-sms"
                      className={`btn-secondary py-1.5 ${
                        leg.stop.phone.trim() === '' ? 'pointer-events-none opacity-50' : ''
                      }`}
                    >
                      <Icon name="message" size={15} />
                      {t('freeRoute.sendSms')}
                    </a>
                    <a
                      href={whatsappHref(leg.stop.phone, message(leg))}
                      data-testid="free-route-whatsapp"
                      className={`btn-secondary py-1.5 ${
                        leg.stop.phone.trim() === '' ? 'pointer-events-none opacity-50' : ''
                      }`}
                    >
                      <Icon name="message" size={15} />
                      WhatsApp
                    </a>
                    {/* ★ AH9.5 — « convertir l'étape en fiche ferme », et c'est
                        le chemin d'AF3.3 : le formulaire s'ouvre avec le point
                        et le nom dedans, et n'enregistre rien tant que le PO
                        n'a pas appuyé sur שמור. */}
                    <button
                      type="button"
                      className="btn-secondary py-1.5"
                      data-testid="free-route-to-farm"
                      onClick={() =>
                        navigate(
                          `/coordinator/farms/new?at=${positionParam(leg.stop.position)}` +
                            `&name=${encodeURIComponent(leg.stop.label)}`,
                        )
                      }
                    >
                      <Icon name="plus" size={15} />
                      {t('freeRoute.toFarm')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex flex-wrap gap-2">
              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost py-1.5"
                  data-testid="free-route-maps"
                >
                  <Icon name="route" size={15} />
                  {t('route.openInGoogleMaps')}
                </a>
              )}
            </div>
          </>
        )}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* 4 — ENREGISTRER ET REPRENDRE (AH9.6)                                */}
      {/* ------------------------------------------------------------------ */}
      <Section title={t('freeRoute.savedTitle')} collapseKey="free-route-saved" className="mt-4">
        <div className="auto-cols gap-3 [--col-min:11rem]">
          <TextField
            label={t('freeRoute.nameLabel')}
            value={route.name}
            onChange={(v) => patch({ name: v })}
            testId="free-route-name"
          />
          <Field label={t('freeRoute.dayLabel')}>
            <input
              type="date"
              className="input ltr-nums"
              data-testid="free-route-day"
              value={route.dayKey ?? ''}
              onChange={(e) => patch({ dayKey: e.target.value || null })}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            data-testid="free-route-save"
            onClick={() => saveFreeRoute(route)}
          >
            <Icon name="check" size={16} />
            {t('common.save')}
          </button>
          <button
            type="button"
            className="btn-ghost"
            data-testid="free-route-new"
            onClick={() =>
              setRoute(blankFreeRoute(t('freeRoute.newName'), originLabel() || t('settings.origin.title')))
            }
          >
            <Icon name="plus" size={16} />
            {t('freeRoute.newRoute')}
          </button>
        </div>

        {saved.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2" data-testid="free-route-list">
            {saved.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-field border border-edge-subtle bg-surface-high px-3 py-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-start"
                  data-testid="free-route-open"
                  onClick={() => setRoute(r)}
                >
                  <span className="truncate text-caption font-medium text-content-primary">
                    {r.name}
                  </span>
                  <span className="muted block truncate ltr-nums">
                    {r.dayKey ?? new Date(r.updatedAt).toLocaleDateString(locale)} ·{' '}
                    {r.stops.length} {t('freeRoute.stopsShort')}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn-ghost py-1.5 text-status-danger-ink"
                  data-testid="free-route-delete"
                  onClick={() => deleteFreeRoute(r.id)}
                >
                  <Icon name="trash" size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}

        {/**
          * ★★ AH9.6 — « ET PEUT DEVENIR UN ITINÉRAIRE DE LA JOURNÉE DANS
          *    L'AGENDA », ET CE QUE CELA DEMANDE EST DIT PLUTÔT QUE CACHÉ.
          *
          * Un `Tour` de l'agenda est une liste d'IDENTIFIANTS DE FICHES : c'est
          * ce qui lui permet de rappeler le numéro de l'agriculteur, de
          * rattacher une visite, de compter une prospection. Une étape libre
          * n'a pas de fiche — c'est sa définition. Le pont existe donc, et il
          * passe par la conversion : chaque étape devenue fiche (bouton
          * « יצירת כרטיס חווה » ci-dessus) rejoint le planificateur de journée
          * comme n'importe quelle autre. Inventer un Tour à partir de points
          * sans fiche aurait produit une journée dont l'agenda ne peut rien
          * dire — un objet à moitié vivant, et la moitié manquante serait
          * découverte le matin de la tournée.
          */}
        <p className="muted mt-4">{t('freeRoute.agendaNote')}</p>
      </Section>

      {/* ⛔ AH9.7 — dit à l'écran, pas seulement dans le code. */}
      <p className="muted mt-4" data-testid="free-route-offline-note">
        {t('freeRoute.offlineNote')}
      </p>
    </MapPanel>
  )
}
