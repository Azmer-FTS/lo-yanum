import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { getSession } from '@core/index'

import './index.css'
import App from './ui/App'
import { DEFAULT_LANGUAGE, applyLanguage } from './ui/i18n'
import { registerServiceWorker } from './ui/offline'
import { initTheme } from './ui/theme'

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
