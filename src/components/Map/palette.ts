/**
 * The map's colours, for both palettes: index.css's --c-map-* tokens, read off <html> for
 * the palette live there now. A map style takes a colour as a value, not a variable, so
 * `var(--c-ink)` in a layer's paint would mean nothing to it; the map asks again for each
 * palette, and each answer is kept.
 *
 * The greys are the app's neutrals. Blue is the reader's position and nothing else: the stop
 * chosen is a ring of the app's ink round the ground, as a station is drawn. Both were blue
 * discs, 9 and 8 px, and standing at a pole the two lay one over the other with only their
 * shade to tell them apart. The accent red stays off the map: several route lines are red
 * and a red marker would vanish on its own line.
 * Stop discs are 8.4:1 over their ground — crisp, but no longer shouting over the route,
 * which at 1.9–3.9:1 is the shape the map is for.
 */
export interface MapColors {
  stopFill: string;
  stopStroke: string;
  stopSelected: string;
  /** The names written beside the dots from zoom 15: the app's ink, haloed in its ground. */
  nameInk: string;
  nameHalo: string;
  userFill: string;
  userStroke: string;
  /** Walking legs of a planned trip: the routed path, and the straight-line stand-in. */
  walkRouted: string;
  walkStraight: string;
  originPin: string;
  destinationPin: string;
}

const TOKENS: Record<keyof MapColors, string> = {
  stopFill: '--c-map-stop',
  stopStroke: '--c-map-ring',
  stopSelected: '--c-map-selected',
  nameInk: '--c-map-name',
  nameHalo: '--c-map-halo',
  userFill: '--c-map-me',
  userStroke: '--c-map-ring',
  walkRouted: '--c-map-walk',
  walkStraight: '--c-map-walk-guess',
  originPin: '--c-map-origin',
  destinationPin: '--c-map-destination',
};

const readings = new Map<boolean, MapColors>();

/**
 * MapLibre's style reads hex, rgb() and hsl(), not the oklch() the app's neutrals are written in:
 * it refused the chosen stop's ring, "color expected", and drew nothing. Each colour is painted
 * into one pixel and read back as hex, once per palette.
 */
let pixel: CanvasRenderingContext2D | null | undefined;
const asHex = (colour: string) => {
  pixel ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!pixel || !colour) return colour;
  pixel.clearRect(0, 0, 1, 1);
  pixel.fillStyle = colour;
  pixel.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
  return '#' + (a < 255 ? [r, g, b, a] : [r, g, b]).map((v) => v.toString(16).padStart(2, '0')).join('');
};

export const mapColors = (isDark: boolean): MapColors => {
  const kept = readings.get(isDark);
  if (kept) return kept;
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const colors = Object.fromEntries(Object.entries(TOKENS).map(([role, token]) => [role, asHex(style.getPropertyValue(token).trim())])) as unknown as MapColors;
  // Kept only when it was read under the palette asked for, with the stylesheet in.
  if (root.classList.contains('dark') === isDark && colors.stopFill) readings.set(isDark, colors);
  return colors;
};

/**
 * The map's sizes, in CSS pixels, and its strengths, 0 to 1: the half of the design's tokens
 * that the renderer takes as numbers, named for what they draw. index.css holds the rest, the
 * map's HTML markers included.
 */
export const DRAW = {
  /**
   * A stop's dot: by zoom on the network map, the ride's calls, the small map's centre, and the
   * one chosen. `rank` is half a small map's numbered disc, --spacing-stop-rank in index.css,
   * so a name written beside it clears it.
   */
  stopRadius: { overview: 4, z14: 5, z15: 6, z16: 7, rank: 12, centre: 8, selected: 9 },
  stopRing: 2,
  selectedRing: 4,
  /**
   * How far past its edge a dot or a line answers a finger: a stop at zoom 15 is a 40 px
   * target. The renderer's own is none, and a tap a few px off a dot landed on its route and
   * opened the lines there instead of the stop.
   */
  touchReach: 12,
  /**
   * The circle of the reader's accuracy, and the share of the way the fan of the way the phone
   * faces turns toward each new reading of the compass, which jitters a few degrees from one
   * reading to the next, and how long the dot takes, in ms, to slide to a new fix (about a
   * second apart, a few metres each). The dot and the fan are index.css's.
   */
  me: { accuracyFill: 0.12, turn: 0.3, glide: 400 },
  /** The point a small map is about, drawn as filled as the reader's own. */
  centreFill: 0.95,
  /** A line on the network map: faded behind the lines chosen, as the network, as a line chosen; the volta's dashes, in pixels. */
  route: { muted: 2, network: 3.5, subject: 5, mutedOpacity: 0.35, networkOpacity: 0.7, subjectOpacity: 0.95, returnDashPx: [10, 7] },
  /**
   * A planned trip: its bus legs, its walks (routed, or the straight stand-in), and everything not
   * the leg being made. The renderer measures dashes in line widths: walkDots are round dots a
   * width across, two widths apart, and walkGuessDashes 4 px on and 6 off at the guess's 3 px.
   */
  trip: { leg: 4, legNow: 6, legOpacity: 0.95, walk: 4, walkDots: [0, 2], walkOpacity: 0.9, walkGuess: 3, walkGuessDashes: [4 / 3, 2], walkGuessOpacity: 0.8, faint: 0.25 },
  /** The boxes drawn on a canvas or in an SVG: a route's arrow, and a bus (its marker's box is --spacing-map-bus). */
  icon: { arrow: 16, bus: 46 },
  /** A hover label's lift off the edge of the dot it names. */
  tooltip: { lift: -8 },
  /**
   * Room a map leaves around what it frames: the network's selection, the small map, a trip
   * (more at the top, under its chip), the reader followed; for what a tap opened a sheet over,
   * the room kept under the line chips and above the sheet; and the zoom bar's width with its
   * margin, kept clear on the right, and the attribution's line along the bottom, where
   * MapLibre's closer fit, at any zoom and not only whole ones, had put a stop or a pin under them.
   */
  fit: { network: 40, nearby: 28, trip: 28, tripTop: 56, follow: 40, sheetTop: 64, sheetGap: 24, zoomBar: 54, credit: 20 },
  /** The stop names written beside the dots: size, weight, gap from the dot's ring, halo, the screen edge they keep off, how far round one a tap still takes it, and the ms one takes to fade in or out (--transition-duration-swap's). */
  names: { size: 12, weight: 600, gap: 5, halo: 3, edge: 4, reach: 8, fade: 160 },
  /**
   * The margins a bus's popup is kept inside on the network map: under the line chips and the
   * buses' notice at the top of a phone's map, above the locate and controls buttons at its foot.
   */
  popupClear: { top: 124, left: 12, bottom: 80, right: 12 },
} as const;

/**
 * A stop dot's paint, the same on every map so a stop looks like a stop wherever it is drawn;
 * the one chosen turned inside out. `radius` is to the middle of the ring, as the dots were
 * always measured: MapLibre strokes outside the radius, so the fill gives up half the ring and
 * the dot keeps its size.
 */
export const stopDotPaint = (colors: MapColors, radius: number, selected = false) => {
  const ring = selected ? DRAW.selectedRing : DRAW.stopRing;
  return {
    'circle-radius': radius - ring / 2,
    'circle-color': selected ? colors.stopStroke : colors.stopFill,
    'circle-stroke-color': selected ? colors.stopSelected : colors.stopStroke,
    'circle-stroke-width': ring,
  };
};
