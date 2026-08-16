import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  AA_NON_TEXT,
  AA_TEXT,
  compositeOver,
  contrastRatio,
  parseChannels,
} from '../src/core/contrast'
import type { Rgb } from '../src/core/contrast'

/**
 * WCAG contrast audit over the design tokens (A13 / A19).
 *
 * Parses src/styles/tokens.css, reconstructs BOTH palettes, and checks every
 * foreground/background pair the UI actually renders. The maths itself lives in
 * @core/contrast, which the /styleguide screen also imports — so the ratios
 * printed in the browser are the ratios this gate enforces, by construction.
 *
 * Exits non-zero if anything fails, so it can gate a build.
 */

const TOKENS = path.resolve('src/styles/tokens.css')

type Palette = Record<string, Rgb>

/** Extract `--name: r g b;` declarations from one CSS block. */
function parseBlock(css: string): Palette {
  const out: Palette = {}
  const re = /--([a-z0-9-]+):\s*(\d{1,3}\s+\d{1,3}\s+\d{1,3})\s*;/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    const rgb = parseChannels(m[2])
    if (rgb) out[m[1]] = rgb
  }
  return out
}

/**
 * Slice the file into its palette blocks. The light palette lives on the base
 * `:root`; the dark palette overrides it under `[data-theme='dark']` and the
 * system-preference media query, so dark = light merged with its overrides.
 */
function readPalettes(css: string): { light: Palette; dark: Palette } {
  const rootRule = /^:root\s*\{/m.exec(css)
  if (!rootRule) throw new Error('No :root rule in tokens.css')
  const rootStart = rootRule.index
  const rootEnd = css.indexOf('\n}', rootStart)
  const light = parseBlock(css.slice(rootStart, rootEnd))

  // Anchor on the RULE at line start, not the first textual occurrence — the
  // header comment documents the selector too, and matching that instead
  // silently yields "dark === light" with every ratio looking fine.
  const darkRule = /^\[data-theme='dark'\]\s*\{/m.exec(css)
  if (!darkRule) throw new Error("No [data-theme='dark'] rule in tokens.css")
  const darkStart = darkRule.index
  const darkEnd = css.indexOf('\n}', darkStart)
  const darkOverrides = parseBlock(css.slice(darkStart, darkEnd))

  return { light, dark: { ...light, ...darkOverrides } }
}

interface Check {
  label: string
  fg: string
  bg: string
  /**
   * Token whose 15 % wash sits between `fg` and `bg` — how a tinted chip really
   * renders. Lot 0.7 split vivid fills from ink text, so the tint colour and
   * the text colour are now DIFFERENT tokens and the check must say which.
   */
  tintWith?: string
  tintAlpha?: number
  /** 4.5 for body text, 3.0 for large text and UI components (WCAG AA). */
  min: number
}

const SURFACES = [
  'surface-base',
  'surface-raised',
  'surface-overlay',
  'surface-high',
]

/** Every semantic hue, as the vivid/ink pair the components consume. */
const HUES = [
  'status-success',
  'status-warn',
  'status-danger',
  'status-info',
  'status-violet',
  'farm-to-contact',
  'farm-contacted',
  'farm-visited',
  'farm-verbal-ok',
  'farm-signed',
  'farm-active',
  'farm-declined',
]

function buildChecks(theme: 'light' | 'dark'): Check[] {
  const checks: Check[] = []

  // Body text on every surface it can land on.
  for (const bg of SURFACES) {
    for (const fg of ['text-primary', 'text-secondary', 'text-muted']) {
      checks.push({ label: `${fg} on ${bg}`, fg, bg, min: AA_TEXT })
    }
    // Accent used as foreground (links, active nav, inline emphasis).
    checks.push({
      label: `accent-ink on ${bg}`,
      fg: 'accent-ink',
      bg,
      min: AA_TEXT,
    })
  }

  // Text sitting on a solid accent fill (primary buttons, all three states).
  for (const bg of ['accent', 'accent-strong', 'accent-dim']) {
    checks.push({
      label: `text-on-accent on ${bg}`,
      fg: 'text-on-accent',
      bg,
      min: AA_TEXT,
    })
  }

  // Accent as an active-pill label: accent-ink on a 15 % accent wash.
  checks.push({
    label: 'accent-ink on accent chip',
    fg: 'accent-ink',
    bg: 'surface-raised',
    tintWith: 'accent',
    min: AA_TEXT,
  })

  // CHIPS — the vivid/ink pair. Ink text over the vivid colour's own 15 % wash.
  for (const hue of HUES) {
    checks.push({
      label: `${hue} chip (ink on 15% tint)`,
      fg: `${hue}-ink`,
      bg: 'surface-raised',
      tintWith: hue,
      min: AA_TEXT,
    })
  }

  // VIVID as non-text UI (map markers, list dots, severity bars) needs 3:1
  // against the page it sits on.
  for (const hue of HUES) {
    checks.push({
      label: `${hue} dot on surface-base`,
      fg: hue,
      bg: 'surface-base',
      min: AA_NON_TEXT,
    })
  }

  // …and a vivid is also a SOLID FILL that carries near-black text: the route
  // step number inside a map marker, the chosen presence button, a solid pill.
  // Together with the check above this pins each light vivid into a narrow
  // luminance window — dark enough to be seen on the page, light enough to be
  // written on. That window is why the light palette is saturated rather than
  // inky, and dropping this check is how it would silently drift back.
  for (const hue of HUES) {
    checks.push({
      label: `text-on-accent on solid ${hue}`,
      fg: 'text-on-accent',
      bg: hue,
      min: AA_TEXT,
    })
  }

  // Card edges must be perceivable against the page.
  checks.push({
    label: 'border-subtle on surface-base',
    fg: 'border-subtle',
    bg: 'surface-base',
    min: 1.2,
  })
  checks.push({
    label: 'surface-raised vs surface-base (elevation)',
    fg: 'surface-raised',
    bg: 'surface-base',
    // Dark has to carry elevation by luminance alone (drop-shadows are
    // invisible on near-black); light also has shadow and border to lean on.
    min: theme === 'dark' ? 1.25 : 1.05,
  })
  checks.push({
    label: 'surface-high vs surface-raised (hover row)',
    fg: 'surface-high',
    bg: 'surface-raised',
    min: 1.04,
  })

  return checks
}

function run(themeName: string, palette: Palette): number {
  console.log(`\n  ${themeName.toUpperCase()}`)
  console.log(
    `  ${'pair'.padEnd(46)} ${'ratio'.padStart(7)}  ${'min'.padStart(4)}  result`,
  )
  console.log(`  ${'-'.repeat(72)}`)

  let failures = 0
  for (const c of buildChecks(themeName as 'light' | 'dark')) {
    const fg = palette[c.fg]
    const bg = palette[c.bg]
    const tint = c.tintWith ? palette[c.tintWith] : undefined
    if (!fg || !bg || (c.tintWith && !tint)) {
      console.log(
        `  ${c.label.padEnd(46)} ${'—'.padStart(7)}        MISSING TOKEN`,
      )
      failures++
      continue
    }
    const realBg = tint ? compositeOver(tint, bg, c.tintAlpha ?? 0.15) : bg
    const r = contrastRatio(fg, realBg)
    const pass = r >= c.min
    if (!pass) failures++
    console.log(
      `  ${c.label.padEnd(46)} ${r.toFixed(2).padStart(7)}  ${String(c.min).padStart(4)}  ${
        pass ? 'PASS' : 'FAIL'
      }`,
    )
  }
  return failures
}

const css = fs.readFileSync(TOKENS, 'utf8')
const { light, dark } = readPalettes(css)

console.log('WCAG AA contrast audit — src/styles/tokens.css')
const failures = run('light', light) + run('dark', dark)

console.log('')
if (failures > 0) {
  console.log(`  ${failures} FAILING pair(s).`)
  process.exit(1)
}
console.log('  All pairs meet WCAG AA.')
