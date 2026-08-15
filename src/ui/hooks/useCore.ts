import { useCallback, useSyncExternalStore } from 'react'

import { getVersion, subscribe } from '@core/index'

/**
 * Binds a React component to the core store.
 *
 * The snapshot is a version counter, not the data itself: the selector runs on
 * every render and reads through the role-aware accessors, so a component can
 * never accidentally hold data from a previous session/role.
 */
export function useCoreVersion(): number {
  return useSyncExternalStore(subscribe, getVersion, getVersion)
}

/**
 * `useCoreValue(() => getVisibleFarms())` — re-evaluates whenever the store
 * changes. `select` must be cheap and pure; wrap it in useCallback if it
 * closes over props.
 */
export function useCoreValue<T>(select: () => T): T {
  useCoreVersion()
  return select()
}

/** Convenience for selectors that depend on a single id. */
export function useCoreById<T>(
  select: (id: string) => T,
  id: string,
): T {
  const fn = useCallback(() => select(id), [select, id])
  return useCoreValue(fn)
}
