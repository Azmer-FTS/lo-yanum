import { useSyncExternalStore } from 'react'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ★★ AJ0 (2026-09-15) — LA VERSION INSTALLÉE SE MET À JOUR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Constat du PO : sur l'app de son écran d'accueil, les nouvelles versions
 * n'arrivaient jamais ; Safari, lui, les affichait.
 *
 * ⚠️ L'HYPOTHÈSE ÉTAIT « LE SERVICE WORKER ATTEND LA FERMETURE DES FENÊTRES »,
 *    ET LA MESURE L'A DÉMENTIE (ETAT, passe AJ). `sw.js` fait `skipWaiting()`
 *    depuis P2.5a et son contenu est IDENTIQUE d'un déploiement à l'autre :
 *    `registration.update()` ne trouve rien, aucun worker n'attend jamais.
 *    La nouvelle version n'arrive que par une NAVIGATION — et une app iOS
 *    reprise depuis l'écran d'accueil ne navigue pas : elle ressort de
 *    suspension avec l'ancien code en mémoire, et rien ne lui demandait s'il
 *    en existait un autre. Mesuré dans WebKit et Chromium : cinq secondes après
 *    le retour en avant-plan, la page tourne toujours sur A alors que le
 *    serveur sert B.
 *
 * ★ DONC LA QUESTION EST POSÉE ICI, À CHAQUE RETOUR EN AVANT-PLAN. Le bundle
 *   porte son identité (`__BUILD_ID__`, écrite par `vite.config.ts`) et le
 *   serveur publie la sienne dans `version.json`, lu sans aucun cache. Deux
 *   identifiants différents : une version est prête, et le bandeau le dit
 *   jusqu'à ce qu'on l'applique — il ne disparaît pas tout seul.
 *
 * ★ ET « APPLIQUER » EST VÉRIFIÉ APRÈS COUP, PAS SUPPOSÉ. Avant de recharger,
 *   la cible est écrite dans `localStorage` ; au démarrage suivant, le bundle
 *   qui tourne est comparé à cette cible. Égal : la mise à jour est appliquée
 *   et les réglages l'impriment. Différent : on le DIT, au lieu de laisser
 *   croire qu'un rechargement a suffi.
 */

export interface BuildStamp {
  id: string
  /** ISO 8601, the moment `vite build` ran. */
  builtAt: string
}

/** The code that is RUNNING, as stamped into this bundle. */
export const RUNNING: BuildStamp = {
  id: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev',
  builtAt: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : new Date(0).toISOString(),
}

export type CheckOutcome =
  | { kind: 'current'; remote: BuildStamp }
  | { kind: 'available'; remote: BuildStamp }
  /** Named, never blank: no network is not a server error is not a bad file. */
  | { kind: 'error'; reason: 'offline' | 'network' | 'http' | 'invalid'; status?: number }
  /** The dev server: there is no deployed build to compare against. */
  | { kind: 'unsupported' }

export interface AppliedVerdict {
  from: string
  to: string
  /** true when the bundle running after the reload IS the target. */
  ok: boolean
  at: number
  /** The banner announcing it was closed; the record stays for הגדרות. */
  seen?: boolean
}

export interface UpdateState {
  /** A newer build the server offers, or null. */
  available: BuildStamp | null
  checking: boolean
  applying: boolean
  lastCheck: { at: number; outcome: CheckOutcome } | null
  /** What the last "apply" actually did, read back after its reload. */
  applied: AppliedVerdict | null
  /** The banner was put aside for THIS build until the next return. */
  dismissed: string | null
  /** The service worker as this page sees it, for the settings screen. */
  worker: { supported: boolean; controlled: boolean }
}

const PENDING_KEY = 'lo-yanum:update-pending'
const VERDICT_KEY = 'lo-yanum:update-verdict'

/** A burst of `visibilitychange` + `focus` + `pageshow` is ONE return. */
const THROTTLE_MS = 4000
/** And a page left open in the foreground still asks, now and then. */
const INTERVAL_MS = 15 * 60 * 1000

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode or a full device: the in-memory state still shows */
  }
}

function workerState(): UpdateState['worker'] {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  return { supported, controlled: supported && Boolean(navigator.serviceWorker.controller) }
}

let state: UpdateState = {
  available: null,
  checking: false,
  applying: false,
  lastCheck: null,
  applied: readJson<AppliedVerdict>(VERDICT_KEY),
  dismissed: null,
  worker: workerState(),
}

const listeners = new Set<() => void>()

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateState(): UpdateState {
  return state
}

export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribeUpdate, updateState, updateState)
}

function isStamp(value: unknown): value is BuildStamp {
  const v = value as BuildStamp | null
  return v !== null && typeof v === 'object' && typeof v.id === 'string' && v.id !== '' && typeof v.builtAt === 'string'
}

let inFlight: Promise<CheckOutcome> | null = null
let lastStarted = 0

/**
 * Ask the server which build it serves.
 *
 * ★ `cache: 'no-store'` AND A QUERY STRING, BOTH. GitHub Pages answers
 *   `cache-control: max-age=600` on every file (measured with curl), so a
 *   plain fetch can be handed the previous deploy's answer for ten minutes —
 *   the exact window in which the question matters. The service worker lets
 *   this URL through untouched (it is neither an asset nor a navigation).
 */
export function checkForUpdate(): Promise<CheckOutcome> {
  if (inFlight) return inFlight
  lastStarted = Date.now()
  set({ checking: true, worker: workerState() })

  inFlight = (async (): Promise<CheckOutcome> => {
    if (!import.meta.env.PROD) return { kind: 'unsupported' }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return { kind: 'error', reason: 'offline' }
    }
    // The worker's own update check rides along: a changed `sw.js` installs
    // now rather than on some later navigation. Not awaited — it answers a
    // different question and must not delay this one.
    void navigator.serviceWorker
      ?.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => undefined)

    let response: Response
    try {
      const url = new URL('version.json', document.baseURI)
      url.searchParams.set('t', String(Date.now()))
      response = await fetch(url.href, { cache: 'no-store' })
    } catch {
      return { kind: 'error', reason: 'network' }
    }
    if (!response.ok) return { kind: 'error', reason: 'http', status: response.status }
    let remote: unknown
    try {
      remote = await response.json()
    } catch {
      return { kind: 'error', reason: 'invalid' }
    }
    if (!isStamp(remote)) return { kind: 'error', reason: 'invalid' }
    return remote.id === RUNNING.id
      ? { kind: 'current', remote }
      : { kind: 'available', remote }
  })()

  return inFlight.then((outcome) => {
    inFlight = null
    const patch: Partial<UpdateState> = {
      checking: false,
      lastCheck: { at: Date.now(), outcome },
      worker: workerState(),
    }
    // An error says nothing about what the server holds: keep what we knew.
    if (outcome.kind === 'available') patch.available = outcome.remote
    if (outcome.kind === 'current') patch.available = null
    set(patch)
    return outcome
  })
}

function waitFor(predicate: () => boolean, onChange: (fire: () => void) => () => void, ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (predicate()) {
      resolve()
      return
    }
    let stop = () => {}
    const timer = setTimeout(() => {
      stop()
      resolve()
    }, ms)
    stop = onChange(() => {
      if (!predicate()) return
      clearTimeout(timer)
      stop()
      resolve()
    })
  })
}

/**
 * Bring the incoming worker to `activated`, whatever state it is in.
 *
 * ★ `SKIP_WAITING` IS SENT EVEN THOUGH `sw.js` SKIPS WAITING BY ITSELF. The
 *   button's promise is "apply the new version", and it has to hold for a
 *   worker that is already sitting in `installed` — one shipped by a future
 *   `sw.js` that waits, or one whose install finished while the app was
 *   suspended. Each step is bounded: an update that cannot activate still
 *   reloads, and the verdict after the reload says what happened.
 */
async function activateIncoming(reg: ServiceWorkerRegistration): Promise<void> {
  const worker = reg.installing ?? reg.waiting
  if (!worker) return
  const onState = (fire: () => void) => {
    worker.addEventListener('statechange', fire)
    return () => worker.removeEventListener('statechange', fire)
  }
  await waitFor(() => worker.state !== 'installing', onState, 8000)
  if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' })
  await waitFor(
    () => worker.state === 'activated' || worker.state === 'redundant',
    onState,
    5000,
  )
}

/**
 * The banner's button, and the settings screen's once it found something.
 *
 * Not `location.reload()` alone — that is what the app used to ask the PO to
 * do, and on its own it changes nothing about a worker. The worker is updated
 * and activated FIRST; then the page reloads through it, and `sw.js` fetches
 * that navigation past the HTTP cache.
 */
export async function applyUpdate(): Promise<void> {
  if (state.applying) return
  set({ applying: true })
  const target = state.available?.id ?? null
  writeJson(PENDING_KEY, { from: RUNNING.id, to: target, at: Date.now() })
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) {
      await Promise.race([reg.update(), new Promise((r) => setTimeout(r, 5000))]).catch(
        () => undefined,
      )
      await activateIncoming(reg)
    }
  } catch {
    /* the reload below is still the step that loads the new code */
  }
  window.location.reload()
}

/**
 * A build id or a date inside a Hebrew sentence, isolated (FSI … PDI) so the
 * bidi algorithm cannot reorder it with the words around it — measured on the
 * first capture: "aj-a • 15.09.2026" landed at the wrong end of its line.
 */
export function isolate(value: string): string {
  return `\u2068${value}\u2069`
}

export function dismissUpdate(): void {
  set({ dismissed: state.available?.id ?? null })
}

export function acknowledgeApplied(): void {
  if (!state.applied) return
  const applied = { ...state.applied, seen: true }
  writeJson(VERDICT_KEY, applied)
  set({ applied })
}

/**
 * The manual button in הגדרות: check, and if something is there, apply it.
 * Returns what it found so the screen can say it — "up to date" is a result.
 */
export async function checkAndApply(): Promise<CheckOutcome> {
  const outcome = await checkForUpdate()
  if (outcome.kind === 'available') await applyUpdate()
  return outcome
}

/**
 * Read back what the previous page asked for, now that this bundle runs.
 */
function settlePending(): void {
  const pending = readJson<{ from: string; to: string | null; at: number }>(PENDING_KEY)
  if (!pending) return
  writeJson(PENDING_KEY, null)
  // A stale record (the reload never happened, the app was killed) says nothing.
  if (Date.now() - pending.at > 5 * 60 * 1000) return
  const to = pending.to ?? RUNNING.id
  const verdict: AppliedVerdict = {
    from: pending.from,
    to,
    ok: RUNNING.id === to && RUNNING.id !== pending.from,
    at: Date.now(),
  }
  writeJson(VERDICT_KEY, verdict)
  set({ applied: verdict })
}

let started = false

/**
 * Started ONCE, from `main.tsx` — not from a component, for the reason AI6
 * wrote down for the theme: a listener owned by a screen stops listening when
 * the screen goes away, and the return to the foreground can happen on any.
 */
export function startUpdateWatcher(): void {
  if (started || typeof window === 'undefined') return
  started = true
  settlePending()

  const onReturn = () => {
    if (document.visibilityState === 'hidden') return
    if (Date.now() - lastStarted < THROTTLE_MS) return
    // A return is a new occasion: a banner put aside last time comes back.
    if (state.dismissed) set({ dismissed: null })
    void checkForUpdate()
  }

  document.addEventListener('visibilitychange', onReturn)
  window.addEventListener('pageshow', onReturn)
  window.addEventListener('focus', onReturn)
  window.addEventListener('online', onReturn)
  window.setInterval(onReturn, INTERVAL_MS)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => set({ worker: workerState() }))
  }
  void checkForUpdate()
}
