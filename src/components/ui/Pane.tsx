import type { ReactNode } from 'react';

/**
 * One side of a two-pane screen: below lg the panes take turns, the one not shown hidden;
 * from lg up both stand side by side, five columns and seven, and each scrolls on its own. So
 * each is positioned: otherwise the absolute boxes inside (screen-reader text, timeline dots)
 * take <main> as containing block, escape the pane's clip, and <main> scrolls a second time
 * into an empty page. The detail comes in from the right when it takes the list's place, like
 * every push on a phone; the way back is not animated, and from lg up nothing takes turns.
 */
export function Pane({ side, shown, className = '', children }: { side: 'list' | 'detail'; shown: boolean; className?: string; children: ReactNode }) {
  return <div className={`lg:relative lg:block lg:h-full lg:overflow-y-auto ${side === 'list' ? 'lg:col-span-5' : 'anim-push-in lg:col-span-7 lg:animate-none'} ${shown ? '' : 'hidden'} ${className}`}>{children}</div>;
}
