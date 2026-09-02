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

/**
 * ORDRE DE NUIT 2026-09-02 (N3) — A PORTRAIT AS A MARKER.
 *
 * `placeholder:<person|place>:<seed>` is what the demo dataset stores instead
 * of a data URI: forty bytes in the row, and the same stylised initials
 * portrait generated on the device that would otherwise have travelled as a
 * kilobyte of SVG in every hydration. Anything else — a data URI, a URL — is
 * returned untouched, so the reader has exactly one call to make.
 */
/**
 * U9 (2026-09-02) — REAL PHOTOGRAPHS BEHIND THE MARKERS, FOR THE DEMO.
 *
 * The product owner asked for realistic pictures rather than generated
 * avatars: the app is not public, the data is fictional and will be purged
 * after the demonstration. The `placeholder:<kind>:<seed>` markers already
 * in the database and in the fixtures are LEFT AS THEY ARE; what changes is
 * how the device resolves them. When a pool of CC0 photographs has been
 * configured (`src/ui/demoPhotos.ts`, from `public/demo-photos/`), a marker
 * maps deterministically — by the same hash as the avatar hue — onto one of
 * them, so the same person always gets the same face on every device and
 * after every reload; with no pool (the gates, a script, an old build) the
 * stylised SVG portrait is drawn as before. The purge removes the rows; the
 * pool is a static asset of the app and needs no cleaning.
 */
/**
 * W1 (2026-09-02, passe finale) — WHO GETS WHICH FACE.
 *
 * The programme mobilises young men from yeshivot: a volunteer or a driver
 * must therefore resolve to a portrait of a YOUNG MAN (18–30), never a woman,
 * never an elderly person. The contact of an entity is a farmer — an adult
 * man of any age. The pool is split accordingly, and the seed says which
 * pool applies: a contact's seed carries `contact` (`contact-01a`,
 * `demo-contact-…`); everything else in the `person` kind is a volunteer or
 * a driver. Women are no longer in any pool.
 */
export type PersonPool = 'young' | 'adult'
let pool: { young: string[]; adult: string[]; place: string[] } = { young: [], adult: [], place: [] }

export function configurePhotoPool(next: {
  /** Young men — volunteers and drivers. */
  young: string[]
  /** Adult men of any age — contacts of entities. */
  adult: string[]
  place: string[]
}): void {
  pool = { young: [...next.young], adult: [...next.adult], place: [...next.place] }
}

export function personPoolFor(seed: string): PersonPool {
  return /contact/i.test(seed) ? 'adult' : 'young'
}

export function photoSource(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('placeholder:')) return value
  const [, kindRaw, ...rest] = value.split(':')
  const kind = kindRaw === 'place' ? 'place' : 'person'
  const seed = rest.join(':') || value
  const urls = kind === 'place' ? pool.place : pool[personPoolFor(seed)]
  if (urls.length > 0) return urls[avatarHue(`pool:${seed}`) % urls.length]
  return placeholderPhoto(seed, kind)
}
