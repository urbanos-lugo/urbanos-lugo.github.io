/**
 * Is the answer a good one?
 *
 *   pnpm exec tsx tools/stressRoutes.ts
 *
 * stressPlanner asks whether a journey holds together, and every one did while one answer in six
 * got there five minutes or more after another there was: the stops were chosen by line and not by
 * the way it goes, the pole across the street stood for the right one, and no check had anything
 * outside the planner to compare with. So the soonest there is looked for here on its own, off
 * the timetable: every pole within reach at both ends, every line each way, one change at most,
 * with the planner's walks and margins and nothing else of it. No answer may be bettered.
 */
import { BUS_LINES, BUS_STOPS } from '../src/data/transitData';
import { getDistanceMeters } from '../src/utils/geo';
import { estimateWalk, getNearbyStops, resolveLocationQuery } from '../src/utils/places';
import { planTrips, TRANSFER_BUFFER_ESTIMATED_MIN, TRANSFER_BUFFER_MIN, WALK_MUST_BEAT_BUS_BY_MIN } from '../src/utils/planner';
import { buildRuns, dayKind, lineRunsOn } from '../src/utils/schedule';
import type { RoutePlanResult } from '../src/types';
import { violations } from './lib';

const { fail, report } = violations('every answer is as good as one found apart', 'answer worse than another there is');
const REACH_M = 2000;
const CHANGE_M = 300;

const indexOf = new Map(BUS_STOPS.map((stop, i) => [stop.id, i]));
const near = BUS_STOPS.map((a) =>
  BUS_STOPS.flatMap((b, i): [number, number][] => {
    const metres = getDistanceMeters(a.lat, a.lng, b.lat, b.lng);
    return a === b ? [[i, 0]] : metres <= CHANGE_M ? [[i, estimateWalk(metres).minutes]] : [];
  }),
);

/** Every run of a day, line by line and way by way. */
const network = (day: Date) =>
  BUS_LINES.filter((line) => lineRunsOn(line, dayKind(day))).flatMap((line) =>
    line.directions.map((way, i) => ({ line, stops: way.stops.map((id) => indexOf.get(id)!), runs: buildRuns(line, i, BUS_STOPS, dayKind(day)) })),
  );

type Point = { lat: number; lng: number };
const walks = (point: Point, whole: number): number[] => {
  const minutes = BUS_STOPS.map(() => Infinity);
  for (const s of getNearbyStops(point.lat, point.lng)) if (s.walkMeters <= REACH_M && s.walkMinutes < whole) minutes[indexOf.get(s.id)!] = s.walkMeters > 50 ? s.walkMinutes : 0;
  return minutes;
};

/** The soonest there from a minute of the day, by one bus and by two. */
function soonest(lines: ReturnType<typeof network>, on: number[], off: number[], from: number): { one: number; two: number } {
  let one = Infinity;
  const arrivals = BUS_STOPS.map(() => new Map<string, [number, number]>());
  for (const { line, stops, runs } of lines) {
    for (const { minutesByStopIndex: at, publishedStopIndices } of runs) {
      const boarded = stops.findIndex((s, i) => at[i] >= from + on[s]);
      if (boarded < 0) continue;
      for (let i = boarded + 2; i < stops.length; i++) {
        one = Math.min(one, at[i] + off[stops[i]]);
        const known = arrivals[stops[i]].get(line.id);
        if (!known || at[i] < known[0]) arrivals[stops[i]].set(line.id, [at[i], publishedStopIndices.includes(i) ? TRANSFER_BUFFER_MIN : TRANSFER_BUFFER_ESTIMATED_MIN]);
      }
    }
  }
  let two = Infinity;
  const ready = BUS_STOPS.map((): [number, string][] => []);
  arrivals.forEach((lines, hub) => lines.forEach(([arrival, margin], id) => near[hub].forEach(([i, walk]) => ready[i].push([arrival + walk + margin, id]))));
  for (const { line, stops, runs } of lines) {
    for (const { minutesByStopIndex: at } of runs) {
      let boarded = -1;
      stops.forEach((s, i) => {
        if (boarded >= 0 && i > boarded + 1) two = Math.min(two, at[i] + off[s]);
        if (boarded < 0 && ready[s].some(([minute, id]) => id !== line.id && minute <= at[i])) boarded = i;
      });
    }
  }
  return { one, two };
}

const DAYS = [new Date(2026, 7, 19), new Date(2026, 7, 22), new Date(2026, 7, 23)];
const buses = (plan: RoutePlanResult) => plan.segments.filter((seg) => seg.type === 'bus');
let asked = 0;

for (const day of DAYS) {
  const lines = network(day);
  for (let i = 0; i < 130; i++) {
    const from = BUS_STOPS[(i * 53 + 7) % BUS_STOPS.length];
    const to = BUS_STOPS[(i * 131 + 17) % BUS_STOPS.length];
    const [a, b] = [from, to].map((stop) => resolveLocationQuery(stop.name)!);
    const metres = getDistanceMeters(a.lat, a.lng, b.lat, b.lng);
    if (metres < 900 || metres > 8000) continue;
    const whole = estimateWalk(metres).minutes;
    const [on, off] = [walks(a, whole), walks(b, whole)];
    const minute = 7 * 60 + ((i * 37) % (14 * 60));
    const at = new Date(day);
    at.setHours(0, minute, 0, 0);
    const where = `${from.name} -> ${to.name}, ${dayKind(day)} at ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, '0')}`;

    const head = planTrips(from.name, to.name, { now: at })[0];
    if (!head || head.daysAhead) continue;
    asked++;
    const { one, two } = soonest(lines, on, off, minute);
    const arrives = minute + head.slackMinutes + head.durationMinutes;
    // A bus that saves neither five minutes nor five of walking is left out, and a walk leads when it wins by five.
    const better = Math.min(one, two);
    if (arrives - better > 2 * WALK_MUST_BEAT_BUS_BY_MIN) fail(`an answer gets there well after ${better === one ? 'one bus does' : 'a change would'}`, `${where}: ${buses(head).map((seg) => seg.line?.number).join(' > ') || 'on foot'}, ${Math.round(arrives - better)} min later`);

    // «Chegar antes das»: no bus left to take would be in time setting off a quarter of an hour later.
    if (i % 11 !== 0 || minute < 10 * 60) continue;
    const early = new Date(day);
    early.setHours(0, minute - 180, 0, 0);
    const answer = planTrips(from.name, to.name, { now: early, arriveBy: minute })[0];
    if (!answer) continue;
    const [hours, minutes] = answer.departureTime.split(':').map(Number);
    const leaves = hours * 60 + minutes;
    if (leaves + answer.durationMinutes > minute) fail('an answer asked to be there by a time is not', `${where}: ${answer.departureTime} -> ${answer.arrivalTime}`);
    const later = soonest(lines, on, off, leaves + 15);
    if (Math.min(later.one, later.two) <= minute) fail('asked to be there by a time, the answer leaves a quarter of an hour before it has to', `${where}: ${answer.departureTime}`);
  }
}

console.log(`\n${asked} answers compared with the best there is`);
report();
