import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { BusStop, BusLine, StopArrival } from '../../types';
import { lineById, poleCode } from '../../data/transitData';
import { getArrivalsForStop, rowKeys } from '../../utils/arrivals';
import { useT } from '../../i18n';
import { useClock } from '../../hooks/useClock';
import { MapSheet } from './MapSheet';
import { LineBadge } from '../ui/LineBadge';
import { Approx, Provenance } from '../ui/Provenance';

interface StopSheetProps {
  stop: BusStop;
  onClose: () => void;
  onOpenLine: (line: BusLine) => void;
  /** Narrow the map to the lines serving this stop, without leaving the map. */
  onShowLinesHere: (stop: BusStop) => void;
  /** The full stop board, with the operator's own minutes and everything else. */
  onOpenFullBoard: (stop: BusStop) => void;
  /** The sheet's height once drawn (MapSheet). */
  onHeight?: (px: number) => void;
}

/** Enough to answer "can I still make it", short enough to not become a page. */
const SHOWN = 4;
/** A minute stops being useful once it has been on screen for a minute. */
const REFRESH_MS = 30_000;

/**
 * The stop, opened where you tapped it, with the map still behind it: the next few
 * departures and a way through to the full board. A panel inside the map container, so
 * the same markup is a sheet on a phone and a panel over the map card on a desktop.
 */
export function StopSheet({ stop, onClose, onOpenLine, onShowLinesHere, onOpenFullBoard, onHeight }: StopSheetProps) {
  const t = useT();

  const now = useClock(REFRESH_MS);
  const arrivals = useMemo(() => getArrivalsForStop(stop.id, now).arrivals.slice(0, SHOWN), [stop.id, now]);
  const keys = rowKeys(arrivals);

  const code = poleCode(stop);
  const when = (a: StopArrival) => {
    if (a.overdueMinutes) return <span className="text-ink-2">{t.common.overdue(a.overdueMinutes)}</span>;
    if (a.etaMinutes === 0) return <span className="font-bold text-ink">{t.common.arrivingNow}</span>;
    return (
      <span className="tnum font-bold text-ink">
        <Approx on={a.precision === 'estimated'} />
        {a.etaMinutes} min
      </span>
    );
  };

  return (
    <MapSheet
      label={stop.name}
      title={stop.name}
      hint={
        <>
          {code && (
            <>
              {t.map.stopCode}: <b className="tnum text-ink-2">{code}</b> &bull;{' '}
            </>
          )}
          {stop.zone}
        </>
      }
      closeLabel={t.map.closeStop}
      onClose={onClose}
      onHeight={onHeight}
    >
      <div className="mt-2 border-t border-line">
        {arrivals.length === 0 ? (
          <p className="px-3.5 py-4 text-note text-ink-2">{t.arrivals.noArrivals}</p>
        ) : (
          <ul className="divide-y divide-line">
            {arrivals.map((a, i) => (
              <li key={keys[i]}>
                <button
                  type="button"
                  onClick={() => {
                    const line = lineById(a.lineId);
                    if (line) onOpenLine(line);
                  }}
                  className="flex min-h-row-departure w-full items-center gap-2.5 px-3.5 py-2 text-left"
                >
                  <LineBadge number={a.lineNumber} color={a.lineColor} size="row" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-label font-semibold text-ink-2">{a.destination}</span>
                    <span className="mt-0.5 inline-block">
                      <Provenance precision={a.precision} extra={a.etaTime} title={a.precision === 'published' ? t.arrivals.publishedHint : t.arrivals.estimatedHint} />
                    </span>
                  </span>
                  <span className="shrink-0 text-emph">{when(a)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* No row of every line serving the stop: it was the one part whose height nobody could predict, and every departure above carries its badge. */}
      <div className="flex flex-col gap-1.5 border-t border-line p-3.5 pb-sheet-foot">
        <button type="button" onClick={() => onOpenFullBoard(stop)} className="btn btn-primary btn-dense w-full">
          {t.map.viewStopDepartures}
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" onClick={() => onShowLinesHere(stop)} className="btn btn-secondary btn-dense w-full">
          {t.map.onlyLinesHere}
        </button>
      </div>
    </MapSheet>
  );
}
