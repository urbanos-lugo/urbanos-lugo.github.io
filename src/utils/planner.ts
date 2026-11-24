/**
 * The trip planner: direct rides, one transfer, walking, and the ranking between them.
 * Pure functions over the shipped dataset, no React and no DOM.
 */
import { BUS_LINES, BUS_STOPS, FARES, lineById, stopById } from '../data/transitData';
import { directionLabel } from './serviceLabels';
import { Lang, translations } from '../i18n/translations';
import { BusDirection, BusStop, BusLine, DayKind, Precision, RoutePlanResult, TripFare, TripSegment } from '../types';
import { getDistanceMeters } from './geo';
import { MINUTES_PER_DAY, buildRuns, dayKind, formatMinutes, parseTimeToMinutes, secondsOfLeg, type ScheduledRun } from './schedule';
import { LocationResolution, estimateWalk, getNearbyStops, resolveLocationQuery } from './places';
import { LineDeparture, getNextLineDeparture, nextRun, runsPassing } from './arrivals';

/** How long to allow for changing bus: two minutes on a printed connecting time, four on an interpolated one. */
export const TRANSFER_BUFFER_MIN = 2;
export const TRANSFER_BUFFER_ESTIMATED_MIN = 4;
const bufferFor = (precision: Precision | undefined) => (precision === 'published' ? TRANSFER_BUFFER_MIN : TRANSFER_BUFFER_ESTIMATED_MIN);

/** How far somebody will walk between one bus and the next: about four minutes, two streets. */
const MAX_TRANSFER_WALK_M = 300;

/** Above this a wait is worded as a departure time, not a countdown. Presentation only. */
export const LONG_WAIT_MIN = 90;

/**
 * Above this a wait stops being a connection and the transfer is not offered. Three hours,
 * because the largest published headway is 60 min; the cluster of "waits" past twelve
 * hours is the next morning rendered as the same hour. Refusing costs nothing: the direct
 * rides and the walk are always offered.
 */
const MAX_TRANSFER_WAIT_MIN = 180;

/**
 * A walk only leads when it wins clearly; a bus takes the near-ties — a walk that beats a
 * bus by a minute is a win on paper and a loss in the rain.
 */
export const WALK_MUST_BEAT_BUS_BY_MIN = 5;
/** Past this a walk stays in the list but never leads it, however bad the bus is (~5.6 km). */
export const MAX_HEADLINE_WALK_MIN = 75;

/**
 * How far to look for a stop worth walking to. Measured over 40 trips: widening past 2 km
 * buys nothing. `withinReach` refuses any approach walk longer than walking the whole way,
 * so a wide radius cannot produce silly suggestions.
 */
const MAX_BOARDING_WALK_M = 2000;
/** A walk this short is standing at the pole. */
const AT_THE_POLE_M = 50;

/** What one bus more has to earn, in minutes of the trip or of walking: a change is a second ticket and a bus that can be missed. */
const BUS_MUST_EARN_MIN = 5;

/** How far back to look for a departure that still arrives in time. */
const ARRIVE_BY_LOOKBACK_MIN = 180;
const ARRIVE_BY_STEP_MIN = 5;

/**
 * A time asked for that is more than this behind the clock is tomorrow's: at 21:00, «chegar
 * antes das 08:30» is the morning after. Read as this morning, the evening before an
 * appointment got no answer at all, and «saír ás 08:00» on a Friday night got Friday's buses
 * for a Saturday. Within the hour it is still today: a field left at the time it was opened.
 */
const ASKED_TIME_IS_TOMORROW_AFTER_MIN = 60;

/**
 * A one-stop ride is never offered: measured over 2,254 legs it costs what the walk costs
 * (1.2 min riding after 5.3 waiting, against a 5-minute walk) and is not yours to control.
 */
const isNotWorthBoarding = (stopsCount: number) => stopsCount <= 1;

/**
 * Where a stop falls in a direction, as `indexOf` answers it (the first time, on a line that
 * passes a pole twice), without walking the list: the planner asks it for every line at every
 * pair of stops it tries, thousands of times a plan.
 */
const stopIndexes = new WeakMap<BusDirection, Map<string, number>>();
function indexIn(direction: BusDirection, stopId: string): number {
  let index = stopIndexes.get(direction);
  if (!index) {
    index = new Map();
    direction.stops.forEach((id, i) => {
      if (!index!.has(id)) index!.set(id, i);
    });
    stopIndexes.set(direction, index);
  }
  return index.get(stopId) ?? -1;
}

/** Real in-vehicle time and distance between two stops of one direction, from the measured road legs. */
function rideBetween(direction: BusDirection, fromIndex: number, toIndex: number): { minutes: number; meters: number; stopsCount: number } {
  let seconds = 0;
  let meters = 0;
  for (let i = fromIndex; i < toIndex; i++) {
    seconds += secondsOfLeg(direction.legSeconds, i);
    meters += direction.legMeters?.[i] ?? 400;
  }
  return { minutes: Math.max(1, Math.round(seconds / 60)), meters: Math.round(meters), stopsCount: Math.max(1, toIndex - fromIndex) };
}

interface Boarding {
  line: BusLine;
  direction: BusDirection;
  departure: LineDeparture;
}

/**
 * Of every line serving both stops in the right order, the one that gets you there
 * soonest — a running line first. Taking `lines[0]` once picked one that had stopped.
 */
function pickBestBoarding(lang: Lang, candidateLineIds: string[], fromStopId: string, toStopId: string, readyAt: number, now: Date): Boarding | null {
  let best: (Boarding & { arrival: number }) | null = null;
  for (const lineId of candidateLineIds) {
    const line = lineById(lineId);
    if (!line) continue;
    for (const direction of line.directions) {
      const from = indexIn(direction, fromStopId);
      const to = indexIn(direction, toStopId);
      if (from === -1 || to === -1 || to <= from) continue;
      const departure = getNextLineDeparture(lang, line, direction.id, fromStopId, readyAt, now, toStopId);
      const arrival = departure.arrivalMinutes ?? departure.departureMinutes + rideBetween(direction, from, to).minutes;
      const better =
        !best ||
        (departure.isServiceActive && !best.departure.isServiceActive) ||
        (departure.isServiceActive === best.departure.isServiceActive && arrival < best.arrival);
      if (better) best = { line, direction, departure, arrival };
    }
  }
  return best;
}

/** A single ticket pays per boarding; the Tarxeta Cidadá pays once while every transfer is inside the window. */
export function fareFor(segments: TripSegment[]): TripFare {
  const boardings = segments.filter((s) => s.type === 'bus' && s.departureTime).map((s) => parseTimeToMinutes(s.departureTime!));
  const busLegs = boardings.length;
  const transferSpanMinutes = busLegs > 1 ? Math.round(boardings[busLegs - 1] - boardings[0]) : 0;
  const transfersFree = busLegs <= 1 || transferSpanMinutes <= FARES.freeTransferWindowMinutes;
  return {
    busLegs,
    transfersFree,
    transferSpanMinutes,
    singleTicketEuros: Number((busLegs * FARES.singleTicket).toFixed(2)),
    citizenCardEuros: Number(((transfersFree ? 1 : busLegs) * FARES.citizenCard).toFixed(2)),
  };
}

/** One complete option the planner is considering. */
interface Itinerary {
  arrivalMinutes: number;
  arrivalPrecision: Precision;
  segments: TripSegment[];
  totalWaitMinutes: number;
  isServiceActive: boolean;
  serviceNotice?: string;
  daysAhead: number;
}

const walkSegment = (start: number, walk: { meters: number; minutes: number }, instruction: string): TripSegment => ({
  type: 'walk',
  durationMinutes: walk.minutes,
  walkMeters: walk.meters,
  departureTime: formatMinutes(start),
  arrivalTime: formatMinutes(start + walk.minutes),
  instruction,
});

/**
 * Ride one line from `fromStop` to `toStop`, boarding no earlier than `readyAt`.
 *
 * `waitingFrom` is when the standing about begins when that is earlier than `readyAt`: at
 * a transfer `readyAt` carries the safety buffer, which decides which departure can be
 * caught but is still time spent at the pole, so the wait segment starts from it.
 */
function buildLeg(lang: Lang, candidateLineIds: string[], fromStop: BusStop, toStop: BusStop, readyAt: number, now: Date, hubLabel?: string, waitingFrom?: number): Itinerary | null {
  const option = pickBestBoarding(lang, candidateLineIds, fromStop.id, toStop.id, readyAt, now);
  if (!option) return null;
  const { line, direction, departure } = option;
  const ride = rideBetween(direction, indexIn(direction, fromStop.id), indexIn(direction, toStop.id));
  if (isNotWorthBoarding(ride.stopsCount)) return null;

  const t = translations(lang).engine;
  const segments: TripSegment[] = [];
  const waitStart = Math.min(readyAt, waitingFrom ?? readyAt);
  const waitMinutes = Math.max(0, departure.departureMinutes - waitStart);
  if (waitMinutes > 0) {
    segments.push({
      type: 'wait',
      fromStop,
      durationMinutes: waitMinutes,
      departureTime: formatMinutes(waitStart),
      arrivalTime: formatMinutes(departure.departureMinutes),
      instruction: hubLabel ? t.transferAt(fromStop.name, line.number) : t.waitAt(fromStop.name, line.number, direction.destination),
    });
  }

  const boardTime = departure.departureMinutes;
  const arriveTime = departure.arrivalMinutes ?? boardTime + ride.minutes;
  const arrivalPrecision = departure.arrivalPrecision ?? 'estimated';
  segments.push({
    type: 'bus',
    line,
    directionId: direction.id,
    precision: departure.precision,
    arrivalPrecision,
    fromStop,
    toStop,
    // Read off the printed ends, so the duration and the two times beside it agree; where
    // the timetable puts two stops in the same minute the leg is allowed to say 0.
    durationMinutes: Math.round(arriveTime) - Math.round(boardTime),
    stopsCount: ride.stopsCount,
    departureTime: formatMinutes(boardTime),
    arrivalTime: formatMinutes(arriveTime),
    instruction: t.board(line.number, directionLabel(direction, lang), formatMinutes(boardTime), toStop.name, ride.stopsCount, (ride.meters / 1000).toFixed(1), formatMinutes(arriveTime)),
  });

  return { arrivalMinutes: arriveTime, arrivalPrecision, segments, totalWaitMinutes: waitMinutes, isServiceActive: departure.isServiceActive, serviceNotice: departure.serviceNotice, daysAhead: departure.daysAhead };
}

/** What stands a short walk from a stop depends on the network alone: worked out once. Keyed by stop, so it cannot outgrow the 417. */
const nearbyCache = new Map<string, [BusStop, number][]>();

/** The other poles within a transfer's walk of `stop`, in dataset order, with the metres. */
function polesWithinWalk(stop: BusStop): [BusStop, number][] {
  const known = nearbyCache.get(stop.id);
  if (known) return known;
  const out: [BusStop, number][] = [];
  for (const other of BUS_STOPS) {
    if (other.id === stop.id) continue;
    const metres = getDistanceMeters(stop.lat, stop.lng, other.lat, other.lng);
    if (metres <= MAX_TRANSFER_WALK_M) out.push([other, metres]);
  }
  nearbyCache.set(stop.id, out);
  return out;
}

/** Chain two legs through one interchange, allowing time to change platform. */
function buildTransfer(lang: Lang, { change: { first: line, second: next, from, to, hubIn, hubOut, walk }, boardAt }: TimedChange, readyAt: number, now: Date): Itinerary | null {
  const first = buildLeg(lang, [line.line.id], from.stop, hubIn, boardAt, now, undefined, readyAt);
  if (!first) return null;

  // Getting off at one pole and on at another a couple of streets away is how half the
  // network connects; requiring one shared pole walked people 700 m to a different line.
  const change = hubIn.id === hubOut.id ? [] : [walkSegment(first.arrivalMinutes, walk, translations(lang).engine.walkToStop(hubIn.name, hubOut.name, hubOut.code))];
  const freeAt = first.arrivalMinutes + walk.minutes;

  const second = buildLeg(lang, [next.line.id], hubOut, to.stop, freeAt + bufferFor(first.arrivalPrecision), now, hubOut.name, freeAt);
  if (!second) return null;

  return {
    arrivalMinutes: second.arrivalMinutes,
    arrivalPrecision: second.arrivalPrecision,
    segments: [...first.segments, ...change, ...second.segments],
    totalWaitMinutes: first.totalWaitMinutes + second.totalWaitMinutes,
    isServiceActive: first.isServiceActive && second.isServiceActive,
    serviceNotice: first.serviceNotice || second.serviceNotice,
    // The trip starts on the first leg's day; a change that waits overnight was refused before it was drawn.
    daysAhead: first.daysAhead,
  };
}

export interface PlanOptions {
  /** Which language the itinerary sentences come back in. */
  lang?: Lang;
  userLocation?: [number, number];
  now?: Date;
  /** Leave at this time instead of now, in minutes from midnight. */
  departAt?: number;
  /** Be there by this time: the LATEST departure that still makes it. */
  arriveBy?: number;
  /**
   * The walk to a stop as the pedestrian router measured it, minutes from the origin, or
   * undefined for a stop nobody has measured. Every other walk is the straight line times
   * 1.35, which is good enough to build a plan from and bad to promise a bus on.
   */
  measuredWalkToStop?: (stopId: string) => number | undefined;
  /**
   * A stop a line does not call at today, by the operator's notice («Se suprime la parada de
   * Praza de Bretaña» for the 1.2 and the 1.4 on San Froilán): never boarded or left there.
   */
  skipsStop?: Skips;
}

type Skips = (lineId: string, stopId: string) => boolean;
const NOTHING_SKIPPED: Skips = () => false;

/** The moment a question is planned from, on `now`'s day: now, or the time asked to leave. */
export function plannedFrom(now: Date, departAt?: number): Date {
  const at = new Date(now);
  if (departAt !== undefined) at.setHours(Math.floor(departAt / 60), Math.round(departAt % 60), 0, 0);
  return at;
}

/** Every distinct way of making the trip, quickest first. */
export function planTrips(fromQuery: string, toQuery: string, options: PlanOptions = {}): RoutePlanResult[] {
  const { userLocation, now = new Date(), lang = 'gl', measuredWalkToStop, skipsStop = NOTHING_SKIPPED } = options;
  const asked = options.arriveBy ?? options.departAt;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const tomorrow = asked !== undefined && asked < nowMinutes - ASKED_TIME_IS_TOMORROW_AFTER_MIN;
  const day = new Date(now);
  if (tomorrow) {
    day.setDate(day.getDate() + 1);
    day.setHours(0, 0, 0, 0);
  }
  const question = ask(lang, fromQuery, toQuery, userLocation, dayKind(day), skipsStop, measuredWalkToStop);
  // One of the two places is not in the dataset: no itinerary beats one from somewhere else.
  if (!question) return [];
  const found =
    options.arriveBy !== undefined
      ? planArrivingBy(lang, question, options.arriveBy, day, tomorrow ? nowMinutes - MINUTES_PER_DAY : nowMinutes)
      : planDeparting(lang, question, plannedFrom(day, options.departAt));
  const plans = found.filter((plan) => !found.some((simpler) => makesNeedless(simpler, plan)));
  if (!tomorrow) return plans;
  // That day's buses answer it, as they always have «chegar antes das»: one that does not run
  // then carries a notice worded from that day, "non presta servizo hoxe", read the day before.
  // And a plan's day is counted from now, as every day the app prints is.
  return plans.filter((plan) => plan.isServiceActive).map((plan) => ({ ...plan, daysAhead: (plan.daysAhead ?? 0) + 1 }));
}

/** A question with its two places found and its boarding stops chosen: none of that depends on the clock. */
interface Question {
  fromRes: LocationResolution;
  toRes: LocationResolution;
  /** Each line's own way there, with no change. */
  rides: { lineId: string; from: BoardingCandidate; to: BoardingCandidate }[];
  /** Every change there is, by the line it starts on and the pole that is boarded at. */
  changes: { first: Way; i: number; from: BoardingCandidate; onto: Change[] }[];
}

/** A line one way, and for a bus of it at each stop, by their place in its list, where best to have boarded it and where best to get off; -1 where there is nowhere. */
interface Way {
  line: BusLine;
  /** Which of the line's ways it is. */
  index: number;
  /** When its first run of the day is at each stop; every other run keeps its gaps. */
  at: number[];
  on: number[];
  off: number[];
}

/** One bus and another: off the first at its stop `j`, on the second at its stop `k`, off that at its stop `m`. */
interface Change {
  first: Way;
  second: Way;
  from: BoardingCandidate;
  to: BoardingCandidate;
  hubIn: BusStop;
  hubOut: BusStop;
  j: number;
  k: number;
  m: number;
  walk: { meters: number; minutes: number };
}

function ask(lang: Lang, fromQuery: string, toQuery: string, userLocation: [number, number] | undefined, day: DayKind, skips: Skips, measuredWalkToStop?: PlanOptions['measuredWalkToStop']): Question | null {
  const fromRes = resolveLocationQuery(fromQuery, userLocation, lang);
  const toRes = resolveLocationQuery(toQuery, userLocation, lang);
  if (!fromRes || !toRes) return null;
  // Never walk further to reach the bus than to reach the destination: the walk-only option's length.
  const wholeWalk = estimateWalk(getDistanceMeters(fromRes.lat, fromRes.lng, toRes.lat, toRes.lng)).minutes;
  const [near, far] = [withinReach(fromRes, wholeWalk, measuredWalkToStop), withinReach(toRes, wholeWalk)];
  return { fromRes, toRes, ...waysThere(near, far, day, skips) };
}

const journeyKey = (plan: RoutePlanResult, by: (seg: TripSegment) => string | undefined) =>
  plan.segments.filter((seg) => seg.type === 'bus').map(by).join('>');

/** Whether two plans of one journey set off on the same bus: at the same pole, or at two of its poles and off it at the same one. */
function sameFirstBus(a: RoutePlanResult, b: RoutePlanResult): boolean {
  const [x, y] = [a, b].map((plan) => plan.segments.find((seg) => seg.type === 'bus'));
  if (!x || !y) return false;
  return (x.fromStop?.id === y.fromStop?.id && x.departureTime === y.departureTime) || (x.toStop?.id === y.toStop?.id && x.arrivalTime === y.arrivalTime);
}

/**
 * Walk departure times backwards from the deadline; each probe is a normal forward plan of
 * the same question, found and chosen once rather than once a probe: thirty-seven probes
 * were thirty-seven searches of the place names and seventy-four rankings of every pole.
 * `from` is now in minutes of `day`, the deadline's: negative when that is tomorrow, so that
 * a deadline just after midnight can be left for before it.
 */
function planArrivingBy(lang: Lang, question: Question, arriveBy: number, day: Date, from: number): RoutePlanResult[] {
  const earliest = Math.max(from, arriveBy - ARRIVE_BY_LOOKBACK_MIN);
  // The latest departure per journey that still arrives in time.
  const byJourney = new Map<string, RoutePlanResult>();
  for (let depart = earliest; depart <= arriveBy; depart += ARRIVE_BY_STEP_MIN) {
    const at = new Date(day);
    at.setHours(0, depart, 0, 0);
    for (const plan of planDeparting(lang, question, at)) {
      // In minutes and not by the clock's text: a walk ending at 00:30 read as before 23:50.
      const leaves = depart + plan.slackMinutes;
      if (!plan.isServiceActive || leaves + plan.durationMinutes > arriveBy) continue;
      const key = journeyKey(plan, (seg) => `${seg.line?.id}/${seg.directionId}`);
      // Asked for too late to wait for it at the pole, a bus is run for, and the answer before
      // still waits for it: the last answer was kept, short of the margin 432 times in 580, and
      // a walk measured one minute longer left the bus out as missed.
      const kept = byJourney.get(key);
      if (kept && !plan.slackMinutes && sameFirstBus(kept, plan)) continue;
      byJourney.set(key, { ...plan, arriveBy, slackMinutes: leaves - earliest, daysAhead: (plan.daysAhead ?? 0) + Math.floor(leaves / MINUTES_PER_DAY) });
    }
  }
  return [...byJourney.values()].sort(byRank);
}

function planDeparting(lang: Lang, { fromRes, toRes, rides, changes }: Question, now: Date): RoutePlanResult[] {
  const onFoot = walkingOnlyPlan(lang, fromRes, toRes, now);
  const all = [
    onFoot,
    ...rides.map(({ lineId, from, to }) => planBetweenStops(lang, fromRes, toRes, from, to, now, (readyAt) => buildLeg(lang, [lineId], from.stop, to.stop, readyAt, now))),
    ...bestChanges(changes, now).map((timed) => planBetweenStops(lang, fromRes, toRes, timed.change.from, timed.change.to, now, (readyAt) => buildTransfer(lang, timed, readyAt, now))),
  ].filter((plan): plan is RoutePlanResult => plan !== null);

  // Two itineraries wearing the same badges are one journey to a passenger: keep the quickest.
  const byJourney = new Map<string, RoutePlanResult>();
  for (const plan of all) {
    const key = journeyKey(plan, (seg) => seg.line?.number) || 'walk';
    const current = byJourney.get(key);
    if (!current || isBetterPlan(plan, current)) byJourney.set(key, plan);
  }
  return [...byJourney.values()].sort(byRank);
}

const isWalkOnly = (p: RoutePlanResult) => !p.segments.some((seg) => seg.type === 'bus');
const busLegCount = (p: RoutePlanResult) => p.segments.filter((s) => s.type === 'bus').length;
const walkMinutes = (p: RoutePlanResult) => p.segments.reduce((sum, seg) => sum + (seg.type === 'walk' ? seg.durationMinutes : 0), 0);
/**
 * What a plan costs, in minutes: until it puts you there, counted from the moment the question
 * was asked; or, asked to be there by a time, how long before it you have to set off.
 */
const costOf = (p: RoutePlanResult): number =>
  p.arriveBy === undefined ? p.slackMinutes + p.durationMinutes : (p.arriveBy - parseTimeToMinutes(p.departureTime) + MINUTES_PER_DAY) % MINUTES_PER_DAY;

/**
 * A running service first, then whichever arrives sooner, or leaves later when the question is
 * to be there by a time — except that a long walk never leads.
 */
export function isBetterPlan(a: RoutePlanResult, b: RoutePlanResult): boolean {
  if (a.isServiceActive !== b.isServiceActive) return a.isServiceActive;
  if (isWalkOnly(a) !== isWalkOnly(b)) {
    const walk = isWalkOnly(a) ? a : b;
    const bus = isWalkOnly(a) ? b : a;
    const walkWins = walk.durationMinutes <= MAX_HEADLINE_WALK_MIN && costOf(walk) + WALK_MUST_BEAT_BUS_BY_MIN <= costOf(bus);
    return isWalkOnly(a) ? walkWins : !walkWins;
  }
  if (costOf(a) !== costOf(b)) return costOf(a) < costOf(b);
  // Same arrival, or same departure: less time on the way is strictly better than waiting at the pole.
  if (a.durationMinutes !== b.durationMinutes) return a.durationMinutes < b.durationMinutes;
  // Still level: the simpler trip. A change you do not need is still a change you can miss.
  return busLegCount(a) < busLegCount(b);
}

/** Best first. Equal is said as equal: a comparator that never answers 0 leaves the order to the engine. */
export const byRank = (a: RoutePlanResult, b: RoutePlanResult): number => (isBetterPlan(a, b) ? -1 : isBetterPlan(b, a) ? 1 : 0);

/**
 * Whether a trip with fewer buses does about as well, so that the others are not worth it: no bus
 * for two minutes that saves neither time nor walking, and no change of one for as little. Not
 * a matter of rank: the soonest there still leads, among the trips that make sense.
 */
const makesNeedless = (simpler: RoutePlanResult, plan: RoutePlanResult): boolean =>
  simpler.isServiceActive &&
  busLegCount(simpler) < busLegCount(plan) &&
  costOf(simpler) - costOf(plan) < BUS_MUST_EARN_MIN &&
  walkMinutes(simpler) - walkMinutes(plan) < BUS_MUST_EARN_MIN;

interface BoardingCandidate {
  stop: BusStop;
  walkMeters: number;
  walkMinutes: number;
}

/** The poles there are reasons to walk to, nearest first. */
function withinReach(res: LocationResolution, directWalkMinutes: number, measured?: PlanOptions['measuredWalkToStop']): BoardingCandidate[] {
  return (
    getNearbyStops(res.lat, res.lng)
      // A measured walk replaces the estimate before anything is filtered or ranked on it.
      .map((stop) => ({ stop, walkMeters: stop.walkMeters, walkMinutes: stop.walkMeters > AT_THE_POLE_M ? (measured?.(stop.id) ?? stop.walkMinutes) : 0 }))
      // Never walk further to reach the bus than to reach the destination.
      .filter(({ stop, walkMeters, walkMinutes }) => stop.lines.length > 0 && walkMeters <= MAX_BOARDING_WALK_M && walkMinutes < directWalkMinutes)
  );
}

/** A network of ways does not change under a session: which call at a stop, and where in their lists, is worked out once. */
const callsCache = new Map<string, [line: BusLine, way: number, at: number][]>();
function callsOf(stopId: string): [line: BusLine, way: number, at: number][] {
  let calls = callsCache.get(stopId);
  if (!calls) {
    calls = BUS_LINES.flatMap((line) => line.directions.map((direction, way): [BusLine, number, number] => [line, way, indexIn(direction, stopId)])).filter(([, , at]) => at >= 0);
    callsCache.set(stopId, calls);
  }
  return calls;
}

/**
 * Every way of riding there, found and not guessed at. For a bus at any of its stops there is one
 * pole it is best to be on it from, the one that can be set off for latest, whatever the hour, its
 * runs all keeping the same gaps; and one it is best to get off at. So each line's own ride is the
 * best there is of it, and each pair of lines meets wherever they do.
 *
 * Until November 2026 the poles were chosen at each end apart, the nearest of each line: often the
 * one across the street, going the other way. From Fonte dos Ranchos to As Termas none of the
 * five lines that go was offered whole, but a minute the wrong way on one to change to another;
 * one answer in six got there five minutes or more after it could.
 */
function waysThere(near: BoardingCandidate[], far: BoardingCandidate[], day: DayKind, skips: Skips): Pick<Question, 'rides' | 'changes'> {
  const [ons, offs] = [near, far].map((poles) => new Map(poles.map((pole) => [pole.stop.id, pole])));
  const ways = new Map<BusLine, Way[]>();
  const rides: Question['rides'] = [];
  for (const line of BUS_LINES) {
    ways.set(line, line.directions.map(({ stops }, index): Way => {
      const at = minutesAlong(line, index, day) ?? [];
      const pole = (poles: Map<string, BoardingCandidate>, i: number) => (at.length && stops[i] && !skips(line.id, stops[i]) ? poles.get(stops[i]) : undefined);
      const on: number[] = [];
      const off: number[] = [];
      let best = -1;
      let ride = { minutes: Infinity, i: -1, j: -1 };
      stops.forEach((_, j) => {
        const from = pole(ons, j - 2);
        if (from && (best < 0 || at[j - 2] - from.walkMinutes > at[best] - ons.get(stops[best])!.walkMinutes)) best = j - 2;
        on[j] = best;
        const to = pole(offs, j);
        if (!to || best < 0) return;
        const minutes = ons.get(stops[best])!.walkMinutes + at[j] - at[best] + to.walkMinutes;
        if (minutes < ride.minutes) ride = { minutes, i: best, j };
      });
      if (ride.i >= 0) rides.push({ lineId: line.id, from: ons.get(stops[ride.i])!, to: offs.get(stops[ride.j])! });
      best = -1;
      for (let k = stops.length - 1; k >= 0; k--) {
        const to = pole(offs, k + 2);
        if (to && (best < 0 || at[k + 2] + to.walkMinutes < at[best] + offs.get(stops[best])!.walkMinutes)) best = k + 2;
        off[k] = best;
      }
      return { line, index, at, on, off };
    }));
  }

  const changes: Question['changes'] = [];
  for (const first of [...ways.values()].flat()) {
    const { stops } = first.line.directions[first.index];
    const boarded = new Map<number, { from: BoardingCandidate; onto: Map<string, Change & { need: number }> }>();
    const printed = buildRuns(first.line, first.index, BUS_STOPS, day)[0]?.publishedStopIndices ?? [];
    stops.forEach((id, j) => {
      const i = first.on[j];
      if (i < 0 || skips(first.line.id, id)) return;
      const from = ons.get(stops[i])!;
      let leg = boarded.get(i);
      if (!leg) boarded.set(i, (leg = { from, onto: new Map() }));
      const hubIn = stopById(id)!;
      for (const [hubOut, metres] of [[hubIn, 0] as [BusStop, number], ...polesWithinWalk(hubIn)]) {
        const walk = metres ? estimateWalk(metres) : { meters: 0, minutes: 0 };
        for (const [line, way, k] of callsOf(hubOut.id)) {
          // Getting off a bus to wait for the same line is never the answer ("5.1 -> 5.1").
          if (line === first.line || skips(line.id, hubOut.id)) continue;
          const second = ways.get(line)![way];
          const m = second.off[k];
          if (m < 0) continue;
          // Side by side with the other line for a mile, one place to change catches whatever any does: where
          // the second bus may have set off earliest. Of those at one pole, and of those with a walk.
          const need = first.at[j] + walk.minutes + bufferFor(printed.includes(j) ? 'published' : 'estimated') - second.at[k];
          const key = `${line.id}/${way}/${m}/${metres > 0}`;
          const known = leg.onto.get(key);
          if (!known || need < known.need) leg.onto.set(key, { first, second, from, to: offs.get(line.directions[way].stops[m])!, hubIn, hubOut, j, k, m, walk, need });
        }
      }
    });
    for (const [i, { from, onto }] of boarded) changes.push({ first, i, from, onto: [...onto.values()] });
  }
  return { rides, changes };
}

/** A change at an hour: the run it starts on is the one at the pole then. */
interface TimedChange {
  change: Change;
  boardAt: number;
}

/** Of every change there is, the best of each pair of lines at this hour: running, sooner there, set off for later, and less of a walk between the two. */
function bestChanges(changes: Question['changes'], now: Date): TimedChange[] {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const best = new Map<string, TimedChange & { days: number; arrives: number; leaves: number }>();
  for (const { first, i, from, onto } of changes) {
    const ride = nextRun(first.line, first.index, i, nowMinutes + from.walkMinutes, now);
    if (!ride.run) continue;
    const start = ride.day * MINUTES_PER_DAY;
    const day = new Date(now);
    day.setDate(day.getDate() + ride.day);
    const runs = runsPassing(first.line, first.index, dayKind(day), i);
    const soonest = runs.indexOf(ride.run);
    for (const change of onto) {
      const { second, j, k, m, to, walk } = change;
      const freeFrom = (run: ScheduledRun) => Math.round(run.minutesByStopIndex[j] + start) + walk.minutes;
      const readyFrom = (run: ScheduledRun) => freeFrom(run) + bufferFor(run.publishedStopIndices.includes(j) ? 'published' : 'estimated');
      const next = nextRun(second.line, second.index, k, readyFrom(ride.run), now);
      if (!next.run) continue;
      const offset = next.day * MINUTES_PER_DAY;
      const leaves = next.run.minutesByStopIndex[k] + offset;
      // The last run that still makes it, and not the first: where the second bus passes three times a
      // day, the first one was taken hours early, and the change refused for the wait it made.
      let at = soonest;
      while (at + 1 < runs.length && readyFrom(runs[at + 1]) <= leaves) at++;
      const run = runs[at];
      // A connection you would have to sleep through is not a connection: past the last bus
      // "the next departure" is tomorrow morning, rendered as the same hour.
      if (leaves - freeFrom(run) > MAX_TRANSFER_WAIT_MIN) continue;
      const boardAt = run.minutesByStopIndex[i] + start;
      const found = { change, boardAt, days: next.day, arrives: Math.round(next.run.minutesByStopIndex[m] + offset) + to.walkMinutes, leaves: Math.round(boardAt) - from.walkMinutes };
      const key = `${first.line.number}>${second.line.number}`;
      const kept = best.get(key);
      const order = kept ? Math.sign(found.days - kept.days) || found.arrives - kept.arrives || kept.leaves - found.leaves || walk.minutes - kept.change.walk.minutes : -1;
      if (order < 0) best.set(key, found);
    }
  }
  return [...best.values()];
}

/** When a way's first run of the day is at each stop; every other run keeps its gaps. Another day's, when it does not run that day. */
function minutesAlong(line: BusLine, way: number, day: DayKind): number[] | undefined {
  const kinds: DayKind[] = [day, 'laborable', 'sabado', 'domingo'];
  for (const kind of kinds) {
    const [run] = buildRuns(line, way, BUS_STOPS, kind);
    if (run) return run.minutesByStopIndex;
  }
}

/** Just walking the whole way. Always offered; it only leads when it deserves to. */
function walkingOnlyPlan(lang: Lang, fromRes: LocationResolution, toRes: LocationResolution, now: Date): RoutePlanResult {
  const walk = estimateWalk(getDistanceMeters(fromRes.lat, fromRes.lng, toRes.lat, toRes.lng));
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return {
    durationMinutes: walk.minutes,
    fare: { busLegs: 0, transfersFree: true, transferSpanMinutes: 0, singleTicketEuros: 0, citizenCardEuros: 0 },
    departureTime: formatMinutes(nowMinutes),
    arrivalTime: formatMinutes(nowMinutes + walk.minutes),
    slackMinutes: 0,
    totalWaitMinutes: 0,
    isServiceActive: true,
    walkToStartMeters: 0,
    walkFromEndMeters: 0,
    segments: [walkSegment(nowMinutes, walk, translations(lang).engine.walkWholeWay(fromRes.name, toRes.name))],
  };
}

/** One plan whole: the walk to the pole, what is ridden from it and the walk after; null when nothing is. */
function planBetweenStops(lang: Lang, fromRes: LocationResolution, toRes: LocationResolution, from: BoardingCandidate, to: BoardingCandidate, now: Date, between: (readyAt: number) => Itinerary | null): RoutePlanResult | null {
  const startStop = from.stop;
  const t = translations(lang).engine;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // 1. Walk to the boarding stop.
  const leadIn: TripSegment[] = [];
  let cursor = nowMinutes;
  if (from.walkMinutes > 0) {
    leadIn.push(walkSegment(cursor, { meters: from.walkMeters, minutes: from.walkMinutes }, t.walkToStop(fromRes.name, startStop.name, startStop.code)));
    cursor += from.walkMinutes;
  }

  // 2. The ride, or the two of them. All are ranked together, whichever gets there first: taking the
  //    direct line unconditionally once proposed a four-hour wait on a 3-a-day line.
  const option = between(cursor);
  if (!option) return null;

  const segments = [...leadIn, ...option.segments];
  let end = option.arrivalMinutes;

  // Standing at the pole is not part of the trip: the departure slides forward until
  // only the margin is left, so the answer is "leave at 09:19", not "leave now and wait".
  // Nothing about the bus moves, and the plan still prints exactly one departure time.
  const firstBusAt = segments.findIndex((seg) => seg.type === 'bus');
  const waitAt = firstBusAt - 1;
  let slack = 0;
  if (firstBusAt > 0 && segments[waitAt].type === 'wait') {
    slack = Math.max(0, segments[waitAt].durationMinutes - bufferFor(segments[firstBusAt].precision));
  }
  if (slack > 0) {
    const later = (time: string | undefined) => (time ? formatMinutes(parseTimeToMinutes(time) + slack) : time);
    // Shared with every option built from the same lead-in, so replaced rather than edited.
    for (let i = 0; i < firstBusAt; i++) {
      const seg = segments[i];
      if (seg.type === 'bus') continue; // none before the first bus; this says so to the type
      const isWait = seg.type === 'wait';
      segments[i] = {
        ...seg,
        durationMinutes: isWait ? seg.durationMinutes - slack : seg.durationMinutes,
        departureTime: later(seg.departureTime),
        arrivalTime: isWait ? seg.arrivalTime : later(seg.arrivalTime),
      };
    }
    if (segments[waitAt].durationMinutes <= 0) segments.splice(waitAt, 1);
  }

  // 3. Walk from the alighting stop to the destination.
  if (to.walkMinutes > 0) {
    segments.push(walkSegment(end, { meters: to.walkMeters, minutes: to.walkMinutes }, t.walkToDestination(toRes.name)));
    end += to.walkMinutes;
  }

  return {
    durationMinutes: Math.round(end - nowMinutes - slack),
    fare: fareFor(segments),
    departureTime: formatMinutes(nowMinutes + slack),
    arrivalTime: formatMinutes(end),
    slackMinutes: slack,
    totalWaitMinutes: option.totalWaitMinutes - slack,
    isServiceActive: option.isServiceActive,
    serviceNotice: option.serviceNotice,
    daysAhead: option.daysAhead,
    walkToStartMeters: from.walkMeters,
    walkFromEndMeters: to.walkMeters,
    segments,
  };
}
