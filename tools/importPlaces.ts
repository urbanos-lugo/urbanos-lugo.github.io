/**
 * The places people go to by name, for Ruta's search: villages and hamlets, cinemas, chemists,
 * churches, schools, offices, restaurants, shops. Before this the planner knew 28 written by
 * hand, and «Cines Cristal» found nothing; nor did most of the villages the rural lines serve,
 * whose people know the village and not a street. This asks Overpass once, by hand, for every
 * named feature of the kinds below in BBOX, keeps the ones within a walk of a stop (a place
 * 3 km from every stop is no bus destination) and writes a point for each to
 * src/data/places.json.
 *
 * Two features with one name within 250 m are one place (the building and its entrance). The
 * same name further apart is two places, told apart by the neighbourhood of the nearest stop:
 * a bank's or a supermarket's several branches.
 *
 * Reads the Overpass API, a server this project does not own: run it by hand
 * (`pnpm run data:places`), never in a loop. The answer is cached under .cache/ and the
 * output is committed, so a rebuild costs nothing. ODbL, like the route geometry: DATA.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { metresBetween } from '../src/utils/geo';
import { getNearestStopToCoords } from '../src/utils/places';
import { normalizeText } from '../src/utils/searchUtils';
import { BBOX, overpass } from './osm';

const CACHE = '.cache/places-overpass.json';
const OUT = 'src/data/places.json';

/** Every key a named place is mapped under, in the order a feature's kind is read from them. */
const KEYS = ['amenity', 'shop', 'office', 'healthcare', 'leisure', 'tourism', 'historic', 'craft', 'place', 'building', 'landuse', 'man_made', 'club', 'sport'];
const QUERY = `[out:json][timeout:180];
(
${KEYS.map((key) => `  nwr["${key}"]["name"](${BBOX});`).join('\n')}
);
out tags center;`;
/** The walk to the nearest stop past which a place is not one a bus takes anybody to. */
const WITHIN_WALK_M = 1500;

interface Element {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags: Record<string, string>;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}
export interface Place {
  name: string;
  lat: number;
  lng: number;
  kind: string;
}

const SAME_PLACE_M = 250;

/** One name however it is written: «Frutas el Castillo» and «Frutas El Castillo» are one shop's. */
const key = (name: string) => normalizeText(name);

/**
 * What tells two places of one name apart: the stop nearest them, which is also where the bus
 * leaves you. Not the street: OSM has no address for most of them (none within 60 m of the
 * Gadis on Praza Fonte dos Ranchos), and the nearest street's line called that one «Rúa do
 * Sabugo». Not the neighbourhood either: two Gadis in one were still «Gadis (Fonte dos Ranchos)».
 */
const whereIs = (lat: number, lng: number) => getNearestStopToCoords(lat, lng).stop.name;

/** The places out of an Overpass answer: kept when a walk from a stop, merged when they are one, named apart when they are two, sorted. */
export function placesOf(elements: Element[]): Place[] {
  const kept: Place[] = [];
  for (const el of elements) {
    const name = el.tags.name?.trim();
    const at = el.type === 'node' ? (el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : undefined) : el.center;
    const kind = KEYS.map((k) => el.tags[k] ?? '').find(Boolean);
    if (!name || !at || !kind) continue;
    if (getNearestStopToCoords(at.lat, at.lon).walkMeters > WITHIN_WALK_M) continue;
    if (kept.some((p) => key(p.name) === key(name) && metresBetween(p.lat, p.lng, at.lat, at.lon) < SAME_PLACE_M)) continue;
    kept.push({ name, lat: Number(at.lat.toFixed(5)), lng: Number(at.lon.toFixed(5)), kind });
  }
  const count = new Map<string, number>();
  for (const p of kept) count.set(key(p.name), (count.get(key(p.name)) ?? 0) + 1);
  const named = kept.map((p) => (count.get(key(p.name))! > 1 ? { ...p, name: `${p.name} (${whereIs(p.lat, p.lng)})` } : p));
  // Two on one street, or by one stop, are numbered: rare, and a name has to be one place.
  const seen = new Map<string, number>();
  return named
    .sort((a, b) => a.name.localeCompare(b.name, 'gl') || a.lat - b.lat)
    .map((p) => {
      const n = (seen.get(key(p.name)) ?? 0) + 1;
      seen.set(key(p.name), n);
      return n === 1 ? p : { ...p, name: `${p.name} ${n}` };
    });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  let json = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : null;
  if (!json) {
    console.log(`Asking Overpass for the named places in ${BBOX}...`);
    json = await overpass(QUERY);
    if (!json) throw new Error('Overpass would not answer; nothing written.');
    mkdirSync('.cache', { recursive: true });
    writeFileSync(CACHE, JSON.stringify(json));
  } else console.log(`Read ${CACHE}; delete it to ask Overpass again.`);
  const places = placesOf(json.elements);
  // The kind is for this summary only: the app searches by name, and it was 5 KB of the bundle.
  writeFileSync(OUT, `${JSON.stringify(places.map(({ name, lat, lng }) => ({ name, lat, lng })), null, 1)}\n`);
  const kinds = new Map<string, number>();
  for (const p of places) kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + 1);
  console.log(`${places.length} places from ${json.elements.length} features -> ${OUT}`);
  console.log(`  ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
