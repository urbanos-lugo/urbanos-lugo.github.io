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
 * How long a lost WebGL context is given to come back. "WebGL context lost" was seen in a
 * production console; a browser that restores a context does so within a second or two, so
 * five is past that and still a hiccup rather than a screen. Counted only while the page is
 * visible: a phone that hands the context back on return must not come back to no map.
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

/** A context that went away and did not come back: no map for the rest of the visit. */
export function giveUpOnWebGL(): void {
  webgl2 = false;
}
