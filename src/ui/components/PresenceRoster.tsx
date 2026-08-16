import { useTranslation } from 'react-i18next'

import { setPresence, telHref } from '@core/index'
import type {
  MissionLeg,
  PresenceMark,
  PresenceSource,
  Volunteer,
} from '@core/index'
import type { PresenceRow } from '@core/index'

import { Icon } from './Icon'
import { PhoneTypeChip } from './badges'
import { Callout } from './primitives'

/**
 * R6 — NOMINATIVE PRESENCE CONFIRMATION.
 *
 * Replaces the +/- counters. Each volunteer gets their own row and their own
 * pair of buttons, because "5 of 6" tells the coordinator that someone is
 * missing but never *who* — and at 05:00 in the desert that is the only thing
 * that matters.
 *
 * The same component serves both sides of the check:
 *   - `source="driver"` — the driver marks who boarded.
 *   - `source="group"`  — the group's smartphone holder marks who is with them,
 *                         on behalf of the kosher-phone volunteers who cannot
 *                         confirm in-app at all.
 *
 * The two answers are stored independently and compared. A disagreement is
 * never auto-resolved: it becomes a visible amber alert on that person's name.
 */
export function PresenceRoster({
  missionId,
  leg,
  source,
  rows,
  driverName,
  groupHolderName,
  /** Current volunteer, when this is a volunteer's own screen. */
  me,
}: {
  missionId: string
  leg: MissionLeg
  source: PresenceSource
  rows: PresenceRow[]
  driverName?: string
  groupHolderName?: string
  me?: Volunteer | null
}) {
  const { t } = useTranslation()

  const presentLabel =
    source === 'driver' ? t('presence.markPresent') : t('presence.withUs')
  const absentLabel =
    source === 'driver' ? t('presence.markAbsent') : t('presence.notWithUs')

  const mark = (volunteerId: string, value: PresenceMark) => {
    const current = rows.find((r) => r.volunteer.id === volunteerId)?.leg[source]
    // Tapping the active choice again clears it, so a mis-tap is recoverable
    // without hunting for an undo button in the dark.
    setPresence(missionId, volunteerId, leg, source, current === value ? null : value)
  }

  const pending = rows.filter((r) => r.leg[source] === null).length
  const mismatches = rows.filter((r) => r.state === 'mismatch')

  return (
    <div className="flex flex-col gap-3">
      <p className="muted">
        {source === 'driver' ? t('presence.driverHint') : t('presence.rosterHint')}
      </p>

      {mismatches.map((row) => (
        <Callout
          key={row.volunteer.id}
          tone="warn"
          title={t('presence.mismatchOn', { name: row.volunteer.name })}
        >
          <p>
            {t('presence.mismatchExplain', {
              driver: t(`confirm.${row.leg.driver ?? 'pending'}`),
              group: t(`confirm.${row.leg.group ?? 'pending'}`),
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={telHref(row.volunteer.phone)} className="btn-primary py-2">
              <Icon name="phone" size={14} />
              {row.volunteer.name}
            </a>
          </div>
        </Callout>
      ))}

      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const chosen = row.leg[source]
          const isMe = me?.id === row.volunteer.id
          const mismatch = row.state === 'mismatch'

          return (
            <li
              key={row.volunteer.id}
              className={`rounded-lg border p-3 transition-colors duration-fast ${
                mismatch
                  ? 'border-status-warn/60 bg-status-warn/10'
                  : 'border-edge-subtle bg-surface-raised'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-caption font-medium text-content-primary">
                      {row.volunteer.name}
                    </span>
                    <PhoneTypeChip type={row.volunteer.phoneType} />
                    {row.isGroupPhone && (
                      <span className="chip bg-accent/15 text-accent">
                        <Icon name="phone" size={10} />
                        {t('volunteers.groupPhoneHolder')}
                      </span>
                    )}
                  </div>
                  <a
                    href={telHref(row.volunteer.phone)}
                    className="ltr-nums mt-0.5 inline-block text-micro text-content-muted hover:text-accent"
                  >
                    {row.volunteer.phone}
                  </a>
                </div>
              </div>

              {/* Two large targets — thumb-sized, unmistakable, high contrast. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => mark(row.volunteer.id, 'present')}
                  aria-pressed={chosen === 'present'}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-3 text-caption font-semibold
                              transition-all duration-fast ease-out active:scale-[0.98] ${
                                chosen === 'present'
                                  ? 'bg-status-success text-content-on-accent shadow-card'
                                  : 'border border-status-success/40 text-status-success hover:bg-status-success/10'
                              }`}
                >
                  <Icon name="check" size={17} />
                  {presentLabel}
                </button>
                <button
                  type="button"
                  onClick={() => mark(row.volunteer.id, 'absent')}
                  aria-pressed={chosen === 'absent'}
                  className={`flex items-center justify-center gap-2 rounded-md px-3 py-3 text-caption font-semibold
                              transition-all duration-fast ease-out active:scale-[0.98] ${
                                chosen === 'absent'
                                  ? 'bg-status-danger text-content-on-accent shadow-card'
                                  : 'border border-status-danger/40 text-status-danger hover:bg-status-danger/10'
                              }`}
                >
                  <Icon name="close" size={17} />
                  {absentLabel}
                </button>
              </div>

              {/* What the other side said — so a disagreement is legible on the
                  spot, not only on the coordinator's dashboard. */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-micro text-content-muted">
                {source !== 'driver' && driverName && (
                  <span>
                    {t('presence.driverSays')}:{' '}
                    <span
                      className={
                        row.leg.driver === 'absent' ? 'text-status-danger' : ''
                      }
                    >
                      {t(`confirm.${row.leg.driver ?? 'pending'}`)}
                    </span>
                  </span>
                )}
                {source !== 'group' && groupHolderName && (
                  <span>
                    {t('presence.groupSays')}:{' '}
                    <span
                      className={
                        row.leg.group === 'absent' ? 'text-status-danger' : ''
                      }
                    >
                      {t(`confirm.${row.leg.group ?? 'pending'}`)}
                    </span>
                  </span>
                )}
                {row.volunteer.phoneType === 'smartphone' &&
                  row.leg.self !== null && (
                    <span className="text-status-success">
                      {t('presence.selfSays')}: {t(`confirm.${row.leg.self}`)}
                    </span>
                  )}
              </div>

              {/* A smartphone-carrying volunteer can additionally vouch for
                  himself; kosher-phone holders structurally cannot. */}
              {isMe && row.volunteer.phoneType === 'smartphone' && (
                <button
                  type="button"
                  onClick={() =>
                    setPresence(
                      missionId,
                      row.volunteer.id,
                      leg,
                      'self',
                      row.leg.self === 'present' ? null : 'present',
                    )
                  }
                  className={`mt-2 w-full rounded-md px-3 py-2.5 text-caption font-semibold transition-all duration-fast ${
                    row.leg.self === 'present'
                      ? 'bg-accent/20 text-accent'
                      : 'border border-accent/40 text-accent hover:bg-accent/10'
                  }`}
                >
                  <Icon name="check" size={15} className="me-1.5 inline" />
                  {row.leg.self === 'present'
                    ? t('presence.iAmAboardDone')
                    : t('presence.iAmAboard')}
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {pending === 0 ? (
        <p className="flex items-center justify-center gap-2 rounded-md bg-status-success/10 py-2.5 text-caption font-medium text-status-success">
          <Icon name="check" size={15} />
          {t('presence.allConfirmed')}
        </p>
      ) : (
        <p className="text-center text-caption text-content-muted">
          {t('presence.waitingFor', { count: pending })}
        </p>
      )}
    </div>
  )
}
