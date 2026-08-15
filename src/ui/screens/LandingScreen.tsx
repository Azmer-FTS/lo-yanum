import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import {
  homeRouteFor,
  listSessionPresets,
  presetToSession,
  setSession,
} from '@core/index'
import type { Role, SessionPreset } from '@core/index'

import { Icon } from '../components/Icon'
import { useCoreValue } from '../hooks/useCore'

const ROLE_ORDER: Role[] = ['coordinator', 'farmer', 'volunteer', 'driver']

const ROLE_ICON: Record<Role, 'dashboard' | 'farm' | 'shield' | 'car'> = {
  coordinator: 'dashboard',
  farmer: 'farm',
  volunteer: 'shield',
  driver: 'car',
}

export function LandingScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const presets = useCoreValue(listSessionPresets)

  const enter = (preset: SessionPreset) => {
    setSession(presetToSession(preset))
    navigate(homeRouteFor(preset.role))
  }

  return (
    <div className="flex min-h-dvh flex-col bg-night-950 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:py-16">
        <header className="text-center">
          <span className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-sand-300">
            <Icon name="shield" size={34} />
          </span>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {t('app.name')}
          </h1>

          {/* Tehillim 121:4 — the app's motto. */}
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-sand-200 sm:text-xl">
            {t('app.verse')}
          </p>
          <p className="mt-1.5 text-sm text-white/40">{t('app.verseRef')}</p>
          <p className="mt-5 text-sm text-white/55">{t('app.tagline')}</p>
        </header>

        <section className="mt-10">
          <h2 className="text-sm font-semibold text-white/80">
            {t('login.title')}
          </h2>
          <p className="mt-1 text-sm text-white/45">{t('login.subtitle')}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {ROLE_ORDER.map((role) => {
              const group = presets.filter((p) => p.role === role)
              if (group.length === 0) return null

              return (
                <div
                  key={role}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="mb-2.5 flex items-center gap-2 text-sm font-medium text-sand-300">
                    <Icon name={ROLE_ICON[role]} size={17} />
                    {t(`roles.${role}`)}
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {group.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => enter(preset)}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start
                                   transition-colors hover:bg-white/10"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {preset.name || t('login.coordinatorEntry')}
                          </span>
                          {preset.detail && (
                            <span className="block truncate text-xs text-white/45">
                              {preset.detail}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-white/30">
                          <Icon name="chevron" size={16} className="rtl:-scale-x-100" />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <p className="mt-8 text-center text-xs text-white/30">
          {t('login.pocNotice')}
        </p>
      </div>
    </div>
  )
}
