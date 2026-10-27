import { planTrips, type PlanOptions } from './planner';
import { underNotice, type NoticeChanges } from './noticeChanges';
import { lineById, stopById } from '../data/transitData';
import type { Lang } from '../i18n/translations';
import type { RoutePlanResult } from '../types';

/**
 * A question for the planner as it crosses to the worker: data only, so the two functions the
 * planner takes are rebuilt on the other side, and the page's clock travels as a number. A
 * worker has a clock of its own, which the browser audits cannot pin as they pin the page's.
 */
export interface PlanJob {
  from: string;
  to: string;
  opts: Pick<PlanOptions, 'userLocation' | 'departAt' | 'arriveBy'>;
  lang: Lang;
  /** The page's now, in milliseconds. */
  now: number;
  /** The moment the question is planned from (now, or today at the time asked), in milliseconds. */
  plannedFrom: number;
  /** The operator's notice, read for the stops it closes on the day of the trip. */
  changes: NoticeChanges | null;
  /** The walks the pedestrian router has measured, minutes from the origin by stop id. */
  measured?: Record<string, number>;
}

/**
 * An answer back from the worker, its lines and stops swapped for the page's own. The crossing
 * copies them, and the copies are not the objects the page goes on to fill: a line's streets
 * are written into the page's lines once they load (applyRouteGeometry), so a copied line had
 * none, and the ride drew its legs without them and did the work again for each.
 */
export function rejoin(plans: RoutePlanResult[]): RoutePlanResult[] {
  for (const plan of plans)
    for (const segment of plan.segments) {
      if (segment.line) segment.line = lineById(segment.line.id) ?? segment.line;
      if (segment.fromStop) segment.fromStop = stopById(segment.fromStop.id) ?? segment.fromStop;
      if (segment.toStop) segment.toStop = stopById(segment.toStop.id) ?? segment.toStop;
    }
  return plans;
}

/** The answer to a job, the same on either side of the crossing (planner.worker.ts, askPlanner.ts). */
export function answerJob(job: PlanJob): RoutePlanResult[] {
  const { measured } = job;
  return underNotice(job.changes, new Date(job.plannedFrom), (skipsStop) =>
    planTrips(job.from, job.to, { ...job.opts, lang: job.lang, now: new Date(job.now), skipsStop, measuredWalkToStop: measured && ((id) => measured[id]) }),
  );
}
