import type { ReactNode, SVGProps } from 'react'

/**
 * Inline stroke icons. Kept in one file, no icon package: the set is small and
 * self-hosting it avoids a dependency that would also need bundling for a
 * future Capacitor build.
 *
 * Every icon is mirror-safe or explicitly direction-neutral so the RTL layout
 * needs no per-icon flipping, except `ChevronForward` which follows the
 * writing direction via CSS (`rtl:-scale-x-100`).
 */

export type IconName =
  | 'dashboard'
  | 'farm'
  | 'map'
  | 'route'
  | 'users'
  | 'shield'
  | 'alert'
  | 'phone'
  | 'whatsapp'
  | 'message'
  | 'copy'
  | 'check'
  | 'chevron'
  | 'close'
  | 'menu'
  | 'pin'
  | 'clock'
  | 'water'
  | 'food'
  | 'home'
  | 'car'
  | 'plus'
  | 'search'
  | 'filter'
  | 'document'
  | 'camera'
  | 'switch'
  | 'external'
  | 'moon'

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number }

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  farm: (
    <>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 10v10h14V10" />
      <path d="M9.5 20v-5h5v5" />
    </>
  ),
  map: (
    <>
      <path d="m9 4-6 3v13l6-3 6 3 6-3V4l-6 3z" />
      <path d="M9 4v13M15 7v13" />
    </>
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18h6a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7h6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.6a3.2 3.2 0 0 1 0 6.3M17.5 14.6a5.5 5.5 0 0 1 3 5.4" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3c-2.6 1.6-5 2.3-7 2.4v7.2c0 4.4 2.9 6.8 7 8.4 4.1-1.6 7-4 7-8.4V5.4c-2-.1-4.4-.8-7-2.4z" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4.5 2.8 20h18.4z" />
      <path d="M12 10v4.5M12 17.3v.2" />
    </>
  ),
  phone: (
    <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z" />
  ),
  whatsapp: (
    <>
      <path d="M3.8 20.2 5 16.4A8.2 8.2 0 1 1 8 19.2z" />
      <path d="M9 9c0 3 2.6 5.6 5.6 5.6l1-1.4-2-1-.9 1a5 5 0 0 1-2.3-2.3l1-.9-1-2z" />
    </>
  ),
  message: (
    <>
      <path d="M4 5.5h16v10H8.5L4 19z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 6.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h.5" />
    </>
  ),
  check: <path d="m4.5 12.5 5 5 10-11" />,
  chevron: <path d="m9.5 5.5 7 6.5-7 6.5" />,
  close: <path d="m5.5 5.5 13 13M18.5 5.5l-13 13" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  pin: (
    <>
      <path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.3l3.4 2" />
    </>
  ),
  water: (
    <path d="M12 3.5s6 6.4 6 10.2a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z" />
  ),
  food: (
    <>
      <path d="M4 4v6a2.5 2.5 0 0 0 5 0V4M6.5 12.5V20" />
      <path d="M16.5 4c-1.5 1.2-2 3-2 5s.8 3 2 3.2V20" />
      <path d="M19.5 4v16" />
    </>
  ),
  home: (
    <>
      <path d="m4 10.5 8-6.5 8 6.5" />
      <path d="M6 9.8V20h12V9.8" />
    </>
  ),
  car: (
    <>
      <path d="M4 16v-3.2l1.8-4.3A2 2 0 0 1 7.6 7h8.8a2 2 0 0 1 1.8 1.5L20 12.8V16" />
      <path d="M4 16h16v2.5h-3V16M7 18.5V16H4z" />
      <path d="M5.5 12.5h13" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  filter: <path d="M4 6h16l-6.2 7.2V19l-3.6 2v-7.8z" />,
  document: (
    <>
      <path d="M6 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A.5.5 0 0 1 6 20z" />
      <path d="M13 3.5V9h5" />
      <path d="M9 13.5h6M9 16.5h4" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.4" />
    </>
  ),
  switch: (
    <>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </>
  ),
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
}

export function Icon({ name, size = 20, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  )
}

/** Chevron that always points "forward" in the current writing direction. */
export function ChevronForward({ size = 18 }: { size?: number }) {
  return <Icon name="chevron" size={size} className="rtl:-scale-x-100" />
}
