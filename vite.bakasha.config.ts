import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AP5 (2026-09-25) — LE BUILD DE LA PAGE PUBLIQUE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ UN BUILD SÉPARÉ ET NON UNE SECONDE ENTRÉE DU BUILD PRINCIPAL, POUR TROIS
 *    RAISONS QUI SONT TOUTES LA MÊME : le lecteur est sur un téléphone.
 *
 *    1. `public/` DE L'APPLICATION FAIT 94 Mo (l'archive cartographique
 *       nationale). Vite recopie `publicDir` en entier dans la sortie ; une
 *       entrée de plus dans le build principal aurait donc soit dupliqué
 *       l'archive, soit obligé à un tri d'exclusion. Ici, `publicDir` est
 *       `bakasha/public` — 550 ko, et rien d'autre.
 *    2. LE CHUNK COMMUN. Rollup répartit un graphe à deux entrées en morceaux
 *       PARTAGÉS : la page publique aurait hérité d'un chunk contenant du code
 *       de l'application qu'elle n'exécute jamais.
 *    3. `index.html` N'EST PAS LE MÊME DOCUMENT. Celui de l'application porte
 *       le manifeste PWA, les icônes d'écran d'accueil et la balise de mode
 *       autonome. Une page publique qui s'installerait sur l'écran d'accueil
 *       d'un agriculteur serait un accident.
 *
 * ⚠️ `base: './'` EST CE QUI PERMET `/lo-yanum/bakasha/`. Le déploiement plie
 *    cette sortie dans `dist/bakasha/` ; des chemins absolus donneraient des
 *    404 sous un sous-chemin de GitHub Pages — le même piège que le build
 *    principal évite de la même façon.
 *
 * ⚠️ ET IL N'Y A PAS DE `version.json` ICI. La page n'a pas de service worker,
 *    donc rien à qui annoncer une version : elle est rechargée à chaque
 *    ouverture, comme une page web ordinaire. Le contrôleur d'AJ0 n'a pas de
 *    raison d'être sur un document qu'on ouvre une fois.
 */
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'bakasha'),
  publicDir: path.resolve(__dirname, 'bakasha/public'),
  base: './',
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@locales': path.resolve(__dirname, 'src/locales'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-bakasha'),
    emptyOutDir: true,
  },
  server: {
    /**
     * ⚠️ 5188 ET NON 5199, ET C'EST UNE COLLISION MESURÉE. `scripts/auth.ts`
     *    tient 5199 pour son serveur « mode réel » (`REAL_PORT`) : un serveur
     *    de développement de cette page laissé ouvert dessus faisait échouer
     *    `bun run auth` sur « login-form introuvable » — une régression
     *    parfaitement fausse, et la troisième fois que ce projet se fait
     *    prendre par un preview oublié sur le port d'une porte.
     */
    port: Number(process.env.BAKASHA_PORT) || 5188,
    host: true,
  },
})
