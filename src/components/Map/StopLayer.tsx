import { useEffect, useRef, useState } from 'react';
import { MercatorCoordinate, type Map as MapLibre, type MapLayerMouseEvent, type MapMouseEvent } from 'maplibre-gl';
import { useMapZoom } from '../../hooks/useMapLibre';
import { escapeHtml } from '../../utils/html';
import { BusStop } from '../../types';
import { poleCode } from '../../data/transitData';
import { useIsDark } from '../../hooks/useIsDark';
import { DRAW, mapColors, stopDotPaint } from './palette';
import { stopNamesLayer, type StopNames } from './StopNames';
import { claim, dropLayers, fingerReach, hoverLabels, isClaimed, placeLayer, setSource } from './mapLayers';

interface StopLayerProps {
  map: MapLibre | null;
  /** useMapLibre's count of styles loaded: the layer is drawn again on each. */
  styled: number;
  stops: BusStop[];
  /** Lines to draw; null means every line. */
  visibleLineIds: string[] | null;
  selectedStop?: BusStop;
  showStops: boolean;
  /** A stop was tapped. The board for it rises over the map; this layer only reports it. */
  onTapStop: (stop: BusStop) => void;
}

/**
 * How big a dot is drawn at each zoom, and from where the names are written beside them
 * (a phone has no hover, so without that no stop ever told you its name). MapLibre's zooms:
 * one less than the Leaflet ones that showed the same streets.
 */
const ZOOM_LADDER: { from: number; radius: number; label: boolean }[] = [
  { from: 15, radius: DRAW.stopRadius.z16, label: true },
  { from: 14, radius: DRAW.stopRadius.z15, label: false },
  { from: 13, radius: DRAW.stopRadius.z14, label: false },
  { from: 0, radius: DRAW.stopRadius.overview, label: false },
];
const rungFor = (zoom: number) => ZOOM_LADDER.find((r) => zoom >= r.from) ?? ZOOM_LADDER[ZOOM_LADDER.length - 1];

/** The room a stop keeps around itself in the overview, centre to centre, in pixels at the rung's zoom. */
const SPREAD_PX = 24;
/** MapLibre's world at zoom 0, in pixels. */
const WORLD_PX = 512;
const LAYERS = ['app-stops', 'app-stop-selected'];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const selectedFilter = (id: string | undefined) => ['==', ['get', 'id'], id ?? ''] as ['==', ['get', string], string];

/**
 * The stops, as one circle layer of one source, made once per style: what changes after that
 * is the data, the dots' radius and the filter of the second layer, which draws the stop chosen
 * over the rest. Taken down and put up again for each change, the stops blinked out every time
 * the clock moved the buses. The rung, not the zoom, is what the data follows: four thresholds
 * instead of every notch.
 */
export function StopLayer({ map, styled, stops, visibleLineIds, selectedStop, showStops, onTapStop }: StopLayerProps) {
  const colors = mapColors(useIsDark());
  // Refs so a fresh arrow or a new selection does not rebuild the layer.
  const onTapStopRef = useRef(onTapStop);
  onTapStopRef.current = onTapStop;
  const selectedIdRef = useRef(selectedStop?.id);
  selectedIdRef.current = selectedStop?.id;
  /** The stops drawn now, by id: a selection outside them asks for a rebuild. */
  const drawnRef = useRef<Map<string, BusStop>>(new Map());
  const namesRef = useRef<StopNames | null>(null);

  const rung = rungFor(useMapZoom(map));
  const rungRef = useRef(rung);
  rungRef.current = rung;
  /** Bumped when a stop selected at a thinning zoom has no dot yet. */
  const [thinnedIn, setThinnedIn] = useState(0);

  // The layers and what they answer, once per style.
  useEffect(() => {
    if (!map || !styled) return;
    setSource(map, 'app-stops', EMPTY);
    placeLayer(map, { id: 'app-stops', type: 'circle', source: 'app-stops', paint: stopDotPaint(colors, rungRef.current.radius) });
    placeLayer(map, { id: 'app-stop-selected', type: 'circle', source: 'app-stops', filter: selectedFilter(selectedIdRef.current), paint: stopDotPaint(colors, DRAW.stopRadius.selected, true) });

    // The stop nearest the finger, within its reach past the dot's edge: two dots' reaches
    // overlap, and the one drawn last is not necessarily the one meant.
    const onClick = (e: MapMouseEvent) => {
      // A name tapped is the stop it names, even within a finger's reach of another dot; a bus tapped is the bus. Either took the tap already.
      if (isClaimed(e)) return;
      const reach = DRAW.stopRadius.selected + fingerReach();
      const { x, y } = e.point;
      let nearest: { stop: BusStop; d: number } | null = null;
      for (const feature of map.queryRenderedFeatures([[x - reach, y - reach], [x + reach, y + reach]], { layers: LAYERS })) {
        const stop = drawnRef.current.get(String(feature.properties.id));
        if (!stop) continue;
        const p = map.project([stop.lng, stop.lat]);
        const d = Math.hypot(p.x - x, p.y - y);
        const radius = stop.id === selectedIdRef.current ? DRAW.stopRadius.selected : rungRef.current.radius;
        if (d <= radius + fingerReach() + DRAW.stopRing && (!nearest || d < nearest.d)) nearest = { stop, d };
      }
      if (!nearest) return;
      // Claimed: the route layer and the pan read it, and neither answers this tap.
      claim(e);
      onTapStopRef.current(nearest.stop);
    };
    map.on('click', onClick);

    // A mouse is told the stop's code and name.
    const hover = hoverLabels(map);
    const label = (e: MapLayerMouseEvent) => {
      const stop = drawnRef.current.get(String(e.features?.[0]?.properties.id));
      if (!stop) return;
      const code = poleCode(stop);
      map.getCanvas().style.cursor = 'pointer';
      hover.show(
        [stop.lng, stop.lat],
        `<div class="font-sans text-label font-semibold text-ink">${code ? `<span class="mr-1 text-accent">${escapeHtml(code)}</span>` : ''}${escapeHtml(stop.name)}</div>`,
        rungRef.current.radius - DRAW.tooltip.lift,
      );
    };
    const leave = () => {
      map.getCanvas().style.cursor = '';
      hover.leave();
    };
    for (const id of LAYERS) {
      map.on('mousemove', id, label);
      map.on('mouseleave', id, leave);
    }

    return () => {
      map.off('click', onClick);
      for (const id of LAYERS) {
        map.off('mousemove', id, label);
        map.off('mouseleave', id, leave);
      }
      hover.remove();
      dropLayers(map, LAYERS, ['app-stops']);
    };
  }, [map, styled, colors]);

  // The names, from the rung that writes them; a canvas of their own, made when that rung is reached.
  useEffect(() => {
    if (!map || !styled || !rung.label) return;
    const names = stopNamesLayer(map, { ink: colors.nameInk, halo: colors.nameHalo, radius: rung.radius, onTap: (stop) => onTapStopRef.current(stop) });
    names.setStops([...drawnRef.current.values()]);
    namesRef.current = names;
    return () => {
      names.remove();
      namesRef.current = null;
    };
  }, [map, styled, rung.label, rung.radius, colors]);

  // What is drawn: the stops on the lines in view, thinned in the overview.
  useEffect(() => {
    if (!map || !styled) return;
    const onLine = !showStops ? [] : visibleLineIds === null ? stops : stops.filter((s) => s.lines.some((l) => visibleLineIds.includes(l)));
    // A filtered set is sparse enough to show whole. The overview keeps the stops that fit:
    // most-served first, each kept if no kept stop is within SPREAD_PX of it at the rung's own
    // zoom, so the set does not churn as you pinch inside a rung.
    let visible = onLine;
    if (visibleLineIds === null && !rung.label) {
      const scale = WORLD_PX * 2 ** Math.max(rung.from, 11);
      const kept: { x: number; y: number }[] = [];
      visible = [...onLine]
        .sort((a, b) => Number(b.id === selectedIdRef.current) - Number(a.id === selectedIdRef.current) || b.lines.length - a.lines.length || a.name.localeCompare(b.name))
        .filter((s) => {
          const m = MercatorCoordinate.fromLngLat([s.lng, s.lat]);
          const p = { x: m.x * scale, y: m.y * scale };
          if (kept.some((k) => Math.hypot(k.x - p.x, k.y - p.y) < SPREAD_PX)) return false;
          kept.push(p);
          return true;
        });
    }
    drawnRef.current = new Map(visible.map((stop) => [stop.id, stop]));
    setSource(map, 'app-stops', {
      type: 'FeatureCollection',
      features: visible.map((stop) => ({ type: 'Feature', properties: { id: stop.id }, geometry: { type: 'Point', coordinates: [stop.lng, stop.lat] } })),
    });
    // The rung's dot; the colours are the style's, and a new palette is a new style.
    map.setPaintProperty('app-stops', 'circle-radius', stopDotPaint(colors, rung.radius)['circle-radius']);
    namesRef.current?.setStops(visible);
    // Not the selection: it used to be here, so every tap on a stop rebuilt all 417.
  }, [map, styled, stops, visibleLineIds, showStops, rung, thinnedIn]);

  // The selection moves the second layer's filter; the rest stays as drawn.
  useEffect(() => {
    const selectedId = selectedStop?.id;
    // At a thinning zoom the selected stop is kept only when the data is made; selected afterwards, it may have no dot.
    if (selectedId && !drawnRef.current.has(selectedId) && !rung.label && showStops) {
      setThinnedIn((n) => n + 1);
      return;
    }
    if (map?.getLayer('app-stop-selected')) map.setFilter('app-stop-selected', selectedFilter(selectedId));
  }, [selectedStop?.id]);

  return null;
}
