import { Popup, type GeoJSONSource, type LayerSpecification, type LngLatLike, type Map as MapLibre, type MapMouseEvent } from 'maplibre-gl';
import { DRAW } from './palette';

/**
 * The app's own layers, bottom to top, over the basemap. A layer is put under the first one
 * above it that is already there, so one drawn again (new data, a new palette) keeps its place
 * instead of landing on top of everything.
 */
export const LAYER_ORDER = [
  'app-walks',
  'app-walks-guess',
  'app-routes',
  'app-routes-volta',
  'app-route-arrows',
  'app-legs',
  'app-calls',
  'app-stops',
  'app-stop-selected',
  'app-stop-centre',
  'app-accuracy',
] as const;
export type AppLayerId = (typeof LAYER_ORDER)[number];

export function placeLayer(map: MapLibre, layer: LayerSpecification & { id: AppLayerId }): void {
  if (map.getLayer(layer.id)) map.removeLayer(layer.id);
  const above = LAYER_ORDER.slice(LAYER_ORDER.indexOf(layer.id) + 1).find((id) => map.getLayer(id));
  map.addLayer(layer, above);
}

/** A GeoJSON source given new data, or made the first time. */
export function setSource(map: MapLibre, id: string, data: GeoJSON.GeoJSON): void {
  const source = map.getSource(id) as GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(id, { type: 'geojson', data });
}

/** Layers and sources taken off a map that may already be gone (an unmount after the map's own). */
export function dropLayers(map: MapLibre, layers: string[], sources: string[] = []): void {
  if (!map.style) return;
  for (const id of layers) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of sources) if (map.getSource(id)) map.removeSource(id);
}

/** A tap a stop, a name, a route or a marker has taken: the map does not slide away under it (useMapLibre's click-to-pan). */
export type ClaimedEvent = MouseEvent & { _stopClaimed?: boolean; _nameClaimed?: boolean };
export const claim = (e: MapMouseEvent | MouseEvent): void => {
  ((e instanceof MouseEvent ? e : e.originalEvent) as ClaimedEvent)._stopClaimed = true;
};
export const isClaimed = (e: MapMouseEvent): boolean => !!(e.originalEvent as ClaimedEvent)._stopClaimed;

/** How far past its edge a dot or a line answers: a finger's reach on a touch screen, none for a mouse. */
export const fingerReach = (): number => (window.matchMedia('(pointer: coarse)').matches ? DRAW.touchReach : 0);

/** How long a hover label waits for the pointer to cross from what it names onto it. */
export const HOVER_GRACE_MS = 300;

/**
 * The hover labels of one map (WCAG 1.4.13): one at a time, held while the pointer is on it,
 * gone HOVER_GRACE_MS after the pointer leaves, and gone on Escape without the pointer moving.
 * Only for a mouse: under a finger the tap opens the thing itself, and a label would take the tap.
 */
export function hoverLabels(map: MapLibre) {
  // Never the focus: a label a pointer raised must not take it from wherever it is (1.4.13).
  const popup = new Popup({ closeButton: false, closeOnClick: false, closeOnMove: false, focusAfterOpen: false, className: 'map-hover-label', maxWidth: 'none' });
  let leaving = 0;
  let mouse = false;
  const container = map.getContainer();
  const pointer = (e: PointerEvent) => (mouse = e.pointerType === 'mouse');
  container.addEventListener('pointermove', pointer, { passive: true });
  container.addEventListener('pointerdown', pointer, { passive: true });
  const hide = () => {
    window.clearTimeout(leaving);
    popup.remove();
  };
  const escape = (e: KeyboardEvent) => e.key === 'Escape' && hide();
  document.addEventListener('keydown', escape);
  return {
    /** `lift` keeps the label clear of a dot it names, in pixels. */
    show(at: LngLatLike, html: string, lift = 0) {
      if (!mouse) return;
      window.clearTimeout(leaving);
      popup.setOffset(lift).setLngLat(at).setHTML(html).addTo(map);
      const el = popup.getElement();
      el.onmouseenter = () => window.clearTimeout(leaving);
      el.onmouseleave = () => this.leave();
    },
    leave() {
      window.clearTimeout(leaving);
      leaving = window.setTimeout(hide, HOVER_GRACE_MS);
    },
    remove() {
      hide();
      document.removeEventListener('keydown', escape);
      container.removeEventListener('pointermove', pointer);
      container.removeEventListener('pointerdown', pointer);
    },
  };
}
export type HoverLabels = ReturnType<typeof hoverLabels>;
