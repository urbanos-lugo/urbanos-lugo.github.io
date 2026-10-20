/**
 * Repository policy, not the app: `pnpm run check:policy`, a step in ci.yml. What the
 * workflows run and when, the pauses the network tools keep, what the documents promise,
 * what is never tracked, the lockfile's floors. These read files rather than run code, which
 * is why they are not in tools/test.ts; each still names the slip it was written after.
 */
import assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { CSP_HEADER } from '../src/security/csp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

let checks = 0;
const ok = (name: string, fn: () => void) => {
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

ok('what the workflows run is pinned, and none of them hands out more than it uses', () => {
  // Nineteen actions were pinned by tag, and a tag can be moved to other code after it was
  // reviewed; denoland/setup-deno@v2 was not even a tag but a branch. The job that holds the
  // deploy token also fetched `jsr:@deno/deploy` and Deno `v2.x`, whatever was newest that
  // minute, and ran them with -A. And it asked for an id-token nothing ever used.
  const dir = join(root, '.github', 'workflows');
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  assert(files.length >= 5, `found ${files.length} workflows, which means this is not reading what it thinks`);
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    for (const [, spec] of text.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)(.*)$/gm)) {
      assert(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/.test(spec), `${file}: ${spec} is not pinned to a commit`);
    }
    for (const line of text.split('\n').filter((l) => /^\s*(?:-\s*)?uses:/.test(l))) {
      assert(/@[0-9a-f]{40} # v\d+(\.\d+)*$/.test(line.trim()), `${file}: "${line.trim()}" has no version beside its pin, so nobody can tell what it is`);
    }
    const commands = text.replace(/^\s*#.*$/gm, '');
    for (const [spec] of commands.matchAll(/\b(?:jsr|npm):@?[\w./-]+(?:@[\w.^~-]+)?/g)) {
      assert(/@\d+\.\d+\.\d+$/.test(spec), `${file}: ${spec} is fetched at run time without an exact version`);
    }
    for (const [, version] of text.matchAll(/deno-version:\s*(\S+)/g)) {
      assert(/^v?\d+\.\d+\.\d+$/.test(version), `${file}: deno-version ${version} is whatever is newest on the day`);
    }
    // Without this the token stays in .git/config for every later step, where an install
    // script could read it. Every checkout, not only the ones that deploy.
    const checkouts = text.split(/\n(?=\s*- )/).filter((step) => /uses:\s*actions\/checkout@/.test(step));
    for (const step of checkouts) assert(/persist-credentials:\s*false/.test(step), `${file}: a checkout keeps its credentials in .git/config`);
    // A token-minting permission belongs to the job that deploys with it, never to the whole workflow.
    const topLevel = commands.split(/^jobs:/m)[0];
    assert(!/id-token:\s*write/.test(topLevel), `${file}: id-token: write is granted to every job in the workflow`);
    // A secret lives in an environment that Settings → Environments lets only main deploy
    // from. A job that reads one without naming its environment reads it on any branch.
    for (const job of (commands.split(/^jobs:/m)[1] ?? '').split(/\n(?= {2}[\w-]+:[ \t]*\n)/)) {
      if (!/\bsecrets\.(?!GITHUB_TOKEN\b)/.test(job)) continue;
      assert(/^ {4}environment:/m.test(job), `${file}: job "${job.trim().split(':')[0]}" reads a secret outside an environment`);
    }
  }
});

ok('the tools that ask public routers and the IGN keep to the gap DATA.md promises', () => {
  // DATA.md: FOSSGIS ask for one request a second, and the IGN's elevation tiles are asked
  // for 1,5 s apart. compareWalkRouter.ts kept 1.1 s ("the only rate this may ever run at");
  // calibrateWalking.ts asked the same router every 350 ms. Each file that names one of
  // these hosts is pinned to the pause of the tool that sends the requests, and a new one
  // fails until it is added here. The IGN's address is built in terrain.ts and fetched,
  // paced, by importElevation.ts.
  const POLITE: [string, string, RegExp, number][] = [
    ['tools/calibrateWalking.ts', 'tools/calibrateWalking.ts', /const PAUSE_MS = ([\d_]+);/, 1000],
    ['tools/compareWalkRouter.ts', 'tools/compareWalkRouter.ts', /const MIN_GAP_MS = ([\d_]+);/, 1000],
    ['tools/importOfficialData.ts', 'tools/importOfficialData.ts', /await sleep\(([\d_]+)\);\r?\n {2}\}\r?\n {2}return \{ path/, 1000],
    ['tools/terrain.ts', 'tools/importElevation.ts', /const GAP_MS = ([\d_]+);/, 1500],
  ];
  const hosts = /routing\.openstreetmap\.de|router\.project-osrm\.org|servicios\.idee\.es/;
  const naming = readdirSync(join(root, 'tools')).filter((f) => f.endsWith('.ts') && !f.startsWith('_') && f !== 'test.ts').map((f) => `tools/${f}`).filter((f) => hosts.test(read(f).replace(/^\s*(\/\/|\*).*$/gm, '')));
  assert.deepStrictEqual(naming.sort(), POLITE.map(([f]) => f).sort(), `these tools name a public router or the IGN: ${naming.join(', ')}; each needs its pause pinned here`);
  for (const [, file, pattern, floor] of POLITE) {
    // A pause this cannot find is reported as lost, not as 0 ms: a CRLF checkout once read so.
    const found = pattern.exec(read(file))?.[1];
    assert(found, `${file}: the pause is no longer where this check reads it (${pattern})`);
    const pause = Number(found.replace(/_/g, ''));
    assert(pause >= floor, `${file} waits ${pause} ms between requests; the service it asks wants ${floor}`);
  }
  const gap = Number(/const GAP_MS = ([\d_]+);/.exec(read('tools/importElevation.ts'))?.[1]);
  assert(read('DATA.md').replace(/\s+/g, ' ').includes(`spaced ${String(gap / 1000).replace('.', ',')} s apart`), `DATA.md no longer says the IGN is asked ${gap / 1000} s apart`);
});

ok('the gates run on every push and proposal, offline, and only the schedule reads other people’s sites', () => {
  // CLAUDE.md: ci.yml runs the five gates on every push and nothing merges without them;
  // all four are offline; a pull request never publishes; the tools that read buslugo.com,
  // the council's feed or Overpass run by hand or on a schedule, never in a loop. SECURITY.md:
  // the type check and the suite run before anything is built, Dependabot looks weekly. Only
  // the YAML held any of it, and a step taken out of it is the kind of change nobody re-reads.
  // Read through a CRLF checkout: a step's line ending in \r is not "run: |", and every
  // command under it went unread, so the weekly step looked removed when it was not.
  const workflow = (name: string) => read(`.github/workflows/${name}`).replace(/\r\n/g, '\n').replace(/^\s*#.*$/gm, '');
  // A step's command, whether on its own line or in a `run: |` block under it.
  const runs = (text: string) => {
    const lines = text.split('\n');
    const out: string[] = [];
    lines.forEach((line, i) => {
      const m = /^(\s*)(?:- )?run: (.+)$/.exec(line);
      if (!m) return;
      if (!/^[|>]-?$/.test(m[2].trim())) return void out.push(m[2].trim());
      const block: string[] = [];
      for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > m[1].length); j++) block.push(lines[j].trim());
      out.push(block.filter(Boolean).join('\n'));
    });
    return out;
  };
  const ci = workflow('ci.yml');
  assert.deepStrictEqual(runs(ci), [
    'pnpm install --frozen-lockfile', 'pnpm run lint', 'pnpm test', 'pnpm run check:policy', 'pnpm run check:deep',
    'pnpm run data:build && git diff --exit-code --stat -- src/data', 'pnpm run build', 'pnpm test',
    'PORT=3002 node dist-server/server.cjs > server.log 2>&1 &\nfor i in $(seq 1 30); do curl -sf http://localhost:3002/ > /dev/null && break; sleep 1; done\npnpm run audit:browser',
  ], 'ci.yml no longer runs the gates, this check, the dataset rebuild, the suite against the build and the browser audit, in that order');
  // The audit is a gate only if a finding fails it and a run that never started fails it too.
  const audit = read('tools/auditBrowser.ts');
  assert(/if \(gated\.length\) process\.exitCode = 1;/.test(audit) && /if \(!ran && process\.env\.CI\) process\.exitCode = 1;/.test(audit), 'the browser audit passes CI with findings, or without running');
  // And it reads nobody's site: every request to another host is refused, and the API answered from fixtures.
  assert(/if \(url\.host !== audited\) return void page\.send\('Fetch\.failRequest'/.test(audit) && /await page\.send\('Network\.setBypassServiceWorker', \{ bypass: true \}\)/.test(audit), 'the browser audit can reach another host from CI');
  assert(/pull_request:\s*\n\s*branches: \[main, develop\]/.test(ci) && /push:\s*\n\s*branches-ignore: \[main\]/.test(ci), 'ci.yml no longer runs on every proposal to main and develop and every push but main');
  // What makes "nothing merges without them" true is a ruleset on GitHub that main requires
  // the job called checks; the weekly job asks GitHub that it still does. A renamed job is
  // a check main waits for and never gets.
  assert(/^ {2}checks:\s*$/m.test(ci), 'the ci.yml job is no longer called "checks", the name the ruleset on main requires');
  const weekly = runs(workflow('check-source.yml')).join('\n');
  assert(weekly.includes('rules/branches/main') && weekly.includes('.context == "checks"') && weekly.includes('for branch in main develop'), 'check-source.yml no longer asks GitHub that main requires the checks and that main and develop cannot be rewritten');
  assert(weekly.includes('pnpm exec tsx tools/checkHolidaysAhead.ts'), 'check-source.yml no longer warns from November that next year’s holidays are missing');
  assert(weekly.includes('pnpm exec tsx tools/checkNoticesReviewed.ts'), 'check-source.yml no longer asks every Monday for the structural notices to be reviewed');
  const pkg = JSON.parse(read('package.json'));
  assert(pkg.scripts['check:deep'] === 'tsx tools/stressInvariants.ts && tsx tools/stressPlanner.ts', `check:deep runs "${pkg.scripts['check:deep']}", not the two offline sweeps`);
  for (const sweep of ['tools/stressInvariants.ts', 'tools/stressPlanner.ts']) assert(!/\bfetch\(|overpass\(/.test(read(sweep)), `${sweep} reaches the network, and it is a gate`);

  // Deploying is a push to main or the clock, never a proposal, and checks before it builds.
  for (const [name, build] of [['deploy-pages.yml', 'pnpm run build'], ['deploy-worker.yml', 'pnpm run worker:build']] as const) {
    const text = workflow(name);
    assert(!/^\s*pull_request/m.test(text), `${name} runs on a pull request, and a pull request must never publish`);
    const steps = runs(text);
    const at = (step: string) => steps.findIndex((s) => s.includes(step));
    assert(at('pnpm run lint') >= 0 && at('pnpm test') >= 0 && at('pnpm run lint') < at(build) && at('pnpm test') < at(build), `${name} builds before it type-checks and tests`);
  }

  // Every install is the locked one, and pnpm comes from packageManager, not from a workflow.
  const network = /importOfficialData|importOsmRoutes|importStopAmenities|fetchAlerts|calibrateWalking|importFonts|checkParsersUnchanged|reconcile\.ts|checkFares|checkOsmGeometry|compareOperatorTimes|data:(fetch|osm|amenities|alerts)\b|pnpm (run )?reconcile\b|compare:operator|calibrate:walking|fonts:import|check:parsers/;
  for (const name of readdirSync(join(root, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f))) {
    const text = workflow(name);
    for (const step of runs(text).filter((s) => /pnpm (i|install)\b/.test(s))) assert(step === 'pnpm install --frozen-lockfile', `${name}: "${step}" is not the locked install`);
    for (const step of text.split(/\n(?=\s*- )/).filter((s) => /uses:\s*pnpm\/action-setup@/.test(s))) assert(!/^\s*version:/m.test(step), `${name}: pnpm/action-setup is given a version, so the workflow and package.json can drift apart`);
    // The image is named, not "latest": the browser audit measures text in the runner's own
    // fonts, which already found three reflows Windows did not, and GitHub moves ubuntu-latest
    // to 26.04 from 19 October 2026. A new image is a change made on purpose, with an audit.
    const images = [...text.matchAll(/runs-on:\s*(\S+)/g)].map((m) => m[1]);
    assert(images.length > 0 && images.every((image) => image === 'ubuntu-24.04'), `${name} runs on ${images.join(', ')}, not the pinned ubuntu-24.04`);
    // Somebody else's site only on the clock: Mondays in check-source.yml, and the notices
    // snapshot in the hourly Pages build. Never in the gates.
    const reaching = runs(text).filter((s) => network.test(s));
    if (name === 'check-source.yml') assert(/cron: '\S+ \S+ \* \* 1'/.test(text) && !/^\s*(push|pull_request):/m.test(text), 'check-source.yml reads other people’s sites on something other than its Monday schedule');
    else if (name === 'deploy-pages.yml') assert(reaching.every((s) => /fetchAlerts/.test(s)), `deploy-pages.yml reaches other sites beyond the notices: ${reaching.join(' | ')}`);
    else assert(reaching.length === 0, `${name} runs a tool that reads somebody else’s site: ${reaching.join(' | ')}`);
  }

  // Each entry read on its own: one pattern across the file found the next entry's "weekly".
  const entries = read('.github/dependabot.yml').split(/\n(?=\s*- package-ecosystem:)/);
  for (const ecosystem of ['npm', 'github-actions']) {
    const entry = entries.find((e) => new RegExp(`package-ecosystem: ${ecosystem}\\b`).test(e)) ?? '';
    assert(/^\s*interval: weekly\s*$/m.test(entry), `Dependabot no longer looks at ${ecosystem} weekly`);
  }
});

ok('the documents name every data file, every bundled library and every host a visit contacts', () => {
  // DATA.md, NOTICE.md and PRIVACY.md are promises about provenance, credit and what leaves
  // the device, and each was kept by hand: three of the fourteen data files went unnamed in
  // DATA.md, the dataset itself among them.
  const tracked = execFileSync('git', ['ls-files', '-z', 'src/data', 'data', 'public'], { cwd: root, encoding: 'utf8' }).split('\0').filter((f) => f.endsWith('.json'));
  assert(tracked.length >= 10, `git lists only ${tracked.length} data files, so this is not reading the repository`);
  const data = read('DATA.md');
  for (const file of tracked) assert(data.includes(file.split('/').pop()!), `${file} ships or builds the dataset and DATA.md does not say where it comes from`);

  // Every library the build bundles, by the name NOTICE.md credits it under. A new
  // dependency fails here until it has a row there and an entry in this table.
  const notice = read('NOTICE.md');
  const CREDITED: Record<string, string> = {
    react: 'React', 'react-dom': 'React DOM', leaflet: 'Leaflet', 'maplibre-gl': 'MapLibre GL JS',
    '@maplibre/maplibre-gl-leaflet': 'maplibre-gl-leaflet', 'lucide-react': 'Lucide', express: 'Express',
    tailwindcss: 'Tailwind CSS', 'vite-plugin-pwa': 'Workbox',
  };
  const pkg = JSON.parse(read('package.json'));
  for (const name of [...Object.keys(pkg.dependencies), 'tailwindcss', 'vite-plugin-pwa']) {
    assert(CREDITED[name], `${name} is a dependency with no credit recorded; add it to NOTICE.md and to this table`);
    assert(notice.includes(CREDITED[name]), `NOTICE.md does not credit ${CREDITED[name]} (${name})`);
  }
  // The typeface is redistributed, so its licence travels beside it, naming both families,
  // and NOTICE.md counts the files that are really there.
  const ofl = read('src/fonts/OFL.txt');
  assert(/Atkinson Hyperlegible Next/.test(ofl) && /Atkinson Hyperlegible Mono/.test(ofl), 'src/fonts/OFL.txt no longer carries the copyright of both families');
  const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];
  const woff = readdirSync(join(root, 'src', 'fonts')).filter((f) => f.endsWith('.woff2')).length;
  assert(new RegExp(`\\b${words[woff]} files\\b`, 'i').test(notice), `src/fonts has ${woff} font files and NOTICE.md says otherwise`);
  // The heights in the walking network are the IGN's, CC BY, and DATA.md says NOTICE.md carries the credit.
  assert(notice.includes('CC BY 4.0 scne.es'), 'NOTICE.md lost the attribution the IGN asks for');

  // PRIVACY.md lists the hosts a visit contacts, "and that is the whole list": exactly the
  // remote origins the content security policy lets the page reach.
  const privacy = read('PRIVACY.md');
  const listed = [...privacy.matchAll(/^\| `([a-z0-9.-]+\.[a-z]{2,})` \|/gm)].map((m) => `https://${m[1]}`).sort();
  const allowed = [...new Set([...CSP_HEADER.matchAll(/https:\/\/[^\s;]+/g)].map((m) => m[0]))].sort();
  assert.deepStrictEqual(listed, allowed, `PRIVACY.md lists [${listed.join(', ')}] as the hosts a visit contacts; the policy allows [${allowed.join(', ')}]`);
});

ok('no session transcript and no build output is tracked, and the ignore file still says so', () => {
  // The assistant directories hold verbatim transcripts and absolute paths with the
  // machine's user name, and this repository is public (CLAUDE.md); build output is not
  // committed anywhere. Only .gitignore held either, and `git add -f` walks past it.
  const NEVER = ['.claude/', '.antigravity/', '.agents/', '.codex/', '.impeccable/', 'dist/', 'dist-server/', 'worker/dist/'];
  const ignore = read('.gitignore').split(/\r?\n/);
  for (const entry of NEVER) assert(ignore.includes(entry), `.gitignore no longer lists ${entry}`);
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert(tracked.length > 100, `git lists ${tracked.length} files, so this is not reading the repository`);
  const leaked = tracked.filter((file) => NEVER.some((dir) => file.startsWith(dir)));
  assert(leaked.length === 0, `tracked, and never to be: ${leaked.slice(0, 5).join(', ')}${leaked.length > 5 ? ` and ${leaked.length - 5} more` : ''}`);
});

ok('the lockfile keeps the two pinned packages above their advisories', () => {
  // pnpm-workspace.yaml overrides qs and fast-uri past a denial of service and a bypass,
  // fast-uri with a ceiling so a fix cannot become an outage; the README and the yaml say
  // so and nothing checked what was resolved. An override may go once a parent asks for a
  // fixed version itself, so it is the resolved version that is held, not the line.
  const lock = read('pnpm-lock.yaml');
  const versions = (name: string) => [...lock.matchAll(new RegExp(`^  ${name}@(\\d+)\\.(\\d+)\\.(\\d+):`, 'gm'))].map((m) => m.slice(1, 4).map(Number));
  const atLeast = (v: number[], min: number[]) => v[0] !== min[0] ? v[0] > min[0] : v[1] !== min[1] ? v[1] > min[1] : v[2] >= min[2];
  const qs = versions('qs');
  const fastUri = versions('fast-uri');
  assert(qs.length > 0 && fastUri.length > 0, 'qs or fast-uri is no longer in the lockfile, so this checks nothing; drop it with its override');
  for (const v of qs) assert(atLeast(v, [6, 16, 0]), `the lockfile resolves qs ${v.join('.')}, under 6.16.0`);
  for (const v of fastUri) assert(atLeast(v, [3, 1, 8]) && v[0] < 4, `the lockfile resolves fast-uri ${v.join('.')}, outside >=3.1.8 <4`);
});

console.log(`
${checks} policy checks passed
`);
