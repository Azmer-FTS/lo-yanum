import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  archiveVolunteer,
  getVolunteerStats,
  getVolunteers,
  reactivateVolunteer,
} from '@core/index'
import type { Volunteer } from '@core/index'

import { ContactButtons } from '../../components/ContactActions'
import { Icon } from '../../components/Icon'
import { PhoneTypeChip, VolunteerStatusChip } from '../../components/badges'
import {
  EmptyState,
  FilterSelect,
  Modal,
  PageHeader,
  SearchInput,
  Stat,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const ALL = 'all'

function ArchiveDialog({
  volunteer,
  onClose,
}: {
  volunteer: Volunteer
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  const canSubmit = reason.trim().length > 0

  return (
    <Modal title={t('volunteers.archiveTitle')} onClose={onClose}>
      <p className="mb-3 text-sm text-night-950/70">{volunteer.name}</p>
      <label className="block">
        <span className="muted mb-1 block">{t('volunteers.archiveReason')}</span>
        <textarea
          className="input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('volunteers.archiveReasonPlaceholder')}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onClose}>
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!canSubmit}
          onClick={() => {
            archiveVolunteer(volunteer.id, reason.trim())
            onClose()
          }}
        >
          {t('volunteers.archive')}
        </button>
      </div>
    </Modal>
  )
}

function VolunteerRow({
  volunteer,
  onArchive,
}: {
  volunteer: Volunteer
  onArchive: (v: Volunteer) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="px-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{volunteer.name}</span>
        <PhoneTypeChip type={volunteer.phoneType} />
        {volunteer.status === 'inactive' && (
          <VolunteerStatusChip status={volunteer.status} />
        )}
        <span className="chip bg-sand-100 text-night-950/70">
          <Icon name="shield" size={12} />
          <span className="tabular-nums">{volunteer.guardsCount}</span>
        </span>
      </div>

      <p className="muted mt-0.5">
        {volunteer.locality} · {t('volunteers.age')}{' '}
        <span className="ltr-nums">{volunteer.age}</span>
        {volunteer.notes && ` · ${volunteer.notes}`}
      </p>

      {volunteer.status === 'inactive' && volunteer.inactiveReason && (
        <p className="mt-1 rounded-lg bg-sand-100 px-2.5 py-1.5 text-xs text-night-950/60">
          {t('volunteers.inactiveReason')}: {volunteer.inactiveReason}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ContactButtons name={volunteer.name} phone={volunteer.phone} />
        <span className="ltr-nums text-xs text-night-950/50">
          {volunteer.phone}
        </span>
        <span className="flex-1" />
        {volunteer.status === 'active' ? (
          <button
            type="button"
            onClick={() => onArchive(volunteer)}
            className="btn-ghost py-1.5 text-xs"
          >
            {t('volunteers.archive')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => reactivateVolunteer(volunteer.id)}
            className="btn-ghost py-1.5 text-xs"
          >
            {t('volunteers.reactivate')}
          </button>
        )}
      </div>
    </div>
  )
}

export function VolunteersScreen() {
  const { t } = useTranslation()
  const volunteers = useCoreValue(getVolunteers)
  const stats = useCoreValue(getVolunteerStats)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState(ALL)
  const [phoneType, setPhoneType] = useState(ALL)
  const [locality, setLocality] = useState(ALL)
  const [archiving, setArchiving] = useState<Volunteer | null>(null)

  const localities = useMemo(
    () => [...new Set(volunteers.map((v) => v.locality))].sort(),
    [volunteers],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return volunteers.filter((v) => {
      if (status !== ALL && v.status !== status) return false
      if (phoneType !== ALL && v.phoneType !== phoneType) return false
      if (locality !== ALL && v.locality !== locality) return false
      if (!q) return true
      return (
        v.name.toLowerCase().includes(q) ||
        v.yeshiva.toLowerCase().includes(q) ||
        v.locality.toLowerCase().includes(q)
      )
    })
  }, [volunteers, status, phoneType, locality, query])

  // Grouped by yeshiva — that is how the coordinator actually recruits.
  const groups = useMemo(() => {
    const byYeshiva = new Map<string, Volunteer[]>()
    for (const v of filtered) {
      const list = byYeshiva.get(v.yeshiva) ?? []
      list.push(v)
      byYeshiva.set(v.yeshiva, list)
    }
    return [...byYeshiva.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [filtered])

  return (
    <>
      <PageHeader
        title={t('volunteers.title')}
        subtitle={t('volunteers.count', { count: filtered.length })}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={t('volunteerStatus.active')} value={stats.active} tone="good" />
        <Stat label={t('volunteerStatus.inactive')} value={stats.inactive} />
        <Stat label={t('volunteers.statsSmartphone')} value={stats.smartphone} />
        <Stat label={t('volunteers.statsKosher')} value={stats.kosher} />
      </div>

      <div className="card card-pad mb-4 flex flex-col gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('common.search')}
        />
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label={t('volunteers.filterStatus')}
            value={status}
            onChange={setStatus}
            options={[
              { value: ALL, label: t('common.all') },
              { value: 'active', label: t('volunteerStatus.active') },
              { value: 'inactive', label: t('volunteerStatus.inactive') },
            ]}
          />
          <FilterSelect
            label={t('volunteers.filterPhone')}
            value={phoneType}
            onChange={setPhoneType}
            options={[
              { value: ALL, label: t('common.all') },
              { value: 'smartphone', label: t('phoneType.smartphone') },
              { value: 'kosher', label: t('phoneType.kosher') },
            ]}
          />
          <FilterSelect
            label={t('volunteers.filterLocality')}
            value={locality}
            onChange={setLocality}
            options={[
              { value: ALL, label: t('common.all') },
              ...localities.map((l) => ({ value: l, label: l })),
            ]}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon="users" title={t('volunteers.empty')} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {groups.map(([yeshiva, members]) => (
            <section key={yeshiva} className="card card-pad">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="section-title">{yeshiva}</h2>
                <span className="chip bg-sand-100 text-night-950/70">
                  {t('volunteers.count', { count: members.length })}
                </span>
              </div>
              <ul className="divide-y divide-sand-200">
                {members.map((v) => (
                  <li key={v.id}>
                    <VolunteerRow volunteer={v} onArchive={setArchiving} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {archiving && (
        <ArchiveDialog
          volunteer={archiving}
          onClose={() => setArchiving(null)}
        />
      )}
    </>
  )
}
