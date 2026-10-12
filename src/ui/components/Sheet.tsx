import { useEffect, useId, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { usePublishedHeight } from '../hooks/useShellMetrics'
import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — LA FEUILLE MONTANTE (« bottom sheet »).
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le motif que les applications sérieuses utilisent au téléphone pour ce qui
 * ne tient pas dans l'écran sans le manger : Airbnb, Booking et Gmail pour les
 * filtres, Google Maps et Plans pour la fiche d'un lieu posée sur la carte. Il
 * n'en est PAS inventé un autre ; il en existe deux formes, et deux seulement :
 *
 *   · `Sheet`        — MODALE : elle monte sur un voile, occupe les trois
 *                      quarts de l'écran (filtres), se ferme par la croix, le
 *                      voile, Échap, ou en la faisant glisser vers le bas.
 *   · `DockedSheet`  — ANCRÉE en bas, sans voile : la carte au-dessus reste
 *                      vivante. Deux crans — réduite (sa barre seule) et
 *                      ouverte — qu'on change en la faisant glisser ou d'un
 *                      toucher sur sa poignée.
 *
 * ★ LES CIBLES AU DOIGT (« il a de gros doigts ») : poignée, croix, boutons à
 *   44 px au moins. La poignée est un vrai bouton (clavier, lecteur d'écran) :
 *   le glissement est un raccourci, jamais le seul chemin.
 * ★ ELLES ÉCARTENT LA BANDE DU BAS. La modale fait s'effacer le « + » et la
 *   pilule de mode (`data-filters-open`, AA1.2) ; l'ancrée publie sa hauteur
 *   (`--pinned-foot`) et ils montent au-dessus d'elle (AH2).
 */

const DRAG_CLOSE_FRACTION = 0.25

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  height = 0.75,
  testId,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** La part de la hauteur de l'écran (0,75 = les trois quarts). */
  height?: number
  testId?: string
}) {
  const { t } = useTranslation()
  const titleId = useId()
  const panel = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; t: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const root = document.documentElement
    const back = document.activeElement as HTMLElement | null
    root.setAttribute('data-filters-open', '')
    root.setAttribute('data-sheet-open', '')
    const prevOverflow = root.style.overflow
    root.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    /* Le focus entre dans la feuille (lecteur d'écran, clavier) — après la
       première peinture, sinon iOS l'ignore. */
    const id = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[data-sheet-autofocus]')?.focus())
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('keydown', onKey)
      root.removeAttribute('data-filters-open')
      root.removeAttribute('data-sheet-open')
      root.style.overflow = prevOverflow
      back?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  /* ⚠️ LE POINTEUR N'EST CAPTURÉ QU'UNE FOIS LE GLISSEMENT COMMENCÉ (8 px).
     Capturé dès l'appui, le clic qui suit visait la poignée et non le bouton
     touché : la croix de la feuille ne la fermait plus (vu par `bcmobile`). */
  const onDown = (e: ReactPointerEvent) => {
    start.current = { y: e.clientY, t: Date.now() }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!start.current) return
    const dy = e.clientY - start.current.y
    if (drag === null && dy < 8) return
    if (drag === null) {
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      } catch {
        /* pointeur déjà relâché */
      }
    }
    setDrag(Math.max(0, dy))
  }
  const onUp = () => {
    const h = panel.current?.getBoundingClientRect().height ?? 1
    const s = start.current
    const dy = drag ?? 0
    start.current = null
    setDrag(null)
    if (dy === 0) return
    const fast = s && dy > 40 && Date.now() - s.t < 250
    if (dy > h * DRAG_CLOSE_FRACTION || fast) onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-testid={testId} data-sheet="">
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45 animate-fade-in"
        onClick={onClose}
        data-testid={testId ? `${testId}-backdrop` : undefined}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-x-0 bottom-0 mx-auto flex max-w-2xl flex-col rounded-t-card bg-surface-raised shadow-lift"
        style={{
          height: `${Math.round(height * 100)}dvh`,
          transform: drag ? `translateY(${drag}px)` : undefined,
          transition: drag === null ? 'transform 180ms ease-out' : 'none',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        data-sheet-panel=""
      >
        <div
          className="flex shrink-0 touch-none select-none flex-col items-center border-b border-edge-subtle px-4 pb-2"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          data-sheet-handle=""
        >
          <span aria-hidden className="mt-2 h-1.5 w-10 rounded-pill bg-edge-strong" />
          <div className="mt-1 flex w-full items-center gap-2">
            <h2 id={titleId} className="min-w-0 flex-1 truncate text-heading font-semibold text-content-primary">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              data-sheet-autofocus=""
              data-testid={testId ? `${testId}-close` : undefined}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-field text-content-secondary hover:bg-surface-high hover:text-content-primary"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-2" data-sheet-body="">
          {children}
        </div>
        {footer && (
          <div className="flex shrink-0 items-center gap-3 border-t border-edge-subtle px-4 py-3" data-sheet-footer="">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/**
 * L'ancrée : sa barre (`header`) toujours visible au bas de l'écran ; le corps
 * se déplie au-dessus (`expanded`). Glisser vers le haut l'ouvre, vers le bas
 * la réduit ; un toucher sur la poignée fait l'un ou l'autre.
 */
export function DockedSheet({
  expanded,
  onExpandedChange,
  header,
  children,
  testId,
  maxHeight = 0.62,
}: {
  expanded: boolean
  onExpandedChange: (next: boolean) => void
  header: ReactNode
  children: ReactNode
  testId?: string
  /** La part de l'écran que la feuille ouverte peut prendre. */
  maxHeight?: number
}) {
  const { t } = useTranslation()
  const box = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; t: number } | null>(null)
  usePublishedHeight(box, '--pinned-foot')

  const onDown = (e: ReactPointerEvent) => {
    start.current = { y: e.clientY, t: Date.now() }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!start.current) return
    const dy = e.clientY - start.current.y
    if (drag === null && Math.abs(dy) < 8) return
    if (drag === null) {
      try {
        ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      } catch {
        /* pointeur déjà relâché */
      }
    }
    setDrag(dy)
  }
  const onUp = () => {
    const dy = drag ?? 0
    const s = start.current
    start.current = null
    setDrag(null)
    if (!s) return
    if (Math.abs(dy) < 8) return // un toucher : le bouton de la poignée s'en charge
    if (dy < -24) onExpandedChange(true)
    else if (dy > 24) onExpandedChange(false)
  }

  /* ⚠️ DANS UN PORTAIL : l'écran qui l'ouvre peut masquer sa colonne de contenu
     (carte plein écran) — une feuille rendue dedans disparaîtrait avec elle. */
  return createPortal(
    <div
      ref={box}
      className="fixed inset-x-0 bottom-0 z-[45] mx-auto flex max-w-2xl flex-col rounded-t-card bg-surface-overlay shadow-lift"
      style={{
        maxHeight: `${Math.round(maxHeight * 100)}dvh`,
        transform: drag && drag > 0 ? `translateY(${Math.min(drag, 120)}px)` : undefined,
        transition: drag === null ? 'transform 180ms ease-out' : 'none',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      data-testid={testId}
      data-docked-sheet=""
      data-expanded={expanded ? 'true' : 'false'}
    >
      <div
        className="flex shrink-0 touch-none select-none flex-col items-stretch px-3 pb-3"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        data-sheet-handle=""
      >
        <button
          type="button"
          onClick={() => onExpandedChange(!expanded)}
          aria-expanded={expanded}
          aria-label={expanded ? t('sheet.collapse') : t('sheet.expand')}
          data-testid={testId ? `${testId}-handle` : undefined}
          className="flex h-11 w-full items-center justify-center"
        >
          <span aria-hidden className="h-1.5 w-10 rounded-pill bg-edge-strong" />
        </button>
        {header}
      </div>
      {expanded && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3" data-sheet-body="">
          {children}
        </div>
      )}
    </div>,
    document.body,
  )
}
