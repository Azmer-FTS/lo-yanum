import { useTranslation } from 'react-i18next'

import {
  THREAT_INTENSITIES,
  deleteThreatVector,
  deleteThreatZone,
  formatDateTime,
  ringAreaDunams,
  updateThreatVector,
  updateThreatZone,
} from '@core/index'
import type { ThreatIntensity, ThreatVector, ThreatZone } from '@core/index'

import { Icon } from './Icon'
import { ThreatIntensityChip } from './threats'
import { EmptyState, Section } from './primitives'
import { useLocale } from '../hooks/useLocale'

/**
 * G18 — the threat layer's list, beside the map that draws it.
 *
 * Every row is editable in place — intensity, note, delete — because the two
 * facts a coordinator revises are exactly those, and sending him to a modal to
 * change "בינוני" to "גבוה" would mean the field never gets revised at all.
 * The shape itself is edited on the map; this panel edits what the shape MEANS.
 *
 * `updatedAt` is printed on every row and is never editable. It is stamped by
 * the store on every write (see `updateThreatZone`), because a date a caller
 * supplies is a date a caller can forget to bump — and a threat map whose age
 * is unknown invites a coordinator to act in 2027 on an assessment made in
 * 2025.
 *
 * The panel does not check a role. `access.ts` hands a farmer an empty list,
 * so an empty panel is what a farmer's session renders by construction — which
 * is a stronger guarantee than a condition somebody could forget to write.
 */
export function ThreatPanel({
  zones,
  vectors,
  selectedId,
  onSelect,
  farmName,
  currentFarmId,
}: {
  zones: ThreatZone[]
  vectors: ThreatVector[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** For the "attached / free at map level" line on each row. */
  farmName?: string
  /** The farm this panel is being shown on, for the attach/detach control. */
  currentFarmId?: string
}) {
  const { t } = useTranslation()
  const locale = useLocale()

  const empty = zones.length === 0 && vectors.length === 0

  const IntensityPicker = ({
    value,
    onChange,
  }: {
    value: ThreatIntensity
    onChange: (next: ThreatIntensity) => void
  }) => (
    <div className="flex flex-wrap gap-1.5" role="group">
      {THREAT_INTENSITIES.map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          aria-pressed={value === level}
          className={`filter-pill min-h-11 px-3 ${
            value === level ? 'filter-pill-active' : ''
          }`}
        >
          {t(`threat.intensity.${level}`)}
        </button>
      ))}
    </div>
  )

  /**
   * G18 — ATTACHED OR FREE, AND SWITCHABLE FROM HERE.
   *
   * A shape is DRAWN from an entity's screen, because that is the only map in
   * the app that carries a drawing instrument — the global map is a reading
   * surface with a filter bar, and bolting a polygon editor onto it would give
   * the same gesture two homes. So the free-standing case is reached by
   * DETACHING: draw it on the farm whose map you happen to have open, then say
   * it belongs to no one. Same two states the model has, one fewer editor to
   * learn.
   */
  const Attachment = ({
    farmId,
    onChange,
  }: {
    farmId: string | null
    onChange: (next: string | null) => void
  }) => (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className="muted">
        {farmId === null || farmName === undefined
          ? t('threat.freeStanding')
          : t('threat.attachedTo', { name: farmName })}
      </span>
      {farmName !== undefined && (
        <button
          type="button"
          onClick={() => onChange(farmId === null ? currentFarmId ?? null : null)}
          className="btn-ghost py-1 text-micro"
        >
          <Icon name="switch" size={12} />
          {t(farmId === null ? 'threat.attach' : 'threat.detach')}
        </button>
      )}
    </div>
  )

  return (
    <Section
      title={t('threat.layer')}
      // The role restriction is stated on the panel itself, once: a
      // coordinator writing an assessment should know who can read it back.
      action={
        <span className="chip bg-status-warn/15 text-status-warn-ink">
          <Icon name="eye" size={11} />
          {t('threat.coordinatorOnly')}
        </span>
      }
    >
      {empty ? (
        <EmptyState icon="alert" title={t('threat.none')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {zones.map((z) => (
            <li
              key={z.id}
              className={`rounded-field border px-3 py-2.5 transition-colors duration-fast ${
                z.id === selectedId
                  ? 'border-accent bg-accent/10'
                  : 'border-edge-subtle'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ThreatIntensityChip intensity={z.intensity} />
                <span className="text-caption font-medium text-content-primary">
                  {t('threat.zone')}
                </span>
                <span className="numeric ltr-nums muted">
                  {t('zone.areaDunams', {
                    n: Math.round(ringAreaDunams(z.ring)).toLocaleString(locale),
                  })}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(z.id === selectedId ? null : z.id)}
                  className="btn-secondary ms-auto shrink-0 py-1.5 text-micro"
                >
                  <Icon name="eye" size={13} />
                  {t('threat.showOnMap')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteThreatZone(z.id)
                    if (z.id === selectedId) onSelect(null)
                  }}
                  aria-label={t('threat.deleteZone')}
                  className="btn-ghost shrink-0 py-1.5 text-micro text-status-danger-ink"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>

              <textarea
                className="input mt-2 min-h-16 w-full"
                value={z.note}
                placeholder={t('threat.notePlaceholder')}
                onChange={(e) => updateThreatZone(z.id, { note: e.target.value })}
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <IntensityPicker
                  value={z.intensity}
                  onChange={(intensity) => updateThreatZone(z.id, { intensity })}
                />
                <span className="muted ltr-nums">
                  {t('threat.updatedAt')} {formatDateTime(z.updatedAt, locale)}
                </span>
              </div>
              <Attachment
                farmId={z.farmId}
                onChange={(farmId) => updateThreatZone(z.id, { farmId })}
              />
            </li>
          ))}

          {vectors.map((v) => (
            <li
              key={v.id}
              className={`rounded-field border px-3 py-2.5 transition-colors duration-fast ${
                v.id === selectedId
                  ? 'border-accent bg-accent/10'
                  : 'border-edge-subtle'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ThreatIntensityChip intensity={v.intensity} />
                <span className="text-caption font-medium text-content-primary">
                  {t('threat.vector')}
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(v.id === selectedId ? null : v.id)}
                  className="btn-secondary ms-auto shrink-0 py-1.5 text-micro"
                >
                  <Icon name="eye" size={13} />
                  {t('threat.showOnMap')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteThreatVector(v.id)
                    if (v.id === selectedId) onSelect(null)
                  }}
                  aria-label={t('threat.deleteVector')}
                  className="btn-ghost shrink-0 py-1.5 text-micro text-status-danger-ink"
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>

              <textarea
                className="input mt-2 min-h-16 w-full"
                value={v.note}
                placeholder={t('threat.notePlaceholder')}
                onChange={(e) => updateThreatVector(v.id, { note: e.target.value })}
              />

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <IntensityPicker
                  value={v.intensity}
                  onChange={(intensity) => updateThreatVector(v.id, { intensity })}
                />
                <span className="muted ltr-nums">
                  {t('threat.updatedAt')} {formatDateTime(v.updatedAt, locale)}
                </span>
              </div>
              <Attachment
                farmId={v.farmId}
                onChange={(farmId) => updateThreatVector(v.id, { farmId })}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
