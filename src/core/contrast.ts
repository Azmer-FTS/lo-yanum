/**
 * WCAG contrast maths.
 *
 * PURE TypeScript — no DOM. Shared by two consumers that must never disagree:
 * `scripts/contrast.ts` (the build gate, reading tokens.css off disk) and the
 * /styleguide screen (reading the SAME tokens off `getComputedStyle`). One
 * implementation means the numbers printed on the styleguide are literally the
 * numbers the build gate enforces.
 */

export type Rgb = [number, number, number]

/** Parse a `--token: r g b` channel triplet. Returns null if malformed. */
export function parseChannels(value: string): Rgb | null {
  const parts = value.trim().split(/\s+/)
  if (parts.length < 3) return null
  const rgb = parts.slice(0, 3).map(Number)
  return rgb.some(Number.isNaN) ? null : (rgb as Rgb)
}

const srgbToLinear = (c: number): number => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance([r, g, b]: Rgb): number {
  return (
    0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b)
  )
}

export function contrastRatio(fg: Rgb, bg: Rgb): number {
  const a = luminance(fg)
  const b = luminance(bg)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Composite `fg` over `bg` at `alpha` — how a tinted chip REALLY looks.
 *
 * A chip is `bg-status-x/15 text-status-x-ink`: the measured background is not
 * the card, it is the card with a 15 % wash of the vivid colour laid over it.
 * Measuring against the raw card overstates the ratio.
 */
export function compositeOver(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) =>
    Math.round(fg[i] * alpha + bg[i] * (1 - alpha)),
  ) as Rgb
}

/** WCAG AA thresholds, named so call sites read as intent rather than numbers. */
export const AA_TEXT = 4.5
export const AA_LARGE_TEXT = 3
export const AA_NON_TEXT = 3
