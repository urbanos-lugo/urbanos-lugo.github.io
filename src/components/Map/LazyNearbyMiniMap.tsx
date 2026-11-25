import { Suspense, lazy, useRef } from 'react';
import { useSeen } from '../../hooks/useSeen';
import type { NearbyMiniMapProps } from './NearbyMiniMap';

/**
 * The mini map, and nothing of it until it is on screen. `lazy()` alone defers the chunk
 * until the component renders, and below lg the board stays mounted behind `hidden` — so
 * the map (Leaflet then) was being built inside `display: none` on every cold start (255 KB, 700 ms of
 * blocked main thread).
 */
const NearbyMiniMap = lazy(() => import('./NearbyMiniMap').then((m) => ({ default: m.NearbyMiniMap })));

/** The map's own height, so nothing moves when it arrives. */
const Placeholder = () => <div className="h-map-card w-full bg-surface" />;

/** Framed here, the control corner and the hairline; the space above it is the caller's. */
export function LazyNearbyMiniMap({ className, ...props }: NearbyMiniMapProps & { className: string }) {
  const holder = useRef<HTMLDivElement>(null);
  const seen = useSeen(holder);

  return (
    <div ref={holder} className={`overflow-hidden rounded-control border border-edge ${className}`}>
      {seen ? (
        <Suspense fallback={<Placeholder />}>
          <NearbyMiniMap {...props} />
        </Suspense>
      ) : (
        <Placeholder />
      )}
    </div>
  );
}
