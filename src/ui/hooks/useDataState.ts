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
