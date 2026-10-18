import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '../components/Icon'
import type { IconName } from '../components/Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BL (2026-10-18) — UN OUTIL = UNE ICÔNE, ET SON NOM EN HÉBREU À LA DEMANDE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   « Des icônes, pas du texte. Une infobulle en hébreu nomme chaque outil au
 *     survol et à l'appui long. »                                — le brief
 *
 * ★ L'INFOBULLE EST À NOUS, PAS CELLE DU NAVIGATEUR. `title` ne s'affiche ni
 *   au doigt ni au stylet sur iPad — et c'est sur iPad que le PO édite. Ici :
 *   à la souris, le survol (300 ms) ; au doigt ou au stylet, l'appui long
 *   (450 ms), qui ne DÉCLENCHE PAS l'outil (on demande son nom, on ne le
 *   choisit pas) ; la bulle reste 1,5 s après le lâcher.
 *
 * ★ ELLE EST POSÉE DANS `body`, BORNÉE À L'ÉCRAN. Les outils du bout de la
 *   barre touchent le bord de l'iPad : une bulle centrée sous eux en sortirait.
 *
 * ★ L'ÉTAT ACTIF SE VOIT SANS CHERCHER : l'OUTIL en main est plein (fond
 *   d'accent, icône blanche, liseré) ; une BASCULE enfoncée (l'aimant, la forme
 *   d'origine) est cerclée d'accent, jamais pleine — un seul bouton plein dans
 *   la barre, celui de l'outil.
 */
export interface ToolButtonProps {
  testId: string
  icon: IconName
  /** Le nom de l'outil, en hébreu : l'infobulle ET `aria-label`. */
  label: string
  /** Le raccourci clavier, montré dans la bulle (« P », « ⇧C »). */
  shortcut?: string
  /** Outil (bouton radio) : coché ou non. Bascule : enfoncé ou non. */
  active?: boolean
  kind?: 'radio' | 'toggle' | 'button'
  disabled?: boolean
  danger?: boolean
  onClick: () => void
  children?: ReactNode
}

export function ToolButton({ testId, icon, label, shortcut, active = false, kind = 'button', disabled, danger, onClick, children }: ToolButtonProps) {
  const ref = useRef<HTMLButtonElement | null>(null)
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<number | null>(null)
  const held = useRef(false)

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setTip({ x: r.left + r.width / 2, y: r.bottom + 6 })
  }
  useEffect(() => clear, [])

  const ariaState = kind === 'radio' ? { role: 'radio' as const, 'aria-checked': active } : kind === 'toggle' ? { 'aria-pressed': active } : {}

  return (
    <>
      <button
        ref={ref}
        type="button"
        data-testid={testId}
        data-active={active ? '1' : '0'}
        aria-label={label}
        disabled={disabled}
        {...ariaState}
        onPointerEnter={(e) => {
          if (e.pointerType !== 'mouse') return
          clear()
          timer.current = window.setTimeout(show, 300)
        }}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return
          clear()
          setTip(null)
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') {
            clear()
            setTip(null)
            return
          }
          held.current = false
          clear()
          timer.current = window.setTimeout(() => {
            held.current = true
            show()
          }, 450)
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') return
          clear()
          if (held.current) timer.current = window.setTimeout(() => setTip(null), 1500)
        }}
        onPointerCancel={() => {
          clear()
          setTip(null)
        }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          /* Un appui long DEMANDE le nom de l'outil : il ne le choisit pas. */
          if (held.current) {
            held.current = false
            e.preventDefault()
            return
          }
          onClick()
        }}
        className={`relative flex h-11 min-w-11 shrink-0 select-none items-center justify-center gap-1 rounded-[0.7rem] px-2.5 text-micro font-semibold transition-colors duration-fast [-webkit-touch-callout:none] disabled:opacity-35 ${
          active && kind === 'radio'
            ? 'bg-accent text-content-on-accent shadow-card ring-2 ring-accent ring-offset-1 ring-offset-surface-overlay'
            : active
              ? /* Une BASCULE enfoncée (l'aimant, la forme d'origine) : cerclée d'accent, jamais pleine — seul l'OUTIL en main est plein. */
                'bg-surface-high text-accent-ink ring-2 ring-inset ring-accent'
              : danger
              ? 'text-status-danger-ink hover:bg-surface-high'
              : 'text-content-secondary hover:bg-surface-high hover:text-content-primary'
        }`}
      >
        <Icon name={icon} size={22} />
        {children}
      </button>
      {tip &&
        createPortal(
          <span
            role="tooltip"
            data-testid="editor-tip"
            dir="rtl"
            className="glass pointer-events-none fixed z-[60] flex items-center gap-1.5 whitespace-nowrap rounded-pill px-3 py-1.5 text-micro font-semibold text-content-primary shadow-lift"
            style={{ top: tip.y, left: Math.max(8, Math.min(tip.x, window.innerWidth - 8)), transform: 'translateX(-50%)' }}
            ref={(el) => {
              /* Bornée à l'écran : décalée vers l'intérieur si elle déborde d'un bord. */
              if (!el) return
              const r = el.getBoundingClientRect()
              if (r.left < 8) el.style.transform = `translateX(calc(-50% + ${8 - r.left}px))`
              else if (r.right > window.innerWidth - 8) el.style.transform = `translateX(calc(-50% - ${r.right - window.innerWidth + 8}px))`
            }}
          >
            {label}
            {shortcut && <kbd className="rounded-[0.35rem] bg-surface-high px-1.5 font-sans text-content-muted">{shortcut}</kbd>}
          </span>,
          document.body,
        )}
    </>
  )
}
