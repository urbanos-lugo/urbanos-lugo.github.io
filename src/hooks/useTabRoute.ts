import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { PATHS, parsePath, pathFor, type PathLang, type Tab } from '../routes';

/**
 * The screen on show, in the history, so the back gesture moves between screens instead of
 * leaving the site. The tab is in the address bar, with the language, a path per tab and
 * nothing more: the stop and line being viewed keep `?parada=` and `?linea=`, which is what
 * the QR stickers and shared links carry. What is open on the tab -- a stop's board, a line,
 * a planned trip -- is in the entry's state, so back steps out of it before it leaves the tab.
 * The language is in the address too, as a first segment for Spanish and English, so a
 * copied link and a search result open in the language they were found in.
 */
export interface Screen {
  tab: Tab;
  /** The stop whose board is open on the stops tab. */
  stop?: string;
  /** That board was opened off the pole's sticker, the one place the operator's own minutes show. */
  qr?: boolean;
  /** The line whose page is open on the lines tab. */
  line?: string;
  /** The planner's answer is up, to this question; below `lg` it is folded over the form. */
  trip?: { from: string; to: string; mode: 'now' | 'depart' | 'arrive'; at: string };
  /** The ride is following this trip: the planner's entries under it are not stops on the way back. */
  ride?: boolean;
  /** Put over the list or the form it was opened from, so the app's own back is the history's. */
  over?: boolean;
}

/** A project page lives under `/<repo>/`, so the language and tab are the segments after that prefix. */
const BASE = import.meta.env.BASE_URL || '/';

const afterBase = (): string => {
  const path = window.location.pathname;
  return path.startsWith(BASE) ? path.slice(BASE.length) : path.replace(/^\//, '');
};

const tabFromLocation = (): Tab | null => parsePath(afterBase()).tab;

/** The language the address names, or null at a bare address, which is Galician's. */
export const langFromLocation = (): PathLang | null => parsePath(afterBase()).lang;

/** The search string is carried across so `?parada=` survives moving between tabs; the trailing slash is the address the build writes. */
const urlForTab = (tab: Tab, lang: PathLang): string => `${BASE}${pathFor(lang, PATHS[tab])}${window.location.search}`;

/**
 * Whether the list and what it opens stand side by side, from `lg` (--breakpoint-lg in
 * index.css) up. Below it they take turns, and opening one is a step back can undo; side by
 * side a step would be a back press that changes nothing on screen.
 */
export const sideBySide = (): boolean => window.matchMedia('(width >= 64rem)').matches;

const isScreen = (state: unknown): state is Screen => !!state && typeof (state as Screen).tab === 'string' && Object.hasOwn(PATHS, (state as Screen).tab);

/** A tab as a link a crawler can follow; a plain left click stays in the app, a modifier click is the browser's own. */
export function tabLink(tab: Tab, go: (tab: Tab) => void, lang: PathLang) {
  return {
    href: urlForTab(tab, lang),
    onClick(event: MouseEvent<HTMLAnchorElement>) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      go(tab);
    },
  };
}

/** The same screen: what is open on the same tab, whatever else the entry holds (its scroll, a layer over it). */
const sameScreen = (a: Screen, b: Screen): boolean =>
  a.tab === b.tab && a.stop === b.stop && !!a.qr === !!b.qr && a.line === b.line && !!a.ride === !!b.ride && JSON.stringify(a.trip) === JSON.stringify(b.trip);

/**
 * The screen, how it was last reached (`popped` when by back or forward), and the way to
 * another. `scroller` is the box the screens scroll in, whose scroll is each entry's too.
 */
export function useTabRoute(initial: Tab, lang: PathLang, scroller: RefObject<HTMLElement | null>): [Screen, (next: Screen, replace?: boolean) => void, boolean] {
  const [{ screen, popped }, setRoute] = useState<{ screen: Screen; popped: boolean }>(() => ({ screen: { tab: tabFromLocation() ?? initial }, popped: false }));

  // The scroll, kept in the entry a moment after it stops, so back brings it back. One write
  // per pause: Safari refuses more than a hundred replaceState calls in ten seconds.
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keep = () => {
      clearTimeout(timer);
      timer = setTimeout(() => window.history.replaceState({ ...window.history.state, scroll: box.scrollTop }, ''), 200);
    };
    box.addEventListener('scroll', keep, { passive: true });
    return () => {
      box.removeEventListener('scroll', keep);
      clearTimeout(timer);
    };
  }, [scroller]);

  // A screen opens at its top, and one come back to by back or forward where it was left. Not
  // a layer closing over the same screen: the scroll kept meanwhile went to the layer's entry.
  // Before, the box kept whatever it had: a line opened from far down the list opened 1,618 px
  // down its own page, with its back link off the top of the screen.
  const shown = useRef(screen);
  useLayoutEffect(() => {
    if (sameScreen(shown.current, screen)) return;
    shown.current = screen;
    if (scroller.current) scroller.current.scrollTop = popped ? Number(window.history.state?.scroll ?? 0) : 0;
  }, [screen, popped]);

  // The opening tab and a change of language replace the address rather than add a history
  // entry, so the first back press still leaves the site; a back press onto an address in
  // the language the reader has since left, or a tab's word from another language, is
  // brought in line the same way. What else the entry holds stays: the language is chosen in
  // the menu, whose step is the entry.
  useEffect(() => {
    if (window.location.pathname !== `${BASE}${pathFor(lang, PATHS[screen.tab])}`) window.history.replaceState({ ...window.history.state, tab: screen.tab }, '', urlForTab(screen.tab, lang));
  }, [screen.tab, lang]);

  useEffect(() => {
    const onPop = () => setRoute({ screen: isScreen(window.history.state) ? window.history.state : { tab: tabFromLocation() ?? initial }, popped: true });
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [initial]);

  // Pushed outside the state updater, which React may run twice. Gone to from a drawer, a
  // dialog or the search's rows, the screen takes their step (useBackLayer): back from it goes
  // to the screen under them, not to them again.
  const go = useCallback(
    (next: Screen, replace = false) => {
      const layer = !!window.history.state?.layer;
      // The scroll of the screen being left, now, not when the pause after the last scroll ends.
      if (!replace && !layer && scroller.current) window.history.replaceState({ ...window.history.state, scroll: scroller.current.scrollTop }, '');
      window.history[replace || layer ? 'replaceState' : 'pushState'](next, '', urlForTab(next.tab, lang));
      setRoute({ screen: next, popped: false });
    },
    [lang, scroller],
  );

  return [screen, go, popped];
}
