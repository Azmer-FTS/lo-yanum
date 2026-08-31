import { useEffect, useRef } from 'react'
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

import { SUPABASE_CONFIGURED } from '../../data/config'
import { useCoreValue } from '../hooks/useCore'
import { Icon } from './Icon'

const ROLE_ORDER: Role[] = ['coordinator', 'farmer', 'volunteer', 'driver']

/**
 * POC-only role switcher. Deleted in Lot 1 together with @core/sessions —
 * nothing else in the app imports either.
 */
export function DevToolbar() {
  /**
   * P2.3 — GONE IN A REAL BUILD. This bar hands out farmer, volunteer and
   * driver sessions on mock people; behind a real login that is not a
   * convenience, it is a way to be someone else. The flag is a build-time
   * constant, so returning before the hooks can never change their order — and
   * `--shell-bottom` falling back to its token default is what the effect
   * below was already written to allow.
   */
  if (SUPABASE_CONFIGURED) return null

  const { t } = useTranslation()
  const navigate = useNavigate()
  const presets = useCoreValue(listSessionPresets)
  const session = useCoreValue(getSession)
  const currentId = presetIdOf(session)
  const ref = useRef<HTMLDivElement | null>(null)

  /**
   * Publish this bar's real height as `--shell-bottom`.
   *
   * Every sticky footer and every full-height map column has to sit above it,
   * and its height is NOT constant: the row wraps on a narrow phone, so a
   * hard-coded offset overlaps by a few pixels at exactly the width where it
   * matters most. Measuring makes the offset exact at any width, and when
   * Lot 1 deletes this component the variable falls back to its token default.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const publish = () => {
      document.documentElement.style.setProperty(
        '--shell-bottom',
        `${el.getBoundingClientRect().height}px`,
      )
    }
    publish()
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--shell-bottom')
    }
  }, [])

  const onPick = (id: string) => {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return
    setSession(presetToSession(preset))
    navigate(homeRouteFor(preset.role))
  }

  // Not sticky itself: the layouts decide where the bar sits, so it can share a
  // single sticky container with the field tab bar instead of the two fighting
  // over `bottom-0`.
  //
  // PO return 6 — the home-indicator inset is PADDING ON THIS BAR rather than
  // on a wrapper, for one reason: `--shell-bottom` is this element's MEASURED
  // height, so anything the bar has to sit above has to be inside the box being
  // measured. Put the inset on a parent and the bar renders under the home
  // indicator while every sticky footer in the app clears a bar that is 34 px
  // taller than the one it can see.
  return (
    <div
      ref={ref}
      className="border-t border-edge-strong bg-surface-sunken pb-[var(--safe-bottom)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <span className="flex items-center gap-1.5 text-micro font-medium text-content-muted">
          <Icon name="switch" size={14} />
          {t('devbar.viewAs')}
        </span>

        <select
          value={currentId}
          onChange={(e) => onPick(e.target.value)}
          aria-label={t('devbar.viewAs')}
          className="min-w-0 flex-1 rounded-field border border-edge-strong bg-surface-raised px-3 py-1.5 text-caption
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
          className="rounded-field px-2.5 py-1.5 text-micro text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
        >
          {t('devbar.reset')}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-field px-2.5 py-1.5 text-micro text-content-muted transition-colors duration-fast hover:bg-surface-high hover:text-content-primary"
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
