import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * What a screen shows where a list or an answer would be: a dashed card. With an icon it is an
 * empty answer, centred under the icon's light stroke; without one it is an invitation that
 * carries its own actions, read from the start of the line. The words are the caller's.
 */
export function EmptyState({ icon: Icon, className = '', children }: { icon?: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-card border border-dashed border-edge px-cap-5 ${Icon ? 'py-10 text-center' : 'py-5'} ${className}`}>
      {Icon && <Icon className="mx-auto mb-3 h-7 w-7 text-ink-3 stroke-light" aria-hidden="true" />}
      {children}
    </div>
  );
}
