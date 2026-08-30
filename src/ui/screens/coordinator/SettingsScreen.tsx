import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SUPABASE_CONFIGURED } from '../../../data/config'
import { signOut } from '../../../data/auth'
import { Icon } from '../../components/Icon'
import { Callout, KeyValue, PageHeader, Section } from '../../components/primitives'
import { useAuth } from '../../hooks/useAuth'
import { AVERAGE_TILE_BYTES, useOfflineMaps, useOnline } from '../../offline'

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
export function SettingsScreen() {
  const { t } = useTranslation()
  const online = useOnline()
  const auth = useAuth()
  const { tileCount, active, clear } = useOfflineMaps()
  const [clearing, setClearing] = useState(false)

  const approxMb =
    tileCount === null ? null : (tileCount * AVERAGE_TILE_BYTES) / (1024 * 1024)

  const onClear = async () => {
    setClearing(true)
    await clear()
    setClearing(false)
  }

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
                label={t('settings.offline.title')}
                value={
                  tileCount === null || tileCount === 0
                    ? t('settings.offline.none')
                    : t('settings.offline.held', { count: tileCount })
                }
              />
              {approxMb !== null && tileCount !== null && tileCount > 0 && (
                <KeyValue
                  label={t('settings.offline.approxSize', { size: '' }).trim()}
                  value={`${approxMb.toFixed(1)} MB`}
                  ltr
                />
              )}
            </dl>
            <p className="muted mt-3">{t('settings.offline.explain')}</p>
            <button
              type="button"
              onClick={() => void onClear()}
              disabled={clearing || tileCount === null || tileCount === 0}
              data-testid="clear-tiles"
              className="btn-secondary mt-4"
            >
              <Icon name="trash" size={16} />
              {t('settings.offline.clear')}
            </button>
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
