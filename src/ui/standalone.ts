/**
 * P3.4 (PO return 7, 2026-08-31) — "AM I RUNNING AS AN INSTALLED APP?", STAMPED
 * ON `<html>` SO CSS CAN ASK.
 *
 * The installed app and the same app in a browser tab want DIFFERENT chrome at
 * the top of the screen. In a tab, the browser's own toolbar sits above the
 * page: the system clock is nowhere near the content and any treatment of the
 * first 47 px is a stray band. Installed, there is no toolbar — the page runs
 * to the top edge of the display and the clock, the battery and the signal
 * bars are drawn ON the app's own pixels.
 *
 * ★ WHY AN ATTRIBUTE AND NOT `@media (display-mode: standalone)`, WHICH IS THE
 *   OBVIOUS ANSWER. Two reasons, and the second is the one that decided it.
 *
 *   1. iOS home-screen web apps have answered `navigator.standalone` since
 *      long before they answered the media query, and this app's whole reason
 *      for existing is an iPad. Asking both questions costs one `||`.
 *
 *   2. **A MEDIA QUERY CANNOT BE SIMULATED BY A BROWSER GATE.** Playwright can
 *      emulate a viewport, a colour scheme, a locale and a geolocation; it
 *      cannot tell a page it was launched from the home screen. Every claim
 *      about the installed app's top chrome would then be a claim nobody could
 *      check without a physical iPad — which is precisely the class of claim
 *      this project does not make. An attribute is one line to set in a test
 *      and the CSS is the same CSS.
 *
 * It is set once, before the first paint, and never removed: a running app
 * does not change display mode under itself.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS's own flag, which predates the media query and is still what an iPad
  // added to the home screen answers most reliably.
  const iosStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone
  if (iosStandalone === true) return true
  try {
    return window.matchMedia('(display-mode: standalone)').matches
  } catch {
    // A browser with no matchMedia is a browser with no PWA install either.
    return false
  }
}

export function applyDisplayMode(): void {
  if (typeof document === 'undefined') return
  if (isStandalone()) document.documentElement.setAttribute('data-standalone', '')
}
