/**
 * Has the shape of a route changed since the dataset was built?
 *
 *   pnpm exec tsx tools/checkOsmGeometry.ts
 *
 * The route geometry is a committed polyline per direction, lifted from OpenStreetMap
 * once, and nothing else in the pipeline would notice it going stale. So the weekly run
 * asks Overpass the same question `data:osm` asked, stitches the relations the same way
 * and compares each route's length against the committed one. It changes nothing: a
 * disagreement means `pnpm data:osm` and `pnpm data:build` should be re-run and the diff
 * looked at by a person.
 *
 * It also watches `restrictedMeters`, the metres of each route on ways closed to motor
 * vehicles with no bus exception: the notice about the historic-centre terminus rests on
 * that number, and if a mapper adds the missing `bus=yes` the notice has to be rewritten.
 */
import { at, readJson } from './lib';
import { BBOX, ROUTE_QUERY, fetchWayTags, overpass, pathMeters, restrictedMeters, stitch } from './osm';

/**
 * How much a route may move before somebody is told. The same relation, unedited,
 * stitches to the identical polyline, so anything at all is a real edit; the tolerance
 * only keeps a kerb line nudged by a few metres from crying wolf every week. Half a
 * percent of the shortest route is about fifteen metres; a new roundabout is worth more.
 */
const TOLERANCE = 0.005;

interface Committed {
  ref: string;
  name: string;
  restrictedMeters: number;
  path: [number, number][];
}

/** Ref and name together: a line's two directions share a ref. */
const key = (r: { ref: string; name: string }) => `${r.ref}\0${r.name}`;

function section(title: string, lines: string[]) {
  if (!lines.length) return;
  console.log(title);
  lines.forEach((l) => console.log(l));
  console.log('');
}

async function main() {
  const committed = readJson<Committed[]>(at('data', 'osm-routes.json'));

  console.log(`Asking Overpass for the mapped bus routes in ${BBOX}...`);
  const json = await overpass(ROUTE_QUERY);
  if (!json) {
    // Overpass being down is not the dataset being wrong; failing the weekly run for it
    // would teach everybody to ignore the weekly run.
    console.warn('Overpass would not answer. Nothing checked, nothing claimed.');
    return;
  }

  // A second request, for the access tags the historic-centre notice rests on.
  const wayTags = await fetchWayTags();
  if (!wayTags.size) console.warn('No way tags came back; the access survey is not checked this run.\n');

  const fresh = new Map<string, { ref: string; name: string; meters: number; restricted: number }>();
  for (const relation of json.elements ?? []) {
    const ref = relation.tags?.ref ?? '';
    const name = relation.tags?.name ?? '';
    if (!ref) continue;
    const members = relation.members || [];
    const path = stitch(members);
    if (path.length <= 10) continue;
    fresh.set(key({ ref, name }), {
      ref,
      name,
      meters: pathMeters(path),
      restricted: wayTags.size ? restrictedMeters(members, wayTags) : -1,
    });
  }

  console.log(`${committed.length} routes on disk, ${fresh.size} mapped today\n`);

  const moved: string[] = [];
  const vanished: string[] = [];
  // Ten metres of tolerance: a way being split or redrawn shifts the total slightly
  // without changing whether the bus may be there.
  const access: string[] = [];

  for (const route of committed) {
    const now = fresh.get(key(route));
    if (!now) {
      vanished.push(`  ${route.ref}  ${route.name}`);
      continue;
    }
    // Measured from the committed polyline, not read from a stored number, so both
    // lengths are computed exactly the same way.
    const before = pathMeters(route.path);
    const change = now.meters - before;
    const fraction = Math.abs(change) / before;
    if (fraction > TOLERANCE) {
      moved.push(
        `  ${route.ref.padEnd(22)} ${(before / 1000).toFixed(2)} km -> ` +
          `${(now.meters / 1000).toFixed(2)} km  ${change >= 0 ? '+' : ''}${change.toFixed(0)} m ` +
          `(${(fraction * 100).toFixed(2)}%)  ${route.name}`,
      );
    }
    if (now.restricted >= 0 && Math.abs(now.restricted - route.restrictedMeters) > 10) {
      access.push(`  ${route.ref.padEnd(22)} ${route.restrictedMeters} m -> ${now.restricted} m  ${route.name}`);
    }
  }

  const known = new Set(committed.map(key));
  const added = [...fresh.values()].filter((r) => !known.has(key(r)));

  section(`${moved.length} route(s) changed shape by more than ${(TOLERANCE * 100).toFixed(1)}%:`, moved);
  section(`${vanished.length} route(s) on disk are no longer mapped under that name:`, vanished);
  section(
    `${added.length} mapped route(s) are not in the dataset:`,
    added.map((r) => `  ${r.ref.padEnd(22)} ${r.name}`),
  );
  if (access.length) {
    section(`${access.length} route(s) changed on ways closed to buses:`, [
      ...access,
      '  The notice about the historic-centre terminus rests on these metres.',
    ]);
  } else if (wayTags.size) {
    const carrying = committed.filter((r) => r.restrictedMeters > 0);
    console.log(
      `Access survey unchanged: ${carrying.length} route(s) still run on ways closed to buses ` +
        `(${carrying.map((r) => `${r.ref} ${r.restrictedMeters} m`).join(', ') || 'none'}).`,
    );
  }

  if (moved.length || vanished.length || added.length || access.length) {
    console.log('\nRe-run `pnpm data:osm` and `pnpm data:build`, then look at the diff. The street under the line is the map\'s: renew its tiles too (Actions, Deploy to GitHub Pages, Run workflow), once the week\'s planet has the change.');
    process.exitCode = 1;
  } else {
    console.log('\nEvery route is the same shape it was. Nothing to do.');
  }
}

main();
