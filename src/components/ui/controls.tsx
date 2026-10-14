import { ChevronDown, Star, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';

/**
 * A 44 px square icon button. With `on` it is a toggle, said with aria-pressed, and `on`
 * swaps it to the warm "active" fill; without, it is a plain button that says nothing of
 * being pressed (the map and share buttons are not switches).
 */
export function IconButton({
  icon: Icon,
  label,
  on,
  onClick,
  title,
  fill,
  className = '',
  iconClassName = '',
}: {
  icon: LucideIcon;
  label: string;
  on?: boolean;
  onClick: () => void;
  title?: string;
  /** Fill the icon (a starred star). */
  fill?: boolean;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={title}
      className={`flex h-tap w-tap items-center justify-center rounded-control border ${on ? 'border-warn bg-warn text-warn-ink' : 'border-edge bg-surface text-ink-2'} ${className}`}
    >
      <Icon className={`h-4.5 w-4.5 ${fill === undefined ? '' : 'stroke-filled'} ${iconClassName}`} fill={fill ? 'currentColor' : 'none'} aria-hidden="true" />
    </button>
  );
}

/**
 * The star that saves a stop or a line: one button, one pop. The pop plays on activation
 * only, never on opening something already saved, so the parent keys it by what it saves.
 * The icon moves, never the button: the target stays where the thumb is.
 */
export function SaveStar({ on, onToggle, label, className }: { on: boolean; onToggle: () => void; label: string; className?: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <IconButton
      icon={Star}
      label={label}
      title={label}
      on={on}
      fill={on}
      className={className}
      iconClassName={on && pressed ? 'anim-pop' : ''}
      onClick={() => {
        setPressed(true);
        onToggle();
      }}
    />
  );
}

/**
 * A quiet bordered paragraph under the header: a status, a hint, a warning when `warn`.
 * With an `icon`, it leads the text, which keeps its own column beside it.
 */
export function Notice({ children, warn = false, role, icon: Icon, className = 'mt-3' }: { children: ReactNode; warn?: boolean; role?: 'alert' | 'status'; icon?: LucideIcon; className?: string }) {
  return (
    <div role={role} className={`anim-rise rounded-control border p-3 text-label leading-prose ${warn ? 'border-warn bg-warn text-warn-ink' : 'border-edge bg-surface text-ink-2'} ${Icon ? 'flex gap-2' : ''} ${className}`}>
      {Icon ? (
        <>
          <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">{children}</div>
        </>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * The operator's notice folded to its heading, as on the board, the planner and a line's
 * page: the same element in three places, written three ways until 13 October 2026. The
 * body lines up under the heading's text: the summary's padding, the icon and the gap,
 * in rem like them, so it still lines up at 200 % text.
 */
export function NoticeDisclosure({ summary, children, seeFull, className = '' }: { summary: ReactNode; children: ReactNode; seeFull?: { label: string; onOpen: () => void }; className?: string }) {
  return (
    <details className={`disclosure rounded-control border border-warn bg-warn text-label leading-prose text-warn-ink ${className}`}>
      <summary className="flex min-h-tap cursor-pointer items-start gap-2 p-3">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown className="disclosure-chevron mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div className="px-3 pb-1 pl-8.5">
        {children}
        {seeFull && (
          <button onClick={seeFull.onOpen} className="inline-flex min-h-tap items-center font-semibold underline underline-offset-link">
            {seeFull.label}
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * "Which of these views": one bordered track, a thumb that slides to the pressed option
 * (`.seg-thumb`, 200 ms), so the control reads as one object and the slide says where you
 * came from. Each button carries `aria-pressed`; the thumb is decoration.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  dense = false,
  stack = false,
  className = '',
}: {
  options: readonly { id: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  label?: string;
  /** Label-sized text, for three options in a phone-wide track. */
  dense?: boolean;
  /** One option a row below sm, for options too long to share a phone's width. */
  stack?: boolean;
  className?: string;
}) {
  const pressed = Math.max(0, options.findIndex((o) => o.id === value));
  return (
    <div role="group" aria-label={label} className={`seg ${dense ? 'seg-dense' : ''} ${stack ? 'seg-stack' : ''} ${className}`} style={{ '--n': options.length, '--i': pressed } as CSSProperties}>
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={o.id === value} title={o.title} className={`seg-btn ${o.id === value ? 'seg-on' : ''}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
