import { Suspense, lazy } from 'react'

import type { MapViewProps } from './MapCanvas'

export type { MapMarker, MapViewProps } from './MapCanvas'

/**
 * Lazy boundary in front of MapLibre.
 *
 * MapLibre is by far the heaviest dependency in the bundle, and three of the
 * four roles reach a map only after a tap or two. Splitting it keeps the first
 * paint small — which is the whole game on a phone with one bar of signal in
 * the Negev.
 */
const MapCanvas = lazy(() => import('./MapCanvas'))

/** Shimmer placeholder while the MapLibre chunk downloads (R2: skeletons). */
function MapSkeleton({ className }: { className: string }) {
  return <div className={`skeleton rounded-lg ${className}`} aria-hidden="true" />
}

export function MapView(props: MapViewProps) {
  const className = props.className ?? 'h-full w-full'
  return (
    <Suspense fallback={<MapSkeleton className={className} />}>
      <MapCanvas {...props} />
    </Suspense>
  )
}
