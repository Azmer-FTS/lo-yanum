import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './ui/App'
import { DEFAULT_LANGUAGE, applyLanguage } from './ui/i18n'

applyLanguage(DEFAULT_LANGUAGE)

const container = document.getElementById('root')
if (!container) throw new Error('Root container #root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
