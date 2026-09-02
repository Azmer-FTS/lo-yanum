import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatCoords, readCoordinator, resetCoordinator, writeCoordinator } from '@core/index'

import { SUPABASE_CONFIGURED } from '../../../data/config'
import { signOut } from '../../../data/auth'
import { Icon } from '../../components/Icon'
import { Callout, KeyValue, PageHeader, Section } from '../../components/primitives'
import { readReportRecipient, writeReportRecipient } from '../../report/recipient'
import { AgreementTemplateSection } from '../../settings/AgreementTemplateSection'
import { DemoDataSection } from '../../settings/DemoDataSection'
import {
  originLabel,
  originPosition,
  originSuggestions,
  resolveOrigin,
  writeOrigin,
} from '../../settings/origin'
import { useAuth } from '../../hooks/useAuth'
import { useDataState } from '../../hooks/useDataState'
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

/** Same reasoning: the gazetteer never changes inside a session. */
const ORIGIN_SUGGESTIONS = originSuggestions()

export function SettingsScreen() {
  const { t } = useTranslation()
  const online = useOnline()
  const auth = useAuth()
  const data = useDataState()
  const {
    held,
    bytes,
    stale,
    heldArchive,
    wantedArchive,
    downloadBytes,
    active,
    progress,
    download,
    clear,
    attempt,
    received,
    expected,
    usage,
    quota,
    persisted,
  } = useOfflineMaps(BASEMAP_URL, BASEMAP_ASSETS)
  const [clearing, setClearing] = useState(false)
  // PO POINT 7b — where "שלח במייל" points, and P3.3bis's destination too.
  const [recipient, setRecipient] = useState(() => readReportRecipient())
  const [recipientSaved, setRecipientSaved] = useState(false)
  // W7 — the coordinator's own card. See `core/profile.ts` for why it lives
  // on the device rather than in the database.
  const [me, setMe] = useState(() => readCoordinator())
  const [meSaved, setMeSaved] = useState(false)
  // PO RETURN 2026-09-02 — נקודת מוצא.
  const [origin, setOrigin] = useState(() => originLabel())
  const [originState, setOriginState] = useState<'idle' | 'saved' | 'bad'>('idle')
  const [locating, setLocating] = useState(false)

  const onClear = async () => {
    setClearing(true)
    await clear()
    setClearing(false)
  }

  /**
   * ★ AN EMPTY FIELD IS A REAL ANSWER — it means "go back to the default" —
   *   so it clears rather than failing validation. Anything else that cannot
   *   be resolved is refused OUT LOUD instead of being stored as text nobody
   *   can plan a route from.
   */
  const saveOrigin = () => {
    if (origin.trim() === '') {
      writeOrigin(null)
      setOriginState('saved')
      return
    }
    const resolved = resolveOrigin(origin)
    if (resolved === null) {
      setOriginState('bad')
      return
    }
    writeOrigin(resolved)
    setOrigin(resolved.label)
    setOriginState('saved')
  }

  const useMyPosition = () => {
    if (!('geolocation' in navigator)) {
      setOriginState('bad')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const label = formatCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        writeOrigin({
          label,
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        })
        setOrigin(label)
        setOriginState('saved')
        setLocating(false)
      },
      () => {
        // Denied, or no fix. The field still works by hand, which is why this
        // is a convenience button and not the only way in.
        setLocating(false)
        setOriginState('bad')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  const busy = progress !== null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <Section title={t('settings.connection.title')} flush collapseKey="settings-connection">
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

      <Section title={t('settings.offline.title')} className="mt-6" collapseKey="settings-offline">
        {active ? (
          <>
            {/* ★ THE SCREEN NAMES THE ARCHIVE, AND THAT IS THE POINT OF THIS
                BLOCK RATHER THAN A DETAIL OF IT.

                The product owner read "42.6 MB" off this screen after a clean
                reinstall and a re-download, and it was TRUE — of the previous
                southern extract, which is what the deployed build was still
                pointed at. A size on its own cannot distinguish "the map you
                asked for" from "a map"; a name that carries the ground and the
                OSM build date can, and it is the one thing he can compare
                against the bucket without opening a console. */}
            <dl>
              <KeyValue
                label={t('settings.offline.state')}
                value={
                  held
                    ? t('settings.offline.held')
                    : stale
                      ? t('settings.offline.stale')
                      : t('settings.offline.none')
                }
              />
              <KeyValue
                label={t('settings.offline.archive')}
                value={wantedArchive}
                ltr
              />
              {/* ★★ PO RETURN 2026-09-02 — HE ASKED WHY THE NAME ENDS `.png`,
                  AND A NAME THAT NEEDS EXPLAINING HAS TO EXPLAIN ITSELF ON THE
                  SCREEN THAT PRINTS IT. It is deliberate and load-bearing
                  (ETAT §29): GitHub Pages gzips by content-type, an unknown
                  extension is `application/octet-stream`, that type IS
                  compressed, and a `Range` is then applied to the COMPRESSED
                  stream — which aims every PMTiles read at the wrong bytes and
                  empties the deep zooms. `image/png` is not compressed. The
                  file is the same PMTiles archive it always was; only the
                  served extension changed. */}
              {/\.png$/.test(wantedArchive) && (
                <p className="muted mt-1" data-testid="archive-suffix-note">
                  {t('settings.offline.suffixNote')}
                </p>
              )}
              {heldArchive && heldArchive !== wantedArchive && (
                <KeyValue
                  label={t('settings.offline.archiveHeld')}
                  value={heldArchive}
                  ltr
                />
              )}
              {bytes > 0 && (
                <KeyValue
                  label={t('settings.offline.size')}
                  value={`${megabytes(bytes)} MB`}
                  ltr
                />
              )}
              {/* ★ PO RETURN 2026-09-01 — THE DEVICE'S OWN CEILING, PRINTED.
                  Safari's quota is a fraction of free disk rather than a fixed
                  number, so "will 94 MB fit" is a question only this device can
                  answer, and it is the first thing to look at when a download
                  refuses. */}
              {quota > 0 && (
                <KeyValue
                  label={t('settings.offline.storage')}
                  value={`${megabytes(usage)} / ${megabytes(quota)} MB`}
                  ltr
                />
              )}
              {persisted !== null && (
                <KeyValue
                  label={t('settings.offline.persisted')}
                  value={t(
                    persisted
                      ? 'settings.offline.persistedYes'
                      : 'settings.offline.persistedNo',
                  )}
                />
              )}
              {/* ★★ WHAT THE LAST ATTEMPT DID. "Plus jamais d'échec muet" is
                  his wording, and this row is the whole of it: every tap ends
                  in a verdict that is written down, success included. */}
              {attempt && (
                <KeyValue
                  label={t('settings.offline.lastAttempt')}
                  value={
                    attempt.ok
                      ? t('settings.offline.attemptOk', {
                          size: megabytes(attempt.stored ?? attempt.received ?? 0),
                        })
                      : t('settings.offline.attemptFailed')
                  }
                />
              )}
            </dl>
            <p className="muted mt-3">{t('settings.offline.explain')}</p>

            {stale && (
              <div className="mt-3">
                <Callout tone="warn" title={t('settings.offline.staleTitle')}>
                  {t('settings.offline.staleHint', { archive: wantedArchive })}
                </Callout>
              </div>
            )}

            {/* ★★ THE FAILURE, NAMED, WITH ITS NUMBERS. Each error code says a
                different thing because each one has a different remedy: no
                room is not a broken connection is not a truncated stream. */}
            {attempt && !attempt.ok && (
              <div className="mt-3" data-testid="map-error">
                <Callout tone="danger" title={t('settings.offline.failTitle')}>
                  {t(`settings.offline.fail.${attempt.error ?? 'unknown'}`, {
                    defaultValue: t('settings.offline.fail.unknown', {
                      detail: attempt.detail ?? attempt.error ?? '—',
                    }),
                    status: attempt.status ?? 0,
                    detail: attempt.detail ?? '—',
                    archive: attempt.archive,
                    received: megabytes(attempt.received ?? 0),
                    expected: megabytes(attempt.expected ?? 0),
                    free: megabytes(
                      Math.max(0, (attempt.quota ?? 0) - (attempt.usage ?? 0)),
                    ),
                    needed: megabytes(attempt.expected ?? 0),
                  })}
                </Callout>
              </div>
            )}

            {attempt?.ok && (attempt.assetsMissed ?? 0) > 0 && (
              <div className="mt-3">
                <Callout tone="warn" title={t('settings.offline.assetsTitle')}>
                  {t('settings.offline.assetsHint', { count: attempt.assetsMissed })}
                </Callout>
              </div>
            )}

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
                  ? expected
                    ? t('settings.offline.downloadingSized', {
                        percent: Math.round((progress ?? 0) * 100),
                        received: megabytes(received ?? 0),
                        expected: megabytes(expected),
                      })
                    : t('settings.offline.downloading', {
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

      {/* ★★ PO RETURN 2026-09-02 — "נקודת מוצא", AND IT IS NOT COSMETIC.
          Every distance, every arrival time and the ★ on the planner's map are
          measured from `HOME_BASE`, a CONSTANT reading Jerusalem. A
          coordinator who leaves from Beer Sheva was being shown a day that
          starts 100 km from his car. See `ui/settings/origin.ts` for what the
          field accepts and why the gazetteer is tried before the numbers. */}
      <Section title={t('settings.origin.title')} className="mt-6" collapseKey="settings-origin">
        <label className="label" htmlFor="settings-origin">
          {t('settings.origin.label')}
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <input
            id="settings-origin"
            type="text"
            className="input min-w-[12rem] flex-1"
            list="settings-origin-options"
            data-testid="origin-input"
            placeholder={t('settings.origin.placeholder')}
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value)
              setOriginState('idle')
            }}
          />
          <datalist id="settings-origin-options">
            {ORIGIN_SUGGESTIONS.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="button"
            className="btn-primary"
            data-testid="origin-save"
            onClick={saveOrigin}
          >
            <Icon name="check" size={16} />
            {t('common.save')}
          </button>
          {/* ★ THE SAME GESTURE AS "מיקומי" ON THE MAP, in the one other place
              a coordinator needs his own position: setting his depot while
              standing in it. */}
          <button
            type="button"
            className="btn-secondary"
            data-testid="origin-here"
            disabled={locating}
            onClick={useMyPosition}
          >
            <Icon name="pin" size={16} />
            {t(locating ? 'settings.origin.locating' : 'settings.origin.here')}
          </button>
        </div>
        <p
          className={`mt-1.5 text-caption ${
            originState === 'bad'
              ? 'text-status-danger-ink'
              : originState === 'saved'
                ? 'text-status-success-ink'
                : 'text-content-muted'
          }`}
          data-testid="origin-hint"
          role={originState === 'bad' ? 'alert' : undefined}
        >
          {originState === 'bad'
            ? t('settings.origin.unresolved')
            : originState === 'saved'
              ? t('settings.origin.saved', { coords: formatCoords(originPosition()) })
              : t('settings.origin.hint', { coords: formatCoords(originPosition()) })}
        </p>
      </Section>

      {/* ★ PO RETURN 2026-09-02 — A REAL "שמור", AND THE OLD REASONING IS
          RETIRED RATHER THAN DEFENDED. The comment here used to argue that a
          single field with a Save next to it is a screen people leave without
          pressing it, so it saved on blur. On his iPad it read as a field with
          NO WAY TO CONFIRM, which is worse: nothing on screen ever said the
          address had been taken. The button is now explicit AND the blur still
          saves, so neither habit loses the value. */}
      {/* ★★ W7 (2026-09-02) — THE COORDINATOR'S CARD IS HIS TO EDIT.
          It was a frozen constant in `config.ts`, and three things read it:
          the rail's account block, the signature at the foot of every
          generated WhatsApp / SMS, and the number those messages tell a
          farmer to call back. The one identity he could not change was the
          one going out under his name. */}
      <Section title={t('settings.profile.title')} className="mt-6" collapseKey="settings-profile">
        <p className="muted mb-3">{t('settings.profile.hint')}</p>
        <div className="auto-cols gap-3 [--col-min:13rem]">
          <div>
            <label className="label" htmlFor="coordinator-name">
              {t('settings.profile.name')}
            </label>
            <input
              id="coordinator-name"
              className="input w-full"
              data-testid="coordinator-name"
              value={me.name}
              onChange={(e) => {
                setMe((c) => ({ ...c, name: e.target.value }))
                setMeSaved(false)
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="coordinator-phone">
              {t('settings.profile.phone')}
            </label>
            <input
              id="coordinator-phone"
              dir="ltr"
              inputMode="tel"
              className="input w-full"
              data-testid="coordinator-phone"
              value={me.phone}
              onChange={(e) => {
                setMe((c) => ({ ...c, phone: e.target.value }))
                setMeSaved(false)
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="coordinator-role">
              {t('settings.profile.role')}
            </label>
            <input
              id="coordinator-role"
              className="input w-full"
              data-testid="coordinator-role"
              value={me.role}
              onChange={(e) => {
                setMe((c) => ({ ...c, role: e.target.value }))
                setMeSaved(false)
              }}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-primary"
            data-testid="coordinator-save"
            onClick={() => {
              writeCoordinator(me)
              setMe(readCoordinator())
              setMeSaved(true)
            }}
          >
            <Icon name="check" size={16} />
            {t('common.save')}
          </button>
          <button
            type="button"
            className="btn-secondary"
            data-testid="coordinator-reset"
            onClick={() => {
              resetCoordinator()
              setMe(readCoordinator())
              setMeSaved(false)
            }}
          >
            <Icon name="history" size={16} />
            {t('settings.profile.reset')}
          </button>
          {meSaved && (
            <span className="text-caption text-status-success-ink" data-testid="coordinator-saved">
              {t('settings.profile.saved')}
            </span>
          )}
        </div>
      </Section>

      <Section title={t('report.recipientLabel')} className="mt-6" collapseKey="settings-report">
        <label className="label" htmlFor="report-recipient">
          {t('report.recipientLabel')}
        </label>
        <div className="flex flex-wrap items-start gap-2">
          <input
            id="report-recipient"
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            className="input min-w-[12rem] flex-1"
            data-testid="report-recipient"
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value)
              setRecipientSaved(false)
            }}
            onBlur={() => {
              writeReportRecipient(recipient)
              setRecipientSaved(true)
            }}
          />
          <button
            type="button"
            className="btn-primary"
            data-testid="report-recipient-save"
            onClick={() => {
              writeReportRecipient(recipient)
              setRecipientSaved(true)
            }}
          >
            <Icon name="check" size={16} />
            {t('common.save')}
          </button>
        </div>
        <p
          className={`mt-1.5 text-caption ${
            recipientSaved ? 'text-status-success-ink' : 'text-content-muted'
          }`}
          data-testid="report-recipient-hint"
        >
          {recipientSaved ? t('report.recipientSaved') : t('report.recipientHint')}
        </p>
      </Section>

      {/* ★★ PO RETURN 2026-09-02 — THE BANDEAU IS GONE, AND IT WAS A LIE BY
          THE TIME HE READ IT. This block used to carry
          `settings.sync.notYet` — "changes are kept in memory only and are
          erased on refresh" — which was TRUE before P2.5b and false the day
          the outbox shipped. A stale warning is worse than no warning: it
          tells a coordinator not to trust work that is in fact safe. What
          replaces it is the state itself, and it says nothing reassuring it
          cannot prove: how many aggregates are waiting, whether the snapshot
          on screen has been confirmed against the server since, and — in demo
          mode, where `useDataState` returns null — that this build has no
          database behind it at all. */}
      <Section title={t('settings.sync.title')} className="mt-6" collapseKey="settings-sync">
        {data === null ? (
          <p className="text-caption text-content-primary">
            {t('settings.sync.demo')}
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2.5 text-caption font-medium text-content-primary">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-pill ${
                  data.pending > 0
                    ? 'bg-status-info'
                    : data.stale
                      ? 'bg-status-warn'
                      : 'bg-status-success'
                }`}
              />
              <span data-testid="sync-state">
                {data.pending > 0
                  ? t('settings.sync.pending', { count: data.pending })
                  : data.stale
                    ? t('settings.sync.stale')
                    : t('settings.sync.clean')}
              </span>
            </p>
            <p className="muted mt-1">
              {data.pending > 0
                ? t('settings.sync.pendingHint')
                : data.stale
                  ? t('settings.sync.staleHint')
                  : t('settings.sync.cleanHint')}
            </p>
          </>
        )}
      </Section>

      {/* N2 (2026-09-02) — the association's contract, uploaded once. */}
      <AgreementTemplateSection />

      {/* N3 (2026-09-02) — the demo dataset, and the one button that removes it. */}
      <DemoDataSection />

      <Section title={t('settings.account.title')} className="mt-6" collapseKey="settings-account">
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

      {/* ⚠️ `<DisplayDiagnostics />` WAS HERE AND IS GONE (PO return
          2026-09-02). It was PO point 1's instrument: a temporary panel
          printing this iPad's four safe-area insets so the status-bar
          arbitration could be settled from his own device rather than from a
          simulation. That arbitration WAS settled — option A, ETAT §24.5 — on
          2026-09-01, which retired the instrument the same day and nobody
          removed it. It was written to come out in one move and it did: this
          line and one import. The component file stays in the tree, unused and
          unimported, because the next display question will want it. */}
    </div>
  )
}
