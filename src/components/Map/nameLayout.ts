/** A stop's dot on the screen, and the width of its name there. */
export interface NamedDot {
  x: number;
  y: number;
  width: number;
}

/** Where a name is written: its anchor, and how the text sits on it (canvas textAlign). */
export interface NamePlace {
  x: number;
  y: number;
  align: 'left' | 'right' | 'center';
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The box a name takes on the screen, from where it is written and how wide and tall it is. */
export function nameBox(place: NamePlace, width: number, height: number): Box {
  const left = place.align === 'left' ? place.x : place.align === 'right' ? place.x - width : place.x - width / 2;
  return { left, right: left + width, top: place.y - height / 2, bottom: place.y + height / 2 };
}

/**
 * Which written name a tap landed on, with `reach` pixels around each for a finger: a name a
 * dozen pixels tall is a thin target, and it is the thing on the map that says which stop it
 * is. Names never overlap (placeNames), so the first box that holds the point is the one.
 */
export function nameAt<T>(names: { item: T; box: Box }[], x: number, y: number, reach: number): T | null {
  const hit = names.find(({ box }) => x >= box.left - reach && x <= box.right + reach && y >= box.top - reach && y <= box.bottom + reach);
  return hit ? hit.item : null;
}

/** Which of placeNames' four sides a name was written on: 0 right of its dot, 1 left, 2 above, 3 below. */
export const sideOf = (place: NamePlace, dot: { y: number }): number => (place.align === 'left' ? 0 : place.align === 'right' ? 1 : place.y < dot.y ? 2 : 3);

/**
 * Where each stop's name goes beside its dot, taken in the order given, so the first ones
 * win: on the side it had before (`prefer`, by sideOf) while that is still usable, else to
 * the right of the dot while that stays on the screen, else to the left, else above or below
 * it, and not at all where it would cover a name already written, another stop's dot or a
 * point kept clear (the reader). Written one over another, two names could not be read; a
 * name over a dot hid the stop it lay on, and over the reader, where you are. Chosen afresh
 * each frame of a pan, a name crossing the screen's edge went left there and right again a
 * few pixels on. Pure screen geometry, so it can be checked without a map.
 */
export function placeNames(
  dots: NamedDot[],
  view: { width: number; radius: number; gap: number; height: number; edge: number; keepClear?: { x: number; y: number }[] },
  prefer: (number | undefined)[] = [],
): (NamePlace | null)[] {
  const { width, radius, gap, height, edge, keepClear = [] } = view;
  const around = (p: { x: number; y: number }): Box => ({ left: p.x - radius, right: p.x + radius, top: p.y - radius, bottom: p.y + radius });
  const taken = dots.map(around);
  const clear = keepClear.map(around);
  const off = radius + gap;
  return dots.map((d, i) => {
    const row = { top: d.y - height / 2, bottom: d.y + height / 2 };
    const centred = { left: d.x - d.width / 2, right: d.x + d.width / 2 };
    const sides: (Box & { place: NamePlace })[] = [
      { left: d.x + off, right: d.x + off + d.width, ...row, place: { x: d.x + off, y: d.y, align: 'left' } },
      { left: d.x - off - d.width, right: d.x - off, ...row, place: { x: d.x - off, y: d.y, align: 'right' } },
      { ...centred, top: d.y - off - height, bottom: d.y - off, place: { x: d.x, y: d.y - off - height / 2, align: 'center' } },
      { ...centred, top: d.y + off, bottom: d.y + off + height, place: { x: d.x, y: d.y + off + height / 2, align: 'center' } },
    ];
    // Each side only while it stays on the screen, except the left of a dot with no room on its right, which has nowhere better.
    const roomRight = sides[0].right <= width - edge;
    const usable = sides.filter((s, k) => (k === 0 ? roomRight : k === 1 ? s.left >= edge || !roomRight : s.left >= edge && s.right <= width - edge));
    const kept = prefer[i] === undefined ? -1 : usable.indexOf(sides[prefer[i]!]);
    for (const side of kept > 0 ? [usable[kept], ...usable.filter((_, k) => k !== kept)] : usable) {
      const hits = (b: Box) => side.left < b.right && side.right > b.left && side.top < b.bottom && side.bottom > b.top;
      // Its own dot is not in the way.
      if (taken.some((b, j) => j !== i && hits(b)) || clear.some(hits)) continue;
      taken.push(side);
      return side.place;
    }
    return null;
  });
}
