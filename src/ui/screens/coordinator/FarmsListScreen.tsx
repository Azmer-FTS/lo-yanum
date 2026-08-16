import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'

import { FARM_PIPELINE, getVisibleFarms } from '@core/index'
import type { FarmStatus, FarmType } from '@core/index'

import { Icon } from '../../components/Icon'
import { FarmStatusChip, FarmStatusDot } from '../../components/badges'
import {
  EmptyState,
  FilterBar,
  FilterPill,
  PageHeader,
  RowLink,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']
const TYPES: FarmType[] = ['agriculture', 'livestock', 'mixed']

export function FarmsListScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)

  // The dashboard links here with ?status=… — keep that in the URL so the
  // filtered list is shareable and survives a refresh.
  const [params, setParams] = useSearchParams()
  const status = (params.get('status') as FarmStatus | null) ?? null
  const [type, setType] = useState<FarmType | null>(null)
  const [query, setQuery] = useState('')

  const setStatus = (value: FarmStatus | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete('status')
    else next.set('status', value)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return farms.filter((farm) => {
      if (status !== null && farm.status !== status) return false
      if (type !== null && farm.type !== type) return false
      if (!q) return true
      return (
        farm.name.toLowerCase().includes(q) ||
        farm.locality.toLowerCase().includes(q) ||
        farm.region.toLowerCase().includes(q) ||
        farm.contacts.some((c) => c.name.toLowerCase().includes(q))
      )
    })
  }, [farms, status, type, query])

  return (
    <>
      <PageHeader
        title={t('farms.title')}
        subtitle={t('common.showingOf', {
          shown: filtered.length,
          total: farms.length,
        })}
        actions={
          <Link to="/coordinator/farms/new" className="btn-primary">
            <Icon name="plus" size={15} />
            {t('farms.new')}
          </Link>
        }
      />

      <FilterBar
        search={query}
        onSearch={setQuery}
        searchPlaceholder={t('farms.searchPlaceholder')}
      >
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            active={status === s}
            onClick={() => setStatus(status === s ? null : s)}
            dot={<FarmStatusDot status={s} />}
            count={farms.filter((f) => f.status === s).length}
          >
            {t(`farmStatus.${s}`)}
          </FilterPill>
        ))}
        <span className="h-5 w-px shrink-0 bg-edge-strong" />
        {TYPES.map((ft) => (
          <FilterPill
            key={ft}
            active={type === ft}
            onClick={() => setType(type === ft ? null : ft)}
          >
            {t(`farmType.${ft}`)}
          </FilterPill>
        ))}
      </FilterBar>

      {filtered.length === 0 ? (
        <EmptyState icon="farm" title={t('farms.empty')} />
      ) : (
        <ul className="card divide-y divide-edge-subtle p-1.5">
          {filtered.map((farm) => (
            <li key={farm.id}>
              <RowLink to={`/coordinator/farms/${farm.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <FarmStatusDot status={farm.status} />
                  <span className="text-caption font-medium text-content-primary">
                    {farm.name}
                  </span>
                  <FarmStatusChip status={farm.status} />
                </div>
                <p className="muted mt-0.5">
                  {farm.locality} · {farm.region} · {t(`farmType.${farm.type}`)}
                  {' · '}
                  <span className="ltr-nums">{farm.farmHectares}</span>{' '}
                  {t('farms.hectares')}
                </p>
              </RowLink>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
