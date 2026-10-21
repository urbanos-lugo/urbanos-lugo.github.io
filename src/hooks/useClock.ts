import { useEffect, useRef, useState } from 'react';

/**
 * The wall clock, re-read every `everyMs`. Minutes on a board drift against it and buses
 * move along their timetable; nothing is fetched, so there is no "last updated".
 *
 * `null` stops it: the map stays mounted behind `hidden` once opened, and its three-second
 * clock went on recomputing every scheduled bus for the length of a ride, screen held awake.
 * Started again, it reads the time at once rather than showing a stale one for a tick.
 *
 * And at once when the page is shown again: a phone woken after a while showed the minutes of
 * when it was locked until the next beat, up to a whole interval, and on an iPhone the
 * interval's own clock stops while it sleeps.
 */
export const onShown = (read: () => void) => {
  const shown = () => document.visibilityState === 'visible' && read();
  document.addEventListener('visibilitychange', shown);
  return () => document.removeEventListener('visibilitychange', shown);
};

export function useClock(everyMs: number | null): Date {
  const [now, setNow] = useState(() => new Date());
  const paused = useRef(false);
  useEffect(() => {
    if (everyMs === null) {
      paused.current = true;
      return;
    }
    if (paused.current) {
      paused.current = false;
      setNow(new Date());
    }
    const timer = setInterval(() => setNow(new Date()), everyMs);
    const unshown = onShown(() => setNow(new Date()));
    return () => {
      clearInterval(timer);
      unshown();
    };
  }, [everyMs]);
  return now;
}
