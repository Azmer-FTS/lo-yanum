import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPABASE_CONFIGURED } from '../../../data/config'
import { signOut } from '../../../data/auth'
import { Icon } from '../../components/Icon'
import { Callout, KeyValue, PageHeader, Section } from '../../components/primitives'
import { useAuth } from '../../hooks/useAuth'
import { megabytes, useOfflineMaps, useOnline } from '../../offline'
import { BASEMAP_URL, basemapAssets } from '../../components/basemap'

/**
 * P2.5a — הגדרות.
 *
 * The screen the order of march asks for, and it exists as much to TELL THE
 * TRUTH as to offer controls. A coordinator standing in a field needs to know
 * three things before he trusts what is on his screen: is there a network, is
 * the ground under the map going to still be there in ten minutes, and whose
 * account is this. Two of those three are facts the app can simply state, and
 * an app that states them is worth more than one that hides them behind a
 * spinner.
 *
 * The one thing it deliberately does NOT do is pretend about writes. Until
 * P2.5b's outbox exists, a change made offline is lost on reload, and the sync
 * card says exactly that rather than showing a reassuring green tick.
 */
/**
 * Computed once at module scope: the list never changes for a given build, and
 * a fresh array on every render would re-fire the download callback's identity
 * for no reason.
 */
const BASEMAP_ASSETS = basemapAssets()

export function SettingsScreen() {
  const { t } = useTranslation()
  const online = useOnline()
  const auth = useAuth()
  const { held, bytes, downloadBytes, active, progress, download, clear } =
    useOfflineMaps(BASEMAP_URL, BASEMAP_ASSETS)
  const [clearing, setClearing] = useState(false)

  const onClear = async () => {
    setClearing(true)
    await clear()
    setClearing(false)
  }

  const busy = progress !== null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <Section title={t('settings.connection.title')} flush>
        <p className="flex items-center gap-2.5 text-caption font-medium text-content-primary">
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 rounded-pill ${
              online ? 'bg-status-success' : 'bg-status-warn'
            }`}
          />
          {t(online ? 'settings.connection.online' : 'settings.connection.offline')}
        </p>
        <p className="muted mt-1">
          {t(
            online
              ? 'settings.connection.onlineHint'
              : 'settings.connection.offlineHint',
          )}
        </p>
      </Section>

      <Section title={t('settings.offline.title')} className="mt-6">
        {active ? (
          <>
            <dl>
              <KeyValue
                label={t('settings.offline.state')}
                value={
                  held ? t('settings.offline.held') : t('settings.offline.none')
                }
              />
              {held && bytes > 0 && (
                <KeyValue
                  label={t('settings.offline.size')}
                  value={`${megabytes(bytes)} MB`}
                  ltr
                />
              )}
            </dl>
            <p className="muted mt-3">{t('settings.offline.explain')}</p>

            {/* ★ THE SIZE IS ON THE BUTTON, NOT BEHIND IT.
                The product owner's condition, and the reason it is worded as a
                download rather than as a toggle: a coordinator on cellular
                data at the edge of coverage has to be able to DECLINE, and he
                can only decline something whose cost he was told first. When
                the size could not be read — no network, which is also when the
                download cannot happen — the button says so instead of
                inventing a number. */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void download()}
                disabled={busy || !online}
                data-testid="download-map"
                className="btn-primary"
              >
                <Icon name="download" size={16} />
                {busy
                  ? t('settings.offline.downloading', {
                      percent: Math.round((progress ?? 0) * 100),
                    })
                  : downloadBytes === null
                    ? t('settings.offline.download')
                    : t('settings.offline.downloadSized', {
                        size: megabytes(downloadBytes),
                      })}
              </button>

              <button
                type="button"
                onClick={() => void onClear()}
                disabled={clearing || busy || !held}
                data-testid="clear-tiles"
                className="btn-secondary"
              >
                <Icon name="trash" size={16} />
                {t('settings.offline.clear')}
              </button>
            </div>

            {/* A real indicator, not a spinner: 42 MB at the edge of coverage
                is minutes, and "still going" has to be distinguishable from
                "stuck" before somebody starts driving. */}
            {busy && (
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((progress ?? 0) * 100)}
                data-testid="map-progress"
                className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-surface-high"
              >
                <span
                  className="block h-full rounded-pill bg-accent transition-[width] duration-base ease-out"
                  style={{ width: `${Math.round((progress ?? 0) * 100)}%` }}
                />
              </div>
            )}

            {!online && !held && (
              <p className="muted mt-3">{t('settings.offline.needsNetwork')}</p>
            )}
          </>
        ) : (
          <>
            <p className="text-caption text-content-primary">
              {t('settings.offline.inactive')}
            </p>
            <p className="muted mt-1">{t('settings.offline.inactiveHint')}</p>
          </>
        )}
      </Section>

      {/* Not a green tick. Until the outbox exists, a change made with no
          network is lost on reload, and the coordinator is the person who most
          needs to know that BEFORE he types it. */}
      <Section title={t('settings.sync.title')} className="mt-6" bare>
        <Callout tone="warn" icon="clock" title={t('settings.sync.title')}>
          {t('settings.sync.notYet')}
        </Callout>
      </Section>

      <Section title={t('settings.account.title')} className="mt-6">
        {SUPABASE_CONFIGURED && auth.status === 'signed-in' ? (
          <>
            <dl>
              <KeyValue label={t('auth.signedInAs')} value={auth.email ?? '—'} ltr />
            </dl>
            <button
              type="button"
              onClick={() => void signOut()}
              data-testid="settings-sign-out"
              className="btn-secondary mt-4"
            >
              <Icon name="logout" size={16} className="rtl:-scale-x-100" />
              {t('auth.signOut')}
            </button>
          </>
        ) : (
          <p className="muted">{t('settings.account.demo')}</p>
        )}
      </Section>
    </div>
  )
}
