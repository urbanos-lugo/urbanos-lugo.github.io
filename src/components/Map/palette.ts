import type L from 'leaflet';

/**
 * The map's colours, for both palettes: index.css's --c-map-* tokens, read off <html> for
 * the palette live there now. Leaflet resolves a colour once, when a layer is created, so
 * `var(--c-ink)` in a layer's options would freeze to whatever it meant at that moment; the
 * map asks again for each palette, and each answer is kept.
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
  /** The names written beside the dots from zoom 16: the app's ink, haloed in its ground. */
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

export const mapColors = (isDark: boolean): MapColors => {
  const kept = readings.get(isDark);
  if (kept) return kept;
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const colors = Object.fromEntries(Object.entries(TOKENS).map(([role, token]) => [role, style.getPropertyValue(token).trim()])) as unknown as MapColors;
  // Kept only when it was read under the palette asked for, with the stylesheet in.
  if (root.classList.contains('dark') === isDark && colors.stopFill) readings.set(isDark, colors);
  return colors;
};

/**
 * The map's sizes, in CSS pixels, and its strengths, 0 to 1: the half of the design's
 * tokens that Leaflet takes as numbers, named for what they draw. index.css holds the rest,
 * the map's HTML markers included.
 */
export const DRAW = {
  /** A stop's dot: by zoom on the network map, the ride's calls, the small map's stops and its centre, and the one chosen. */
  stopRadius: { overview: 4, z14: 5, z15: 6, z16: 7, nearby: 6, centre: 8, selected: 9 },
  stopRing: 2,
  selectedRing: 4,
  /** The reader's position, and the circle of its accuracy around it. */
  me: { radius: 8, ring: 3, fill: 0.95, accuracyRing: 1, accuracyStroke: 0.35, accuracyFill: 0.12 },
  /** The point a small map is about, drawn as filled as the reader's own. */
  centreFill: 0.95,
  /** A line on the network map: faded behind the lines chosen, as the network, as a line chosen; the volta dashed. */
  route: { muted: 2, network: 3.5, subject: 5, mutedOpacity: 0.35, networkOpacity: 0.7, subjectOpacity: 0.95, returnDash: '10 7' },
  /** A planned trip: its bus legs, its walks (routed, or the straight stand-in), and everything not the leg being made. */
  trip: { leg: 4, legNow: 6, legOpacity: 0.95, walk: 4, walkDash: '1 7', walkOpacity: 0.9, walkGuess: 3, walkGuessDash: '4 6', walkGuessOpacity: 0.8, faint: 0.25 },
  /** The HTML markers' boxes: a route's arrow, a trip's A, B and boarding pins, a bus. */
  icon: { arrow: 16, pin: 28, bus: 46 },
  /** A hover label's lift off its dot (a small dot's less), and its opacity. */
  tooltip: { lift: -8, liftSmall: -6, opacity: 0.95 },
  /** Room a map leaves around what it frames: the network's selection, the small map, a trip (more at the top, under its chip), the reader followed. */
  fit: { network: 40, nearby: 28, trip: 28, tripTop: 56, follow: 40 },
  /** The stop names written beside the dots: size, weight, gap from the dot's ring, halo, and the screen edge they keep off. */
  names: { size: 12, weight: 600, gap: 5, halo: 3, edge: 4 },
  /** Panes over Leaflet's overlay canvas (400): the stop names, then the routes' arrows, then the reader's position, under the markers (600). */
  pane: { names: 420, arrows: 450, reader: 460 },
  /** Buses over every other marker. */
  busesOver: 1000,
} as const;

/** The Leaflet options for a stop dot, the same pair on every map so a stop looks like a stop wherever it is drawn; the one chosen turned inside out. */
export const stopDotStyle = (colors: MapColors, radius: number, selected = false): L.CircleMarkerOptions => ({
  radius: selected ? DRAW.stopRadius.selected : radius,
  color: selected ? colors.stopSelected : colors.stopStroke,
  weight: selected ? DRAW.selectedRing : DRAW.stopRing,
  fillColor: selected ? colors.stopStroke : colors.stopFill,
  fillOpacity: 1,
});

/**
 * The pane the reader's position is drawn in, which every map has (useLeafletMap): over all
 * the canvas holds, since in it a stop layer redrawn after the dot painted the stops over it,
 * and the reader was on top or underneath depending on what had changed last.
 */
export const READER_PANE = 'reader';

/** The reader's own position: information, not a thing to tap, which on the map took the tap of the stop the reader stood at. */
export const userDotStyle = (colors: MapColors): L.CircleMarkerOptions => ({
  radius: DRAW.me.radius,
  fillColor: colors.userFill,
  color: colors.userStroke,
  weight: DRAW.me.ring,
  opacity: 1,
  fillOpacity: DRAW.me.fill,
  interactive: false,
  pane: READER_PANE,
});
