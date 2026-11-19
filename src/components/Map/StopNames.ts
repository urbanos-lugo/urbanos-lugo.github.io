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
  /** A stop drawn bigger than the rest, the radius its name keeps clear of. */
  radiusOf?: (stop: BusStop) => number | undefined;
  /** A tap on a written name: the stop it names. */
  onTap?: (stop: BusStop) => void;
}

const { size: FONT_PX, weight: FONT_WEIGHT, gap: GAP_PX, halo: HALO_PX, edge: EDGE_PX, reach: REACH_PX, fade: FADE_MS } = DRAW.names;
const HEIGHT_PX = FONT_PX + HALO_PX;
/** The most time one frame of a fade may count: two frames at 60 Hz. */
const FRAME_CAP_MS = 33;
/** Further than this between a press and its release is a drag, not a tap: the renderer's own click tolerance. */
const TAP_SLOP_PX = 3;
const { layers: LANDMARKS, size: LANDMARK_PX, offset: LANDMARK_OFFSET, wrap: LANDMARK_WRAP, icon: LANDMARK_ICON_PX, railway: LANDMARK_RAILWAY, covered: LANDMARK_COVERED } = DRAW.landmarks;
/** The bottom layer, the squares: a name centred over each, with no icon beside it. */
const [SQUARES_LAYER] = LANDMARKS;
/** The basemap draws a landmark's name in Noto Sans, which the page does not have: measured in the app's face, with room over. */
const LANDMARK_SLACK = 1.15;
/** MapLibre's text-line-height, the default the landmarks keep. */
const LANDMARK_LINE = 1.2;

export interface StopNames {
  /** The stops whose names may be written, and points ([lat, lng], and a radius where it is not the dots') no name may cover. */
  setStops(stops: BusStop[], keepClear?: [lat: number, lng: number, radius?: number][]): void;
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
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'system-ui, sans-serif';
  const font = `${FONT_WEIGHT} ${FONT_PX}px ${family}`;
  const widths = new Map<string, number>();
  const landmarkWidths = new Map<string, number>();

  /**
   * Where the basemap's landmarks are on the screen, each icon with its name on its right as
   * buildMapStyle.ts lays it out: the boxes a stop name would rather not cover (placeNames'
   * `avoid`). Only those MapLibre drew this frame. A name it wrapped is taken as lines of the
   * wrap width. An icon and its name are drawn together or not at all, so what comes back is
   * drawn whole. Every tier measured at the top one's size: those
   * below it are a pixel smaller, so their boxes come out a little roomy, never short.
   */
  /** Each landmark's feature by its key, source and id: the squares come from a source of their own. */
  const targets = new Map<string, { source: string; sourceLayer?: string; id: string | number }>();
  const landmarkBoxes = (ctx: CanvasRenderingContext2D): (Box & { id: string })[] => {
    const layers = LANDMARKS.filter((id) => map.getLayer(id));
    if (!layers.length) return [];
    ctx.font = `400 ${LANDMARK_PX}px ${family}`;
    const wrap = LANDMARK_WRAP * LANDMARK_PX;
    const boxes = map.queryRenderedFeatures({ layers }).flatMap((feature): (Box & { id: string })[] => {
      if (feature.geometry.type !== 'Point' || feature.id === undefined) return [];
      const { x, y } = map.project(feature.geometry.coordinates as [number, number]);
      // What the style writes there (buildMapStyle.ts): the station's word in place of its name.
      const name = feature.properties?.class === 'railway' ? LANDMARK_RAILWAY : String(feature.properties?.name ?? '');
      let w = landmarkWidths.get(name);
      if (w === undefined) landmarkWidths.set(name, (w = name ? ctx.measureText(name).width * LANDMARK_SLACK : 0));
      const lines = Math.ceil(w / wrap);
      const id = `${feature.source}/${feature.sourceLayer ?? ''}/${feature.id}`;
      targets.set(id, feature.sourceLayer ? { source: feature.source, sourceLayer: feature.sourceLayer, id: feature.id } : { source: feature.source, id: feature.id });
      // A square's name is centred on its point, with no icon.
      if (feature.layer.id === SQUARES_LAYER) {
        const half = (lines * LANDMARK_PX * LANDMARK_LINE) / 2;
        const across = Math.min(w, wrap) / 2;
        return [{ id, left: x - across, right: x + across, top: y - half, bottom: y + half }];
      }
      const half = Math.max(LANDMARK_ICON_PX, lines * LANDMARK_PX * LANDMARK_LINE) / 2;
      const right = w ? x + LANDMARK_OFFSET * LANDMARK_PX + Math.min(w, wrap) : x + LANDMARK_ICON_PX / 2;
      return [{ id, left: x - LANDMARK_ICON_PX / 2, right, top: y - half, bottom: y + half }];
    });
    ctx.font = font;
    return boxes;
  };
  /** The landmarks hidden now because a stop's name is written over them, so each is shown again once it is not. */
  let covered = new Set<string>();
  const cover = (next: Set<string>) => {
    const set = (id: string, on: boolean) => {
      const target = targets.get(id);
      if (!target) return;
      try {
        map.setFeatureState(target, { [LANDMARK_COVERED]: on });
      } catch {
        // The style is being swapped (a change of theme): its new tiles start with nothing hidden.
      }
    };
    for (const id of covered) if (!next.has(id)) set(id, false);
    for (const id of next) if (!covered.has(id)) set(id, true);
    covered = next;
  };
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
  let clear: [lat: number, lng: number, radius?: number][] = [];
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
      return { x: at.x, y: at.y, width: w, radius: options.radiusOf?.(stop) };
    });
    const keepClear = clear.map(([lat, lng, radius]) => {
      const { x, y } = map.project([lng, lat]);
      return { x, y, radius };
    });
    const landmarks = shown.length ? landmarkBoxes(ctx) : [];
    const places = placeNames(
      dots,
      { width, radius: options.radius, gap: GAP_PX, height: HEIGHT_PX, edge: EDGE_PX, keepClear, avoid: landmarks },
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
    // A stop name with no side clear of a landmark was written over it (placeNames): that one goes.
    const over = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    cover(new Set(landmarks.filter((l) => written.some(({ box }) => over(box, l))).map((l) => l.id)));
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
      if (map.style) cover(new Set());
    },
  };
}

/** What a tap a name took leaves on the event, for the stop dots and the route layer under it. */
export type TappedEvent = ClaimedEvent;
