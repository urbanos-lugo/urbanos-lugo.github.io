/**
 * The map's background, for Lugo alone, served from this site: `pnpm run data:tiles`.
 *
 *   pnpm run data:tiles             # cut the latest planet OpenFreeMap publishes, and put it in place
 *   pnpm run data:tiles --fetch     # cut it into .cache/map only
 *   pnpm run data:tiles --apply     # put in place what .cache/map has -- offline
 *   pnpm run data:tiles --assets    # the letters and the icons too, which do not change (62 MB once)
 *
 * From the files OpenFreeMap publishes for whoever hosts the map themselves (a planet a week, as
 * one PMTiles archive of some 88 GB, and its fonts and sprite), and not from its tile server,
 * whose terms leave automated collection out. Of the archive, only the byte ranges Lugo is in,
 * one at a time. What lands in public/map is committed, so a build asks nobody.
 *
 * Put in place only if it is whole: every tile of the box, every layer the styles draw from,
 * about as big as the last, and no word the letters kept here cannot write. deploy-pages.yml
 * renews it once a month on those terms, and publishes the committed one when they are not met.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { AROUND_LUGO, TILE_ZOOMS } from '../src/utils/geo';
import { at, readJson, sleep, writeJson } from './lib';
import { tilesInBox, tilesOver, wordsOf, type Box, type ReadRange } from './pmtiles';

const PLANETS = 'https://btrfs.openfreemap.com/';
const ASSETS = 'https://assets.openfreemap.com/';
const GAP_MS = 250;
const HEADERS = { 'User-Agent': 'map-tiles-import/1.0' };

const CACHE = at('.cache', 'map');
const OUT = at('public', 'map');
const STAMP = at('src', 'data', 'map-tiles.json');

const [[west, south], [east, north]] = AROUND_LUGO;
export const LUGO: Box = [south, west, north, east];
export const TILES = tilesOver(LUGO, TILE_ZOOMS.min, TILE_ZOOMS.max);

/** The letters of the names of here: Latin, its marks, and the quotes and dashes. Three faces, as the two styles write. */
export const FACES = ['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Bold'];
export const RANGES = ['0-255', '256-511', '512-767', '7680-7935', '8192-8447'];
const SPRITE = ['sprite.json', 'sprite.png', 'sprite@2x.json', 'sprite@2x.png'];

type Style = { layers: { source?: string; 'source-layer'?: string }[] };
/** What a name on the map can be read from. */
export const WRITTEN = new Set(['name', 'name_en', 'name:latin', 'name:nonlatin', 'ref']);

/** Why a set of tiles is not fit to be put in place, or null. `read` gives one tile's bytes. */
export function unfit(read: (key: string) => Uint8Array | null, before: number): string | null {
  const styles = ['light', 'dark'].map((theme) => readJson<Style>(at('src', 'data', `map-style-${theme}.json`)));
  const drawn = new Set(styles.flatMap((s) => s.layers.filter((l) => l.source === 'openmaptiles').map((l) => l['source-layer']!)));
  const layers = new Set<string>();
  const missing: string[] = [];
  let bytes = 0;
  for (const key of TILES) {
    const tile = read(key);
    if (!tile?.length) {
      missing.push(key);
      continue;
    }
    bytes += tile.length;
    const { layers: has, words } = wordsOf(tile, WRITTEN);
    has.forEach((l) => layers.add(l));
    for (const word of words) {
      for (const letter of word) {
        const code = letter.codePointAt(0)!;
        const range = RANGES.find((r) => code >= Number(r.split('-')[0]) && code <= Number(r.split('-')[1]));
        if (!range) return `${key} writes «${word}», and no letters of U+${code.toString(16)} are kept here`;
      }
    }
  }
  if (missing.length) return `${missing.length} of ${TILES.length} tiles are missing: ${missing.slice(0, 5).join(', ')}`;
  // Not every layer has something to draw in Lugo; the ones a map is made of do.
  const absent = ['transportation', 'transportation_name', 'building', 'landcover', 'water', 'place', 'poi'].filter((l) => !drawn.has(l) || !layers.has(l));
  if (absent.length) return `no tile has ${absent.join(', ')}`;
  if (before && (bytes < before * 0.7 || bytes > before * 1.5)) return `${bytes} bytes, where the last had ${before}`;
  return null;
}

/** A tar's files, one by one: 512-byte headers, the name first and the size in octal at 124. */
function* untar(tar: Buffer): Generator<{ name: string; body: Buffer }> {
  for (let i = 0; i + 512 <= tar.length && tar[i]; ) {
    const name = tar.toString('utf8', i, i + 100).replace(/\0.*$/s, '');
    const size = parseInt(tar.toString('utf8', i + 124, i + 136), 8) || 0;
    yield { name, body: tar.subarray(i + 512, i + 512 + size) };
    i += 512 + Math.ceil(size / 512) * 512;
  }
}

const put = (file: string, body: Uint8Array) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, body);
};

async function ask(url: string, headers: Record<string, string> = {}): Promise<Response> {
  const res = await fetch(url, { headers: { ...HEADERS, ...headers } });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res;
}

async function fetchTiles(): Promise<void> {
  const planets = (await (await ask(`${PLANETS}files.txt`)).text()).split('\n').filter((l) => /^areas\/planet\/[\w]+\/tiles\.pmtiles$/.test(l.trim())).sort();
  const latest = planets.at(-1)?.trim();
  if (!latest) throw new Error(`${PLANETS}files.txt lists no planet`);
  const version = latest.split('/')[2];
  let asked = 0;
  let read = 0;
  const range: ReadRange = async (offset, length) => {
    if (asked++) await sleep(GAP_MS);
    const res = await ask(PLANETS + latest, { Range: `bytes=${offset}-${offset + length - 1}` });
    if (res.status !== 206) throw new Error(`a byte range was answered ${res.status}`);
    read += length;
    return new Uint8Array(await res.arrayBuffer());
  };
  const tiles = await tilesInBox(range, LUGO, TILE_ZOOMS.min, TILE_ZOOMS.max);
  for (const [key, tile] of tiles) put(join(CACHE, 'tiles', `${key}.pbf`), tile);
  writeJson(join(CACHE, 'version.json'), { version });
  console.log(`${version}: ${tiles.size} of ${TILES.length} tiles, ${asked} requests, ${(read / 1048576).toFixed(1)} MB read of the archive`);
}

async function fetchAssets(): Promise<void> {
  const wanted = new Map(FACES.flatMap((face) => RANGES.map((r) => [`${face}/${r}.pbf`, join(OUT, 'fonts', face, `${r}.pbf`)] as const)));
  const fonts = gunzipSync(Buffer.from(await (await ask(`${ASSETS}fonts/ofm.tar.gz`)).arrayBuffer()));
  for (const { name, body } of untar(fonts)) {
    const key = [...wanted.keys()].find((k) => name.endsWith(`/${k}`) || name === k);
    if (!key) continue;
    put(wanted.get(key)!, body);
    wanted.delete(key);
  }
  if (wanted.size) throw new Error(`the fonts have no ${[...wanted.keys()].join(', ')}`);
  const sprite = gunzipSync(Buffer.from(await (await ask(`${ASSETS}sprites/ofm_f384.tar.gz`)).arrayBuffer()));
  const icons = new Set(SPRITE);
  for (const { name, body } of untar(sprite)) {
    const as = name.split('/').pop()!.replace(/^ofm/, 'sprite');
    if (icons.delete(as)) put(join(OUT, as), body);
  }
  if (icons.size) throw new Error(`the sprite has no ${[...icons].join(', ')}`);
  console.log(`${FACES.length} faces of ${RANGES.length} ranges, and the sprite`);
}

function apply(): void {
  const { version } = readJson<{ version: string }>(join(CACHE, 'version.json'));
  const from = (key: string) => join(CACHE, 'tiles', `${key}.pbf`);
  const last = existsSync(STAMP) ? readJson<{ version: string; bytes: number }>(STAMP) : { version: '', bytes: 0 };
  if (version < last.version) return console.log(`${version} is older than ${last.version}, which stays`);
  const why = unfit((key) => (existsSync(from(key)) ? readFileSync(from(key)) : null), last.bytes);
  if (why) throw new Error(`not put in place: ${why}`);
  let bytes = 0;
  for (const key of TILES) {
    const to = join(OUT, 'tiles', `${key}.pbf`);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from(key), to);
    bytes += statSync(to).size;
  }
  writeJson(STAMP, { version, tiles: TILES.length, bytes }, false);
  // And beside the tiles, where the weekly job reads which run the published ones are from.
  writeJson(join(OUT, 'version.json'), { version }, false);
  // A smaller box leaves tiles nobody asks for: they are named, to be deleted by hand.
  const kept = new Set(TILES);
  const stray: string[] = [];
  const root = join(OUT, 'tiles');
  for (const z of readdirSync(root)) for (const x of readdirSync(join(root, z))) for (const f of readdirSync(join(root, z, x))) if (!kept.has(`${z}/${x}/${f.replace('.pbf', '')}`)) stray.push(`${z}/${x}/${f}`);
  console.log(`${version} in place of ${last.version || 'nothing'}: ${TILES.length} tiles, ${(bytes / 1048576).toFixed(1)} MB${stray.length ? `; not of the box: ${stray.join(' ')}` : ''}`);
}

if (process.argv[1] && /importTiles\.ts$/.test(process.argv[1])) {
  const only = (flag: string) => process.argv.includes(flag);
  if (only('--assets')) await fetchAssets();
  if (!only('--apply')) await fetchTiles();
  if (!only('--fetch')) apply();
}
