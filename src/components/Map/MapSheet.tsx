import { useLayoutEffect, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { CloseButton } from '../ui/controls';
import { useDialog } from '../../hooks/useDialog';

/**
 * What a tap on the map opens, the same whatever was tapped, a stop or a line: a sheet from the
 * bottom of the map with the map still behind it, its title, the line under it that says what it
 * is, and the chevron that puts it away. A panel inside the map's card, so the same markup is a
 * sheet on a phone and a panel over the map on a desktop. A line tapped opened a popup
 * instead, which in the centre listed eleven lines over 578 px and ran under the search bar.
 */
export function MapSheet({
  label,
  title,
  hint,
  closeLabel,
  onClose,
  onHeight,
  children,
}: {
  /** The dialog's name, for a screen reader. */
  label: string;
  title: ReactNode;
  hint?: ReactNode;
  closeLabel: string;
  onClose: () => void;
  /** Its height once drawn, so the map can keep what was tapped in sight above it. */
  onHeight?: (px: number) => void;
  children: ReactNode;
}) {
  const dialogRef = useDialog(true, onClose);
  useLayoutEffect(() => {
    if (dialogRef.current) onHeight?.(dialogRef.current.offsetHeight);
    // Measured once, as it opens: what was tapped is moved into sight then, not chased afterwards.
  }, []);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} className="anim-sheet-up absolute inset-x-0 bottom-0 z-map-sheet max-h-stop-sheet-max overflow-y-auto rounded-t-sheet border-t border-edge bg-bg shadow-overlay">
      <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
        <div className="min-w-0">
          <h2 className="break-words text-body font-bold text-ink">{title}</h2>
          {hint && <p className="text-label text-ink-3">{hint}</p>}
        </div>
        <CloseButton label={closeLabel} onClick={onClose} icon={ChevronDown} className="-mr-1" />
      </div>
      {children}
    </div>
  );
}
