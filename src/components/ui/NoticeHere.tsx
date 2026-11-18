import { useT } from '../../i18n';
import type { StopNotice } from '../../utils/noticeChanges';

/** The timetable still has this bus here and the operator's notice says it will not stop: beside its time, struck through. */
export function NotHere() {
  const t = useT();
  return <span className="tag bg-warn text-warn-ink">{t.arrivals.noticeNotHere}</span>;
}

/**
 * What the notice does at this stop, in its words: the lines that skip it and where to go
 * instead, the ones that call elsewhere, and the ones past their last printed call here,
 * whose end time is then the only answer. The same sentences on the board, the map's sheet
 * and the saved stops; nothing when the notice says nothing here (`here.speaks`).
 */
export function NoticeHere({ here }: { here: StopNotice }) {
  const t = useT();
  const { closed, moved } = here;
  const lateNow = here.late.filter((l) => l.now);
  return (
    <>
      {closed.lines.length > 0 && <span className="mt-1 block font-semibold first:mt-0">{t.arrivals.noticeClosedHere(closed.lines, closed.instead)}</span>}
      {moved.length > 0 && (
        <span className="mt-1 block font-semibold first:mt-0">
          {t.arrivals.noticeMovedHere(
            moved.map((m) => m.line),
            moved[0].to,
          )}
        </span>
      )}
      {lateNow.map((l) => (
        <span key={l.line} className="mt-1 block font-semibold first:mt-0">
          {t.arrivals.noticeRunsUntil(l.line, l.time, l.to)}
        </span>
      ))}
      {lateNow.length > 0 && <span className="block">{t.arrivals.noticeNoDepartures}</span>}
    </>
  );
}
