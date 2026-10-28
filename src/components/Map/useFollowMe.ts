import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as MapLibre, MapLibreEvent } from 'maplibre-gl';
import { getDistanceMeters, turnToward } from '../../utils/geo';
import { getNearbyStops, NEARBY_STOP_LIMIT_METRES } from '../../utils/places';
import { subscribePosition } from '../../services/stopAlarm';
import { requestHeadingPermission, subscribeHeading } from '../../services/heading';
import { useT } from '../../i18n';
import { DRAW, type MapColors } from './palette';
import { readerMark, type ReaderMark } from './reader';

/** The map gave up on a first fix after eight seconds and said so; the shared watch waits twenty, for the ride. */
const FIRST_FIX_MS = 8000;
/** The zoom the map goes to on the first fix: a few streets round the reader. */
const FIRST_FIX_ZOOM = 15;
/** The share of the view, from each edge, the dot may walk into before the map follows it. */
const EDGE_SHARE = 0.15;

/**
 * Follow the phone on the map, rather than photograph it once: a dot with the accuracy
 * circle around it (a wifi fix indoors can be five hundred metres out), centred on the
 * first fix and then left where the reader put the map unless the dot walks off the edge.
 * On a phone with a compass, pressing again turns the map with the phone, the way it faces up,
 * as a street is seen; turning the map by hand, or the compass, gives north back to the hand.
 * Pressing once more stops it all, because a watch nobody turned off is a radio nobody turned off.
 * It reads the app's one position watch (stopAlarm.ts) rather than opening a second.
 */
export function useFollowMe(map: MapLibre | null, styled: number, colors: MapColors, onMoved: (lat: number, lng: number) => void) {
  const t = useT();
  const [isLocating, setIsLocating] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  /** The map turned with the phone. */
  const [isTurning, setIsTurning] = useState(false);
  const turningRef = useRef(false);
  turningRef.current = isTurning;
  /** A compass has answered: only then is there a way to turn with. */
  const [hasCompass, setHasCompass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readerRef = useRef<ReaderMark | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const firstFixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Where `onMoved` last fired, so walking a few metres does not redo the nearby list. */
  const lastFixRef = useRef<[number, number] | null>(null);
  const onMovedRef = useRef(onMoved);
  onMovedRef.current = onMoved;
  /** The last fix, and whether the map has centred on one since the watch began. */
  const fixRef = useRef<{ lat: number; lng: number; accuracy: number; centred: boolean } | null>(null);

  // Drawn with the map of now, when a fix comes and when the map or its style does: the map
  // opening on the lines near a reader who had allowed the position started the watch from its
  // first render, before the map existed, and the button said "stop following" over a map with
  // no dot on it that never centred. A fix that came before the map waits for it.
  const draw = () => {
    const fix = fixRef.current;
    if (!map || !styled || !fix) return;
    const centre: [number, number] = [fix.lng, fix.lat];
    if (!fix.centred) {
      map.easeTo({ center: centre, zoom: FIRST_FIX_ZOOM });
      fix.centred = true;
    } else {
      const p = map.project(centre);
      const { clientWidth: w, clientHeight: h } = map.getContainer();
      if (p.x < w * EDGE_SHARE || p.x > w * (1 - EDGE_SHARE) || p.y < h * EDGE_SHARE || p.y > h * (1 - EDGE_SHARE)) map.easeTo({ center: centre });
    }
    // No popup of its accuracy: the circle draws it, and the dot is not a thing to tap.
    (readerRef.current ??= readerMark(map, colors)).place([fix.lat, fix.lng], fix.accuracy);
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;
  // A new style is a new reader: the circle is a layer of the style.
  useEffect(() => {
    readerRef.current?.remove();
    readerRef.current = null;
    drawRef.current();
  }, [map, styled]);

  // The way the phone faces, while following: whether there is a compass at all, and, turning
  // with it, the map's bearing eased toward each reading as the fan under the dot is.
  useEffect(() => {
    if (!map || !isFollowing) return;
    let wanted: number | null = null;
    let frame = 0;
    const turn = () => {
      frame = 0;
      if (wanted === null || !turningRef.current) return;
      const shown = turnToward(map.getBearing(), wanted, DRAW.me.turn);
      map.jumpTo({ bearing: shown });
      if (Math.abs(((((wanted - shown) % 360) + 540) % 360) - 180) > 0.5) frame = requestAnimationFrame(turn);
    };
    const stopHeading = subscribeHeading((heading) => {
      setHasCompass(true);
      wanted = heading;
      if (turningRef.current && !frame) frame = requestAnimationFrame(turn);
    });
    // A hand on the map's bearing, or on the compass, takes it back from the phone.
    const byHand = (e: MapLibreEvent<MouseEvent | TouchEvent | undefined>) => e.originalEvent && setIsTurning(false);
    const compass = map.getContainer().querySelector('.maplibregl-ctrl-compass');
    const north = () => setIsTurning(false);
    map.on('rotatestart', byHand);
    compass?.addEventListener('click', north);
    return () => {
      stopHeading();
      cancelAnimationFrame(frame);
      map.off('rotatestart', byHand);
      compass?.removeEventListener('click', north);
    };
  }, [map, isFollowing]);

  const stop = useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    if (firstFixTimerRef.current !== null) clearTimeout(firstFixTimerRef.current);
    firstFixTimerRef.current = null;
    readerRef.current?.remove();
    readerRef.current = null;
    lastFixRef.current = null;
    fixRef.current = null;
    setIsFollowing(false);
    setIsTurning(false);
  }, []);

  const start = useCallback(() => {
    if (!navigator.geolocation) return setError(t.map.geolocationUnavailable);
    requestHeadingPermission();
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

  const turnWithMe = useCallback(() => {
    requestHeadingPermission();
    setIsTurning(true);
  }, []);
  // Off, following north up, turning with the phone where it has a compass, off again.
  const offersTurn = isFollowing && hasCompass && !isTurning;
  const toggle = !isFollowing ? start : offersTurn ? turnWithMe : stop;
  const label = isLocating ? t.map.locating : !isFollowing ? t.map.myLocation : offersTurn ? t.map.turnWithMe : t.map.stopFollowing;

  return { isLocating, isFollowing, isTurning, error, setError, start, stop, toggle, label };
}
