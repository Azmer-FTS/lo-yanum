import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { EMPTY_BACKEND } from '@core/demo'
import {
  buildFarmerLink,
  cancelMission,
  farmerTokenFor,
  getSession,
  getVisibleMissions,
  lastFourOf,
} from '@core/index'
import { _raw, installBackend } from '@core/store'

import { SUPABASE_CONFIGURED } from './data/config'
import './index.css'
import App from './ui/App'
import { DEFAULT_LANGUAGE, applyLanguage } from './ui/i18n'
import { registerServiceWorker } from './ui/offline'
import { installDemoPhotos } from './ui/demoPhotos'
import { applyDisplayMode } from './ui/standalone'
import { openGeoDiagSession } from './ui/geoDiagnostics'
import { photosToPdf } from './ui/documents'
import { loadRegionEdits } from './ui/settings/regionEdits'
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ★★ AG8 — TROIS POIGNÉES DE PLUS, ET LA MÊME RAISON QUE CI-DESSUS.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * La note de PO POINT 5 dit tout : un `import()` dynamique depuis une porte
   * n'est PAS la même instance de module que celle de l'application. Une porte
   * qui fabriquerait elle-même un lien d'agriculteur testerait son propre
   * encodeur et non celui du SMS ; une porte qui annulerait une garde dans sa
   * copie du magasin verrait l'écran continuer d'afficher la garde.
   *
   * ★ `__loYanumFarmerLink` — LE LIEN, FABRIQUÉ PAR L'APPLICATION, avec les
   *   quatre chiffres attendus. La porte n'a donc aucune connaissance du format
   *   du jeton ni de la façon dont le numéro est normalisé : elle reçoit ce que
   *   le coordinateur recevrait.
   *
   * ★ `__loYanumCancelNextGuard` — ANNULER LA PROCHAINE GARDE. A143 doit
   *   vérifier qu'une annulation est SIGNALÉE à l'agriculteur, et il n'y a pas
   *   de garde annulée à venir dans les fixtures (il ne DOIT pas y en avoir :
   *   une fixture qui contiendrait déjà l'état qu'on veut observer ne prouve
   *   pas que le chemin y mène).
   *
   * ★ `__loYanumPhotosToPdf` — LA COMPOSITION, appelée avec des images
   *   fabriquées dans la page. A150 compte les pages du PDF produit, ce qui est
   *   la seule chose qui distingue « trois photos composées » de « la première,
   *   et les deux autres perdues ».
   *
   * ⚠️ LES TROIS SONT DANS CE BLOC `!SUPABASE_CONFIGURED`, donc ABSENTES d'un
   *    build réel. `__loYanumCancelNextGuard` écrit dans le magasin : une
   *    poignée d'annulation exposée sur l'application réelle serait une garde
   *    annulable depuis la console du navigateur.
   */
  ;(
    window as unknown as {
      __loYanumFarmerLink?: () => { link: string; four: string } | null
    }
  ).__loYanumFarmerLink = () => {
    const d = _raw()
    /* La ferme doit avoir un contact AVEC un numéro : sans numéro il n'y a pas
       de question à poser, et la porte testerait une porte ouverte. */
    for (const farm of d.farms) {
      const contact =
        farm.contacts.find((c) => c.isPrimary && lastFourOf(c.phone) !== null) ??
        farm.contacts.find((c) => lastFourOf(c.phone) !== null)
      if (!contact) continue
      const four = lastFourOf(contact.phone)
      if (four === null) continue
      const origin = `${window.location.origin}${window.location.pathname}`
        .replace(/\/index\.html$/, '')
        .replace(/\/+$/, '')
      return { link: buildFarmerLink(origin, farmerTokenFor(farm, contact.id)), four }
    }
    return null
  }
  ;(
    window as unknown as { __loYanumCancelNextGuard?: () => boolean }
  ).__loYanumCancelNextGuard = () => {
    /**
     * ⚠️ LA GARDE ANNULÉE DOIT ÊTRE **CELLE DE LA SESSION COURANTE**, ET LA
     *    PREMIÈRE VERSION PRENAIT LA PROCHAINE DU PROGRAMME. Elle appartenait
     *    à une autre ferme, `getCancelledMissionViews()` la filtrait
     *    correctement, et la porte concluait que l'annulation n'était pas
     *    signalée alors que le produit avait raison. `getVisibleMissions()`
     *    lit à travers la même session que l'écran — c'est la seule façon de
     *    fabriquer un état que cet écran a le droit de voir.
     */
    /* ★ LA MÊME BORNE QUE L'ÉCRAN (`endAt`), pour la même raison : une garde
       en cours annulée est le cas qui compte le plus. */
    const at = Date.now()
    const next = getVisibleMissions()
      .filter((m) => new Date(m.endAt).getTime() > at && m.status !== 'cancelled')
      .sort((a, b) => a.startAt.localeCompare(b.startAt))[0]
    if (!next) return false
    cancelMission(next.id, 'weather', '')
    return true
  }
  ;(
    window as unknown as {
      __loYanumPhotosToPdf?: (files: File[]) => Promise<File>
    }
  ).__loYanumPhotosToPdf = (files) =>
    photosToPdf(files, 'documents.pdf', { title: 'documents', author: 'לא ינום' })
}

// U9 — the demo markers resolve to real CC0 photographs from now on.
installDemoPhotos()
/**
 * ★★ Y2 — THE REGION OUTLINES, BEFORE THE FIRST RENDER.
 *
 * Every derived read — a farm's region, a volunteer's region, the dunam
 * distribution, the washes on the map, the filter counts — goes through
 * `regions()`. Loading the coordinator's redrawn boundaries after the first
 * paint would mean one frame filed under X12's guesses and then a reshuffle,
 * which on the dashboard is a bar chart that changes shape as you look at it.
 */
loadRegionEdits()
applyLanguage(DEFAULT_LANGUAGE)
// Stamp the theme before React mounts, or the app flashes the wrong palette.
initTheme(getSession().role)
// P3.4 — and the display mode with it, for the same reason: the status-bar
// treatment is a `[data-standalone]` rule, so the attribute has to be on
// `<html>` before the first paint or the installed app flashes a shell with a
// 47 px hole in it.
applyDisplayMode()
/**
 * ★★ AG7 — ET UNE LIGNE DE MESURE EST OUVERTE POUR CE LANCEMENT.
 *
 * Ici et pas dans un composant : une ligne par LANCEMENT est la question posée,
 * et un composant en produirait une par montage — donc une par changement de
 * route, ce qui rendrait le décompte inutilisable. Voir `geoDiagnostics.ts`
 * pour ce que les trois colonnes éliminent comme hypothèse. Rien n'est
 * envoyé nulle part ; la lecture se fait dans הגדרות.
 */
void openGeoDiagSession()

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
