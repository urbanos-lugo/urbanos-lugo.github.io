import { useEffect, useRef } from 'react';

let layers = 0;

/**
 * Something laid over the screen that the back gesture closes before it leaves the screen
 * under it: a drawer, a dialog, a sheet, the search's rows. Opening it adds a step to the
 * history; back takes the step and closes it; closing it any other way takes the step back.
 * A move to another screen from inside it replaces the step instead (useTabRoute), so the way
 * back from there goes to the screen under it, not to the layer again.
 *
 * The step goes back on the next task, not in the cleanup itself: React's StrictMode closes
 * and reopens every effect once on mount, and a back already on its way would then take the
 * step the reopening had just put back.
 */
export function useBackLayer(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  const mark = useRef('');
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    if (leaving.current !== null) {
      clearTimeout(leaving.current);
      leaving.current = null;
    } else {
      mark.current = `layer-${++layers}`;
      window.history.pushState({ ...window.history.state, layer: mark.current }, '');
    }
    const own = mark.current;
    const onPop = () => {
      if (window.history.state?.layer !== own) closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (window.history.state?.layer !== own) return; // taken by back, or replaced by a move elsewhere
      leaving.current = setTimeout(() => {
        leaving.current = null;
        if (window.history.state?.layer === own) window.history.back();
      }, 0);
    };
  }, [open]);
}
