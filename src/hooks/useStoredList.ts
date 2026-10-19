import { useCallback, useState } from 'react';
import { readJson, writeJson, type StorageKey } from '../utils/storage';

/**
 * A short list remembered on the device, most recent first — the stops you opened, the
 * trips you planned. Ids and typed text only; no timestamps and no counts, because the
 * list is here to save typing, not to build a record. PRIVACY.md lists each key.
 */
export function useRecent<T>(
  key: StorageKey,
  limit: number,
  valid: (x: unknown) => x is T,
  same: (a: T, b: T) => boolean,
): [T[], (item: T) => void, () => void] {
  const [items, setItems] = useState<T[]>(() => {
    const stored = readJson<unknown>(key, []);
    return Array.isArray(stored) ? stored.filter(valid).slice(0, limit) : [];
  });

  const remember = useCallback(
    (item: T) =>
      setItems((prev) => {
        const next = remembered(prev, readJson<unknown>(key, null), item, valid, same, limit);
        writeJson(key, next);
        return next;
      }),
    [key, limit, valid, same],
  );

  const clear = useCallback(() => {
    setItems([]);
    writeJson(key, null);
  }, [key]);

  return [items, remember, clear];
}

/**
 * Starred ids, filtered against the ids that currently exist: a rebuilt dataset changes
 * stop ids, and stale ones kept inflating the badge over a drawer showing fewer.
 */
export function useFavourites(key: StorageKey, known: Set<string>): [string[], (id: string) => void] {
  const [ids, setIds] = useState<string[]>(() => {
    const stored = readJson<unknown>(key, []);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && known.has(id)) : [];
  });

  const toggle = useCallback(
    (id: string) =>
      setIds((prev) => {
        const next = toggled(prev, readJson<unknown>(key, null), id, known);
        writeJson(key, next);
        return next;
      }),
    [key, known],
  );

  return [ids, toggle];
}

/**
 * Each open copy of the app -- the installed one and a tab, two tabs -- keeps its own list,
 * and wrote it whole: a stop starred in one was lost when the other starred another. So a
 * change is made to what is stored now, and the list this copy shows only decides which way
 * a star goes, because that is what the reader pressed.
 */
export function toggled(shown: string[], stored: unknown, id: string, known: Set<string>): string[] {
  const base = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string' && known.has(x)) : shown;
  if (shown.includes(id)) return base.filter((x) => x !== id);
  return base.includes(id) ? base : [...base, id];
}

/** The same for a recent list: the new item first, on top of what is stored now. */
export function remembered<T>(shown: T[], stored: unknown, item: T, valid: (x: unknown) => x is T, same: (a: T, b: T) => boolean, limit: number): T[] {
  const base = Array.isArray(stored) ? stored.filter(valid) : shown;
  return [item, ...base.filter((x) => !same(x, item))].slice(0, limit);
}

const isString = (x: unknown): x is string => typeof x === 'string';
const sameString = (a: string, b: string) => a === b;
const sameRoute = (a: RecentRoute, b: RecentRoute) => a.from === b.from && a.to === b.to;

/** The last six stops opened: enough for a commute and its variations. */
export const useRecentStops = () => useRecent<string>('urbanos-lugo-recent-stops', 6, isString, sameString);

export interface RecentRoute {
  from: string;
  to: string;
}

const isRoute = (x: unknown): x is RecentRoute =>
  typeof x === 'object' && x !== null && isString((x as RecentRoute).from) && isString((x as RecentRoute).to);

/** The last four trips planned, as typed. Four fills the form's width on a phone; PRIVACY.md says four. */
export const RECENT_ROUTES = 4;
export const useRecentRoutes = () => useRecent<RecentRoute>('urbanos-lugo-recent-routes', RECENT_ROUTES, isRoute, sameRoute);
