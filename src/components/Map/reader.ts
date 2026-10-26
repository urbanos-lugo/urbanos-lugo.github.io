import L from 'leaflet';
import { subscribeHeading } from '../../services/heading';
import { turnToward } from '../../utils/geo';
import { BEAM_PANE, DRAW, READER_PANE, userDotStyle, type MapColors } from './palette';

export interface ReaderMark {
  /** Puts the reader at a fix, drawing them the first time. */
  place(at: [number, number], accuracy: number): void;
  remove(): void;
}

const beamIcon = () =>
  L.divIcon({
    className: 'map-beam',
    iconSize: [DRAW.me.beam, DRAW.me.beam],
    iconAnchor: [DRAW.me.beam / 2, DRAW.me.beam / 2],
    html: '<div class="map-beam-fan"></div>',
  });

/**
 * The reader on a map, drawn the same on every map that draws them: the dot, the circle of
 * the fix's accuracy, and, on a phone with a compass, a fan the way the phone faces. Without
 * it the dot said where you stand and not which way the street runs from you, and a stop a
 * hundred metres off could be in front or behind. The fan waits for the first reading, so a
 * device with no compass shows the dot alone, as before.
 */
export function readerMark(map: L.Map, colors: MapColors): ReaderMark {
  let dot: L.CircleMarker | null = null;
  let ring: L.Circle | null = null;
  let beam: L.Marker | null = null;
  let at: [number, number] | null = null;
  let shown: number | null = null;
  let wanted = 0;
  let frame = 0;

  // A reading every few milliseconds, each a few degrees off the last: the fan eases toward
  // the newest one on the next frames instead of shaking with every one.
  const turn = () => {
    frame = 0;
    const fan = beam?.getElement()?.firstElementChild;
    if (!(fan instanceof HTMLElement)) return;
    shown = shown === null ? wanted : turnToward(shown, wanted, DRAW.me.turn);
    fan.style.setProperty('--heading', `${shown}deg`);
    // Measured round the short side: 359.9° and 0.1° are a fifth of a degree apart, not 359.8.
    const left = Math.abs(((((wanted - shown) % 360) + 540) % 360) - 180);
    if (left > 0.5) frame = requestAnimationFrame(turn);
  };

  const listen = () =>
    subscribeHeading((heading) => {
      wanted = heading;
      if (!at) return;
      beam ??= L.marker(at, { icon: beamIcon(), interactive: false, keyboard: false, pane: BEAM_PANE }).addTo(map);
      if (!frame) frame = requestAnimationFrame(turn);
    });
  // The compass only while the map is on the screen: a tab left with its map keeps the map,
  // and a sensor read for nobody is a sensor left on.
  let stopHeading: () => void = () => {};
  const onScreen =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
          stopHeading();
          stopHeading = entries[entries.length - 1]?.isIntersecting ? listen() : () => {};
        });
  if (onScreen) onScreen.observe(map.getContainer());
  else stopHeading = listen();

  return {
    place(next, accuracy) {
      at = next;
      if (ring) ring.setLatLng(next).setRadius(accuracy);
      else
        ring = L.circle(next, {
          radius: accuracy,
          color: colors.userStroke,
          fillColor: colors.userFill,
          weight: DRAW.me.accuracyRing,
          opacity: DRAW.me.accuracyStroke,
          fillOpacity: DRAW.me.accuracyFill,
          interactive: false,
          pane: READER_PANE,
        }).addTo(map);
      if (dot) dot.setLatLng(next);
      else dot = L.circleMarker(next, userDotStyle(colors)).addTo(map);
      beam?.setLatLng(next);
    },
    remove() {
      onScreen?.disconnect();
      stopHeading();
      cancelAnimationFrame(frame);
      for (const layer of [dot, ring, beam]) layer?.remove();
      dot = ring = null;
      beam = null;
      at = null;
    },
  };
}
