/**
 * Every screen and state of the app photographed, and two sets of photographs compared pixel
 * by pixel: the proof that a change which should not alter the picture did not.
 *
 *   pnpm build && PORT=3017 pnpm start                       # the build before, in a worktree
 *   BASE=http://localhost:3017 pnpm run visual:shoot <dir>    # its photographs
 *   ... the same for the build after, on another port ...
 *   pnpm run visual:compare <before>[,<before2>] <after> <out>   # every pixel that moved
 *
 * The states are audit:browser's (auditBrowser.ts), reached the same way, with the API
 * answered from its fixtures and every other host refused. The difference is the clock: here
 * it does not tick at all, so the buses on the map stand where they stood in the other run.
 * Each state is photographed in both themes, as it lands and then from the top of its scroller
 * to the bottom, on a phone and a desktop in Galician, Spanish and English, and once more on a
 * 320 px phone and with the text at 200 %, where the capped sizes of index.css show.
 *
 * Shooting the same build twice must compare clean; anything else is the method, not the app.
 * Offline and deterministic. Exits 1 on any pixel that differs or any state reached in one run
 * and not the other.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { crc32, deflateSync, inflateSync } from 'node:zlib';
import { BASE, PHONE, withBrowser, type Session } from './cdp';
import { sleep } from './lib';
import { STATES, label, reach, worker, type Pass, type State, type Theme, type Worker } from './auditBrowser';

const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };

interface Shot extends Pass {
  /** A narrower phone, from the first paint. */
  width?: number;
  /** The root font size, as a phone's larger-text setting sets it. */
  text?: string;
}

const PASSES: Shot[] = [
  ...(['gl', 'es', 'en'] as const).flatMap((lang): Shot[] => [
    { name: `phone ${lang}`, desktop: false, lang, themes: ['light', 'dark'], deep: false },
    { name: `desktop ${lang}`, desktop: true, lang, themes: ['light', 'dark'], deep: false },
  ]),
  { name: 'phone gl 320', desktop: false, lang: 'gl', themes: ['light', 'dark'], deep: false, width: 320 },
  { name: 'phone gl text200', desktop: false, lang: 'gl', themes: ['light', 'dark'], deep: false, text: '200%' },
];

/**
 * Every animation where it rests: an entrance finished, a loop stopped at its first frame (the
 * waits that spin or pulse would otherwise be caught at a different phase each run), and the
 * caret, which blinks, out of sight.
 */
const STILL = `(async () => {
  if (!document.getElementById('visual-still')) {
    const s = document.createElement('style');
    s.id = 'visual-still';
    // The focus indicators too: whether Chrome draws a ring after a scripted focus depends on what
    // happened to be focused a moment before, and under load that varied between two runs of one
    // build. audit:browser judges the focus; these photographs judge everything else.
    s.textContent = '*, *::before, *::after { caret-color: transparent !important; }'
      + ' *:focus, *:focus-visible, *:has(:focus-visible) { outline-color: transparent !important; --tw-ring-shadow: 0 0 #0000 !important; }';
    document.head.append(s);
  }
  // Until the page stops changing for 800 ms (at most 8 s): an answer computed after the first
  // paint, a walk measured, a chunk arriving. The map's own panes are left out, since the buses
  // redraw every three seconds whether or not anything moved.
  await new Promise((done) => {
    let timer = setTimeout(finish, 800);
    const cap = setTimeout(finish, 8000);
    const watch = new MutationObserver((list) => {
      if (list.every((m) => m.target instanceof Element && m.target.closest('.leaflet-pane'))) return;
      clearTimeout(timer);
      timer = setTimeout(finish, 800);
    });
    function finish() { watch.disconnect(); clearTimeout(timer); clearTimeout(cap); done(); }
    watch.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  });
  for (const a of document.getAnimations()) {
    try {
      const t = a.effect && a.effect.getComputedTiming();
      if (t && t.iterations === Infinity) { a.pause(); a.currentTime = 0; } else a.finish();
    } catch (e) {}
  }
  await document.fonts.ready;
  return true;
})()`;

/** The box a person scrolls in this state: inside an open dialog if there is one, else the biggest. */
const SCROLLER = `(() => {
  const within = document.querySelector('[role=dialog][aria-modal=true]') || document;
  const boxes = [...within.querySelectorAll('*')].filter((e) => {
    const s = getComputedStyle(e);
    return /auto|scroll/.test(s.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.getClientRects().length && s.visibility !== 'hidden';
  });
  boxes.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
  document.querySelectorAll('[data-visual-scroller]').forEach((e) => e.removeAttribute('data-visual-scroller'));
  const box = boxes[0] || (document.scrollingElement.scrollHeight > innerHeight + 1 ? document.scrollingElement : null);
  if (!box) return 0;
  box.setAttribute('data-visual-scroller', '');
  return Math.ceil((box.scrollHeight - box.clientHeight) / box.clientHeight);
})()`;

const SCROLL_TO = `function (i) { const b = document.querySelector('[data-visual-scroller]') || document.scrollingElement; b.scrollTop = i * b.clientHeight; return b.scrollTop; }`;

/** A frame, taken again until two in a row agree: a tile still being redrawn is caught at most once. */
async function photograph(page: Session, path: string): Promise<void> {
  let last = '';
  for (let i = 0; i < 8; i++) {
    const { data } = await page.send<{ data: string }>('Page.captureScreenshot', { format: 'png' });
    if (data === last) break;
    last = data;
    await sleep(250);
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.from(last, 'base64'));
}

/**
 * Twice, with a pause between: an element finished mid-entrance keeps its compositor layer for a
 * frame or two, and a rounded corner rasterised on that layer differs in a few pixels of its
 * antialiasing from the same corner drawn with the page (measured: 75 and 140 px, all corners).
 */
async function still(page: Session): Promise<void> {
  await page.evaluate(STILL);
  await sleep(500);
  await page.evaluate(STILL);
  await sleep(200);
}

async function shootState(w: Worker, pass: Shot, state: State, dir: string): Promise<{ state: string; reached: string[] | null; frames: number }> {
  const { page } = w;
  const at = join(dir, pass.name.replace(/\s+/g, '-'), label(state).replace(/[/\s]+/g, '-'));
  const findings = await reach(w, pass, state, true);
  if (pass.width) {
    // reach() sets the pass's own metrics; the narrower phone is set again and laid out from scratch.
    await page.send('Emulation.setDeviceMetricsOverride', { ...(pass.desktop ? DESKTOP : PHONE), width: pass.width });
    await sleep(500);
  }
  if (pass.text) {
    await page.call(`function (size) { document.documentElement.style.fontSize = size; }`, pass.text);
    await sleep(500);
  }
  if (!findings) return { state: label(state), reached: null, frames: 0 };
  let frames = 0;
  for (const theme of pass.themes as Theme[]) {
    if (theme !== pass.themes[0]) {
      // The app's own switch: the class on <html>, which every token and the map's palette follow.
      await page.call(`function (dark) { document.documentElement.classList.toggle('dark', dark); }`, theme === 'dark');
      await sleep(400);
    }
    await still(page);
    await photograph(page, join(at, `${theme}-landed.png`));
    frames++;
    const pages = Math.min(await page.evaluate<number>(SCROLLER), 12);
    for (let i = 0; i <= pages && pages > 0; i++) {
      await page.call(SCROLL_TO, i);
      await sleep(600);
      await still(page);
      await photograph(page, join(at, `${theme}-scroll${String(i).padStart(2, '0')}.png`));
      frames++;
    }
    if (pages > 0) await page.call(SCROLL_TO, 0);
  }
  return { state: label(state), reached: findings.map((f) => f.detail), frames };
}

async function shoot(dir: string): Promise<void> {
  const only = (pattern: string | undefined, value: string) => !pattern || new RegExp(pattern).test(value);
  const jobs = PASSES.filter((p) => only(process.env.VISUAL_PASSES, p.name)).flatMap((pass) =>
    STATES.filter((s) => !(pass.desktop && s.phoneOnly) && !(!pass.desktop && s.desktopOnly) && only(process.env.VISUAL_STATES, label(s))).map((state) => ({ pass, state })),
  );
  const manifest: Record<string, { reached: string[] | null; frames: number }> = {};
  const started = Date.now();
  let ran = false;
  await withBrowser(async (browser) => {
    ran = true;
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(Number(process.env.VISUAL_PAGES ?? 4), jobs.length) }, async () => {
        const w = await worker(browser);
        while (next < jobs.length) {
          const { pass, state } = jobs[next++];
          const key = `${pass.name} · ${label(state)}`;
          try {
            const got = await shootState(w, pass, state, dir);
            manifest[key] = { reached: got.reached, frames: got.frames };
          } catch (error) {
            manifest[key] = { reached: [`the run broke: ${String(error).slice(0, 200)}`], frames: 0 };
          }
          process.stdout.write('.');
        }
        await w.page.close();
      }),
    );
  });
  if (!ran) throw new Error('no Chromium to photograph with');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
  const missed = Object.entries(manifest).filter(([, m]) => !m.reached || m.reached.length);
  console.log(`\n${Object.keys(manifest).length} states photographed in ${Math.round((Date.now() - started) / 1000)} s, ${Object.values(manifest).reduce((s, m) => s + m.frames, 0)} frames`);
  for (const [key, m] of missed) console.log(`  not reached: ${key}: ${m.reached ? m.reached.join('; ') : 'the app never drew'}`);
}

/* ------------------------------------------------------------------------------------- */
/* PNG, read and written with zlib alone                                                 */
/* ------------------------------------------------------------------------------------- */

interface Image {
  width: number;
  height: number;
  /** RGBA, 8 bits a channel. */
  data: Buffer;
}

export function decodePng(file: Buffer): Image {
  let at = 8;
  let width = 0, height = 0, depth = 0, type = 0;
  const idat: Buffer[] = [];
  while (at < file.length) {
    const length = file.readUInt32BE(at);
    const kind = file.toString('latin1', at + 4, at + 8);
    const body = file.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      type = body[9];
      if (body[12] !== 0) throw new Error('interlaced PNG');
    } else if (kind === 'IDAT') idat.push(body);
    at += 12 + length;
  }
  const channels = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (depth !== 8 || !channels) throw new Error(`unsupported PNG: depth ${depth}, colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const add = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      line[x] = (line[x] + add) & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = line[x * channels];
      out[o + 1] = line[x * channels + 1];
      out[o + 2] = line[x * channels + 2];
      out[o + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

export function encodePng({ width, height, data }: Image): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const chunk = (kind: string, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(kind, 4, 'latin1');
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/* ------------------------------------------------------------------------------------- */
/* Comparing                                                                             */
/* ------------------------------------------------------------------------------------- */

const pngsUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? pngsUnder(p) : f.endsWith('.png') ? [p] : [];
  });

/** Before, after and the difference side by side, cropped to where the pixels moved. */
function sheet(a: Image, b: Image, box: { x0: number; y0: number; x1: number; y1: number }): Image {
  const pad = 24;
  const x0 = Math.max(0, box.x0 - pad), y0 = Math.max(0, box.y0 - pad);
  const w = Math.min(a.width, box.x1 + pad + 1) - x0, h = Math.min(a.height, box.y1 + pad + 1) - y0;
  const out: Image = { width: w * 3 + 8, height: h, data: Buffer.alloc((w * 3 + 8) * h * 4, 255) };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * a.width + x0 + x) * 4;
      const moved = a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3];
      for (let c = 0; c < 4; c++) {
        out.data[(y * out.width + x) * 4 + c] = a.data[i + c];
        out.data[(y * out.width + w + 4 + x) * 4 + c] = b.data[i + c];
      }
      const g = Math.round((b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3 / 4 + 190);
      const o = (y * out.width + 2 * w + 8 + x) * 4;
      out.data.set(moved ? [230, 0, 40, 255] : [g, g, g, 255], o);
    }
  return out;
}

/** How many pixels of b differ from a, and where; null when the sizes differ. */
function differ(a: Image, b: Image): { pixels: number; box: { x0: number; y0: number; x1: number; y1: number } } | null {
  if (a.width !== b.width || a.height !== b.height) return null;
  let pixels = 0;
  const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  for (let p = 0; p < a.width * a.height; p++) {
    const i = p * 4;
    if (a.data[i] === b.data[i] && a.data[i + 1] === b.data[i + 1] && a.data[i + 2] === b.data[i + 2] && a.data[i + 3] === b.data[i + 3]) continue;
    pixels++;
    const x = p % a.width, y = Math.floor(p / a.width);
    box.x0 = Math.min(box.x0, x);
    box.y0 = Math.min(box.y0, y);
    box.x1 = Math.max(box.x1, x);
    box.y1 = Math.max(box.y1, y);
  }
  return { pixels, box };
}

/**
 * Each frame of `after` against the same frame in every `before` run. A frame matches when it is
 * identical to any of them: a few states move between two shots of the same build (a countdown
 * in seconds, a bus's heading), and with two or three baselines those variants are known
 * rather than reported as changes. What matches none is written out as a sheet against the first.
 */
function compare(befores: string[], after: string, out: string): number {
  mkdirSync(out, { recursive: true });
  const left = pngsUnder(befores[0]).map((p) => relative(befores[0], p)).sort();
  const right = new Set(pngsUnder(after).map((p) => relative(after, p)));
  const rows: { frame: string; pixels: number; box?: string; note?: string }[] = [];
  let variants = 0;
  for (const frame of left) {
    if (!right.has(frame)) {
      rows.push({ frame, pixels: -1, note: 'only in before' });
      continue;
    }
    right.delete(frame);
    const b = decodePng(readFileSync(join(after, frame)));
    let first: ReturnType<typeof differ> | undefined;
    let a0: Image | undefined;
    let matched = false;
    for (const [i, before] of befores.entries()) {
      let a: Image;
      try {
        a = decodePng(readFileSync(join(before, frame)));
      } catch {
        continue;
      }
      const d = differ(a, b);
      if (i === 0) {
        first = d;
        a0 = a;
      }
      if (d && d.pixels === 0) {
        matched = true;
        if (i > 0) variants++;
        break;
      }
    }
    if (matched) continue;
    if (!first || !a0) {
      rows.push({ frame, pixels: -1, note: a0 ? `size ${a0.width}x${a0.height} became ${b.width}x${b.height}` : 'unreadable in before' });
      continue;
    }
    writeFileSync(join(out, frame.replace(/[\\/]/g, '__')), encodePng(sheet(a0, b, first.box)));
    rows.push({ frame, pixels: first.pixels, box: `${first.box.x0},${first.box.y0} to ${first.box.x1},${first.box.y1}` });
  }
  for (const frame of right) rows.push({ frame, pixels: -1, note: 'only in after' });
  const read = (d: string) => {
    try {
      return JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8')) as Record<string, { reached: string[] | null }>;
    } catch {
      return {};
    }
  };
  const reached = (m: Record<string, { reached: string[] | null }>, k: string) => !!m[k]?.reached && m[k].reached!.length === 0;
  const [mb, ma] = [read(befores[0]), read(after)];
  const unreached = [...new Set([...Object.keys(mb), ...Object.keys(ma)])].filter((k) => reached(mb, k) !== reached(ma, k));
  writeFileSync(join(out, 'report.json'), JSON.stringify({ compared: left.length, variants, differing: rows, unreached }, null, 1));
  console.log(`${left.length} frames compared against ${befores.length} baseline run(s): ${rows.length} differ from all of them, ${variants} matched a second run only`);
  for (const r of rows) console.log(`  ${r.frame}: ${r.pixels >= 0 ? `${r.pixels} px, ${r.box}` : r.note}`);
  for (const k of unreached) console.log(`  reached in one run only: ${k}`);
  return rows.length + unreached.length;
}

const [, , command, ...rest] = process.argv;
if (command === 'shoot' && rest[0]) {
  console.log(`photographing ${BASE} into ${rest[0]}`);
  await shoot(rest[0]);
} else if (command === 'compare' && rest[0] && rest[1]) {
  if (compare(rest[0].split(','), rest[1], rest[2] ?? join(rest[1], '..', 'visual-diff'))) process.exitCode = 1;
} else {
  console.log('usage: visualDiff.ts shoot <dir> | compare <before>[,<before>...] <after> [<out>]');
  process.exitCode = 2;
}
