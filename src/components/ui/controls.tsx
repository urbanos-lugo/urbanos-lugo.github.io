import { ArrowLeft, ChevronDown, Clock, Star, TriangleAlert, X, type LucideIcon } from 'lucide-react';
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
 * A time to ask about, with its words in front: the planner's "depart at" or "arrive by"
 * (with the clock icon) and the board's "at another time". The field goes under the words
 * when both do not fit; the box around it is the caller's.
 */
export function TimeField({
  label,
  value,
  onChange,
  clock = false,
  className = '',
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  clock?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-label font-semibold text-ink-2 ${className}`}>
      {clock && <Clock className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />}
      <span className="shrink-0">{label}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="field field-clock" />
    </label>
  );
}

/**
 * Back to the list a two-pane screen came from, on a phone: from lg up both panes show at
 * once and it goes. The space under it is the caller's.
 */
export function BackButton({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={`-ml-1 flex h-tap items-center gap-1.5 pr-3 text-body font-medium text-ink-2 lg:hidden ${className}`}>
      <ArrowLeft className="h-4.5 w-4.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * The way out of a surface: close a drawer, a dialog or a sheet, dismiss a banner. A quiet
 * 44 px square with the X (a sheet's chevron shows which way it goes, a size up: its path is
 * half the X's height). On a tinted banner it takes the banner's ink and no hover wash; as the
 * round end of a pill chip it is round. className places it, nothing else.
 */
export function CloseButton({
  label,
  onClick,
  icon: Icon = X,
  title,
  onTint = false,
  round = false,
  className = '',
}: {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  title?: string;
  onTint?: boolean;
  round?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={title}
      className={`flex h-tap w-tap shrink-0 items-center justify-center ${round ? 'rounded-pill' : 'rounded-control'} ${onTint ? '' : 'text-ink-2 transition-colors hover:bg-surface'} ${className}`}
    >
      <Icon className={Icon === X ? 'h-4.5 w-4.5' : 'h-5 w-5'} aria-hidden="true" />
    </button>
  );
}

/**
 * One of a row of choices, the one picked filled and said with aria-pressed: a 44 px floor,
 * label-size semibold, never wrapping. Three looks are in use, and kept until one is chosen:
 * ink (the lines' categories and runs), accent with an outline and a lift (the map's
 * presets), accent as a flat pill (the planner's shortcuts). dense is the run times' narrow
 * padding and the map presets', where five have to fit a sidebar.
 */
export function ChoiceChip({
  on,
  onClick,
  tone = 'ink',
  dense = false,
  children,
  className = '',
  ...aria
}: {
  on: boolean;
  onClick: () => void;
  tone?: 'ink' | 'accent' | 'pill';
  dense?: boolean;
  children: ReactNode;
  className?: string;
  'aria-label'?: string;
  title?: string;
}) {
  const look = {
    ink: on ? 'border border-ink bg-ink text-bg' : 'border border-edge text-ink-2',
    accent: on ? 'border border-accent bg-accent text-on-accent shadow-hair' : 'border border-edge bg-surface text-ink-2',
    pill: on ? 'rounded-pill bg-accent text-on-accent' : 'rounded-pill bg-surface text-ink-2',
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={aria['aria-label']}
      title={aria.title}
      className={`flex min-h-tap shrink-0 items-center justify-center whitespace-nowrap text-label font-semibold ${tone === 'pill' ? '' : 'rounded-control'} ${dense ? 'px-2.5' : 'px-3.5'} ${look} ${className}`}
    >
      {children}
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

const NOTICE_SIZE = {
  normal: 'anim-rise p-3 text-note',
  inline: 'w-full items-center px-2.5 py-1.5 text-label font-bold',
  alarm: 'anim-rise px-3 py-2.5 text-body font-semibold',
} as const;

/**
 * A quiet bordered paragraph under the header: a status, a hint, a warning when `warn`.
 * With an `icon`, it leads the text, which keeps its own column beside it. `inline` is the
 * one-line status inside the planner's figures (its row already animates); `alarm` the ride's
 * fired alarm, at body size. The space above it is the caller's.
 */
export function Notice({
  children,
  warn = false,
  role,
  icon: Icon,
  size = 'normal',
  className = '',
}: {
  children: ReactNode;
  warn?: boolean;
  role?: 'alert' | 'status';
  icon?: LucideIcon;
  size?: keyof typeof NOTICE_SIZE;
  className?: string;
}) {
  return (
    <div role={role} className={`rounded-control border ${NOTICE_SIZE[size]} ${warn ? 'border-warn bg-warn text-warn-ink' : 'border-edge bg-surface text-ink-2'} ${Icon ? 'flex gap-2' : ''} ${className}`}>
      {Icon && size === 'inline' ? (
        <>
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {children}
        </>
      ) : Icon ? (
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
    <details className={`disclosure rounded-control border border-warn bg-warn text-note text-warn-ink ${className}`}>
      <summary className="flex min-h-tap cursor-pointer items-start gap-2 p-3">
        <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">{summary}</span>
        <ChevronDown className="disclosure-chevron mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      </summary>
      <div className="px-3 pb-1 pl-8.5">
        {children}
        {seeFull && (
          <button onClick={seeFull.onOpen} className="link leading-prose text-warn-ink">
            {seeFull.label}
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * A fold inside a screen: native <details> with a 44 px summary row and the body the caller
 * passes, a direct child so .disclosure fades it in. Boxed where it stands in the flow; under
 * a rule where it is a footer section of the board. The chevron leads where the row's right
 * side carries figures (the planner's walk and fare). `count` is how many things it folds.
 */
export function Disclosure({
  summary,
  count,
  children,
  frame = 'box',
  chevronFirst = false,
  className = '',
}: {
  summary: ReactNode;
  count?: number;
  children: ReactNode;
  frame?: 'box' | 'rule';
  chevronFirst?: boolean;
  className?: string;
}) {
  const chevron = <ChevronDown className={`disclosure-chevron h-4 w-4 shrink-0 text-ink-3 ${chevronFirst ? '' : 'ml-auto'}`} aria-hidden="true" />;
  return (
    <details className={`disclosure ${frame === 'box' ? 'rounded-control border border-edge bg-surface' : 'rule-above'} ${className}`}>
      <summary className={`flex min-h-tap cursor-pointer items-center gap-2 text-label font-semibold text-ink-2 ${frame === 'box' ? 'px-3' : ''}`}>
        {chevronFirst && chevron}
        {summary}
        {count !== undefined && <span className="tnum rounded-control border border-edge px-1.5 py-0.5 text-ink-3">{count}</span>}
        {!chevronFirst && chevron}
      </summary>
      {children}
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
