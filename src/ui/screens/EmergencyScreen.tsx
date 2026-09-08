import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  DISTRESS_HOLD_MS,
  addIncident,
  buildDistressAlert,
  emergencyEntries,
  formatTime,
  getSession,
  planDistress,
  telHref,
} from '@core/index'
import type { DistressPlan, EmergencyEntry } from '@core/index'

import { Icon } from '../components/Icon'
import { MapView } from '../components/MapView'
import { readToken } from '../components/badges'
import { useCoreValue } from '../hooks/useCore'
import { acknowledge, useEmergencyContext, useLastFix } from '../hooks/useEmergency'
import { useLocale } from '../hooks/useLocale'
import { useGuardPass } from '../guardPass'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AE2 (2026-09-08) — L'ÉCRAN D'URGENCE. UN SEUL, POUR LES QUATRE RÔLES.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Un garçon de dix-huit ans, seul, à trois heures du matin, dans un champ
 *     sans éclairage, avec une barre de réseau. Chaque décision se juge à
 *     cette aune. »
 *
 * ★ TROIS BLOCS, DANS L'ORDRE OÙ LA MAIN LES ATTEINT.
 *
 *   1. LE BOUTON DE DÉTRESSE, en haut et énorme. Rien au-dessus de lui.
 *   2. LES NUMÉROS, les gens du coin d'abord (AE2b : « ce sont eux qui
 *      arrivent les premiers »), les nationaux ensuite.
 *   3. תיק אתר, la fiche du site — et elle est en bas parce qu'elle se LIT,
 *      alors que les deux premiers se PRESSENT.
 *
 * ★★ LES CIBLES SONT À 64 px ET LES ÉCARTS À 12 px, PAS À 44 ET 8.
 *
 *    « Vise plus large que le minimum », et le brief dit pourquoi : « ici
 *    elles se pressent dans le noir avec des mains qui tremblent ». 44 px est
 *    le minimum d'une interface qu'on regarde ; celle-ci, on ne la regarde
 *    pas. A124 mesure quand même contre 44 et 8, parce que c'est la règle
 *    d'AA1 et qu'une porte doit vérifier la règle et non l'intention.
 *
 * ⚠️ ET IL N'Y A PAS DE « + » FLOTTANT SUR CET ÉCRAN. C'était le défaut d'AA1
 *    (A86) et d'AC : un bouton fixe posé sur une pastille rend un contrôle
 *    inatteignable pour toujours. Ici le contrôle couvert serait un numéro
 *    d'urgence. `ActionFab` ne se dessine pas sur cette route, et A124 le
 *    mesure au lieu de le croire.
 */

type Phase = 'idle' | 'holding' | 'sent'

export function EmergencyScreen() {
  const { t } = useTranslation()
  const locale = useLocale()
  const navigate = useNavigate()
  const session = useCoreValue(getSession)
  const ctx = useEmergencyContext()
  const pass = useGuardPass()
  const fix = useLastFix()

  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [plan, setPlan] = useState<DistressPlan | null>(null)
  const [transmitted, setTransmitted] = useState<'pending' | 'ok' | 'failed'>('pending')
  const timer = useRef<number | null>(null)
  const raf = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (raf.current !== null) cancelAnimationFrame(raf.current)
    },
    [],
  )

  const who =
    pass?.person.name ??
    (session.role === 'coordinator' ? ctx.coordinator.name : '') ??
    ''
  const myPhone = pass?.person.phone ?? ctx.coordinator.phone

  /**
   * ★★ LA CASCADE, EXÉCUTÉE. L'ORDRE EST CELUI QUE `core/emergency.ts`
   *    EXPLIQUE ET IL N'EST PAS L'ORDRE DE FIABILITÉ.
   *
   *    Un navigateur ne peut pas, dans un seul geste, composer un numéro ET
   *    ouvrir un SMS : la première navigation prend la main. Donc :
   *
   *      1. la REQUÊTE part d'abord — elle ne demande pas la main et, hors
   *         ligne, elle atterrit dans la file d'attente qui repartira toute
   *         seule (P2.5b) ;
   *      2. le SMS s'ouvre ensuite — il compose et rend la main ;
   *      3. l'APPEL reste sous le pouce, en boutons de 64 px, sur l'écran de
   *         confirmation. C'est la voie la plus fiable et c'est celle que
   *         l'utilisateur tient déjà.
   *
   * ⚠️ ET LES TROIS SONT INDÉPENDANTES. `addIncident` peut jeter, `sms:` peut
   *    ne rien ouvrir sur un ordinateur de bureau : rien de tout cela
   *    n'empêche l'écran de confirmation d'apparaître avec ses numéros. Une
   *    cascade dont un maillon annule les suivants n'est pas une cascade.
   */
  const fire = () => {
    const alert = buildDistressAlert({
      who,
      role: session.role,
      phone: myPhone,
      position: fix.current,
      fallbackPosition: ctx.farm?.position ?? null,
      farmId: ctx.farm?.id ?? null,
      farmName: ctx.farm?.name ?? '',
    })
    const labels = {
      title: t('emergency.smsTitle'),
      who: t('emergency.smsWho'),
      farm: t('emergency.smsFarm'),
      at: t('emergency.smsAt'),
      coordinates: t('anchor.coordinates'),
      navigation: t('anchor.navigation'),
      approximate: t('emergency.approximate'),
    }
    const next = planDistress(alert, ctx, labels)
    setPlan(next)
    setPhase('sent')
    acknowledge()

    // 1 — la voie réseau.
    try {
      if (ctx.farm) {
        addIncident({
          farmId: ctx.farm.id,
          missionId: ctx.mission?.id ?? null,
          source: session.role === 'farmer' ? 'farmer' : 'volunteer',
          reporterId: session.entityId,
          reporterName: who || t(`roles.${session.role}`),
          severity: 'urgent',
          description: next.body,
          position: alert.position,
        })
        setTransmitted('ok')
      } else {
        setTransmitted('failed')
      }
    } catch {
      setTransmitted('failed')
    }

    // 2 — le filet de sécurité.
    try {
      if (next.smsRecipients.length > 0) window.location.href = next.smsHref
    } catch {
      // Un poste de travail sans application SMS. Les appels restent.
    }
  }

  /**
   * ★ AE2a.4 — UN APPUI MAINTENU, JAMAIS UN DIALOGUE. « En panique, on ne lit
   *   pas. » L'anneau se remplit pendant l'appui : c'est la seule chose à
   *   comprendre, et elle se comprend sans mot.
   */
  const startHold = () => {
    if (phase === 'sent') return
    setPhase('holding')
    const began = performance.now()
    const tick = () => {
      const p = Math.min(1, (performance.now() - began) / DISTRESS_HOLD_MS)
      setProgress(p)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    timer.current = window.setTimeout(fire, DISTRESS_HOLD_MS)
  }

  const cancelHold = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (raf.current !== null) cancelAnimationFrame(raf.current)
    timer.current = null
    raf.current = null
    setProgress(0)
    setPhase((p) => (p === 'holding' ? 'idle' : p))
  }

  const entries = plan?.callTargets ?? null

  return (
    <div
      data-testid="emergency-screen"
      className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-10 pt-4"
    >
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-title text-critical">{t('emergency.title')}</h1>
          <p className="muted truncate">
            {ctx.farm ? ctx.farm.name : t('emergency.noFarm')}
          </p>
        </div>
        {/* ⚠️ LA SORTIE EST UNE CIBLE ORDINAIRE ET ELLE EST LOIN DU BOUTON.
            Un « retour » de 64 px à côté d'un déclencheur de 200 px est un
            retour qu'on presse en visant le déclencheur. */}
        <button
          type="button"
          onClick={() => navigate(-1)}
          data-testid="emergency-close"
          aria-label={t('common.back')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field border border-edge-strong text-content-secondary hover:bg-surface-high"
        >
          <Icon name="close" size={20} />
        </button>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 1 — LE BOUTON DE DÉTRESSE                                           */}
      {/* ------------------------------------------------------------------ */}
      {phase !== 'sent' ? (
        <button
          type="button"
          data-testid="distress-button"
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          /* Le clavier a droit au même geste : Espace maintenu. */
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault()
              if (phase === 'idle') startHold()
            }
          }}
          onKeyUp={cancelHold}
          className="relative flex h-56 w-full items-center justify-center overflow-hidden rounded-card bg-critical text-content-on-accent shadow-lift transition-transform duration-fast active:scale-[0.99]"
        >
          {/* La barre de progression de l'appui. `origin-left`/RTL : c'est une
              jauge de TEMPS, elle va toujours dans le même sens. */}
          <span
            aria-hidden
            style={{ transform: `scaleX(${progress})` }}
            className="absolute inset-x-0 bottom-0 h-2 origin-left bg-content-on-accent/80"
          />
          <span className="flex flex-col items-center gap-2">
            <Icon name="alert" size={54} />
            <span className="text-title">{t('emergency.distress')}</span>
            <span className="text-caption opacity-90">
              {t('emergency.distressHint')}
            </span>
          </span>
        </button>
      ) : (
        /* ------------------------------------------------------------------ */
        /* AE2a.5 — CE QUI EST PARTI, À QUI, ET QUOI FAIRE MAINTENANT.        */
        /* « Un utilisateur qui doute renvoie l'alerte dix fois. »            */
        /* ------------------------------------------------------------------ */
        <section
          data-testid="distress-sent"
          className="rounded-card bg-status-success/10 p-4 ring-1 ring-status-success/30"
        >
          <p className="flex items-center gap-2 text-heading text-status-success-ink">
            <Icon name="check" size={22} />
            {t('emergency.sent')}
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 text-caption text-content-secondary">
            <li className="flex items-center gap-2">
              <Icon name="message" size={15} />
              {t('emergency.sentSms', { count: plan?.smsRecipients.length ?? 0 })}
            </li>
            <li className="flex items-center gap-2">
              <Icon name={transmitted === 'ok' ? 'check' : 'alert'} size={15} />
              {transmitted === 'ok'
                ? t('emergency.sentServer')
                : t('emergency.sentServerQueued')}
            </li>
            {plan?.alert.position && (
              <li className="ltr-nums flex items-center gap-2" dir="ltr">
                <Icon name="pin" size={15} />
                {plan.alert.position.lat.toFixed(5)}, {plan.alert.position.lng.toFixed(5)}
                {plan.alert.positionIsFallback ? ` (${t('emergency.approximate')})` : ''}
              </li>
            )}
            <li className="ltr-nums flex items-center gap-2">
              <Icon name="clock" size={15} />
              {formatTime(plan?.alert.at ?? new Date().toISOString(), locale)}
            </li>
          </ul>
          <p className="mt-3 text-caption font-semibold text-content-primary">
            {t('emergency.nowWhat')}
          </p>
          <button
            type="button"
            data-testid="distress-again"
            onClick={() => {
              setPhase('idle')
              setProgress(0)
            }}
            className="mt-3 h-11 rounded-field border border-edge-strong px-4 text-caption text-content-secondary hover:bg-surface-high"
          >
            {t('emergency.again')}
          </button>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2 — LES NUMÉROS                                                     */}
      {/* ------------------------------------------------------------------ */}
      <CallGrid entries={entries} ctx={ctx} />

      {/* ------------------------------------------------------------------ */}
      {/* 3 — תיק אתר                                                          */}
      {/* ------------------------------------------------------------------ */}
      {ctx.farm && <SiteFileBlock />}
    </div>
  )
}

/**
 * ★★ LA GRILLE D'APPEL. UNE COLONNE SUR TÉLÉPHONE, DEUX AU-DELÀ.
 *
 * ⚠️ ET C'EST UNE GRILLE ET NON UNE LISTE FLEX, parce que les cellules d'une
 *    grille ont la même hauteur : un numéro dont le libellé passe sur deux
 *    lignes ne fait pas un bouton de 48 px à côté d'un bouton de 72 px, ce qui
 *    est exactement le genre de différence qui fait rater une cible dans le
 *    noir.
 */
function CallGrid({
  entries,
  ctx,
}: {
  entries: EmergencyEntry[] | null
  ctx: ReturnType<typeof useEmergencyContext>
}) {
  const { t } = useTranslation()
  /* Les mêmes entrées avant qu'une alerte ait été déclenchée : le plan les
     porte ensuite, mais les numéros ne peuvent pas attendre qu'il y en ait un. */
  const all = entries ?? emergencyEntries(ctx)
  const local = all.filter((e) => e.tier === 1)
  const national = all.filter((e) => e.tier === 2)
  const contextual = all.filter((e) => e.tier === 3)

  return (
    <section className="flex flex-col gap-4" data-testid="emergency-numbers">
      {local.length > 0 && (
        <Group title={t('emergency.groupLocal')} entries={local} strong />
      )}
      <Group title={t('emergency.groupNational')} entries={national} strong />
      {contextual.length > 0 && (
        <Group title={t('emergency.groupContext')} entries={contextual} />
      )}
    </section>
  )
}

function Group({
  title,
  entries,
  strong = false,
}: {
  title: string
  entries: EmergencyEntry[]
  strong?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div>
      <h2 className="mb-2 text-caption font-semibold text-content-secondary">{title}</h2>
      {/* ⚠️ `gap-3` = 12 px. Le minimum d'AA1 est 8 ; on vise plus large, et
          A124 vérifie quand même contre 8. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {entries.map((e) => (
          <a
            key={e.key}
            href={telHref(e.phone)}
            data-emergency-target=""
            data-testid={`call-${e.key}`}
            /* ★ 64 px de haut. Voir la note d'en-tête : « vise plus large que
               le minimum ». */
            className={`flex min-h-16 items-center justify-between gap-3 rounded-card px-4 py-3 transition-colors duration-fast ${
              strong
                ? 'bg-accent text-content-on-accent hover:bg-accent-strong'
                : 'border border-edge-strong text-content-primary hover:bg-surface-high'
            }`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-caption font-semibold">
                {t(e.labelKey)}
                {e.name ? ` · ${e.name}` : ''}
              </span>
              {e.from === 'locality' || e.from === 'council' ? (
                <span className="truncate text-micro opacity-80">
                  {t('emergency.borrowed')}
                </span>
              ) : null}
            </span>
            <span className="ltr-nums shrink-0 text-heading" dir="ltr">
              {e.phone}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

/**
 * ★★ AE2c — תיק אתר, ET IL EST SUR CET ÉCRAN **ET** SUR LA GARDE.
 *
 * « Utile toutes les nuits, pas seulement en urgence. » Le même composant sert
 * aux deux endroits ; le dupliquer aurait produit deux fiches qui divergent le
 * jour où un champ s'ajoute — et le champ qui manquerait serait le code du
 * portail sur l'écran qu'on ouvre en courant.
 */
function SiteFileBlock() {
  const ctx = useEmergencyContext()
  return <SiteFile farm={ctx.farm} outline={null} />
}

export function SiteFile({
  farm,
  outline,
}: {
  farm: {
    name: string
    locality: string
    position: { lat: number; lng: number }
    siteAccess?: string
    gateCode?: string
    parking?: string
    terrainNotes?: string
  } | null
  /** Le contour, quand on l'a. `null` = pas de carte. */
  outline: Array<Array<{ lat: number; lng: number }>> | null
}) {
  const { t } = useTranslation()
  if (!farm) return null

  const rows: Array<{ key: string; icon: 'route' | 'shield' | 'car' | 'alert'; value: string }> = [
    { key: 'siteAccess', icon: 'route', value: farm.siteAccess ?? '' },
    { key: 'gateCode', icon: 'shield', value: farm.gateCode ?? '' },
    { key: 'parking', icon: 'car', value: farm.parking ?? '' },
    { key: 'terrain', icon: 'alert', value: farm.terrainNotes ?? '' },
  ]

  return (
    <section data-testid="site-file" className="rounded-card bg-surface-raised p-4 shadow-card">
      <h2 className="mb-3 flex items-center gap-2 text-heading">
        <Icon name="farm" size={18} />
        {t('emergency.siteFile')}
      </h2>
      <dl className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.key} data-site-row={row.key} className="flex gap-3">
            <span className="mt-0.5 shrink-0 text-content-muted">
              <Icon name={row.icon} size={16} />
            </span>
            <div className="min-w-0">
              <dt className="text-micro font-semibold text-content-muted">
                {t(`emergency.${row.key}`)}
              </dt>
              {/* ⚠️ UN CHAMP VIDE EST AFFICHÉ ET DIT QU'IL EST VIDE. Le masquer
                  ferait croire au volontaire qu'il n'y a pas de portail, alors
                  que la vérité est que personne n'a écrit le code. Les deux
                  demandent des actions opposées. */}
              <dd
                className={`text-caption leading-relaxed ${
                  row.value ? 'text-content-primary' : 'text-content-muted'
                }`}
              >
                {row.value || t('emergency.unset')}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      {outline !== null && (
        <div className="mt-3">
          <MapView
            ariaLabel={t('a11y.map')}
            className="h-56 w-full"
            cooperative
            center={farm.position}
            zoom={14}
            polygons={outline.map((ring, i) => ({
              id: `outline-${i}`,
              ring,
              color: readToken('--zone-farm'),
            }))}
            markers={[
              {
                id: 'farm',
                position: farm.position,
                color: readToken('--accent'),
                emphasis: true,
                title: farm.name,
              },
            ]}
          />
        </div>
      )}
    </section>
  )
}
