import { headingFromOrientation, type OrientationReading } from '../utils/geo';

/**
 * Which way the phone faces, for the beam on the reader's dot: the compass the phone already
 * has, read only while a map is drawing the reader, and never sent anywhere. A device with
 * no compass (a desktop, a phone whose readings are not tied to north) never answers, and the
 * map draws no beam. iOS answers only once the reader allows motion and orientation, which it
 * asks for on a tap (requestHeadingPermission); Android asks nothing. One listener on the
 * window however many maps want it, as stopAlarm.ts does for the position.
 */
type Listener = (heading: number) => void;

const listeners = new Set<Listener>();
let detach: (() => void) | null = null;

function attach(): () => void {
  // Chrome on Android sends the north-tied reading under its own name; the plain event there is relative to wherever the phone started.
  const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  const onReading = (event: Event) => {
    const heading = headingFromOrientation(event as DeviceOrientationEvent & OrientationReading, screen.orientation?.angle ?? 0);
    if (heading !== null) for (const listener of listeners) listener(heading);
  };
  window.addEventListener(type, onReading);
  return () => window.removeEventListener(type, onReading);
}

/** The heading as it changes, in degrees clockwise from north; returns the way to stop listening. */
export function subscribeHeading(onHeading: Listener): () => void {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return () => {};
  listeners.add(onHeading);
  detach ??= attach();
  return () => {
    listeners.delete(onHeading);
    if (listeners.size === 0) {
      detach?.();
      detach = null;
    }
  };
}

/**
 * iOS's question for the compass, which it allows only inside a tap: called first thing from
 * the button that shows the reader, before anything is awaited. Granted, the listener is laid
 * again so the readings start; refused, or asked outside a tap, nothing changes but the beam.
 */
export function requestHeadingPermission(): void {
  const ask = (globalThis.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined)?.requestPermission;
  if (typeof ask !== 'function') return;
  ask.call(globalThis.DeviceOrientationEvent)
    .then((state) => {
      if (state !== 'granted' || !detach) return;
      detach();
      detach = attach();
    })
    .catch(() => {});
}
