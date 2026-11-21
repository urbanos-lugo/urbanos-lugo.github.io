/**
 * The places people go to by name, for Ruta's search: villages and hamlets, cinemas, chemists,
 * churches, schools, offices, restaurants, shops. Before this the planner knew 28 written by
 * hand, and «Cines Cristal» found nothing; nor did most of the villages the rural lines serve,
 * whose people know the village and not a street.
 *
 * Four sources, each trusted for what it keeps best:
 * - OpenStreetMap: every named feature of the kinds below in BBOX. The base, and the only one
 *   for villages, churches, parks and the shops of one owner. A quarter of its shops had not
 *   been looked at since before 2023, and one bank among them had closed years before.
 * - AllThePlaces: the branches each chain publishes in its own branch finder, scraped weekly.
 *   For a chain it has, its branches replace OSM's: the closed bank's branch finder had it
 *   116 m away, on another street.
 * - SERGAS, the Galician health service: every chemist, health centre and hospital. A chemist
 *   OSM has and SERGAS has not is gone; one SERGAS has and OSM has not is added.
 * - The Xunta's register of schools: each school by its official name and point.
 * - data/places-checked.json: the shops, bars and offices of OSM's that a search of each by
 *   name, place by place, found closed, elsewhere, gone or under another name (DATA.md has how).
 *   Only the verdict is kept, against the OSM edit it was made on: once somebody edits that
 *   element in OSM again, it is looked at afresh and the verdict lapses.
 *
 * Only places within a walk of a stop are kept (a place 3 km from every stop is no bus
 * destination). Two of one name within 250 m are one place; further apart, two, told apart
 * by the stop nearest each. The OSM and AllThePlaces ones go to src/data/places.json (ODbL;
 * AllThePlaces is CC0); the health service's and the Xunta's to src/data/official-places.json,
 * which stays apart because it is CC BY-SA 4.0. DATA.md has both.
 *
 * Asks the Overpass API, AllThePlaces' archive, SERGAS's map and the Xunta's open data portal,
 * servers this project does not own: run it by hand (`pnpm run data:places`), never in a loop.
 * Every answer is cached under .cache/, one file a source, and the output is committed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { metresBetween } from '../src/utils/geo';
import { getNearestStopToCoords } from '../src/utils/places';
import { normalizeText } from '../src/utils/searchUtils';
import { sleep } from './lib';
import { BBOX, overpass } from './osm';
import { pointsInBox, type ReadRange, type TilePoint } from './pmtiles';

const OUT = 'src/data/places.json';
const OUT_OFFICIAL = 'src/data/official-places.json';
const CHECKED = 'data/places-checked.json';
const CACHE = {
  osm: '.cache/places-meta-overpass.json',
  brands: '.cache/places-allTheplaces.json',
  health: '.cache/places-sergas.json',
  schools: '.cache/places-xunta-schools.csv',
};
const AGENT = { 'User-Agent': 'UrbanosLugoOpenData/1.0' };
const [SOUTH, WEST, NORTH, EAST] = BBOX.split(',').map(Number);

/** Every key a named place is mapped under, in the order a feature's kind is read from them. */
const KEYS = ['amenity', 'shop', 'office', 'healthcare', 'leisure', 'tourism', 'historic', 'craft', 'place', 'building', 'landuse', 'man_made', 'club', 'sport'];
const QUERY = `[out:json][timeout:180];
(
${KEYS.map((key) => `  nwr["${key}"]["name"](${BBOX});`).join('\n')}
);
out tags meta center;`;
/** The walk to the nearest stop past which a place is not one a bus takes anybody to. */
const WITHIN_WALK_M = 1500;
/** Two of one name nearer than this are one place: a building and its entrance. */
const SAME_PLACE_M = 250;
/** How far a chain's branch or a chemist may sit from OSM's point and still be that one. */
const SAME_BRANCH_M = 150;
/** One building: a chain's point and OSM's this close are one branch wherever either put it. */
const SAME_BUILDING_M = 60;
/** How far a chain's branch may have moved and still be the one OSM has. */
const MOVED_M = 300;
/** OSM's `check_date` this recent outweighs a chain's finder: someone saw it there. */
const RECENT_MONTHS = 18;
/** And a health centre or a school, named in two ways, from OSM's. */
const SAME_NAMED_M = 400;

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags: Record<string, string>;
  timestamp?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
}
/** A point of SERGAS's map: the layer it is drawn in, its name (a chemist's is a code) and fields. */
export interface HealthPoint {
  folder: string;
  name: string;
  lat: number;
  lng: number;
  fields: Record<string, string>;
}
export interface SchoolPoint {
  name: string;
  lat: number;
  lng: number;
}
export interface Place {
  name: string;
  lat: number;
  lng: number;
  /** `key=value` from OSM or AllThePlaces; `official:<layer>` from the lists. */
  kind: string;
  source: 'osm' | 'brand' | 'official';
  /** OSM's last edit, for the summary. */
  edited?: string;
}
export interface Dropped {
  name: string;
  kind: string;
  edited?: string;
  why: string;
}
/** An OSM element a check found gone: `osm` is `node/123`, `edited` its timestamp then. */
export interface Gone {
  osm: string;
  name: string;
  edited: string;
  seen: 'closed' | 'elsewhere' | 'absent' | 'renamed';
}

/** One name however it is written: «Frutas el Castillo» and «Frutas El Castillo» are one shop's. */
const key = (name: string) => normalizeText(name);
const near = (p: { lat: number; lng: number }) => getNearestStopToCoords(p.lat, p.lng).walkMeters <= WITHIN_WALK_M;

/**
 * Whether two names of one place, written by two hands, share a word that tells it apart:
 * «CEIP Rosalía de Castro» and «Colexio de Educación Infantil e Primaria Rosalía de Castro»,
 * «HOSPITAL QUIRON SALUD LUGO» and «Hospital Quirónsalud Lugo». Spaces are ignored.
 */
const GENERIC = new Set(
  'ceip cpi ies cpr eei cifp epa colexio colegio escola escuela infantil plurilingue publico publica centro centros saude salud hospital hospitalario universitario complexo consultorio unidade lugo educacion primaria secundaria instituto formacion profesional integrado especial adultos permanente nosa senora santa san'.split(' '),
);
const distinctive = (s: string) => key(s).split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !GENERIC.has(w));
const squash = (s: string) => key(s).replace(/[^a-z0-9]/g, '');
export const sameNamed = (a: string, b: string) => distinctive(a).some((w) => squash(b).includes(w)) || distinctive(b).some((w) => squash(a).includes(w));

/** SERGAS writes in capitals and without accents: «CENTRO SAUDE A MILAGROSA» is «Centro de Saúde A Milagrosa». */
const ACCENTED: Record<string, string> = { saude: 'Saúde', psiquiatrico: 'Psiquiátrico', dia: 'Día', policlinico: 'Policlínico', quiron: 'Quirón', corazon: 'Corazón', atencion: 'Atención', doazon: 'Doazón' };
const LOWER = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'del', 'la', 'y']);
export function tidyName(caps: string): string {
  return caps
    .toLowerCase()
    .replace(/^centro saude\b/, 'centro de saude')
    .split(' ')
    .map((word, i) =>
      word.replace(/[a-zñáéíóúü]+/g, (core) => {
        if (/^\(\w{2,4}\)$/.test(word)) return core.toUpperCase();
        if (ACCENTED[core]) return ACCENTED[core];
        return i > 0 && LOWER.has(core) ? core : core[0].toUpperCase() + core.slice(1);
      }),
    )
    .join(' ');
}

/** Pairs a with b, nearest first, each used once, within `maxM` and where `match` agrees. */
function pairUp<A extends { lat: number; lng: number }, B extends { lat: number; lng: number }>(as: A[], bs: B[], maxM: number, match: (a: A, b: B) => boolean = () => true) {
  const options: { a: A; b: B; d: number }[] = [];
  for (const a of as) for (const b of bs) {
    const d = metresBetween(a.lat, a.lng, b.lat, b.lng);
    if (d <= maxM && match(a, b)) options.push({ a, b, d });
  }
  options.sort((x, y) => x.d - y.d);
  const usedA = new Set<A>();
  const usedB = new Set<B>();
  const pairs: [A, B][] = [];
  for (const { a, b } of options) {
    if (usedA.has(a) || usedB.has(b)) continue;
    usedA.add(a);
    usedB.add(b);
    pairs.push([a, b]);
  }
  return { pairs, onlyA: as.filter((a) => !usedA.has(a)), onlyB: bs.filter((b) => !usedB.has(b)) };
}

/** Not somewhere one goes to by name: a letterbox, a charger, a parcel locker, a cash machine. */
const NOT_A_DESTINATION = /^(post_box|charging_station|parcel_locker|vending_machine|atm|bicycle_rental|compressed_air|telephone)$/;

type OsmPlace = Place & { brand: string; brandId: string; checked: string };

/**
 * The places of the sources, merged: see the head of this file for who wins what.
 * `recentSince` is the date from which an OSM `check_date` counts as recent; `gone`, the OSM
 * elements a check found gone, and `checkedOn` the day of that check.
 */
export function mergePlaces(sources: { osm: OsmElement[]; brands: TilePoint[]; health: HealthPoint[]; schools: SchoolPoint[]; recentSince: string; gone?: Gone[]; checkedOn?: string }): {
  places: Place[];
  dropped: Dropped[];
  moved: Dropped[];
  lapsed: Dropped[];
} {
  const dropped: Dropped[] = [];
  const moved: Dropped[] = [];
  const lapsed: Dropped[] = [];
  const drop = (p: Place, why: string) => dropped.push({ name: p.name, kind: p.kind, edited: p.edited, why });
  const gone = new Map((sources.gone ?? []).map((g) => [g.osm, g]));

  let osm: OsmPlace[] = [];
  for (const el of sources.osm) {
    const name = el.tags.name?.trim();
    const at = el.type === 'node' ? (el.lat !== undefined && el.lon !== undefined ? { lat: el.lat, lon: el.lon } : undefined) : el.center;
    const k = KEYS.find((x) => el.tags[x]);
    if (!name || !at || !k) continue;
    const kind = `${k}=${el.tags[k]}`;
    const checked = [el.tags.check_date ?? '', el.tags['survey:date'] ?? ''].sort().pop()!;
    const p = { name, lat: at.lat, lng: at.lon, kind, source: 'osm' as const, edited: el.timestamp?.slice(0, 10), brand: el.tags.brand ?? '', brandId: el.tags['brand:wikidata'] ?? '', checked };
    if (!near(p)) continue;
    // Found gone by the check, unless OSM has had it edited since: then it is a new account of
    // the place, kept, and listed to be looked at again.
    const g = gone.get(`${el.type}/${el.id}`);
    if (g && g.edited === el.timestamp) drop(p, `${g.seen} when searched for on ${sources.checkedOn}`);
    else {
      if (g) lapsed.push({ name, kind, edited: p.edited, why: `found ${g.seen} on ${sources.checkedOn}, edited in OSM since` });
      osm.push(p);
    }
  }

  // Chains: for each brand AllThePlaces has here, the brand's branches replace OSM's.
  const branches = sources.brands
    .filter((b) => !NOT_A_DESTINATION.test(String(b.properties.amenity ?? '')) && !/mailboxes/.test(String(b.properties['@spider'] ?? '')))
    .map((b) => {
      // The brand only: a point's own name is the branch's («CONCEPCION ARENAL», a Gadis),
      // and grouped by it, it would take OSM's places of that name for the chain's.
      const brand = String(b.properties.brand ?? '').trim();
      const k = KEYS.find((x) => b.properties[x]);
      return { name: brand, lat: b.lat, lng: b.lng, kind: k ? `${k}=${b.properties[k]}` : 'brand', source: 'brand' as const, brandId: String(b.properties['brand:wikidata'] ?? '') };
    })
    .filter((b) => b.name.length > 2 && near(b));
  const brandPlaces: Place[] = [];
  const byBrand = new Map<string, typeof branches>();
  for (const b of branches) byBrand.set(b.brandId || key(b.name), [...(byBrand.get(b.brandId || key(b.name)) ?? []), b]);
  for (const group of byBrand.values()) {
    const { name, brandId } = group[0];
    const b = key(name);
    const kinds = new Set(group.map((g) => g.kind));
    // OSM's branch of the chain: its name, or the chain's tag on the same kind of place. A
    // dealer tagged with the brand under its own name («Comunicaciones Devesa», for a phone
    // company) is a shop of its own, which the brand's finder of its own stores does not list.
    const ofBrand = (p: OsmPlace) => [p.brand && kinds.has(p.kind) ? p.brand : '', p.name].some((v) => !!v && (key(v) === b || key(v).startsWith(`${b} `))) || (!!brandId && p.brandId === brandId && kinds.has(p.kind));
    const theirs = osm.filter(ofBrand);
    const same = pairUp(theirs, group, SAME_BUILDING_M);
    // A chain none of whose points falls on one of OSM's branches puts them somewhere else,
    // the street's or the postcode's (a hotel 865 m out, a sports shop 7.5 km): OSM's stay as
    // they are, and the chain's are not added beside them.
    if (theirs.length && !same.pairs.length) continue;
    osm = osm.filter((p) => !ofBrand(p));
    for (const [o] of same.pairs) brandPlaces.push({ name, lat: o.lat, lng: o.lng, kind: o.kind, source: 'brand' });
    // A chain that does put them on its branches has moved one OSM has a street away: the
    // closed bank was 116 m from the bank's branch.
    const rest = pairUp(same.onlyA, same.onlyB, MOVED_M);
    for (const [o, a] of rest.pairs) {
      // Unless somebody checked OSM's on the spot lately: then the finder's point is the one off.
      const seen = o.checked >= sources.recentSince;
      brandPlaces.push({ name, lat: seen ? o.lat : a.lat, lng: seen ? o.lng : a.lng, kind: o.kind, source: 'brand' });
      if (!seen) moved.push({ name: o.name, kind: o.kind, edited: o.edited, why: `${Math.round(metresBetween(o.lat, o.lng, a.lat, a.lng))} m off ${name}'s own branch finder` });
    }
    for (const a of rest.onlyB) brandPlaces.push({ name, lat: a.lat, lng: a.lng, kind: a.kind, source: 'brand' });
    // One the chain does not list is gone, unless somebody checked it on the spot lately: a
    // finder can miss a franchise, and a survey of last summer outweighs it.
    for (const o of rest.onlyA) {
      if (o.checked >= sources.recentSince) brandPlaces.push({ name, lat: o.lat, lng: o.lng, kind: o.kind, source: 'brand' });
      else drop(o, `not in ${name}'s own branch finder, nor checked on the spot since ${sources.recentSince}`);
    }
  }

  // Chemists: SERGAS lists every one. OSM's name, where it has one, is the one on the door.
  const health = sources.health.filter(near);
  const isChemist = (h: HealthPoint) => /^[A-Z]{1,2}-\d+-F$/.test(h.name);
  const chemists = pairUp(osm.filter((p) => p.kind === 'amenity=pharmacy'), health.filter(isChemist), SAME_BRANCH_M);
  for (const [o, h] of chemists.pairs) {
    // Most are mapped by the owner's name alone, which «farmacia» did not find; and some by an
    // owner the health service no longer lists there. A name of the shop's own («Farmacia
    // Pardo», «Lugonorte») stays; a person's that is not the owner's is dropped for «Farmacia».
    const owners = ['TITULAR1', 'TITULAR2', 'TITULAR3'].map((f) => h.fields[f] ?? '').join(' ');
    if (/farmac/i.test(o.name)) continue;
    if (!sameNamed(o.name, owners) && o.name.split(/\s+/).length >= 3) {
      moved.push({ name: o.name, kind: o.kind, edited: o.edited, why: 'the health service lists another owner there' });
      o.name = 'Farmacia';
    } else o.name = `Farmacia ${o.name}`;
  }
  for (const gone of chemists.onlyA) drop(gone, 'no chemist of the health service there');
  osm = osm.filter((p) => !chemists.onlyA.includes(p));
  const official: Place[] = chemists.onlyB.map((h) => ({ name: 'Farmacia', lat: h.lat, lng: h.lng, kind: 'official:chemist', source: 'official' }));

  // Health centres and hospitals: OSM's where it has them; SERGAS's where it has not.
  const isCare = (p: OsmPlace) => /^amenity=(hospital|clinic|doctors)$|^healthcare=(hospital|centre|clinic|doctor)$/.test(p.kind);
  const care = health.filter((h) => !isChemist(h) && !/sangue|sangre/i.test(`${h.folder} ${h.name}`));
  const centres = pairUp(osm.filter(isCare), care, SAME_NAMED_M, (o, h) => sameNamed(o.name, h.name));
  for (const h of centres.onlyB) official.push({ name: tidyName(h.name), lat: h.lat, lng: h.lng, kind: `official:${key(h.folder)}`, source: 'official' });

  // Schools: the Xunta's name and point for each it registers.
  // The register has the conservatories and the language school too, which OSM maps as such.
  const isSchool = (p: OsmPlace) => /^amenity=(school|kindergarten|college|music_school|dancing_school|language_school|prep_school)$|^building=school$/.test(p.kind);
  // Every OSM entry that names one, not only the first: OSM has some twice, the school and
  // its building («Edificio Principal do Colexio de Paradai»), or under two names.
  const registered = sources.schools.filter(near);
  osm = osm.filter((p) => !(isSchool(p) && registered.some((s) => sameNamed(p.name, s.name) && metresBetween(p.lat, p.lng, s.lat, s.lng) <= SAME_NAMED_M)));
  for (const s of registered) official.push({ name: s.name.trim(), lat: s.lat, lng: s.lng, kind: 'official:school', source: 'official' });

  // One place a name and point: the official first, then the brand's, then OSM's.
  const kept: Place[] = [];
  for (const p of [...official, ...brandPlaces, ...osm.map(({ brand: _b, brandId: _i, checked: _c, ...p }) => p)]) {
    if (kept.some((q) => key(q.name) === key(p.name) && metresBetween(q.lat, q.lng, p.lat, p.lng) < SAME_PLACE_M)) continue;
    kept.push({ ...p, lat: Number(p.lat.toFixed(5)), lng: Number(p.lng.toFixed(5)) });
  }
  return { places: nameApart(kept), dropped, moved, lapsed };
}

/**
 * What tells two places of one name apart: the stop nearest them, which is also where the bus
 * leaves you. Not the street: OSM has no address for most of them (none within 60 m of the
 * Gadis on Praza Fonte dos Ranchos), and the nearest street's line called that one «Rúa do
 * Sabugo». Not the neighbourhood either: two Gadis in one were still «Gadis (Fonte dos Ranchos)».
 */
function nameApart(kept: Place[]): Place[] {
  const whereIs = (p: Place) => getNearestStopToCoords(p.lat, p.lng).stop.name;
  const count = new Map<string, number>();
  for (const p of kept) count.set(key(p.name), (count.get(key(p.name)) ?? 0) + 1);
  const named = kept.map((p) => (count.get(key(p.name))! > 1 ? { ...p, name: `${p.name} (${whereIs(p)})` } : p));
  // Two by one stop are numbered: rare, and a name has to be one place.
  const seen = new Map<string, number>();
  return named
    .sort((a, b) => a.name.localeCompare(b.name, 'gl') || a.lat - b.lat)
    .map((p) => {
      const n = (seen.get(key(p.name)) ?? 0) + 1;
      seen.set(key(p.name), n);
      return n === 1 ? p : { ...p, name: `${p.name} ${n}` };
    });
}

/** The file named `name` out of a zip, read from its central directory: SERGAS answers KMZ. */
export function unzipEntry(zip: Uint8Array, name: string): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let end = zip.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip');
  let at = view.getUint32(end + 16, true);
  for (let i = view.getUint16(end + 10, true); i > 0; i--) {
    const [nameLength, extra, comment] = [28, 30, 32].map((o) => view.getUint16(at + o, true));
    if (new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength)) === name) {
      const local = view.getUint32(at + 42, true);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = zip.subarray(start, start + view.getUint32(at + 20, true));
      return view.getUint16(at + 10, true) === 0 ? data : new Uint8Array(inflateRawSync(data));
    }
    at += 46 + nameLength + extra + comment;
  }
  throw new Error(`${name} is not in the zip`);
}

/** The placemarks of a SERGAS KML: the layer each is drawn in, and the fields of its table. */
export function healthPointsOf(kml: string): HealthPoint[] {
  const out: HealthPoint[] = [];
  let folder = '';
  for (const m of kml.matchAll(/<Folder[^>]*>\s*<name>([^<]*)<\/name>|<Placemark>\s*<name>([^<]*)<\/name>([\s\S]*?)<\/Placemark>/g)) {
    if (m[1] !== undefined) {
      folder = m[1].trim();
      continue;
    }
    const at = m[3].match(/<coordinates>\s*([-\d.]+),([-\d.]+)/);
    if (!at) continue;
    const fields: Record<string, string> = {};
    // An empty field is written as an escaped «<Null>».
    for (const f of m[3].matchAll(/<td>([A-Z0-9_]+)<\/td>\s*<td>([^<]*)<\/td>/g)) if (!/Null/.test(f[2])) fields[f[1]] = f[2].trim();
    out.push({ folder, name: m[2].trim(), lat: Number(at[2]), lng: Number(at[1]), fields });
  }
  return out;
}

/** A CSV with quoted fields, as the Xunta's portal writes it. */
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n') row.push(cell.replace(/\r$/, '')), rows.push(row), (row = []), (cell = '');
    else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows;
}

export function schoolsOf(csv: string): SchoolPoint[] {
  const [head, ...rows] = csvRows(csv);
  const col = (name: string) => {
    const i = head.indexOf(name);
    if (i < 0) throw new Error(`the Xunta's school register has no column «${name}»`);
    return i;
  };
  const [nome, x, y, province] = ['Nome', 'COORDENADA_X', 'COORDENADA_Y', 'Provincia'].map(col);
  // Its COORDENADA_X is the latitude and Y the longitude, whatever the names say.
  return rows
    .filter((r) => r.length > y && r[province] === 'Lugo')
    .map((r) => ({ name: r[nome], lat: Number(r[x]), lng: Number(r[y]) }))
    .filter((s) => s.lat > SOUTH && s.lat < NORTH && s.lng > WEST && s.lng < EAST);
}

/** Each answer once, cached; a source that would not answer stops the run, writing nothing. */
async function cached<T>(file: string, what: string, ask: () => Promise<T>, read = (text: string) => JSON.parse(text) as T, write = (v: T) => JSON.stringify(v)): Promise<T> {
  if (existsSync(file)) {
    console.log(`Read ${file}; delete it to ask ${what} again.`);
    return read(readFileSync(file, 'utf8'));
  }
  console.log(`Asking ${what}...`);
  const value = await ask();
  mkdirSync('.cache', { recursive: true });
  writeFileSync(file, write(value));
  return value;
}

/** AllThePlaces' latest weekly run, only the tiles over BBOX: one byte range at a time. */
async function askAllThePlaces(): Promise<{ run: string; points: TilePoint[] }> {
  const latest = await fetch('https://data.alltheplaces.xyz/runs/latest.json', { headers: AGENT });
  if (!latest.ok) throw new Error(`AllThePlaces answered ${latest.status}`);
  const run = (await latest.json()) as { run_id: string; pmtiles_url: string };
  let asked = 0;
  const read: ReadRange = async (offset, length) => {
    if (asked++) await sleep(200);
    const res = await fetch(run.pmtiles_url, { headers: { ...AGENT, Range: `bytes=${offset}-${offset + length - 1}` } });
    if (res.status !== 206) throw new Error(`${new URL(run.pmtiles_url).host} answered ${res.status} to a byte range`);
    return new Uint8Array(await res.arrayBuffer());
  };
  const { points, tiles } = await pointsInBox(read, [SOUTH, WEST, NORTH, EAST]);
  console.log(`  run ${run.run_id}: ${points.length} points from ${tiles} tiles, ${asked} requests`);
  return { run: run.run_id, points };
}

/**
 * SERGAS's map, as its open-data entry links it. It answers by band of latitude whatever the
 * longitudes, and at most 100 of a layer: so in strips, and a full strip stops the run.
 */
async function askSergas(): Promise<HealthPoint[]> {
  const STRIP = 0.025;
  const all = new Map<string, HealthPoint>();
  for (let south = SOUTH; south < NORTH - 1e-9; south += STRIP) {
    if (all.size) await sleep(1000);
    const north = Math.min(NORTH, south + STRIP);
    const url = `https://extranet.sergas.es/sixsanweb/SIXSAN_WEB/proxyKml.ashx?SIXSAN_WEB_KML/MapServer/KmlServer?Composite=false&BBOX=${WEST},${south.toFixed(3)},${EAST},${north.toFixed(3)}`;
    const res = await fetch(url, { headers: AGENT });
    if (!res.ok) throw new Error(`SERGAS answered ${res.status}`);
    const body = new Uint8Array(await res.arrayBuffer());
    const kml = new TextDecoder().decode(body[0] === 0x50 && body[1] === 0x4b ? unzipEntry(body, 'doc.kml') : body);
    const points = healthPointsOf(kml);
    const perLayer = new Map<string, number>();
    for (const p of points) perLayer.set(p.folder, (perLayer.get(p.folder) ?? 0) + 1);
    const full = [...perLayer].find(([, n]) => n >= 100);
    if (full) throw new Error(`SERGAS gave 100 «${full[0]}» for one strip, its limit: make STRIP narrower`);
    for (const p of points) if (p.lat > SOUTH && p.lat < NORTH && p.lng > WEST && p.lng < EAST) all.set(`${p.name}|${p.lat}|${p.lng}`, p);
  }
  return [...all.values()];
}

async function askSchools(): Promise<string> {
  // The province of Lugo's file of the Xunta's «Centros educativos de Galicia».
  const res = await fetch('https://abertos.xunta.gal/catalogo/ensino-formacion/-/dataset/0257/centros-educativos-galicia/003/descarga-directa-ficheiro.csv', { headers: AGENT });
  if (!res.ok) throw new Error(`the Xunta's portal answered ${res.status}`);
  return res.text();
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const osm = await cached(CACHE.osm, `Overpass for the named places in ${BBOX}`, async () => {
    const json = await overpass(QUERY);
    if (!json) throw new Error('Overpass would not answer; nothing written.');
    return json;
  });
  const brands = await cached(CACHE.brands, "AllThePlaces' latest run", askAllThePlaces);
  const health = await cached(CACHE.health, "SERGAS's map", askSergas);
  const schoolsCsv = await cached(CACHE.schools, "the Xunta's school register", askSchools, (t) => t, (t) => t);

  // Recent as of the OSM answer, not of the day this runs: a rebuild from the cache gives the same.
  const asOf = new Date(osm.osm3s?.timestamp_osm_base ?? Date.now());
  asOf.setUTCMonth(asOf.getUTCMonth() - RECENT_MONTHS);
  const check = JSON.parse(readFileSync(CHECKED, 'utf8')) as { checked: string; gone: Gone[] };
  const { places, dropped, moved, lapsed } = mergePlaces({
    osm: osm.elements,
    brands: brands.points,
    health,
    schools: schoolsOf(schoolsCsv),
    recentSince: asOf.toISOString().slice(0, 10),
    gone: check.gone,
    checkedOn: check.checked,
  });
  const write = (file: string, list: Place[]) => writeFileSync(file, `${JSON.stringify(list.map(({ name, lat, lng }) => ({ name, lat, lng })), null, 1)}\n`);
  // The kind and the source are for this summary only: the app searches by name.
  write(OUT, places.filter((p) => p.source !== 'official'));
  write(OUT_OFFICIAL, places.filter((p) => p.source === 'official'));
  const by = (f: (p: Place) => string) => {
    const m = new Map<string, number>();
    for (const p of places) m.set(f(p), (m.get(f(p)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ');
  };
  console.log(`${places.length} places (${by((p) => p.source)}) -> ${OUT}, ${OUT_OFFICIAL}`);
  console.log(`  AllThePlaces run ${brands.run}`);
  console.log(`  ${by((p) => p.kind)}`);
  console.log(`${dropped.length} of OSM's left out:`);
  for (const d of dropped) console.log(`  ${d.name} (${d.kind}, edited ${d.edited ?? '?'}): ${d.why}`);
  console.log(`${moved.length} of OSM's moved to where the chain has them:`);
  for (const d of moved) console.log(`  ${d.name} (${d.kind}, edited ${d.edited ?? '?'}): ${d.why}`);
  console.log(`${lapsed.length} found gone on ${check.checked} but edited in OSM since, kept: search for them again.`);
  for (const d of lapsed) console.log(`  ${d.name} (${d.kind}, edited ${d.edited ?? '?'})`);
}
