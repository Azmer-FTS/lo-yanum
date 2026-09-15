import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import path from 'node:path'

/**
 * ★★ AJ0 (2026-09-15) — L'IDENTITÉ DE CE BUILD, ÉCRITE DEUX FOIS.
 *
 * Dans le bundle (`__BUILD_ID__`, `__BUILD_TIME__`) : c'est la version qui
 * TOURNE. Et à côté de `index.html`, dans `version.json` : c'est la version qui
 * est SERVIE. L'app installée compare les deux à chaque retour en avant-plan
 * (`ui/update.ts`). Mesuré avant ce correctif : `sw.js` est identique d'un
 * déploiement à l'autre, donc aucun service worker n'attend jamais, et une app
 * reprise sans navigation garde l'ancien code indéfiniment — rien ne le lui
 * disait.
 *
 * L'identifiant est le commit (`GITHUB_SHA` au déploiement, `git` en local) ;
 * `LO_YANUM_BUILD_ID` le remplace pour la porte `ajupdate`, qui a besoin de
 * deux builds distincts du même arbre.
 */
function buildId(): string {
  const forced = process.env.LO_YANUM_BUILD_ID
  if (forced) return forced
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'local'
  }
}

const BUILD_ID = buildId()
const BUILD_TIME = new Date().toISOString()

function versionFile(): Plugin {
  return {
    name: 'lo-yanum-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ id: BUILD_ID, builtAt: BUILD_TIME })}\n`,
      })
    },
  }
}

// PWA-ready structure: static manifest + icons live in /public.
// Service worker registration is deliberately deferred to Lot 1 (offline sync).
export default defineConfig({
  plugins: [react(), versionFile()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __BUILD_TIME__: JSON.stringify(BUILD_TIME),
  },
  base: './',
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@locales': path.resolve(__dirname, 'src/locales'),
    },
  },
  server: {
    // Honour PORT so a second dev server can be started alongside the first
    // (agent sessions, side-by-side theme comparison) without editing config.
    port: Number(process.env.PORT) || 5173,
    host: true,
  },
})
