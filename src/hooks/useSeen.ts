import { useEffect, useState, type RefObject } from 'react';

/**
 * Whether something has come on screen, or near it: what a map waits for to be built. Below lg
 * a screen's other half stays mounted behind `hidden`, and a map built there draws, and asks for
 * its tiles, for nobody. An element with no box never intersects, which is the question.
 */
export function useSeen(holder: RefObject<HTMLElement | null>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = holder.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setSeen(true);
    // A little ahead of the fold, so scrolling down finds the map already there.
    const observer = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '200px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [seen, holder]);
  return seen;
}
