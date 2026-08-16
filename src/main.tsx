import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { getSession } from '@core/index'

import './index.css'
import App from './ui/App'
import { DEFAULT_LANGUAGE, applyLanguage } from './ui/i18n'
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
