import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  getSession,
  homeRouteFor,
  listSessionPresets,
  presetIdOf,
  presetToSession,
  resetStore,
  setSession,
} from '@core/index'
import type { Role } from '@core/index'

import { useCoreValue } from '../hooks/useCore'
import { Icon } from './Icon'

const ROLE_ORDER: Role[] = ['coordinator', 'farmer', 'volunteer', 'driver']

/**
 * POC-only role switcher. Deleted in Lot 1 together with @core/sessions —
 * nothing else in the app imports either.
 */
export function DevToolbar() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const presets = useCoreValue(listSessionPresets)
  const session = useCoreValue(getSession)
  const currentId = presetIdOf(session)

  const onPick = (id: string) => {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    setSession(presetToSession(preset))
    navigate(homeRouteFor(preset.role))
  }

  // Not sticky itself: the layouts decide where the bar sits, so it can share a
  // single sticky container with the field tab bar instead of the two fighting
  // over `bottom-0`.
  return (
    <div className="border-t border-edge-strong bg-surface-sunken">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <span className="flex items-center gap-1.5 text-micro font-medium text-content-muted">
          <Icon name="switch" size={14} />
          {t('devbar.viewAs')}
        </span>

        <select
          value={currentId}
          onChange={(e) => onPick(e.target.value)}
          aria-label={t('devbar.viewAs')}
          className="min-w-0 flex-1 rounded-sm border border-edge-strong bg-surface-raised px-3 py-1.5 text-caption
                     text-content-primary transition-colors duration-fast focus:border-accent focus:outline-none sm:min-w-64 sm:flex-none"
        >
          {ROLE_ORDER.map((role) => {
            const group = presets.filter((p) => p.role === role)
            if (group.length === 0) return null
            return (
              <optgroup key={role} label={t(`roles.${role}`)}>
                {group.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name
                      ? `${p.name}${p.detail ? ` · ${p.detail}` : ''}`
                      : t(`roles.${role}`)}
                  </option>
                ))}
              </optgroup>
            )
          })}
        </select>

        <button
          type="button"
          onClick={() => {
            resetStore()
            navigate(homeRouteFor(getSession().role))
          }}
          className="rounded-sm px-2.5 py-1.5 text-micro text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
        >
          {t('devbar.reset')}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-sm px-2.5 py-1.5 text-micro text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
        >
          {t('devbar.backToLogin')}
        </button>

        <span className="ms-auto hidden text-micro text-content-muted/60 lg:block">
          {t('devbar.hint')}
        </span>
      </div>
    </div>
  )
}
