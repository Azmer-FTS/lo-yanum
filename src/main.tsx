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

applyLanguage(DEFAULT_LANGUAGE)
// Stamp the theme before React mounts, or the app flashes the wrong palette.
initTheme(getSession().role)

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
