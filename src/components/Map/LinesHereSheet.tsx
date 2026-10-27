import { ChevronRight } from 'lucide-react';
import type { BusDirection, BusLine } from '../../types';
import { useLang, useT } from '../../i18n';
import { directionLabel } from '../../utils/serviceLabels';
import { LineBadge } from '../ui/LineBadge';
import { IconButton } from '../ui/controls';
import { MapSheet } from './MapSheet';

/** A route under the finger: the line, and the direction drawn there. */
export interface RouteHit {
  line: BusLine;
  dir: BusDirection;
}

/**
 * The lines that run where the map was tapped, in the sheet a stop opens: one row each, the
 * nearest to the finger first, both directions said once when both run there. A row picks the
 * line, which the map then draws over the rest and frames whole; the arrow opens its page.
 */
export function LinesHereSheet({ hits, onChoose, onOpenLine, onClose, onHeight }: { hits: RouteHit[]; onChoose: (line: BusLine) => void; onOpenLine: (line: BusLine) => void; onClose: () => void; onHeight?: (px: number) => void }) {
  const t = useT();
  const lang = useLang();
  const byLine = new Map<string, { line: BusLine; dirs: BusDirection[] }>();
  for (const { line, dir } of hits) byLine.set(line.id, { line, dirs: [...(byLine.get(line.id)?.dirs ?? []), dir] });

  return (
    <MapSheet label={t.map.linesHere} title={t.map.linesHere} hint={t.map.linesHereHint} closeLabel={t.map.closeLinesHere} onClose={onClose} onHeight={onHeight}>
      <ul className="mt-2 divide-y divide-line border-t border-line pb-sheet-foot">
        {[...byLine.values()].map(({ line, dirs }) => (
          <li key={line.id} className="flex items-center gap-1 pr-2">
            <button type="button" onClick={() => onChoose(line)} className="flex min-h-row-departure min-w-0 flex-1 items-center gap-2.5 px-3.5 py-2 text-left">
              <LineBadge number={line.number} color={line.color} size="row" />
              <span className="min-w-0 break-words text-label font-semibold text-ink-2">{dirs.length > 1 ? t.map.bothDirections : directionLabel(dirs[0], lang)}</span>
            </button>
            <IconButton icon={ChevronRight} label={`${t.map.openLineInfo}: ${line.number}`} title={t.map.openLineInfo} onClick={() => onOpenLine(line)} />
          </li>
        ))}
      </ul>
    </MapSheet>
  );
}
