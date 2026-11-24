import { useMemo } from 'react';
import { ChevronRight, Navigation } from 'lucide-react';
import { BusStop, BusLine, StopArrival } from '../../types';
import { lineById, poleCode } from '../../data/transitData';
import { getArrivalsForStop, nextServiceAtStop, rowKeys } from '../../utils/arrivals';
import { atStop, type NoticeChanges } from '../../utils/noticeChanges';
import { dayWord, dueWord } from '../../utils/serviceLabels';
import { useLang, useT } from '../../i18n';
import { useClock } from '../../hooks/useClock';
import { MapSheet } from './MapSheet';
import { LineBadge } from '../ui/LineBadge';
import { Approx, Provenance } from '../ui/Provenance';
import { NoticeHere, NotHere } from '../ui/NoticeHere';
import { IconButton, Notice } from '../ui/controls';

interface StopSheetProps {
  stop: BusStop;
  /** The operator's notices read out, as the board gets them: a line they keep away from this stop is struck through here too. */
  changes?: NoticeChanges | null;
  onClose: () => void;
  /** Pick the line out on the map, as a row of the lines under a tap does. */
  onChooseLine: (line: BusLine) => void;
  onOpenLine: (line: BusLine) => void;
  /** Narrow the map to the lines serving this stop, without leaving the map. */
  onShowLinesHere: (stop: BusStop) => void;
  /** The full stop board, with the operator's own minutes and everything else. */
  onOpenFullBoard: (stop: BusStop) => void;
  /** Ruta, with this stop as the destination. */
  onPlanTo: (stop: BusStop) => void;
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
export function StopSheet({ stop, changes = null, onClose, onChooseLine, onOpenLine, onShowLinesHere, onOpenFullBoard, onPlanTo, onHeight }: StopSheetProps) {
  const t = useT();
  const lang = useLang();

  const now = useClock(REFRESH_MS);
  const arrivals = useMemo(() => getArrivalsForStop(stop.id, now).arrivals.slice(0, SHOWN), [stop.id, now]);
  const keys = rowKeys(arrivals);
  const here = atStop(changes, stop, now);
  // Nothing in the next hours: when the first one is, as the board and the saved stops say.
  const next = arrivals.length ? null : nextServiceAtStop(stop.id, now);

  const code = poleCode(stop);
  const when = (a: StopArrival) => {
    const word = dueWord(lang, a);
    if (word) return <span className={a.overdueMinutes ? 'text-ink-2' : 'font-bold text-ink'}>{word}</span>;
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
        {here.speaks && (
          <Notice warn className="mx-3.5 mt-3">
            <NoticeHere here={here} />
          </Notice>
        )}
        {arrivals.length === 0 ? (
          <p className="px-3.5 py-4 text-note text-ink-2">
            {t.arrivals.noArrivals}
            {next && <span className="mt-1 block font-semibold text-ink">{t.arrivals.nextServiceAt(next.lineNumber, `${next.precision === 'estimated' ? '~' : ''}${next.time}`, next.destination, dayWord(lang, next.daysAhead))}</span>}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {arrivals.map((a, i) => (
              // As in the lines under a tap (LinesHereSheet): the row picks the line on the map, the arrow opens its page.
              <li key={keys[i]} className="flex items-center gap-1 pr-2">
                <button
                  type="button"
                  onClick={() => {
                    const line = lineById(a.lineId);
                    if (line) onChooseLine(line);
                  }}
                  className="flex min-h-row-departure min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 px-3.5 py-2 text-left"
                >
                  <LineBadge number={a.lineNumber} color={a.lineColor} size="row" />
                  {/* A floor for the destination, the minutes under it when both do not fit, as on the board:
                      beside the arrow, with the type at 200%, the name was squeezed to one letter a line. */}
                  <span className="min-w-floor-name flex-1">
                    <span className="block break-words text-label font-semibold text-ink-2">{a.destination}</span>
                    <span className="mt-0.5 inline-block">
                      <Provenance precision={a.precision} extra={a.etaTime} title={a.precision === 'published' ? t.arrivals.publishedHint : t.arrivals.estimatedHint} />
                    </span>
                  </span>
                  <span className={`ml-auto shrink-0 text-emph ${here.skips(a.lineNumber) ? 'line-through opacity-struck' : ''}`}>{when(a)}</span>
                  {here.skips(a.lineNumber) && <NotHere />}
                </button>
                <IconButton
                  icon={ChevronRight}
                  label={`${t.map.openLineInfo}: ${a.lineNumber}`}
                  title={t.map.openLineInfo}
                  onClick={() => {
                    const line = lineById(a.lineId);
                    if (line) onOpenLine(line);
                  }}
                />
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
        {/* Side by side while both fit, one under the other when they do not: a third full row made the sheet taller than the stop it is for. */}
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => onShowLinesHere(stop)} className="btn btn-secondary btn-dense min-w-floor-name flex-1">
            {t.map.onlyLinesHere}
          </button>
          <button type="button" onClick={() => onPlanTo(stop)} className="btn btn-secondary btn-dense min-w-floor-name flex-1">
            <Navigation className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t.arrivals.planTo}
          </button>
        </div>
      </div>
    </MapSheet>
  );
}
