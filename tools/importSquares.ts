/**
 * The city's squares as places on the map: a name and a point inside it. The basemap's tiles
 * carry a square only as the line of its edge, in the street-name layer, so its name was
 * written along a side of it and read as the next street's. OpenStreetMap has the square as
 * an area; this asks Overpass once, by hand, for every named one in BBOX and writes its
 * centre to src/data/squares.json, which buildMapStyle.ts draws.
 *
 * A square is an area tagged place=square, or a pedestrian area, a pedestrian ring or a park
 * named as one. A street named "Praza ..." that is an open line is a street, and stays a
 * street name. Several areas with one name (a square split by a road) are one square,
 * centred over all of them.
 *
 * Reads the Overpass API, a server this project does not own: run it by hand
 * (`pnpm run data:squares`), never in a loop. The answer is cached under .cache/ and the
 * output is committed, so a rebuild costs nothing. ODbL, like the route geometry: DATA.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { BBOX, overpass } from './osm';

const CACHE = '.cache/squares-overpass.json';
const OUT = 'src/data/squares.json';
const SQUARE_NAME = /^(praza|prazuela|plaza|campo|cantón)\b/i;

// Praza Maior is mapped as a park, and Santo Domingo or Pío XII as a pedestrian street closed
// round the square without area=yes: both name the square, and a ring's centre is inside it.
const NAMED = '["name"~"^(Praza|Prazuela|Plaza|Campo|Cantón)",i]';
const QUERY = `[out:json][timeout:120];
(
  way["place"="square"]["name"](${BBOX});
  relation["place"="square"]["name"](${BBOX});
  way["highway"="pedestrian"]${NAMED}(${BBOX});
  relation["highway"="pedestrian"]["type"="multipolygon"]${NAMED}(${BBOX});
  way["leisure"="park"]${NAMED}(${BBOX});
  relation["leisure"="park"]${NAMED}(${BBOX});
);
out tags geom;`;

type Point = { lat: number; lon: number };
interface Element {
  type: 'way' | 'relation';
  id: number;
  tags: Record<string, string>;
  geometry?: Point[];
  members?: { role: string; geometry?: Point[] }[];
}
export interface Square {
  name: string;
  lat: number;
  lng: number;
}

/** A closed ring's signed area and centroid, on a flat projection fine at a square's size. */
function ring(points: Point[]): { area: number; lat: number; lng: number } {
  const k = Math.cos((points[0].lat * Math.PI) / 180);
  let a = 0, x = 0, y = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0, x1, y1] = [points[i].lon * k, points[i].lat, points[i + 1].lon * k, points[i + 1].lat];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  return a === 0 ? { area: 0, lat: points[0].lat, lng: points[0].lon } : { area: Math.abs(a / 2), lat: y / (3 * a), lng: x / (3 * a) / k };
}

const closed = (g?: Point[]): g is Point[] => !!g && g.length > 3 && g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;

/** The squares out of an Overpass answer: kept, grouped by name, centred, sorted. */
export function squaresOf(elements: Element[]): Square[] {
  const byName = new Map<string, { area: number; lat: number; lng: number }[]>();
  for (const el of elements) {
    const name = el.tags.name?.trim();
    if (!name) continue;
    if (el.tags.place !== 'square' && !SQUARE_NAME.test(name)) continue;
    const rings = el.type === 'way' ? [el.geometry] : (el.members ?? []).filter((m) => m.role === 'outer').map((m) => m.geometry);
    const parts = rings.filter(closed).map(ring).filter((r) => r.area > 0);
    if (parts.length) byName.set(name, [...(byName.get(name) ?? []), ...parts]);
  }
  return [...byName]
    .map(([name, parts]) => {
      const total = parts.reduce((s, p) => s + p.area, 0);
      const lat = parts.reduce((s, p) => s + p.lat * p.area, 0) / total;
      const lng = parts.reduce((s, p) => s + p.lng * p.area, 0) / total;
      return { name, lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'gl'));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let json = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null;
  if (!json) {
    console.log(`Asking Overpass for the named squares in ${BBOX}...`);
    json = await overpass(QUERY);
    if (!json) throw new Error('Overpass would not answer; nothing written.');
    mkdirSync('.cache', { recursive: true });
    writeFileSync(CACHE, JSON.stringify(json));
  } else console.log(`Read ${CACHE}; delete it to ask Overpass again.`);
  const squares = squaresOf(json.elements);
  writeFileSync(OUT, `${JSON.stringify(squares, null, 1)}\n`);
  console.log(`${squares.length} squares from ${json.elements.length} areas -> ${OUT}`);
  for (const s of squares) console.log(`  ${s.name.padEnd(48)} ${s.lat}, ${s.lng}`);
}
