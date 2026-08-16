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
        },
        accent: {
          DEFAULT: token('accent'),
          strong: token('accent-strong'),
          dim: token('accent-dim'),
        },
        status: {
          success: token('status-success'),
          warn: token('status-warn'),
          danger: token('status-danger'),
          info: token('status-info'),
        },
        farm: {
          'to-contact': token('farm-to-contact'),
          contacted: token('farm-contacted'),
          visited: token('farm-visited'),
          'verbal-ok': token('farm-verbal-ok'),
          signed: token('farm-signed'),
          active: token('farm-active'),
          declined: token('farm-declined'),
        },
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
        shimmer: {
          '100%': { transform: 'translateX(-100%)' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgb(var(--status-success) / 0.5)' },
          '70%': { boxShadow: '0 0 0 6px rgb(var(--status-success) / 0)' },
          '100%': { boxShadow: '0 0 0 0 rgb(var(--status-success) / 0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in var(--duration-slow) var(--ease-out)',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
      },
    },
  },
  plugins: [],
}
