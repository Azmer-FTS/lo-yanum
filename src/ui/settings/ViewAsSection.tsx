import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { homeRouteFor, listSessionPresets } from '@core/index'
import type { Role, SessionPreset } from '@core/index'

import { SUPABASE_CONFIGURED } from '../../data/config'
import { Avatar } from '../components/Avatar'
import { Icon } from '../components/Icon'
import { Callout, FilterPill, FilterRow, Section } from '../components/primitives'
import { useCoreValue } from '../hooks/useCore'
import { stopViewAs, useViewAs, viewAs } from './viewAs'

/**
 * ★★ Y13 (2026-09-04) — "מצב תצוגה", THE COORDINATOR'S OWN TEST DOOR.
 *
 * See `viewAs.ts` for why this is safe and why it is demo-only. What is here
 * is the choosing: a role, then the person.
 *
 * ★ THE PEOPLE ARE THE APP'S OWN, NOT A LIST TYPED HERE. `listSessionPresets`
 *   already answers "whose screen is worth looking at" — a farmer whose farm
 *   has guards, a volunteer who carries a group phone, a driver with a trip —
 *   because the landing screen has asked it since the POC. Reusing it means
 *   the product owner cannot land on an empty screen and think the interface
 *   is broken when it is the fixture that is.
 */
const ROLES: Role[] = ['farmer', 'volunteer', 'driver']

export function ViewAsSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const presets = useCoreValue(listSessionPresets)
  const active = useViewAs()
  const [role, setRole] = useState<Role>('farmer')

  const people = useMemo(
    () => presets.filter((p) => p.role === role),
    [presets, role],
  )

  /**
   * ⚠️ NOT RENDERED WHEN THE BUILD HAS A REAL BACKEND. With Supabase the role
   *    is a claim on a token and every read is filtered by it server-side;
   *    swapping a client-side session would show a screen the server would
   *    never actually serve. A test door that lies is worse than none.
   */
  if (SUPABASE_CONFIGURED) return null

  const step = (preset: SessionPreset): void => {
    viewAs(preset)
    navigate(homeRouteFor(preset.role))
  }

  return (
    <Section
      title={t('viewAs.title')}
      className="mt-6"
      collapseKey="settings-viewas"
      summary={active ? `${t(`roles.${active.role}`)} · ${active.name}` : undefined}
    >
      <Callout tone="info" title={t('viewAs.title')}>
        {t('viewAs.hint')}
      </Callout>

      {active && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card bg-accent/10 p-3">
          <Icon name="users" size={16} className="text-accent-ink" />
          <span className="text-caption text-content-primary">
            {t('viewAs.current', {
              role: t(`roles.${active.role}`),
              name: active.name,
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              stopViewAs()
              navigate('/coordinator')
            }}
            data-testid="view-as-stop"
            className="btn-secondary ms-auto py-1.5 text-micro"
          >
            <Icon name="close" size={13} />
            {t('viewAs.back')}
          </button>
        </div>
      )}

      <div className="mt-3">
        <FilterRow active={false} onClear={() => undefined}>
          {ROLES.map((r) => (
            <FilterPill
              key={r}
              active={role === r}
              onClick={() => setRole(r)}
              count={presets.filter((p) => p.role === r).length}
            >
              {t(`roles.${r}`)}
            </FilterPill>
          ))}
        </FilterRow>
      </div>

      {people.length === 0 ? (
        <p className="muted">{t('viewAs.nobody')}</p>
      ) : (
        <ul
          data-testid="view-as-people"
          className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]"
        >
          {people.map((preset) => (
            <li key={preset.id}>
              <button
                type="button"
                onClick={() => step(preset)}
                data-testid="view-as-person"
                className="tile-interactive flex w-full items-center gap-2.5 px-3 py-2 text-start"
              >
                <Avatar photo={null} name={preset.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption font-medium text-content-primary">
                    {preset.name}
                  </span>
                  <span className="muted block truncate">{preset.detail}</span>
                </span>
                <Icon name="chevron" size={14} className="shrink-0 rtl:-scale-x-100 text-content-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
