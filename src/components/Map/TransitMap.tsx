import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LngLatBounds, type Map as MapLibre } from 'maplibre-gl';
import { LocateFixed, Navigation2, SlidersHorizontal } from 'lucide-react';
import { CloseButton, Notice, Scrim } from '../ui/controls';
import { useT } from '../../i18n';
import { BusStop, BusLine } from '../../types';
import { BUS_STOPS, BUS_LINES, LUGO_CENTER, lineById, poleCode } from '../../data/transitData';
import { getScheduledBuses } from '../../utils/vehicles';
import { getNearbyLines, NearbyLine } from '../../utils/places';
import { useIsDark } from '../../hooks/useIsDark';
import { useDialog } from '../../hooks/useDialog';
import { useMapLibre } from '../../hooks/useMapLibre';
import { useClock } from '../../hooks/useClock';
import { useRouteGeometry } from '../../data/routeGeometry';
import { DRAW, mapColors } from './palette';
import { RouteLayer } from './RouteLayer';
import { StopLayer } from './StopLayer';
import { StopSheet } from './StopSheet';
import { LinesHereSheet, type RouteHit } from './LinesHereSheet';
import { VehicleLayer } from './VehicleLayer';
import { LineChips } from './LineChips';
import { AROUND_STOP_RADIUS_M, MapControls, NEARBY_RADIUS_M, type Layer, type Preset } from './MapControls';
import { useFollowMe } from './useFollowMe';
import { MapUnavailable } from './MapUnavailable';

/**
 * How many of the nearby lines the map draws: the network converges on the muralla, so
 * from the centre 23 of the 24 lines are within 750 m and no radius can separate them. The
 * list arrives sorted by walk, so the first six are the six you could actually catch.
 */
const NEARBY_SCOPE_LIMIT = 6;

/** Whether this page load has already decided how the map opens. */
let openedOnNearby = false;

/** Each shortcut's centre is where the buses stop: HULA's own main-entrance stop, not a field near the hospital. */
const PRESET_CENTERS: Partial<Record<Preset, [number, number]>> = {
  hula: [43.01965, -7.53274],
  campus: [42.9935, -7.5538],
  ceao: [43.044, -7.5692],
};

/** MapLibre's zooms, one less than the Leaflet ones that showed the same streets: a stop and its corner, a district, the city. */
const STOP_ZOOM = 15;
const AREA_ZOOM = 14;
const CITY_ZOOM = 13;

const fitLines = (map: MapLibre, ids: string[]) => {
  const bounds = new LngLatBounds();
  for (const id of ids) for (const direction of lineById(id)?.directions ?? []) for (const [lat, lng] of direction.pathCoordinates ?? []) bounds.extend([lng, lat]);
  const room = DRAW.fit.network;
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: { top: room, left: room, bottom: room + DRAW.fit.credit, right: room + DRAW.fit.zoomBar }, maxZoom: STOP_ZOOM });
};

interface TransitMapProps {
  selectedStop?: BusStop;
  /** What the reader asked to see, so the map does not have to guess between the two. */
  focus?: 'stop' | 'line';
  selectedLine?: BusLine | null;
  onSelectStop: (stop: BusStop) => void;
  onSelectLine: (line: BusLine) => void;
  /** Leave the map for a line's own page. Selecting a line only filters the map. */
  onOpenLine: (line: BusLine) => void;
  /** False while another tab is on screen: the map stays mounted, and its clock stops. */
  visible?: boolean;
}

export function TransitMap({ selectedStop, focus = 'line', selectedLine, onSelectStop, onSelectLine, onOpenLine, visible = true }: TransitMapProps) {
  const t = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const colors = mapColors(useIsDark());
  const { map, styled, unavailable } = useMapLibre(containerRef, {
    center: selectedStop ? [selectedStop.lat, selectedStop.lng] : LUGO_CENTER,
    zoom: selectedStop ? STOP_ZOOM : CITY_ZOOM,
    region: t.map.networkRegion,
    turns: true,
  });
  // Street geometry arrives as its own chunk; until then the stop layer still works.
  const geometryReady = useRouteGeometry();

  /** The lines the reader has picked out (toggled, so two can be compared), or none for "everything in scope". */
  const [pickedLineIds, setPickedLineIds] = useState<string[]>(selectedLine ? [selectedLine.id] : []);
  const [preset, setPreset] = useState<Preset>('all');
  // The buses start hidden. Nobody publishes where this network's buses are: the ones drawn
  // are where the timetable puts them, and a moving bus on a map reads as a tracked one
  // whatever a popup says. Whoever turns them on gets the sentence on the map with them.
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ stops: true, buses: false, routes: true });
  const now = useClock(visible ? 3000 : null);
  const buses = useMemo(() => getScheduledBuses(now), [now]);
  const [nearbyLines, setNearbyLines] = useState<NearbyLine[]>([]);
  /** The stop whose neighbourhood is on show — the one whose sheet asked, not whichever screen selected one. */
  const [aroundStop, setAroundStop] = useState<BusStop | null>(null);
  /** The stop whose board is open over the map. */
  const [tappedStop, setTappedStop] = useState<BusStop | null>(null);
  /** The routes under a tap on the map, and where it was: their sheet is open. */
  const [linesHere, setLinesHere] = useState<{ hits: RouteHit[]; at: [number, number] } | null>(null);
  /** The controls pulled up over the map; only means anything below `lg`. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const sheetRef = useDialog(sheetOpen, closeSheet);

  const stopsWithQr = useMemo(() => BUS_STOPS.filter((s) => poleCode(s)).length, []);

  const drawNearbyWhenReady = useRef(false);
  const follow = useFollowMe(map, styled, colors, (lat, lng) => {
    setNearbyLines(getNearbyLines(lat, lng, NEARBY_RADIUS_M));
    setPreset('nearby');
    setPickedLineIds([]);
    // If this fix is the one the screen opened on, the lines to draw exist only now.
    if (drawNearbyWhenReady.current) {
      drawNearbyWhenReady.current = false;
      setLayers((l) => ({ ...l, routes: true }));
    }
  });

  // What the current scope is about: every line, or the set a preset narrowed to.
  const aroundStopLineIds = useMemo(
    () => (aroundStop ? [...new Set([...aroundStop.lines, ...getNearbyLines(aroundStop.lat, aroundStop.lng, AROUND_STOP_RADIUS_M).map((n) => n.line.id)])] : []),
    [aroundStop],
  );
  // No count cap for a destination, unlike "near me": nine lines really do serve the hospital.
  const presetAreaLineIds = useMemo(() => {
    const centre = PRESET_CENTERS[preset];
    return centre ? getNearbyLines(centre[0], centre[1], NEARBY_RADIUS_M).map((n) => n.line.id) : [];
  }, [preset]);
  // Kept the same array from one render to the next while the scope is the same: the clock
  // renders the map every three seconds for the buses, and a new array each time redrew every
  // route and stop with it, which on the renderer was a blink of the whole map.
  const nearbyLineIds = useMemo(() => nearbyLines.slice(0, NEARBY_SCOPE_LIMIT).map((n) => n.line.id), [nearbyLines]);
  const scopeLineIds =
    preset === 'stop' && aroundStopLineIds.length ? aroundStopLineIds
    : preset === 'nearby' && nearbyLineIds.length ? nearbyLineIds
    : presetAreaLineIds.length ? presetAreaLineIds
    : null;
  const visibleLineIds = pickedLineIds.length ? pickedLineIds : scopeLineIds;
  // The list has to agree with the map: offering all twenty-four while drawing four read as the filter doing nothing.
  const listedLines = scopeLineIds ? BUS_LINES.filter((l) => scopeLineIds.includes(l.id)) : BUS_LINES;


  // A line chosen somewhere else becomes the only one on the map; one picked here must not (onSelectLine reports every pick upward).
  useEffect(() => {
    if (focus === 'stop' || !selectedLine || pickedLineIds.includes(selectedLine.id)) return;
    setPickedLineIds([selectedLine.id]);
    setPreset('all');
    if (map) fitLines(map, [selectedLine.id]);
  }, [selectedLine, map, focus]);

  // Centre on the stop the reader asked for, and drop the line filter, or the stop arrives on somebody else's route.
  useEffect(() => {
    if (!selectedStop || !map) return;
    if (focus === 'stop') {
      setPickedLineIds([]);
      setPreset('all');
      setAroundStop(null);
    }
    map.resize();
    map.easeTo({ center: [selectedStop.lng, selectedStop.lat], zoom: STOP_ZOOM });
  }, [selectedStop, map, focus]);

  const handleSelectLine = (line: BusLine) => {
    const adding = !pickedLineIds.includes(line.id);
    const next = adding ? [...pickedLineIds, line.id] : pickedLineIds.filter((id) => id !== line.id);
    setPickedLineIds(next);
    // Only a line taken up is reported: firing on a deselect made the sync effect put it straight back.
    if (adding) onSelectLine(line);
    // Asking for a line is asking to see it, and for whatever covers the map to get out of its way.
    setLayers((l) => ({ ...l, routes: true }));
    setSheetOpen(false);
    // Frame everything picked: two lines up is a comparison.
    if (map && next.length) fitLines(map, next);
  };

  const handlePreset = (next: Preset) => {
    setPreset(next);
    setSheetOpen(false); // every one of these moves or redraws the map, which is behind the sheet
    setPickedLineIds([]);
    if (next !== 'stop') setAroundStop(null);
    const centre = PRESET_CENTERS[next];
    if (centre) map?.easeTo({ center: [centre[1], centre[0]], zoom: AREA_ZOOM });
    if (next === 'nearby' && !nearbyLines.length) follow.start();
  };

  /**
   * A line chosen from the lines under a tap: the same as choosing it from the chips, drawn over
   * the rest and framed whole, with the sheet out of the way. It stayed a popup over the map,
   * and the map stayed where it was, showing whatever part of the line was in view.
   */
  const chooseLine = (line: BusLine) => {
    setLinesHere(null);
    if (!pickedLineIds.includes(line.id)) {
      setPickedLineIds([...pickedLineIds, line.id]);
      onSelectLine(line);
    }
    setLayers((l) => ({ ...l, routes: true }));
    if (map) fitLines(map, [line.id]);
  };

  /**
   * What was tapped, moved into sight above the sheet it opened: below it, the sheet spoke of a
   * stop whose ring nobody could see. Only when it is under the sheet or the chips, and then to
   * the middle of what the sheet leaves.
   */
  const keepAbove = ([lat, lng]: [number, number], sheetPx: number) => {
    if (!map) return;
    const y = map.project([lng, lat]).y;
    const top = DRAW.fit.sheetTop;
    const bottom = Math.max(top, map.getContainer().clientHeight - sheetPx - DRAW.fit.sheetGap);
    if (y >= top && y <= bottom) return;
    // Straight up or down on the screen, whichever way the map is turned; the renderer skips the glide under reduced motion.
    map.panBy([0, y - (top + bottom) / 2]);
  };

  /** From a stop's own sheet: keep the map, drop every line that does not serve it. */
  const showLinesHere = (stop: BusStop) => {
    setAroundStop(stop);
    setPreset('stop');
    setPickedLineIds([]);
    map?.easeTo({ center: [stop.lng, stop.lat], zoom: AREA_ZOOM });
  };

  // Open on the lines near you — only for someone who has already agreed to be located,
  // since asking the instant a screen loads is the prompt everybody refuses. Once per page
  // load, not per mount: coming back after choosing a line must not throw that away. Not when
  // the map opens on a stop asked for: the first fix would take the map from it to the reader.
  useEffect(() => {
    if (openedOnNearby || selectedStop || !navigator.permissions?.query) return;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        // Claimed on success: StrictMode mounts twice, and claiming up front made the second pass bail.
        if (openedOnNearby || status.state !== 'granted') return;
        openedOnNearby = true;
        drawNearbyWhenReady.current = true;
        handlePreset('nearby');
      })
      .catch(() => {}); // Firefox once threw for an unknown descriptor
  }, []);

  const locateLabel = follow.label;
  const LocateIcon = follow.isTurning ? Navigation2 : LocateFixed;

  // No map to filter, follow or tap: the notice where it would be, and nothing over it.
  if (unavailable)
    return (
      <div className="page map-gutter h-full card:max-lg:h-auto">
        <div className="h-map-viewport w-full overflow-hidden bg-surface card:rounded-card card:border card:border-edge">
          <MapUnavailable className="h-full" />
        </div>
      </div>
    );

  return (
    // No page padding on a phone: the map is the screen there, edge to edge. On a computer the
    // screen is the window's height again and does not scroll: the map takes all of it and the
    // controls beside it scroll on their own. The page moved under the wheel with the map in it,
    // and the lines' own box handed the wheel on to the page once it ran out. A window too short
    // for the map's floor scrolls the page as before.
    <div className="page map-gutter h-full card:max-lg:h-auto">
      <div className="h-full card:max-lg:h-auto grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-1 lg:min-h-map-tablet-min gap-5 items-start lg:items-stretch">
        {sheetOpen && <Scrim label={t.map.closeControls} onClose={closeSheet} className="fixed z-map-overlay lg:hidden" />}

        <MapControls
          sheetRef={sheetRef}
          sheetOpen={sheetOpen}
          onCloseSheet={closeSheet}
          busCount={buses.length}
          stopCount={BUS_STOPS.length}
          stopsWithQr={stopsWithQr}
          locate={follow}
          onCenterLugo={() => map?.easeTo({ center: [LUGO_CENTER[1], LUGO_CENTER[0]], zoom: CITY_ZOOM })}
          preset={preset}
          onPreset={handlePreset}
          aroundStop={aroundStop}
          nearbyLines={nearbyLines}
          layers={layers}
          onToggleLayer={(layer) => setLayers((l) => ({ ...l, [layer]: !l[layer] }))}
          listedLines={listedLines}
          pickedLineIds={pickedLineIds}
          onSelectLine={handleSelectLine}
          onOpenLine={onOpenLine}
        />

        <div className="h-full card:max-lg:h-auto order-1 lg:order-none lg:col-span-8">
          {/* The map is the screen on a phone, upright or turned; the card, the border and the fixed height come back where one fits. */}
          {/* With a sheet up, the zoom bar steps aside: it floated over the sheet's two buttons, and a tap meant for them zoomed the map. */}
          <div className={`h-map-viewport relative z-0 w-full overflow-hidden bg-surface card:rounded-card card:border card:border-edge card:shadow-raised ${tappedStop || linesHere ? 'map-sheet-up' : ''}`}>
            <div ref={containerRef} className="w-full h-full" />

            {/* The scope, not the one line picked out of it: the layer keeps the rest faint underneath. The stops narrow to the pick: 417 dots is clutter. */}
            <RouteLayer
              map={geometryReady ? map : null}
              styled={styled}
              visibleLineIds={scopeLineIds}
              emphasisLineIds={pickedLineIds}
              lines={BUS_LINES}
              showRoutes={layers.routes}
              onLinesHere={(hits, at) => {
                setTappedStop(null);
                setLinesHere({ hits, at });
              }}
            />
            {/* The big dot follows what the reader is looking at: the stop whose sheet is open, else the one whose board they came from. */}
            <StopLayer
              map={map}
              styled={styled}
              visibleLineIds={visibleLineIds}
              stops={BUS_STOPS}
              selectedStop={tappedStop ?? selectedStop}
              showStops={layers.stops}
              onTapStop={(stop) => {
                setLinesHere(null);
                setTappedStop(stop);
              }}
            />
            {tappedStop && (
              <StopSheet
                stop={tappedStop}
                onHeight={(px) => keepAbove([tappedStop.lat, tappedStop.lng], px)}
                onClose={() => setTappedStop(null)}
                onOpenLine={(line) => {
                  setTappedStop(null);
                  onOpenLine(line);
                }}
                onShowLinesHere={(stop) => {
                  setTappedStop(null);
                  showLinesHere(stop);
                }}
                onOpenFullBoard={(stop) => {
                  setTappedStop(null);
                  onSelectStop(stop);
                }}
              />
            )}
            {linesHere && (
              <LinesHereSheet
                hits={linesHere.hits}
                onHeight={(px) => keepAbove(linesHere.at, px)}
                onClose={() => setLinesHere(null)}
                onChoose={chooseLine}
                onOpenLine={(line) => {
                  setLinesHere(null);
                  onOpenLine(line);
                }}
              />
            )}
            <VehicleLayer
              map={geometryReady ? map : null}
              visibleLineIds={visibleLineIds}
              buses={buses}
              showBuses={layers.buses}
              onOpenBus={() => {
                setTappedStop(null);
                setLinesHere(null);
              }}
              onOpenLine={(lineId) => {
                const line = lineById(lineId);
                if (line) onOpenLine(line);
              }}
            />

            {/* Two controls cannot wait a viewport away on a phone: which line, and where you are. They ride over the map below `lg`.
                The lines come before the buses notice drawn under them, so Tab and a screen reader meet the two in the order they are drawn. */}
            <LineChips listed={listedLines} picked={pickedLineIds} onToggle={handleSelectLine} onAll={() => handlePreset('all')} />

            {/* While the buses are drawn, the map says what they are, on the map: the popup that
                said it is opened by nobody who is only looking. Under the line chips on a phone,
                and beneath them when those open; one tap takes the buses off again. */}
            {layers.buses && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-map-float flex justify-center px-3 lg:top-3">
                <p className="pointer-events-auto flex items-center gap-1 map-glass edge-estimated pl-3.5 shadow-raised">
                  <span className="text-label font-semibold">~ {t.map.busesEstimatedNotice}</span>
                  <CloseButton label={t.map.hideBuses} title={t.map.hideBuses} onClick={() => setLayers((l) => ({ ...l, buses: false }))} round />
                </p>
              </div>
            )}

            {/* A position refused, unavailable or out of the network, said where the button was
                pressed. On a phone it was said only in the sheet, which is closed then, and the
                press looked like nothing at all. From lg up the sidebar says it. */}
            {follow.error && (
              <div className="pointer-events-none absolute inset-x-0 bottom-20 z-map-alert px-3 lg:hidden">
                <Notice role="alert" className="pointer-events-auto flex items-center gap-1 py-1 pr-1 shadow-raised">
                  <span className="min-w-0 flex-1">{follow.error}</span>
                  <CloseButton label={t.map.closePopup} onClick={() => follow.setError(null)} />
                </Notice>
              </div>
            )}

            {/* Orientation, one thumb's reach from the bottom corner; the zoom control has the other. */}
            <button
              type="button"
              onClick={follow.toggle}
              disabled={follow.isLocating}
              aria-pressed={follow.isFollowing}
              aria-label={locateLabel}
              title={locateLabel}
              className={`pointer-events-auto absolute bottom-5 left-3 z-map-float flex h-12 w-12 items-center justify-center map-glass shadow-float disabled:opacity-disabled lg:hidden ${
                follow.isFollowing ? 'border-accent text-accent' : 'text-ink-2'
              }`}
            >
              <LocateIcon className="h-5 w-5" aria-hidden="true" />
            </button>
            {/* The way to everything the sidebar holds, without leaving the map. */}
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              aria-expanded={sheetOpen}
              className="pointer-events-auto absolute bottom-5 left-1/2 z-map-float flex h-12 -translate-x-1/2 items-center gap-2 map-glass px-4 text-label font-bold text-ink shadow-float lg:hidden"
            >
              <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
              {t.map.controls}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
