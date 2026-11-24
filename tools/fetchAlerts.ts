/**
 * Snapshots the operator's service notices into public/alerts.json: a file beside the page,
 * not an import, so a refresh moves 1.4 KB and not the entry chunk and everything that imports it.
 *
 *   npx tsx tools/fetchAlerts.ts
 *
 * The browser cannot fetch buslugo.com directly (CORS), and a static host has no server
 * to proxy it, so a scheduled job runs this and the app reads the snapshot, showing the
 * time it was taken rather than implying the notices are live.
 */
import { at, writeJson } from './lib';
import { REPO_URL } from '../src/project';
import { syncOfficialAlerts } from '../src/services/alertSyncService';
import { councilNews, readNotice } from '../src/utils/operatorNotices';

/**
 * What the copy now published has of the council's, while it is news: its site answers the machines this
 * runs on one time in ten (4 of 40 runs, 13 to 24 November 2026), and what one read lasted an hour.
 */
async function councilAlreadyRead() {
  try {
    const res = await fetch(`https://${REPO_URL.split('/').pop()}/alerts.json`, { signal: AbortSignal.timeout(4_000) });
    const { alerts } = (await res.json()) as { alerts: unknown[] };
    return councilNews(alerts.map(readNotice).filter((alert) => alert !== null), Date.now());
  } catch {
    return [];
  }
}

async function main() {
  const result = await syncOfficialAlerts(true);

  // The sync never throws: an unreachable site comes back as a result like any other.
  // Writing it would replace genuine notices with an empty list, so keep the last one.
  if (result.status === 'unreachable') {
    console.error('buslugo.com could not be read; keeping the previous snapshot.');
    process.exitCode = 1;
    return;
  }

  const read = new Set(result.alerts.map((alert) => alert.link));
  const kept = (await councilAlreadyRead()).filter((alert) => !read.has(alert.link)).map((alert, i) => ({ ...alert, id: `concello-kept-${i + 1}` }));
  writeJson(at('public/alerts.json'), { ...result, alerts: [...result.alerts, ...kept], fetchedAt: new Date().toISOString() });
  console.log(`${result.alerts.length} notice(s) from ${result.sourceUrl}, ${kept.length} of the council's kept`);
  console.log(`status: ${result.status}`);
}

main();
