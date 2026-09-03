import { useEffect, useState } from 'react'

import { avatarHue, initialsOf, photoSource } from '@core/index'

/**
 * Avatar with a graceful fallback: the photo when there is one, otherwise the
 * person's initials on a colour derived from their name — so a roster of 300
 * still has visual variety and a face-shaped anchor for every row (C5.3).
 */

const SIZES = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-9 w-9 text-micro',
  md: 'h-12 w-12 text-caption',
  lg: 'h-16 w-16 text-heading',
  xl: 'h-24 w-24 text-title',
} as const

export type AvatarSize = keyof typeof SIZES

export function Avatar({
  photo,
  name,
  size = 'sm',
  shape = 'circle',
  ring = false,
}: {
  photo?: string | null
  name: string
  size?: AvatarSize
  /** Places (farms) read better as squares, people as circles. */
  shape?: 'circle' | 'square'
  ring?: boolean
}) {
  const radius = shape === 'circle' ? 'rounded-pill' : 'rounded-field'
  const ringClass = ring ? 'ring-2 ring-accent/50' : 'ring-1 ring-edge-subtle'
  const base = `${SIZES[size]} ${radius} ${ringClass} shrink-0 overflow-hidden`

  const src = photoSource(photo)

  /**
   * ★ X5.3 (2026-09-04) — A MISSING PICTURE IS ALWAYS THE INITIALS DISC,
   *   NEVER A BROKEN `<img>`.
   *
   *   `photoSource` answers "is there a path", which is a different question
   *   from "did the bytes arrive". A path that 404s — a purged demo portrait,
   *   a photo taken on a device that has since been wiped, an import row with
   *   a stale URL — left the browser's own broken-image placeholder in the
   *   row, which on a 28 px avatar renders as a grey dash. That is the "trait
   *   à la place du rond" the product owner reported, and no amount of
   *   styling the `<img>` fixes it: a failed image is not a styling state.
   *
   *   So the failure is CAUGHT and the component falls back to the branch it
   *   already had. The flag is keyed on `src` so a row recycled by the
   *   virtualiser onto a different person tries that person's photo rather
   *   than inheriting the last one's failure.
   */
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`${base} object-cover`}
      />
    )
  }

  const hue = avatarHue(name)
  return (
    <span
      aria-hidden="true"
      data-avatar-fallback=""
      className={`${base} flex items-center justify-center font-semibold text-white`}
      style={{
        backgroundColor: `hsl(${hue} 42% 38%)`,
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
