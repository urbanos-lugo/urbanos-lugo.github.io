import { MapPinOff } from 'lucide-react';
import { useT } from '../../i18n';
import { EmptyState } from '../ui/EmptyState';

/**
 * Where a map would be on a browser that cannot draw one: no WebGL2, or a context lost and not
 * given back. It says so, in the map's own space, and points at the lists that say the same.
 * Decided on 27 Oct 2026 instead of keeping a second, raster map for those browsers.
 */
export function MapUnavailable({ className = '' }: { className?: string }) {
  const t = useT();
  return (
    <EmptyState icon={MapPinOff} className={className}>
      <p role="status" className="text-body text-ink-2">
        {t.map.unavailable}
      </p>
    </EmptyState>
  );
}
