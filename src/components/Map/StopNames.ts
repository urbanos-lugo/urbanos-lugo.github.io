import type { Map as MapLibre } from 'maplibre-gl';
import type { BusStop } from '../../types';
import { DRAW } from './palette';
import { nameAt, nameBox, placeNames, type Box, type NamedDot } from './nameLayout';
import type { ClaimedEvent } from './mapLayers';

/**
 * The stop names written beside the dots, on a canvas of their own laid over the map. Text on
 * a canvas costs no layout: the width of each name is measured once, the side is chosen from
 * it (nameLayout.ts), and the whole set is painted in one pass each frame the map moves, so the
 * names keep to their dots while it pans, zooms or turns, and stay level whichever way it is
 * turned. A name that would cover another, another stop or a point kept clear is left out, in
 * the order the stops are given: the small maps give theirs nearest first. In the app's own
 * typeface, which the basemap's glyphs do not have.
 * A name answers a tap as its dot does (onTap): from zoom 16 it is the biggest thing on the
 * map that says which stop it is. Not read by assistive technology: the lists carry the name.
 */
interface StopNamesOptions {
  /** Text and halo colours, already resolved for the palette drawn. */
  ink: string;
  halo: string;
  /** Radius of the dot the name sits beside, so the gap clears its ring. */
  radius: number;
  /** A tap on a written name: the stop it names. */
  onTap?: (stop: BusStop) => void;
}

const { size: FONT_PX, weight: FONT_WEIGHT, gap: GAP_PX, halo: HALO_PX, edge: EDGE_PX, reach: REACH_PX } = DRAW.names;
const HEIGHT_PX = FONT_PX + HALO_PX;
/** Further than this between a press and its release is a drag, not a tap: the renderer's own click tolerance. */
const TAP_SLOP_PX = 3;

export interface StopNames {
  /** The stops whose names may be written, and points ([lat, lng]) no name may cover. */
  setStops(stops: BusStop[], keepClear?: [number, number][]): void;
  /** Out of sight until the map's next stop, then faded in: call before the move it waits for. */
  holdWhileMoving(): void;
  remove(): void;
}

export function stopNamesLayer(map: MapLibre, options: StopNamesOptions): StopNames {
  const canvas = document.createElement('canvas');
  canvas.className = 'map-names';
  canvas.setAttribute('aria-hidden', 'true');
  // Right after the map's own canvas: under the markers, which go in after it.
  map.getCanvas().after(canvas);
  const font = `${FONT_WEIGHT} ${FONT_PX}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'system-ui, sans-serif'}`;
  const widths = new Map<string, number>();
  let stops: BusStop[] = [];
  let clear: [number, number][] = [];
  let written: { item: BusStop; box: Box }[] = [];
  let frame = 0;

  const draw = () => {
    frame = 0;
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const dpr = window.devicePixelRatio || 1;
    // Sizing the bitmap also clears it and resets the context.
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = HALO_PX;
    ctx.strokeStyle = options.halo;
    ctx.fillStyle = options.ink;
    const shown = stops
      .map((stop) => ({ stop, at: map.project([stop.lng, stop.lat]) }))
      .filter(({ at: p }) => p.y >= -FONT_PX && p.y <= height + FONT_PX && p.x >= -width && p.x <= 2 * width);
    const dots: NamedDot[] = shown.map(({ stop, at }) => {
      let w = widths.get(stop.name);
      if (w === undefined) widths.set(stop.name, (w = ctx.measureText(stop.name).width));
      return { x: at.x, y: at.y, width: w };
    });
    const keepClear = clear.map(([lat, lng]) => map.project([lng, lat]));
    const places = placeNames(dots, { width, radius: options.radius, gap: GAP_PX, height: HEIGHT_PX, edge: EDGE_PX, keepClear });
    written = [];
    shown.forEach(({ stop }, i) => {
      const place = places[i];
      if (!place) return;
      ctx.textAlign = place.align;
      ctx.strokeText(stop.name, place.x, place.y);
      ctx.fillText(stop.name, place.x, place.y);
      written.push({ item: stop, box: nameBox(place, dots[i].width, HEIGHT_PX) });
    });
  };
  const later = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  map.on('move', later);
  map.on('resize', later);

  // The DOM's click, caught before the renderer's own handlers hear it, so the stop dots, the
  // routes and the pan read the claim left on that same event. A press that moved is a drag.
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
  const onClick = (e: MouseEvent) => {
    if (!options.onTap || (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP_PX)) return;
    const box = map.getContainer().getBoundingClientRect();
    const stop = nameAt(written, e.clientX - box.left, e.clientY - box.top, REACH_PX);
    if (!stop) return;
    (e as ClaimedEvent)._stopClaimed = true;
    (e as ClaimedEvent)._nameClaimed = true;
    options.onTap(stop);
  };
  const container = map.getContainer();
  container.addEventListener('pointerdown', onDown, true);
  container.addEventListener('click', onClick, true);
  let arrive: (() => void) | null = null;

  return {
    setStops(next, keepClear = []) {
      stops = next;
      clear = keepClear;
      later();
    },
    // Placed afresh each frame of a glide, the names swapped sides at the map's edges and came
    // and went as the stops crossed one another; they wait for it to stop instead.
    holdWhileMoving() {
      canvas.hidden = true;
      arrive = () => {
        arrive = null;
        canvas.hidden = false;
        canvas.classList.add('anim-fade-full');
      };
      map.once('moveend', arrive);
    },
    remove() {
      if (arrive) map.off('moveend', arrive);
      cancelAnimationFrame(frame);
      map.off('move', later);
      map.off('resize', later);
      container.removeEventListener('pointerdown', onDown, true);
      container.removeEventListener('click', onClick, true);
      canvas.remove();
    },
  };
}

/** What a tap a name took leaves on the event, for the stop dots and the route layer under it. */
export type TappedEvent = ClaimedEvent;
