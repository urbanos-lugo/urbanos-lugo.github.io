/**
 * Repository policy, not the app: `pnpm run check:policy`, a step in ci.yml. What the
 * workflows run and when, the pauses the network tools keep, what the documents promise,
 * what is never tracked, the lockfile's floors; and, at the end, the design vocabulary's
 * guards: every visual value a token, every repeated element its one component or class, and
 * the fixes of round 37 held. These read files rather than run code, which is why they are
 * not in tools/test.ts; each still names the slip it was written after.
 */
import assert from 'assert';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'node:module';
import { CSP_HEADER } from '../src/security/csp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const relative = (full: string) => full.slice(root.length + 1);

/**
 * The string and template literals of a source file, its comments skipped: read with one
 * regex, an apostrophe in a comment ("the map's panel") opened a string that ran to the next.
 */
function stringLiterals(code: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      i = code.indexOf('\n', i);
      if (i < 0) break;
    } else if (c === '/' && code[i + 1] === '*') {
      i = code.indexOf('*/', i + 2) + 1;
      if (i <= 0) break;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      for (; j < code.length && code[j] !== c; j++) {
        if (code[j] === '\\') j++;
        else if (c !== '`' && code[j] === '\n') break;
      }
      out.push(code.slice(i, j + 1));
      i = j;
    }
  }
  return out;
}

/** Every file under a directory whose name matches, for the same checks. */
function listSourceFiles(dir: string, match = /\.tsx?$/): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full, match));
    else if (match.test(entry.name)) out.push(full);
  }
  return out;
}
const sourcesUnder = (...dirs: string[]) => dirs.flatMap((dir) => listSourceFiles(join(root, dir)));

let checks = 0;
/** TEST_ONLY=<words> runs only the checks whose name contains them: for proving one bites. */
const only = process.env.TEST_ONLY;
const ok = (name: string, fn: () => void) => {
  if (only && !name.includes(only)) return;
  fn();
  checks++;
  console.log(`  ok  ${name}`);
};

/** Same, for the handful of checks that have to await something. */
const okAsync = async (name: string, fn: () => Promise<void>) => {
  if (only && !name.includes(only)) return;
  await fn();
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
    'pnpm install --frozen-lockfile', 'pnpm run build',
    'PORT=3002 node dist-server/server.cjs > server.log 2>&1 &\nfor i in $(seq 1 30); do curl -sf http://localhost:3002/ > /dev/null && break; sleep 1; done\npnpm run audit:browser',
    'test "$GATES" = success && test "$AUDIT" = success',
  ], 'ci.yml no longer runs the gates, this check, the dataset rebuild, the suite against the build and the browser audit, in that order');
  // The audit runs in parts side by side, one runner each. Every pass the audit knows has a part
  // and so do the sequences, or a pass dropped from the matrix stops being audited and nothing
  // fails. And `checks` waits for both jobs and always runs: a required check that is skipped,
  // as a job is when one it needs fails, counts on GitHub as passed.
  const passNames = [...read('tools/auditBrowser.ts').matchAll(/^ {8}\{ name: '([^']+)', desktop: (?:true|false), lang:/gm)].map((m) => m[1]);
  const parts = [...ci.matchAll(/\{ name: [\w-]+, part: (states|sequences|journeys), passes: '([^']*)' \}/g)].map((m) => ({ part: m[1], passes: m[2] }));
  assert(passNames.length >= 4 && passNames.every((n) => parts.some((p) => p.part === 'states' && p.passes && new RegExp(`^(${p.passes})$`).test(n))) && parts.some((p) => p.part === 'sequences') && parts.some((p) => p.part === 'journeys'), `ci.yml's audit parts no longer cover every pass (${passNames.join(', ')}), the sequences and the journeys`);
  assert(/AUDIT_PART: \$\{\{ matrix\.part \}\}/.test(ci) && /AUDIT_PASSES: \$\{\{ matrix\.passes \}\}/.test(ci), 'ci.yml runs every part of the audit as the whole audit');
  assert(/^ {2}checks:\s*\n\s*needs: \[gates, audit\]\s*\n\s*if: always\(\)/m.test(ci), 'the checks job no longer waits for the gates and every part of the audit, whatever they did');
  // The audit is a gate only if a finding fails it and a run that never started fails it too:
  // the guard waits for the run (`.finally`), which is not awaited at the top of its module.
  const audit = read('tools/auditBrowser.ts');
  assert(/if \(gated\.length\) process\.exitCode = 1;/.test(audit) && /\.finally\(\(\) => \{\s*if \(!ran && process\.env\.CI\b/.test(audit), 'the browser audit passes CI with findings, or without running');
  // When it fails, what the screen was is kept: the audit writes it with AUDIT_EVIDENCE set, and
  // a step that runs only on failure uploads it. A finding only the runner gave took two to four
  // pushes to explain from the log alone.
  assert(/AUDIT_EVIDENCE: audit-evidence/.test(ci) && /uses: actions\/upload-artifact@[0-9a-f]{40}[^\n]*\n\s*if: failure\(\)[\s\S]*?\n\s*audit-evidence\//.test(ci), 'ci.yml no longer keeps the screens and findings of a failing browser audit');
  // And that last line stands outside the condition that decides whether the file runs as the
  // audit: inside it, a launch the condition did not recognise printed nothing and exited 0.
  assert(/^let ran = false;$/m.test(audit) && /^if \(process\.argv\[1\] && \/auditBrowser\\\.ts\$\/\.test\(process\.argv\[1\]\)\) \{$/m.test(audit), 'the audit’s CI safety net is back inside the condition it guards');
  // A browser lost mid-run fails what waits on it instead of hanging: a photograph run lost Chrome
  // 700 frames in, every await hung, and Node quit with code 13, naming no state and saving nothing.
  const cdp = read('tools/cdp.ts');
  assert(/addEventListener\('close', \(\) => \{\s*for \(const waiting of this\.pending\.values\(\)\) waiting\.reject\(/.test(cdp) && /if \(this\.socket\.readyState !== WebSocket\.OPEN\) return Promise\.reject\(/.test(cdp), 'a browser lost mid-run leaves its commands waiting forever again');
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
    react: 'React', 'react-dom': 'React DOM', 'maplibre-gl': 'MapLibre GL JS', 'lucide-react': 'Lucide', express: 'Express',
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

ok('a repository named <owner>.github.io deploys at the root', () => {
  // The app moved on 13 October 2026 to an organisation site, urbanos-lugo.github.io, which
  // Pages serves at the root. The deploy built every asset under /<repository>/, which there
  // would have been /urbanos-lugo.github.io/, and the first deploy after the rename would
  // have drawn nothing. Dropped from the suite on 20 October with the checks that read files,
  // while MUDANZA-organizacion.md went on saying a check held it.
  const deploy = read('.github/workflows/deploy-pages.yml');
  assert(
    /if \[ "\$\{NAME,,\}" = "\$\{OWNER,,\}\.github\.io" \]; then\s+export BASE_PATH="\/"\s+export SITE_URL="https:\/\/\$\{NAME,,\}\/"/.test(deploy),
    'the deploy builds an <owner>.github.io repository under its own name again',
  );
  assert(/export BASE_PATH="\/\$NAME\/"\s+export SITE_URL="https:\/\/\$OWNER\.github\.io\/\$NAME\/"/.test(deploy), 'a project site is no longer built under its repository name');
});

ok('no tracked file outside the records names the old address', () => {
  // The site moved from https://braisbrg.github.io/urbanos-lugo/ to https://urbanos-lugo.github.io/
  // on 13 October 2026, and the old address gives 404 and redirects nowhere. A link, a
  // canonical, a sample in a script or a line in the README that still named it would send a
  // reader to a dead page and nothing would say so. The dated records and the move's own guide
  // keep it on purpose, as what was true then, and the README to say it is dead; this file
  // keeps it as the thing to look for. Dropped from the suite on 20 October with the checks that
  // read files, while DECIDIDO.md went on saying a check held it.
  const RECORDS = ['README.md', 'design/DECIDIDO.md', 'design/REXISTRO-probas.md', 'design/AUDITORIA-seo.md', 'design/NOTAS-fontes-e-autosuficiencia.md', 'design/MUDANZA-organizacion.md', 'tools/checkPolicy.ts'];
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  assert(tracked.length > 100, `git lists ${tracked.length} files, so this is not reading the repository`);
  const offenders = tracked.filter((file) => {
    if (RECORDS.includes(file) || !existsSync(join(root, file))) return false;
    if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|gz)$/i.test(file)) return false;
    // The old repository too: GitHub redirects it only until somebody creates one by that name.
    return /braisbrg\.github\.io|github\.com\/braisbrg\/urbanos-lugo/i.test(readFileSync(join(root, file), 'utf8'));
  });
  assert(offenders.length === 0, `still names the old site or repository: ${offenders.join(', ')}`);
  // The README names it once, to say it is dead and does not redirect. Any other paragraph
  // naming it would be a link to follow.
  const mentions = read('README.md').split(/\r?\n\s*\n/).filter((paragraph) => /braisbrg\.github\.io/i.test(paragraph));
  assert(mentions.every((paragraph) => paragraph.includes('404')), 'README.md names braisbrg.github.io outside the paragraph that says it gives 404');
});

ok('src/data holds only what ships, and the build inputs stay out of it', () => {
  // Four files in src/data were build scaffolding the app never imported, 1.4 MB one
  // distracted import away from the bundle. They live in data/ now, and the README says a
  // check fails if one comes back or src/ names one: dropped from the suite on 20 October
  // with the checks that read files, and the README kept saying it.
  const BUILD_ONLY = ['official-raw.json', 'osm-routes.json', 'routes.json', 'stop-amenities.json'];
  for (const name of BUILD_ONLY) {
    assert(!existsSync(join(root, 'src', 'data', name)), `${name} is back in src/data; it is a build input and the app never reads it`);
    assert(existsSync(join(root, 'data', name)), `data/${name} is missing, so the build cannot run`);
  }
  const offenders: string[] = [];
  for (const file of sourcesUnder('src')) {
    const text = readFileSync(file, 'utf8');
    for (const name of BUILD_ONLY) if (text.includes(name)) offenders.push(`${relative(file)} names ${name}`);
  }
  assert(offenders.length === 0, `a build input reached the app:\n    ${offenders.join('\n    ')}`);
});

ok('index.html keeps the Search Console verification tag', () => {
  // Search Console re-checks its verification tag now and then; a head rewrite that
  // dropped it would end the verification without anything on screen changing.
  assert(/<meta name="google-site-verification" content="[\w-]{20,}"/.test(read('index.html')), 'index.html lost the Search Console verification tag');
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
  for (const v of qs) assert(atLeast(v, [6, 16, 1]) && v[0] < 7, `the lockfile resolves qs ${v.join('.')}, outside >=6.16.1 <7`);
  for (const v of fastUri) assert(atLeast(v, [3, 1, 9]) && v[0] < 4, `the lockfile resolves fast-uri ${v.join('.')}, outside >=3.1.9 <4`);
});

// The design, round 37 of REXISTRO: one visual vocabulary. Moved here from the suite on 20 October 2026,
// when the suite kept only what runs the code; each was shown to fail on its bug again.

ok('the amber of a worked-out time is never a warning’s', () => {
  // DECIDIDO.md: amber means a time this app worked out, and nothing else carries meaning.
  // Warnings had borrowed it: the planner's alert icons and the title inside its warn boxes,
  // the camera's refusal, the notices' title icon, the stale-review sentence, the menu's
  // notices row. A warning speaks in the warn ink; amber stays with ~ ESTIMADO.
  const leaks: string[] = [];
  for (const file of sourcesUnder('src/components')) {
    if (!file.endsWith('.tsx')) continue;
    for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      if (/<(AlertCircle|AlertTriangle|TriangleAlert)\b[^>]*\btext-estimated\b/.test(line) || /role="alert"[^>]*\btext-estimated\b/.test(line) || /\bbg-warn\b[^"`]*\btext-estimated\b/.test(line)) leaks.push(`${relative(file)}:${i + 1}`);
    }
  }
  assert(leaks.length === 0, `a warning wears the estimated amber: ${leaks.join(', ')}`);
});

ok('the operator’s folded notice and the plain notice are one component each', () => {
  // The folded notice was written three times -- board, planner, line page -- with three
  // paddings, two icons, two fills and two body indents, each indent added up by hand from
  // its own padding, icon and gap (34 px and 40 px, the first in px beside rem neighbours).
  // Six warn and neutral boxes repeated Notice by hand. A details in the warn fill, or a
  // bordered box in it, outside ui/controls.tsx is a copy coming back.
  const copies: string[] = [];
  for (const file of sourcesUnder('src/components')) {
    if (!file.endsWith('.tsx') || file.endsWith('controls.tsx')) continue;
    for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      if (/<details\b[^>]*\bbg-warn\b/.test(line) || /className="[^"]*\bborder border-warn bg-warn p-3\b/.test(line)) copies.push(`${relative(file)}:${i + 1}`);
    }
  }
  assert(copies.length === 0, `a hand-made copy of a notice: ${copies.join(', ')}`);
  for (const file of ['StopArrivalsView.tsx', 'RoutePlannerView.tsx', 'LinesView.tsx']) assert(read(`src/components/${file}`).includes('<NoticeDisclosure'), `${file} no longer folds the operator's notice with NoticeDisclosure`);
});

ok('a close, dismiss or clear button is a 44 px target with the X, never a ✕ in the text', () => {
  // The board dismissed a fired alarm with a ✕ in the text, underlined, about 9 px wide and
  // with no floor; the planner cleared a field with the same character while the search box
  // drew lucide's X. And the two drawers and the QR reader closed with three buttons:
  // two inks, two glyph sizes, hover or not. Scrims that close a sheet are buttons too and
  // cover the screen; they are not counted.
  const small: string[] = [];
  for (const file of sourcesUnder('src')) {
    if (!file.endsWith('.tsx')) continue;
    const code = readFileSync(file, 'utf8');
    assert(!/>\s*✕\s*</.test(code), `${relative(file)} draws a close as the ✕ character`);
    // `=>` is allowed inside the tag: an onClick arrow often comes before the label.
    for (const m of code.matchAll(/<button\b(?:=>|[^>])*?aria-label=\{t\.[\w.]*(?:close|dismiss|clear)\w*\}(?:=>|[^>])*>/gi)) {
      if (/\binset-0\b/.test(m[0])) continue;
      if (!/[\s"](?:h-tap w-tap|h-12 w-12|h-tap-bar w-tap-bar)[\s"]/.test(m[0])) small.push(`${relative(file)}: ${m[0].slice(0, 90)}`);
    }
  }
  assert(small.length === 0, `a close, dismiss or clear button under 44 px: ${small.join(' | ')}`);
  // The ways out of a surface are CloseButton now, and its own class carries the floor.
  assert(/export function CloseButton[\s\S]*?className=\{`flex h-tap w-tap shrink-0 /.test(read('src/components/ui/controls.tsx')), 'CloseButton no longer carries the 44 px floor');
});

ok('no button or time field is drawn under the 44 px floor', () => {
  // Two had slipped under it: the map panel's "show every line" inside the around-a-stop
  // callout, at h-9 (36 px), and the planner's time field, padded to about 30 px with a
  // 4 px corner while the board's twin is 44 px with the control's. audit:browser prints
  // the house floor without stopping CI, so the source holds it here.
  const under: string[] = [];
  for (const file of sourcesUnder('src')) {
    if (!file.endsWith('.tsx')) continue;
    const code = readFileSync(file, 'utf8');
    // A height with a variant in front (before:h-9, the swap button's disc) is not the target's.
    // `=>` is allowed on the way to the class: an onClick arrow comes first in most buttons.
    for (const m of code.matchAll(/<button\b(?:=>|[^>])*?className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) if (/(?<![\w:-])(?:min-)?h-(?:[1-9]|10)\b/.test(m[1] ?? m[2])) under.push(`${relative(file)}: ${(m[1] ?? m[2]).slice(0, 80)}`);
    // The .field class carries the floor (held below).
    for (const m of code.matchAll(/<input type="time"[\s\S]*?\/>/g)) if (!/\b(?:h-tap|field)\b/.test(m[0])) under.push(`${relative(file)}: ${m[0].slice(0, 80)}`);
  }
  assert(under.length === 0, `under the 44 px floor: ${under.join(' | ')}`);
  assert(/\.field \{ min-height: var\(--spacing-tap\);/.test(read('src/index.css')), 'the field class no longer carries the 44 px floor');
  // And one line is the 44 px box h-tap drew: .field with only the floor set the lines search's
  // and the time fields' text a pixel higher. The QR field is the plain field since 20 October
  // 2026, with the app's focus ring rather than a ring of its own.
  assert(/\.field \{ min-height: var\(--spacing-tap\); height: var\(--spacing-tap\);/.test(read('src/index.css')) && /className="field"/.test(read('src/components/QrScannerModal.tsx')), 'a one-line field is a floor again, and its text sits a pixel higher than h-tap set it');
});

ok('an underline sits 2 px under its text everywhere, and "clear recent" is one action', () => {
  // Eight underlined actions used the browser's position, flush on the descenders, beside
  // the others at 2 px. And the same action and words, "clear the recent ones", were an
  // accent semibold link in the planner and an ink-2 medium one on the stops home.
  const flush: string[] = [];
  for (const file of sourcesUnder('src')) {
    if (!/\.tsx?$/.test(file)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/class(?:Name)?=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const cls = m[1] ?? m[2];
      if (/(?:^|\s)underline(?:\s|$)/.test(cls) && !/\bunderline-offset-link\b/.test(cls)) flush.push(`${relative(file)}: ${cls.slice(0, 60)}`);
    }
  }
  assert(flush.length === 0, `an underline without its 2 px: ${flush.join(' | ')}`);
  assert(/\.link-text, \.link \{[^}]*text-decoration-line: underline;[^}]*text-underline-offset: var\(--text-underline-offset-link\)/.test(read('src/index.css')), 'the link classes no longer underline 2 px under the text');
  const home = /<button onClick=\{onClearRecent\} className="([^"]*)"/.exec(read('src/components/StopHome.tsx'))?.[1];
  const planner = /className="([^"]*)"\s*>\s*\{[^}]*t\.stopHome\.clearRecent/.exec(read('src/components/RoutePlannerView.tsx'))?.[1];
  assert(home && planner, 'could not find the two "clear recent" buttons, so this is reading the wrong thing');
  assert(home === planner, `"clear recent" is drawn two ways: "${home}" and "${planner}"`);
});

ok('a ring that cuts a dot out of what it sits on is the ground, in both themes', () => {
  // The bottom bar's ride dot and the buses on the map ring themselves in the ground colour;
  // the itinerary's nodes and a line's stop markers used white, a bright ring on the dark
  // theme. And the walk node set the glyph in the accent's ink on the ink fill.
  const white: string[] = [];
  for (const file of sourcesUnder('src/components')) {
    if (!file.endsWith('.tsx')) continue;
    for (const [i, line] of readFileSync(file, 'utf8').split('\n').entries()) {
      // The bar's ride dot is OnTripMark, which draws the round and takes the ring from its caller.
      if (/(?:\brounded-pill\b|<OnTripMark className=")[^"`]*\bborder-strong\b[^"`]*\bborder-(?:white|on-line|on-camera)\b/.test(line)) white.push(`${relative(file)}:${i + 1}`);
      if (/\bbg-ink text-on-accent\b/.test(line)) white.push(`${relative(file)}:${i + 1} (on-accent ink on the ink fill)`);
    }
  }
  assert(white.length === 0, `a dot ringed in white, or ink on ink: ${white.join(', ')}`);
});

ok('the two drawers from the right are one shell, over a scrim that is a button', () => {
  // The menu sat at z 1500 and the favourites at 2000; one panel had the overlay shadow
  // and the edge border, the other neither; the favourites' scrim was a div that closed
  // on a click and said nothing to anyone. Same gesture, same edge, so the same shell.
  // One shell since 19 October 2026, ui/Drawer.tsx, which both drawers render.
  for (const file of ['MenuDrawer.tsx', 'FavoritesDrawer.tsx']) {
    assert(/<Drawer open=\{\w+\} onClose=\{onClose\} label=\{t\.\w+\.\w+\} closeLabel=\{t\.\w+\.close\}/.test(read(`src/components/${file}`)), `${file}: the drawer is not the shared shell`);
  }
  const code = read('src/components/ui/Drawer.tsx');
  assert(/role="dialog" aria-modal="true"[^>]*className="fixed inset-0 z-dialog\b/.test(code), `Drawer.tsx: the drawer is not on the dialogs' layer`);
  assert(/<Scrim label=\{closeLabel\} onClose=\{onClose\} className="absolute" \/>/.test(code) && /export function Scrim[\s\S]*?<button type="button" tabIndex=\{-1\} aria-label=\{label\} onClick=\{onClose\} className=\{`anim-fade-full inset-0 bg-scrim /.test(read('src/components/ui/controls.tsx')), `Drawer.tsx: the scrim is not a button that closes, out of the Tab order`);
  assert(/const panel = '[^']*\banim-slide-in\b[^']*\bborder-l border-edge\b[^']*\bshadow-overlay\b/.test(code) && (code.match(/\$\{panel\}/g) ?? []).length === 2, `Drawer.tsx: a panel lacks the edge border or the overlay shadow`);
});

ok('a pole code is one chip, or one inline form', () => {
  // The code a rider reads off the pole was drawn nine ways: three chips (one of them
  // medium weight), a fourth chip in the planner's suggestions in bold mono with smaller
  // padding and a "#" in front, two inline codes in font-mono, one in the sans bold.
  const off: string[] = [];
  let chips = 0;
  for (const file of sourcesUnder('src/components')) {
    if (!file.endsWith('.tsx')) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/<(?:span|b) className=(?:"([^"]*)"|\{`([^`]*)`\})>(?:#)?\{(?:poleCode\([^)]*\)|sug\.code|code)\}/g)) {
      const cls = m[1] ?? m[2];
      const chip = /\btnum\b[^"]*\brounded-tag bg-surface px-2 py-1 text-label text-ink-2\b/.test(cls);
      if (chip) chips++;
      if (!chip && !/^tnum (?:font-bold )?text-ink-2$/.test(cls)) off.push(`${relative(file)}: ${m[0].slice(0, 70)}`);
    }
  }
  assert(off.length === 0, `a pole code drawn its own way: ${off.join(' | ')}`);
  assert(chips > 0, 'no pole code chip found: the check read nothing');
});

ok('the home screen marks every worked-out time with the muted tilde', () => {
  // The board's comment makes the muted ~ the tilde's documented form, and the home screen
  // used it twice; a saved line's minutes wrote it as a bare string in the figure's ink.
  const home = read('src/components/StopHome.tsx');
  assert(!/\?\s*''\s*:\s*'~'|\?\s*'~'\s*:\s*''/.test(home), 'StopHome writes a tilde as a bare string in the figure’s colour');
  assert((home.match(/<Approx on=\{[^}]+\} \/>/g) ?? []).length >= 3 && /className=\{inherit \? undefined : 'text-ink-3'\}/.test(read('src/components/ui/Provenance.tsx')), 'StopHome has fewer than its three muted tildes');
});

ok('every chevron that turns, turns as the disclosure’s does', () => {
  // The disclosures' chevron turns in 200 ms on the entering curve; the planner's "more
  // options" turned in 200 ms on the default curve and the map's line chips in 150 ms,
  // each with its own rotate-180.
  const off: string[] = [];
  for (const file of sourcesUnder('src/components')) {
    for (const m of readFileSync(file, 'utf8').matchAll(/<Chevron\w+ className=(?:"[^"]*"|\{`[^`]*`\})/g)) {
      if (/rotate-/.test(m[0])) off.push(`${relative(file)}: ${m[0].slice(0, 90)}`);
    }
  }
  assert(off.length === 0, `a chevron turning on its own terms: ${off.join(' | ')}`);
  assert(/\[aria-expanded="true"\] > \.disclosure-chevron/.test(read('src/index.css')), 'index.css no longer turns the chevron of a button that unfolds');
});

ok('an icon’s stroke comes from its role, not a number at the icon', () => {
  // Eight widths were typed at the icons -- 1.6, 1.8, 2, 2.4, 2.5, 2.6, 3, 3.4 -- 39 of
  // them Lucide's own default, and three for the same small bold tick or arrow.
  const off = sourcesUnder('src/components').concat(join(root, 'src/App.tsx')).filter((file) => /strokeWidth/.test(readFileSync(file, 'utf8')));
  assert(off.length === 0, `strokeWidth typed at an icon: ${off.map(relative).join(', ')}`);
  const roles = [...read('src/index.css').matchAll(/--stroke-width-([\w-]+):/g)].map((m) => m[1]);
  assert.deepStrictEqual(roles, ['light', 'filled', 'bold', 'heavy', 'chip', 'marker'], `the stroke roles in index.css are not the icons' five and the bus marker's ring: ${roles.join(', ')}`);
});

ok('the two provenance chips are one box', () => {
  // HORARIO OFICIAL padded 8 by 4 px with no edge; ~ ESTIMADO padded 7 by 3 inside a 1.5 px
  // dash, so it stood a pixel larger each way beside it. Its padding is now the official
  // chip's less the dash.
  const chip = read('src/components/ui/Provenance.tsx');
  const estimated = /className="([^"]*\bchip-estimated\b[^"]*)"/.exec(chip)?.[1];
  assert(/\bbg-official px-2 py-1\b/.test(chip) && estimated, 'Provenance no longer draws the official chip px-2 py-1 and the estimated one with .chip-estimated');
  assert(!/(?:^|\s)p[xytrbl]?-/.test(estimated), `the estimated chip pads itself again: ${estimated}`);
  assert(/\.chip-estimated \{ padding: calc\(var\(--spacing\) - var\(--border-width-dash\)\) calc\(var\(--spacing\) \* 2 - var\(--border-width-dash\)\); \}/.test(read('src/index.css')), '.chip-estimated is no longer the official padding less the dash');
  // The map's notice that the buses are estimated is a glass pill with the same dash: the two
  // classes weigh the same, so the later one wins, and above .map-glass the dash kept its style
  // but took the pill's 1 px and plain edge colour, the estimated colour gone.
  const layers = read('src/index.css');
  assert(layers.indexOf('.map-glass {') > 0 && layers.indexOf('.edge-estimated {') > layers.indexOf('.map-glass {') && /className="[^"]*\bmap-glass edge-estimated\b/.test(read('src/components/Map/TransitMap.tsx')), 'the map’s estimated-buses notice can lose its dash to the glass pill’s plain edge again');
});

ok('the stops a ride passes line up under the words that unfold them', () => {
  // The list was indented 21 px; the summary's words start after a 16 px chevron and a 6 px
  // gap, so every stop name stood a pixel left of the line it hangs from.
  const itinerary = read('src/components/planner/Itinerary.tsx');
  const fold = /<summary className="[^"]*\bgap-([\d.]+)\b[^"]*">\s*<ChevronDown className="[^"]*\bw-([\d.]+)\b[^"]*" aria-hidden="true" \/>[\s\S]*?<\/summary>\s*<ol className="[^"]*\bpl-([\d.]+)\b/.exec(itinerary);
  assert(fold, 'the via stops are no longer a list under a chevron summary, or are indented in something other than steps');
  assert(Number(fold[1]) + Number(fold[2]) === Number(fold[3]), `the via stops sit at ${fold[3]} steps, the summary's words at ${Number(fold[1]) + Number(fold[2])}`);
});

await okAsync('every colour, size, space, corner, edge, shadow, layer, duration and curve is a named token', async () => {
  // October 2026: every value the interface drew with was named in index.css, by its role, or
  // in the map's DRAW table where the map takes numbers, and Tailwind's own scales were cleared.
  // Run on the tree before that round, this check reported 256 values that named no token:
  // 96 classes, 57 raw values in index.css's own rules, 44 numbers in the maps' layers, 24
  // colours in strings, 18 style attributes and 6 SVG attributes in HTML strings, a class that
  // generated nothing and a size nothing used -- and that is counting Tailwind's default scales,
  // value-named, as tokens. This is what keeps a new one out, in each place one could hide.
  const off: string[] = [];
  const css = read('src/index.css');
  const sources = sourcesUnder('src').filter((file) => !/[\\/]src[\\/](data|i18n)[\\/]/.test(file)).concat(join(root, 'index.html'));
  const literals = stringLiterals;

  // 1. Classes. Tailwind compiles every token the sources hold, against index.css with the
  // theme left as variables, so a class that takes a token reads var(--…) and one that does
  // not reads a raw value. Tailwind's own plumbing (--tw-*), its hairline border, fractions,
  // column counts and keywords are not values anyone chose.
  const { compile } = await import('tailwindcss');
  const twDir = dirname(createRequire(join(root, 'package.json')).resolve('tailwindcss/package.json'));
  const compiler = await compile(css.replace('@theme inline {', '@theme {'), {
    base: join(root, 'src'),
    async loadStylesheet(id: string, base: string) {
      const path = id === 'tailwindcss' ? join(twDir, 'index.css') : id.startsWith('tailwindcss/') ? join(twDir, id.slice(12)) : join(base, id);
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  // Every token of every string, the strings inside a template's ${…} included; not the CSP's
  // directives, which are words like font-src and no class.
  const candidates = new Set<string>();
  for (const file of sources.filter((f) => !/[\\/]src[\\/]security[\\/]/.test(f))) {
    for (const lit of literals(readFileSync(file, 'utf8'))) {
      for (const token of lit.split(/[\s"'`<>={}$?]+/)) if (/^[!@\w\-:./[\]%(),#&*]+$/.test(token) && /[a-z]/.test(token)) candidates.add(token);
    }
  }
  const utilityOf = (candidate: string) => candidate.replace(/^!/, '').split(/:(?![^[]*\])/).pop()!.replace(/^-/, '');
  const built = compiler.build([...candidates]);
  const utilities = built.slice(built.indexOf('@layer utilities {'), built.indexOf('\n}', built.indexOf('@layer utilities {')));
  const GOVERNED = /^(color|background(-color)?|border(-[a-z]+)*-(color|width|radius)|border-width|border-radius|outline(-width|-offset|-color)?|box-shadow|--tw-(shadow|inset-shadow|drop-shadow|ring-offset-width|backdrop-blur|blur)|filter|backdrop-filter|z-index|opacity|transition-duration|transition-timing-function|transition-delay|animation(-duration|-delay)?|font-size|line-height|letter-spacing|font-weight|font-family|width|height|min-width|min-height|max-width|max-height|padding(-[a-z]+)*|margin(-[a-z]+)*|gap|row-gap|column-gap|top|right|bottom|left|inset(-[a-z]+)*|--tw-translate-[xy]|text-underline-offset|stroke-width|fill|stroke|grid-template-columns|aspect-ratio|scroll-margin(-[a-z]+)*|--tw-leading|--tw-tracking|--tw-font-weight|--tw-space-[xy]-reverse)$/;
  const KEYWORD = /^(0|0px|auto|none|inherit|initial|unset|currentcolor|transparent|100%|1|normal|max-content|min-content|fit-content|100vw|100vh|100dvh|0 0 #0000|calc\(\d+ \/ \d+ \* 100%\)|calc\(calc\(\d+ \/ \d+ \* 100%\) \* -1\)|repeat\(\d+, minmax\(0, 1fr\)\))$/;
  const plumbing = (value: string) => value.replace(/var\(--tw-[\w-]+,?\)/g, '').replace(/[\s,]/g, '') === '';
  const themeHas = (namespace: string, name: string) => new RegExp(`^\\s*--${namespace}-${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm').test(css);
  for (const [, selector, body] of utilities.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/\.sr-only/.test(selector)) continue;
    for (const decl of body.split(';')) {
      const at = decl.indexOf(':');
      const prop = decl.slice(0, at).trim();
      const value = decl.slice(at + 1).trim();
      if (at < 0 || !GOVERNED.test(prop) || /var\(--(?!tw-)/.test(value) || KEYWORD.test(value) || plumbing(value)) continue;
      // The hairline: Tailwind's bare border and divide, and the -px offset, are --default-border-width.
      if (/^border(-[a-z]+)?-width$|^border-width$/.test(prop) && /^(calc\()?1px\b/.test(value)) continue;
      if (/^(top|right|bottom|left)$/.test(prop) && /^-?1px$/.test(value)) continue;
      // outline-hidden keeps a transparent outline for forced colours: Tailwind's, not a choice.
      if (/forced-colors/.test(selector) && /^outline(-offset)?$/.test(prop)) continue;
      // A shadow's value is copied into Tailwind's --tw-shadow; its class names the token.
      const shadow = /\.(?:[\w\\:@-]*\\:)?(shadow|drop-shadow|inset-shadow)-([\w-]+)/.exec(selector);
      if (shadow && (shadow[2] === 'none' || themeHas(shadow[1], shadow[2]))) continue;
      const blur = /\.(?:[\w\\:@-]*\\:)?(?:backdrop-)?blur-([\w-]+)/.exec(selector);
      if (blur && themeHas('blur', blur[1])) continue;
      off.push(`class ${selector.trim().replace(/\\/g, '')} → ${prop}: ${value}`);
    }
  }
  assert(/--default-border-width: 1px;/.test(css), 'the hairline Tailwind’s bare border draws is no longer --default-border-width');
  // A class that generates nothing is a value that went nowhere: py-0.2 and text-white after the
  // reset drew nothing at all, silently.
  const UTILITY = /^-?(bg|text|border|rounded|shadow|ring|outline|p[xytrbls]?|m[xytrbls]?|w|h|size|min-[wh]|max-[wh]|gap(-[xy])?|space-[xy]|z|opacity|duration|ease|delay|animate|tracking|leading|font|stroke|fill|top|right|bottom|left|inset(-[xy])?|translate-[xy]|scale|rotate|grid-cols|col-span|row-start|basis|underline-offset|decoration|backdrop-blur|blur|drop-shadow|divide(-[xy])?|line-clamp|scroll-m[xytrbl]?|aspect)-/;
  const escapeClass = (cls: string) => cls.replace(/[^\w-]/g, (c) => `\\${c}`);
  // Not classes: a custom property's name, the SVG attributes the markers' markup spells, and the
  // map style's own property names and the corners its controls go in.
  const NOT_CLASS = /^--|^(stroke-(width|linecap|linejoin|dasharray)|text-anchor|font-(family|size|weight)|fill-(opacity|color|outline-color)|dominant-baseline|paint-order|(top|bottom)-(left|right))$/;
  for (const candidate of candidates) {
    if (UTILITY.test(utilityOf(candidate)) && !NOT_CLASS.test(candidate) && !/[()]/.test(candidate) && !built.includes(`.${escapeClass(candidate)}`)) off.push(`class ${candidate} generates nothing`);
  }

  // 2. Inline styles carry data -- a line's colour, a count, a position worked out -- never a value.
  for (const file of sources.filter((f) => f.endsWith('.tsx'))) {
    const code = readFileSync(file, 'utf8');
    // style={{ … }} written in place, and a style object built first (const style = { … }).
    for (const m of code.matchAll(/\bstyle\s*=\s*\{\{?/g)) {
      const start = m.index! + m[0].length;
      let depth = 1;
      let end = start;
      for (; end < code.length && depth; end++) depth += code[end] === '{' ? 1 : code[end] === '}' ? -1 : 0;
      for (const [, key, value] of code.slice(start, end - 1).matchAll(/([\w'-]+):\s*((?:'[^']*'|"[^"]*"|`(?:[^`$]|\$\{[^}]*\})*`|[^,'"`])+)/g)) {
        const literal = value.trim();
        const fixed = /^-?\d*\.?\d+$/.test(literal) ? !/^[01]$/.test(literal) : /^['"`]/.test(literal) && /[\d#]/.test(literal.replace(/\$\{[^}]*\}/g, ''));
        if (fixed) off.push(`${relative(file)}: style ${key}: ${literal}`);
      }
    }
  }

  // 3. HTML strings, for the map's markers and popups: a style attribute carries only interpolated data, and an SVG's
  // paint and type come from classes. The one exception is the visually-hidden idiom on the
  // crawlers' <h1> in index.html, sr-only's own values, which has to work before any CSS.
  for (const file of sources) {
    const code = readFileSync(file, 'utf8');
    for (const [, style] of code.matchAll(/style="([^"]*)"/g)) {
      if (/clip:rect\(0,0,0,0\)/.test(style)) continue;
      if (/[\d#]/.test(style.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, ''))) off.push(`${relative(file)}: style="${style.slice(0, 60)}"`);
    }
    for (const [attribute] of code.matchAll(/\b(?:fill|stroke|stroke-width|font-size|font-weight|font-family|letter-spacing|opacity|color)="(?!none"|currentColor"|\$\{[^}]*\}")[^"]*"/g)) off.push(`${relative(file)}: ${attribute}`);
  }

  // 4. A colour is index.css's: none written in a string anywhere else.
  for (const file of sources.filter((f) => !f.endsWith('.html'))) {
    for (const lit of literals(readFileSync(file, 'utf8'))) {
      const colour = /#[0-9a-f]{3}(?:[0-9a-f]{3}(?:[0-9a-f]{2})?)?\b(?![\w-])|\b(?:rgba?|hsla?|oklch|oklab)\(/i.exec(lit);
      if (colour) off.push(`${relative(file)}: colour ${colour[0]} in ${lit.slice(0, 50)}`);
    }
  }

  // 5. The maps' numbers are DRAW's, in palette.ts; a layer's options and its paint name them:
  // the option names a marker, a popup or a fit takes, and the renderer's own quoted style
  // properties ('line-width', 'circle-radius', 'icon-offset'…).
  for (const file of sourcesUnder('src/components/Map').filter((f) => !f.endsWith('palette.ts'))) {
    const code = readFileSync(file, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '');
    for (const [, option, style, value] of code.matchAll(/(?:\b(weight|radius|opacity|fillOpacity|dashArray|iconSize|iconAnchor|zIndexOffset|zIndex|lineWidth|offset|padding|paddingTopLeft|paddingBottomRight)|'((?:line|circle|fill|icon|symbol)-[a-z-]+)')\s*[:=]\s*((?:\[[^\]]*\]|'[^']*'|[^,;}\n])+)/g)) {
      const key = option ?? style;
      // Halving a box for its centre is geometry, not a value.
      if (/(?<![\w.$])-?(?:\d*\.\d+|[2-9]\d*|1\d+)(?![\w.])|'[\d ]+'/.test(value.replace(/\s*\/\s*2\b/g, ''))) off.push(`${relative(file)}: ${key}: ${value.trim()}`);
    }
  }

  // 6. index.css's own rules use its tokens: raw values live only where values are defined --
  // the palettes, @theme, and the keyframes, each a named gesture.
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
  const stack: string[] = [];
  let head = 0;
  for (let i = 0; i < plain.length; i++) {
    const c = plain[i];
    if (c === '{') {
      stack.push(plain.slice(head, i).trim());
      head = i + 1;
    } else if (c === '}' || c === ';') {
      const defining = stack.some((s) => /^(:root|\.dark|@theme|@keyframes|@font-face|@supports not \(color: oklch|from|to|\d+%)/.test(s));
      const decl = plain.slice(head, i).trim();
      if (!defining && /^[\w-]+\s*:/.test(decl)) {
        const value = decl.slice(decl.indexOf(':') + 1).replace(/var\([^()]*(?:\([^()]*\))?[^()]*\)/g, '').replace(/calc\(|min\(|max\(/g, '(');
        const raw = value.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(|(?<![\w.])-?\d*\.?\d+(?:px|rem|em|ms|s|vw|vh|dvh)\b/gi)?.filter((v) => !/^(0s|0px|100vh|100dvh)$/.test(v));
        if (raw?.length) off.push(`index.css: ${decl.replace(/\s+/g, ' ').slice(0, 90)} [${raw.join(' ')}]`);
      }
      if (c === '}') stack.pop();
      head = i + 1;
    }
  }

  // 7. Only as many tokens as the design needs: each one in @theme is used by a class or a rule,
  // and each palette colour by index.css or the maps.
  const theme = css.slice(css.indexOf('@theme inline {'), css.indexOf('\n}', css.indexOf('@theme inline {')));
  const palette = read('src/components/Map/palette.ts');
  // The other way round, for the maps, which read their colours by name: each name palette.ts
  // asks for is declared here, or that part of the map is drawn in an empty colour; and a reading
  // is kept only under the palette it was read in, or a theme switch with the map open keeps the
  // other palette's colours.
  const mapTokens = [...palette.matchAll(/: '(--c-map-[\w-]+)'/g)].map((m) => m[1]);
  if (mapTokens.length < 11) off.push(`palette.ts names ${mapTokens.length} map colours where its eleven roles were read`);
  for (const token of mapTokens) if (!new RegExp(`^\\s*${token}:`, 'm').test(css)) off.push(`palette.ts reads ${token}, which index.css does not declare`);
  if (!/if \(root\.classList\.contains\('dark'\) === isDark && colors\.stopFill\) readings\.set\(isDark, colors\);/.test(palette)) off.push('mapColors keeps a reading made under the other palette');
  // Tailwind copies some values into its own variables (shadows, a colour's strength after the
  // slash, ring widths), so a token is also used when a class names it.
  const NAMESPACE = /^--(color|opacity|text|leading|tracking|font-weight|font|spacing|container|grid-template-columns|aspect|radius|border-width|ring-width|ring-offset-width|outline-width|outline-offset|text-underline-offset|stroke-width|shadow|drop-shadow|blur|z-index|transition-duration|transition-delay|ease|animate)-(.+)$/;
  const utilities_ = [...candidates].map(utilityOf);
  for (const [, name] of theme.matchAll(/^\s*(--[\w-]+):/gm)) {
    if (/^--(breakpoint|default)-|^--\*$/.test(name) || /--line-height$/.test(name)) continue;
    const key = NAMESPACE.exec(name)?.[2];
    const named = key !== undefined && utilities_.some((u) => u.endsWith(`-${key}`) || u.endsWith(`/${key}`) || u.includes(`-${key}/`) || (name.startsWith('--container-') && u === `@min-${key}`));
    const used = built.includes(`var(${name})`) || built.includes(`var(${name},`) || named || [...candidates].some((c) => c.startsWith(`@min-${key}:`));
    if (!used) off.push(`token ${name} is used by nothing`);
  }
  // A palette colour is read by index.css or by the maps; the fleet red is held by the three
  // files that cannot read a var(), by the check on the three tones.
  for (const [, name, value] of css.slice(0, css.indexOf('@theme inline {')).matchAll(/^\s*(--c-[\w-]+):\s*([^;]+);/gm)) {
    const outside = ['index.html', 'vite.config.ts', 'public/favicon.svg'].some((file) => read(file).includes(value.trim()));
    if (!new RegExp(`var\\(${name}\\)`).test(css) && !palette.includes(`'${name}'`) && !(name === '--c-brand' && outside)) off.push(`token ${name} is used by nothing`);
  }

  assert(off.length === 0, `${off.length} values that are no token:\n    ${[...new Set(off)].join('\n    ')}`);
});

ok('every repeated pattern is drawn by its one component or class', () => {
  // The same round found 48 elements written out by hand in two to twenty places each, drifting
  // apart a margin or a weight at a time. Each row is a signature only a hand copy carries, the
  // file allowed to carry it (the one that draws the pattern), and what draws it now.
  // A row's code, when it has one, is matched against the file's JSX rather than its strings.
  const ROWS: { name: string; copy: RegExp; code?: RegExp; home: RegExp; use: string }[] = [
    {
      name: 'the small capitals over a block',
      copy: /^(?=.*\btext-label\b)(?=.*\bfont-bold\b)(?=.*\buppercase\b)(?=.*\btracking-caps\b)(?!.*\brounded-tag\b)/s,
      home: /ui[\\/]SectionLabel\.tsx$/,
      use: 'SectionLabel, or the .caps-label class inline',
    },
    {
      name: 'a labelled button',
      copy: /^(?=.*\brounded-control\b)(?=.*\bbg-accent\b)(?=.*\btext-on-accent\b)(?=.*\bfont-(?:semibold|bold)\b)(?=.*\bpx-(?:3|3\.5|4)\b)|^(?=.*\bh-tap\b)(?=.*\bborder-edge\b)(?=.*\btext-accent\b)(?=.*\bfont-semibold\b)/s,
      home: /index\.css$/,
      use: 'the .btn classes (btn-primary, btn-secondary, btn-outbound; btn-lg, btn-dense)',
    },
    {
      name: 'a text link',
      copy: /^(?=.*\btext-accent\b)(?=.*\bunderline\b)(?=.*\bfont-(?:semibold|bold)\b)/s,
      home: /index\.css$/,
      use: 'the .link class (or .link-text where a row is the target)',
    },
    {
      name: 'a card',
      copy: /^(?=.*\brounded-card\b)(?=.*\bshadow-raised\b)(?=.*\bbg-bg\b)/s,
      home: /index\.css$/,
      use: 'the .card class',
    },
    {
      name: 'a screen’s column',
      copy: /\bmax-w-(?:page|column)\b/,
      home: /index\.css$/,
      use: 'the .page or .page-column class, with .page-gutter or .map-gutter',
    },
    {
      name: 'a fold in a screen',
      copy: /^(?=.*\bdisclosure\b)(?=.*\b(?:bg-surface|border-t)\b)/s,
      home: /ui[\\/]controls\.tsx$/,
      use: 'Disclosure (frame="box" or "rule", count, chevronFirst)',
    },
    {
      name: 'the count a fold hides',
      copy: /^(?=.*\btnum\b)(?=.*\brounded-control\b)(?=.*\bborder-edge\b)(?=.*\bpx-1\.5\b)(?=.*\bpy-0\.5\b)/s,
      home: /ui[\\/]controls\.tsx$/,
      use: 'Disclosure’s count',
    },
    {
      name: 'a way out of a surface',
      copy: /^(?=.*\bh-tap w-tap shrink-0 items-center justify-center rounded-(?:control|pill)\b)(?!.*\bborder\b)/s,
      home: /ui[\\/]controls\.tsx$/,
      use: 'CloseButton',
    },
    {
      name: 'a choice chip',
      copy: /^(?=.*\b(?:min-)?h-tap\b)(?=.*\bwhitespace-nowrap\b)(?=.*\btext-label\b)(?=.*\bfont-semibold\b)(?=.*\brounded-(?:control|pill)\b)/s,
      home: /ui[\\/]controls\.tsx$/,
      use: 'ChoiceChip in a .chip-rail',
    },
    {
      // Not the mono time readouts nor the bg-bg line identifiers on a notice: those are other roles.
      name: 'a word tag',
      copy: /^(?=.*\brounded-tag\b)(?=.*\bpy-0\.5\b)(?=.*\btext-label\b)(?=.*\bfont-(?:semibold|bold|black)\b)(?!.*\b(?:font-mono|bg-bg)\b)/s,
      home: /index\.css$/,
      use: 'the .tag class, with the tone (and caps) as utilities',
    },
    {
      name: 'a pole’s code beside a stop’s name',
      copy: /^(?=.*\btnum\b)(?=.*\brounded-tag\b)(?=.*\bbg-surface\b)(?=.*\bpx-2\b)(?=.*\bpy-1\b)(?=.*\btext-ink-2\b)/s,
      home: /ui[\\/]PoleCode\.tsx$/,
      use: 'PoleCode (placement in a row as className)',
    },
    {
      name: 'the title of a section or a card',
      copy: /^(?=.*\bfont-bold\b)(?=.*\btext-ink(?![\w-]))(?=.*\buppercase\b)(?=.*\btracking-caps\b)(?=.*\bgap-2\b)/s,
      home: /ui[\\/]SectionTitle\.tsx$/,
      use: 'SectionTitle (small for a card, as="h3", tone, subtitle)',
    },
    {
      name: 'an empty state',
      copy: /\bborder-dashed border-edge\b|\bh-12 w-12 text-ink-3\b|\bw-12 h-12 text-ink-3\b/,
      home: /ui[\\/]EmptyState\.tsx$/,
      use: 'EmptyState (with an icon for an empty answer)',
    },
    {
      name: 'a notice box',
      // Not a control that turns warn when pressed (the board's bell): those carry the 44 px floor.
      copy: /^(?!.*\b(?:min-)?[hw]-tap\b)(?!.*\bmin-w-tap\b)(?=.*\brounded-control\b)(?=.*\bborder-warn\b)(?=.*\bbg-warn\b)(?=.*\btext-warn-ink\b)(?=.*\bp[xy]?-[\d.]+\b)/s,
      home: /ui[\\/]controls\.tsx$/,
      use: 'Notice (warn, icon, size="inline" or "alarm")',
    },
    {
      name: 'the tilde of a worked-out time',
      copy: /(?!)/,
      code: />~<\/span>|&& '~'\}/,
      home: /ui[\\/]Provenance\.tsx$/,
      use: 'Approx (inherit where a muted tilde loses contrast)',
    },
    {
      name: 'the way back to a list',
      copy: /(?!)/,
      code: /<ArrowLeft\b/,
      home: /ui[\\/]controls\.tsx$/,
      use: 'BackButton',
    },
    {
      name: 'the notices’ count',
      copy: /^(?=.*\btnum\b)(?=.*\brounded-control\b)(?=.*\bbg-warn\b)(?=.*\btext-warn-ink\b)/s,
      home: /ui[\\/]CountBadge\.tsx$/,
      use: 'CountBadge (overlay on the menu button)',
    },
    {
      name: 'a line’s tinted row',
      copy: /^(?=.*\btint\b)(?=.*\brounded-control\b)(?=.*\bborder\b)(?=.*\bflex\b)/s,
      home: /index\.css$/,
      use: 'the .line-row class with .tint (and lineTint for the colour)',
    },
    {
      name: 'a block under a hairline rule',
      copy: /\bborder-t border-line pt-3\b/,
      home: /index\.css$/,
      use: 'the .rule-above class',
    },
    {
      name: 'label-size prose',
      copy: /^(?=.*(?:^|\s|["'`])text-label(?:\s|["'`]|$))(?=.*\bleading-prose\b)/s,
      home: /index\.css$/,
      use: 'the text-note size (label size at the prose leading)',
    },
    {
      name: 'a screen’s big number',
      copy: /^(?=.*\btext-num\b)(?=.*\btracking-display\b)/s,
      home: /index\.css$/,
      use: 'the .figure class, or Figure with its unit',
    },
    {
      name: 'a walk’s distance',
      copy: /(?!)/,
      code: /~\{[^}]*[Mm]eters\} m|~\$\{[^}]*[Mm]eters[^}]*\} m/,
      home: /i18n/,
      use: 't.common.walkDistance',
    },
    {
      name: 'a name over its hint',
      copy: /^(?=.*\bbreak-words\b)(?=.*\btext-(?:body|emph)\b)(?=.*\bfont-semibold\b)(?=.*\b(?:block|flex-1)\b)(?!.*\$\{)/s,
      home: /ui[\\/]NameStack\.tsx$/,
      use: 'NameStack (size, floor, onTint)',
    },
    {
      name: 'a row that is one button',
      copy: /^(?=.*\bw-full\b)(?=.*\brounded-control\b)(?=.*\bbg-surface\b)(?=.*\btext-left\b)(?=.*\btext-label\b)/s,
      home: /index\.css$/,
      use: 'the .row-button class',
    },
    {
      name: 'a text field',
      copy: /^(?=.*\b(?:min-)?h-tap\b)(?=.*\brounded-control\b)(?=.*\bborder-edge\b)(?=.*\btext-body\b)(?=.*\b(?:px-3\.5|px-2|font-mono)\b)(?!.*\bbtn\b)/s,
      home: /index\.css$/,
      use: 'the .field class (.field-clock for a time input)',
    },
    {
      name: 'a time to ask about',
      copy: /(?!)/,
      code: /<input type="time"/,
      home: /ui[\\/]controls\.tsx$/,
      use: 'TimeField',
    },
    {
      name: 'a field’s error',
      copy: /(?!)/,
      code: /role="alert" className="[^"]*\btext-warn-ink\b/,
      home: /index\.css$/,
      use: 'the .field-error class',
    },
    {
      name: 'a control floating over the map',
      copy: /\bbackdrop-blur-glass\b/,
      home: /index\.css$/,
      use: 'the .map-glass class',
    },
    {
      name: 'the veil behind a drawer or a sheet',
      copy: /(?!)/,
      code: /<button[^>]*\bbg-scrim\b/,
      home: /ui[\\/]controls\.tsx$/,
      use: 'Scrim',
    },
    {
      name: 'a panel from the right over a scrim',
      copy: /\banim-slide-in\b/,
      home: /ui[\\/]Drawer\.tsx$/,
      use: 'Drawer',
    },
    {
      name: 'a dialog’s title',
      copy: /^(?=.*\buppercase\b)(?=.*\btracking-display\b)/s,
      home: /ui[\\/]DialogTitle\.tsx$/,
      use: 'DialogTitle',
    },
    {
      name: 'a quieter tile inside a card',
      copy: /^(?=.*\brounded-control\b)(?=.*\bborder\b)(?=.*\bbg-surface\b)(?=.*(?<![\w-])p-(?:2\.5|3)(?![\w.-]))/s,
      home: /index\.css$/,
      use: 'the .inset-panel class',
    },
    {
      name: 'a bordered square button that shows no word',
      copy: /^(?=.*\b(?:h-tap w-tap|h-bar-field w-bar-field)\b)(?=.*\brounded-control border\b)/s,
      home: /ui[\\/]controls\.tsx$/,
      use: 'IconButton',
    },
    {
      name: 'the frame around the mini map',
      copy: /(?!)/,
      code: /<div[^>]*\bborder-edge\b[^>]*>\s*<LazyNearbyMiniMap\b/,
      home: /Map[\\/]LazyNearbyMiniMap\.tsx$/,
      use: 'LazyNearbyMiniMap, which frames itself',
    },
    {
      name: 'a map’s space while it loads',
      copy: /^(?=.*\brounded-card\b)(?=.*\bbg-surface\b)(?=.*\banimate-waiting\b)/s,
      home: /index\.css$/,
      use: 'the .map-placeholder class',
    },
    {
      name: 'one side of a two-pane screen',
      copy: /^(?=.*\blg:col-span-(?:5|7)\b)(?=.*\blg:overflow-y-auto\b)/s,
      home: /ui[\\/]Pane\.tsx$/,
      use: 'Pane',
    },
    {
      name: 'that this app is not the operator’s',
      copy: /(?!)/,
      code: /t\.fares\.notAffiliated\b/,
      home: /ui[\\/]Provenance\.tsx$/,
      use: 'NotAffiliated',
    },
    {
      name: 'the dash a derived time is drawn in',
      copy: /\bborder-estimated-line\b/,
      home: /index\.css$/,
      use: 'the .edge-estimated class',
    },
    {
      name: 'a line’s number on its colour',
      copy: /^(?=.*\btext-on-line\b)(?=.*\btnum\b)/s,
      home: /ui[\\/]LineBadge\.tsx$/,
      use: 'LineBadge, or lineBadgeClass in an HTML string',
    },
    {
      name: 'a screen’s title',
      copy: /^(?=.*\btext-title\b)(?=.*\btracking-title\b)/s,
      home: /index\.css$/,
      use: 'the .screen-title class',
    },
    {
      name: 'the app’s name heading the navigation',
      copy: /^(?=.*\btext-emph\b)(?=.*\btracking-title\b)/s,
      home: /ui[\\/]Wordmark\.tsx$/,
      use: 'Wordmark',
    },
    {
      name: 'the mark of a ride being followed',
      copy: /(?!)/,
      code: /t\.companion\.onTrip\b/,
      home: /ui[\\/]OnTripMark\.tsx$/,
      use: 'OnTripMark',
    },
  ];
  // A pattern that lives in one screen is drawn by a function in that file, so its signature
  // appears there once.
  const LOCAL: { file: string; once: RegExp; use: string }[] = [
    { file: 'src/components/LinesView.tsx', once: /title=\{t\.lines\.enRouteHint\}/g, use: 'RunningBuses' },
    { file: 'src/components/AlertsView.tsx', once: /t\.fares\.readInFull\b/g, use: 'NoticeBody' },
    { file: 'src/components/Map/MapControls.tsx', once: /\boverflow-y-auto pr-1\b/g, use: 'the list constant' },
    { file: 'src/components/AlertsView.tsx', once: /\bmd:grid-cols-3\b/g, use: 'NOTICE_GRID' },
  ];
  const off: string[] = [];
  for (const { file, once, use } of LOCAL) {
    const n = (read(file).match(once) ?? []).length;
    if (n !== 1) off.push(`${file}: ${n} copies of what ${use} draws`);
  }
  const files = sourcesUnder('src/components').concat(join(root, 'src/App.tsx'));
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const strings = stringLiterals(text);
    for (const row of ROWS) {
      if (row.home.test(file)) continue;
      const copy = strings.find((s) => row.copy.test(s)) ?? (row.code ? row.code.exec(text)?.[0] : undefined);
      if (copy) off.push(`${relative(file)}: ${row.name} by hand (${copy.slice(0, 70)}) -- ${row.use}`);
    }
    // A tag is one box since 20 October 2026: its edge (in no colour, so forced colours draw
    // every tag alike), bold and 8 px sides are the class's; a caller adds the tone and capitals.
    for (const s of strings.map((q) => q.slice(1, -1))) if (/(?:^|\s)tag(?:\s|$)/.test(s) && /(?:^|\s)(?:border(?:-[\w-]+)?|px-[\w.-]+|font-(?:black|semibold|medium|normal))(?:\s|$)/.test(s)) off.push(`${relative(file)}: a tag with its own edge, sides or weight (${s.slice(0, 70)}) -- the .tag class carries them`);
  }
  assert(off.length === 0, `patterns written out again:\n    ${off.join('\n    ')}`);
});

console.log(`
${checks} policy checks passed
`);
