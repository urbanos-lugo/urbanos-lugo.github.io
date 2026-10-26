import L from 'leaflet';
import type { BusStop } from '../../types';
import { DRAW } from './palette';
import { placeNames, type NamedDot } from './nameLayout';

/**
 * The stop names written beside the dots, on a canvas of their own. As permanent Leaflet
 * tooltips each was a DOM element laid out on every zoom — `Tooltip._setPosition` was the
 * largest frame on the profile. Text on a canvas costs no layout: `measureText` says how
 * wide a name is, the side is chosen from that, the whole set is painted in one call. A name
 * that would cover another, or another stop, is left out (nameLayout.ts), in the order the
 * stops are given: the small maps give theirs nearest first.
 * Not interactive and not read by assistive technology: the dot's hover label and the lists carry the name.
 */
interface StopNamesOptions extends L.LayerOptions {
  /** Text and halo colours, already resolved for the theme being drawn. */
  ink: string;
  halo: string;
  /** Radius of the dot the name sits beside, so the gap clears its ring. */
  radius: number;
}

const PANE = 'stopNames';
const { size: FONT_PX, weight: FONT_WEIGHT, gap: GAP_PX, halo: HALO_PX, edge: EDGE_PX } = DRAW.names;

const StopNamesLayer = L.Layer.extend({
  initialize(this: StopNamesInstance, options: StopNamesOptions) {
    L.Util.setOptions(this, options);
    this._stops = [];
    this._clear = [];
  },

  onAdd(this: StopNamesInstance, map: L.Map) {
    if (!map.getPane(PANE)) {
      // Over the overlay canvas (400) that draws the dots, under the markers (600).
      const pane = map.createPane(PANE);
      pane.style.zIndex = String(DRAW.pane.names);
      pane.style.pointerEvents = 'none';
    }
    this._canvas = L.DomUtil.create('canvas', 'leaflet-zoom-hide', map.getPane(PANE));
    this._font = `${FONT_WEIGHT} ${FONT_PX}px ${getComputedStyle(document.documentElement).getPropertyValue('--font-sans') || 'system-ui, sans-serif'}`;
    map.on('moveend resize', this._draw, this);
    map.on('zoomstart', this._hide, this);
    this._draw();
  },

  onRemove(this: StopNamesInstance, map: L.Map) {
    map.off('moveend resize', this._draw, this);
    map.off('zoomstart', this._hide, this);
    L.DomUtil.remove(this._canvas);
  },

  /** The stops whose names may be written, and points no name may cover; only the ones in view are painted. */
  setStops(this: StopNamesInstance, stops: BusStop[], keepClear: [number, number][] = []) {
    this._stops = stops;
    this._clear = keepClear;
    if (this._map) this._draw();
  },

  _hide(this: StopNamesInstance) {
    this._canvas.style.visibility = 'hidden';
  },

  _draw(this: StopNamesInstance) {
    const map = this._map;
    const canvas = this._canvas;
    const size = map.getSize();
    const dpr = window.devicePixelRatio || 1;
    // Sizing the bitmap also clears it and resets the context.
    canvas.width = size.x * dpr;
    canvas.height = size.y * dpr;
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
    canvas.style.visibility = '';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.font = this._font;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = HALO_PX;
    ctx.strokeStyle = this.options.halo;
    ctx.fillStyle = this.options.ink;
    const shown = this._stops
      .map((stop) => ({ stop, at: map.latLngToContainerPoint([stop.lat, stop.lng]) }))
      .filter(({ at: p }) => p.y >= -FONT_PX && p.y <= size.y + FONT_PX && p.x >= -size.x && p.x <= 2 * size.x);
    const dots: NamedDot[] = shown.map(({ stop, at }) => ({ x: at.x, y: at.y, width: ctx.measureText(stop.name).width }));
    const keepClear = this._clear.map((at) => map.latLngToContainerPoint(at));
    const places = placeNames(dots, { width: size.x, radius: this.options.radius, gap: GAP_PX, height: FONT_PX + HALO_PX, edge: EDGE_PX, keepClear });
    shown.forEach(({ stop }, i) => {
      const place = places[i];
      if (!place) return;
      ctx.textAlign = place.align;
      ctx.strokeText(stop.name, place.x, place.y);
      ctx.fillText(stop.name, place.x, place.y);
    });
  },
});

/** The shape of an instance; not `extends L.Layer`, whose typings keep `_map` protected. */
interface StopNamesInstance {
  options: StopNamesOptions;
  _map: L.Map;
  _canvas: HTMLCanvasElement;
  _font: string;
  _stops: BusStop[];
  _clear: [number, number][];
  _draw(): void;
  _hide(): void;
  setStops(stops: BusStop[], keepClear?: [number, number][]): void;
  addTo(map: L.Map): this;
  remove(): this;
}

export type StopNames = Pick<StopNamesInstance, 'setStops' | 'addTo' | 'remove'>;

export function stopNamesLayer(options: StopNamesOptions): StopNames {
  return new (StopNamesLayer as unknown as new (o: StopNamesOptions) => StopNamesInstance)(options);
}
