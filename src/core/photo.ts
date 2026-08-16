/**
 * Photo helpers — PURE. No DOM, no canvas, no File API.
 *
 * Everything here is string and maths only, so /src/core stays portable. The
 * parts that genuinely need the browser — camera capture, reading a File,
 * downscaling through a canvas — live in src/ui/components/PhotoField.tsx.
 *
 * In Lot 0.6 a photo is a data URI held in the mock store. Lot 1 replaces the
 * value with a Supabase Storage object key; nothing else about the shape of the
 * data changes, which is why every model just carries `photo: string | null`.
 */

/** Longest edge, in pixels, that a stored photo is downscaled to. */
export const PHOTO_MAX_EDGE = 512

/** JPEG quality used when re-encoding a downscaled photo. */
export const PHOTO_QUALITY = 0.82

/**
 * Initials fallback. Takes the first letter of the first two words, which works
 * for "אריאל כהן" and for "חוות רתם" alike.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2)
  return words[0][0] + words[1][0]
}

/**
 * Stable colour index for an initials disc, derived from the name so the same
 * person always gets the same colour — across reloads and devices.
 *
 * FNV-1a plus an avalanche finalizer, NOT the classic `h * 31 + c`. That
 * simpler hash maps near-identical strings to near-identical outputs, so
 * sequential ids ("drv-01" … "drv-06") landed within 0.014 of each other: every
 * driver fell on the same side of any threshold, and adjacent volunteers were
 * given indistinguishable avatar colours.
 */
export function avatarHue(seed: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  // Finalizer: scatter the low bits so one-character differences diverge.
  h ^= h >>> 16
  h = Math.imul(h, 0x7feb352d) >>> 0
  h ^= h >>> 15
  h = Math.imul(h, 0x846ca68b) >>> 0
  // `^=` yields a SIGNED 32-bit int in JS, so re-normalise before the modulo or
  // the hue (and every threshold derived from it) can come out negative.
  h = (h ^ (h >>> 16)) >>> 0
  return h % 360
}

/**
 * Deterministic placeholder portrait as an SVG data URI.
 *
 * These stand in for real photographs so the UI can be judged in its mixed
 * state — some people with pictures, some with initials — without shipping
 * stock imagery. They are obviously synthetic on purpose; Lot 1 replaces them
 * with uploads.
 */
export function placeholderPhoto(seed: string, kind: 'person' | 'place'): string {
  const hue = avatarHue(seed)
  const hue2 = (hue + 40) % 360

  const body =
    kind === 'person'
      ? `<circle cx="60" cy="46" r="20" fill="rgba(255,255,255,.82)"/>
         <path d="M20 108c0-22 18-34 40-34s40 12 40 34z" fill="rgba(255,255,255,.82)"/>`
      : `<path d="M8 84l26-28 18 18 20-24 40 38v20H8z" fill="rgba(255,255,255,.78)"/>
         <circle cx="90" cy="34" r="12" fill="rgba(255,255,255,.6)"/>`

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 45% 42%)"/>` +
    `<stop offset="1" stop-color="hsl(${hue2} 50% 26%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="120" height="120" fill="url(#g)"/>${body}</svg>`

  // encodeURIComponent rather than base64: no btoa (that is a Web API), and the
  // result is smaller for SVG anyway.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

/**
 * Deterministic "does this person have a photo?" decision for the fixtures.
 * `share` is the fraction that should have one.
 */
export function seedHasPhoto(id: string, share: number): boolean {
  return avatarHue(`photo:${id}`) / 360 < share
}
