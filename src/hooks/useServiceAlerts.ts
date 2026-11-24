import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AlertSyncResult } from '../services/alertSyncService';
import type { ServiceAlert } from '../types';
import { isSnapshotStale } from '../utils/snapshotAge';
import { readNotice } from '../utils/operatorNotices';
import { noticeOver, outlivedForecast } from '../utils/noticeChanges';
import { apiUrl } from '../services/apiUrl';
import { isCrawler } from '../routes';

/**
 * The operator's notices, fetched once for the whole app, so the navigation badge and the
 * Avisos screen cannot disagree (they did: a build-time file against a live request).
 */

const COOLDOWN_SECONDS = 30;
/** How long an unanswered first request keeps the screen empty before the snapshot shows. */
export const SNAPSHOT_AFTER_MS = 2000;
/**
 * How old the last question may be while the page is on screen: the half hour the server holds
 * an answer. An installed app is woken rather than loaded, and asked once, it took Monday's
 * notices for Wednesday's: closed stops since reopened, and none of the new ones.
 */
export const ASK_AGAIN_MS = 30 * 60_000;
/** After a question that failed, sooner: a phone is woken before its network is. */
const RETRY_MS = 2 * 60_000;

/** What public/alerts.json holds: the sync result plus the time the job took it. */
type Snapshot = AlertSyncResult & { fetchedAt?: string };

/**
 * An answer about notices, the snapshot's or the server's, narrowed at the one boundary
 * rather than cast: parsed JSON says nothing about its shape, and each notice goes through
 * readNotice. Only the snapshot was read this way; the live answer went to the screen as sent.
 */
export function readSnapshot(raw: unknown): Snapshot {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    lastSyncTime: text(r.lastSyncTime),
    sourceUrl: text(r.sourceUrl),
    message: text(r.message),
    fetchedAt: typeof r.fetchedAt === 'string' ? r.fetchedAt : undefined,
    // An answer that does not say what it found is not one that found nothing.
    status: r.status === 'active_incidents' || r.status === 'operational_normal' ? r.status : 'unreachable',
    alerts: Array.isArray(r.alerts) ? r.alerts.map(readNotice).filter((a): a is ServiceAlert => a !== null) : [],
  };
}

/**
 * The snapshot is a file beside the page, not an import: imported, the scheduled job that
 * rewrites it renamed the entry chunk and five more, half a megabyte gzipped, under pages
 * that were open. As a file it is one 1.4 KB request, precached so it answers offline.
 * Read once per question to the server and remembered until the next, including its failure:
 * unreadable reads as `unreachable`, which is the honest status when nothing could be read.
 */
let snapshot: Promise<Snapshot> | null = null;
function loadSnapshot(): Promise<Snapshot> {
  snapshot ??= fetch(`${import.meta.env.BASE_URL}alerts.json`)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
    .then(readSnapshot)
    .catch(() => readSnapshot({ status: 'unreachable' }));
  return snapshot;
}

interface Shown {
  data: AlertSyncResult | null;
  /** When what is shown was read, if the server was not the one to say it now. */
  snapshotAt: string | null;
}

/**
 * What to show when the server does not answer: the saved copy, or what is on screen already if
 * that is newer, and either way with its own date. The copy a phone holds can be days older
 * than the answer it got this morning.
 */
export function datedNotices(shown: Shown, saved: Snapshot): Shown {
  const at = shown.snapshotAt ?? shown.data?.lastSyncTime ?? '';
  const newer = Date.parse(at) >= (Date.parse(saved.fetchedAt ?? '') || 0);
  return newer ? { data: shown.data, snapshotAt: at } : { data: saved, snapshotAt: saved.fetchedAt ?? null };
}

export interface ServiceAlerts extends Shown {
  /** Too old to speak for now, whoever read it: the server's own answer on a phone woken the next day, too. */
  stale: boolean;
  isSyncing: boolean;
  /** The question under way, or the last one, is the reader's: announced, where the app's own are not. */
  asked: boolean;
  cooldown: number;
  /** What the badge shows: the operator's own notices, and nothing that is stale. */
  announcedIncidents: number;
  refresh: (force?: boolean) => void;
}

export function useServiceAlerts(now: Date): ServiceAlerts {
  const [{ data, snapshotAt }, setShown] = useState<Shown>({ data: null, snapshotAt: null });
  const [isSyncing, setIsSyncing] = useState(false);
  const [asked, setAsked] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  /** When the server was last asked: never, for a crawler and for a build with none, which are not asked for again. */
  const askedAt = useRef(Infinity);

  const refresh = useCallback(
    async (force = false) => {
      if (isSyncing || (force && cooldown > 0)) return;
      setIsSyncing(true);
      setAsked(force);
      askedAt.current = Date.now();
      snapshot = null;
      let unread = false;
      try {
        // Thirty seconds is past the server's honest worst case (6 s for buslugo plus 4 s
        // for the feed). Optional call: AbortSignal.timeout is Safari 16 and the app still
        // works on 15.4, where undefined means what the line meant before it existed.
        const res = await fetch(apiUrl(`alerts${force ? '?refresh=true' : ''}`), { signal: AbortSignal.timeout?.(30_000) });
        if (res.status === 404) askedAt.current = Infinity;
        if (!res.ok) throw new Error(String(res.status));
        const answer = readSnapshot(await res.json());
        unread = answer.status === 'unreachable';
        if (unread) throw new Error(answer.status);
        setShown({ data: answer, snapshotAt: null });
      } catch {
        if (askedAt.current !== Infinity) askedAt.current = Date.now() - ASK_AGAIN_MS + RETRY_MS;
        // No server (static hosting), or it or the operator is down: what is newest, dated, never
        // passed off as live; and where the server says the operator could not be read, so does the screen.
        const saved = await loadSnapshot();
        setShown((shown) => {
          const { data, snapshotAt } = datedNotices(shown, saved);
          return { data: data && unread ? { ...data, status: 'unreachable' } : data, snapshotAt };
        });
      } finally {
        if (force) setCooldown(COOLDOWN_SECONDS);
        setIsSyncing(false);
      }
    },
    [cooldown, isSyncing],
  );

  // A server that neither answers nor fails left an empty list, which reads as "no incidents".
  useEffect(() => {
    const showSaved = async () => {
      const saved = await loadSnapshot();
      // The live answer may have landed while the file was being read.
      setShown((shown) => (shown.data ? shown : datedNotices(shown, saved)));
    };
    // A crawler gets the saved notices beside the page: asking the API, every page it rendered,
    // at any hour, woke the server for no reader. What it indexes is the same.
    if (isCrawler(navigator.userAgent)) {
      void showSaved();
      return;
    }
    const patience = setTimeout(showSaved, SNAPSHOT_AFTER_MS);
    refresh(false).finally(() => clearTimeout(patience));
    return () => clearTimeout(patience);
  }, []);

  // On the app's own clock, which is read again the moment the page is shown: nothing is asked
  // from a background tab or a locked phone.
  useEffect(() => {
    if (document.visibilityState === 'visible' && now.getTime() - askedAt.current >= ASK_AGAIN_MS) refresh(false);
  }, [now]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => (prev <= 1 ? 0 : prev - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // A notice whose own days are all behind is over, however long the operator's page keeps
  // it: out of the badge, the boards, the lines, Route and Avisos alike, so the morning after
  // San Froilán the app is what it was before it.
  const current = useMemo(() => data && { ...data, alerts: data.alerts.filter((a) => !noticeOver(a, now)) }, [data, now]);

  const stale = isSnapshotStale(snapshotAt ?? data?.lastSyncTime, now);
  // Only the operator's own notices count; a council press release is not "something is wrong with your journey".
  const announcedIncidents = current && !stale ? current.alerts.filter((a) => a.source !== 'concello' && !outlivedForecast(a, now)).length : 0;

  return { data: current, snapshotAt, stale, isSyncing, asked, cooldown, announcedIncidents, refresh };
}
