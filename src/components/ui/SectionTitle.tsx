import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

const TONE = { accent: 'text-accent', warn: 'text-warn-ink', quiet: 'text-ink-2' } as const;

/**
 * The title of a screen's section or of a card: bold capitals in ink after a decorative icon,
 * with the one-line subtitle under it when there is one. A screen's section is text-emph with
 * a 20 px icon; a card's (small) is text-body with 16 px. The icon is the accent, the warn ink
 * over the incidents, ink-2 over the council's news, which is a newspaper column and not a
 * service notice. Returned as siblings, so the parent's spacing still sees two blocks.
 */
export function SectionTitle({
  icon: Icon,
  children,
  subtitle,
  small = false,
  as: As = 'h2',
  tone = 'accent',
  className = '',
}: {
  icon: LucideIcon;
  children: ReactNode;
  subtitle?: ReactNode;
  small?: boolean;
  as?: 'h2' | 'h3';
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <>
      <As className={`flex items-center gap-2 font-bold uppercase tracking-caps text-ink ${small ? 'text-body' : 'text-emph'} ${className}`}>
        <Icon className={`${small ? 'h-4 w-4' : 'h-5 w-5'} ${TONE[tone]}`} aria-hidden="true" />
        {children}
      </As>
      {subtitle && <p className="mt-0.5 text-label text-ink-3">{subtitle}</p>}
    </>
  );
}
