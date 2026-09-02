import { useSyncExternalStore } from 'react'

import { readCoordinator, subscribeCoordinator } from '@core/index'
import type { CoordinatorProfile } from '@core/index'

/**
 * W7 — the coordinator's own card, live.
 *
 * `readCoordinator` parses localStorage on every call, so it cannot be the
 * snapshot `useSyncExternalStore` compares by identity: it would return a new
 * object each render and loop. The value is cached here and invalidated by
 * the store's own notification, which is the only thing that can change it.
 */
let snapshot: CoordinatorProfile = readCoordinator()
let subscribed = false

function ensure(): void {
  if (subscribed) return
  subscribed = true
  subscribeCoordinator(() => {
    snapshot = readCoordinator()
  })
}

export function useCoordinator(): CoordinatorProfile {
  ensure()
  return useSyncExternalStore(
    subscribeCoordinator,
    () => snapshot,
    () => snapshot,
  )
}
