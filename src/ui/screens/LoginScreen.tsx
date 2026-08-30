import { useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { signIn } from '../../data/auth'
import type { SignInError } from '../../data/auth'
import { Icon } from '../components/Icon'

const ERROR_KEY: Record<SignInError, string> = {
  credentials: 'auth.errors.credentials',
  unconfirmed: 'auth.errors.unconfirmed',
  'rate-limit': 'auth.errors.rateLimit',
  network: 'auth.errors.network',
}

/**
 * THE REAL FRONT DOOR (P2.3).
 *
 * Not the landing screen: that one is the POC's identity picker and it stays
 * with the POC. This screen exists only in a build pointed at Supabase, and
 * behind it there is nothing — no route, no shell, no data — until someone
 * signs in.
 *
 * There is no sign-up and no "forgot password" link, and both absences are
 * decisions rather than omissions. Phase 1 has ONE account; it is created in
 * Supabase's own dashboard by the product owner, who is the only person who
 * ever types its password. A recovery flow means an email link, and an email
 * link means parsing a token out of the URL hash — which is this app's ROUTER.
 * When there is a second account, that is the moment to build it properly.
 */
export function LoginScreen() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return

    if (email.trim() === '' || password === '') {
      setError('auth.errors.missing')
      return
    }

    setBusy(true)
    setError(null)
    const result = await signIn(email, password)
    if (result.ok) {
      // Nothing to navigate to: `onAuthStateChange` publishes the session and
      // the gate above this screen swaps it for the app.
      return
    }
    setBusy(false)
    setPassword('')
    setError(ERROR_KEY[result.error])
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-surface-base">
      {/* The same warm glow as the landing screen: a fire on a dark hillside. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 h-96 opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(ellipse at center, rgb(var(--accent) / 0.35), transparent 65%)',
        }}
      />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-12">
        <header className="text-center">
          <h1 className="flex items-center justify-center gap-3 text-display text-content-primary">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill bg-accent text-content-on-accent shadow-accent sm:h-14 sm:w-14">
              <Icon name="shield" size={26} />
            </span>
            {t('app.name')}
          </h1>

          {/* THE LANDING PLATE, kept: the verse is the reason for the name and
              it is the first thing anyone should read, at 02:00 included. */}
          <div className="mt-8 rounded-card bg-gradient-brand px-6 py-7 shadow-lift">
            <p className="font-brand text-title font-normal leading-loose text-content-on-brand">
              {t('app.verse')}
            </p>
            <span
              aria-hidden="true"
              className="mx-auto mt-4 block h-px w-16 bg-content-on-brand/40"
            />
            <p className="mt-3 text-caption tracking-wide text-content-on-brand/85">
              {t('app.verseRef')}
            </p>
          </div>
        </header>

        <form
          onSubmit={onSubmit}
          className="card card-pad mt-8"
          data-testid="login-form"
          noValidate
        >
          <h2 className="text-heading text-content-primary">{t('auth.title')}</h2>
          <p className="muted mt-1">{t('auth.subtitle')}</p>

          <label className="mt-5 block">
            <span className="label">{t('auth.email')}</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              dir="ltr"
              className="input text-start"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>

          <label className="mt-3 block">
            <span className="label">{t('auth.password')}</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              dir="ltr"
              className="input text-start"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>

          {/* `role="alert"` and not just red text: the one thing a screen
              reader must announce on this screen is why the door did not open. */}
          {error && (
            <p
              role="alert"
              data-testid="login-error"
              className="mt-4 rounded-field bg-status-danger/10 px-3 py-2 text-caption text-status-danger-ink"
            >
              {t(error)}
            </p>
          )}

          <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
            {busy ? t('auth.submitting') : t('auth.submit')}
          </button>

          <p className="mt-4 text-center text-micro text-content-muted/80">
            {t('auth.noSignup')}
          </p>
        </form>
      </div>
    </div>
  )
}

/**
 * The frame or two while Supabase answers "is there a stored session?".
 *
 * Deliberately not a spinner: on a warm reload it is gone before it is seen,
 * and a spinner that flashes for 40 ms reads as a glitch. It is the plate the
 * login screen is about to draw anyway, so the transition is a fill, not a
 * flicker.
 */
export function AuthSplash() {
  const { t } = useTranslation()
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-surface-base"
      data-testid="auth-splash"
    >
      <p className="flex items-center gap-3 text-caption text-content-muted">
        <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-accent text-content-on-accent">
          <Icon name="shield" size={20} />
        </span>
        {t('auth.checking')}
      </p>
    </div>
  )
}
