import { useState, useSyncExternalStore } from 'react'
import { InfoTip } from '../components/InfoTip'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@core/index'

import { refreshData } from '../../data/store'
import { Icon } from '../components/Icon'
import { KeyValue, Section } from '../components/primitives'
import { isolate } from '../update'
import {
  isSettingsSyncing,
  lastSettingsSyncReport,
  subscribeSettingsSync,
  syncSettings,
} from './sync'
import type { SyncReport } from './sync'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AT1.5 — LE PO VOIT LA SYNCHRONISATION : QUAND, CE QUI EST MONTÉ, CE QUI
 *    EST DESCENDU, ET L'ERREUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le 2026-10-07, « סנכרון עכשיו » a tourné sur l'iPad et n'a rien changé —
 * et rien ne disait pourquoi : il avait relu, 45 s AVANT que l'iPhone écrive,
 * la ligne que l'iPad venait de créer lui-même (`docs/at/at1-synchronisation.md`).
 * Ici chaque cycle laisse une trace lisible : l'heure, ce qui l'a déclenché,
 * les réglages reçus et envoyés NOMMÉS, et une erreur en mots. Le bouton relit
 * AUSSI les données (fermes, pistes…) : « synchroniser » veut dire tout.
 */
function useReport(): { report: SyncReport | null; syncing: boolean } {
  const report = useSyncExternalStore(subscribeSettingsSync, lastSettingsSyncReport, lastSettingsSyncReport)
  const syncing = useSyncExternalStore(subscribeSettingsSync, isSettingsSyncing, isSettingsSyncing)
  return { report, syncing }
}

export function SettingsSyncSection() {
  const { t, i18n } = useTranslation()
  const { report, syncing } = useReport()
  const [manual, setManual] = useState(false)
  const when = (ms: number) => isolate(formatDateTime(new Date(ms).toISOString(), i18n.language))
  const label = (key: string) => t(`settingsSync.keys.${key.replace(/^lo-yanum:/, '')}`, { defaultValue: key })
  const list = (keys: string[]) => (keys.length === 0 ? t('settingsSync.nothing') : keys.map(label).join(' · '))
  const errorText = (e: string) => {
    const [reason, ...rest] = e.split(':')
    const known = ['no-session', 'timeout', 'network', 'server', 'conflict']
    return known.includes(reason)
      ? t(`settingsSync.error.${reason}`, { detail: rest.join(':').trim() })
      : t('settingsSync.error.server', { detail: e })
  }

  const run = async () => {
    setManual(true)
    try {
      await Promise.all([syncSettings('manual'), refreshData().catch(() => undefined)])
    } finally {
      setManual(false)
    }
  }
  const busy = syncing || manual

  return (
    <Section title={t('settingsSync.title')} className="mt-6" collapseKey="settings-sync">
      <p
        data-testid="settings-sync-status"
        data-ok={report ? (report.ok ? '1' : '0') : ''}
        role={report && !report.ok ? 'alert' : 'status'}
        className={`mb-2 font-semibold ${
          busy ? 'text-content-primary' : !report ? 'text-content-secondary' : report.ok ? 'text-status-success-ink' : 'text-status-warn-ink'
        }`}
      >
        {busy
          ? t('settingsSync.running')
          : !report
            ? t('settingsSync.never')
            : report.ok
              ? t('settingsSync.okAt', { date: when(report.at) })
              : t('settingsSync.failedAt', { date: when(report.at) })}
      </p>
      {report && (
        <dl data-testid="settings-sync-report">
          {!report.ok && report.error && (
            <KeyValue
              label={t('settingsSync.errorLabel')}
              value={<span data-testid="settings-sync-error">{errorText(report.error)}</span>}
            />
          )}
          <KeyValue
            label={t('settingsSync.down')}
            value={<span data-testid="settings-sync-down">{list(report.down)}</span>}
          />
          <KeyValue
            label={t('settingsSync.up')}
            value={<span data-testid="settings-sync-up">{list(report.up)}</span>}
          />
          {report.conflicts.length > 0 && (
            <KeyValue label={t('settingsSync.replaced')} value={list(report.conflicts)} />
          )}
          <KeyValue label={t('settingsSync.trigger')} value={t(`settingsSync.triggers.${report.trigger}`)} />
          <KeyValue
            label={t('settingsSync.lastSync')}
            value={
              <span data-testid="settings-last-sync">
                {report.remoteUpdatedAt ? when(Date.parse(report.remoteUpdatedAt)) : t('settingsSync.noRow')}
              </span>
            }
          />
        </dl>
      )}
      <InfoTip className="mt-1" testId="settings-sync-hint">{t('settingsSync.hint')}</InfoTip>
      <div className="mt-3">
        <button
          type="button"
          className="btn-secondary"
          data-testid="settings-sync-now"
          disabled={busy}
          onClick={() => void run()}
        >
          <Icon name="history" size={16} />
          {busy ? t('settingsSync.running') : t('settingsSync.syncNow')}
        </button>
      </div>
    </Section>
  )
}
