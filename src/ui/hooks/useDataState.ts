import { useEffect, useState } from 'react'

import { SUPABASE_CONFIGURED } from '../../data/config'
import type { DataState } from '../../data/store'

/**
 * P2.5b — what the data layer is doing, for the two pieces of shell that show it.
 *
 * ★ THE MODULE IS LOADED LAZILY, AND THAT IS NOT AN OPTIMISATION HABIT.
 *   `../../data/store` reaches the row mapper and, through it, the Supabase
 *   client chunk. A static import here would put both into the initial bundle
 *   of a DEMO build — which is /poc, `bun run dev`, and every browser gate —
 *   for a feature none of them has. `SUPABASE_CONFIGURED` is false there, the
 *   effect returns immediately, and the chunk is never fetched.
 *
 * Returns null while there is nothing to say: demo mode, or before the module
 * has arrived. Both callers render nothing on null, which is the right answer
 * for both.
 */
export function useDataState(): DataState | null {
  const [state, setState] = useState<DataState | null>(null)

  useEffect(() => {
    if (!SUPABASE_CONFIGURED) return
    let unsubscribe: (() => void) | null = null
    let live = true

    void import('../../data/store').then((m) => {
      if (!live) return
      const read = (): void => {
        setState(m.getDataState())
      }
      read()
      unsubscribe = m.subscribeData(read)
    })

    return () => {
      live = false
      unsubscribe?.()
    }
  }, [])

  return state
}

/**
 * ORDRE DE NUIT 2026-09-02 (N1) — HAS THE SNAPSHOT ARRIVED YET?
 *
 * ★ THE BUG THIS ANSWERS WAS FOUND BY `bun run zones` ON THE DEPLOYED URL: a
 *   reload on an entity's screen threw the coordinator back to the list. A
 *   real build seeds EMPTY and fills in a moment later — from the cache, then
 *   from the server — and every detail screen answered the first, empty frame
 *   with `<Navigate to="…list" replace />`, as if the record had been deleted.
 *   Five screens had the same line. On an iPad that is "I opened my farm and
 *   the app closed it", several times a night.
 *
 * True in demo mode (the fixtures are there from the first frame) and, in a
 * real build, once the data layer has said what it has: `ready` (from the
 * cache or from the server), `no-grant`, or `error`. Until then a missing
 * record means "not loaded yet", not "gone".
 */
export function useHydrated(): boolean {
  const state = useDataState()
  if (!SUPABASE_CONFIGURED) return true
  if (state === null) return false
  return state.status === 'ready' || state.status === 'no-grant' || state.status === 'error'
}
