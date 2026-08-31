import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { EMPTY_BACKEND } from '@core/demo'
import { getSession } from '@core/index'
import { installBackend } from '@core/store'

import { SUPABASE_CONFIGURED } from './data/config'
import './index.css'
import App from './ui/App'
import { DEFAULT_LANGUAGE, applyLanguage } from './ui/i18n'
import { registerServiceWorker } from './ui/offline'
import { applyDisplayMode } from './ui/standalone'
import { initTheme } from './ui/theme'

/**
 * P2.6b — WHICH STORE THIS BUILD RUNS ON, DECIDED BEFORE ANYTHING RENDERS.
 *
 * Demo mode falls through and keeps `@core/store`'s default, which is the mock
 * fixtures — that is /poc, `bun run dev`, and every browser gate, unchanged.
 *
 * A real build empties the store SYNCHRONOUSLY and only then asks for the data
 * layer. The two steps are not one because `src/data/store` reaches the
 * Supabase client chunk, which a demo build must never fetch; and they are in
 * this order because the alternative is a real app that shows twelve fixture
 * farms for as long as that chunk takes to arrive.
 */
if (SUPABASE_CONFIGURED) {
  installBackend(EMPTY_BACKEND)
  void import('./data/store').then((m) => {
    m.installSupabaseStore()
  })
}

/**
 * PO POINT 5 (2026-08-31) — A HANDLE FOR `bun run empty`, DEMO BUILDS ONLY.
 *
 * ★ IT EXISTS BECAUSE A DYNAMIC `import()` FROM A GATE IS NOT THE SAME MODULE
 *   INSTANCE. The first version of A81 imported `/src/core/store.ts` from the
 *   page and emptied it — successfully, and to no effect: `_raw().farms` went
 *   14 → 0 in the instance the gate held while the app went on rendering
 *   fourteen farms from its own. Vite serves the app's graph with its own
 *   module records, and two records mean two module-scope `data` variables.
 *   Emptying the wrong one is the kind of green run that is worse than a red
 *   one.
 *
 * ★ SO THE APP PUBLISHES THE ACTION, the same way `MapCanvas` publishes
 *   `__loYanumMap` for the touch and splitter gates. It is one line, it is the
 *   project's existing idiom for exactly this problem, and `SUPABASE_CONFIGURED`
 *   keeps it out of a real build entirely — there is nothing to empty there
 *   anyway, because P2.6b already seeds a real build EMPTY.
 */
if (!SUPABASE_CONFIGURED) {
  ;(
    window as unknown as { __loYanumEmptyStore?: () => void }
  ).__loYanumEmptyStore = () => installBackend(EMPTY_BACKEND)
}

applyLanguage(DEFAULT_LANGUAGE)
// Stamp the theme before React mounts, or the app flashes the wrong palette.
initTheme(getSession().role)
// P3.4 — and the display mode with it, for the same reason: the status-bar
// treatment is a `[data-standalone]` rule, so the attribute has to be on
// `<html>` before the first paint or the installed app flashes a shell with a
// 47 px hole in it.
applyDisplayMode()

const container = document.getElementById('root')
if (!container) throw new Error('Root container #root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// P2.5a — after the render call, not before: registration waits for `load`
// anyway, and putting it last keeps the first paint the first thing that
// happens. A no-op in dev, which is what keeps the browser gates honest.
registerServiceWorker()
