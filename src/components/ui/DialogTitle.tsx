import type { LucideIcon } from 'lucide-react';

/**
 * A dialog's title: a square tile with its icon, the uppercase title and a line under it.
 * `warn` is the saved star's tile, filled. The favourites drawer's is `compact`, a size down,
 * and its tile goes where the heading has less than 14rem rather than the heading breaking as
 * "FAVORI-TOS"; the QR reader's wraps the words under the tile instead. Where the close button
 * sits is the caller's.
 */
export function DialogTitle({ icon: Icon, tone, title, subtitle, compact = false, className = '' }: { icon: LucideIcon; tone: 'warn' | 'accent'; title: string; subtitle: string; compact?: boolean; className?: string }) {
  return (
    <div className={`flex items-center ${compact ? 'min-w-0 gap-2.5' : 'flex-wrap gap-3'} ${className}`}>
      <div className={`shrink-0 items-center justify-center rounded-control ${compact ? 'hidden h-9 w-9 @min-icons:flex' : 'flex h-12 w-12'} ${tone === 'warn' ? 'bg-warn text-warn-ink' : 'bg-accent text-on-accent'}`}>
        <Icon className={`${compact ? 'h-5 w-5' : 'h-6 w-6'} ${tone === 'warn' ? 'fill-current' : ''}`} aria-hidden="true" />
      </div>
      <div className={compact ? 'min-w-0' : 'min-w-floor-title flex-1'}>
        <h2 className={`break-words font-bold uppercase tracking-display text-ink ${compact ? 'text-body' : 'text-emph'}`}>{title}</h2>
        <p className="text-label text-ink-3">{subtitle}</p>
      </div>
    </div>
  );
}
