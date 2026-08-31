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
  | 'mail'
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
  | 'steering'
  | 'plus'
  | 'search'
  | 'filter'
  | 'document'
  | 'camera'
  | 'switch'
  | 'external'
  | 'moon'
  | 'phoneBasic'
  | 'edit'
  | 'trash'
  | 'upload'
  | 'download'
  | 'sort'
  | 'sortAsc'
  | 'sortDesc'
  | 'chevronDown'
  | 'userPlus'
  | 'history'
  | 'eye'
  | 'eyeOff'
  | 'layers'
  | 'expand'
  | 'collapse'
  | 'sparkle'
  | 'sun'
  | 'display'
  | 'camera2'
  | 'image'
  | 'user'
  | 'calendar'
  | 'flag'
  | 'send'
  | 'logout'
  | 'columns'

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
  // P0bis.5a — the email channel. An envelope, deliberately unlike `message`
  // (a speech bubble): the two are different channels on the same screen and
  // must not be told apart by their label alone.
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
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
  /* P0.1 — the SPLIT state of the map-mode switch: two panes, the narrower
     one lined like a list, so the three icons read as three layouts rather
     than as three unrelated actions. */
  columns: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M13.5 4.5v15M16 9.5h3M16 12.5h3M16 15.5h3" />
    </>
  ),
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
  steering: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
      <path d="M3.2 10.5 9 12M14.9 12l5.9-1.5M12 15v6" />
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
  // A feature phone: small screen, keypad. Distinguishes "kosher" handsets.
  phoneBasic: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M9.5 5.5h5v4h-5z" />
      <path d="M10 13h.01M12 13h.01M14 13h.01M10 16h.01M12 16h.01M14 16h.01M10 19h.01M12 19h.01M14 19h.01" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="M15 6l3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 6.5h16M9.5 6.5V4h5v2.5" />
      <path d="M6.5 6.5 7.5 20h9l1-13.5" />
      <path d="M10.5 10v6M13.5 10v6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4M8 7.5 12 3.5l4 4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v12M8 11.5l4 4 4-4" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </>
  ),
  sort: <path d="M8 8.5 11 5l3 3.5M8 15.5 11 19l3-3.5" />,
  sortAsc: <path d="M7 14.5 12 9l5 5.5" />,
  sortDesc: <path d="M7 9.5 12 15l5-5.5" />,
  chevronDown: <path d="M5.5 9.5 12 16l6.5-6.5" />,
  userPlus: (
    <>
      <circle cx="9.5" cy="8" r="3.2" />
      <path d="M3.5 20a6 6 0 0 1 12 0" />
      <path d="M18.5 8v6M15.5 11h6" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 8v4.4l3 1.8" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  /**
   * Lucide's `eye-off`, drawn on the same 24 grid as `eye` so the two swap in
   * place with no jump: the same lid, the same pupil, and the slash that says
   * the state is "hidden". Mirror-safe — the slash reads the same both ways.
   */
  eyeOff: (
    <>
      <path d="M4 5.5 20 18.5" />
      <path d="M9.9 6.1A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 4" />
      <path d="M6.4 8A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.4 9.4 0 0 0 3.6-.7" />
      <path d="M10.3 10.3a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 8.5 4.5L12 12 3.5 7.5z" />
      <path d="m4 12 8 4.2 8-4.2M4 16.3l8 4.2 8-4.2" />
    </>
  ),
  expand: <path d="M9 4H4v5M15 20h5v-5M4 15v5h5M20 9V4h-5" />,
  collapse: <path d="M4 9h5V4M20 15h-5v5M9 20v-5H4M15 4v5h5" />,
  sparkle: (
    <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18.1l-1.8-5.5L4.7 10.8 10.2 9z" />
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </>
  ),
  display: (
    <>
      <rect x="3" y="4" width="18" height="12.5" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
  camera2: (
    <>
      <path d="M4 8.5h3L8.5 6h7L17 8.5h3v10H4z" />
      <circle cx="12" cy="13" r="3.2" />
      <path d="M19 6.5h-2" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4.5 17 4.5-4.5 3.5 3.5 3-2.5 4 4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3.5V6.5M16 3.5V6.5" />
      <path d="M7.5 13h.01M12 13h.01M16.5 13h.01M7.5 16.5h.01M12 16.5h.01" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V3.5" />
      <path d="M5.5 4.5h11l-2 3.5 2 3.5h-11" />
    </>
  ),
  send: (
    <>
      <path d="M20.5 3.5 3.5 10.2l6.9 2.4 2.4 6.9z" />
      <path d="M10.4 12.6 20.5 3.5" />
    </>
  ),
  /**
   * The one DIRECTIONAL icon besides `chevron`: an arrow leaving a door frame.
   * Drawn left-to-right and mirrored at the call site with `rtl:-scale-x-100`,
   * exactly as `ChevronForward` does — in Hebrew "out" is to the left, and an
   * unmirrored arrow would point back into the app it is leaving.
   */
  logout: (
    <>
      <path d="M9.5 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h3.5" />
      <path d="m15 8.5 3.5 3.5-3.5 3.5" />
      <path d="M18.5 12h-9" />
    </>
  ),
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
