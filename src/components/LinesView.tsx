import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Bus, Calendar, ChevronRight, Clock, MapPin, Route, Star, TriangleAlert } from 'lucide-react';
import { useLang, useT } from '../i18n';
import { BusLine, BusStop, ServiceAlert } from '../types';
import { NOTICE_LANG, namesLine } from '../utils/operatorNotices';
import { changesNow, runsUntil, type NoticeChanges } from '../utils/noticeChanges';
import { BUS_LINES, BUS_STOPS, poleCode, stopById } from '../data/transitData';
import { getScheduledBuses } from '../utils/vehicles';
import { buildRuns, dayKind, formatMinutes, isHoliday, minutesNow, scheduledDuration, type ScheduledRun } from '../utils/schedule';
import { daysLabel, directionLabel, frequencyLabel } from '../utils/serviceLabels';
import { MAX_QUERY_LENGTH, matchesQuery } from '../utils/searchUtils';
import { BackButton, ChoiceChip, IconButton, Notice, NoticeDisclosure, SaveStar, Segmented } from './ui/controls';
import { SectionTitle } from './ui/SectionTitle';
import { Approx } from './ui/Provenance';
import { LineBadge, lineTint } from './ui/LineBadge';
import { useClock } from '../hooks/useClock';

/** The categories the dataset actually uses, in the order the lines declare them. */
const CATEGORIES = [...new Set(BUS_LINES.map((l) => l.category))];
/** How often the drawn positions are recomputed. They come from the timetable, not GPS. */
const TICK_MS = 3000;

interface LinesViewProps {
  selectedLine: BusLine | null;
  /** Bumped whenever somebody asked for a line, as opposed to for this tab. */
  lineRequest?: number;
  onSelectLine: (line: BusLine) => void;
  onSelectStop: (stop: BusStop) => void;
  onViewLineOnMap: (line: BusLine) => void;
  favoriteLineIds?: string[];
  onToggleFavoriteLine?: (lineId: string) => void;
  /** The operator's notices written out line by line, fresh ones only; this line's parts show under its facts. */
  notices?: ServiceAlert[];
  /** What those notices change, read out of their words: this line's part shows when it holds today. */
  changes?: NoticeChanges | null;
  onOpenAlerts?: () => void;
}

/** One fact about the line: an icon, a label and the value. */
function Fact({ icon: Icon, label, children, title }: { icon: typeof Clock; label: string; children: ReactNode; title?: string }) {
  return (
    <div title={title}>
      <div className="flex items-center gap-1.5 text-label font-bold text-ink-3">
        <Icon className="w-3.5 h-3.5 text-accent" />
        <span>{label}</span>
      </div>
      <div className="font-bold text-body text-ink font-mono">{children}</div>
    </div>
  );
}

/**
 * How many buses the timetable puts on the line now. In the list's dense row the number alone,
 * the sentence said to a screen reader, and it never shrinks; on the line's page the sentence,
 * among the header's tags.
 */
function RunningBuses({ count, compact = false }: { count: number; compact?: boolean }) {
  const t = useT();
  return (
    <span title={t.lines.enRouteHint} className={`flex items-center border border-edge bg-surface text-ink-2 ${compact ? 'shrink-0 gap-0.5 rounded-tag px-1.5 text-label font-bold' : 'tag gap-1'}`}>
      <Bus className={`${compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} text-ink-3`} aria-hidden="true" />
      {compact ? (
        <>
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{t.lines.enRoute(count)}</span>
        </>
      ) : (
        t.lines.enRoute(count)
      )}
    </span>
  );
}

export function LinesView({ selectedLine, lineRequest = 0, onSelectLine, onSelectStop, onViewLineOnMap, favoriteLineIds = [], onToggleFavoriteLine, notices = [], changes = null, onOpenAlerts }: LinesViewProps) {
  const t = useT();
  const lang = useLang();
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [directionIndex, setDirectionIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  /** Below lg the two columns are one screen at a time: list, then the line. */
  const [showDetail, setShowDetail] = useState(false);
  /** "Which run is on the road now" is a function of the time, so it follows the clock. */
  const now = useClock(TICK_MS);
  const buses = useMemo(() => getScheduledBuses(now), [now]);

  const currentLine = selectedLine || BUS_LINES[0];

  // A line picked somewhere else opens here — only below lg, where the columns take turns.
  useEffect(() => {
    if (!lineRequest) return;
    setDirectionIndex(0);
    setShowDetail(true);
  }, [lineRequest]);

  const query = searchQuery.trim();
  const visibleLines = BUS_LINES.filter(
    (line) => (categoryFilter === 'all' || line.category === categoryFilter) && (!query || matchesQuery(line.number, query) || matchesQuery(line.name, query) || matchesQuery(line.description, query)),
  );

  // The selector can point past the end after a line with fewer directions is chosen.
  const directionIdx = currentLine.directions[directionIndex] ? directionIndex : 0;
  const direction = currentLine.directions[directionIdx];
  const runs = useMemo(() => buildRuns(currentLine, directionIdx, BUS_STOPS, dayKind(new Date())), [currentLine, directionIdx]);

  /** Set when the reader steps through the timetable by hand; null means "follow the clock". */
  const [pickedRunIndex, setPickedRunIndex] = useState<number | null>(null);
  const currentRunIndex = useMemo(() => {
    const now = minutesNow();
    const running = runs.findIndex((r) => r.minutesByStopIndex[0] <= now && r.minutesByStopIndex[r.minutesByStopIndex.length - 1] >= now);
    if (running >= 0) return running;
    // Nothing on the road: the next one out, or the last of the day once it is over.
    const next = runs.findIndex((r) => r.minutesByStopIndex[0] >= now);
    return next >= 0 ? next : Math.max(0, runs.length - 1);
  }, [runs, now]);
  const runIndex = Math.min(pickedRunIndex ?? currentRunIndex, Math.max(0, runs.length - 1));
  const shownRun = runs[runIndex];
  // A hand-picked run belongs to the line and direction it was picked in.
  useEffect(() => setPickedRunIndex(null), [currentLine.id, direction.id]);

  const busesOnLine = buses.filter((b) => b.lineId === currentLine.id && (b.direction === direction.id || currentLine.directions.length === 1));
  /**
   * Whether a run's time at a stop is the operator's own or worked out. The board has always
   * said so on every row; this screen said it only for times still to come, so 1,077 of the
   * 1,585 departures of a day type -- the 10 lines that print a first, a last and a frequency,
   * and the directions whose first stop is not a timing point -- were drawn as if printed.
   */
  const derived = (run: ScheduledRun | undefined, stopIndex: number) => !!run && !run.publishedStopIndices.includes(stopIndex);
  const departures = runs.map((r) => ({ time: formatMinutes(r.minutesByStopIndex[0]), derived: derived(r, 0) }));
  const isSaved = favoriteLineIds.includes(currentLine.id);
  const duration = scheduledDuration(currentLine, directionIdx, BUS_STOPS);

  return (
    <div className="page page-gutter h-full py-4 lg:pb-0">
      {/* From lg up each pane scrolls on its own, so each is positioned: otherwise the absolute
          boxes inside (screen-reader text, timeline dots) take <main> as containing block,
          escape the pane's clip, and <main> scrolls a second time into an empty page. */}
      <div className="lg:grid lg:h-full lg:grid-cols-12 lg:gap-6">
        <div className={`space-y-4 lg:relative lg:col-span-5 lg:block lg:h-full lg:overflow-y-auto lg:pb-4 ${showDetail ? 'hidden' : ''}`}>
          <div className="card space-y-4 py-4 px-cap-4 lg:p-5">
            <div>
              <SectionTitle icon={Route} small subtitle={t.lines.subtitle}>
                {t.lines.title}
              </SectionTitle>
            </div>

            <div className="chip-rail pb-2">
              {['all', ...CATEGORIES].map((category) => (
                <ChoiceChip key={category} on={categoryFilter === category} onClick={() => setCategoryFilter(category)}>
                  {t.lines.categories[category as keyof typeof t.lines.categories] || category}
                </ChoiceChip>
              ))}
            </div>

            <input
              id="search-line-input"
              type="text"
              maxLength={MAX_QUERY_LENGTH}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.lines.searchLines}
              aria-label={t.lines.searchLines}
              className="field"
            />

            {/* No scroll box of its own: on a phone the page scrolls, on a desktop the column
                does, and a 520 px box inside either was a scroll within a scroll -- and left a
                gap under it on a tablet. */}
            <div className="space-y-2">
              {visibleLines.map((line) => {
                const isCurrent = currentLine.id === line.id;
                const running = buses.filter((b) => b.lineId === line.id).length;
                const parts = line.name.split(' - ');
                return (
                  <button
                    key={line.id}
                    type="button"
                    id={`line-card-${line.id}`}
                    aria-current={isCurrent ? 'true' : undefined}
                    onClick={() => {
                      onSelectLine(line);
                      setDirectionIndex(0);
                      setShowDetail(true);
                    }}
                    style={lineTint(line.color)}
                    className={`line-row tint tint-strong w-full justify-between gap-2.5 px-cap-3 py-2.5 cursor-pointer transition-all text-left ${isCurrent ? 'border-accent shadow-hair' : 'tint-edge'}`}
                  >
                    {/* The name keeps a floor of 6rem and goes under the number when both do not fit:
                        with the type at 200% it was cut to its first letter, "R…". */}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1.5">
                      <LineBadge number={line.number} color={line.color} size="md" className="shadow-hair" />
                      <div className="min-w-floor-name flex-1">
                        {/* Keep the end of the name, not the beginning: nine distinct openings across twenty-four lines, seventeen distinct endings. */}
                        <div className="font-bold text-body text-ink leading-name flex items-baseline gap-1.5 min-w-0" title={line.name}>
                          {/* Only while the row is a whole screen wide: in the desktop's list column both
                              halves were cut, "Opuesto Pis... – Rúa Mercad...", even at 1920 px. */}
                          <span className="hidden truncate text-ink-2 font-semibold sm:inline lg:hidden">{parts.slice(0, -1).join(' - ')}</span>
                          <span className="hidden shrink-0 sm:inline lg:hidden" aria-hidden="true">
                            –
                          </span>
                          <span className="line-clamp-3 break-words">{parts[parts.length - 1]}</span>
                          {/* The star is the only sign the line is saved, and an icon says nothing to a screen reader. */}
                          {favoriteLineIds.includes(line.id) && (
                            <>
                              <Star className="w-3.5 h-3.5 fill-current text-warn-ink shrink-0 self-center" aria-hidden="true" />
                              <span className="sr-only">{t.lines.savedSr}</span>
                            </>
                          )}
                        </div>
                        {/* Wrapping: at 200% text the frequency and the running-bus badge, both shrink-0, ran 42 px past a 390 px phone and made the page scroll sideways. */}
                        <div className="text-label text-ink-2 mt-0.5 flex min-w-0 flex-wrap items-center gap-2">
                          <span className="shrink-0">{frequencyLabel(line, lang)}</span>
                          <span className="shrink-0">&bull;</span>
                          <span>{daysLabel(line, lang)}</span>
                          {running > 0 && <RunningBuses count={running} compact />}
                        </div>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 transition-transform shrink-0 ${isCurrent ? 'text-accent translate-x-0.5' : 'text-ink-3'}`} aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={`anim-push-in space-y-4 lg:relative lg:animate-none lg:col-span-7 lg:block lg:h-full lg:overflow-y-auto lg:pb-4 ${showDetail ? '' : 'hidden'}`}>
          <BackButton label={t.lines.backToLines} onClick={() => setShowDetail(false)} />

          <div className="card space-y-4 py-6 px-cap-6">
            <div className="flex flex-col justify-between gap-4 border-b border-line pb-5 2xl:flex-row 2xl:items-center">
              {/* Wrapping: at 200% text the chips and the name ran 144 px past the card. */}
              <div className="flex flex-wrap items-center gap-4">
                <LineBadge number={currentLine.number} color={currentLine.color} size="xl" className="shadow-raised" />
                <div className="min-w-floor-heading flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tag bg-surface text-ink-2 uppercase tracking-caps">{t.lines.lineLabel(currentLine.number)}</span>
                    {currentLine.category === 'hospital' && <span className="tag bg-warn text-warn-ink">{t.lines.categories.hospital}</span>}
                    {busesOnLine.length > 0 && <RunningBuses count={busesOnLine.length} />}
                  </div>
                  <h2 className="text-emph font-bold text-ink mt-1 break-words">{currentLine.name}</h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                {onToggleFavoriteLine && <SaveStar key={currentLine.id} on={isSaved} label={isSaved ? t.lines.unsaveLine : t.lines.saveLine} onToggle={() => onToggleFavoriteLine(currentLine.id)} />}
                <button id="btn-view-line-map" onClick={() => onViewLineOnMap(currentLine)} className="btn btn-primary">
                  <MapPin className="w-4 h-4" />
                  <span>{t.lines.viewOnMap}</span>
                </button>
              </div>
            </div>

            {/* Six facts about one line; the last three belong to the direction and change with the selector. */}
            {/* Columns of at least 6rem, so they follow the text: two on a phone at the default size,
                one from 125% up. In two fixed columns at 200% the frequency's label ran 64 px
                into the next one. */}
            <div className="inset-panel grid grid-cols-facts gap-x-4 gap-y-3 bg-surface/quiet sm:grid-cols-3">
              <Fact icon={Clock} label={t.lines.frequency}>
                <span className="font-sans font-semibold">{frequencyLabel(currentLine, lang)}</span>
              </Fact>
              <Fact icon={Calendar} label={t.lines.days}>
                <span className="font-sans font-semibold">{daysLabel(currentLine, lang)}</span>
              </Fact>
              {/* Today's, read from today's runs of this direction. It printed the line's first and
                  last departure of any day: "07:15 - 22:00" for the 7 on a Tuesday, whose first
                  bus is 07:30 -- the 07:15 runs at weekends. */}
              <Fact icon={Bus} label={t.lines.serviceHoursToday}>
                {runs.length ? (
                  <>
                    <Approx on={derived(runs[0], 0)} />
                    {formatMinutes(runs[0].minutesByStopIndex[0])}–<Approx on={derived(runs[runs.length - 1], 0)} />
                    {formatMinutes(runs[runs.length - 1].minutesByStopIndex[0])}
                  </>
                ) : (
                  <span className="font-sans font-semibold">{t.lines.notToday}</span>
                )}
              </Fact>
              <Fact icon={Route} label={t.lines.routeLength}>
                {t.lines.kilometres((direction.totalMeters / 1000).toFixed(1))}
              </Fact>
              <Fact icon={MapPin} label={t.lines.routeStops}>
                {direction.stops.length}
              </Fact>
              <Fact icon={Clock} label={t.lines.routeDuration} title={t.lines.routeDurationHint}>
                {duration === undefined ? t.lines.routeDurationUnknown : `${duration} ${t.common.min}`}
              </Fact>
            </div>

            {/* What that notice changes for this line today, read out of its words: until when it runs, which stops it skips or moves. */}
            {(() => {
              const today = changesNow(changes, now);
              const mine = today?.lines.find((c) => c.line === currentLine.number || c.line === currentLine.id);
              const until = mine && runsUntil(mine, now);
              if (!today || (!mine && !today.general.length)) return null;
              return (
                <Notice warn>
                  <p className="flex gap-2 font-semibold">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{t.lines.noticeToday}</span>
                  </p>
                  {until && <p className="mt-1 font-semibold">{t.arrivals.noticeRunsUntil(currentLine.number, until.time, until.to)}</p>}
                  {until && <p>{t.arrivals.noticeNoDepartures}</p>}
                  {mine?.closed.map((s) => (
                    <p key={`closed-${s.stopId}`} className="mt-1 font-semibold">
                      {t.lines.noticeClosedStop(stopById(s.stopId)?.name ?? s.stopId, s.instead)}
                    </p>
                  ))}
                  {mine?.moved.map((s) => (
                    <p key={`moved-${s.stopId}`} className="mt-1 font-semibold">
                      {t.lines.noticeMovedStop(stopById(s.stopId)?.name ?? s.stopId, s.to)}
                    </p>
                  ))}
                  {today.general.length > 0 && <p className="mt-1">{t.arrivals.noticeGeneral}</p>}
                </Notice>
              );
            })()}

            {/* What the operator says about this line these days, in its words: San Froilán 2026 ran four lines past 03:00 and moved stops on three.
                Folded under its heading and days: the box above says what it changes today, and open the two repeated each other on a phone. */}
            {notices.flatMap((alert) =>
              (alert.sections ?? []).filter((section) => namesLine(section, currentLine)).map((section, i) => (
                <NoticeDisclosure
                  key={`${alert.id}-${i}`}
                  seeFull={onOpenAlerts && { label: t.lines.seeFullNotice, onOpen: onOpenAlerts }}
                  summary={
                    <span className="font-semibold">
                      {t.lines.operatorNotice}
                      {alert.description !== alert.title && (
                        <>
                          . <span lang={NOTICE_LANG}>{alert.description}</span>
                        </>
                      )}
                    </span>
                  }
                >
                  {section.paragraphs.map((paragraph, j) => (
                    <p key={j} lang={NOTICE_LANG} className="mt-1 first:mt-0">
                      {paragraph}
                    </p>
                  ))}
                </NoticeDisclosure>
              )),
            )}

            {direction.geometrySource && direction.geometrySource !== 'osm' && (
              <Notice icon={TriangleAlert}>
                <span className="font-semibold text-ink">{t.lines.approximatePathTitle}.</span> {t.lines.approximatePath}
              </Notice>
            )}
          </div>

          <div className="card py-5 px-cap-5">
            <SectionTitle icon={Clock} small as="h3" className="mb-2">
              {t.lines.scheduleTable} &mdash; {direction.origin} ({departures.length})
            </SectionTitle>
            {/* All of them: two rows of 30 in a box that scrolled on its own hid the rest from a thumb. */}
            <div className="flex flex-wrap gap-1.5">
              {departures.map(({ time, derived: guessed }, idx) => (
                // The run on show is the one filled in: said as well as drawn.
                <ChoiceChip
                  key={idx}
                  on={idx === runIndex}
                  onClick={() => setPickedRunIndex(idx)}
                  title={t.lines.viewRunAt(time)}
                  aria-label={guessed ? `${t.lines.viewRunAt(time)}, ${t.lines.estimatedSr}` : t.lines.viewRunAt(time)}
                  dense
                  className="tnum"
                >
                  <Approx on={guessed} inherit />
                  {time}
                </ChoiceChip>
              ))}
            </div>
            {departures.some((d) => d.derived) && <p className="mt-2 text-note text-ink-3">{t.lines.derivedDepartures}</p>}
          </div>

          <div className="card @container space-y-4 py-6 px-cap-6">
            <div className="flex flex-col gap-3">
              <div>
                <SectionTitle
                  icon={Route}
                  small
                  as="h3"
                  subtitle={
                    <>
                      {direction.origin} &rarr; {direction.destination}
                    </>
                  }
                >
                  {t.lines.stopsInDirection} ({direction.stops.length})
                </SectionTitle>
              </div>
              {currentLine.directions.length > 1 && (
                <Segmented
                  stack
                  options={currentLine.directions.map((dir, idx) => ({ id: String(idx), label: directionLabel(dir, lang) }))}
                  value={String(directionIndex)}
                  onChange={(idx) => setDirectionIndex(Number(idx))}
                />
              )}
            </div>

            {shownRun ? (
              // Narrower than 16rem, the times go on top and the arrows under them: squeezed between
              // the two at 200% text, they pushed the right arrow 118 px off the screen.
              <div className="inset-panel flex flex-wrap items-center justify-between gap-3 border-edge p-2.5">
                {/* Named: an arrow on its own was read out as "left arrow", which says where it points and not what it does. */}
                <IconButton onSurface onClick={() => setPickedRunIndex(Math.max(0, runIndex - 1))} disabled={runIndex === 0} label={t.lines.previousRun} title={t.lines.previousRun} className="order-2 shrink-0 text-body font-semibold @min-stepper:order-none">
                  &larr;
                </IconButton>
                <div className="order-1 basis-full text-center leading-name @min-stepper:order-none @min-stepper:basis-0 @min-stepper:flex-1">
                  <div className="caps-label text-accent">{t.lines.showingRun}</div>
                  <div className="text-body font-black text-accent font-mono">
                    <Approx on={derived(shownRun, 0)} inherit />
                    {formatMinutes(shownRun.minutesByStopIndex[0])}
                    <span className="text-accent font-bold text-label ml-1.5" title={t.lines.estimatedHint}>
                      &rarr; ~{formatMinutes(shownRun.minutesByStopIndex[shownRun.minutesByStopIndex.length - 1])}
                    </span>
                  </div>
                  <div className="text-label text-accent font-semibold">
                    {t.lines.runOf(runIndex + 1, runs.length)}
                    {runIndex !== currentRunIndex && (
                      <button onClick={() => setPickedRunIndex(null)} className="ml-1.5 underline underline-offset-link font-bold">
                        {t.lines.backToNow}
                      </button>
                    )}
                  </div>
                </div>
                <IconButton onSurface onClick={() => setPickedRunIndex(Math.min(runs.length - 1, runIndex + 1))} disabled={runIndex >= runs.length - 1} label={t.lines.nextRun} title={t.lines.nextRun} className="order-3 shrink-0 text-body font-semibold @min-stepper:order-none">
                  &rarr;
                </IconButton>
              </div>
            ) : (
              <div className="inset-panel border-edge p-2.5 text-label font-semibold text-ink-2">
                {t.lines.noRunsToday}
                {/* A weekday-only line on a holiday Monday: without the reason, "does not run today" reads as a mistake. */}
                {isHoliday(new Date()) && <span className="block mt-1 font-normal">{t.lines.holidayToday}</span>}
              </div>
            )}

            {/* Keyed on the direction, so the other way's stops fade in as a new list rather than the rows changing names under the eye. */}
            <div key={directionIdx} className="anim-fade relative pl-6 space-y-1.5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-surface">
              {direction.stops.map((stopId, idx) => {
                const stop = stopById(stopId);
                if (!stop) return null;
                const isFirst = idx === 0;
                const isLast = idx === direction.stops.length - 1;
                const busHere = busesOnLine.some((b) => b.nextStopId === stop.id);
                const passingMinutes = shownRun?.minutesByStopIndex[idx];
                const relativeMinutes = passingMinutes === undefined ? null : Math.round(passingMinutes - minutesNow());
                return (
                  <div
                    key={stop.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelectStop(stop)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectStop(stop);
                      }
                    }}
                    // Named by what it shows, not by a label beside it: the label said the name and
                    // the time, and left out origin, destination, zone, code, "passed" and the bus
                    // the timetable puts here, which a screen reader then never heard (1.3.1), and
                    // "click Orixe" found nothing (2.5.3). The one word the eye gets from a tilde
                    // is written out after the time.
                    className="relative group cursor-pointer focus:outline-hidden focus-visible:ring-strong focus-visible:ring-accent rounded-control"
                  >
                    <div
                      className={`absolute -left-6 top-2.5 w-5 h-5 rounded-pill border-strong border-bg shadow-hair flex items-center justify-center transition-transform group-hover:scale-125 ${
                        busHere ? 'bg-estimated ring-strong ring-estimated' : isFirst || isLast ? 'bg-accent ring-strong ring-accent' : 'bg-ink-3 group-hover:bg-ink-2'
                      }`}
                    />
                    {/* Stacked on a phone: beside the name, the time chip left it about 110 px, and
                        "Fonte dos Ranchos 8 (Cafetería Prados)" took four lines. */}
                    <div className={`px-cap-3 py-2 rounded-control border transition-all flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2.5 ${busHere ? 'bg-surface/lifted border-edge ring-hair ring-official/half shadow-hair' : 'bg-bg border-line hover:border-edge hover:bg-surface/wash shadow-hair'}`}>
                      <div className="min-w-0 flex-1">
                        {/* The stop name is not shortened: it is the only thing on the row a reader has to match against a pole. */}
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
                          <span className="min-w-0 break-words font-bold text-body text-ink transition-colors group-hover:text-accent">{stop.name}</span>
                          {isFirst && <span className="tag shrink-0 px-1.5 bg-surface text-accent">{t.lines.origin}</span>}
                          {isLast && <span className="tag shrink-0 px-1.5 bg-ink text-bg">{t.lines.destination}</span>}
                        </div>
                        <div className="mt-0.5 break-words text-label text-ink-3">
                          {stop.zone}
                          {poleCode(stop) && (
                            <>
                              {' '}
                              &bull; {t.lines.codeShort} <span className="tnum font-bold text-ink-2">{poleCode(stop)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2.5 self-start sm:shrink-0 sm:self-auto">
                        {busHere && (
                          <div className="flex shrink-0 items-center gap-1.5 rounded-tag bg-official px-1.5 py-1 text-label font-bold text-on-official shadow-hair">
                            <Bus className="h-3.5 w-3.5" aria-hidden="true" />
                            <span className="hidden sm:inline">{t.lines.busScheduledHere}</span>
                            <span className="sr-only sm:hidden">{t.lines.busScheduledHere}</span>
                          </div>
                        )}
                        <div className="flex min-w-0 items-center gap-1 px-2.5 py-1 rounded-tag bg-surface border border-edge text-ink font-mono text-label font-bold">
                          <Clock className="w-3.5 h-3.5 text-accent" />
                          <span>
                            {passingMinutes === undefined ? (
                              <span className="text-ink-3 font-semibold">{t.lines.noService}</span>
                            ) : relativeMinutes !== null && relativeMinutes < 0 ? (
                              <span className="text-ink-3">
                                <Approx on={derived(shownRun, idx)} />
                                {formatMinutes(passingMinutes)} &middot; {t.lines.passed}
                              </span>
                            ) : relativeMinutes === 0 ? (
                              <span className="text-official font-bold">
                                <Approx on={derived(shownRun, idx)} />
                                {t.lines.nowAt}
                              </span>
                            ) : (
                              <span>
                                <Approx on={derived(shownRun, idx)} title={t.lines.estimatedHint} />
                                {relativeMinutes} min ({formatMinutes(passingMinutes)})
                              </span>
                            )}
                            {passingMinutes !== undefined && derived(shownRun, idx) && <span className="sr-only">, {t.lines.estimatedSr}</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
