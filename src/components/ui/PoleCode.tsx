/**
 * The code printed on a stop's pole, as a grey chip beside the stop's name: what a rider
 * reads off the QR plate to know they are at the right pole. Nothing when the pole has no
 * printed code. Placement in a row (ml-auto in the search results) is the caller's className.
 * The inline form inside a caption line («Cód. 1234 • zone») is another role and stays text.
 */
export function PoleCode({ code, className = '' }: { code?: string | null; className?: string }) {
  return code ? <span className={`tnum shrink-0 rounded-tag bg-surface px-2 py-1 text-label text-ink-2 ${className}`}>{code}</span> : null;
}
