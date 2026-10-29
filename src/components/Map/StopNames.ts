import type { Map as MapLibre } from 'maplibre-gl';
import type { BusStop } from '../../types';
import { DRAW } from './palette';
import { nameAt, nameBox, placeNames, placeOn, sideOf, type Box, type NamedDot, type NamePlace } from './nameLayout';
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

const { size: FONT_PX, weight: FONT_WEIGHT, gap: GAP_PX, halo: HALO_PX, edge: EDGE_PX, reach: REACH_PX, fade: FADE_MS } = DRAW.names;
const HEIGHT_PX = FONT_PX + HALO_PX;
/** The most time one frame of a fade may count: two frames at 60 Hz. */
const FRAME_CAP_MS = 33;
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
  /** The side each stop's name was last written on, kept while it fits (placeNames). */
  const sides = new Map<string, number>();
  /**
   * How visible each name is, eased toward 1 while it is written and to 0 once it is not:
   * names came and went in one frame as stops crossed one another under a drag. A name fading
   * out keeps its side beside its dot and takes no tap; one fading in takes it at once.
   */
  const alpha = new Map<string, number>();
  /** A name that moved to another side, fading out on the old one while it fades in on the new: it jumped across its dot in one frame. */
  const leaving = new Map<string, { side: number; alpha: number }>();
  let stops: BusStop[] = [];
  let clear: [number, number][] = [];
  let written: { item: BusStop; box: Box }[] = [];
  let frame = 0;
  let drawnAt = 0;

  const draw = (now: number = performance.now()) => {
    frame = 0;
    // The time since the last frame, no more than a couple of frames: after a still spell a
    // name that appears still fades in rather than arriving whole.
    const step = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : Math.min(now - (drawnAt || now), FRAME_CAP_MS) / FADE_MS;
    drawnAt = now;
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
    const places = placeNames(
      dots,
      { width, radius: options.radius, gap: GAP_PX, height: HEIGHT_PX, edge: EDGE_PX, keepClear },
      shown.map(({ stop }) => sides.get(stop.id)),
    );
    written = [];
    let fading = false;
    const view = { radius: options.radius, gap: GAP_PX, height: HEIGHT_PX };
    const write = (name: string, at: NamePlace, a: number) => {
      ctx.globalAlpha = a;
      ctx.textAlign = at.align;
      ctx.strokeText(name, at.x, at.y);
      ctx.fillText(name, at.x, at.y);
    };
    shown.forEach(({ stop }, i) => {
      const place = places[i];
      const before = sides.get(stop.id);
      const side = place ? sideOf(place, dots[i]) : before;
      let was = alpha.get(stop.id) ?? 0;
      if (place && before !== undefined && side !== before && was > 0) {
        leaving.set(stop.id, { side: before, alpha: was });
        was = 0;
      }
      const old = leaving.get(stop.id);
      if (old) {
        old.alpha = Math.max(0, old.alpha - step);
        if (old.alpha > 0) {
          fading = true;
          write(stop.name, placeOn(dots[i], old.side, view), old.alpha);
        } else leaving.delete(stop.id);
      }
      const target = place ? 1 : 0;
      const a = was < target ? Math.min(target, was + step) : Math.max(target, was - step);
      if (a !== target) fading = true;
      if (a <= 0) return void alpha.delete(stop.id);
      alpha.set(stop.id, a);
      if (side !== undefined) sides.set(stop.id, side);
      write(stop.name, place ?? placeOn(dots[i], side ?? 0, view), a);
      if (place) written.push({ item: stop, box: nameBox(place, dots[i].width, HEIGHT_PX) });
    });
    if (fading) frame = requestAnimationFrame(draw);
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
