import { escapeHtml } from '../../utils/html';
import { lineBadgeClass } from '../ui/LineBadge';

/**
 * The map's popups live outside React, so their markup is strings: they carry the same classes
 * as the rest of the app, and every value that came from the dataset goes through escapeHtml.
 */

/** A line's number on its colour, the badge printed on the poles: LineBadge's 'sm', as HTML. */
const badgeClass = lineBadgeClass('sm');
export const badgeHtml = (color: string, number: string): string => `<span class="${badgeClass}" style="background-color:${escapeHtml(color)}">${escapeHtml(number)}</span>`;

/** The button a popup row is made of, with room for a real click handler after insertion. */
export const rowButtonClass = 'flex cursor-pointer items-center gap-2 text-left';

/** A popup's outer box; `wide` for the rows that carry two buttons. */
export const popupBox = (inner: string, wide = false): string => {
  const popupWidth = wide ? 'min-w-popup-wide' : 'min-w-popup';
  return `<div class="${popupWidth} p-0.5 font-sans text-ink">${inner}</div>`;
};
