/**
 * A line's number on its colour: the badge printed on the poles and the buses, which is
 * what a rider matches against. Sizes, smallest first: 'inline' in a run of text, 'sm' in
 * a row, 'row' as a row's lead, 'md' beside a clock, 'lg' where it is a target (44 px),
 * 'xl' heading a line's own page. With `onClick` it is a button; without, a span.
 * White text on every line colour measures at least 4.50:1 (the 5ES green is the floor).
 *
 * The sizes are the ones the screens asked for through className overrides, which had
 * drifted into nine geometries; geometry belongs here, not at the call.
 */
const SIZES = {
  inline: 'min-w-6 rounded px-1.5 py-0.5 text-label',
  sm: 'h-6 min-w-6 rounded px-1.5 text-label',
  row: 'h-7 min-w-7 rounded px-1.5 text-label',
  md: 'h-9 min-w-9 rounded-[7px] px-1.5 text-body',
  lg: 'h-11 w-11 rounded-[7px] text-body',
  xl: 'h-14 w-14 rounded-control text-title',
} as const;

export function LineBadge({
  number,
  color,
  size = 'lg',
  className = '',
  title,
  onClick,
  ...aria
}: {
  number: string;
  color: string;
  size?: keyof typeof SIZES;
  className?: string;
  title?: string;
  'aria-label'?: string;
  onClick?: () => void;
}) {
  const classes = `tnum flex shrink-0 items-center justify-center font-bold text-on-line ${SIZES[size]} ${className}`;
  const style = { backgroundColor: color };
  return onClick ? (
    <button type="button" onClick={onClick} title={title} aria-label={aria['aria-label']} className={classes} style={style}>
      {number}
    </button>
  ) : (
    <span title={title} className={classes} style={style}>
      {number}
    </span>
  );
}
