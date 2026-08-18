import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  AA_NON_TEXT,
  AA_TEXT,
  compositeOver,
  contrastRatio,
  parseChannels,
} from '@core/index'
import type { FarmStatus, IncidentSeverity, MissionStatus, Rgb } from '@core/index'
import { FARM_PIPELINE } from '@core/index'

import { Icon } from '../components/Icon'
import { ThemeToggle } from '../components/ThemeToggle'
import {
  ConfirmationChip,
  FarmStatusChip,
  FarmStatusDot,
  MissionStatusChip,
  PhoneTypeChip,
  SeverityChip,
  VolunteerStatusChip,
} from '../components/badges'
import { Callout, EmptyState, Stat } from '../components/primitives'
import { useTheme } from '../theme'

/**
 * D1 — the token demonstration page, at the hidden route /styleguide.
 *
 * Its job is validation, not decoration: every swatch prints the WCAG ratios
 * the token actually achieves, computed with @core/contrast — the SAME module
 * `bun run contrast` uses. If this page says 5.56, the build gate says 5.56.
 * A styleguide that shows colours without showing what they measure is how a
 * palette silently rots.
 *
 * Not linked from any navigation. It is a reviewer's URL, and it is deliberately
 * outside the role layouts so it renders in isolation.
 */

// --- Token reading ---------------------------------------------------------

const SURFACE_TOKENS = [
  'surface-sunken',
  'surface-base',
  'surface-raised',
  'surface-overlay',
  'surface-high',
]
const TEXT_TOKENS = ['text-primary', 'text-secondary', 'text-muted', 'text-on-accent']
const ACCENT_TOKENS = ['accent', 'accent-strong', 'accent-dim', 'accent-ink']
const STATUS_HUES = [
  'status-success',
  'status-warn',
  'status-danger',
  'status-info',
  'status-violet',
]
const FARM_HUES = [
  'farm-to-contact',
  'farm-contacted',
  'farm-visited',
  'farm-verbal-ok',
  'farm-signed',
  'farm-active',
  'farm-declined',
]

const ALL_TOKENS = [
  ...SURFACE_TOKENS,
  ...TEXT_TOKENS,
  ...ACCENT_TOKENS,
  ...STATUS_HUES,
  ...STATUS_HUES.map((n) => `${n}-ink`),
  ...FARM_HUES,
  ...FARM_HUES.map((n) => `${n}-ink`),
]

export type Palette = Record<string, Rgb>

const BLACK: Rgb = [0, 0, 0]

/**
 * Snapshot the whole palette AFTER paint, and re-snapshot whenever the resolved
 * theme changes.
 *
 * Reading `getComputedStyle` during render does not work here: `data-theme` is
 * stamped on the document by an EFFECT, so the first render sees the light
 * values even when dark is stored — and since nothing else re-renders, the
 * swatches then stay light on a dark page. Holding the palette in state makes
 * the theme change the trigger rather than a race.
 *
 * The `requestAnimationFrame` is the other half of that, and it is not
 * optional. React flushes effects CHILD-FIRST, so on a live theme switch this
 * hook runs BEFORE the provider higher up the tree has restamped `data-theme` —
 * the read lands one theme behind and the whole page prints the wrong hexes
 * next to the right colours. Deferring to the next frame puts the read after
 * the attribute is on the element and after style recalculation. It only shows
 * up when the theme is switched IN the page (a reload happens to win the race),
 * which is exactly what a reviewer does on this screen.
 */
function usePalette(resolved: string): Palette {
  const [palette, setPalette] = useState<Palette>({})

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = getComputedStyle(document.documentElement)
      const next: Palette = {}
      for (const name of ALL_TOKENS) {
        next[name] = parseChannels(root.getPropertyValue(`--${name}`)) ?? BLACK
      }
      setPalette(next)
    })
    return () => cancelAnimationFrame(frame)
  }, [resolved])

  return palette
}

const hex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('').toUpperCase()}`

const css = ([r, g, b]: Rgb): string => `rgb(${r}, ${g}, ${b})`

function Ratio({ value, min }: { value: number; min: number }) {
  const pass = value >= min
  return (
    <span
      className={`chip ${
        pass
          ? 'bg-status-success/15 text-status-success-ink'
          : 'bg-status-danger/15 text-status-danger-ink'
      }`}
    >
      <span className="ltr-nums">
        {value.toFixed(2)} / {min}
      </span>
      <Icon name={pass ? 'check' : 'close'} size={11} />
    </span>
  )
}

// --- Swatches --------------------------------------------------------------

function SurfaceSwatch({ name, palette }: { name: string; palette: Palette }) {
  const rgb = palette[name] ?? BLACK
  return (
    <div className="overflow-hidden rounded-field shadow-card">
      <div className="h-14 w-full" style={{ backgroundColor: css(rgb) }} />
      <div className="bg-surface-raised px-2.5 py-2">
        <p className="truncate text-micro font-semibold text-content-primary">
          {name}
        </p>
        <p className="ltr-nums text-micro text-content-muted">{hex(rgb)}</p>
      </div>
    </div>
  )
}

/**
 * A vivid/ink PAIR, with the three measurements that define whether the pair is
 * usable: ink legible on the chip, vivid perceivable as a dot, near-black
 * legible on the vivid used as a solid fill.
 */
function HueSwatch({
  name,
  label,
  palette,
}: {
  name: string
  label: string
  palette: Palette
}) {
  const { t } = useTranslation()
  const vivid = palette[name] ?? BLACK
  const ink = palette[`${name}-ink`] ?? BLACK
  const raised = palette['surface-raised'] ?? BLACK
  const base = palette['surface-base'] ?? BLACK
  const onAccent = palette['text-on-accent'] ?? BLACK

  const chipBg = compositeOver(vivid, raised, 0.15)

  return (
    <div className="card overflow-hidden">
      <div className="flex h-16 items-end justify-between gap-2 p-2.5"
           style={{ backgroundColor: css(vivid) }}>
        <span
          className="ltr-nums rounded-pill px-2 py-0.5 text-micro font-bold"
          style={{ color: css(onAccent) }}
        >
          {hex(vivid)}
        </span>
        <span
          className="numeric flex h-7 w-7 items-center justify-center rounded-pill text-micro font-bold"
          style={{ color: css(onAccent) }}
        >
          7
        </span>
      </div>

      <div className="p-2.5">
        <p className="truncate text-caption font-semibold text-content-primary">
          {label}
        </p>
        <p className="ltr-nums text-micro text-content-muted">{name}</p>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className="chip"
            style={{ backgroundColor: css(chipBg), color: css(ink) }}
          >
            {t('styleguide.sampleChip')}
          </span>
          <span
            className="inline-block h-2.5 w-2.5 rounded-pill"
            style={{ backgroundColor: css(vivid) }}
          />
        </div>

        <dl className="mt-2 flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-micro text-content-muted">
              {t('styleguide.inkOnChip')}
            </dt>
            <dd>
              <Ratio value={contrastRatio(ink, chipBg)} min={AA_TEXT} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-micro text-content-muted">
              {t('styleguide.dotOnPage')}
            </dt>
            <dd>
              <Ratio value={contrastRatio(vivid, base)} min={AA_NON_TEXT} />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-micro text-content-muted">
              {t('styleguide.textOnSolid')}
            </dt>
            <dd>
              <Ratio value={contrastRatio(onAccent, vivid)} min={AA_TEXT} />
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function TextSwatch({ name, palette }: { name: string; palette: Palette }) {
  const fg = palette[name] ?? BLACK
  const raised = palette['surface-raised'] ?? BLACK
  return (
    <div className="flex items-center justify-between gap-3 border-b border-edge-subtle/60 py-2 last:border-0">
      <span className="text-caption font-medium" style={{ color: css(fg) }}>
        {name}
      </span>
      <span className="flex items-center gap-2">
        <span className="ltr-nums text-micro text-content-muted">{hex(fg)}</span>
        <Ratio value={contrastRatio(fg, raised)} min={AA_TEXT} />
      </span>
    </div>
  )
}

// --- Page ------------------------------------------------------------------

function Block({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <h2 className="text-section text-content-primary">{title}</h2>
      {hint && <p className="muted mb-3 mt-0.5">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

/** Human name per semantic hue — the token name alone means nothing to a reviewer. */
const HUE_LABEL: Record<string, string> = {
  'status-success': 'styleguide.hueSuccess',
  'status-warn': 'styleguide.hueWarn',
  'status-danger': 'styleguide.hueDanger',
  'status-info': 'styleguide.hueInfo',
  'status-violet': 'styleguide.hueViolet',
}

const SEVERITIES: IncidentSeverity[] = ['observation', 'suspicious', 'urgent']
const MISSION_STATUSES: MissionStatus[] = [
  'planned',
  'in_progress',
  'completed',
  'return_not_confirmed',
]
const ALL_FARM_STATUSES: FarmStatus[] = [...FARM_PIPELINE, 'declined']

export function StyleguideScreen() {
  const { t } = useTranslation()
  // Reading `resolved` is what re-runs every getComputedStyle above when the
  // reviewer flips the theme — without it the swatches would keep the palette
  // they were first mounted with.
  const { resolved } = useTheme()
  const palette = usePalette(resolved)

  return (
    <div className="min-h-dvh bg-surface-base px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="card-hero card-pad mb-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-micro font-semibold uppercase tracking-widest text-accent-ink">
                {t('app.name')}
              </p>
              <h1 className="mt-1 text-title text-content-primary">
                {t('styleguide.title')}
              </h1>
              <p className="muted mt-1 max-w-xl">{t('styleguide.subtitle')}</p>
              <p className="ltr-nums mt-2 text-micro text-content-muted">
                {t('styleguide.activeTheme')}: {t(`theme.${resolved}`)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <ThemeToggle />
              <Link
                to="/coordinator"
                className="text-micro font-medium text-accent-ink hover:underline"
              >
                {t('nav.dashboard')}
              </Link>
            </div>
          </div>
        </header>

        <Block title={t('styleguide.surfaces')} hint={t('styleguide.surfacesHint')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SURFACE_TOKENS.map((n) => (
              <SurfaceSwatch key={n} name={n} palette={palette} />
            ))}
          </div>
        </Block>

        <Block title={t('styleguide.text')} hint={t('styleguide.textHint')}>
          <div className="card card-pad">
            {['text-primary', 'text-secondary', 'text-muted', 'accent-ink'].map(
              (n) => (
                <TextSwatch key={n} name={n} palette={palette} />
              ),
            )}
          </div>
        </Block>

        <Block title={t('styleguide.accent')} hint={t('styleguide.accentHint')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ACCENT_TOKENS.map((n) => (
              <SurfaceSwatch key={n} name={n} palette={palette} />
            ))}
          </div>
          <div className="mt-3 h-16 rounded-card bg-gradient-accent shadow-accent" />
          <p className="muted mt-1.5">{t('styleguide.gradientHint')}</p>
        </Block>

        {/* F4 — the charter orange, and the closed list of places it is
            allowed to appear. Documented HERE rather than only in a comment
            because the whole point of the role is that a reviewer can check it:
            `bun run tokens` enforces the list, this shows what it buys. */}
        <Block title={t('styleguide.critical')} hint={t('styleguide.criticalHint')}>
          <div className="card card-pad flex flex-wrap items-center gap-3">
            <button type="button" className="btn-critical">
              <Icon name="check" size={15} />
              {t('wizard.finish')}
            </button>
            <span className="chip-critical">
              <Icon name="alert" size={12} />
              {t('severity.urgent')}
            </span>
            <span className="chip-critical">{t('missionStatus.return_not_confirmed')}</span>
            <span className="chip-critical">{t('confirm.mismatch')}</span>
          </div>
          <div className="card-critical mt-3 p-4">
            <p className="text-caption font-semibold text-content-primary">
              {t('alerts.urgent_incident')}
            </p>
            <p className="muted mt-1">{t('styleguide.criticalCard')}</p>
          </div>
        </Block>

        <Block title={t('styleguide.status')} hint={t('styleguide.statusHint')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {STATUS_HUES.map((n) => (
              <HueSwatch key={n} name={n} label={t(HUE_LABEL[n])} palette={palette} />
            ))}
          </div>
        </Block>

        <Block title={t('styleguide.pipeline')} hint={t('styleguide.pipelineHint')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ALL_FARM_STATUSES.map((s) => (
              <HueSwatch
                key={s}
                name={`farm-${s.replace(/_/g, '-')}`}
                label={t(`farmStatus.${s}`)}
                palette={palette}
              />
            ))}
          </div>
        </Block>

        <Block title={t('styleguide.typography')}>
          <div className="card card-pad flex flex-col gap-3">
            <p className="text-display text-content-primary">
              {t('styleguide.sampleDisplay')}
            </p>
            <p className="text-title text-content-primary">{t('app.name')}</p>
            <p className="text-section text-content-primary">
              {t('dashboard.alerts')}
            </p>
            <p className="text-heading text-content-primary">
              {t('missions.title')}
            </p>
            <p className="text-body text-content-secondary">{t('app.tagline')}</p>
            <p className="text-caption text-content-secondary">
              {t('styleguide.sampleCaption')}
            </p>
            <p className="text-micro text-content-muted">
              {t('styleguide.sampleMicro')}
            </p>
            <p className="numeric text-metric text-content-primary">128</p>
          </div>
        </Block>

        <Block title={t('styleguide.cards')} hint={t('styleguide.cardsHint')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card card-pad">
              <p className="text-caption font-semibold text-content-primary">
                .card
              </p>
              <p className="muted mt-1">{t('styleguide.cardBase')}</p>
            </div>
            <div className="card-interactive card-pad">
              <p className="text-caption font-semibold text-content-primary">
                .card-interactive
              </p>
              <p className="muted mt-1">{t('styleguide.cardHover')}</p>
            </div>
            <div className="card-hero card-pad">
              <p className="text-caption font-semibold text-content-primary">
                .card-hero
              </p>
              <p className="muted mt-1">{t('styleguide.cardHero')}</p>
            </div>
          </div>
        </Block>

        <Block title={t('styleguide.kpi')}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('dashboard.activeFarms')} value={4} icon="farm" tone="good" />
            <Stat label={t('dashboard.tonightGuards')} value={2} icon="shield" />
            <Stat label={t('volunteers.title')} value={258} icon="users" />
            <Stat
              label={t('dashboard.openIncidents')}
              value={3}
              icon="alert"
              tone="alert"
            />
          </div>
        </Block>

        {/* G17 — the shape IS the hierarchy: major = rectangle, secondary =
            pill, call = icon. `bun run tokens` greps the class definitions. */}
        <Block title={t('styleguide.buttons')} hint={t('styleguide.buttonsHint')}>
          <div className="card card-pad flex flex-wrap items-center gap-2">
            <button type="button" className="btn-primary">
              <Icon name="plus" size={15} />
              {t('missions.create')}
            </button>
            <button type="button" className="btn-secondary">
              {t('common.edit')}
            </button>
            <button type="button" className="btn-ghost">
              {t('common.cancel')}
            </button>
            <button type="button" className="btn-danger">
              {t('common.remove')}
            </button>
            <button type="button" className="btn-primary" disabled>
              {t('common.save')}
            </button>
            <span className="filter-pill">
              {t('common.all')}
              <span className="filter-count">12</span>
            </span>
            <span className="filter-pill filter-pill-active">
              {t('farmStatus.active')}
              <span className="filter-count">4</span>
            </span>
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-field bg-accent text-content-on-accent"
            >
              <Icon name="phone" size={18} />
            </span>
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-field border border-edge-strong text-status-success-ink"
            >
              <Icon name="whatsapp" size={18} />
            </span>
          </div>
        </Block>

        {/* G17 — the display-face arbitrage is SETTLED (PO, 2026-08-19, A60):
            Heebo carries the headings; the two other candidates left the
            bundle with the decision. The sample line carries nikkud on
            purpose: the landing verse is the coverage test. */}
        <Block title={t('styleguide.faces')} hint={t('styleguide.facesHint')}>
          <div className="flex flex-col gap-3">
            <div className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption font-semibold text-content-primary">
                  {t('styleguide.faceHeeboName')}
                </p>
                <span className="chip bg-accent/15 text-accent-ink">
                  {t('styleguide.faceChosen')}
                </span>
              </div>
              <p
                className="mt-2 text-content-primary"
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: 'var(--text-title-size)',
                  lineHeight: 1.4,
                }}
              >
                {t('styleguide.faceSample')}
              </p>
              <p className="muted mt-1.5">{t('styleguide.faceHeeboNote')}</p>
            </div>
            <p className="muted">{t('styleguide.faceBody')}</p>
          </div>
        </Block>

        {/* F3 — the three radii and the field style, side by side. A scale is
            only a scale if you can see the steps next to each other. */}
        <Block title={t('styleguide.radius')} hint={t('styleguide.radiusHint')}>
          <div className="card card-pad grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <span className="h-12 rounded-field border border-edge-strong bg-surface-field" />
              <span className="muted">field · 6px</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="h-12 rounded-card bg-surface-high shadow-card" />
              <span className="muted">card · 14px</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="h-12 rounded-pill bg-gradient-accent" />
              <span className="muted">pill</span>
            </div>
          </div>
          <div className="card card-pad mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">{t('form.name')}</span>
              <input className="input" defaultValue={t('app.name')} />
            </label>
            <label className="block">
              <span className="label">{t('form.locality')}</span>
              <select className="input" defaultValue="a">
                <option value="a">{t('common.all')}</option>
              </select>
            </label>
          </div>
        </Block>

        <Block title={t('styleguide.badges')} hint={t('styleguide.badgesHint')}>
          <div className="card card-pad flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              {ALL_FARM_STATUSES.map((s) => (
                <FarmStatusChip key={s} status={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MISSION_STATUSES.map((s) => (
                <MissionStatusChip key={s} status={s} />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SEVERITIES.map((s) => (
                <SeverityChip key={s} severity={s} />
              ))}
              <PhoneTypeChip type="smartphone" />
              <PhoneTypeChip type="kosher" />
              <VolunteerStatusChip status="active" />
              <VolunteerStatusChip status="inactive" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['present', 'absent', 'pending', 'mismatch'] as const).map((s) => (
                <ConfirmationChip key={s} state={s} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {ALL_FARM_STATUSES.map((s) => (
                <FarmStatusDot key={s} status={s} />
              ))}
            </div>
          </div>
        </Block>

        <Block title={t('styleguide.callouts')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Callout tone="danger" title={t('alerts.urgent_incident')}>
              {t('styleguide.sampleCaption')}
            </Callout>
            <Callout tone="warn" title={t('alerts.presence_mismatch')}>
              {t('styleguide.sampleCaption')}
            </Callout>
            <Callout tone="info" title={t('common.details')}>
              {t('styleguide.sampleCaption')}
            </Callout>
            <Callout tone="success" title={t('common.confirmed')}>
              {t('styleguide.sampleCaption')}
            </Callout>
          </div>
        </Block>

        <Block title={t('styleguide.motion')} hint={t('styleguide.motionHint')}>
          <ul className="stagger grid gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <li key={n} className="card card-pad">
                <p className="numeric text-heading text-content-primary">{n}</p>
              </li>
            ))}
          </ul>
        </Block>

        <Block title={t('styleguide.empty')}>
          <EmptyState
            icon="moon"
            title={t('dashboard.noAlerts')}
            hint={t('styleguide.sampleCaption')}
          />
        </Block>
      </div>
    </div>
  )
}
