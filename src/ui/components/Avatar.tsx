import { avatarHue, initialsOf } from '@core/index'

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
  const radius = shape === 'circle' ? 'rounded-pill' : 'rounded-md'
  const ringClass = ring ? 'ring-2 ring-accent/50' : 'ring-1 ring-edge-subtle'
  const base = `${SIZES[size]} ${radius} ${ringClass} shrink-0 overflow-hidden`

  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${base} object-cover`}
      />
    )
  }

  const hue = avatarHue(name)
  return (
    <span
      aria-hidden="true"
      className={`${base} flex items-center justify-center font-semibold text-white`}
      style={{
        backgroundColor: `hsl(${hue} 42% 38%)`,
      }}
    >
      {initialsOf(name)}
    </span>
  )
}
