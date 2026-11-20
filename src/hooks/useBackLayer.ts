import { useEffect, useRef } from 'react';

let layers = 0;
/** The layers closed this moment whose step has not been taken back yet. */
const closing = new Set<string>();

/**
 * Something laid over the screen that the back gesture closes before it leaves the screen
 * under it: a drawer, a dialog, a sheet, the search's rows. Opening it adds a step to the
 * history; back takes the step and closes it; closing it any other way takes the step back.
 * A move to another screen from inside it replaces the step instead (useTabRoute), so the way
 * back from there goes to the screen under it, not to the layer again; and so does a layer
 * opened in its place as it closes: a place picked in the search on the map opens its sheet
 * as the search's rows close, and back from the sheet landed on the rows' step, closed.
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
      closing.delete(mark.current);
    } else {
      mark.current = `layer-${++layers}`;
      const state = window.history.state;
      const instead = typeof state?.layer === 'string' && closing.has(state.layer);
      window.history[instead ? 'replaceState' : 'pushState']({ ...state, layer: mark.current }, '');
    }
    const own = mark.current;
    const onPop = () => {
      if (window.history.state?.layer !== own) closeRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (window.history.state?.layer !== own) return; // taken by back, or replaced by a move elsewhere
      closing.add(own);
      leaving.current = setTimeout(() => {
        leaving.current = null;
        closing.delete(own);
        if (window.history.state?.layer === own) window.history.back();
      }, 0);
    };
  }, [open]);
}
