import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { getDistanceMeters } from '../../utils/geo';
import { getNearbyStops, NEARBY_STOP_LIMIT_METRES } from '../../utils/places';
import { subscribePosition } from '../../services/stopAlarm';
import { useT } from '../../i18n';
import { DRAW, READER_PANE, mapColors, userDotStyle } from './palette';

/** The map gave up on a first fix after eight seconds and said so; the shared watch waits twenty, for the ride. */
const FIRST_FIX_MS = 8000;

/**
 * Follow the phone on the map, rather than photograph it once: a dot with the accuracy
 * circle around it (a wifi fix indoors can be five hundred metres out), centred on the
 * first fix and then left where the reader put the map unless the dot walks off the edge.
 * Pressing again stops it, because a watch nobody turned off is a radio nobody turned off.
 * It reads the app's one position watch (stopAlarm.ts) rather than opening a second.
 */
export function useFollowMe(map: L.Map | null, colors: ReturnType<typeof mapColors>, onMoved: (lat: number, lng: number) => void) {
  const t = useT();
  const [isLocating, setIsLocating] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const accuracyRef = useRef<L.Circle | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const firstFixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Where `onMoved` last fired, so walking a few metres does not redo the nearby list. */
  const lastFixRef = useRef<[number, number] | null>(null);
  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;
  /** The last fix, and whether the map has centred on one since the watch began. */
  const fixRef = useRef<{ lat: number; lng: number; accuracy: number; centred: boolean } | null>(null);

  // Drawn with the map of now, when a fix comes and when the map does: the map opening on the
  // lines near a reader who had allowed the position started the watch from its first render,
  // before the map existed, and the button said "stop following" over a map with no dot on
  // it that never centred. A fix that came before the map waits for it.
  const draw = () => {
    const fix = fixRef.current;
    if (!map || !fix) return;
    const at: [number, number] = [fix.lat, fix.lng];
    if (!fix.centred) {
      map.setView(at, 16, { animate: true });
      fix.centred = true;
    } else if (!map.getBounds().pad(-0.15).contains(at)) {
      map.panTo(at, { animate: true });
    }
    if (accuracyRef.current) accuracyRef.current.setLatLng(at).setRadius(fix.accuracy);
    else accuracyRef.current = L.circle(at, { radius: fix.accuracy, color: colors.userStroke, fillColor: colors.userFill, weight: DRAW.me.accuracyRing, opacity: DRAW.me.accuracyStroke, fillOpacity: DRAW.me.accuracyFill, interactive: false, pane: READER_PANE }).addTo(map);
    // No popup of its accuracy: the circle draws it, and the dot is not a thing to tap.
    if (markerRef.current) markerRef.current.setLatLng(at);
    else markerRef.current = L.circleMarker(at, userDotStyle(colors)).addTo(map);
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;
  useEffect(() => drawRef.current(), [map]);

  const stop = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (firstFixTimerRef.current !== null) clearTimeout(firstFixTimerRef.current);
    firstFixTimerRef.current = null;
    markerRef.current?.remove();
    accuracyRef.current?.remove();
    markerRef.current = null;
    accuracyRef.current = null;
    lastFixRef.current = null;
    fixRef.current = null;
    setIsFollowing(false);
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) return setError(t.map.geolocationUnavailable);
    setIsLocating(true);
    setError(null);
    // Refused, unavailable or no fix in time: say so, rather than measure "near me" from the centre of Lugo.
    const refused = () => {
      stop();
      setIsLocating(false);
      setError(t.map.locationDenied);
    };
    firstFixTimerRef.current = setTimeout(refused, FIRST_FIX_MS);
    unsubscribeRef.current = subscribePosition(({ lat, lng, accuracy }) => {
      if (firstFixTimerRef.current !== null) clearTimeout(firstFixTimerRef.current);
      firstFixTimerRef.current = null;
      setIsLocating(false);
      setIsFollowing(true);
      // Outside the network there is nothing to look at: do not fly to another province.
      if (!getNearbyStops(lat, lng).some((s) => s.walkMeters <= NEARBY_STOP_LIMIT_METRES)) {
        stop();
        setError(t.map.outOfArea);
        return;
      }
      fixRef.current = { lat, lng, accuracy, centred: fixRef.current?.centred ?? false };
      drawRef.current();
      // Fifty metres is about when a different stop starts being the closest one.
      const last = lastFixRef.current;
      if (!last || getDistanceMeters(last[0], last[1], lat, lng) > 50) {
        lastFixRef.current = [lat, lng];
        onMovedRef.current(lat, lng);
      }
    }, refused);
  }, [stop, t]);

  // A watch outlives the screen unless somebody stops it, and this one is reading the GPS.
  useEffect(() => stop, [stop]);

  return { isLocating, isFollowing, error, setError, start, stop, toggle: isFollowing ? stop : start };
}
