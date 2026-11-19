/**
 * The basemap style, ours, derived from OpenFreeMap's published pair.
 *
 *   pnpm run map:style            # rebuild from the cached copies -- offline, free
 *   pnpm run map:style --fetch    # re-download the published styles first
 *
 * Writes `src/data/map-style-light.json` and `-dark.json`; change the tables below and
 * re-run rather than editing the JSON. Built once rather than patched at runtime because
 * the published colours painted first and ours a frame later, an endpoint that changed
 * shape left the app with no map, and an id that never existed was forgiven as quietly as
 * one upstream had renamed (the two styles name their layers differently, and the dark
 * adjustments never once applied to the light map). Here a wrong id refuses to build.
 *
 * Tiles, sprites and glyphs still come from tiles.openfreemap.org, so the CSP gains no
 * origin; the layers stay as published, in their published order, with one of ours on top
 * (LANDMARKS). The measurements behind every value are in design/DECIDIDO.md.
 *
 * Street names stay at every zoom. They faded out from 15 to 16.5, where the stop names
 * arrive, and a reader zoomed in to find a stop could not read the street it was on.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sleep } from './lib';
import { DRAW } from '../src/components/Map/palette';

const CACHE = '.cache/style';
const OUT = 'src/data';
const PUBLISHED = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** Their terms ask for the credit to stay visible; it is also written into the file. */
const ATTRIBUTION =
  '<a href="https://openfreemap.org/">OpenFreeMap</a> ' +
  '&copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

/** A paint property to set on one layer. `null` deletes the property instead. */
type Edit = readonly [layer: string, property: string, value: unknown];

/** Layers taken out: not because Lugo has none of it, but because it works against the screen. */
const DROP: Record<string, readonly string[]> = {
  // One-way arrows: nobody reading this is driving, they arrive at zoom 15 in the space
  // just cleared for the stop labels, and the sprite draws them across the street anyway.
  dark: ['road_oneway', 'road_oneway_opposite'],
  // A flat wash over every residential polygon, the same weight as the footprints, so
  // whole neighbourhoods came out as one tinted block. Dark already caps it at zoom 9.
  light: ['landuse_residential'],
};

/**
 * The places a reader finds a stop by, as the sprite's own icons, on top of the basemap, over
 * the app's lines and under its dots (mapLayers.ts, LAYER_ORDER). Neither published style draws
 * any point of interest. Five kinds, each named in the tiles by class and narrowed by subclass:
 * the class alone takes in clinics and care homes, every bus stop, the community centres and
 * the courts, and a professional association that OSM calls a college.
 * Their class is also the sprite's name for the icon.
 *
 * With their names, as OSM writes them, on the icon's right: an icon alone said "a station"
 * and not which, "a hospital" and not which one. An icon and its name go together or
 * not at all: where a name has no room, an icon alone was the thing that said nothing, and the place
 * shows whole a zoom step later. The stop names, on a canvas of their own that
 * MapLibre knows nothing of, step round these from zoom 15 where they can (StopNames.ts), and
 * are written anyway where they cannot: a stop's name matters more than a landmark's.
 *
 * In three tiers, so the map is not filled with them: what a reader finds a stop by from zoom
 * 13, and the Cathedral with it; the big parks and the museums from 15, a size smaller; the
 * wall's gates from 16, where the old town fills the screen. A higher tier is placed first,
 * so where two meet the lower one gives way. Each one chosen, not each one in the tiles: there
 * are 25 parks and squares, 6 museums and halls, and every church.
 */
const nameOf = ['coalesce', ['get', 'name'], ''];
const startsWith = (prefix: string) => ['==', ['slice', nameOf, 0, prefix.length], prefix];

/**
 * The parks that read as places from across the city: the six whose green measured over about
 * 25,000 m² in OpenFreeMap's tiles on 12 November 2026 (from 98,046 for Paulo Fabio to 26,897
 * for Rosalía de Castro, measured one tile at a time, so a park on a tile edge counts short).
 * The next is a garden at 24,188, then nothing over 22,000 that is called a park.
 */
const BIG_PARKS = ['Parque Paulo Fabio', 'Paseo do Miño', 'Parque da Chanca', 'Parque dos Paxariños', 'Parque de Paradai', 'Parque de Rosalía de Castro'];

const landmarkLayer = (id: string, minzoom: number, size: number, filter: unknown[]): Layer => ({
  id,
  type: 'symbol',
  source: 'openmaptiles',
  'source-layer': 'poi',
  minzoom,
  filter,
  layout: {
    'icon-image': ['get', 'class'],
    // The railway station's name in OSM is the city's, "Lugo", which said no more than the icon.
    'text-field': ['match', ['get', 'class'], 'railway', DRAW.landmarks.railway, ['get', 'name']],
    'text-font': ['Noto Sans Regular'],
    'text-size': size,
    'text-anchor': 'left',
    'text-justify': 'left',
    'text-offset': [DRAW.landmarks.offset, 0],
    'text-max-width': DRAW.landmarks.wrap,
  },
});

const [SQUARES, PARKS, GATES, MORE, MAIN] = DRAW.landmarks.layers;

/**
 * The squares, from OpenStreetMap's areas (tools/importSquares.ts): the tiles have a square only
 * as the line of its edge, so its name ran along a side and read as the next street's. A source
 * of their own, each feature with an id for the state that hides it under a stop's name.
 */
const SQUARES_SOURCE = 'urbanos-squares';
const SQUARE_LIST: { name: string; lat: number; lng: number }[] = JSON.parse(readFileSync('src/data/squares.json', 'utf8'));
const squaresSource = () => ({
  type: 'geojson',
  data: { type: 'FeatureCollection', features: SQUARE_LIST.map((s, i) => ({ type: 'Feature', id: i + 1, properties: { name: s.name }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) },
});
/** The basemap's street-name layers that wrote a square's name along its edge, named differently in each theme. */
const ALONG_THE_EDGE: Record<keyof typeof PUBLISHED, string[]> = {
  light: ['highway-name-path', 'highway-name-minor', 'highway-name-major'],
  dark: ['highway_name_other'],
};

/** Bottom to top, as they go into the style: the top one is placed first. */
const LANDMARKS: Layer[] = [
  {
    id: SQUARES,
    type: 'symbol',
    source: SQUARES_SOURCE,
    minzoom: 16,
    // Over the square, with no icon: the name is the place.
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': DRAW.landmarks.minor, 'text-max-width': DRAW.landmarks.wrap },
  },
  // Every other park with a name, a step after the six that read across the city; not the ones
  // called "Praza …", which the squares draw.
  landmarkLayer(PARKS, 16, DRAW.landmarks.minor, ['all', ['==', ['get', 'class'], 'park'], ['!=', nameOf, ''], ['!', ['in', nameOf, ['literal', BIG_PARKS]]], ['!', startsWith('Praza ')]]),
  landmarkLayer(GATES, 16, DRAW.landmarks.minor, ['all', ['==', ['get', 'class'], 'attraction'], startsWith('Porta ')]),
  // "Museo …" only: the others are an exhibition hall, a mosaic house and a site centre, one of
  // them called after the gate beside it.
  landmarkLayer(MORE, 15, DRAW.landmarks.minor, [
    'any',
    ['all', ['==', ['get', 'class'], 'museum'], startsWith('Museo ')],
    ['all', ['==', ['get', 'class'], 'park'], ['in', nameOf, ['literal', BIG_PARKS]]],
  ]),
  landmarkLayer(MAIN, 13, DRAW.landmarks.size, [
    'any',
    [
      'match',
      ['get', 'class'],
      ['hospital', 'railway', 'bus', 'town_hall'],
      ['match', ['get', 'subclass'], ['hospital', 'station', 'bus_station', 'townhall'], true, false],
      false,
    ],
    // The campus and its schools, not every building on it ("Aula Produtos Lácteos", "Edificio
    // Cactus"), and not `college`: in Lugo's tiles that is a professional association and a trade
    // school, which with their names written read as landmarks beside the hospitals.
    ['all', ['==', ['get', 'subclass'], 'university'], ['any', startsWith('Campus '), startsWith('Escola '), startsWith('Facultade ')]],
    ['all', ['==', ['get', 'class'], 'place_of_worship'], startsWith('Catedral ')],
  ]),
];

/**
 * Gone, icon and name, while a stop's name is written over it: the stop names set this state
 * (StopNames.ts) where a name had no side clear of a landmark, as a transit map lets the stop
 * win. Written one over the other, neither could be read.
 */
const SHOWN_UNLESS_COVERED = ['case', ['boolean', ['feature-state', DRAW.landmarks.covered], false], 0, 1];

/** The names in each theme's colours for a place's name, so they read as the map's and not the app's. */
const LANDMARK_PAINT: Record<keyof typeof PUBLISHED, Record<string, unknown>> = {
  light: { 'text-color': '#555', 'text-halo-color': '#fff', 'text-halo-width': 1.5, 'text-opacity': SHOWN_UNLESS_COVERED, 'icon-opacity': SHOWN_UNLESS_COVERED },
  dark: { 'text-color': '#a7aeb9', 'text-halo-color': '#171a1f', 'text-halo-width': 1.5, 'text-opacity': SHOWN_UNLESS_COVERED, 'icon-opacity': SHOWN_UNLESS_COVERED },
};

/**
 * The dark map. Published, everything sits inside seventeen levels of black, and for
 * years a `brightness(2.8)` filter on the tile pane hid that while leaving the routes
 * unmultiplied, which is why a bus line vanished into the street under it. These are the
 * values on the screen now: ground at the bottom, blocks a step up, streets above, and
 * every step held under the faintest route colour (line 11 at 1,76 over a major street).
 * If the basemap must ever be brighter, the lever is a casing under the route, not a step
 * here. Labels are measured against 4,5, because they are text.
 */
const DARK: readonly Edit[] = [
  ['background', 'background-color', '#171a1f'],
  ['water', 'fill-color', '#0e151d'],
  ['waterway', 'line-color', '#16232f'],
  ['building', 'fill-color', '#232830'],
  ['building', 'fill-outline-color', '#232830'],
  ['highway_minor', 'line-color', '#2b3038'],
  ['highway_major_inner', 'line-color', '#1e222a'],
  ['highway_motorway_inner', 'line-color', '#1e222a'],
  // Dark streets with a light edge, as upstream draws them: the casing is what makes a
  // street read as a street; the inner is what the route line has to survive.
  ['highway_major_casing', 'line-color', '#39404b'],
  ['highway_motorway_casing', 'line-color', '#39404b'],
  // The published style paints woodland with a `wood-pattern` its own sprite does not
  // carry, so every load logged an error and the woods came out unpainted. A set pattern
  // wins over a colour, so it goes.
  ['landcover_wood', 'fill-pattern', null],
  ['landcover_wood', 'fill-color', '#1e2a1b'],
  ['landuse_park', 'fill-color', '#1e2a1b'],
  ['highway_name_other', 'text-color', '#9098a5'],
  ['highway_name_motorway', 'text-color', '#9098a5'],
  ['place_other', 'text-color', '#a7aeb9'],
  ['place_suburb', 'text-color', '#a7aeb9'],
  ['place_village', 'text-color', '#a7aeb9'],
  ['place_town', 'text-color', '#c2c8d1'],
  ['place_city', 'text-color', '#c2c8d1'],
  ['water_name', 'text-color', '#7ba3c4'],
  ['water_name', 'text-halo-color', '#0b1119'],
];

/**
 * The light map. Positron's white streets are its design and stay; what did not hold up
 * was a building outline separating twice as well as its fill (a block as a wireframe)
 * and a fill that did not separate the city from the fields at all. So the outline takes
 * the fill's colour and the mass comes forward, the minor street joins the majors on the
 * light side, and the ground sits between. Woodland keeps its published colour: the dark
 * map's green painted 57% of the screen here. The city's parks are green (PARKS).
 *
 * A footpath's name runs through the parks, so it is measured on their green too: #767472
 * read 4.18 on the ground and 3.82 on the park; #626060 reads 5.61 and 4.78.
 */
const LIGHT: readonly Edit[] = [
  ['building', 'fill-color', '#dedcd4'],
  ['building', 'fill-outline-color', '#dedcd4'],
  ['highway_minor', 'line-color', '#fafaf9'],
  ['highway-name-path', 'text-color', '#626060'],
];

/**
 * The city's parks and gardens, green. Neither published style painted them: the light one's
 * "park" layer reads the protected areas and hill forts, and the dark one's a land use the
 * tiles never give a park. Only these two, measured over the 96 km² of tiles round Lugo on 12
 * November 2026: 0.8 % parks and 0.1 % gardens, against 27 % woodland, which is what turned the
 * light map green before. Just over the woodland, so under every street and building. The
 * dark one is the woodland's, already held under the faintest route.
 */
const PARKS_AFTER = 'landcover_wood';
const parks = (color: string): Layer => ({
  id: 'urbanos_parks',
  type: 'fill',
  source: 'openmaptiles',
  'source-layer': 'landcover',
  filter: ['all', ['==', ['get', 'class'], 'grass'], ['match', ['get', 'subclass'], ['park', 'garden'], true, false]],
  paint: { 'fill-color': color },
});
/** The light one at 1.17:1 on the ground: #e2ecdb, at 1.09, hardly told a park from a block. */
const PARK_GREEN: Record<keyof typeof PUBLISHED, string> = { light: '#d2e8c3', dark: '#1e2a1b' };

interface Layer {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
}
interface Style {
  version: number;
  sprite?: string;
  glyphs?: string;
  sources: Record<string, Record<string, unknown>>;
  layers: Layer[];
  [key: string]: unknown;
}

const THEMES = [
  ['light', 'positron'],
  ['dark', 'dark'],
] as const;

async function fetchPublished(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  for (const [theme, file] of THEMES) {
    const url = PUBLISHED[theme];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const body = await res.text();
    writeFileSync(join(CACHE, `${file}.json`), body);
    console.log(`fetched ${url} -- ${body.length} bytes`);
    await sleep(1100); // one request a second, the courtesy every other tool here keeps
  }
}

/** Apply the table, and refuse to write a style whose ids have drifted from ours. */
function derive(published: Style, edits: readonly Edit[], theme: keyof typeof PUBLISHED): Style {
  const style: Style = JSON.parse(JSON.stringify(published));
  const has = (id: string) => style.layers.some((l) => l.id === id);

  const gone = new Set(DROP[theme] ?? []);
  const absent = [...gone].filter((id) => !has(id));
  if (absent.length) throw new Error(`${theme}: cannot drop ${absent.join(', ')}; the published style has no such layer. Upstream removed it, so remove it from DROP too rather than leaving a stale reason.`);
  style.layers = style.layers.filter((l) => !gone.has(l.id));

  const missing = [...new Set(edits.map(([id]) => id))].filter((id) => !has(id));
  if (missing.length) throw new Error(`${theme}: the published style has no layer ${missing.join(', ')}. Upstream renamed or dropped it -- fix the table rather than skipping it.`);

  const byId = new Map(style.layers.map((l) => [l.id, l]));
  for (const [id, property, value] of edits) {
    const paint = (byId.get(id)!.paint ??= {});
    if (value === null) delete paint[property];
    else paint[property] = value;
  }
  const wood = style.layers.findIndex((l) => l.id === PARKS_AFTER);
  if (wood < 0) throw new Error(`${theme}: the published style has no layer ${PARKS_AFTER} to put the parks over. Upstream renamed or dropped it -- fix PARKS_AFTER.`);
  style.layers.splice(wood + 1, 0, parks(PARK_GREEN[theme]));
  // A square named at its centre is not written again along its edge.
  const squareNames = ['literal', SQUARE_LIST.map((s) => s.name)];
  for (const id of ALONG_THE_EDGE[theme]) {
    const layer = byId.get(id);
    if (!layer) throw new Error(`${theme}: the published style has no layer ${id} to keep the squares' names off. Upstream renamed it -- fix ALONG_THE_EDGE.`);
    layer.filter = ['all', layer.filter, ['!', ['in', nameOf, squareNames]]];
  }
  style.sources[SQUARES_SOURCE] = squaresSource();
  style.layers.push(...LANDMARKS.map((layer) => ({ ...layer, paint: LANDMARK_PAINT[theme] })));

  // The credit travels with the file as well as with the map control.
  for (const source of Object.values(style.sources)) source.attribution = ATTRIBUTION;
  style.metadata = {
    'urbanos-lugo:derived-from': PUBLISHED[theme],
    'urbanos-lugo:note': 'Generated by tools/buildMapStyle.ts -- do not edit by hand. Tiles, sprites and glyphs are still served by OpenFreeMap.',
  };
  return style;
}

if (process.argv.includes('--fetch')) await fetchPublished();

for (const [theme, file] of THEMES) {
  const source = join(CACHE, `${file}.json`);
  if (!existsSync(source)) throw new Error(`${source} is missing. Run with --fetch once to download it.`);
  const edits = theme === 'dark' ? DARK : LIGHT;
  const style = derive(JSON.parse(readFileSync(source, 'utf8')) as Style, edits, theme);
  const out = join(OUT, `map-style-${theme}.json`);
  writeFileSync(out, JSON.stringify(style));
  console.log(`${out}  ${style.layers.length} layers, ${edits.length} edits, ${(JSON.stringify(style).length / 1024).toFixed(1)} KB`);
}
console.log(`${THEMES.length} styles written.`);
