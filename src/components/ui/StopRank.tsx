/**
 * A stop's number by distance on its row, the same disc as on the small map beside the list
 * (.stop-rank), so the eye goes from a dot to its row without reading a name. Hidden from
 * assistive technology, as the map's discs are: the list's own order says the same.
 */
export function StopRank({ n }: { n: number }) {
  return (
    <span className="stop-rank stop-rank-row" aria-hidden="true">
      {n}
    </span>
  );
}
