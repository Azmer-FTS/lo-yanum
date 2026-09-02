import { useEffect } from 'react'

/**
 * U7 (2026-09-02) — NO TEXT IS EVER CUT WITHOUT A WAY TO READ IT.
 *
 * The product owner's rule: an ellipsis is allowed, a value nobody can
 * recover is not. Every `.truncate` / `line-clamp-*` element in the app is
 * therefore watched, and the moment one actually overflows it receives its
 * full text as a `title` (the tooltip on a desktop; on iPadOS a long press
 * shows it, and the layout gate reads it as the recourse). Elements that
 * already carry a `title`, or sit under one, are left alone. When the
 * overflow goes away — the seam is dragged wider — the automatic title goes
 * with it, so a tooltip never repeats what is already visible.
 *
 * ★ ONE OBSERVER AT THE ROOT rather than a prop on forty components: a new
 *   screen cannot forget it. The scan is cheap (a few hundred elements,
 *   `scrollWidth` reads only) and coalesced to one animation frame per
 *   burst of mutations. The seam drag sets an inline style on the shell,
 *   which is an attribute mutation, which is what re-runs it.
 */
const SELECTOR = '.truncate, [class*="line-clamp-"]'

/** A handle for the verification scripts: how many scans ran, and a way to force one. */
const debug = { scans: 0, titled: 0, run: () => scan() }
;(window as unknown as { __loYanumTruncation?: typeof debug }).__loYanumTruncation = debug

function scan(): void {
  debug.scans++
  for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
    // `getAttribute`, not `className`: on an SVG element the latter is an object.
    const clampV = (el.getAttribute('class') ?? '').includes('line-clamp-')
    const overflows = clampV
      ? el.scrollHeight > el.clientHeight + 1
      : el.scrollWidth > el.clientWidth + 1
    const auto = el.hasAttribute('data-auto-title')
    if (overflows) {
      if (el.hasAttribute('title') && !auto) continue
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (el.getAttribute('title') !== text) el.setAttribute('title', text)
      el.setAttribute('data-auto-title', '')
      el.setAttribute('data-truncated', '')
      debug.titled++
    } else if (auto) {
      el.removeAttribute('title')
      el.removeAttribute('data-auto-title')
      el.removeAttribute('data-truncated')
    } else if (el.hasAttribute('data-truncated')) {
      el.removeAttribute('data-truncated')
    }
  }
}

export function useTruncationTitles(): void {
  useEffect(() => {
    // A short timer rather than requestAnimationFrame: a background tab —
    // the installed app switched away from, the dev pane hidden — never
    // fires a frame, and a title that arrives only once the tab is looked
    // at is a title that is not there when the seam is dragged.
    let frame = 0
    const schedule = () => {
      if (frame) return
      frame = window.setTimeout(() => {
        frame = 0
        scan()
      }, 40)
    }
    schedule()
    const observer = new MutationObserver((records) => {
      // Our own attribute writes must not re-trigger the scan forever.
      if (
        records.every(
          (r) =>
            r.type === 'attributes' &&
            (r.attributeName === 'title' ||
              r.attributeName === 'data-auto-title' ||
              r.attributeName === 'data-truncated'),
        )
      ) {
        return
      }
      schedule()
    })
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    window.addEventListener('resize', schedule)
    document.fonts?.addEventListener?.('loadingdone', schedule)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      document.fonts?.removeEventListener?.('loadingdone', schedule)
      if (frame) window.clearTimeout(frame)
    }
  }, [])
}
