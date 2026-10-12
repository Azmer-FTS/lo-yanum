import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BC (2026-10-12) — LE BALAYAGE SUR LA LIGNE, COMME UNE BOÎTE MAIL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Deux gestes, les deux plus fréquents de l'écran, sur la ligne elle-même :
 * glisser vers la droite, glisser vers la gauche. Pendant le glissement, la
 * couleur et le libellé de l'action apparaissent sous la ligne (on sait ce qui
 * va se passer AVANT de lâcher) ; au-delà de 72 px l'action part, en deçà la
 * ligne revient. Chaque action reste aussi dans la pastille de statut et dans
 * « ⋯ » : le balayage est un raccourci, jamais le seul chemin.
 *
 * ★ LE DÉFILEMENT VERTICAL RESTE NATUREL (`touch-action: pan-y`) : un geste
 *   plus vertical qu'horizontal n'est pas un balayage et la liste défile.
 * ★ UN BALAYAGE N'EST PAS UN TOUCHER : le clic qui suit est avalé, la ligne
 *   n'ouvre pas son aperçu par accident.
 */
export interface SwipeAction {
  label: string
  icon: IconName
  /** Fond et encre de l'action révélée. */
  tone: 'warn' | 'muted' | 'accent' | 'success'
  run: () => void
  testId?: string
}

const TONE: Record<SwipeAction['tone'], string> = {
  warn: 'bg-status-warn/20 text-status-warn-ink',
  muted: 'bg-surface-high text-content-primary',
  accent: 'bg-accent/20 text-accent-ink',
  success: 'bg-status-success/20 text-status-success-ink',
}

export const SWIPE_COMMIT_PX = 72

export function SwipeCell({
  right,
  left,
  children,
  className = '',
  testId,
}: {
  /** Glisser le doigt vers la DROITE de l'écran. */
  right?: SwipeAction
  /** Glisser le doigt vers la GAUCHE de l'écran. */
  left?: SwipeAction
  children: ReactNode
  className?: string
  testId?: string
}) {
  const [dx, setDxState] = useState(0)
  /* Le déplacement lu au lâcher vient d'une référence : l'état React d'un
     glissement rapide peut n'être pas encore rendu quand le doigt se lève. */
  const dxRef = useRef(0)
  const setDx = (v: number) => {
    dxRef.current = v
    setDxState(v)
  }
  const st = useRef<{ x: number; y: number; active: boolean } | null>(null)
  const swallow = useRef(false)

  const clamp = (v: number) => {
    if (v > 0 && !right) return 0
    if (v < 0 && !left) return 0
    return Math.max(-128, Math.min(128, v))
  }
  const onDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    st.current = { x: e.clientX, y: e.clientY, active: false }
  }
  const onMove = (e: ReactPointerEvent) => {
    const s = st.current
    if (!s) return
    const ddx = e.clientX - s.x
    const ddy = e.clientY - s.y
    if (!s.active) {
      if (Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy) * 1.5) {
        s.active = true
        try {
          ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
        } catch {
          /* pointeur déjà relâché : le geste continue sans capture */
        }
      } else if (Math.abs(ddy) > 12) {
        st.current = null
        return
      } else return
    }
    setDx(clamp(ddx))
  }
  const onUp = () => {
    const s = st.current
    st.current = null
    if (!s?.active) {
      setDx(0)
      return
    }
    swallow.current = true
    window.setTimeout(() => (swallow.current = false), 350)
    const v = dxRef.current
    setDx(0)
    if (v >= SWIPE_COMMIT_PX) right?.run()
    else if (v <= -SWIPE_COMMIT_PX) left?.run()
  }

  const shown = dx > 0 ? right : dx < 0 ? left : null
  const armed = Math.abs(dx) >= SWIPE_COMMIT_PX

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onClickCapture={(e) => {
        if (swallow.current) {
          e.preventDefault()
          e.stopPropagation()
          swallow.current = false
        }
      }}
      data-testid={testId}
      data-swipe=""
      data-swipe-dx={dx}
    >
      {shown && (
        /* Le fond n'occupe QUE la place que la ligne libère : la ligne glisse,
           transparente comme toujours (zébrure comprise), sans rien laisser
           paraître sous son texte. */
        <div
          aria-hidden
          className={`absolute inset-y-0 flex items-center justify-center overflow-hidden whitespace-nowrap text-caption font-semibold ${TONE[shown.tone]}`}
          style={dx > 0 ? { left: 0, width: dx } : { right: 0, width: -dx }}
          data-testid={shown.testId ? `${shown.testId}-reveal` : undefined}
        >
          <span className={`flex items-center gap-1.5 px-2 transition-transform duration-fast ${armed ? 'scale-110' : ''}`}>
            <Icon name={shown.icon} size={18} />
            {Math.abs(dx) > 56 && shown.label}
          </span>
        </div>
      )}
      <div style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx === 0 ? 'transform 160ms ease-out' : 'none' }} className="relative">
        {children}
      </div>
    </div>
  )
}
