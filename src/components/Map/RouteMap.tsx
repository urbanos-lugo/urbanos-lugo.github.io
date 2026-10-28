import { useEffect, useRef } from 'react';
import { LngLatBounds, Marker, type ExpressionSpecification, type MapLayerMouseEvent } from 'maplibre-gl';
import { useT } from '../../i18n';
import { escapeHtml } from '../../utils/html';
import { RoutePlanResult, TripSegment } from '../../types';
import { LUGO_CENTER, stopById } from '../../data/transitData';
import { useRouteGeometry } from '../../data/routeGeometry';
import { WalkPaths, walkHopKey } from '../../services/walkingPath';
import { useIsDark } from '../../hooks/useIsDark';
import { useMapLibre } from '../../hooks/useMapLibre';
import { DRAW, mapColors, stopDotPaint } from './palette';
import { readerMark, type ReaderMark } from './reader';
import { dropLayers, hoverLabels, placeLayer, setSource } from './mapLayers';
import { MapUnavailable } from './MapUnavailable';

interface Place {
  lat: number;
  lng: number;
  name: string;
}

interface RouteMapProps {
  plan: RoutePlanResult | null;
  walkPaths?: WalkPaths;
  origin?: Place;
  destination?: Place;
  /** Index of the leg being made right now (trip companion): drawn in full and framed, the rest faint. */
  focusSegment?: number;
  /** The reader's own position, drawn and kept in view. */
  position?: { lat: number; lng: number } | null;
  className?: string;
}

/** Room the fit leaves around the trip: more at the top, where the "Paso a paso" chip sits, and clear of the zoom bar and the attribution. */
const FIT = {
  padding: { top: DRAW.fit.tripTop, left: DRAW.fit.trip, bottom: DRAW.fit.trip + DRAW.fit.credit, right: DRAW.fit.trip + DRAW.fit.zoomBar },
  maxZoom: 15,
  duration: 0,
};
const FAINT = DRAW.trip.faint;
const LAYERS = ['app-walks', 'app-walks-guess', 'app-legs', 'app-calls'];

/** Rough relative luminance of a #rrggbb colour, enough to pick black or white ink. */
function isLight(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.35;
}

function pinElement(color: string, label: string): HTMLElement {
  const ink = isLight(color) ? 'border-on-pale-pin text-on-pale-pin' : 'border-on-line text-on-line';
  const el = document.createElement('div');
  el.className = 'route-map-pin';
  el.innerHTML = `<div class="flex size-full items-center justify-center rounded-pill border-strong font-sans text-map-pin font-bold shadow-pin ${ink}" style="background:${escapeHtml(color)}">${escapeHtml(label)}</div>`;
  return el;
}

/** The walk segment just before bus leg `index`, skipping a wait; -1 when there is none. */
function walkBefore(segments: TripSegment[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (segments[i].type === 'bus') return -1;
    if (segments[i].type === 'walk') return i;
  }
  return -1;
}

type Line = GeoJSON.Feature<GeoJSON.LineString, { faint: boolean; label?: string; color?: string; width?: number }>;
const line = (path: [number, number][], properties: Line['properties']): Line => ({
  type: 'Feature',
  properties,
  geometry: { type: 'LineString', coordinates: path.map(([lat, lng]) => [lng, lat]) },
});
const collection = <T extends GeoJSON.Feature>(features: T[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

/**
 * A planned trip, drawn: walking legs dotted (the real pavement where the router answered,
 * a straight dashed hint where it did not), each bus leg in its line colour sliced from that
 * direction's real road geometry between the two stops it rides.
 */
export function RouteMap({ plan, origin, destination, walkPaths = {}, focusSegment, position = null, className }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const colors = mapColors(useIsDark());
  const geometryReady = useRouteGeometry();
  const { map, styled, unavailable } = useMapLibre(containerRef, { center: LUGO_CENTER, zoom: 12, scrollZoom: false, region: t.planner.routeMap });
  /**
   * The bounds this map is meant to show, so a resize can put the view back: the map is
   * built inside a column that is `display: none` on a phone until there is a plan, and a
   * fit worked out for a box that no longer exists clipped the trip to a couple of streets.
   */
  const shownRef = useRef<LngLatBounds | null>(null);

  useEffect(() => {
    if (!map) return;
    const refit = () => {
      // Only when the trip has actually fallen off the map: a reader who zoomed in keeps their view.
      const want = shownRef.current;
      const view = map.getBounds();
      if (want && !(view.contains(want.getSouthWest()) && view.contains(want.getNorthEast()))) map.fitBounds(want, FIT);
    };
    map.on('resize', refit);
    return () => {
      map.off('resize', refit);
    };
  }, [map]);

  useEffect(() => {
    if (!map || !styled || !geometryReady) return;
    const hover = hoverLabels(map);
    const markers: Marker[] = [];
    const bounds = new LngLatBounds();
    const extend = (points: [number, number][]) => points.forEach(([lat, lng]) => bounds.extend([lng, lat]));
    const walks: Line[] = [];
    const guesses: Line[] = [];
    const legs: Line[] = [];
    const calls: GeoJSON.Feature<GeoJSON.Point, { label: string }>[] = [];

    // Which parts are the reader's now: the focused leg is drawn as always and framed; the
    // rest drops to a quarter opacity. A walk is focused through the bus leg it leads into.
    const segments = plan?.segments || [];
    const focused = focusSegment !== undefined && segments[focusSegment] !== undefined;
    const legIsFocused = (index: number) => !focused || index === focusSegment;
    const walkIntoIsFocused = (index: number) => !focused || walkBefore(segments, index) === focusSegment;
    const lastIndex = segments.length - 1;
    const finalWalkIsFocused = !focused || (segments[lastIndex]?.type === 'walk' && focusSegment === lastIndex);

    /** A walk drawn, and the points it covers. */
    const walk = (a: [number, number], b: [number, number], emphasised: boolean): [number, number][] => {
      const detailed = walkPaths[walkHopKey(a, b)];
      if (detailed) walks.push(line(detailed.path, { faint: !emphasised, label: escapeHtml(t.planner.walkLeg(detailed.meters, detailed.minutes)) }));
      else guesses.push(line([a, b], { faint: !emphasised }));
      return detailed ? detailed.path : [a, b];
    };
    const pin = (at: [number, number], color: string, label: string, tooltip: string, emphasised: boolean) => {
      const el = pinElement(color, label);
      el.addEventListener('mouseenter', () => hover.show([at[1], at[0]], escapeHtml(tooltip)));
      el.addEventListener('mouseleave', () => hover.leave());
      markers.push(new Marker({ element: el, opacity: String(emphasised ? 1 : FAINT) }).setLngLat([at[1], at[0]]));
    };

    // Walking legs join the previous point to the next known one: origin -> first stop, last stop -> destination.
    let previous: [number, number] | null = origin ? [origin.lat, origin.lng] : null;
    if (origin) {
      const firstLeg = segments.findIndex((seg) => seg.type === 'bus');
      const emphasised = firstLeg === -1 ? finalWalkIsFocused : walkIntoIsFocused(firstLeg);
      pin([origin.lat, origin.lng], colors.originPin, 'A', origin.name, emphasised);
      if (emphasised) extend([[origin.lat, origin.lng]]);
    }

    segments.forEach((segment, index) => {
      if (segment.type !== 'bus' || !segment.line || !segment.fromStop || !segment.toStop) return;
      const emphasised = legIsFocused(index);
      const direction = segment.line.directions.find((d) => d.id === segment.directionId) || segment.line.directions[0];
      const from = direction.stops.indexOf(segment.fromStop.id);
      const to = direction.stops.indexOf(segment.toStop.id);
      const start = direction.stopPathIndex?.[from];
      const end = direction.stopPathIndex?.[to];
      const slice: [number, number][] =
        start !== undefined && end !== undefined && end > start
          ? direction.pathCoordinates.slice(start, end + 1)
          : [
              [segment.fromStop.lat, segment.fromStop.lng],
              [segment.toStop.lat, segment.toStop.lng],
            ];

      if (previous) {
        const walkEmphasised = walkIntoIsFocused(index);
        const path = walk(previous, [segment.fromStop.lat, segment.fromStop.lng], walkEmphasised);
        if (walkEmphasised && focused) extend(path);
      }

      legs.push(
        line(slice, {
          faint: !emphasised,
          color: segment.line.color,
          width: emphasised ? DRAW.trip.legNow : DRAW.trip.leg,
          label: escapeHtml(t.planner.lineWithStops(segment.line.number, segment.stopsCount ?? 0)),
        }),
      );
      pin(slice[0], segment.line.color, segment.line.number.slice(0, 3), `${t.planner.board} ${segment.fromStop.name}`, emphasised);

      // Where the ride calls, as the neutral stop dot every map uses: a dot in the line's colour on a line of that colour is a bump, not a stop.
      for (let i = from + 1; i < to && emphasised; i++) {
        const stop = stopById(direction.stops[i]);
        if (stop) calls.push({ type: 'Feature', properties: { label: escapeHtml(stop.name) }, geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] } });
      }

      if (emphasised) extend(slice);
      previous = [segment.toStop.lat, segment.toStop.lng];
    });

    if (destination) {
      const end: [number, number] = [destination.lat, destination.lng];
      if (previous) {
        const path = walk(previous, end, finalWalkIsFocused);
        if (finalWalkIsFocused) extend(path);
      }
      pin(end, colors.destinationPin, 'B', destination.name, finalWalkIsFocused);
      if (finalWalkIsFocused) extend([end]);
    }

    const opacity = (full: number): ExpressionSpecification => ['case', ['boolean', ['get', 'faint'], false], FAINT, full];
    setSource(map, 'app-walks', collection(walks));
    placeLayer(map, {
      id: 'app-walks',
      type: 'line',
      source: 'app-walks',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': colors.walkRouted, 'line-width': DRAW.trip.walk, 'line-opacity': opacity(DRAW.trip.walkOpacity), 'line-dasharray': [...DRAW.trip.walkDots] },
    });
    setSource(map, 'app-walks-guess', collection(guesses));
    placeLayer(map, {
      id: 'app-walks-guess',
      type: 'line',
      source: 'app-walks-guess',
      paint: { 'line-color': colors.walkStraight, 'line-width': DRAW.trip.walkGuess, 'line-opacity': opacity(DRAW.trip.walkGuessOpacity), 'line-dasharray': [...DRAW.trip.walkGuessDashes] },
    });
    setSource(map, 'app-legs', collection(legs));
    placeLayer(map, {
      id: 'app-legs',
      type: 'line',
      source: 'app-legs',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-opacity': opacity(DRAW.trip.legOpacity) },
    });
    setSource(map, 'app-calls', collection(calls));
    placeLayer(map, {
      id: 'app-calls',
      type: 'circle',
      source: 'app-calls',
      paint: stopDotPaint(colors, DRAW.stopRadius.overview),
    });
    for (const marker of markers) marker.addTo(map);

    // The routed walks, the legs and the calls name themselves under a mouse, as the pins do.
    const label = (e: MapLayerMouseEvent) => {
      const text = e.features?.[0]?.properties?.label;
      if (typeof text === 'string') hover.show(e.lngLat, text);
    };
    const leave = () => hover.leave();
    for (const id of ['app-walks', 'app-legs', 'app-calls']) {
      map.on('mousemove', id, label);
      map.on('mouseleave', id, leave);
    }

    if (!bounds.isEmpty()) {
      shownRef.current = bounds;
      map.fitBounds(bounds, FIT);
    }
    return () => {
      for (const id of ['app-walks', 'app-legs', 'app-calls']) {
        map.off('mousemove', id, label);
        map.off('mouseleave', id, leave);
      }
      hover.remove();
      for (const marker of markers) marker.remove();
      dropLayers(map, LAYERS, LAYERS);
    };
  }, [map, styled, geometryReady, plan, walkPaths, origin?.lat, origin?.lng, destination?.lat, destination?.lng, colors, focusSegment, t]);

  // The reader, on its own marks so a fix every few seconds moves a dot instead of redrawing
  // the trip, and kept in view with the smallest pan rather than a recentre on every fix.
  const readerRef = useRef<ReaderMark | null>(null);
  useEffect(() => {
    if (!map || !styled) return;
    const reader = readerMark(map, colors);
    readerRef.current = reader;
    return () => {
      reader.remove();
      readerRef.current = null;
    };
  }, [map, styled, colors]);
  useEffect(() => {
    const reader = readerRef.current;
    if (!map || !reader) return;
    if (!position) return reader.hide();
    reader.place([position.lat, position.lng], 0);
    // Leaflet's panInside: the least move that brings the dot inside the margin.
    const p = map.project([position.lng, position.lat]);
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    const pad = DRAW.fit.follow;
    const dx = p.x < pad ? p.x - pad : p.x > w - pad ? p.x - (w - pad) : 0;
    const dy = p.y < pad ? p.y - pad : p.y > h - pad ? p.y - (h - pad) : 0;
    if (dx || dy) map.panBy([dx, dy]);
  }, [map, styled, colors, position?.lat, position?.lng]);

  if (unavailable) return <MapUnavailable className={className} />;
  return <div ref={containerRef} className={className} />;
}
