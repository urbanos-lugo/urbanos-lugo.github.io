import { Marker, type Map as MapLibre } from 'maplibre-gl';
import { subscribeHeading } from '../../services/heading';
import { accuracyCircle, turnToward } from '../../utils/geo';
import { DRAW, type MapColors } from './palette';
import { dropLayers, placeLayer, setSource } from './mapLayers';

export interface ReaderMark {
  /** Puts the reader at a fix ([lat, lng]), drawing them the first time. */
  place(at: [number, number], accuracy: number): void;
  /** Takes the reader off the map until the next fix, still listening. */
  hide(): void;
  remove(): void;
}

const SOURCE = 'app-reader';

const element = (className: string, inner = '') => {
  const el = document.createElement('div');
  el.className = className;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
};

/**
 * The reader on a map, drawn the same on every map that draws them: the dot, the circle of
 * the fix's accuracy, and, on a phone with a compass, a fan the way the phone faces. The fan
 * is laid on the map, not the screen, so on a turned map it still points where the phone does.
 * It waits for the first reading: a device with no compass shows the dot alone. The dot and
 * the fan take no tap (index.css): the reader is information, not a button.
 * Made once the style has loaded, and made again for each new one (useMapLibre's `styled`):
 * the circle is a layer of the style, and a new palette is a new style.
 */
export function readerMark(map: MapLibre, colors: MapColors): ReaderMark {
  const beam = new Marker({ element: element('map-beam', '<div class="map-beam-fan"></div>'), rotationAlignment: 'map', pitchAlignment: 'map' });
  const dot = new Marker({ element: element('map-reader-dot') });
  let at: [number, number] | null = null;
  let accuracy = 0;
  let shown: number | null = null;
  let wanted = 0;
  let frame = 0;
  let beamOn = false;

  /** The dot and the fan at a point: the fix, or a step of the slide to it. */
  const show = (p: [number, number]) => {
    dot.setLngLat([p[1], p[0]]);
    if (beamOn) beam.setLngLat([p[1], p[0]]);
  };
  /** The circle at the fix, once a fix: it is a layer of the style, and each new shape repaints the whole map. */
  const circle = (p: [number, number]) => {
    setSource(map, SOURCE, accuracyCircle(p, accuracy));
    if (!map.getLayer('app-accuracy'))
      placeLayer(map, { id: 'app-accuracy', type: 'fill', source: SOURCE, paint: { 'fill-color': colors.userFill, 'fill-opacity': DRAW.me.accuracyFill, 'fill-outline-color': colors.userStroke } });
  };
  // Each fix slides the dot there instead of jumping to it, from wherever the last slide had
  // got to; at once for a reader who asked for less motion, and for the first fix. The circle
  // goes to the fix at once: set on every frame of the slide, a ride with a fix a second kept
  // the page's thread busy 30–37 s a minute at 6x CPU (REXISTRO, round 52).
  let slide = 0;
  const slideTo = (to: [number, number]) => {
    cancelAnimationFrame(slide);
    slide = 0;
    circle(to);
    const was = dot.getElement().isConnected ? dot.getLngLat() : null;
    if (!was || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return show(to);
    const from: [number, number] = [was.lat, was.lng];
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / DRAW.me.glide);
      show([from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k]);
      slide = k < 1 ? requestAnimationFrame(step) : 0;
    };
    slide = requestAnimationFrame(step);
  };

  // A reading every few milliseconds, each a few degrees off the last: the fan eases toward
  // the newest one on the next frames instead of shaking with every one.
  const turn = () => {
    frame = 0;
    shown = shown === null ? wanted : turnToward(shown, wanted, DRAW.me.turn);
    beam.setRotation(shown);
    // Measured round the short side: 359.9° and 0.1° are a fifth of a degree apart, not 359.8.
    if (Math.abs(((((wanted - shown) % 360) + 540) % 360) - 180) > 0.5) frame = requestAnimationFrame(turn);
  };
  const listen = () =>
    subscribeHeading((heading) => {
      wanted = heading;
      if (!at) return;
      if (!beamOn) {
        // Added before the dot, so the dot sits on it.
        dot.remove();
        beam.setLngLat([at[1], at[0]]).addTo(map);
        dot.setLngLat([at[1], at[0]]).addTo(map);
        beamOn = true;
      }
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
    place(next, metres) {
      at = next;
      accuracy = metres;
      slideTo(next);
      if (!dot.getElement().isConnected) dot.addTo(map);
    },
    hide() {
      cancelAnimationFrame(slide);
      at = null;
      beamOn = false;
      beam.remove();
      dot.remove();
      dropLayers(map, ['app-accuracy'], [SOURCE]);
    },
    remove() {
      onScreen?.disconnect();
      stopHeading();
      cancelAnimationFrame(frame);
      this.hide();
    },
  };
}
