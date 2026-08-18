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
 * typographic treatment: display scale, generous leading, and enough
 * surrounding space that nothing competes with it.
 *
 * G17 — the identity is neutral now, and the 2026-08-19 PO decision (A60)
 * finished the job: the association's mark is retired, so the landing is
 * לא ינום + the verse and nothing else. The verse sits on the LANDING PLATE
 * (`bg-gradient-brand`), a deep slate wash, identical in light and dark on
 * purpose: it does not have a night variant, and the ink on it comes from
 * `--text-on-brand` rather than from the theme.
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
          <h1 className="flex items-center justify-center gap-3 text-display text-content-primary">
            {/* SOLID, not a 15 % wash: next to 64 px display type a tinted tile
                reads as a placeholder. */}
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-accent text-content-on-accent shadow-accent sm:h-14 sm:w-14">
              <Icon name="shield" size={26} />
            </span>
            {t('app.name')}
          </h1>

          {/* THE LANDING PLATE — the one deliberately dark surface in light. */}
          <div className="mx-auto mt-8 max-w-xl rounded-card bg-gradient-brand px-6 py-8 shadow-lift sm:px-10 sm:py-10">
            <p className="font-brand text-title font-normal leading-loose text-content-on-brand sm:text-[1.75rem]">
              {t('app.verse')}
            </p>
            <span
              aria-hidden="true"
              className="mx-auto mt-5 block h-px w-16 bg-content-on-brand/40"
            />
            <p className="mt-4 text-caption tracking-wide text-content-on-brand/85">
              {t('app.verseRef')}
            </p>
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
                  <p className="mb-3 flex items-center gap-2 text-caption font-semibold text-accent-ink">
                    <Icon name={ROLE_ICON[role]} size={17} />
                    {t(`roles.${role}`)}
                  </p>
                  <div className="flex flex-col gap-1">
                    {group.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => enter(preset)}
                        className="group flex items-center justify-between gap-3 rounded-field px-3 py-2.5 text-start
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
                        <span className="shrink-0 text-content-muted transition-colors duration-fast group-hover:text-accent-ink">
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
