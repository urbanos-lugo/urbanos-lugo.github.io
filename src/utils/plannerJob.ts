import { planTrips, type PlanOptions } from './planner';
import { underNotice, type NoticeChanges } from './noticeChanges';
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

/** The answer to a job, the same on either side of the crossing (planner.worker.ts, askPlanner.ts). */
export function answerJob(job: PlanJob): RoutePlanResult[] {
  const { measured } = job;
  return underNotice(job.changes, new Date(job.plannedFrom), (skipsStop) =>
    planTrips(job.from, job.to, { ...job.opts, lang: job.lang, now: new Date(job.now), skipsStop, measuredWalkToStop: measured && ((id) => measured[id]) }),
  );
}
