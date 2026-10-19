import type { ReactNode } from 'react';
import { useDialog } from '../../hooks/useDialog';
import { Scrim } from './controls';

/**
 * A panel from the right over a scrim, on the dialogs' layer, with the keyboard kept inside:
 * the menu and the favourites, the same gesture and edge and so the same shell. The menu is a
 * fixed width; `wide` is the favourites', which keeps a strip of page to its left.
 */
export function Drawer({ open, onClose, label, closeLabel, wide = false, children }: { open: boolean; onClose: () => void; label: string; closeLabel: string; wide?: boolean; children: ReactNode }) {
  const dialogRef = useDialog(open, onClose);
  if (!open) return null;

  const panel = '@container anim-slide-in flex flex-col border-l border-edge bg-bg shadow-overlay';
  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} className="fixed inset-0 z-dialog overflow-hidden">
      <Scrim label={closeLabel} onClose={onClose} className="absolute" />
      {wide ? (
        // The strip of page to the left stops growing with the type, and the panel may be
        // narrower than its content wants: at 200% text it was 80 px wider than the screen
        // and hid its own close button.
        <div className="fixed inset-y-0 right-0 flex max-w-full pl-cap-10">
          <div className={`${panel} w-screen min-w-0 max-w-drawer`}>{children}</div>
        </div>
      ) : (
        <div className={`${panel} absolute inset-y-0 right-0 w-menu max-w-menu-max`}>{children}</div>
      )}
    </div>
  );
}
