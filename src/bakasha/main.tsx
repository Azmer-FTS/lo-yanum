import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './brand.css'

/**
 * ★★ AP5 — LE MONTAGE DE LA PAGE PUBLIQUE, ET IL TIENT EN DIX LIGNES.
 *
 * ⚠️ RIEN DE CE QUE FAIT `src/main.tsx` N'EST ICI, ET C'EST LA MESURE DE LA
 *    DISTANCE ENTRE LES DEUX PRODUITS : pas de magasin, pas de service worker,
 *    pas de contrôleur de thème, pas de contrôleur de mise à jour, pas de
 *    i18next, pas de session de diagnostic. Une page qu'on ouvre une fois dans
 *    sa vie n'a rien à installer sur le téléphone de qui l'ouvre.
 *
 * ⚠️ PAS DE SERVICE WORKER, SURTOUT. Celui de l'application prend la main sur
 *    son `scope` ; s'il devait un jour couvrir `/lo-yanum/`, il servirait à
 *    cette page-ci des fichiers de l'application. Elle est à `/lo-yanum/bakasha/`
 *    et n'en enregistre aucun — c'est ce qui garantit qu'un agriculteur voit
 *    toujours la dernière version, sans bandeau de mise à jour à comprendre.
 *
 * ★ LE THÈME SUIT L'APPAREIL ET RIEN D'AUTRE. `prefers-color-scheme` dans
 *   `brand.css` ; `data-theme` n'existe que pour qu'une porte de capture
 *   puisse demander l'un ou l'autre sans dépendre du réglage de la machine.
 */
const container = document.getElementById('root')
if (!container) throw new Error('Root container #root not found')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
