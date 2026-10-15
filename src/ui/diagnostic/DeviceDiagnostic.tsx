import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { formatDateTime } from '@core/index'
import { _raw, getSession } from '@core/store'

import { Icon } from '../components/Icon'
import { InfoTip } from '../components/InfoTip'
import { CopyButton, KeyValue, Modal, Section } from '../components/primitives'
import { readStoredBase } from '../components/mapBase'
import { MAP_LAYERS, MAP_LAYERS_KEY, ZONE_LAYERS, getMapLayers, mapLayersMigration } from '../components/mapLayers'
import { drawnZones } from '../components/mapProbe'
import { useDataState } from '../hooks/useDataState'
import { lastSettingsSyncAt, settingStamp } from '../settings/sync'
import { SUPABASE_CONFIGURED } from '../../data/config'
import { accountSyncStarted, fingerprint, migrationRecord, refreshAccountView, settingsView } from '../../storage/account'
import { refusedSettings } from '../../storage/local'
import { useViewAs } from '../settings/viewAs'
import { isStandalone } from '../standalone'
import { RUNNING, checkForUpdate, isolate, useUpdateState } from '../update'
import type { DiagnosticShape, DiagnosticSnapshot, SettingsDiagnostic } from './report'
import { diagnosticLines, diagnosticText, diagnosticVerdict, differsText, shortValue } from './report'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ BI (2026-10-15) — LE PANNEAU DE DIAGNOSTIC D'UN APPAREIL.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le PO n'est pas développeur et ne lira pas une console. Quand un appareil se
 * comporte autrement qu'un autre, il ouvre ce panneau (הגדרות › אבחון המכשיר,
 * ou « אבחון » au pied de la légende de n'importe quelle carte), appuie sur
 * « העתקה », et colle le texte dans un message. Une seule manipulation.
 *
 * ★ CE QU'IL DIT, DANS L'ORDRE DU CHEMIN : la version qui TOURNE et celle qui
 *   est SERVIE (lue à l'ouverture, sans cache), le service worker, la dernière
 *   relecture réussie des données, les formes EN MÉMOIRE (nombre et sommets),
 *   pour la fiche ouverte ses formes, puis ce que la carte a RÉELLEMENT reçu
 *   (`mapProbe`), les couches éteintes, la réactivation de BI, le fond, le
 *   thème, « voir comme ». Et en tête, une phrase qui nomme la première étape
 *   qui casse (`diagnosticVerdict`).
 */

/** La fiche ouverte, lue dans l'adresse : `#/coordinator/farms/<id>…`. */
export function farmIdFromHash(hash: string): string | null {
  const m = /\/farms\/([^/?#]+)/.exec(hash)
  return m ? decodeURIComponent(m[1]) : null
}

function resolvedTheme(): 'light' | 'dark' {
  const explicit = document.documentElement.getAttribute('data-theme')
  if (explicit === 'light' || explicit === 'dark') return explicit
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useDiagnosticSnapshot(open: boolean): DiagnosticSnapshot | null {
  const update = useUpdateState()
  const data = useDataState()
  const viewAs = useViewAs()
  const [served, setServed] = useState<DiagnosticSnapshot['served']>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!open) return
    let live = true
    setServed(null)
    void checkForUpdate().then((o) => {
      if (!live) return
      if (o.kind === 'current' || o.kind === 'available') setServed({ id: o.remote.id, builtAt: o.remote.builtAt })
      else setServed({ error: o.kind === 'error' ? o.reason : o.kind })
    })
    /* ★★★ BJ — la valeur du COMPTE, relue à l'ouverture (et pas seulement
       celle du dernier cycle) : c'est elle que le panneau met en face. */
    if (accountSyncStarted()) void refreshAccountView().then(() => live && setTick((n) => n + 1))
    /* Le relevé suit ce qui bouge pendant qu'il est ouvert (une relecture, une case). */
    const timer = window.setInterval(() => setTick((n) => n + 1), 1000)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [open])

  if (!open) return null
  void tick
  const zones = _raw().farmZones
  const farmId = farmIdFromHash(window.location.hash)
  const farm = farmId ? _raw().farms.find((f) => f.id === farmId) ?? null : null
  const layers = getMapLayers()
  const drawn = drawnZones()
  return {
    at: Date.now(),
    running: RUNNING,
    served,
    worker: update.worker,
    standalone: isStandalone(),
    address: `${window.location.origin}${window.location.pathname}`,
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}`,
    theme: resolvedTheme(),
    ground: readStoredBase(),
    data: data ? { status: data.status, loadedAt: data.loadedAt, pending: data.pending, stale: data.stale, message: data.message } : null,
    memory: { zones: zones.length, vertices: zones.reduce((n, z) => n + z.ring.length, 0) },
    farm: farm
      ? {
          id: farm.id,
          name: farm.name,
          shapes: zones.filter((z) => z.farmId === farm.id).map((z): DiagnosticShape => ({ id: z.id, kind: z.kind, vertices: z.ring.length })),
        }
      : null,
    drawn: drawn ? drawn.zones : null,
    layers: {
      zonesOff: ZONE_LAYERS.filter((k) => !layers[k]),
      off: MAP_LAYERS.filter((k) => !layers[k]),
      stamp: settingStamp(MAP_LAYERS_KEY),
      migration: mapLayersMigration(),
    },
    viewAs: viewAs ? `${viewAs.role} · ${viewAs.name}` : null,
    settingsSyncAt: lastSettingsSyncAt(),
    settings: settingsDiagnostic(),
  }
}

/** ★★★ BJ — le bloc des réglages : tiré du registre et de la mémoire de synchronisation. */
export function settingsDiagnostic(): SettingsDiagnostic {
  const m = migrationRecord()
  return {
    connected: SUPABASE_CONFIGURED,
    rows: settingsView().map((v) => ({
      ...v,
      /* ⛔ Une clé d'AUTHENTIFICATION (session, laissez-passer, mail de connexion)
         n'est JAMAIS montrée ni copiée : seulement sa longueur. Le texte de
         « העתקה » part dans un message. */
      device: v.reason === 'auth' && v.device !== null ? `#h:${fingerprint(v.device)}:${v.device.length}` : v.device,
      account: SUPABASE_CONFIGURED ? v.account : undefined,
      differs: SUPABASE_CONFIGURED && v.differs,
    })),
    migration: m ? { at: m.at, promoted: m.promoted.length, legacy: m.legacy.length, accountWon: m.accountWon.length, defaulted: m.defaulted.length, lostRace: m.lostRace.length } : null,
    refused: [...new Set(refusedSettings().map((r) => r.key))],
  }
}

export function DeviceDiagnosticDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const snap = useDiagnosticSnapshot(true)
  if (!snap) return null
  const when = (v: number | string) => isolate(formatDateTime(typeof v === 'number' ? new Date(v).toISOString() : v, i18n.language))
  const lines = diagnosticLines(snap, t, when)
  const verdict = diagnosticVerdict(snap)
  const text = diagnosticText(snap, t, when)
  const warn = verdict.code !== 'ok' && verdict.code !== 'no-farm' && verdict.code !== 'no-map'
  return createPortal(
    <Modal title={t('diagnostic.title')} onClose={onClose} testId="device-diagnostic">
      <p
        role="status"
        data-testid="diagnostic-verdict"
        data-code={verdict.code}
        className={`mb-3 flex items-start gap-2 rounded-field px-3 py-2 text-caption font-semibold ${
          warn ? 'bg-status-warn/10 text-status-warn-ink' : 'bg-surface-high text-content-primary'
        }`}
      >
        <Icon name={warn ? 'alert' : 'check'} size={16} />
        {lines[0].value}
      </p>
      <dl data-testid="diagnostic-rows">
        {lines.slice(1).map((l) => (
          <div key={l.key} data-row={l.key} data-value={l.value}>
            <KeyValue label={l.label} value={<span className="break-all">{l.value}</span>} />
          </div>
        ))}
      </dl>
      {/* ★★★ BJ — CHAQUE RÉGLAGE : où il vit, ce que l'appareil porte, ce que
          le compte porte, quand ils se sont accordés. Une différence est DITE. */}
      <h3 className="mt-4 text-caption font-semibold text-content-primary">{t('diagnostic.settings.title')}</h3>
      <div className="mt-1 max-h-72 overflow-auto rounded-field border border-edge-subtle">
        <table className="w-full text-micro" data-testid="diagnostic-settings">
          <thead className="sticky top-0 bg-surface-high text-content-secondary">
            <tr>
              <th className="px-2 py-1 text-start">{t('diagnostic.settings.columns.key')}</th>
              <th className="px-2 py-1 text-start">{t('diagnostic.settings.columns.scope')}</th>
              <th className="px-2 py-1 text-start">{t('diagnostic.settings.columns.device')}</th>
              <th className="px-2 py-1 text-start">{t('diagnostic.settings.columns.account')}</th>
              <th className="px-2 py-1 text-start">{t('diagnostic.settings.columns.sync')}</th>
            </tr>
          </thead>
          <tbody>
            {snap.settings.rows.map((r) => (
              <tr
                key={r.key}
                data-key={r.key}
                data-scope={r.scope}
                data-differs={r.differs ? '1' : '0'}
                data-pending={r.pending ? '1' : '0'}
                className={`border-t border-edge-subtle align-top ${r.differs ? 'bg-status-warn/10' : ''}`}
              >
                <td className="px-2 py-1 font-mono break-all" dir="ltr">{r.key}</td>
                <td className="px-2 py-1">
                  {r.scope === 'account' ? t('diagnostic.settings.scope.account') : `${t('diagnostic.settings.scope.device')} · ${t(`diagnostic.settings.reason.${r.reason ?? 'diagnostic'}`)}`}
                </td>
                <td className="px-2 py-1 break-all" data-cell="device">{shortValue(r.device, t)}</td>
                <td className="px-2 py-1 break-all" data-cell="account">{r.scope === 'account' ? shortValue(r.account, t) : '—'}</td>
                <td className="px-2 py-1">
                  {r.scope === 'account'
                    ? r.pending
                      ? t('diagnostic.settings.pendingSince')
                      : r.syncedAt > 0
                        ? t('diagnostic.settings.synced', { at: when(r.syncedAt) })
                        : t('diagnostic.settings.neverSynced')
                    : '—'}
                  {r.differs && (
                    <span className="mt-0.5 block font-semibold text-status-warn-ink" data-testid="diagnostic-setting-differs">
                      {differsText(r, t)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <CopyButton value={text} label={t('diagnostic.copy')} className="btn-primary min-h-11" />
        <span className="muted text-micro">{t('diagnostic.copyHint')}</span>
      </div>
      {/* Le texte même, sélectionnable à la main si la copie est refusée. */}
      <textarea
        readOnly
        dir="auto"
        data-testid="diagnostic-text"
        value={text}
        className="input mt-3 h-28 w-full font-mono text-micro"
        aria-label={t('diagnostic.textLabel')}
      />
    </Modal>,
    document.body,
  )
}

/** « אבחון » — le lien discret (pied de légende, réglages) ; le coordinateur seulement. */
export function DeviceDiagnosticButton({ className = 'text-micro text-accent-ink', label }: { className?: string; label?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (getSession().role !== 'coordinator') return null
  return (
    <>
      <button type="button" className={className} data-testid="diagnostic-open" onClick={() => setOpen(true)}>
        {label ?? t('diagnostic.open')}
      </button>
      {open && <DeviceDiagnosticDialog onClose={() => setOpen(false)} />}
    </>
  )
}

/** הגדרות › אבחון המכשיר. */
export function DeviceDiagnosticSection() {
  const { t } = useTranslation()
  return (
    <Section title={t('diagnostic.title')} className="mt-6" collapseKey="settings-diagnostic">
      {/* AX — l'explication derrière ⓘ, jamais ouverte d'office (axui A347). */}
      <div className="flex flex-wrap items-center gap-2">
        <DeviceDiagnosticButton className="btn-secondary min-h-11" label={t('diagnostic.openLong')} />
        <InfoTip testId="diagnostic-hint">{t('diagnostic.intro')}</InfoTip>
      </div>
    </Section>
  )
}
