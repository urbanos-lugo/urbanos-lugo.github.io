import { useEffect, useRef } from 'react';
import { Marker, Popup, type Map as MapLibre } from 'maplibre-gl';
import { translations, useLang, type Lang } from '../../i18n';
import { escapeHtml } from '../../utils/html';
import { ScheduledBus } from '../../types';
import { badgeHtml, popupBox, rowButtonClass } from './popupHtml';
import { DRAW } from './palette';
import { claim } from './mapLayers';

interface VehicleLayerProps {
  map: MapLibre | null;
  buses: ScheduledBus[];
  /** Lines to draw; null means every line. */
  visibleLineIds: string[] | null;
  showBuses: boolean;
  onOpenLine: (lineId: string) => void;
  /** A bus's popup opened: whatever sheet is up goes, so one thing is open at a time. */
  onOpenBus?: () => void;
}

/**
 * The bus as one SVG: a round chip in the line's colour carrying the number, with a nose
 * that turns to face the way it is going, on the map as it is turned. The number sits outside
 * the rotating group so it stays upright. The position is computed from the timetable and the
 * popup says so.
 */
function busSvg(bus: ScheduledBus, mapBearing: number): string {
  const colour = escapeHtml(bus.lineColor);
  const number = escapeHtml(bus.lineNumber);
  const size = number.length > 2 ? 'text-map-bus-long' : 'text-map-bus';
  return (
    `<svg width="${DRAW.icon.bus}" height="${DRAW.icon.bus}" viewBox="0 0 46 46" aria-hidden="true" class="block overflow-visible drop-shadow-marker">` +
    `<g data-nose transform="${noseTurn(bus.bearing, mapBearing)}"><path d="M23 2.5 L30 14 L16 14 Z" fill="${colour}" class="stroke-bg stroke-marker" stroke-linejoin="round" paint-order="stroke"></path></g>` +
    `<circle cx="23" cy="23" r="13" fill="${colour}" class="stroke-bg stroke-marker"></circle>` +
    `<text x="23" y="23" text-anchor="middle" dominant-baseline="central" class="fill-on-line font-sans font-bold ${size} tracking-map-bus">${number}</text></svg>`
  );
}
const noseTurn = (bearing: number, mapBearing: number) => `rotate(${(bearing - mapBearing).toFixed(1)} 23 23)`;

/** Built as a node so the line heading can carry a real click handler. */
function popupNode(bus: ScheduledBus, onOpenLine: (lineId: string) => void, lang: Lang): HTMLElement {
  const t = translations(lang);
  const occupancy = { low: t.map.occupancyLow, medium: t.map.occupancyMedium, high: t.map.occupancyHigh }[bus.occupancy];
  const node = document.createElement('div');
  node.innerHTML = popupBox(
    `<button type="button" data-open-line="1" class="${rowButtonClass} mb-1.5">${badgeHtml(bus.lineColor, bus.lineNumber)}` +
      `<span class="link-text text-ink">${escapeHtml(bus.destination)}</span></button>` +
      `<div class="text-label text-ink-2">${escapeHtml(t.map.nextStop)}: <b>${escapeHtml(bus.nextStopName)}</b></div>` +
      `<div class="text-label text-ink-3">${escapeHtml(t.map.occupancyLabel)}: ${escapeHtml(occupancy)}</div>` +
      `<div class="mt-1.5 text-label text-estimated">${t.map.estimatedPosition}</div>`,
  );
  node.querySelector('button[data-open-line]')?.addEventListener('click', () => onOpenLine(bus.lineId));
  return node;
}

/**
 * A popup kept clear of what floats over the map: on a phone the line chips and the buses'
 * notice over its top and the locate and controls buttons over its foot. A bus's popup opened
 * under the notice, which covered its close button (WCAG 2.5.8), and a button in it reached by
 * Tab could sit under them (2.4.11). The renderer does not pan to a popup; this does, the least.
 */
function keepClear(map: MapLibre, popup: Popup): void {
  const el = popup.getElement();
  if (!el) return;
  const box = map.getContainer().getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const room = DRAW.popupClear;
  const dx = r.left < box.left + room.left ? r.left - box.left - room.left : r.right > box.right - room.right ? r.right - box.right + room.right : 0;
  const dy = r.top < box.top + room.top ? r.top - box.top - room.top : r.bottom > box.bottom - room.bottom ? r.bottom - box.bottom + room.bottom : 0;
  if (dx || dy) map.panBy([dx, dy]);
}

export function VehicleLayer({ map, buses, visibleLineIds, showBuses, onOpenLine, onOpenBus }: VehicleLayerProps) {
  const lang = useLang();
  const markersRef = useRef<Record<string, Marker>>({});
  /** What each marker was last drawn from, so a tick that changed neither icon nor popup costs neither. */
  const drawnRef = useRef<Record<string, { face: string; heading: number; popup: string }>>({});
  const onOpenLineRef = useRef(onOpenLine);
  onOpenLineRef.current = onOpenLine;
  const onOpenBusRef = useRef(onOpenBus);
  onOpenBusRef.current = onOpenBus;

  useEffect(() => {
    if (!map) return;
    const visible = showBuses ? (visibleLineIds === null ? buses : buses.filter((b) => visibleLineIds.includes(b.lineId))) : [];
    const visibleIds = new Set(visible.map((b) => b.id));
    for (const id of Object.keys(markersRef.current)) {
      if (visibleIds.has(id)) continue;
      markersRef.current[id].remove();
      delete markersRef.current[id];
      delete drawnRef.current[id];
    }

    // Buses of different lines legitimately share a point (a common terminus); nudge coincident markers apart.
    const seenAt = new Map<string, number>();
    const OFFSET_DEG = 0.00012; // ~13 m
    const placed = visible.map((bus) => {
      const key = `${bus.currentLat.toFixed(5)},${bus.currentLng.toFixed(5)}`;
      const n = seenAt.get(key) ?? 0;
      seenAt.set(key, n + 1);
      if (n === 0) return bus;
      const angle = (n * 2 * Math.PI) / 6;
      return { ...bus, currentLat: bus.currentLat + Math.sin(angle) * OFFSET_DEG, currentLng: bus.currentLng + Math.cos(angle) * OFFSET_DEG };
    });

    const t = translations(lang);
    const bearing = map.getBearing();
    for (const bus of placed) {
      const face = `${bus.lineNumber}|${bus.lineColor}`;
      // Five degrees is under what the chip can show.
      const heading = Math.round(bus.bearing / 5) * 5;
      const popupKey = `${bus.destination}|${bus.nextStopName}|${bus.occupancy}|${lang}`;
      const existing = markersRef.current[bus.id];
      // Not while the focus is inside the popup: new content replaces the old, the focused
      // button with it, and the focus fell to the page (2.4.3). It catches up once the focus
      // has gone.
      const holdsFocus = !!existing?.getPopup()?.getElement()?.contains(document.activeElement);
      if (existing) {
        existing.setLngLat([bus.currentLng, bus.currentLat]);
        const el = existing.getElement();
        el.dataset.bearing = String(bus.bearing);
        const drawn = drawnRef.current[bus.id];
        if (drawn?.face !== face) el.innerHTML = busSvg(bus, bearing);
        // A new heading turns the nose already drawn. The whole SVG was replaced at every 5° a
        // turning bus made, more than once a second across the map, and a tap whose press and
        // release fell either side of it was lost: the popup never opened.
        else if (drawn.heading !== heading) el.querySelector('[data-nose]')?.setAttribute('transform', noseTurn(bus.bearing, bearing));
        if (drawnRef.current[bus.id]?.popup !== popupKey && !holdsFocus) existing.getPopup()?.setDOMContent(popupNode(bus, onOpenLineRef.current, lang));
        el.setAttribute('aria-label', t.map.busMarker(bus.lineNumber, bus.destination));
      } else {
        const el = document.createElement('div');
        el.className = 'custom-bus-marker';
        el.dataset.bearing = String(bus.bearing);
        el.innerHTML = busSvg(bus, bearing);
        // A bus out of the Tab order is still found by a screen reader moving through the map: an image with its line and destination.
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', t.map.busMarker(bus.lineNumber, bus.destination));
        // Out of the Tab order: a Tab stop per bus sent the focus to buses past the edge of the
        // map or under the buttons that float on it (2.4.11). Their popup says what the lines
        // screen says -- the buses the timetable has on the road and the stop each is reaching --
        // which the keyboard reaches there. The renderer gives a marker with a popup tabindex 0
        // unless it has one already.
        el.setAttribute('tabindex', '-1');
        // The tap is the bus's: the map neither pans to it nor lists the routes under it.
        el.addEventListener('click', claim);
        // The focus stays where it was: the renderer would move it to the popup's first button
        // as it opens, so a tap on a bus left a focus ring on its line, and Tab then reached a
        // button that had been showing it all along (2.4.7). Leaflet's popups never took it.
        const popup = new Popup({ offset: DRAW.icon.bus / 2, maxWidth: 'none', focusAfterOpen: false }).setDOMContent(popupNode(bus, onOpenLineRef.current, lang));
        popup.on('open', () => {
          onOpenBusRef.current?.();
          keepClear(map, popup);
          popup.getElement()?.addEventListener('focusin', () => keepClear(map, popup));
        });
        markersRef.current[bus.id] = new Marker({ element: el }).setLngLat([bus.currentLng, bus.currentLat]).setPopup(popup).addTo(map);
      }
      drawnRef.current[bus.id] = { face, heading, popup: holdsFocus ? (drawnRef.current[bus.id]?.popup ?? popupKey) : popupKey };
    }
  }, [map, buses, visibleLineIds, showBuses, lang]);

  // A turned map turns each nose back, so it still points the way the bus goes.
  useEffect(() => {
    if (!map) return;
    const turn = () => {
      const bearing = map.getBearing();
      for (const marker of Object.values(markersRef.current)) {
        const el = marker.getElement();
        el.querySelector('[data-nose]')?.setAttribute('transform', noseTurn(Number(el.dataset.bearing), bearing));
      }
    };
    map.on('rotate', turn);
    return () => {
      map.off('rotate', turn);
    };
  }, [map]);

  useEffect(
    () => () => {
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
      drawnRef.current = {};
    },
    [map],
  );

  return null;
}
