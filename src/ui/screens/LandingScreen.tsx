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
import type { IconName } from '../components/Icon'
import { useCoreValue } from '../hooks/useCore'

const ROLE_ORDER: Role[] = ['coordinator', 'farmer', 'volunteer', 'driver']

const ROLE_ICON: Record<Role, IconName> = {
  coordinator: 'dashboard',
  farmer: 'farm',
  volunteer: 'shield',
  driver: 'car',
}

/**
 * The face of the app.
 *
 * Tehillim 121:4 is the reason this project has its name, so it gets real
 * typographic treatment: display scale, generous leading, an amber hairline
 * above and below, and enough surrounding space that nothing competes with it.
 */
export function LandingScreen() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const presets = useCoreValue(listSessionPresets)

  const enter = (preset: SessionPreset) => {
    setSession(presetToSession(preset))
    navigate(homeRouteFor(preset.role))
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-surface-base">
      {/* Warm glow behind the mark — a fire on a dark hillside. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-96 opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgb(var(--accent) / 0.35), transparent 65%)',
        }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-5 py-12 sm:py-16">
        <header className="text-center">
          <span className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-lg bg-accent/15 text-accent shadow-accent ring-1 ring-accent/30">
            <Icon name="shield" size={34} />
          </span>

          <h1 className="text-display text-content-primary">{t('app.name')}</h1>

          <div className="mx-auto mt-8 max-w-xl">
            <span
              aria-hidden="true"
              className="mx-auto mb-5 block h-px w-24 bg-gradient-to-l from-transparent via-accent to-transparent"
            />
            <p className="text-title font-normal leading-loose text-content-primary/90 sm:text-[1.75rem]">
              {t('app.verse')}
            </p>
            <p className="mt-3 text-caption tracking-wide text-accent/80">
              {t('app.verseRef')}
            </p>
            <span
              aria-hidden="true"
              className="mx-auto mt-5 block h-px w-24 bg-gradient-to-l from-transparent via-accent to-transparent"
            />
          </div>

          <p className="mt-7 text-caption text-content-muted">
            {t('app.tagline')}
          </p>
        </header>

        <section className="mt-12">
          <h2 className="text-heading text-content-primary">
            {t('login.title')}
          </h2>
          <p className="muted mt-1">{t('login.subtitle')}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {ROLE_ORDER.map((role) => {
              const group = presets.filter((p) => p.role === role)
              if (group.length === 0) return null

              return (
                <div key={role} className="card card-pad">
                  <p className="mb-3 flex items-center gap-2 text-caption font-semibold text-accent">
                    <Icon name={ROLE_ICON[role]} size={17} />
                    {t(`roles.${role}`)}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => enter(preset)}
                        className="group flex items-center justify-between gap-3 rounded-md px-3 py-2.5 text-start
                                   transition-all duration-fast ease-out hover:bg-surface-high active:scale-[0.99]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-caption font-medium text-content-primary">
                            {preset.name || t('login.coordinatorEntry')}
                          </span>
                          {preset.detail && (
                            <span className="block truncate text-micro text-content-muted">
                              {preset.detail}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-content-muted transition-colors duration-fast group-hover:text-accent">
                          <Icon
                            name="chevron"
                            size={16}
                            className="rtl:-scale-x-100"
                          />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <p className="mt-10 text-center text-micro text-content-muted/70">
          {t('login.pocNotice')}
        </p>
      </div>
    </div>
  )
}
