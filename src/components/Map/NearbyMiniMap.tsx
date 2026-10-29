import { useEffect, useRef } from 'react';
import { LngLatBounds, Marker } from 'maplibre-gl';
import { escapeHtml } from '../../utils/html';
import { useT } from '../../i18n';
import { BusStop } from '../../types';
import { useIsDark } from '../../hooks/useIsDark';
import { useMapLibre } from '../../hooks/useMapLibre';
import { fetchWalkingPath } from '../../services/walkingPath';
import { DRAW, mapColors, stopDotPaint } from './palette';
import { readerMark } from './reader';
import { stopNamesLayer } from './StopNames';
import { claim, dropLayers, hoverLabels, placeLayer, setSource, type ClaimedEvent } from './mapLayers';
import { MapUnavailable } from './MapUnavailable';

export interface NearbyMiniMapProps {
  /** What the map is about: the reader as the browser reported it, or the pole itself — a different claim, drawn as a different thing. */
  centre: { lat: number; lng: number; label: string; kind: 'user' | 'stop'; accuracy?: number };
  /** Nearest first: each is drawn with its place in this order, the number its row in the list carries. */
  stops: (BusStop & { walkMeters: number })[];
  onSelectStop: (stop: BusStop) => void;
  /** What this map is, for a reader who will never see it. */
  regionLabel: string;
}

/** A stop's place by distance, its disc inside a box a finger can hit (.map-rank). */
const rankElement = (n: number) => {
  const el = document.createElement('div');
  el.className = 'map-rank';
  el.innerHTML = `<span class="stop-rank" aria-hidden="true">${n}</span>`;
  return el;
};

/**
 * The few stops around you, drawn: "which of these five is the one across the road?" is a
 * question a list cannot answer. Deliberately not the map — no filters, no vehicles, north up.
 * On a phone it has to answer without a pointer: each stop is its number in the list, its name
 * is written beside it, the reader carries the circle of the fix and the way the phone faces,
 * and a walk is drawn to the nearest stop.
 */
export function NearbyMiniMap({ centre, stops, onSelectStop, regionLabel }: NearbyMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const colors = mapColors(useIsDark());
  const t = useT();
  const { label, kind, accuracy = 0 } = centre;
  const { map, styled, unavailable } = useMapLibre(containerRef, { center: [centre.lat, centre.lng], zoom: 15, scrollZoom: false, region: regionLabel });
  /** The map already framed once: its first picture is drawn in place, and every one after it travelled to. */
  const framed = useRef<typeof map>(null);

  useEffect(() => {
    if (!map || !styled) return;
    const at: [number, number] = [centre.lat, centre.lng];
    const hover = hoverLabels(map);
    const markers: Marker[] = [];
    const reader = kind === 'user' ? readerMark(map, colors) : null;
    if (reader) reader.place(at, accuracy);
    else {
      // The pole itself: the ring of the stop chosen, as on every map.
      setSource(map, 'app-stop-centre', { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [at[1], at[0]] } });
      placeLayer(map, {
        id: 'app-stop-centre',
        type: 'circle',
        source: 'app-stop-centre',
        paint: { ...stopDotPaint(colors, DRAW.stopRadius.centre, true), 'circle-opacity': DRAW.centreFill },
      });
    }
    const bounds = new LngLatBounds([at[1], at[0]], [at[1], at[0]]);
    stops.forEach((stop, i) => {
      bounds.extend([stop.lng, stop.lat]);
      const el = rankElement(i + 1);
      // Not a Tab stop: the list beside the map holds the same stops in the same order, named.
      el.addEventListener('click', (e) => {
        // Once per tap: a name that took it already opened its stop.
        if ((e as ClaimedEvent)._nameClaimed) return;
        claim(e);
        onSelectRef.current(stop);
      });
      el.addEventListener('mouseenter', () => hover.show([stop.lng, stop.lat], `${escapeHtml(stop.name)} · ${escapeHtml(t.common.walkDistance(stop.walkMeters))}`));
      el.addEventListener('mouseleave', () => hover.leave());
      // Where two touch, the nearer is drawn over the farther, by its stacking and not by being
      // added last: added in reverse, the page read the numbers 5 4 3 2 1 beside a list of 1 to 5.
      el.style.zIndex = String(stops.length - i);
      markers.push(new Marker({ element: el }).setLngLat([stop.lng, stop.lat]).addTo(map));
    });
    const names = stopNamesLayer(map, { ink: colors.nameInk, halo: colors.nameHalo, radius: DRAW.stopRadius.rank, onTap: (stop) => onSelectRef.current(stop) });
    // No name over the point the map is about, the reader or the pole.
    names.setStops(stops, [at]);
    const room = DRAW.fit.nearby;
    // Another stop is travelled to, not cut to: on a computer the board stays put while its map
    // jumped half a kilometre and most of a zoom step in one frame. A straight glide, the
    // network map's own: the arc of a flight took up to a second over a few streets. The
    // renderer keeps it still for a reader who asked for less motion. The names wait for it to
    // land, asked first because a still move lands within the call; not on the reader's own
    // map, which moves a little with every fix and would blink.
    const travels = framed.current === map && stops.length > 0;
    if (travels && !reader) names.holdWhileMoving();
    if (stops.length) map.fitBounds(bounds, { padding: { top: room, bottom: room + DRAW.fit.credit, left: room, right: room + DRAW.fit.zoomBar }, maxZoom: 16, linear: true, ...(travels ? {} : { duration: 0 }) });
    framed.current = map;

    // The way to the nearest stop on the pavement, routed on the device: which side of the
    // street it is on, and where to cross. Nothing is drawn where there is no pedestrian route.
    const controller = new AbortController();
    const nearest = stops[0];
    if (reader && nearest) {
      fetchWalkingPath(at, [nearest.lat, nearest.lng], controller.signal)
        .then((walk) => {
          if (!walk || controller.signal.aborted) return;
          setSource(map, 'app-walks', { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: walk.path.map(([lat, lng]) => [lng, lat]) } });
          placeLayer(map, {
            id: 'app-walks',
            type: 'line',
            source: 'app-walks',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': colors.walkRouted, 'line-width': DRAW.trip.walk, 'line-opacity': DRAW.trip.walkOpacity, 'line-dasharray': [...DRAW.trip.walkDots] },
          });
        })
        .catch(() => {}); // aborted: the map moved on
    }
    return () => {
      controller.abort();
      hover.remove();
      for (const marker of markers) marker.remove();
      names.remove();
      reader?.remove();
      dropLayers(map, ['app-stop-centre', 'app-walks'], ['app-stop-centre', 'app-walks']);
    };
  }, [map, styled, centre.lat, centre.lng, label, kind, accuracy, stops, colors, t]);

  if (unavailable) return <MapUnavailable className="h-map-card" />;
  return <div ref={containerRef} className="h-map-card w-full" />;
}
