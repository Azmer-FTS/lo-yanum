import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * WCAG contrast audit over the design tokens (A13).
 *
 * Parses src/styles/tokens.css, reconstructs BOTH palettes, and checks every
 * foreground/background pair the UI actually renders — including tinted chips,
 * whose real background is the surface composited with an alpha wash of the
 * status colour, not the raw surface.
 *
 * Exits non-zero if anything fails, so it can gate a build.
 */

const TOKENS = path.resolve('src/styles/tokens.css')

type Rgb = [number, number, number]
type Palette = Record<string, Rgb>

/** Extract `--name: r g b;` declarations from one CSS block. */
function parseBlock(css: string): Palette {
  const out: Palette = {}
  const re = /--([a-z0-9-]+):\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s*;/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) {
    out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
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

const srgbToLinear = (c: number): number => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function luminance([r, g, b]: Rgb): number {
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  )
}

function ratio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** Composite `fg` over `bg` at the given alpha — how a tinted chip really looks. */
function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) =>
    Math.round(fg[i] * alpha + bg[i] * (1 - alpha)),
  ) as Rgb
}

interface Check {
  label: string
  fg: string
  bg: string
  /** Alpha wash of `fg` laid over `bg` before measuring. 0 = plain surface. */
  tint?: number
  /** 4.5 for body text, 3.0 for large text and UI components (WCAG AA). */
  min: number
}

const SURFACES = ['surface-base', 'surface-raised', 'surface-overlay', 'surface-high']
const STATUS = ['status-success', 'status-warn', 'status-danger', 'status-info']
const FARM = [
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
      checks.push({ label: `${fg} on ${bg}`, fg, bg, min: 4.5 })
    }
    // Accent used as foreground (links, active nav, inline emphasis).
    checks.push({ label: `accent-ink on ${bg}`, fg: 'accent-ink', bg, min: 4.5 })
  }

  // Text sitting on a solid accent fill (primary buttons).
  checks.push({
    label: 'text-on-accent on accent',
    fg: 'text-on-accent',
    bg: 'accent',
    min: 4.5,
  })
  checks.push({
    label: 'text-on-accent on accent-strong',
    fg: 'text-on-accent',
    bg: 'accent-strong',
    min: 4.5,
  })
  checks.push({
    label: 'text-on-accent on accent-dim',
    fg: 'text-on-accent',
    bg: 'accent-dim',
    min: 4.5,
  })

  // Chips: coloured text on a 15% wash of the same colour over the card.
  for (const c of [...STATUS, ...FARM]) {
    checks.push({
      label: `${c} chip on surface-raised`,
      fg: c,
      bg: 'surface-raised',
      tint: 0.15,
      min: 4.5,
    })
  }

  // Status colours as non-text UI (map markers, dots, borders) need 3:1.
  for (const c of [...STATUS, ...FARM]) {
    checks.push({
      label: `${c} marker on surface-base`,
      fg: c,
      bg: 'surface-base',
      min: 3,
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

  return checks
}

function run(themeName: string, palette: Palette): number {
  console.log(`\n  ${themeName.toUpperCase()}`)
  console.log(
    `  ${'pair'.padEnd(44)} ${'ratio'.padStart(7)}  ${'min'.padStart(4)}  result`,
  )
  console.log(`  ${'-'.repeat(70)}`)

  let failures = 0
  for (const c of buildChecks(themeName as 'light' | 'dark')) {
    const fg = palette[c.fg]
    const bg = palette[c.bg]
    if (!fg || !bg) {
      console.log(`  ${c.label.padEnd(44)} ${'—'.padStart(7)}        MISSING TOKEN`)
      failures++
      continue
    }
    const realBg = c.tint ? over(fg, bg, c.tint) : bg
    const r = ratio(fg, realBg)
    const pass = r >= c.min
    if (!pass) failures++
    console.log(
      `  ${c.label.padEnd(44)} ${r.toFixed(2).padStart(7)}  ${String(c.min).padStart(4)}  ${
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
