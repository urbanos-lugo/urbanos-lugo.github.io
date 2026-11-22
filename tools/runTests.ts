/**
 * `pnpm test`: tools/test.ts run as several copies side by side, one per core up to a limit
 * (`TEST_JOBS` sets it). Every copy walks the whole file and runs only the checks it claims
 * first, so the work spreads itself: the copy on a slow check falls behind and the others
 * take what is left. The first copy to fail stops the rest starting checks, and is the one
 * printed, with the name of the check it failed on.
 *
 * `pnpm exec tsx tools/test.ts` runs the same file in one process, every check in order.
 */
import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { availableParallelism, tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const suite = join(dirname(fileURLToPath(import.meta.url)), 'test.ts');
const jobs = Math.max(1, Number(process.env.TEST_JOBS) || Math.min(availableParallelism(), 8));
const claims = mkdtempSync(join(tmpdir(), 'urbanos-test-'));
const started = performance.now();

type Copy = { code: number | null; out: string; err: string };
let failed: Copy | null = null;

const copies = Array.from({ length: jobs }, () =>
  new Promise<Copy>((resolve) => {
    // Node with tsx's loader, not node_modules/.bin/tsx: on Windows that is a .cmd, which spawn cannot start.
    const child = spawn(process.execPath, ['--import', import.meta.resolve('tsx'), suite], {
      env: { ...process.env, TEST_CLAIMS: claims },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const copy: Copy = { code: null, out: '', err: '' };
    child.stdout!.on('data', (chunk) => (copy.out += chunk));
    child.stderr!.on('data', (chunk) => (copy.err += chunk));
    child.on('close', (code) => {
      copy.code = code;
      // The others are asked to start nothing new rather than killed: a copy killed mid-check
      // leaves the server it started running, and on Windows nothing ends it.
      if (code !== 0 && !failed) {
        failed = copy;
        writeFileSync(join(claims, 'stop'), '');
      }
      resolve(copy);
    });
  }),
);

const done = await Promise.all(copies);
rmSync(claims, { recursive: true, force: true });

const lines = (copy: Copy) => copy.out.split(/\r?\n/).map((line) => line.split('\t'));

if (failed) {
  const copy = failed as Copy;
  const ran = new Set(lines(copy).filter(([kind]) => kind === 'ok').map(([, index]) => index));
  const at = lines(copy).filter(([kind, index]) => kind === 'run' && !ran.has(index)).pop();
  console.error(copy.err.trim() || copy.out.trim());
  if (at) console.error(`\nfailed: ${at[3]}`);
  process.exit(1);
}

const passed = new Map<number, { ms: number; name: string }>();
const declared = new Set<string>();
for (const copy of done) {
  for (const [kind, index, ms, name] of lines(copy)) {
    if (kind === 'ok') passed.set(Number(index), { ms: Number(ms), name });
    if (kind === 'declared') declared.add(index);
  }
}
// Every copy walks the same file, so all declare the same checks, and each was run by one.
const total = Number([...declared][0]);
const missing = Array.from({ length: total }, (_, i) => i).filter((i) => !passed.has(i));
if (declared.size !== 1 || missing.length) {
  console.error(`the copies declared ${[...declared].join(' and ')} checks, and nobody ran number ${missing.join(', ')}`);
  process.exit(1);
}

for (const [, { name }] of [...passed].sort((a, b) => a[0] - b[0])) console.log(`  ok  ${name}`);
console.log('\nslowest:');
for (const { ms, name } of [...passed.values()].sort((a, b) => b.ms - a.ms).slice(0, 5)) console.log(`  ${String(ms).padStart(6)} ms  ${name}`);
console.log(`\n${total} checks passed in ${((performance.now() - started) / 1000).toFixed(1)} s, ${jobs} copies\n`);
