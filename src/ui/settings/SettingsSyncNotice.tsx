import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon } from '../components/Icon'
import { useStackBelow } from '../hooks/useStackBelow'
import { onSettingsApplied, onSettingsConflict } from './applied'

/**
 * ★★ AS4.6 — LE PO EST INFORMÉ, IL N'Y A PAS DE PERTE SILENCIEUSE.
 *
 * Deux cas, deux tons :
 *  - « עודכנו ממכשיר אחר » — l'autre appareil a écrit, cet appareil suit ;
 *    discret, se retire seul après 8 s ;
 *  - « הוחלף » — une valeur modifiée ICI depuis la dernière synchronisation a
 *    été battue par une écriture plus récente d'ailleurs. La plus récente
 *    gagne (règle du brief), et ce bandeau reste jusqu'au geste.
 * S'empile sous la mise à jour et les demandes (même mécanique qu'AQ2).
 */
export function SettingsSyncNotice() {
  const { t } = useTranslation()
  const [applied, setApplied] = useState<string[]>([])
  const [conflicts, setConflicts] = useState<string[]>([])
  const ref = useRef<HTMLDivElement | null>(null)
  const visible = applied.length > 0 || conflicts.length > 0
  const below = useStackBelow(
    ref,
    visible,
    'settings-sync',
    '[data-top-banner], [data-top-banner-float="update"], [data-top-banner-float="intake"]',
  )

  useEffect(() => {
    const offA = onSettingsApplied(null, (keys) => setApplied((prev) => [...new Set([...prev, ...keys])]))
    const offC = onSettingsConflict((keys) => setConflicts((prev) => [...new Set([...prev, ...keys])]))
    return () => {
      offA()
      offC()
    }
  }, [])

  useEffect(() => {
    if (applied.length === 0 || conflicts.length > 0) return
    const timer = window.setTimeout(() => setApplied([]), 8000)
    return () => window.clearTimeout(timer)
  }, [applied, conflicts])

  if (!visible) return null
  const conflict = conflicts.length > 0
  const keys = conflict ? conflicts : applied
  const labels = keys.map((k) => t(`settingsSync.keys.${k.replace('lo-yanum:', '')}`, { defaultValue: k }))

  return (
    <div
      ref={ref}
      className="fixed start-0 end-0 z-50 flex justify-center px-3"
      style={{ insetBlockStart: `calc(var(--shell-top, 0px) + 0.5rem + ${below}px)` }}
      data-top-banner-float="settings-sync"
      data-overlay=""
      data-testid="settings-sync-notice"
      data-kind={conflict ? 'conflict' : 'applied'}
      role={conflict ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div
        className={`flex w-full max-w-lg flex-wrap items-center gap-x-3 gap-y-2 rounded-card border-s-4
                    ${conflict ? 'border-s-status-warn' : 'border-s-status-info'} bg-surface-overlay px-4 py-3 shadow-card`}
      >
        <div className="min-w-0 flex-1 basis-64">
          <p className="flex items-center gap-1.5 text-caption font-semibold text-content-primary">
            <Icon name={conflict ? 'alert' : 'history'} size={15} />
            <span data-testid="settings-sync-title">{t(conflict ? 'settingsSync.conflictTitle' : 'settingsSync.appliedTitle')}</span>
          </p>
          <p className="mt-0.5 text-caption text-content-primary" data-testid="settings-sync-keys">
            {labels.join(' · ')}
          </p>
          {conflict ? <p className="muted mt-0.5">{t('settingsSync.conflictHint')}</p> : null}
        </div>
        <button
          type="button"
          className="btn-secondary shrink-0"
          data-testid="settings-sync-dismiss"
          onClick={() => {
            setApplied([])
            setConflicts([])
          }}
        >
          {t('settingsSync.dismiss')}
        </button>
      </div>
    </div>
  )
}
