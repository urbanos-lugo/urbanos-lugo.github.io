import type { ReactNode } from 'react';

/**
 * A screen's one big number with its unit beside it, on a shared baseline: the planner's
 * minutes, the ride's stops to go. The number is the .figure class, which the board's
 * minutes use on their own with the colour of the bus's state.
 */
export function Figure({ value, unit }: { value: ReactNode; unit: ReactNode }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="figure">{value}</span>
      <span className="text-body text-ink-3">{unit}</span>
    </span>
  );
}
