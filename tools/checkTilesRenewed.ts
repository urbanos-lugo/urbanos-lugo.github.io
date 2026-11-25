/**
 * The map's streets renew themselves once a month (deploy-pages.yml), and a renewal that fails
 * keeps the last ones: a moved archive, an unfit set or a lost cache would leave the map ageing
 * and nothing would say so. So every Monday the weekly job asks the published site which run its
 * tiles are from. One request, to this project's own site; a site that does not answer says nothing.
 *
 *   pnpm exec tsx tools/checkTilesRenewed.ts
 */
import { pathToFileURL } from 'node:url';
import { REPO_URL } from '../src/project';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A month between renewals, the age a planet has when it is cut, and a missed week. */
const MAX_DAYS = 50;

/** What to do about tiles cut from a run («20261122_124456_pt») this old, or null when nothing is due. */
export function tilesRenewalDue(version: string, now: Date): string | null {
  const day = /^(\d{4})(\d{2})(\d{2})_/.exec(version);
  if (!day) return `The published map says its tiles are from «${version}», which names no day.`;
  const days = Math.floor((now.getTime() - Date.parse(`${day[1]}-${day[2]}-${day[3]}T00:00:00Z`)) / DAY_MS);
  if (days <= MAX_DAYS) return null;
  return (
    `The published map's tiles are ${days} days old (${version}): the monthly renewal is not getting through. ` +
    `Run it by hand (Actions, Deploy to GitHub Pages, Run workflow, with the renewal ticked) and read what its step ` +
    `says; or run pnpm run data:tiles here and commit what it writes.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  // An organisation's own site: the repository's name is its address (README, «Despregue»).
  const url = `https://${REPO_URL.split('/').pop()}/map/version.json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res?.ok) console.warn(`${url} answered ${res?.status ?? 'nothing'}. Nothing checked, nothing claimed.`);
  else {
    const { version } = (await res.json()) as { version: string };
    const due = tilesRenewalDue(version, new Date());
    console.log(due ?? `The published map's tiles are from ${version}; nothing due yet.`);
    if (due) process.exit(1);
  }
}
