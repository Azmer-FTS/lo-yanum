import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'

import { FARM_PIPELINE, getVisibleFarms } from '@core/index'
import type { FarmStatus, FarmType } from '@core/index'

import { FarmStatusChip, FarmStatusDot } from '../../components/badges'
import {
  EmptyState,
  FilterSelect,
  PageHeader,
  RowLink,
  SearchInput,
} from '../../components/primitives'
import { useCoreValue } from '../../hooks/useCore'

const ALL = 'all'
const STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']
const TYPES: FarmType[] = ['agriculture', 'livestock', 'mixed']

export function FarmsListScreen() {
  const { t } = useTranslation()
  const farms = useCoreValue(getVisibleFarms)

  // The dashboard links here with ?status=… — keep that in the URL so the
  // filtered list is shareable and survives a refresh.
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ALL
  const [type, setType] = useState<string>(ALL)
  const [query, setQuery] = useState('')

  const setStatus = (value: string) => {
    const next = new URLSearchParams(params)
    if (value === ALL) next.delete('status')
    else next.set('status', value)
    setParams(next, { replace: true })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return farms.filter((farm) => {
      if (status !== ALL && farm.status !== status) return false
      if (type !== ALL && farm.type !== type) return false
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
        subtitle={t('farms.count', { count: filtered.length })}
      />

      <div className="card card-pad mb-4 flex flex-col gap-3">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('common.searchFarms')}
        />
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            label={t('farms.filterStatus')}
            value={status}
            onChange={setStatus}
            options={[
              { value: ALL, label: t('common.all') },
              ...STATUSES.map((s) => ({
                value: s,
                label: t(`farmStatus.${s}`),
              })),
            ]}
          />
          <FilterSelect
            label={t('farms.filterType')}
            value={type}
            onChange={setType}
            options={[
              { value: ALL, label: t('common.all') },
              ...TYPES.map((s) => ({ value: s, label: t(`farmType.${s}`) })),
            ]}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="farm" title={t('farms.empty')} />
      ) : (
        <ul className="card divide-y divide-sand-200 p-1.5">
          {filtered.map((farm) => (
            <li key={farm.id}>
              <RowLink to={`/coordinator/farms/${farm.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <FarmStatusDot status={farm.status} />
                  <span className="text-sm font-medium">{farm.name}</span>
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
