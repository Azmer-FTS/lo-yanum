import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import type { LatLng } from '@core/index'

import { Avatar } from './Avatar'
import { readToken } from './badges'
import { Icon } from './Icon'
import type { MapMarker } from './MapView'
import { MapView } from './MapView'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY3.3 (2026-10-11) — L'APERÇU : UN PANNEAU SUR LE CÔTÉ, PAS UNE PAGE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO l'a décrit au geste près : « je clique une ligne, un panneau s'ouvre
 * sur le côté, PLEINE HAUTEUR, avec une CARTE ÉPINGLÉE EN HAUT que je peux
 * zoomer, et dessous toutes les informations que je fais défiler. Un bouton
 * me renvoie vers la page d'édition. C'est un aperçu, pas une édition. »
 *
 *  - **En grand écran** (≥ 64 rem) : collé au bord de fin (la gauche en
 *    hébreu), sous la coquille, jusqu'en bas ; la liste reste vivante à côté
 *    — toucher une autre ligne change l'aperçu sans le refermer.
 *  - **Au téléphone** : la même chose en feuille plein écran (la carte en
 *    haut, épinglée), fermée par × ou par le retour. C'est la CONSULTATION,
 *    ce que le PO fait le plus au téléphone (AY2.3).
 *  - **La carte** est une vraie carte (pincer, molette, boutons de zoom) :
 *    elle reste épinglée pendant que le texte défile dessous.
 *  - **Rien ne s'y modifie**, sauf les gestes rapides qu'on attend d'un
 *    aperçu (appeler, WhatsApp) ; « עריכה » ouvre la page d'édition.
 */
export function PreviewPanel({
  title,
  subtitle,
  photo,
  shape = 'circle',
  position,
  markers,
  editTo,
  editLabel,
  openTo,
  openLabel,
  onClose,
  chips,
  quick,
  children,
  docked = false,
  testId = 'preview-panel',
}: {
  title: string
  subtitle?: string
  photo?: string | null
  shape?: 'circle' | 'square'
  /** Le lieu ; absent = la carte dit qu'il n'est pas placé. */
  position: LatLng | null
  /** Des repères de plus sur la carte (fermes desservies…). */
  markers?: MapMarker[]
  editTo?: string
  editLabel?: string
  /** La fiche complète, quand elle existe à part de l'édition (ferme). */
  openTo?: string
  openLabel?: string
  onClose: () => void
  /** Statut, type : les pastilles sous le nom. */
  chips?: ReactNode
  /** Appeler, WhatsApp : les gestes d'un coup d'œil. */
  quick?: ReactNode
  children: ReactNode
  /**
   * ★★ AZ2.2 — LA CARTE DE L'ÉCRAN EST DÉJÀ VISIBLE (mode divisé) : l'aperçu
   * prend la place de la liste, dans sa colonne, SANS seconde carte. Voir la
   * note en tête du fichier.
   */
  docked?: boolean
  testId?: string
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // ★ En grand écran, la liste se resserre au lieu de passer sous le panneau.
  useEffect(() => {
    if (docked) return
    const root = document.documentElement
    root.setAttribute('data-preview-open', '')
    return () => root.removeAttribute('data-preview-open')
  }, [docked])

  // Un nouvel aperçu repart du haut.
  useEffect(() => {
    if (docked) {
      /* L'aperçu ancré suit le bandeau de la liste : on remonte en haut de ce
         qui défile (la colonne, ou la page), sinon son titre passerait sous le
         bandeau collant. */
      for (let n: HTMLElement | null = ref.current?.parentElement ?? null; n; n = n.parentElement) {
        const oy = getComputedStyle(n).overflowY
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) {
          n.scrollTo({ top: 0 })
          return
        }
      }
      window.scrollTo({ top: 0 })
      return
    }
    ref.current?.querySelector('[data-preview-scroll]')?.scrollTo({ top: 0 })
  }, [title, docked])

  const pins: MapMarker[] = [
    ...(markers ?? []),
    ...(position ? [{ id: 'preview-self', position, color: readToken('--accent'), title, emphasis: true, essential: true } as MapMarker] : []),
  ]

  const closeButton = (cls: string) => (
    <button
      type="button"
      onClick={onClose}
      className={cls}
      aria-label={t('common.close')}
      data-testid={`${testId}-close`}
    >
      <Icon name="close" size={18} />
    </button>
  )

  const head = (
    <div className="flex items-center gap-3">
      <Avatar photo={photo} name={title} size="md" shape={shape} />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-heading text-content-primary" data-testid={`${testId}-title`}>
          {title}
        </h2>
        {subtitle && <p className="muted truncate text-caption">{subtitle}</p>}
        {chips && <div className="mt-1 flex flex-wrap items-center gap-1.5">{chips}</div>}
      </div>
    </div>
  )

  const foot = (editTo || openTo) && (
    <>
      {editTo && (
        <Link to={editTo} className="btn-primary min-h-11 flex-1 justify-center" data-testid={`${testId}-edit`}>
          <Icon name="edit" size={16} />
          {editLabel ?? t('table.edit')}
        </Link>
      )}
      {openTo && (
        <Link to={openTo} className="btn-secondary min-h-11 flex-1 justify-center" data-testid={`${testId}-open`}>
          <Icon name="external" size={16} />
          {openLabel ?? t('preview.openFull')}
        </Link>
      )}
    </>
  )

  /* ★★ AZ2.2 — EN MODE DIVISÉ, L'APERÇU EST DANS LA COLONNE DE LA LISTE.
     Le PO touchait une vignette : l'aperçu s'ouvrait par-dessus la carte de
     l'écran avec SA PROPRE carte, et deux cartes s'empilaient. La carte de
     l'écran est déjà là, elle situe la fiche (son épingle est sélectionnée) ;
     l'aperçu remplace donc la liste dans sa colonne, sans carte, et « ✕ »
     ramène à la vignette touchée. */
  if (docked) {
    return (
      <section
        ref={ref}
        aria-label={title}
        data-testid={testId}
        data-docked=""
        className="preview-docked card mt-1 overflow-hidden"
      >
        <div className="border-b border-edge-subtle bg-surface-overlay px-4 py-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">{head}</div>
            {closeButton('flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-surface-high text-content-primary')}
          </div>
          {quick && <div className="mt-3 flex flex-wrap items-center gap-2">{quick}</div>}
        </div>
        <div className="px-4 py-4" data-preview-scroll="">
          {children}
        </div>
        {foot && <div className="flex flex-wrap gap-2 border-t border-edge-subtle px-4 py-3">{foot}</div>}
      </section>
    )
  }

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-label={title}
      data-testid={testId}
      data-overlay=""
      className="preview-panel fixed inset-x-0 bottom-0 top-[var(--shell-top,0px)] z-[45] flex flex-col bg-surface-base shadow-lift lg:start-auto lg:w-[min(32rem,42vw)] lg:border-s lg:border-edge-subtle"
    >
      {/* La carte, épinglée en haut. */}
      <div className="relative h-[34dvh] min-h-[12rem] shrink-0 lg:h-[18rem]" data-testid={`${testId}-map`}>
        {pins.length > 0 ? (
          <MapView
            ariaLabel={t('preview.mapLabel', { name: title })}
            className="h-full w-full rounded-none"
            markers={pins}
            center={position ?? pins[0].position}
            zoom={position ? 13 : 10}
            fit={!position && pins.length > 1}
            quickPin={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-sunken text-caption text-content-muted">
            <Icon name="pin" size={18} />
            <span className="ms-1.5">{t('preview.noPosition')}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute start-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-pill bg-surface-overlay/95 text-content-primary shadow-card"
          aria-label={t('common.close')}
          data-testid={`${testId}-close`}
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      {/* L'en-tête : qui, et les gestes d'un coup d'œil. */}
      <div className="shrink-0 border-b border-edge-subtle px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar photo={photo} name={title} size="md" shape={shape} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-heading text-content-primary" data-testid={`${testId}-title`}>
              {title}
            </h2>
            {subtitle && <p className="muted truncate text-caption">{subtitle}</p>}
            {chips && <div className="mt-1 flex flex-wrap items-center gap-1.5">{chips}</div>}
          </div>
        </div>
        {quick && <div className="mt-3 flex flex-wrap items-center gap-2">{quick}</div>}
      </div>

      {/* Tout le reste défile, la carte et l'en-tête restent. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-preview-scroll="">
        {children}
      </div>

      {(editTo || openTo) && (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-edge-subtle bg-surface-base px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {editTo && (
            <Link to={editTo} className="btn-primary min-h-11 flex-1 justify-center" data-testid={`${testId}-edit`}>
              <Icon name="edit" size={16} />
              {editLabel ?? t('table.edit')}
            </Link>
          )}
          {openTo && (
            <Link to={openTo} className="btn-secondary min-h-11 flex-1 justify-center" data-testid={`${testId}-open`}>
              <Icon name="external" size={16} />
              {openLabel ?? t('preview.openFull')}
            </Link>
          )}
        </div>
      )}
    </aside>
  )
}

/** Une ligne « libellé : valeur » de l'aperçu. */
export function PreviewRow({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  if (children === null || children === undefined || children === '' || children === false) return null
  return (
    <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-3 border-b border-edge-subtle/60 py-2 text-caption" data-testid={testId}>
      <dt className="text-content-muted">{label}</dt>
      <dd className="min-w-0 break-words text-content-primary">{children}</dd>
    </div>
  )
}

/** Un groupe titré de l'aperçu. */
export function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1 text-micro font-bold uppercase tracking-wide text-content-muted">{title}</h3>
      <dl>{children}</dl>
    </section>
  )
}
