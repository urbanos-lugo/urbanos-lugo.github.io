import { useEffect, useRef } from 'react';
import type { ExpressionSpecification, LineLayerSpecification, Map as MapLibre, MapLayerMouseEvent, MapMouseEvent, MapStyleImageMissingEvent } from 'maplibre-gl';
import { translations, useLang } from '../../i18n';
import { escapeHtml } from '../../utils/html';
import { directionLabel } from '../../utils/serviceLabels';
import { BusDirection, BusLine } from '../../types';
import { DRAW } from './palette';
import { claim, dropLayers, hoverLabels, isClaimed, placeLayer, setSource } from './mapLayers';
import type { RouteHit } from './LinesHereSheet';

interface RouteLayerProps {
  map: MapLibre | null;
  /** useMapLibre's count of styles loaded: the layer is drawn again on each. */
  styled: number;
  lines: BusLine[];
  /** Lines to draw; null means every line. */
  visibleLineIds: string[] | null;
  /** The lines lifted out of the network, painted in full over the rest kept faint. */
  emphasisLineIds?: string[];
  showRoutes: boolean;
  /** The routes under a tap, nearest first, and where the tap was ([lat, lng]): the map opens its sheet of them. */
  onLinesHere: (hits: RouteHit[], at: [number, number]) => void;
}

/** How close a click has to land, in screen pixels, to count as hitting a route. Nobody aims at 3.5 px. */
const HIT_PX = 20;
/** The rings a tap is asked about, inside out: a route found in a smaller one is nearer the finger. */
const HIT_RINGS = [4, 8, 12, 16, HIT_PX];

/**
 * The lane, in screen pixels, from each zoom on. Lugo's lines converge on the same corridors,
 * so routes that share a street are drawn side by side. Pixels and not metres: metres vanish
 * at zoom 13 and turn a roundabout inside out at 17. Nothing below 14, where the tap on a
 * corridor lists everything that runs there.
 */
const LANE_PX: [number, number][] = [
  [14, 2],
  [15, 3],
];
/** Lanes a side before they are reused: twelve pixels a side, still narrower than the road. */
const LANES = 4;
/** The lane width the line being looked at gets whatever the zoom, so its ida and volta stay apart. */
const SUBJECT_LANE_PX = 6;

/** Direction arrows every so many screen pixels, so the density is the same at every zoom. */
const ARROW_EVERY_PX = 120;
/** Below this the city fits on the screen and chevrons would be texture. */
const ARROW_MIN_ZOOM = 13;
/** With several lines up their lanes overlap until here, and an arrow on the wrong ribbon is worse than none. */
const ARROW_MIN_ZOOM_SHARED = 16;
const ARROW_IMAGE = 'route-arrow-';

const LAYERS = ['app-routes', 'app-routes-volta', 'app-route-arrows'];
const TRACES = ['app-routes', 'app-routes-volta'];

/**
 * A route's shift to the right of travel (buses keep right, and the two directions land on
 * their own kerbs): half a lane out from the kerb, then whole lanes, drawn by the renderer at
 * every frame. Leaflet's version moved every vertex in JavaScript at each zoom step.
 */
const atLane = (lanePx: number): ExpressionSpecification => ['*', ['get', 'half'], ['case', ['boolean', ['get', 'subject'], false], SUBJECT_LANE_PX, lanePx]];
const LANE_OFFSET: ExpressionSpecification = ['step', ['zoom'], atLane(0), ...LANE_PX.flatMap(([zoom, px]) => [zoom, atLane(px)])] as ExpressionSpecification;
/** The arrows ride the subject's lane, which is the same at every zoom: offset sideways in the arrow's own frame. */
const ARROW_OFFSET = ['match', ['get', 'lane'], ...Array.from({ length: LANES - 1 }, (_, lane) => [lane, ['literal', [0, (lane + 0.5) * SUBJECT_LANE_PX]]]).flat(), ['literal', [0, (LANES - 0.5) * SUBJECT_LANE_PX]]] as unknown as ExpressionSpecification;
/** The volta's dashes, the same length in pixels whatever the width (the renderer counts in widths). */
const dashesAt = (width: number) => ['literal', DRAW.route.returnDashPx.map((px) => px / width)];
const VOLTA_DASHES = ['match', ['get', 'weight'], DRAW.route.muted, dashesAt(DRAW.route.muted), DRAW.route.subject, dashesAt(DRAW.route.subject), dashesAt(DRAW.route.network)] as unknown as ExpressionSpecification;

/** An open chevron in the line's own stroke, its point on the centreline, drawn the first time the map asks for that colour. */
function addArrowImage(map: MapLibre, id: string): void {
  const size = DRAW.icon.arrow;
  const dpr = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.ceil(size * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.translate(size / 2, size / 2);
  ctx.strokeStyle = id.slice(ARROW_IMAGE.length);
  ctx.lineWidth = DRAW.route.subject;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-4, -6);
  ctx.lineTo(3, 0);
  ctx.lineTo(-4, 6);
  ctx.stroke();
  map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: dpr });
}

/** No line lifted out: one array, so a parent that passes none does not hand a new one each render. */
const NONE: string[] = [];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function RouteLayer({ map, styled, lines, visibleLineIds, emphasisLineIds = NONE, showRoutes, onLinesHere }: RouteLayerProps) {
  const lang = useLang();
  // Held in a ref so a fresh arrow from the parent does not redraw the map on every tick.
  const onLinesHereRef = useRef(onLinesHere);
  onLinesHereRef.current = onLinesHere;
  /** The traces drawn now, by key, for the tap that asks which they are. */
  const tracedRef = useRef(new Map<string, RouteHit>());

  // The layers, once per style. What they draw is the source's data, set below: a new filter
  // or a new pick changes the data, and the renderer keeps drawing the old tiles until the new
  // ones are ready. Taken down and put up again, the routes blinked out at every change.
  useEffect(() => {
    if (!map || !styled) return;
    setSource(map, 'app-routes', EMPTY);
    const paint: LineLayerSpecification['paint'] = { 'line-color': ['get', 'color'], 'line-width': ['get', 'weight'], 'line-opacity': ['get', 'opacity'], 'line-offset': LANE_OFFSET };
    const layout: LineLayerSpecification['layout'] = { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['get', 'order'] };
    placeLayer(map, { id: 'app-routes', type: 'line', source: 'app-routes', filter: ['!', ['boolean', ['get', 'volta'], false]], layout: { ...layout }, paint: { ...paint } });
    placeLayer(map, { id: 'app-routes-volta', type: 'line', source: 'app-routes', filter: ['boolean', ['get', 'volta'], false], layout: { ...layout }, paint: { ...paint, 'line-dasharray': VOLTA_DASHES } });
    // Which way the bus goes, on the subject only: its two directions, each on its own lane.
    // Under the stops (LAYER_ORDER), so a dot is never half hidden under an arrow.
    placeLayer(map, {
      id: 'app-route-arrows',
      type: 'symbol',
      source: 'app-routes',
      filter: ['boolean', ['get', 'subject'], false],
      minzoom: ARROW_MIN_ZOOM,
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': ARROW_EVERY_PX,
        'icon-image': ['concat', ARROW_IMAGE, ['get', 'color']],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-offset': ARROW_OFFSET,
      },
    });
    const missing = (e: MapStyleImageMissingEvent) => {
      if (e.id.startsWith(ARROW_IMAGE) && !map.hasImage(e.id)) addArrowImage(map, e.id);
    };
    map.on('styleimagemissing', missing);

    // A mouse is told the line and the direction under it.
    const hover = hoverLabels(map);
    const label = (e: MapLayerMouseEvent) => {
      const text = e.features?.[0]?.properties.label;
      if (typeof text === 'string') hover.show(e.lngLat, text);
    };
    const leave = () => hover.leave();
    for (const id of TRACES) {
      map.on('mousemove', id, label);
      map.on('mouseleave', id, leave);
    }

    // The only place a route tap is answered: after every other listener has heard the click,
    // a stop's or a name's included, so a tap one of them took is not answered twice. The
    // renderer is asked what is drawn under the finger, lanes and all, ring by ring outward.
    const openLinesHere = (e: MapMouseEvent) =>
      queueMicrotask(() => {
        if (isClaimed(e)) return;
        const { x, y } = e.point;
        const hits = new Map<string, RouteHit>();
        for (const r of HIT_RINGS) {
          for (const feature of map.queryRenderedFeatures([[x - r, y - r], [x + r, y + r]], { layers: TRACES })) {
            const key = String(feature.properties.key);
            const hit = tracedRef.current.get(key);
            if (hit && !hits.has(key)) hits.set(key, hit);
          }
        }
        if (!hits.size) return;
        // Claimed like a stop's tap: the map does not slide away from the finger under the sheet it opens.
        claim(e);
        onLinesHereRef.current([...hits.values()], [e.lngLat.lat, e.lngLat.lng]);
      });
    map.on('click', openLinesHere);

    return () => {
      map.off('click', openLinesHere);
      map.off('styleimagemissing', missing);
      for (const id of TRACES) {
        map.off('mousemove', id, label);
        map.off('mouseleave', id, leave);
      }
      hover.remove();
      dropLayers(map, LAYERS, ['app-routes']);
    };
  }, [map, styled]);

  // What the layers draw: the lines in scope, the ones picked over the rest, each on its lane.
  useEffect(() => {
    if (!map || !styled) return;
    const inScope = !showRoutes ? [] : visibleLineIds === null ? lines : lines.filter((l) => visibleLineIds.includes(l.id));
    const emphasised = inScope.filter((l) => emphasisLineIds.includes(l.id));
    const singleLine = inScope.length === 1;

    // A fixed lane per line. The subjects take the kerb lanes in the order chosen; the backdrop
    // is dealt the lanes behind them by list position, so choosing a line does not reshuffle the others.
    const subjects = lines.filter((line) => inScope.includes(line) && (emphasisLineIds.includes(line.id) || singleLine));
    const laneOf = (line: BusLine) => {
      const s = subjects.indexOf(line);
      if (s >= 0) return Math.min(s, LANES - 1);
      const i = lines.indexOf(line);
      return subjects.length ? 1 + (i % (LANES - 1)) : i % LANES;
    };

    const t = translations(lang);
    const traced = new Map<string, RouteHit>();
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    for (const line of inScope) {
      const isEmphasised = emphasisLineIds.includes(line.id);
      const muted = emphasised.length > 0 && !isEmphasised;
      const subject = isEmphasised || singleLine;
      const lane = laneOf(line);
      line.directions.forEach((dir: BusDirection, dirIndex) => {
        if (!dir.pathCoordinates || dir.pathCoordinates.length < 2) return;
        const key = `${line.id}/${dirIndex}`;
        traced.set(key, { line, dir });
        features.push({
          type: 'Feature',
          properties: {
            key,
            color: line.color,
            weight: muted ? DRAW.route.muted : subject ? DRAW.route.subject : DRAW.route.network,
            opacity: muted ? DRAW.route.mutedOpacity : subject ? DRAW.route.subjectOpacity : DRAW.route.networkOpacity,
            volta: dirIndex === 1,
            subject,
            lane,
            half: lane + 0.5,
            // Emphasised over the network rather than under it.
            order: isEmphasised ? 1 : 0,
            label: `<div class="font-sans text-label"><b>${escapeHtml(t.lines.lineLabel(line.number))}</b><br/>${escapeHtml(directionLabel(dir, lang))}</div>`,
          },
          geometry: { type: 'LineString', coordinates: dir.pathCoordinates.map(([lat, lng]) => [lng, lat]) },
        });
      });
    }
    tracedRef.current = traced;
    setSource(map, 'app-routes', { type: 'FeatureCollection', features });
    map.setLayerZoomRange('app-route-arrows', subjects.length > 1 ? ARROW_MIN_ZOOM_SHARED : ARROW_MIN_ZOOM, 24);
  }, [map, styled, lines, visibleLineIds, emphasisLineIds, showRoutes, lang]);

  return null;
}
