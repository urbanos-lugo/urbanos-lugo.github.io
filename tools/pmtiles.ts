/**
 * The points of a PMTiles v3 archive of vector tiles, read with zlib alone: the header, the
 * directories and the tiles over a box, each asked for as one byte range of a file that may
 * be gigabytes (AllThePlaces publishes one of 6 GB a week). The caller supplies `read`, so
 * this file makes no request of its own: importPlaces.ts does, by hand. Only point features
 * are decoded; MVT lines and polygons are skipped.
 */
import { gunzipSync } from 'node:zlib';

export type ReadRange = (offset: number, length: number) => Promise<Uint8Array>;
export interface TilePoint {
  lat: number;
  lng: number;
  layer: string;
  properties: Record<string, string | number | boolean>;
}
interface Entry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

/** Protocol buffers, the little that MVT and the directories need. Numbers past 2^32 stay exact. */
class Reader {
  pos = 0;
  constructor(readonly buf: Uint8Array) {}
  get done() {
    return this.pos >= this.buf.length;
  }
  varint(): number {
    let value = 0;
    for (let shift = 1; ; shift *= 128) {
      const byte = this.buf[this.pos++];
      value += (byte & 0x7f) * shift;
      if (byte < 0x80) return value;
    }
  }
  bytes(): Uint8Array {
    const length = this.varint();
    this.pos += length;
    return this.buf.subarray(this.pos - length, this.pos);
  }
  string = () => new TextDecoder().decode(this.bytes());
  skip(wire: number) {
    if (wire === 0) this.varint();
    else if (wire === 1) this.pos += 8;
    else if (wire === 2) this.bytes();
    else if (wire === 5) this.pos += 4;
    else throw new Error(`protobuf wire type ${wire}`);
  }
}
const zigzag = (n: number) => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

const u64 = (view: DataView, at: number) => Number(view.getBigUint64(at, true));

/** The Hilbert index PMTiles gives tile z/x/y, after every tile of the zooms above it. */
export function tileId(z: number, x: number, y: number): number {
  let id = 0;
  for (let t = 0; t < z; t++) id += 4 ** t;
  let d = 0;
  for (let s = 2 ** (z - 1); s >= 1; s /= 2) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) [x, y] = [s - 1 - x, s - 1 - y];
      [x, y] = [y, x];
    }
  }
  return id + d;
}

function directory(raw: Uint8Array): Entry[] {
  const r = new Reader(raw);
  const n = r.varint();
  const entries: Entry[] = [];
  let last = 0;
  for (let i = 0; i < n; i++) entries.push({ tileId: (last += r.varint()), offset: 0, length: 0, runLength: 0 });
  for (const e of entries) e.runLength = r.varint();
  for (const e of entries) e.length = r.varint();
  entries.forEach((e, i) => {
    const v = r.varint();
    e.offset = v === 0 && i > 0 ? entries[i - 1].offset + entries[i - 1].length : v - 1;
  });
  return entries;
}

function find(entries: Entry[], id: number): Entry | null {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].tileId === id) return entries[mid];
    if (entries[mid].tileId < id) lo = mid + 1;
    else hi = mid - 1;
  }
  const e = entries[hi];
  return e && (e.runLength === 0 || id - e.tileId < e.runLength) ? e : null;
}

/** The point features of one MVT tile, in degrees. MVT's y grows downwards, as tile rows do. */
export function decodePoints(tile: Uint8Array, z: number, x: number, y: number): TilePoint[] {
  const points: TilePoint[] = [];
  const n = 2 ** z;
  const top = new Reader(tile);
  while (!top.done) {
    const key = top.varint();
    if (key >> 3 !== 3) {
      top.skip(key & 7);
      continue;
    }
    const layer = new Reader(top.bytes());
    let name = '';
    let extent = 4096;
    const keys: string[] = [];
    const values: (string | number | boolean)[] = [];
    const features: Uint8Array[] = [];
    while (!layer.done) {
      const k = layer.varint();
      const field = k >> 3;
      if (field === 1) name = layer.string();
      else if (field === 2) features.push(layer.bytes());
      else if (field === 3) keys.push(layer.string());
      else if (field === 4) {
        const v = new Reader(layer.bytes());
        let value: string | number | boolean = '';
        while (!v.done) {
          const vk = v.varint();
          const f = vk >> 3;
          const view = new DataView(v.buf.buffer, v.buf.byteOffset + v.pos);
          if (f === 1) value = v.string();
          else if (f === 2) (value = view.getFloat32(0, true)), (v.pos += 4);
          else if (f === 3) (value = view.getFloat64(0, true)), (v.pos += 8);
          else if (f === 4 || f === 5) value = v.varint();
          else if (f === 6) value = zigzag(v.varint());
          else if (f === 7) value = v.varint() === 1;
          else v.skip(vk & 7);
        }
        values.push(value);
      } else if (field === 5) extent = layer.varint();
      else layer.skip(k & 7);
    }
    for (const raw of features) {
      const f = new Reader(raw);
      let type = 0;
      let tags: number[] = [];
      let geometry: number[] = [];
      const packed = () => {
        const p = new Reader(f.bytes());
        const out: number[] = [];
        while (!p.done) out.push(p.varint());
        return out;
      };
      while (!f.done) {
        const k = f.varint();
        const field = k >> 3;
        if (field === 2) tags = packed();
        else if (field === 3) type = f.varint();
        else if (field === 4) geometry = packed();
        else f.skip(k & 7);
      }
      if (type !== 1) continue;
      const properties: TilePoint['properties'] = {};
      for (let i = 0; i + 1 < tags.length; i += 2) properties[keys[tags[i]]] = values[tags[i + 1]];
      let px = 0;
      let py = 0;
      for (let i = 0; i < geometry.length; ) {
        const command = geometry[i++];
        const count = command >> 3;
        for (let c = 0; c < count && (command & 7) === 1; c++) {
          px += zigzag(geometry[i++]);
          py += zigzag(geometry[i++]);
          const lng = ((x + px / extent) / n) * 360 - 180;
          const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) * 180) / Math.PI;
          points.push({ lat, lng, layer: name, properties });
        }
      }
    }
  }
  return points;
}

const tileOf = (lat: number, lng: number, z: number) => {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return [Math.floor(((lng + 180) / 360) * n), Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n)];
};

/**
 * Every point in the archive's tiles over [south, west, north, east] at its deepest zoom,
 * where nothing has been dropped to thin the map. Directories are read once each.
 */
export async function pointsInBox(read: ReadRange, [south, west, north, east]: [number, number, number, number]): Promise<{ points: TilePoint[]; tiles: number }> {
  const head = await read(0, 127);
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (new TextDecoder().decode(head.subarray(0, 7)) !== 'PMTiles' || head[7] !== 3) throw new Error('not a PMTiles v3 archive');
  const [rootOffset, rootLength, , , leafOffset, , dataOffset] = [8, 16, 24, 32, 40, 48, 56].map((at) => u64(view, at));
  const internalGzip = head[97] === 2;
  const tileGzip = head[98] === 2;
  if (head[99] !== 1) throw new Error('tiles are not MVT');
  const z = head[101];
  const unpack = (raw: Uint8Array, gz: boolean) => (gz ? new Uint8Array(gunzipSync(raw)) : raw);
  const dirs = new Map<string, Entry[]>();
  const dir = async (offset: number, length: number) => {
    const key = `${offset}:${length}`;
    if (!dirs.has(key)) dirs.set(key, directory(unpack(await read(offset, length), internalGzip)));
    return dirs.get(key)!;
  };
  const [x0, y0] = tileOf(north, west, z);
  const [x1, y1] = tileOf(south, east, z);
  const points: TilePoint[] = [];
  let tiles = 0;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const id = tileId(z, x, y);
      let [offset, length] = [rootOffset, rootLength];
      for (let depth = 0; depth < 4; depth++) {
        const e = find(await dir(offset, length), id);
        if (!e) break;
        if (e.runLength > 0) {
          tiles++;
          points.push(...decodePoints(unpack(await read(dataOffset + e.offset, e.length), tileGzip), z, x, y));
          break;
        }
        [offset, length] = [leafOffset + e.offset, e.length];
      }
    }
  }
  return { points: points.filter((p) => p.lat >= south && p.lat <= north && p.lng >= west && p.lng <= east), tiles };
}
