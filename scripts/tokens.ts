import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * A28 / A29 — THE TWO RULES LOT 0.9 ADDED, ENFORCED STATICALLY.
 *
 * Both are rules about restraint, and restraint is exactly what a codebase
 * loses quietly: nobody adds a fifth radius or a second orange on purpose, they
 * add one because the component in front of them needed it and the rule lived
 * in a document. So the rules live here instead, and the build fails.
 *
 *   A28  ONE RADIUS SCALE. Three values (field / card / pill), declared once in
 *        tokens.css, exposed by tailwind.config.js as a REPLACEMENT for
 *        Tailwind's own scale. Any other radius class fails to compile — this
 *        script also catches the ones written into raw CSS, which the compiler
 *        cannot.
 *   A28b NO TINTED FIELD. Every input, select and textarea renders `.input`,
 *        whose background is `--surface-field`, and no call site may add a
 *        background of its own.
 *   A29  THE ORANGE IS RARE. `critical` may only appear in the files listed
 *        below, each with the reason it is allowed there. A new file wanting it
 *        has to be added here, deliberately, with a justification — which is the
 *        whole mechanism.
 *   A57  THE NEUTRAL SURFACES (G17). Two halves:
 *        · a card/tile never draws a full contour — no standalone `border`
 *          class next to a card/tile word in a className, and the `.card` /
 *          `.tile` rules in index.css carry no border of their own. Directional
 *          borders (`border-b`, `border-s-4`…) stay legal: those are dividers
 *          and semantic bars, not contours. Dashed stays legal too (the
 *          empty-state affordance).
 *        · the shape IS the button hierarchy: the major variants
 *          (`.btn-primary`, `.btn-danger`, `.btn-critical`) are rectangles at
 *          `rounded-field`; the secondary ones inherit the pill; and
 *          ContactActions renders icon buttons only — a `btn-*` class in that
 *          file means a call action grew back into a CTA.
 *
 * Run: bun run tokens
 */

const SRC = path.resolve('src')

// --- A28: the radius scale --------------------------------------------------

// `t-none` joined with G14d: a table card whose top corners are square where
// it meets the sticky column header above it — still radius 0, not a new step.
const ALLOWED_RADIUS = new Set(['field', 'card', 'pill', 'none', 't-card', 't-none'])

/** Radius CUSTOM PROPERTIES that may exist in tokens.css. */
const ALLOWED_RADIUS_VARS = new Set(['field', 'card', 'pill'])

// --- A29: where the charter orange is allowed to appear ---------------------

const CRITICAL_ALLOWED: Record<string, string> = {
  'styles/tokens.css': 'declares --critical and --shadow-critical',
  'index.css': 'defines .btn-critical / .chip-critical / .card-critical',
  'ui/components/badges.tsx':
    'the דחוף severity badge, return_not_confirmed, driver/group mismatch',
  'ui/components/IncidentReportForm.tsx':
    'the urgent severity choice, the urgent submit, the emergency call button',
  'ui/screens/coordinator/DashboardScreen.tsx':
    'the urgent alert card and the two unaccounted-for alerts, and their markers',
  'ui/screens/coordinator/IncidentsScreen.tsx':
    'urgent incident marker and row bar',
  'ui/screens/coordinator/MissionsScreen.tsx':
    'return_not_confirmed marker, driver/group mismatch chip',
  'ui/screens/coordinator/AgendaScreen.tsx':
    'return_not_confirmed event tone and dot',
  'ui/screens/coordinator/MissionWizardScreen.tsx':
    'the irreversible "create the guard" button',
  'ui/screens/StyleguideScreen.tsx': 'documents the role and its call sites',
}

// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (/\.(tsx?|css)$/.test(entry.name)) out.push(full)
  }
  return out
}

const files = walk(SRC)
const rel = (f: string) => path.relative(SRC, f)

interface Failure {
  rule: string
  file: string
  detail: string
}

const failures: Failure[] = []

// --- A28: radius ------------------------------------------------------------

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')

  // Strip comments so the prose that DESCRIBES the rule is not read as a
  // violation of it. Both comment syntaxes, because .css and .tsx are mixed.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  for (const m of code.matchAll(/\brounded-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) {
    if (!ALLOWED_RADIUS.has(m[1])) {
      failures.push({
        rule: 'A28 radius',
        file: rel(file),
        detail: `rounded-${m[1]}`,
      })
    }
  }

  // A raw `border-radius` in CSS must go through the scale, not a literal.
  for (const m of code.matchAll(/border-radius:\s*([^;]+);/g)) {
    const value = m[1].trim()
    const viaToken = /var\(--radius-(field|card|pill)\)/.test(value)
    // MapLibre's own chrome is restyled with `!important`, still through a token.
    if (!viaToken && value !== 'inherit') {
      failures.push({
        rule: 'A28 radius',
        file: rel(file),
        detail: `border-radius: ${value}`,
      })
    }
  }
}

// The scale itself: exactly three custom properties, no more.
const tokensCss = fs.readFileSync(path.join(SRC, 'styles/tokens.css'), 'utf8')
const declared = [...tokensCss.matchAll(/--radius-([a-z]+):/g)].map((m) => m[1])
for (const name of declared) {
  if (!ALLOWED_RADIUS_VARS.has(name)) {
    failures.push({
      rule: 'A28 radius',
      file: 'styles/tokens.css',
      detail: `--radius-${name} is outside the three-value scale`,
    })
  }
}
for (const name of ALLOWED_RADIUS_VARS) {
  if (!declared.includes(name)) {
    failures.push({
      rule: 'A28 radius',
      file: 'styles/tokens.css',
      detail: `--radius-${name} is missing`,
    })
  }
}

// Tailwind must REPLACE the scale rather than extend it, or `rounded-md` and
// friends silently start compiling again.
const tw = fs.readFileSync(path.resolve('tailwind.config.js'), 'utf8')
const twScale = tw.slice(tw.indexOf('borderRadius'), tw.indexOf('extend:'))
if (!/none:|field:|card:|pill:/.test(twScale) || twScale.includes('extend')) {
  failures.push({
    rule: 'A28 radius',
    file: 'tailwind.config.js',
    detail: 'borderRadius must be declared on `theme`, not `theme.extend`',
  })
}

// --- A28b: no tinted field --------------------------------------------------

/**
 * Any className that renders `.input` must not also set a background.
 *
 * Matching on the WORD `input` inside a class string rather than on the element
 * name: the rule is about the field STYLE, and it is the shared class that
 * carries the surface. `bg-surface-field` is the one background allowed, and it
 * lives in index.css rather than at a call site.
 */
const CLASS_ATTR = /className=(?:"([^"]*)"|\{`([^`]*)`\})/g

for (const file of files.filter((f) => f.endsWith('.tsx'))) {
  const source = fs.readFileSync(file, 'utf8')
  for (const m of source.matchAll(CLASS_ATTR)) {
    const cls = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    const words = cls.split(/\s+/).filter(Boolean)
    if (!words.includes('input')) continue
    const bg = words.find((w) => /^bg-/.test(w))
    if (bg) {
      failures.push({
        rule: 'A28 field tint',
        file: rel(file),
        detail: `\`.input\` call site sets ${bg}`,
      })
    }
  }
}

// `.input` itself must sit on the untinted surface.
const indexCss = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8')
const inputRule = indexCss.slice(
  indexCss.indexOf('.input {'),
  indexCss.indexOf('}', indexCss.indexOf('.input {')),
)
if (!inputRule.includes('bg-surface-field')) {
  failures.push({
    rule: 'A28 field tint',
    file: 'index.css',
    detail: '.input must use bg-surface-field',
  })
}

// --- A57: cards have no contour ---------------------------------------------

/**
 * A className that contains a card/tile word must not ALSO contain the
 * standalone `border` class (the 1px full contour). Directional borders and
 * `border-dashed` pass: a divider, a semantic start-bar and the empty-state
 * dashes are not contours.
 */
const CARD_WORDS = new Set([
  'card',
  'card-interactive',
  'card-hero',
  'card-critical',
  'tile',
  'tile-interactive',
  'rounded-card',
  'rounded-t-card',
])

for (const file of files.filter((f) => f.endsWith('.tsx'))) {
  const source = fs.readFileSync(file, 'utf8')
  for (const m of source.matchAll(CLASS_ATTR)) {
    const cls = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, ' ')
    const words = cls.split(/\s+/).filter(Boolean)
    if (!words.some((w) => CARD_WORDS.has(w))) continue
    if (words.includes('border') && !words.includes('border-dashed')) {
      failures.push({
        rule: 'A57 card contour',
        file: rel(file),
        detail: 'card/tile element draws a full `border` contour',
      })
    }
  }
}

// The component classes themselves must not reintroduce the contour.
{
  const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8')
  for (const sel of ['.card {', '.tile {', '.card-hero {']) {
    const rule = css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel)))
    if (/@apply[^;]*\bborder\b/.test(rule)) {
      failures.push({
        rule: 'A57 card contour',
        file: 'index.css',
        detail: `${sel.replace(' {', '')} applies a border`,
      })
    }
  }
}

// --- A57: the shape is the button hierarchy ---------------------------------

{
  const css = fs.readFileSync(path.join(SRC, 'index.css'), 'utf8')
  const ruleOf = (sel: string) =>
    css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)))

  // Major actions are rectangles.
  for (const sel of ['.btn-primary', '.btn-danger', '.btn-critical']) {
    if (!/\brounded-field\b/.test(ruleOf(sel))) {
      failures.push({
        rule: 'A57 button shape',
        file: 'index.css',
        detail: `${sel} must be rectangular (rounded-field)`,
      })
    }
  }
  // Secondary controls keep the pill (via .btn or their own declaration).
  if (!/\brounded-pill\b/.test(ruleOf('.btn'))) {
    failures.push({
      rule: 'A57 button shape',
      file: 'index.css',
      detail: '.btn must default to the pill',
    })
  }
  for (const sel of ['.btn-secondary', '.btn-ghost']) {
    if (/\brounded-field\b/.test(ruleOf(sel))) {
      failures.push({
        rule: 'A57 button shape',
        file: 'index.css',
        detail: `${sel} is a secondary control — it keeps the pill`,
      })
    }
  }
}

// Call actions are icon buttons, never CTAs: ContactActions may not render a
// `btn-*` class.
{
  const contact = fs.readFileSync(
    path.join(SRC, 'ui/components/ContactActions.tsx'),
    'utf8',
  )
  if (/\bbtn-(primary|secondary|ghost|danger|critical|big)\b/.test(contact)) {
    failures.push({
      rule: 'A57 button shape',
      file: 'ui/components/ContactActions.tsx',
      detail: 'call actions are icon buttons — no btn-* here',
    })
  }
}

// --- A29: the orange stays rare ---------------------------------------------

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8')
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  // `critical` as a colour utility, a component class or the token itself.
  if (!/(?:bg|text|border|border-s|shadow|ring)-critical|--critical|-critical\b/.test(code))
    continue
  const key = rel(file)
  if (!(key in CRITICAL_ALLOWED)) {
    failures.push({
      rule: 'A29 orange',
      file: key,
      detail: 'uses `critical` but is not on the allow-list in scripts/tokens.ts',
    })
  }
}

// The reverse direction: an entry that no longer applies is stale documentation.
for (const key of Object.keys(CRITICAL_ALLOWED)) {
  const full = path.join(SRC, key)
  if (!fs.existsSync(full)) {
    failures.push({
      rule: 'A29 orange',
      file: key,
      detail: 'allow-listed file no longer exists',
    })
    continue
  }
  const code = fs
    .readFileSync(full, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  if (!/critical/.test(code)) {
    failures.push({
      rule: 'A29 orange',
      file: key,
      detail: 'allow-listed but no longer uses `critical` — remove the entry',
    })
  }
}

// ---------------------------------------------------------------------------

console.log(
  'Token discipline — A28 (one radius scale, no tinted field) + A29 (rare orange) + A57 (no card contour, shape hierarchy)',
)
console.log('')
console.log(`  radius scale        ${[...ALLOWED_RADIUS_VARS].join(' / ')}`)
console.log(`  orange call sites   ${Object.keys(CRITICAL_ALLOWED).length} files`)
for (const [file, why] of Object.entries(CRITICAL_ALLOWED)) {
  console.log(`    ${file.padEnd(48)} ${why}`)
}
console.log('')

if (failures.length > 0) {
  for (const f of failures) {
    console.log(`  FAIL  [${f.rule}] ${f.file}: ${f.detail}`)
  }
  console.log('')
  console.log(`  ${failures.length} violation(s).`)
  process.exit(1)
}

console.log('  A28, A29 and A57 hold across src/.')
