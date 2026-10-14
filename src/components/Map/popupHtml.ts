import { escapeHtml } from '../../utils/html';

/**
 * Leaflet popups live outside React, so their markup is strings: they carry the same classes
 * as the rest of the app, and every value that came from the dataset goes through escapeHtml.
 */

/** A line's number on its colour, the badge printed on the poles: LineBadge's 'sm', as HTML. */
export const badgeHtml = (color: string, number: string): string =>
  `<span class="tnum flex shrink-0 items-center justify-center font-bold text-on-line h-6 min-w-6 rounded px-1.5 text-label" style="background-color:${escapeHtml(color)}">${escapeHtml(number)}</span>`;

/** The button a popup row is made of, with room for a real click handler after insertion. */
export const rowButtonClass = 'flex cursor-pointer items-center gap-2 text-left';

/**
 * Where a popup on the network map may sit. Leaflet pans the map to fit a popup inside its
 * edges, and on a phone the line chips and the buses' notice float over the top of the map
 * and the locate and controls buttons over its foot: a bus's popup opened under the notice,
 * which covered its close button (WCAG 2.5.8). These margins keep it clear of both.
 */
export const POPUP_CLEAR_OF_CONTROLS = { autoPanPaddingTopLeft: [12, 124] as [number, number], autoPanPaddingBottomRight: [12, 80] as [number, number] };

/** A popup's outer box; `wide` for the rows that carry two buttons. */
export const popupBox = (inner: string, wide = false): string => {
  const popupWidth = wide ? 'min-w-[210px]' : 'min-w-[200px]';
  return `<div class="${popupWidth} p-0.5 font-sans text-ink">${inner}</div>`;
};
