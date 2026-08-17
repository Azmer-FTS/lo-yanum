/**
 * Tailwind consumes the design tokens from src/styles/tokens.css and adds
 * nothing of its own. Every colour here is `rgb(var(--token) / <alpha-value>)`
 * so opacity modifiers (`bg-surface-raised/60`) keep working.
 *
 * If you need a new colour, add the token — never a hex literal, here or in a
 * component.
 */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: 'var(--font-sans)',
        // Lot 0.8: the Artzenu heading face (Atlas). Applied to the display /
        // title / section / heading steps of the scale in index.css rather than
        // per call-site, because the face is a property of the STEP.
        brand: 'var(--font-brand)',
      },
      colors: {
        surface: {
          sunken: token('surface-sunken'),
          base: token('surface-base'),
          raised: token('surface-raised'),
          overlay: token('surface-overlay'),
          high: token('surface-high'),
        },
        edge: {
          subtle: token('border-subtle'),
          strong: token('border-strong'),
        },
        content: {
          primary: token('text-primary'),
          secondary: token('text-secondary'),
          muted: token('text-muted'),
          'on-accent': token('text-on-accent'),
          // Lot 0.8: the brand plate is a deep forest wash in BOTH themes, so
          // its ink is theme-independent too. Only for `bg-gradient-brand`.
          'on-brand': token('text-on-brand'),
        },
        // The Artzenu charter, verbatim — for the few places that must quote the
        // association's own colours (the brand plate, the mark) rather than the
        // app's semantic roles. Prefer a semantic token everywhere else.
        brand: {
          forest: token('brand-forest'),
          olive: token('brand-olive'),
          teal: token('brand-teal'),
          orange: token('brand-orange'),
        },
        accent: {
          DEFAULT: token('accent'),
          strong: token('accent-strong'),
          dim: token('accent-dim'),
          // `accent` is the FILL; `accent-ink` is the same identity used as
          // foreground text. They diverge sharply in the light theme, where the
          // fill amber is far too light to read as text on paper.
          ink: token('accent-ink'),
        },
        // Lot 0.7: every semantic hue is a PAIR. The bare name is the vivid
        // fill (dot, marker, bar, gradient stop); `-ink` is the same identity
        // as legible TEXT on that colour's own tint. Using the vivid token as
        // chip text is the one mistake this split exists to prevent.
        status: {
          success: token('status-success'),
          'success-ink': token('status-success-ink'),
          warn: token('status-warn'),
          'warn-ink': token('status-warn-ink'),
          danger: token('status-danger'),
          'danger-ink': token('status-danger-ink'),
          info: token('status-info'),
          'info-ink': token('status-info-ink'),
          violet: token('status-violet'),
          'violet-ink': token('status-violet-ink'),
        },
        farm: {
          'to-contact': token('farm-to-contact'),
          'to-contact-ink': token('farm-to-contact-ink'),
          contacted: token('farm-contacted'),
          'contacted-ink': token('farm-contacted-ink'),
          visited: token('farm-visited'),
          'visited-ink': token('farm-visited-ink'),
          'verbal-ok': token('farm-verbal-ok'),
          'verbal-ok-ink': token('farm-verbal-ok-ink'),
          signed: token('farm-signed'),
          'signed-ink': token('farm-signed-ink'),
          active: token('farm-active'),
          'active-ink': token('farm-active-ink'),
          declined: token('farm-declined'),
          'declined-ink': token('farm-declined-ink'),
        },
      },
      backgroundImage: {
        'gradient-accent': 'var(--gradient-accent)',
        'gradient-hero': 'var(--gradient-hero)',
        // The full-brand plate: forest/olive, the site's own hero wash. Used by
        // the landing screen only — it is the one surface that is allowed to be
        // louder than the app.
        'gradient-brand': 'var(--gradient-brand)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        '2xl': 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        lift: 'var(--shadow-lift)',
        accent: 'var(--shadow-accent)',
        glow: 'var(--shadow-glow)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
      },
      transitionDuration: {
        fast: 'var(--duration-fast)',
        base: 'var(--duration-base)',
        slow: 'var(--duration-slow)',
      },
      fontSize: {
        display: [
          'var(--text-display-size)',
          {
            lineHeight: 'var(--text-display-height)',
            letterSpacing: 'var(--text-display-tracking)',
            fontWeight: '600',
          },
        ],
        section: [
          'var(--text-section-size)',
          {
            lineHeight: 'var(--text-section-height)',
            letterSpacing: 'var(--text-section-tracking)',
            fontWeight: '600',
          },
        ],
        title: [
          'var(--text-title-size)',
          {
            lineHeight: 'var(--text-title-height)',
            letterSpacing: 'var(--text-title-tracking)',
            fontWeight: '600',
          },
        ],
        heading: [
          'var(--text-heading-size)',
          { lineHeight: 'var(--text-heading-height)', fontWeight: '600' },
        ],
        body: [
          'var(--text-body-size)',
          { lineHeight: 'var(--text-body-height)' },
        ],
        caption: [
          'var(--text-caption-size)',
          { lineHeight: 'var(--text-caption-height)' },
        ],
        micro: [
          'var(--text-micro-size)',
          { lineHeight: 'var(--text-micro-height)' },
        ],
        // KPI figures. Deliberately outside the body scale: a control room is
        // read at a glance, and the numbers have to be the loudest thing on it.
        metric: [
          'var(--text-metric-size)',
          {
            lineHeight: 'var(--text-metric-height)',
            letterSpacing: 'var(--text-metric-tracking)',
            fontWeight: '700',
          },
        ],
      },
      screens: {
        xs: '390px',
        '3xl': '1700px',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        /** Entry animation for staggered list items — see `.stagger`. */
        rise: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
        /**
         * Halo on a "live" dot. `currentColor` rather than a fixed token so one
         * keyframe serves every status — the dot sets its own colour.
         */
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 currentColor', opacity: '1' },
          '70%': { boxShadow: '0 0 0 5px transparent', opacity: '0.85' },
          '100%': { boxShadow: '0 0 0 0 transparent', opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--duration-slow) var(--ease-out)',
        rise: 'rise var(--duration-slow) var(--ease-out) both',
        'pulse-ring': 'pulse-ring 1.9s var(--ease-out) infinite',
      },
    },
  },
  plugins: [],
}
