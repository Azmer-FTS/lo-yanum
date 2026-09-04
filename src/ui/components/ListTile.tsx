import type { ReactNode } from 'react'

import { Avatar } from './Avatar'
import { ChevronForward, Icon } from './Icon'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ Y4 (2026-09-04) — ONE CARD-TILE, FOR ALL FIVE LISTS.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The product owner's report was that the display modes "se comportent
 * différemment selon l'écran", and his rule is one sentence per mode:
 *
 *   mode PARTAGÉ       carte + liste en cartes-vignettes (photo à DROITE)
 *   mode CONTENU PLEIN bascule automatique en TABLEAU dense
 *   mode CARTE PLEINE  carte seule
 *
 * applied to farms, volunteers, drivers, guards and incidents alike. This file
 * is the first of those three: the tile every one of those lists draws in
 * `split`.
 *
 * ★★ AND THE PHOTO IS THE FIRST FLEX CHILD, WHICH IS WHAT PUTS IT ON THE
 *    PHYSICAL RIGHT. This is the fourth time it has been asked for. U8 wrote
 *    it as "the photo takes the tile's whole height, edge to edge, on the
 *    PHYSICAL LEFT (last flex child in this RTL row)" — deliberately, and
 *    backwards for a Hebrew reader, whose eye starts at the right edge. In an
 *    RTL row the FIRST child is the physical right, so the photo is declared
 *    first and nothing needs a direction-specific class. `bun run modes`
 *    measures the photo's centre against the tile's centre rather than reading
 *    a class name, because "photo à droite" is a claim about pixels.
 *
 * ★ THE PHOTO IS ALSO THE SECOND CLICK ZONE — "centre this on the map", with
 *   a pin badge saying so — which is the behaviour U8 gave the farm tile and
 *   which the guards and incidents lists never had. Where a screen has
 *   nothing to centre, `onCentre` is omitted and the photo is inert decoration
 *   inside the tile's own button.
 */
export function ListTile({
  photo,
  name,
  active = false,
  onOpen,
  onCentre,
  centreLabel,
  openLabel,
  hoverProps,
  testId = 'list-tile',
  className = '',
  children,
}: {
  photo: string | null
  /** Used for the initials fallback and as the photo's accessible name. */
  name: string
  active?: boolean
  onOpen: () => void
  /** Omitted where the row has no point on the ground to centre. */
  onCentre?: () => void
  centreLabel?: string
  openLabel?: string
  /** Hover / long-press props for the quick card, when the screen has one. */
  hoverProps?: Record<string, unknown>
  testId?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      data-testid={testId}
      /* Y2 — `list-tile` is a FLOOR now, not a fixed height: a tile with a
         fourth row is as tall as its fourth row. See index.css. */
      className={`tile-interactive list-tile flex ${
        active ? 'bg-accent/10 ring-2 ring-accent/60' : ''
      } ${className}`}
      {...hoverProps}
    >
      {/* ★★ FIRST CHILD = PHYSICAL RIGHT IN RTL. See the note at the top. */}
      {onCentre ? (
        <button
          type="button"
          onClick={onCentre}
          aria-label={centreLabel}
          title={centreLabel}
          data-testid={`${testId}-photo`}
          className="group relative h-auto w-[var(--tile-h)] shrink-0 self-stretch overflow-hidden bg-surface-high"
        >
          <TilePhoto photo={photo} name={name} />
          <span
            className="absolute bottom-1 start-1 flex h-6 w-6 items-center justify-center rounded-pill bg-surface-overlay/90 text-accent-ink shadow-card
                       transition-transform duration-fast group-hover:scale-110 group-active:scale-95"
          >
            <Icon name="pin" size={13} />
          </span>
        </button>
      ) : (
        <span
          data-testid={`${testId}-photo`}
          className="relative w-[var(--tile-h)] shrink-0 self-stretch overflow-hidden bg-surface-high"
        >
          <TilePhoto photo={photo} name={name} />
        </span>
      )}

      <button
        type="button"
        onClick={onOpen}
        title={openLabel}
        data-testid={`${testId}-open`}
        className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2 text-start"
      >
        {children}
      </button>

      <span className="flex shrink-0 items-center pe-1 text-content-muted/60">
        <ChevronForward size={14} />
      </span>
    </div>
  )
}

/**
 * The tile's full-bleed photo, or the initials on the name's colour.
 *
 * ⚠️ THERE IS NO `shape` HERE, AND THE FIRST VERSION TOOK ONE. The app's
 *    standing rule is places-are-squares and people-are-circles, so `ListTile`
 *    was given a `shape` to forward — and it did nothing, because the
 *    full-bleed rules below override the avatar's own radius to the tile's
 *    corner. A prop that cannot change anything is worse than no prop: the
 *    next reader sets it and believes the result. A tile's picture is the
 *    TILE's shape, on all five lists.
 */
function TilePhoto({ photo, name }: { photo: string | null; name: string }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center [&>*]:h-full [&>*]:w-full [&>*]:rounded-none [&>*]:ring-0 [&>span]:text-heading">
      <Avatar photo={photo} name={name} size="lg" shape="square" />
    </span>
  )
}
