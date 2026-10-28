import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * The small capitals over a block, with the accent icon when the block has one: an h3 where
 * it heads a part of the page's outline, quiet (ink-3) in the map's own panels and beside a
 * secondary line. The space under it is the caller's. Inline, in a sentence or in a map popup's
 * string, the same letters are the .caps-label class.
 */
export function SectionLabel({
  icon: Icon,
  children,
  as: As = 'span',
  quiet = false,
  className = '',
}: {
  icon?: LucideIcon;
  children: ReactNode;
  as?: 'span' | 'h3';
  quiet?: boolean;
  className?: string;
}) {
  return (
    <As className={`caps-label flex items-center gap-1.5 ${quiet ? 'text-ink-3' : 'text-ink-2'} ${className}`}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />}
      {children}
    </As>
  );
}
