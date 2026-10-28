import { useEffect, useRef, useState, type RefObject } from 'react';
import { Map as MapLibre, NavigationControl, type MapMouseEvent } from 'maplibre-gl';
import { CONTEXT_GRACE_MS, MAP_STYLES, giveUpOnWebGL, hasWebGL2 } from '../components/Map/mapStyle';
import { isClaimed } from '../components/Map/mapLayers';
import { useIsDark } from './useIsDark';
import { useT, type Dict } from '../i18n';

interface MapOptions {
  /** [lat, lng], as the app keeps its places. */
  center: [number, number];
  zoom: number;
  /** A small map inside a scrolling page should scroll the page, not zoom the city. */
  scrollZoom?: boolean;
  /** What this map is, for a reader who will never see it. */
  region: string;
  /** Turns with two fingers, a right drag or Shift and the arrows, and shows the compass. The small maps stay north up. */
  turns?: boolean;
}

export interface MapHandle {
  map: MapLibre | null;
  /** Counts the styles loaded: the first, and each palette after it; 0 while the palette's own is loading. Layers are drawn again when it moves. */
  styled: number;
  /** No WebGL2, or a context lost and not given back: the map is a notice (MapUnavailable). */
  unavailable: boolean;
}

/** Long enough for the second click of a double click, which zooms, to cancel the pan of the first. */
export const PAN_AFTER_CLICK_MS = 300;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The renderer's own words, in the reader's language (WCAG 3.1.2): it writes them in English otherwise. */
const uiStrings = (t: Dict, region: string): Record<string, string> => ({
  'Map.Title': region,
  'NavigationControl.ZoomIn': t.map.zoomIn,
  'NavigationControl.ZoomOut': t.map.zoomOut,
  'NavigationControl.ResetBearing': t.map.resetNorth,
  'Popup.Close': t.map.closePopup,
});

/**
 * One MapLibre map on a container, drawn from coordinates so it can turn: the style for the
 * palette, the zoom bar and, on the maps that turn, the compass, which shows once the map is
 * turned and puts north back; the accessible chrome; and the map the callers draw their
 * layers on. Without WebGL2, or with a context lost and not given back, there is no map: the
 * caller draws MapUnavailable where it would be.
 */
export function useMapLibre(containerRef: RefObject<HTMLDivElement | null>, { center, zoom, scrollZoom = true, region, turns = false }: MapOptions): MapHandle {
  const [map, setMap] = useState<MapLibre | null>(null);
  const [loaded, setLoaded] = useState<{ dark: boolean; count: number } | null>(null);
  const [unavailable, setUnavailable] = useState(() => !hasWebGL2());
  const isDark = useIsDark();
  const t = useT();
  const palette = useRef(isDark);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || unavailable) return;
    const instance = new MapLibre({
      container: el,
      style: isDark ? MAP_STYLES.dark : MAP_STYLES.light,
      center: [center[1], center[0]],
      zoom,
      // Every zoom in the app is MapLibre's: its world is 512 px across at zoom 0 where Leaflet's
      // was 256, so each is one less than the Leaflet zoom that showed the same streets.
      maxZoom: 18,
      // Turned, never tilted: a tilted map of a small city reads worse, and two fingers moving apart tilted it by accident.
      maxPitch: 0,
      pitchWithRotate: false,
      touchPitch: false,
      dragRotate: turns,
      scrollZoom,
      renderWorldCopies: false,
      attributionControl: { compact: false },
      locale: uiStrings(t, region),
    });
    palette.current = isDark;
    if (!turns) {
      instance.touchZoomRotate.disableRotation();
      instance.keyboard.disableRotation();
    }
    instance.addControl(new NavigationControl({ showCompass: turns, showZoom: true, visualizePitch: false }), 'bottom-right');
    instance.on('style.load', () => setLoaded((was) => ({ dark: palette.current, count: (was?.count ?? 0) + 1 })));

    // The compass is there once the map is turned, and only then.
    const turned = () => el.classList.toggle('map-turned', Math.abs(instance.getBearing()) > 0.5);
    instance.on('rotate', turned);
    // Where the map is looking, written where the browser audit reads it (its pan check).
    const view = () => {
      const c = instance.getCenter();
      el.dataset.view = [c.lng.toFixed(6), c.lat.toFixed(6), instance.getZoom().toFixed(2), instance.getBearing().toFixed(1)].join(',');
    };
    instance.on('moveend', view);
    // And once on load, so a map nobody has moved yet has a view to compare against.
    instance.once('load', view);
    // Whether the map has drawn all it was asked to, for the browser audit's taps: a tap on a
    // stop has to wait for the stop to be there, as an eye would. A fixed pause did, until the
    // stops took a worker's processing to appear, and on a throttled phone the tap came first.
    instance.on('idle', () => (el.dataset.idle = 'true'));
    for (const busy of ['dataloading', 'movestart'] as const) instance.on(busy, () => delete el.dataset.idle);

    // WCAG 2.5.7: the map moved only by dragging it, and a drag is the one gesture some hands
    // cannot make. A click or tap on the map brings that spot to the middle, unless a stop, a
    // name, a route or a marker took it, which is asked when the pan would start: those
    // layers hear the click after this listener does. Not the first click of a double click.
    let pending = 0;
    const onClick = (e: MapMouseEvent) => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        if (!isClaimed(e)) instance.easeTo({ center: e.lngLat, duration: reduced() ? 0 : 300 });
      }, PAN_AFTER_CLICK_MS);
    };
    instance.on('click', onClick);
    instance.on('dblclick', () => window.clearTimeout(pending));

    // A context lost and not given back within CONTEXT_GRACE_MS, counted while the page shows.
    let lost = false;
    let grace = 0;
    const arm = () => {
      window.clearTimeout(grace);
      grace = window.setTimeout(() => {
        if (!lost || document.visibilityState !== 'visible') return;
        giveUpOnWebGL();
        setUnavailable(true);
      }, CONTEXT_GRACE_MS);
    };
    instance.on('webglcontextlost', () => {
      lost = true;
      if (document.visibilityState === 'visible') arm();
    });
    instance.on('webglcontextrestored', () => {
      lost = false;
      window.clearTimeout(grace);
    });
    // The map stays mounted behind display:none between tab visits, and a phone unlocked again resized nothing.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      instance.resize();
      if (lost) arm();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => instance.resize()) : null;
    observer?.observe(el);

    setMap(instance);
    return () => {
      window.clearTimeout(pending);
      window.clearTimeout(grace);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
      instance.remove();
      setMap(null);
    };
    // Built once: a later centre moves the view rather than rebuilding the map.
  }, [unavailable]);

  // The other palette's style, loaded whole: the layers drawn over it come back with `styled`.
  useEffect(() => {
    if (!map || palette.current === isDark) return;
    palette.current = isDark;
    map.setStyle(isDark ? MAP_STYLES.dark : MAP_STYLES.light, { diff: false });
  }, [map, isDark]);

  // A language switch relabels a live map: its region, and the renderer's words.
  useEffect(() => {
    const el = map && containerRef.current;
    if (!el) return;
    // The landmark is the renderer's canvas, the map's one Tab stop, which it makes a region named
    // Map.Title: named on the container too, the map was two nested regions of the same name.
    map.getCanvas().setAttribute('aria-label', region);
    const strings = uiStrings(t, region);
    // The renderer reads its words from here each time it writes one (a popup's close button).
    (map as unknown as { _locale: Record<string, string> })._locale = { ...(map as unknown as { _locale: Record<string, string> })._locale, ...strings };
    for (const [selector, key] of [
      ['.maplibregl-ctrl-zoom-in', 'NavigationControl.ZoomIn'],
      ['.maplibregl-ctrl-zoom-out', 'NavigationControl.ZoomOut'],
      ['.maplibregl-ctrl-compass', 'NavigationControl.ResetBearing'],
    ] as const) {
      const node = el.querySelector(selector);
      node?.setAttribute('title', strings[key]);
      node?.setAttribute('aria-label', strings[key]);
    }
  }, [map, containerRef, region, t]);

  // Nothing while the other palette's style loads: a caller drawing for the new palette in the
  // same commit as setStyle added its sources to a style not loaded yet, and the screen fell over.
  return { map, styled: loaded?.dark === isDark ? loaded.count : 0, unavailable };
}

/** The map's zoom, read at the end of each gesture. */
export function useMapZoom(map: MapLibre | null): number {
  const [zoom, setZoom] = useState(() => map?.getZoom() ?? 13);
  useEffect(() => {
    if (!map) return;
    const sync = () => setZoom(map.getZoom());
    sync();
    map.on('zoomend', sync);
    return () => {
      map.off('zoomend', sync);
    };
  }, [map]);
  return zoom;
}
