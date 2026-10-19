/**
 * How many service notices there are, in the warn fill: after a navigation row's words, or as
 * the round badge on the corner of the top bar's menu button (`overlay`), which says it again
 * for the eye only and confirms itself once as it arrives. Nothing when there are none.
 */
export function CountBadge({ n, overlay = false }: { n: number; overlay?: boolean }) {
  if (n <= 0) return null;
  return overlay ? (
    <span className="anim-badge-in tnum absolute -right-1.5 -top-1.5 min-w-5 rounded-control bg-warn px-1 text-center text-label font-bold leading-count text-warn-ink" aria-hidden="true">
      {n}
    </span>
  ) : (
    <span className="tnum shrink-0 rounded-control bg-warn px-2 py-0.5 text-label font-bold text-warn-ink">{n}</span>
  );
}
