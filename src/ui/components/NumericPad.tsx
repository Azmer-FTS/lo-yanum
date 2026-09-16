import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AN1.2 (2026-09-16) — LE PAVÉ NUMÉRIQUE DE L'iPAD, PARCE QUE L'iPAD N'EN A
 *    PAS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * « Le ת״ז de l'édition de ferme ouvre TOUJOURS le clavier complet. » A218
 * disait 136 champs corrects, et il avait raison sur les ATTRIBUTS. Mesuré sur
 * le simulateur iPad (iPadOS 26.3, déployé, clavier logiciel) : pour
 * `inputmode="numeric"`, `inputmode="tel"`, `inputmode="decimal"` et
 * `type="tel"`, l'iPad ouvre LE MÊME clavier — le clavier complet posé sur sa
 * couche chiffres et symboles (@ # $ & …, touches ABC, globe). Un iPhone ouvre
 * un pavé ; un iPad n'en a pas, pour aucune page web. Aucun attribut ne peut
 * donc corriger ce que le PO voit : la porte vérifiait une déclaration que le
 * navigateur de l'iPad ne suit pas.
 *
 * Réponse : sur iPad SEULEMENT, un champ numérique touché passe en
 * `inputmode="none"` (le système n'ouvre rien) et ce pavé 3 × 4 s'affiche en
 * bas. Les chiffres entrent par un vrai événement `input`, donc la mise en
 * forme du téléphone, le nettoyage du ת״ז et l'état React suivent comme à la
 * frappe. Un clavier matériel continue de taper normalement. « ⌨ » rend le
 * clavier du système pour ce champ, si le PO en a besoin.
 */

const NUMERIC_MODES = new Set(['numeric', 'decimal', 'tel'])
const FORCE_KEY = 'lo-yanum:numpad'

export function isIPadLike(): boolean {
  if (typeof navigator === 'undefined') return false
  try {
    const forced = localStorage.getItem(FORCE_KEY)
    if (forced === 'on') return true
    if (forced === 'off') return false
  } catch {
    // stockage indisponible : on décide sur l'appareil
  }
  const ua = navigator.userAgent
  if (/iPad/.test(ua)) return true
  // iPadOS se déclare « Macintosh » ; seul le tactile le trahit.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1
}

function numericKind(el: Element | null): 'digits' | 'decimal' | null {
  if (!(el instanceof HTMLInputElement)) return null
  if (el.readOnly || el.disabled) return null
  if (el.dataset.padOff === '1') return null
  const mode = el.dataset.padMode ?? el.getAttribute('inputmode') ?? ''
  const type = el.type
  if (mode === 'decimal') return 'decimal'
  if (NUMERIC_MODES.has(mode) || type === 'tel' || type === 'number') return 'digits'
  return null
}

function claim(el: HTMLInputElement): void {
  if (el.dataset.padMode === undefined) el.dataset.padMode = el.getAttribute('inputmode') ?? ''
  el.setAttribute('inputmode', 'none')
}

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set

function writeValue(el: HTMLInputElement, next: string, caret: number): void {
  valueSetter?.call(el, next)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  // La mise en forme (téléphone) peut allonger la valeur : le curseur suit la
  // fin s'il y était, sinon il avance d'autant que la valeur a grandi.
  requestAnimationFrame(() => {
    try {
      const len = el.value.length
      const pos = caret >= next.length ? len : Math.min(len, caret + (len - next.length))
      el.setSelectionRange(pos, pos)
    } catch {
      // type="number" n'a pas de sélection
    }
  })
}

function selection(el: HTMLInputElement): [number, number] {
  try {
    const s = el.selectionStart
    const e = el.selectionEnd
    if (s !== null && e !== null) return [s, e]
  } catch {
    // type="number"
  }
  return [el.value.length, el.value.length]
}

function focusable(root: ParentNode): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])'),
  ).filter((n) => n.offsetParent !== null && !(n as HTMLInputElement).readOnly)
}

export function NumericPad() {
  const { t } = useTranslation()
  const [enabled] = useState(isIPadLike)
  const [target, setTarget] = useState<HTMLInputElement | null>(null)
  const [kind, setKind] = useState<'digits' | 'decimal'>('digits')
  const padRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) return
    document.documentElement.setAttribute('data-numpad', '')
    const onDown = (e: Event) => {
      const el = e.target instanceof Element ? e.target.closest('input') : null
      if (el && numericKind(el)) claim(el)
    }
    const onFocus = (e: FocusEvent) => {
      const el = e.target instanceof Element ? e.target : null
      const k = numericKind(el)
      if (k && el instanceof HTMLInputElement) {
        claim(el)
        setKind(k)
        setTarget(el)
        requestAnimationFrame(() => {
          // Un doigt pose le curseur à peu près n'importe où ; corriger un
          // numéro se fait par la fin.
          try {
            const n = el.value.length
            el.setSelectionRange(n, n)
          } catch {
            // type="number"
          }
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        })
      }
    }
    const onBlur = () => {
      // Un bouton du pavé retient le focus (pointerdown empêché) ; tout autre
      // déplacement du focus ferme le pavé.
      setTimeout(() => {
        const a = document.activeElement
        if (!numericKind(a)) setTarget(null)
      }, 0)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('touchstart', onDown, { capture: true, passive: true })
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    return () => {
      document.documentElement.removeAttribute('data-numpad')
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('touchstart', onDown, true)
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
    }
  }, [enabled])

  // La hauteur du pavé est réservée en bas de page, pour que le champ reste
  // atteignable au-dessus de lui.
  useEffect(() => {
    const root = document.documentElement
    if (target && padRef.current) {
      root.style.setProperty('--numpad-h', `${padRef.current.offsetHeight}px`)
      root.setAttribute('data-numpad-open', '')
    } else {
      root.style.removeProperty('--numpad-h')
      root.removeAttribute('data-numpad-open')
    }
  }, [target])

  if (!enabled || !target) return null

  const press = (key: string) => {
    const el = target
    if (!el.isConnected) {
      setTarget(null)
      return
    }
    const [s, e] = selection(el)
    const v = el.value
    if (key === 'back') {
      if (s !== e) writeValue(el, v.slice(0, s) + v.slice(e), s)
      else if (s > 0) {
        // On efface le dernier CHIFFRE avant le curseur, pas un tiret de mise en forme.
        let i = s - 1
        while (i > 0 && !/[\d.]/.test(v[i])) i -= 1
        writeValue(el, v.slice(0, i) + v.slice(s), i)
      }
      return
    }
    if (key === '.' && (kind !== 'decimal' || v.includes('.'))) return
    writeValue(el, v.slice(0, s) + key + v.slice(e), s + 1)
  }

  const next = () => {
    const list = focusable(target.form ?? document)
    const i = list.indexOf(target)
    const n = i >= 0 ? list[i + 1] : undefined
    if (n) n.focus()
    else target.blur()
  }

  const system = () => {
    const el = target
    el.dataset.padOff = '1'
    el.setAttribute('inputmode', el.dataset.padMode || 'numeric')
    setTarget(null)
    el.blur()
    requestAnimationFrame(() => el.focus())
  }

  const keep = (e: React.PointerEvent | React.MouseEvent) => e.preventDefault()
  const base =
    'flex h-14 items-center justify-center rounded-field font-sans shadow-card active:scale-95 transition-transform duration-fast'
  const keyClass = `${base} numeric text-title bg-surface-raised text-content-primary active:bg-surface-high`
  const wordClass = `${base} text-body font-semibold bg-surface-raised text-content-primary active:bg-surface-high`

  return (
    <div
      ref={padRef}
      data-testid="numpad"
      data-numpad-kind={kind}
      role="group"
      aria-label={t('numpad.label')}
      onPointerDown={keep}
      onMouseDown={keep}
      className="fixed inset-x-0 bottom-0 z-[80] border-t border-edge-subtle bg-surface-sunken/95 px-3 pt-2 backdrop-blur"
      style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      dir="ltr"
    >
      <div className="mx-auto grid max-w-md grid-cols-4 gap-2">
        {['1', '2', '3'].map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)} data-numpad-key={k}>
            {k}
          </button>
        ))}
        <button type="button" className={keyClass} onClick={() => press('back')} aria-label={t('numpad.back')} data-numpad-key="back">
          <Icon name="backspace" size={22} />
        </button>
        {['4', '5', '6'].map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)} data-numpad-key={k}>
            {k}
          </button>
        ))}
        <button type="button" className={wordClass} onClick={next} data-numpad-key="next">
          {t('numpad.next')}
        </button>
        {['7', '8', '9'].map((k) => (
          <button key={k} type="button" className={keyClass} onClick={() => press(k)} data-numpad-key={k}>
            {k}
          </button>
        ))}
        <button
          type="button"
          className={`${base} bg-accent text-body font-semibold text-content-on-accent`}
          onClick={() => target.blur()}
          data-numpad-key="done"
        >
          {t('numpad.done')}
        </button>
        <button type="button" className={wordClass} onClick={system} aria-label={t('numpad.system')} data-numpad-key="system">
          <Icon name="keyboard" size={22} />
        </button>
        <button type="button" className={keyClass} onClick={() => press('0')} data-numpad-key="0">
          0
        </button>
        <button
          type="button"
          className={keyClass}
          onClick={() => press('.')}
          disabled={kind !== 'decimal'}
          aria-hidden={kind !== 'decimal'}
          data-numpad-key="."
          style={kind !== 'decimal' ? { visibility: 'hidden' } : undefined}
        >
          .
        </button>
        <span />
      </div>
    </div>
  )
}
