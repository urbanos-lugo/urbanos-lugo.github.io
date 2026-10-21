import { useState, useEffect, useMemo, useReducer, useRef, lazy, Suspense } from 'react';
import { Navigation, MapPin, ArrowDownUp, Clock, Bus, Footprints, AlertCircle, ArrowRight, ChevronDown } from 'lucide-react';
import { useLang, useT } from '../i18n';
import { BusStop, BusLine, RoutePlanResult } from '../types';
import { planTrips } from '../utils/planner';
import { changesNow, pastTimetable, runsUntil, setsOff, underNotice, type NoticeChanges } from '../utils/noticeChanges';
import { stopById } from '../data/transitData';
import { resolveLocationQuery, QUICK_DESTINATIONS } from '../utils/places';
import { dayWord } from '../utils/serviceLabels';
import { walkHopKey, walkHopsOf, type Hop } from '../services/walkingPath';
import { useRecentRoutes, type RecentRoute } from '../hooks/useStoredList';
import { useWalkPaths } from '../hooks/useWalkPaths';
import { useClock } from '../hooks/useClock';
import { boardingIsNow, type TripPlace } from '../utils/tripProgress';
import type { Screen } from '../hooks/useTabRoute';
import { SectionLabel } from './ui/SectionLabel';
import { EmptyState } from './ui/EmptyState';
import { Figure } from './ui/Figure';
import { ChoiceChip, Disclosure, Notice, NoticeDisclosure, Segmented, TimeField } from './ui/controls';
import { PlaceField, suggestionsFor, type Suggestion } from './planner/PlaceField';
import { TripOptions } from './planner/TripOptions';
import { Itinerary } from './planner/Itinerary';
import { correctionFor, formatKm, measuredWalkFor, rankMeasured, withMeasuredWalk, type Endpoints } from './planner/walkCorrection';
// Leaflet loads with the map, not with the app.
const RouteMap = lazy(() => import('./Map/RouteMap').then((m) => ({ default: m.RouteMap })));

const DEFAULT_ORIGIN = 'Fonte dos Ranchos';
const DEFAULT_DEST = 'Hospital Lucus Augusti (HULA)';
/** More than this and the alternatives stop helping and start being a wall. */
const MAX_OPTIONS = 4;

const toPoint = (r: { name: string; lat: number; lng: number } | null) => (r ? { name: r.name, lat: r.lat, lng: r.lng } : undefined);
/** The moment a question is planned from, as planTrips reads it: now, or today at the time asked to leave. */
const plannedFrom = (opts: { departAt?: number }): Date => {
  const at = new Date();
  if (opts.departAt !== undefined) at.setHours(Math.floor(opts.departAt / 60), Math.round(opts.departAt % 60), 0, 0);
  return at;
};
/** Once the frame already committed is on screen: the next animation frame, then a task after it. */
const afterPaint = (run: () => void) => requestAnimationFrame(() => setTimeout(run, 0));
const clockNow = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * Whether a question has been answered, and `answered` counting them so focus moves to the
 * answer. Whether the form is folded to a one-line summary over it, on a phone, is the
 * history's: the answer is a screen over the form, and back unfolds it (App.tsx).
 */
interface Asking {
  asked: boolean;
  answered: number;
}
const asking = (state: Asking): Asking => ({ asked: true, answered: state.answered + 1 });
type Trip = NonNullable<Screen['trip']>;

interface RoutePlannerViewProps {
  onSelectStop: (stop: BusStop) => void;
  onSelectLine: (line: BusLine) => void;
  /** A place picked in the search box. The counter makes asking twice two requests. */
  destinationRequest?: { query: string; nonce: number } | null;
  /** "Vou nesta": hand the plan on screen to the trip companion. */
  onStartTrip: (plan: RoutePlanResult, origin: TripPlace | null, destination: TripPlace | null) => void;
  /** What the operator's notice changes: a stop it closes is never boarded or left, and a trip on a changed line says so. */
  changes?: NoticeChanges | null;
  onOpenAlerts?: () => void;
  /** The answer is the screen, to this question; below lg it is folded over the form. */
  answerShown: Trip | undefined;
  /**
   * A question answered, folding the form: the answer becomes the screen, over the form, or in
   * its place when the form was never on screen (a place picked in the search box).
   */
  onAnswer: (trip: Trip, inPlace: boolean) => void;
  /** Back to the form from the answer. */
  onEditTrip: () => void;
  /** Back to the answer from the form, unasked again. */
  onShowAnswer: (trip: Trip) => void;
}

export function RoutePlannerView({ onSelectStop, onSelectLine, destinationRequest, onStartTrip, changes = null, onOpenAlerts, answerShown, onAnswer, onEditTrip, onShowAnswer }: RoutePlannerViewProps) {
  const t = useT();
  const lang = useLang();
  const [originQuery, setOriginQuery] = useState(DEFAULT_ORIGIN);
  const [destQuery, setDestQuery] = useState(DEFAULT_DEST);
  const [userLocation, setUserLocation] = useState<[number, number] | undefined>(undefined);
  const [isLocating, setIsLocating] = useState(false);
  /** The phone would not say where it is: told, rather than planned from somewhere else. */
  const [gpsRefused, setGpsRefused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [activeInput, setActiveInput] = useState<'origin' | 'dest' | null>(null);
  const [timeMode, setTimeMode] = useState<'now' | 'depart' | 'arrive'>('now');
  const [timeValue, setTimeValue] = useState(clockNow);
  const [showMap, setShowMap] = useState(true);
  const [recentRoutes, rememberRoute, clearRecentRoutes] = useRecentRoutes();
  // What "Borrar" took, until it is undone or a trip is planned (3.3.4): it wiped the list at a
  // tap, with no way back, and the button holding the focus went with it (2.4.3). The same
  // button says "Desfacer" now, so the focus stays where it was.
  const [cleared, setCleared] = useState<RecentRoute[]>([]);
  useEffect(() => {
    if (recentRoutes.length) setCleared((was) => (was.length ? [] : was));
  }, [recentRoutes]);
  const [{ asked, answered }, ask] = useReducer(asking, { asked: false, answered: 0 });
  const formOpen = !answerShown;
  /** The last question answered, for the row that goes back to its answer. */
  const lastTrip = useRef<Trip | null>(null);

  // Close the autocomplete when a click lands anywhere outside the two fields: on the click,
  // when the finger lifts, rather than on mousedown and touchstart (WCAG 2.5.2), and every
  // input path emits one.
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!activeInput) return;
    const onOutside = (e: Event) => {
      if (!formRef.current?.contains(e.target as Node)) setActiveInput(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveInput(null);
    };
    document.addEventListener('click', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [activeInput]);

  // Every viable way of making the trip, quickest first, plus which one is on screen.
  const [planOptions, setPlanOptions] = useState<RoutePlanResult[]>(() => underNotice(changes, new Date(), (skipsStop) => planTrips(DEFAULT_ORIGIN, DEFAULT_DEST, { lang, skipsStop })));
  /** The option the reader opened; null until they open one, and then the first row is the answer. */
  const [chosenOption, setChosenOption] = useState<number | null>(null);
  const [endpoints, setEndpoints] = useState<Endpoints>(() => ({ origin: toPoint(resolveLocationQuery(DEFAULT_ORIGIN)), destination: toPoint(resolveLocationQuery(DEFAULT_DEST)) }));
  const shownOptions = useMemo(() => planOptions.slice(0, MAX_OPTIONS), [planOptions]);

  // Focus lands on the answer column after every question: the button folds away with the form.
  // Without preventScroll the page dropped onto the map the instant the fold started. The
  // view goes to the row that says what was asked instead: it sits above the fold, so it
  // does not move while the form closes under it, and the answer rises in right below.
  // Scrolling to the answer after the fold hid that row -- 76 px, the way back to the
  // fields. From lg up the row is not rendered, and scrolling to it does nothing.
  const answerRef = useRef<HTMLDivElement>(null);
  const askedRowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!answered) return;
    answerRef.current?.focus({ preventScroll: true });
    askedRowRef.current?.scrollIntoView({ block: 'start' });
  }, [answered]);
  /** The form is mid-fold: clipping stays on until the transition ends, not a child's. */
  const [folding, setFolding] = useState(false);
  /**
   * Counts the swaps: the arrow turns half a turn for each and the two fields, keyed on it,
   * fade in with their new text. Swaps only -- counted on every question, the arrow turned
   * on "Calcular" as if the ends had been exchanged, beside a desktop form that never folds.
   */
  const [swaps, setSwaps] = useState(0);
  /** Where the button on the map jumps to. */
  const stepsRef = useRef<HTMLDivElement>(null);

  /** A clock for the one thing here that changes on its own: whether the first bus is within ten minutes. */
  const now = useClock(30_000);

  // Every walked hop of every option on offer, not only the open one, so the four are compared like for like.
  const allWalkHops = useMemo(() => {
    const seen = new Map<string, Hop>();
    for (const option of shownOptions) for (const hop of walkHopsOf(option, endpoints.origin, endpoints.destination)) seen.set(walkHopKey(hop[0], hop[1]), hop);
    return [...seen.values()];
  }, [shownOptions, endpoints]);
  const walkPaths = useWalkPaths(allWalkHops);

  /**
   * The options worth offering. "Todo a pé" is built from the straight line and ranked
   * against bus options that were never estimates, so once the router says there is no
   * pedestrian route, the walk-only option is withdrawn rather than left standing.
   */
  const offeredOptions = useMemo(
    () =>
      shownOptions
        .map((option, idx) => ({ option, idx }))
        .filter(({ option }) => {
          if (option.segments.some((segment) => segment.type === 'bus')) return true;
          // Still waiting on the router is not the same as being told there is no route.
          return walkHopsOf(option, endpoints.origin, endpoints.destination).every(([a, b]) => walkPaths[walkHopKey(a, b)] !== null);
        }),
    [shownOptions, walkPaths, endpoints],
  );

  const correction = (plan: RoutePlanResult) => correctionFor(plan, endpoints, walkPaths);
  // In the order of what each row prints once its walks are measured, and the headline is the first of them.
  const ranked = useMemo(() => rankMeasured(offeredOptions, (plan) => correctionFor(plan, endpoints, walkPaths)), [offeredOptions, endpoints, walkPaths]);
  const chosen = chosenOption ?? ranked[0]?.idx ?? 0;
  const planResult = planOptions[chosen] ?? null;
  const measuredWalk = measuredWalkFor(planResult, endpoints, walkPaths);
  const shown = planResult && withMeasuredWalk(planResult, correction(planResult));

  /** The question the plans on screen are answering — not the fields, which the reader may be retyping. */
  const askedRef = useRef({ orig: DEFAULT_ORIGIN, dest: DEFAULT_DEST, opts: {} as { userLocation?: [number, number]; departAt?: number; arriveBy?: number } });
  /** One replan per question, and no more. */
  const replannedRef = useRef(false);

  /**
   * Ask again, once, when the measured walk has already cost the reader the bus: as if they
   * set off `missedBy` minutes later, with every walk the router has traced handed back
   * keyed by the stop it leads to (moving the clock alone picked a different wrong stop).
   * Once, because the new plan may board somewhere unmeasured and a second round can oscillate.
   */
  useEffect(() => {
    if (replannedRef.current || !planResult || !shown || shown.reachable) return;
    replannedRef.current = true;
    const known = new Map<string, number>();
    for (const option of shownOptions) {
      const boarding = option.segments.find((seg) => seg.type === 'bus')?.fromStop;
      const first = walkHopsOf(option, endpoints.origin, endpoints.destination)[0];
      const path = first && walkPaths[walkHopKey(first[0], first[1])];
      if (boarding && path) known.set(boarding.id, path.minutes);
    }
    const { orig, dest, opts } = askedRef.current;
    const again = underNotice(changes, plannedFrom(opts), (skipsStop) => planTrips(orig, dest, { ...opts, lang, measuredWalkToStop: (id) => known.get(id), skipsStop }));
    if (!again.length) return; // nothing better at the later time: keep what is on screen, marked
    setPlanOptions(again);
    setChosenOption(null);
  }, [planResult, shown?.reachable, lang]);

  const timeOptions = (mode = timeMode, at = timeValue) => {
    const [h, m] = at.split(':').map(Number);
    const minutes = (h || 0) * 60 + (m || 0);
    return mode === 'depart' ? { departAt: minutes } : mode === 'arrive' ? { arriveBy: minutes } : {};
  };

  const [questions, setQuestions] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const calculatingRef = useRef(false);
  const calculate = (orig = originQuery, dest = destQuery, gps = userLocation, fold = true, inPlace = false, time = { mode: timeMode, at: timeValue }) => {
    if (!orig.trim() || !dest.trim() || calculatingRef.current) return;
    // The plan runs on this thread, and "arrive by" holds it for seconds on a slow phone
    // (5.0-6.4 s at 6x CPU), where the tap showed nothing until the answer. So the button
    // says «Calculando» in a frame of its own, and the plan starts once that frame is on
    // screen. A second tap meanwhile is the same question asked twice, and is dropped.
    calculatingRef.current = true;
    setCalculating(true);
    afterPaint(() => {
      try {
        setGpsRefused(false);
        const opts = { ...timeOptions(time.mode, time.at), userLocation: gps };
        askedRef.current = { orig, dest, opts };
        replannedRef.current = false;
        const plans = underNotice(changes, plannedFrom(opts), (skipsStop) => planTrips(orig, dest, { ...opts, lang, skipsStop }));
        setPlanOptions(plans);
        setChosenOption(null);
        setQuestions((n) => n + 1);
        if (fold) {
          setFolding(true);
          ask();
          lastTrip.current = { from: orig.trim(), to: dest.trim(), mode: time.mode, at: time.at };
          onAnswer(lastTrip.current, inPlace);
        }
        if (plans.length) rememberRoute({ from: orig.trim(), to: dest.trim() });
        setEndpoints({ origin: toPoint(resolveLocationQuery(orig, gps)), destination: toPoint(resolveLocationQuery(dest, gps)) });
        setActiveInput(null);
      } finally {
        calculatingRef.current = false;
        setCalculating(false);
      }
    });
  };

  // A reload, or a tab given back by the phone, lands on the answer it left: the question is the
  // entry's, asked again, for now if it was for now. Not from a GPS origin, which would ask for
  // the position nobody pressed for: the fields come back, and the screen is the form.
  useEffect(() => {
    if (!answerShown) return;
    const { from, to, mode, at } = answerShown;
    setOriginQuery(from);
    setDestQuery(to);
    setTimeMode(mode);
    setTimeValue(at);
    if (from === 'my_location' || to === 'my_location') onEditTrip();
    else calculate(from, to, undefined, true, false, { mode, at });
  }, []);

  // A place chosen in the search box arrives as the destination, already planned from whatever origin is set.
  useEffect(() => {
    if (!destinationRequest) return;
    setDestQuery(destinationRequest.query);
    calculate(originQuery, destinationRequest.query, userLocation, true, true);
  }, [destinationRequest?.nonce]);

  // Inverting must not fold the form under the finger that pressed it.
  const swap = () => {
    setSwaps((n) => n + 1);
    setOriginQuery(destQuery);
    setDestQuery(originQuery);
    calculate(destQuery, originQuery, userLocation, false);
  };

  /**
   * The phone's position, then a plan from it. Refused or missing, the reader is told and
   * nothing is planned: it fell back to Lugo's centre and planned from there under the label
   * "📍 Mi ubicación" -- the one thing the stops screen refuses to do with a location.
   */
  const withGps = (plan: (coords: [number, number]) => void) => {
    const refused = () => {
      setIsLocating(false);
      setGpsRefused(true);
    };
    if (!navigator.geolocation) return refused();
    setGpsRefused(false);
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        setIsLocating(false);
        plan(coords);
      },
      refused,
      { timeout: 6000 },
    );
  };
  const useGps = () =>
    withGps((coords) => {
      setOriginQuery('my_location');
      calculate('my_location', destQuery, coords);
    });

  /** The GPS origin is a token, not a name: shown as what it means wherever a place is shown. */
  const placeLabel = (query: string) => (query === 'my_location' ? `📍 ${t.map.myLocation}` : query);

  const pick = (role: 'origin' | 'dest') => (name: string) => {
    setActiveInput(null);
    if (role === 'origin') {
      setOriginQuery(name);
      calculate(name, destQuery);
    } else {
      setDestQuery(name);
      calculate(originQuery, name);
    }
  };
  const fieldFor = (role: 'origin' | 'dest', value: string) => ({
    role,
    value,
    suggestions,
    open: activeInput === role,
    onChange: (next: string) => {
      (role === 'origin' ? setOriginQuery : setDestQuery)(next);
      setSuggestions(suggestionsFor(next));
    },
    onFocus: () => {
      setActiveInput(role);
      setSuggestions(suggestionsFor(value));
    },
    onPick: pick(role),
    onLeave: () => setActiveInput((current) => (current === role ? null : current)),
    // The keyboard's key does what it says: the origin's "next" goes to the destination, the
    // destination's "go" asks, where the button may be under the keyboard.
    onEnter: () => {
      setActiveInput(null);
      if (role === 'origin') document.getElementById('input-dest-query')?.focus();
      else calculate();
    },
  });

  /** "Vou nesta": not for a walk, nor once the service is over; at headline size within ten minutes of the bus. */
  const canStart = planResult !== null && planResult.isServiceActive && planResult.segments.some((seg) => seg.type === 'bus');
  const boardingSoon = canStart && boardingIsNow(planResult, now, userLocation ? { lat: userLocation[0], lng: userLocation[1] } : null);
  const startTripButton = (prominent: boolean) => (
    <button
      type="button"
      onClick={() => planResult && onStartTrip(planResult, endpoints.origin ?? null, endpoints.destination ?? null)}
      className={`btn btn-primary w-full ${prominent ? 'anim-attention min-h-14 text-emph' : 'btn-lg'}`}
    >
      <Bus className={prominent ? 'h-5 w-5 shrink-0' : 'h-4.5 w-4.5 shrink-0'} aria-hidden="true" />
      {t.companion.start}
    </button>
  );
  const folded = asked && !formOpen;
  // Folded and unfolded by back and forward too, not only by the row: clipped while it moves.
  const wasFolded = useRef(folded);
  useEffect(() => {
    if (wasFolded.current !== folded) setFolding(true);
    wasFolded.current = folded;
  }, [folded]);

  return (
    <div className="page page-gutter py-4">
      {/* The form stays put while the itinerary scrolls beside it from lg up; below, the two take turns. */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-6">
        <div ref={formRef} className="space-y-4 lg:col-span-5 lg:sticky lg:top-4 lg:self-start">
          {/* What you asked for, in one line, and the way in and out of the fields. */}
          {asked && (
            <button
              ref={askedRowRef}
              type="button"
              onClick={() => {
                setFolding(true);
                if (!formOpen) onEditTrip();
                else if (lastTrip.current) onShowAnswer(lastTrip.current);
              }}
              aria-expanded={formOpen}
              className="flex min-h-tap w-full scroll-mt-4 flex-wrap items-center gap-x-2 text-left lg:hidden"
            >
              <Navigation className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
              {/* A floor under the route, in rem: when the text is set large there is no room for
                  both, and the link goes to the next line instead of the route shrinking to nothing.
                  Whole: held to two lines, the destination lost its end at 200 % and under a
                  reader's text spacing. */}
              <span className="min-w-floor-title flex-1 break-words text-label font-semibold text-ink">
                {placeLabel(originQuery)} → {placeLabel(destQuery)}
              </span>
              <span className="link-text shrink-0">{formOpen ? t.planner.backToAnswer : t.planner.editTrip}</span>
            </button>
          )}

          <div
            className={`fold fold-lg-open fold-clear ${folded ? 'fold-closed' : ''} ${folding ? 'fold-moving' : ''}`}
            onTransitionEnd={(e) => {
              if (e.target === e.currentTarget) setFolding(false);
            }}
          >
            {/* A bare wrapper: the row can only shrink to its item's padding and border, so the card itself as the item left a 30 px stub when folded. */}
            <div>
          <div className="card py-4 px-cap-4 sm:p-6">
            <h2 className="sr-only">{t.planner.title}</h2>
            <div className="relative">
              <div className="relative rounded-card border border-edge bg-surface">
                <PlaceField
                  key={`origin-${swaps}`}
                  id="input-origin-query"
                  {...fieldFor('origin', originQuery)}
                  display={originQuery === 'my_location' ? placeLabel(originQuery) : undefined}
                  placeholder={t.planner.placeholderOrig}
                  label={t.planner.origin}
                  trailing={{ kind: 'gps', locating: isLocating, onClick: () => useGps() }}
                />
                {/* How many rows opened, for the ear; one line for both fields so the count is announced when it changes. */}
                <span role="status" className="sr-only">
                  {activeInput && suggestions.length > 0 ? t.planner.suggestionsCount(suggestions.length) : ''}
                </span>
                <div className="mx-3.5 border-t border-line" aria-hidden="true" />
                <PlaceField
                  key={`dest-${swaps}`}
                  id="input-dest-query"
                  {...fieldFor('dest', destQuery)}
                  // A swap carries the GPS origin over here, and it read "my_location".
                  display={destQuery === 'my_location' ? placeLabel(destQuery) : undefined}
                  placeholder={t.planner.placeholderDest}
                  label={t.planner.destination}
                  trailing={destQuery ? { kind: 'clear', onClick: () => setDestQuery('') } : null}
                />
                {/* One swap for both rows, on the edge where a thumb already is. */}
                <button
                  id="btn-swap-stops"
                  onClick={swap}
                  className="absolute left-1 top-1/2 flex h-tap w-tap -translate-x-1 -translate-y-1/2 items-center justify-center rounded-pill text-ink-2 before:absolute before:h-9 before:w-9 before:rounded-pill before:border before:border-edge before:bg-bg before:shadow-hair"
                  aria-label={t.planner.swap}
                  title={t.planner.swap}
                >
                  {/* Turns with the swap, so the button shows what it just did to the fields. */}
                  <ArrowDownUp className="relative h-4 w-4 transition-transform duration-arrive ease-enter" style={{ transform: `rotate(${swaps * 180}deg)` }} />
                </button>
              </div>

              {gpsRefused && (
                <p role="alert" className="field-error mt-2">
                  {t.map.locationDenied}
                </p>
              )}

              <div className="mt-3">
                <Segmented dense options={(['now', 'depart', 'arrive'] as const).map((mode) => ({ id: mode, label: t.planner.timeModes[mode] }))} value={timeMode} onChange={setTimeMode} />
                {/* Wraps, as the board's does. At 200 % text the CI runner found this row 14 to 49 px
                    wider than the phone: the clock field's monospace face is wider on Linux than on
                    Windows, where the same row fitted and the audit saw nothing. */}
                {timeMode !== 'now' && (
                  <TimeField clock label={timeMode === 'arrive' ? t.planner.arriveByLabel : t.planner.departAtLabel} value={timeValue} onChange={setTimeValue} className="mt-2" />
                )}
              </div>

              {/* The button keeps the size of its words while «Calculando» stands over them: at 200 %
                  text "Calcular ruta" took two lines and «Calculando» one, and at the tap everything
                  under the finger moved up a line, the shortcut just tapped with it. */}
              <button onClick={() => calculate()} aria-busy={calculating} className="btn btn-primary btn-lg relative mt-2 w-full">
                <span className={`flex items-center gap-2 ${calculating ? 'invisible' : ''}`}>
                  <span>{t.planner.calculate}</span>
                  <ArrowRight className="h-4.5 w-4.5 stroke-bold" aria-hidden="true" />
                </span>
                {calculating && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    {t.planner.calculating}
                    <span className="calc-dots" aria-hidden="true">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </span>
                )}
              </button>
            </div>

            {/* Your own trips first, then everybody's. Folded with the form, and back when the form is. */}
            <div className={`mt-5 space-y-4 border-t border-line pt-4 ${folded ? 'hidden lg:block' : ''}`}>
              {(recentRoutes.length > 0 || cleared.length > 0) && (
                <div>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <SectionLabel>{t.planner.recentRoutes}</SectionLabel>
                    <button
                      type="button"
                      onClick={() => {
                        if (cleared.length) [...cleared].reverse().forEach(rememberRoute);
                        else {
                          setCleared(recentRoutes);
                          clearRecentRoutes();
                        }
                      }}
                      className="link min-w-tap justify-end"
                    >
                      {cleared.length ? t.planner.undoClear : t.stopHome.clearRecent}
                    </button>
                  </div>
                  <span role="status" className="sr-only">
                    {cleared.length ? t.planner.recentCleared : ''}
                  </span>
                  <div className="flex flex-col">
                    {recentRoutes.map((route, idx) => (
                      <button
                        key={`${route.from}>${route.to}`}
                        type="button"
                        onClick={() => {
                          setOriginQuery(route.from);
                          setDestQuery(route.to);
                          // From where you were is asked again from where you are: no position is
                          // kept, and without one the token resolves to nothing -- "no route".
                          if (route.from === 'my_location' || route.to === 'my_location') withGps((coords) => calculate(route.from, route.to, coords));
                          else calculate(route.from, route.to);
                        }}
                        className={`flex min-h-tap w-full items-center gap-2 py-1.5 text-left ${idx > 0 ? 'border-t border-t-line' : ''}`}
                      >
                        <Navigation className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                        <span className="min-w-0 flex-1 break-words text-label font-semibold text-ink">
                          {placeLabel(route.from)}
                          {/* The arrow says "to" to the eye; hidden, the two places ran together for the ear. */}
                          <span className="px-1 text-ink-3" aria-hidden="true">
                            →
                          </span>
                          <span className="sr-only">{t.planner.toSr}</span>
                          {placeLabel(route.to)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <SectionLabel className="mb-2">{t.planner.quickDestinations}</SectionLabel>
                {/* A rail on a phone, wrapping from sm: the right shape for a shortcut, where you see the one you wanted or you type. */}
                <div className="chip-rail -mx-1 snap-x px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
                  {QUICK_DESTINATIONS.map((qp) => {
                    // The chosen one is filled in, and said: the fill alone told a screen reader nothing.
                    const chosen = destQuery.includes(qp.label) || destQuery === qp.query;
                    return (
                      <ChoiceChip
                        key={qp.query}
                        on={chosen}
                        onClick={() => {
                          setDestQuery(qp.query);
                          calculate(originQuery, qp.query);
                        }}
                        className="snap-start"
                      >
                        {qp.label}
                      </ChoiceChip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
            </div>
          </div>
        </div>

        <div ref={answerRef} tabIndex={-1} className={`anim-rise space-y-4 lg:animate-none lg:col-span-7 lg:block ${folded ? '' : 'hidden'}`}>
          {planResult && shown ? (
            /* The column owns the rhythm; the blocks say nothing about spacing. */
            <div className="card space-y-4 py-4 px-cap-4 sm:p-6">
              {!planResult.isServiceActive && planResult.serviceNotice && (
                <Notice warn icon={AlertCircle}>
                  <div className="font-bold uppercase tracking-caps">{t.planner.serviceNoticeTitle}</div>
                  <div className="mt-0.5">{planResult.serviceNotice}</div>
                </Notice>
              )}

              {/* The operator's notice on the lines this trip takes: until when they run, which stops they skip (never proposed), and the traffic cuts.
                  Folded to one line above the answer, as on the board: open by day it pushed the trip 185 px down a phone. Once a line is past
                  its last printed call where the trip boards it, its end time and whose word it is come up into that line, as on the board. */}
              {(() => {
                // Two moments: the end times running now are tonight's, and the stops and cuts the trip meets are those of the night it sets off on.
                const now = new Date();
                const tonight = changesNow(changes, now);
                const onTheDay = changesNow(changes, setsOff(planResult, plannedFrom(askedRef.current.opts)));
                const used = new Set(planResult.segments.filter((seg) => seg.type === 'bus').map((seg) => seg.line?.number));
                const late = (tonight?.lines ?? [])
                  .filter((c) => used.has(c.line))
                  .flatMap((c) => {
                    const end = runsUntil(c, now);
                    const from = planResult.segments.find((seg) => seg.type === 'bus' && seg.line?.number === c.line)?.fromStop?.id;
                    return end ? [{ line: c.line, ...end, now: !!from && pastTimetable(c, from, now) }] : [];
                  });
                const stops = (onTheDay?.lines ?? []).filter((c) => used.has(c.line) && c.closed.length + c.moved.length > 0);
                const cuts = used.size > 0 && (onTheDay?.general.length ?? 0) > 0;
                const affected = [...new Set([...late.map((l) => l.line), ...stops.map((c) => c.line)])].sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
                if (!affected.length && !cuts) return null;
                const lateNow = late.filter((l) => l.now);
                const lateLater = late.filter((l) => !l.now);
                return (
                  <NoticeDisclosure
                    seeFull={onOpenAlerts && { label: t.lines.seeFullNotice, onOpen: onOpenAlerts }}
                    summary={
                      <>
                        <span className="block font-semibold">{affected.length > 0 ? t.planner.noticeOnTrip(affected) : t.arrivals.noticeGeneral}</span>
                        {lateNow.map((l) => (
                          <span key={l.line} className="mt-1 block font-semibold">
                            {t.arrivals.noticeRunsUntil(l.line, l.time, l.to)}
                          </span>
                        ))}
                        {lateNow.length > 0 && <span className="block">{t.arrivals.noticeNoDepartures}</span>}
                      </>
                    }
                  >
                    {lateLater.map((l) => (
                      <p key={l.line} className="mt-1 first:mt-0">
                        {t.arrivals.noticeRunsUntil(l.line, l.time, l.to)}
                      </p>
                    ))}
                    {lateLater.length > 0 && <p>{t.arrivals.noticeNoDepartures}</p>}
                    {stops.flatMap((c) => [
                      ...c.closed.map((s) => (
                        <p key={`closed-${c.line}-${s.stopId}`} className="mt-1 first:mt-0">
                          {c.line}: {t.lines.noticeClosedStop(stopById(s.stopId)?.name ?? s.stopId, s.instead)}
                        </p>
                      )),
                      ...c.moved.map((s) => (
                        <p key={`moved-${c.line}-${s.stopId}`} className="mt-1 first:mt-0">
                          {c.line}: {t.lines.noticeMovedStop(stopById(s.stopId)?.name ?? s.stopId, s.to)}
                        </p>
                      )),
                    ])}
                    {affected.length > 0 && cuts && <p className="mt-1 first:mt-0">{t.arrivals.noticeGeneral}</p>}
                  </NoticeDisclosure>
                );
              })()}

              {canStart && boardingSoon && startTripButton(true)}

              {/* The three numbers that answer "should I do this trip", on one baseline: how long on the left, when on the right. */}
              <div key={answered} className="anim-rise flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line pb-3">
                <Figure value={shown.durationMinutes} unit={t.common.min} />
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="sr-only">{t.planner.departureLabel}</span>
                  {/* Past the last bus the answer is another day's: said beside the clock, where the eye goes. */}
                  {!!planResult.daysAhead && <span className="text-body font-semibold text-estimated">{dayWord(lang, planResult.daysAhead)}</span>}
                  <span className="tnum text-emph font-semibold">{shown.departure}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 self-center text-ink-3" aria-hidden="true" />
                  <span className="sr-only">{t.planner.arrivalLabel}</span>
                  <span className="tnum text-emph font-semibold">~{shown.arrival}</span>
                </span>
                {/* These times are for a bus the measured walk no longer reaches, and the replan found nothing better. */}
                {!shown.reachable && (
                  <Notice warn size="inline" icon={AlertCircle}>
                    {t.planner.unreachableWalk}
                  </Notice>
                )}
              </div>

              {canStart && !boardingSoon && startTripButton(false)}

              {/* The small print, folded: worth reading once, not on the way to the thing that was asked for. */}
              <Disclosure
                chevronFirst
                summary={
                  <>
                    <span className="sr-only">{t.planner.tripInfoTitle}</span>
                    <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-mono">
                      {measuredWalk && (
                        <span className="flex flex-wrap items-baseline gap-x-1.5 text-ink">
                          <span className="sr-only">{t.planner.measuredWalkTitle}: </span>
                          <Footprints className="h-3.5 w-3.5 shrink-0 self-center text-ink-3" aria-hidden="true" />
                          <span className="whitespace-nowrap">{measuredWalk.minutes} min ·</span>
                          <span className="whitespace-nowrap">{formatKm(measuredWalk.meters)} km</span>
                        </span>
                      )}
                      {/* The ordinary fare, not the card one: a visitor pays 0,64 €. */}
                      {planResult.fare && planResult.fare.busLegs > 0 && <span className="whitespace-nowrap font-black text-ink">{planResult.fare.singleTicketEuros.toFixed(2).replace('.', ',')} €</span>}
                    </span>
                  </>
                }
              >
                <div className="px-3 pb-3">
                  {measuredWalk && (
                    <div className="mt-1 flex items-center justify-between gap-3 text-label text-ink">
                      <SectionLabel>{t.planner.measuredWalkTitle}</SectionLabel>
                      <span className="font-mono font-black">
                        {measuredWalk.minutes} min · {formatKm(measuredWalk.meters)} km
                      </span>
                    </div>
                  )}
                  <p className="mt-2 text-note text-ink-2">
                    <span className="caps-label text-ink-2">{t.planner.timeProvenanceTitle}</span> {measuredWalk ? t.planner.timeProvenanceMeasured : t.planner.timeProvenance}
                  </p>
                  {planResult.fare && planResult.fare.busLegs > 0 && (
                    <div className="mt-3 border-t border-line pt-2 text-label text-ink">
                      {/* Both fares, neither struck through: the ordinary one applies to everyone without a card. */}
                      <SectionLabel className="mb-1">{t.planner.fareTitle}</SectionLabel>
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-label text-ink">{t.planner.fareSingle}</span>
                        <span className="tnum text-body font-black text-ink">{planResult.fare.singleTicketEuros.toFixed(2).replace('.', ',')} €</span>
                      </div>
                      <div className="mt-1 flex items-baseline justify-between gap-3">
                        <span className="text-label text-ink-2">{t.planner.fareCard}</span>
                        <span className="tnum text-label font-semibold text-ink-2">{planResult.fare.citizenCardEuros.toFixed(2).replace('.', ',')} €</span>
                      </div>
                      {planResult.fare.busLegs > 1 && <span className="mt-1.5 block text-label text-estimated">{planResult.fare.transfersFree ? t.planner.fareTransferFree : t.planner.fareTransferPaid}</span>}
                    </div>
                  )}
                  {planResult.totalWaitMinutes > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-label text-ink-2">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-estimated" />
                      <span>{t.planner.includesWait(planResult.totalWaitMinutes)}</span>
                    </div>
                  )}
                </div>
              </Disclosure>

              {planOptions.length > 1 && <TripOptions options={ranked} chosen={chosen} onChoose={setChosenOption} correctionFor={correction} resetKey={questions} />}

              {/* Reading a list of streets is much harder than seeing the shape of the trip. */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-x-2 mb-2">
                  <SectionLabel icon={MapPin}>
                    {t.planner.routeMap}
                  </SectionLabel>
                  <button onClick={() => setShowMap((v) => !v)} className="link">
                    {showMap ? t.planner.hideMap : t.planner.showMap}
                  </button>
                </div>
                <div className={`fold ${showMap ? '' : 'fold-closed'}`}>
                  <div className="relative">
                    <Suspense fallback={<div className="map-placeholder h-map-card animate-waiting sm:h-map-card-sm" />}>
                      <RouteMap plan={planResult} origin={endpoints.origin} destination={endpoints.destination} walkPaths={walkPaths} className="w-full h-map-card sm:h-map-card-sm rounded-card overflow-hidden border border-edge z-0" />
                    </Suspense>
                    {/* The map ends at the fold on a phone, so the chip that says the trip is written out further down sits on it. */}
                    <button
                      type="button"
                      onClick={() => stepsRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })}
                      className="absolute left-1/2 top-0 z-map-float flex h-tap -translate-x-1/2 items-center px-2"
                    >
                      {/* One line: from the middle of the map it had half the width, and at 200% text
                          it broke into three and covered the route. */}
                      <span className="flex items-center gap-1.5 whitespace-nowrap map-glass border-accent px-3 py-1.5 text-label font-semibold text-ink shadow-raised">
                        {t.planner.stepByStepTitle}
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-accent stroke-bold" aria-hidden="true" />
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              <div ref={stepsRef} className="scroll-mt-3">
                <SectionLabel className="mb-2">{t.planner.stepByStepTitle}</SectionLabel>
                <Itinerary segments={planResult.segments} onSelectStop={onSelectStop} onSelectLine={onSelectLine} />
              </div>

              <Notice warn icon={AlertCircle}>
                {t.planner.transferFreeNotice}
              </Notice>
            </div>
          ) : (
            <EmptyState icon={AlertCircle}>
              <p className="text-body text-ink-2">{timeMode === 'arrive' ? t.planner.noArriveOption : t.planner.noRouteFound}</p>
            </EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

