import { useEffect, useState } from 'react'

/**
 * PO POINT 1 (2026-08-31) — WHAT THE DEVICE ACTUALLY REPORTS, ON THE DEVICE.
 *
 * ★ THIS EXISTS BECAUSE THE GATE CANNOT SETTLE THE QUESTION AND SAID SO FIRST.
 *   `bun run layout STANDALONE=1` STAMPS `--status-inset` and `--safe-bottom`
 *   with an iPad's real numbers, because Playwright can emulate a viewport and
 *   a colour scheme and will never emulate a notch. That simulation is honest
 *   about being one — and it means every claim this project makes about the
 *   installed app's chrome is a claim about a SIMULATED inset. The product
 *   owner installed the app on a real iPad Pro and got a full band at the top,
 *   no gradient, and the same thing in both themes. Exactly the divergence the
 *   simulation was always going to hide.
 *
 *   So rather than guess across a gap no gate can cross, this panel makes the
 *   iPad answer. He opens הגדרות, expands one row, and reads the four insets,
 *   the tokens derived from them, and the three meta tags that decide them.
 *
 * ★ IT READS `env()` DIRECTLY, NOT THE TOKENS. A probe element carries the
 *   four `env(safe-area-inset-*)` values as PADDING and the computed style is
 *   read back off it. The tokens are what the app consumes and they can be
 *   overridden — by the gate, by a future rule — so a panel that reported the
 *   tokens would faithfully report the simulation and prove nothing. Both are
 *   shown, side by side, and a disagreement between them IS the finding.
 *
 * ⚠️ REMOVABLE IN ONE MOVE, which is the condition it was asked under: delete
 *   this file and the two lines that render it in `SettingsScreen.tsx`.
 *   Nothing else imports it.
 */

interface Reading {
  label: string
  value: string
  /** Latin/technical text, which must not be reordered by the RTL context. */
  ltr?: boolean
}

function readEverything(): Reading[] {
  const doc = document
  const root = doc.documentElement
  const cs = getComputedStyle(root)
  const px = (v: string) => (v.trim() === '' ? '—' : v.trim())

  // ---- the four insets, straight from env(), bypassing the tokens ---------
  const probe = doc.createElement('div')
  probe.style.cssText = [
    'position:fixed',
    'inset:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
    'padding-bottom:env(safe-area-inset-bottom, 0px)',
    'padding-left:env(safe-area-inset-left, 0px)',
  ].join(';')
  doc.body.appendChild(probe)
  const p = getComputedStyle(probe)
  const env = {
    top: p.paddingTop,
    right: p.paddingRight,
    bottom: p.paddingBottom,
    left: p.paddingLeft,
  }
  probe.remove()

  const meta = (name: string) => {
    const els = Array.from(
      doc.querySelectorAll<HTMLMetaElement>(`meta[name="${name}"]`),
    )
    if (els.length === 0) return '— (absent)'
    return els
      .map((el) => {
        const m = el.getAttribute('media')
        return m ? `${el.content} @ ${m}` : el.content
      })
      .join('  ·  ')
  }

  const before = getComputedStyle(doc.body, '::before')

  return [
    { label: 'env(safe-area-inset-top)', value: env.top, ltr: true },
    { label: 'env(safe-area-inset-right)', value: env.right, ltr: true },
    { label: 'env(safe-area-inset-bottom)', value: env.bottom, ltr: true },
    { label: 'env(safe-area-inset-left)', value: env.left, ltr: true },

    { label: '--status-inset', value: px(cs.getPropertyValue('--status-inset')), ltr: true },
    { label: '--safe-bottom', value: px(cs.getPropertyValue('--safe-bottom')), ltr: true },
    { label: '--shell-top', value: px(cs.getPropertyValue('--shell-top')), ltr: true },
    { label: '--shell-foot', value: px(cs.getPropertyValue('--shell-foot')), ltr: true },
    { label: '--shell-bottom', value: px(cs.getPropertyValue('--shell-bottom')), ltr: true },

    {
      label: 'body::before (הדרגתי)',
      value: `${px(before.height)} — ${before.backgroundImage === 'none' ? 'no gradient' : 'gradient'}`,
      ltr: true,
    },

    {
      label: 'navigator.standalone',
      value: String(
        (window.navigator as Navigator & { standalone?: boolean }).standalone ?? '—',
      ),
      ltr: true,
    },
    {
      label: 'display-mode: standalone',
      value: String(window.matchMedia('(display-mode: standalone)').matches),
      ltr: true,
    },
    {
      label: 'html[data-standalone]',
      value: String(root.hasAttribute('data-standalone')),
      ltr: true,
    },
    {
      label: 'html[data-theme]',
      value: root.getAttribute('data-theme') ?? '(system)',
      ltr: true,
    },
    {
      label: 'prefers-color-scheme: dark',
      value: String(window.matchMedia('(prefers-color-scheme: dark)').matches),
      ltr: true,
    },

    { label: 'meta viewport', value: meta('viewport'), ltr: true },
    {
      label: 'meta apple-…-status-bar-style',
      value: meta('apple-mobile-web-app-status-bar-style'),
      ltr: true,
    },
    { label: 'meta theme-color', value: meta('theme-color'), ltr: true },

    {
      label: 'innerWidth × innerHeight',
      value: `${window.innerWidth} × ${window.innerHeight}`,
      ltr: true,
    },
    {
      label: 'screen × dpr',
      value: `${window.screen.width} × ${window.screen.height} @ ${window.devicePixelRatio}`,
      ltr: true,
    },
  ]
}

export function DisplayDiagnostics() {
  const [readings, setReadings] = useState<Reading[]>([])
  const [copied, setCopied] = useState(false)

  // On mount and on every resize / orientation change, because the insets swap
  // between portrait and landscape and the product owner will be turning the
  // iPad over while he reads this.
  useEffect(() => {
    const refresh = () => setReadings(readEverything())
    refresh()
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    return () => {
      window.removeEventListener('resize', refresh)
      window.removeEventListener('orientationchange', refresh)
    }
  }, [])

  const asText = readings.map((r) => `${r.label}: ${r.value}`).join('\n')

  return (
    <details
      data-testid="display-diagnostics"
      className="mt-6 rounded-card bg-surface-raised/40 shadow-card"
    >
      <summary className="cursor-pointer select-none px-4 py-3 text-caption font-medium text-content-secondary">
        אבחון תצוגה (זמני)
      </summary>

      <div className="px-4 pb-4">
        <p className="muted mb-3">
          מה שהמכשיר עצמו מדווח. שורות ה־env הן המקור, שאר השורות נגזרות מהן.
        </p>

        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5">
          {readings.map((r) => (
            <div key={r.label} className="contents">
              <dt
                dir="ltr"
                className="truncate text-micro font-mono text-content-muted"
              >
                {r.label}
              </dt>
              <dd
                dir={r.ltr ? 'ltr' : undefined}
                className="text-micro font-mono text-content-primary"
              >
                {r.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* One tap to send the whole thing back, because reading twenty rows
            off a screenshot of an iPad is how a digit gets misread. */}
        <button
          type="button"
          className="btn-secondary mt-4"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(asText)
              .then(() => setCopied(true))
              .catch(() => setCopied(false))
          }}
        >
          {copied ? 'הועתק' : 'העתקה'}
        </button>
      </div>
    </details>
  )
}
