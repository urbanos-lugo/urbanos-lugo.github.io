import { useEffect, useRef } from 'react';
import L from 'leaflet';
import { escapeHtml } from '../../utils/html';
import { useT } from '../../i18n';
import { BusStop } from '../../types';
import { useIsDark } from '../../hooks/useIsDark';
import { useLeafletMap } from '../../hooks/useLeafletMap';
import { fetchWalkingPath } from '../../services/walkingPath';
import { DRAW, mapColors, stopDotStyle } from './palette';
import { readerMark } from './reader';
import { stopNamesLayer } from './StopNames';

export interface NearbyMiniMapProps {
  /** What the map is about: the reader as the browser reported it, or the pole itself — a different claim, drawn as a different thing. */
  centre: { lat: number; lng: number; label: string; kind: 'user' | 'stop'; accuracy?: number };
  /** Nearest first: each is drawn with its place in this order, the number its row in the list carries. */
  stops: (BusStop & { walkMeters: number })[];
  onSelectStop: (stop: BusStop) => void;
  /** What this map is, for a reader who will never see it. */
  regionLabel: string;
}

const rankIcon = (n: number) =>
  L.divIcon({
    className: 'map-rank',
    iconSize: [DRAW.icon.rank, DRAW.icon.rank],
    iconAnchor: [DRAW.icon.rank / 2, DRAW.icon.rank / 2],
    html: `<span class="stop-rank" aria-hidden="true">${n}</span>`,
  });

/**
 * The few stops around you, drawn: "which of these five is the one across the road?" is a
 * question a list cannot answer. Deliberately not the map — no filters, no vehicles.
 * On a phone it had to answer without a pointer: the stops were five grey dots alike, their
 * names only in labels a mouse opens, and nothing said which dot was which row below. Each
 * stop is now its number in the list, its name is written beside it, the reader carries the
 * circle of the fix and the way the phone faces, and a walk is drawn to the nearest stop.
 */
export function NearbyMiniMap({ centre, stops, onSelectStop, regionLabel }: NearbyMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onSelectRef = useRef(onSelectStop);
  onSelectRef.current = onSelectStop;
  const colors = mapColors(useIsDark());
  const t = useT();
  const { label, kind, accuracy = 0 } = centre;
  const map = useLeafletMap(containerRef, { center: [centre.lat, centre.lng], zoom: 16, scrollWheelZoom: false, region: regionLabel });

  useEffect(() => {
    if (!map) return;
    const at: [number, number] = [centre.lat, centre.lng];
    const group = L.layerGroup().addTo(map);
    const reader = kind === 'user' ? readerMark(map, colors) : null;
    if (reader) reader.place(at, accuracy);
    else group.addLayer(L.circleMarker(at, { ...stopDotStyle(colors, DRAW.stopRadius.centre, true), radius: DRAW.stopRadius.centre, fillOpacity: DRAW.centreFill }).bindTooltip(escapeHtml(label), { direction: 'top', offset: [0, DRAW.tooltip.lift] }));
    const bounds = L.latLngBounds([at]);
    stops.forEach((stop, i) => {
      bounds.extend([stop.lat, stop.lng]);
      // Not a Tab stop: the list beside the map holds the same stops in the same order, named.
      // Where two touch, the nearer is drawn over the farther.
      const marker = L.marker([stop.lat, stop.lng], { icon: rankIcon(i + 1), keyboard: false, zIndexOffset: (stops.length - i) * DRAW.rankOver }).bindTooltip(`${escapeHtml(stop.name)} · ${escapeHtml(t.common.walkDistance(stop.walkMeters))}`, { direction: 'top', offset: [0, DRAW.tooltip.lift] });
      marker.on('click', () => onSelectRef.current(stop));
      group.addLayer(marker);
    });
    const names = stopNamesLayer({ ink: colors.nameInk, halo: colors.nameHalo, radius: DRAW.stopRadius.rank }).addTo(map);
    // No name over the point the map is about, the reader or the pole.
    names.setStops(stops, [at]);
    if (stops.length) map.fitBounds(bounds, { padding: [DRAW.fit.nearby, DRAW.fit.nearby], maxZoom: 17 });

    // The way to the nearest stop on the pavement, routed on the device: which side of the
    // street it is on, and where to cross. Nothing is drawn where there is no pedestrian route.
    const controller = new AbortController();
    const nearest = stops[0];
    if (reader && nearest) {
      fetchWalkingPath(at, [nearest.lat, nearest.lng], controller.signal)
        .then((walk) => {
          if (walk && !controller.signal.aborted) group.addLayer(L.polyline(walk.path, { color: colors.walkRouted, weight: DRAW.trip.walk, dashArray: DRAW.trip.walkDash, opacity: DRAW.trip.walkOpacity, interactive: false }));
        })
        .catch(() => {}); // aborted: the map moved on
    }
    return () => {
      controller.abort();
      group.remove();
      names.remove();
      reader?.remove();
    };
  }, [map, centre.lat, centre.lng, label, kind, accuracy, stops, colors, t]);

  return <div ref={containerRef} className="h-map-card w-full" />;
}
