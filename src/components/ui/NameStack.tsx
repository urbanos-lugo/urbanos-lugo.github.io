import type { ReactNode } from 'react';

/**
 * A stop's, a line's or a place's name, whole on as many lines as it takes (it is what the
 * reader matches against the pole), with the line under it that says which or where. In a row
 * it takes the space left; with `floor` it keeps 6rem and what stands beside it wraps under
 * instead. On a line's tinted row the hint is a step darker, so it keeps its contrast.
 */
export function NameStack({
  name,
  hint,
  size = 'body',
  floor = false,
  onTint = false,
  title,
}: {
  name: ReactNode;
  hint?: ReactNode;
  size?: 'body' | 'emph';
  floor?: boolean;
  onTint?: boolean;
  title?: string;
}) {
  return (
    <span className={`${floor ? 'min-w-floor-name' : 'min-w-0'} flex-1`} title={title}>
      <span className={`block break-words font-semibold ${size === 'emph' ? 'text-emph' : 'text-body'}`}>{name}</span>
      {hint != null && hint !== false && <span className={`block text-label ${onTint ? 'text-ink-2' : 'text-ink-3'}`}>{hint}</span>}
    </span>
  );
}
