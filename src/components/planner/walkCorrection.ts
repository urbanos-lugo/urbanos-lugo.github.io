import type { RoutePlanResult } from '../../types';
import { MINUTES_PER_DAY, formatMinutes, parseTimeToMinutes } from '../../utils/schedule';
import { estimateWalk } from '../../utils/places';
import { byRank } from '../../utils/planner';
import { getDistanceMeters } from '../../utils/geo';
import { WalkingPath, WalkPaths, hopFromOrigin, walkHopKey, walkHopsOf } from '../../services/walkingPath';

export type Point = { lat: number; lng: number; name: string };
export interface Endpoints {
  origin?: Point;
  destination?: Point;
}

/** Move an "HH:MM" label by a signed number of minutes, wrapping past midnight. */
export const shiftClock = (hhmm: string, deltaMinutes: number): string => (deltaMinutes ? formatMinutes(parseTimeToMinutes(hhmm) + deltaMinutes) : hhmm);

/**
 * How far out the estimated walk was, split by whether it can cost you the bus: `before`
 * is the walk to the first stop, `after` the one at the far end. Either can be negative.
 * `change` is how many minutes a walk between two buses, measured, runs past the second.
 */
export interface WalkCorrection {
  before: number;
  after: number;
  change?: number;
}

export const NO_CORRECTION: WalkCorrection = { before: 0, after: 0 };

/**
 * The plan, once the router has said how long the walk really is. The bus leaves when
 * it leaves: a longer walk delays *you*, and the only thing it can eat is the cushion the
 * plan handed back as a later departure (`slackMinutes`). Past the cushion the departure
 * would be before now — the bus is gone — so the arrival is left alone and the option
 * says so (`reachable: false`). A shorter walk sets off later and lands at the same minute.
 * A walk at the far end can put it past the time it was asked to be there by: `lateBy`.
 */
export function withMeasuredWalk(plan: RoutePlanResult, fix: WalkCorrection) {
  const absorbed = Math.min(fix.before, plan.slackMinutes);
  const missedBy = fix.before - absorbed;
  const arrival = shiftClock(plan.arrivalTime, fix.after);
  // The short way round the clock: 00:02 is twelve minutes past 23:50.
  const past = plan.arriveBy === undefined ? 0 : ((parseTimeToMinutes(arrival) - plan.arriveBy + 1.5 * MINUTES_PER_DAY) % MINUTES_PER_DAY) - MINUTES_PER_DAY / 2;
  return {
    reachable: missedBy <= 0 && !fix.change,
    missedBy,
    lateBy: Math.max(0, past),
    departure: shiftClock(plan.departureTime, -absorbed),
    // The day goes with the clock: a walk for 00:00 set off on at 23:58 is tonight's.
    daysAhead: (plan.daysAhead ?? 0) + Math.floor((parseTimeToMinutes(plan.departureTime) - absorbed) / MINUTES_PER_DAY),
    arrival,
    durationMinutes: plan.durationMinutes + absorbed + fix.after,
    slackMinutes: plan.slackMinutes - absorbed,
  };
}

/** Whether a plan still answers the question once its walks are measured: its bus caught, and there by the time asked. */
export const answers = ({ reachable, lateBy }: Pick<ReturnType<typeof withMeasuredWalk>, 'reachable' | 'lateBy'>): boolean => reachable && !lateBy;

/**
 * The options in the order of what each row says. The planner ranks on the estimated walks;
 * a row prints the measured one, and a longer walk at the far end pushed an arrival past the
 * next row's without moving it: "12, 52 min, ~10:54" headed "1.2, 22 min, ~10:51". So the
 * planner's own rule is applied again to the measured figures, and until a walk is measured
 * nothing moves. A bus the measured walk cannot catch, or one that gets there after the time
 * asked, goes last, and the list (TripOptions) leaves it out unless it is the one open.
 */
export function rankMeasured<T extends { option: RoutePlanResult; idx: number }>(options: T[], fixFor: (plan: RoutePlanResult) => WalkCorrection): T[] {
  const measured = new Map(
    options.map(({ option, idx }) => {
      const shown = withMeasuredWalk(option, fixFor(option));
      return [idx, { answers: answers(shown), plan: { ...option, departureTime: shown.departure, slackMinutes: shown.slackMinutes, durationMinutes: shown.durationMinutes } }];
    }),
  );
  return [...options].sort((a, b) => {
    const x = measured.get(a.idx)!;
    const y = measured.get(b.idx)!;
    if (x.answers !== y.answers) return x.answers ? -1 : 1;
    return byRank(x.plan, y.plan) || a.idx - b.idx;
  });
}

/**
 * The difference between the estimated and the measured walk for a plan, all or nothing
 * (half-measured totals would be neither the estimate nor the truth). Measured against
 * `estimateWalk` on each hop rather than the plan's walk segments: a hop of a street's width
 * has none. The hop set off on is the only one taken before boarding; a plan with no bus has
 * nothing to miss, so it is all `after`, unless it is asked to be there by a time: then a longer
 * walk is set off on sooner, as far as there is time to. The walk between two buses moves no
 * arrival, the second leaving when it leaves: it makes that bus or it does not. From the
 * bus's own pole there is no such hop: read as the first one walked, the walk at the far end
 * put 64 of 465 buses out of reach of somebody standing at them.
 */
export function correctionFor(plan: RoutePlanResult | null, endpoints: Endpoints, walkPaths: WalkPaths): WalkCorrection {
  if (!plan) return NO_CORRECTION;
  const hops = walkHopsOf(plan, endpoints.origin, endpoints.destination);
  const measured = hops.map(([a, b]) => walkPaths[walkHopKey(a, b)]);
  if (!hops.length || measured.some((w) => !w)) return NO_CORRECTION;

  const buses = plan.segments.filter((s) => s.type === 'bus');
  // Once a measured walk has been handed back to `planTrips`, the plan is already built on it.
  const planned = plan.segments[0]?.type === 'walk' ? plan.segments[0].durationMinutes : undefined;
  const setOff = hopFromOrigin(hops, endpoints.origin);
  let before = 0;
  let after = 0;
  hops.forEach((hop, i) => {
    const [a, b] = hop;
    const estimate = hop === setOff && planned !== undefined ? planned : estimateWalk(getDistanceMeters(a[0], a[1], b[0], b[1])).minutes;
    const diff = (measured[i] as WalkingPath).minutes - estimate;
    if (hop === setOff && buses.length) before = diff;
    else if (hop === setOff && plan.arriveBy !== undefined) [before, after] = [Math.min(diff, plan.slackMinutes), Math.max(0, diff - plan.slackMinutes)];
    else if (b[0] === endpoints.destination?.lat && b[1] === endpoints.destination?.lng) after = diff;
  });
  const change = buses.slice(1).map((bus, i) => {
    const [from, to] = [buses[i].toStop, bus.fromStop];
    const walk = from && to && from.id !== to.id ? walkPaths[walkHopKey([from.lat, from.lng], [to.lat, to.lng])] : undefined;
    const gap = (parseTimeToMinutes(bus.departureTime ?? '') - parseTimeToMinutes(buses[i].arrivalTime ?? '') + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return walk ? walk.minutes - gap : 0;
  });
  return { before, after, change: Math.max(0, ...change) };
}

/** Real walking totals for a plan, once every hop has been routed; null while any is missing. */
export function measuredWalkFor(plan: RoutePlanResult | null, endpoints: Endpoints, walkPaths: WalkPaths): { minutes: number; meters: number } | null {
  const hops = walkHopsOf(plan, endpoints.origin, endpoints.destination);
  const found = hops.map(([a, b]) => walkPaths[walkHopKey(a, b)]).filter((w): w is WalkingPath => !!w);
  if (!found.length || found.length !== hops.length) return null;
  return { minutes: found.reduce((n, w) => n + w.minutes, 0), meters: found.reduce((n, w) => n + w.meters, 0) };
}

/** "0,5 km" — the way a distance is printed on this screen. */
export const formatKm = (meters: number): string => (meters / 1000).toFixed(1).replace('.', ',');
