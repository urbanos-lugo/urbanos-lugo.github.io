import { setWorkerUrl, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import darkStyle from '../../data/map-style-dark.json';
import lightStyle from '../../data/map-style-light.json';

// The renderer works out where its worker lives at runtime, which no bundler can see, so
// the file is never emitted and the map draws nothing. Naming the vendor file itself as a
// worker entry makes Vite emit it same-origin, which is what keeps worker-src at 'self'.
setWorkerUrl(maplibreWorkerUrl);

/**
 * The map: OpenFreeMap's vector tiles, drawn with a style of our own (tools/buildMapStyle.ts)
 * so the phone draws the map from coordinates — sharp at any zoom, turned any way, and dark at
 * eleven at night. No key, no account; the terms ask only that the attribution stay visible,
 * which the style's sources carry. The price is WebGL2: without it the map says so
 * (MapUnavailable) and the lists beside it do the work.
 */
export const MAP_STYLES = { light: lightStyle as unknown as StyleSpecification, dark: darkStyle as unknown as StyleSpecification };

/**
 * How long a lost WebGL context is given to come back before the map is built again on a
 * canvas of its own: a phone takes the context away from an app left for another, and Firefox
 * did not always give it back, so the map was blank until the page was reloaded. Counted only
 * while the page is visible.
 */
export const REBUILD_AFTER_MS = 1_500;

/**
 * And how long one lost again, on the map built for it, before there is no map. "WebGL context
 * lost" was seen in a production console; a browser that restores a context does so within a
 * second or two, so five is past that and still a hiccup rather than a screen.
 */
export const CONTEXT_GRACE_MS = 5_000;

/** Asked once: a probe context per map would leak contexts, and browsers cap how many exist. */
let webgl2: boolean | null = null;
export function hasWebGL2(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    webgl2 = !!document.createElement('canvas').getContext('webgl2');
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

/** A context that went away, and the one after it: no map until the page is come back to. */
export function giveUpOnWebGL(): void {
  webgl2 = false;
}

/** The answer asked again, on coming back to the page: what the browser could not draw then it may now. */
export function askWebGL2Again(): boolean {
  webgl2 = null;
  return hasWebGL2();
}
