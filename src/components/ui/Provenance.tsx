import { Check } from 'lucide-react';
import { useT } from '../../i18n';
import type { Precision } from '../../types';

/**
 * Where a time came from, in the two shapes the whole app uses: solid for a time the
 * operator prints, dashed for one derived from it. Colour never carries it alone.
 * `extra` is the text after the label (the board puts the clock there).
 */
/**
 * The ~ before a time this app worked out rather than read off the timetable, muted beside the
 * figure. `inherit` takes the figure's own colour where a muted tilde would fall below contrast
 * (the pressed run chip) or the figure is one colour throughout (the run on show).
 */
export function Approx({ on, inherit = false, title }: { on: boolean; inherit?: boolean; title?: string }) {
  return on ? (
    <span className={inherit ? undefined : 'text-ink-3'} title={title}>
      ~
    </span>
  ) : null;
}

export function Provenance({ precision, extra, title }: { precision: Precision; extra?: string; title?: string }) {
  const t = useT();
  const label = precision === 'published' ? t.common.officialBadge : t.common.estimatedBadge;
  const text = extra ? `${label} ${extra}` : label;
  return precision === 'published' ? (
    <span title={title} className="inline-flex items-center gap-1.5 rounded-tag bg-official px-2 py-1 text-on-official">
      <Check className="h-2.5 w-2.5 shrink-0 stroke-chip" aria-hidden="true" />
      <span className="tnum text-label font-semibold tracking-caps">{text}</span>
    </span>
  ) : (
    <span title={title} className="inline-flex items-center gap-1.5 chip-estimated rounded-tag border-dash border-dashed border-estimated-line text-estimated">
      <span className="tnum text-label font-semibold tracking-caps">{text}</span>
    </span>
  );
}
