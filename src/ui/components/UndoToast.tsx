import { useEffect, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

import { undoable } from '@core/index'

import { Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AY5 (2026-10-11) — « C'EST FAIT · ביטול », PARTOUT, D'UNE SEULE FAÇON.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Après un geste qui change un état important (archiver, annuler une garde,
 * confirmer une institution, importer, supprimer…), une bande dit en une
 * phrase CE QUI vient de se passer et offre « ביטול » pendant 8 secondes. La
 * confirmation AVANT (une fenêtre) reste pour ce qui est lourd ; l'annulation
 * APRÈS vaut pour tout, y compris ce qui part d'un seul toucher.
 *
 * Un seul porteur pour toute l'application (monté une fois dans `App`) : un
 * nouveau geste remplace la bande du précédent.
 */
interface Offer {
  id: number
  text: string
  undo?: () => void
  /** Un second geste utile (« ouvrir la ferme »). */
  action?: { label: string; run: () => void }
}

let current: Offer | null = null
let seq = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function offerUndo(text: string, undo?: () => void, action?: Offer['action']): void {
  current = { id: ++seq, text, undo, action }
  emit()
}

/**
 * Joue `fn` et, s'il a changé quelque chose, offre de le défaire.
 * Rend ce que `fn` rend.
 */
export function runUndoable<R>(text: string, fn: () => R, action?: Offer['action']): R {
  const u = undoable(fn)
  if (u.changed > 0) offerUndo(text, u.undo, action)
  return u.result
}

function dismiss(id: number): void {
  if (current?.id === id) {
    current = null
    emit()
  }
}

export function UndoToast() {
  const { t } = useTranslation()
  const offer = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => current,
  )
  useEffect(() => {
    if (!offer) return
    const timer = window.setTimeout(() => dismiss(offer.id), 8000)
    return () => window.clearTimeout(timer)
  }, [offer])
  if (!offer) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="undo-toast"
      className="fixed inset-x-4 bottom-[calc(var(--shell-foot,0px)+1rem+env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-xl flex-nowrap items-center gap-2 rounded-card bg-surface-overlay p-2 ps-4 shadow-lift"
    >
      <Icon name="check" size={16} className="shrink-0 text-status-success-ink" />
      <span className="min-w-0 flex-1 text-caption text-content-primary" data-testid="undo-toast-text">
        {offer.text}
      </span>
      {offer.action && (
        <button
          type="button"
          className="btn-ghost min-h-11 shrink-0 whitespace-nowrap"
          onClick={() => {
            offer.action!.run()
            dismiss(offer.id)
          }}
        >
          {offer.action.label}
        </button>
      )}
      {offer.undo && (
        <button
          type="button"
          className="btn-secondary min-h-11 shrink-0 whitespace-nowrap"
          data-testid="undo-toast-undo"
          onClick={() => {
            offer.undo!()
            dismiss(offer.id)
          }}
        >
          <Icon name="undo" size={16} />
          {t('undo.undo')}
        </button>
      )}
      <button type="button" className="btn-ghost h-11 w-11 min-w-0 shrink-0 justify-center p-0" aria-label={t('common.close')} onClick={() => dismiss(offer.id)}>
        <Icon name="close" size={16} />
      </button>
    </div>
  )
}
