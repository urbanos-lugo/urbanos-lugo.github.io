import type { RoutePlanResult } from '../../types';
import { answerJob, type PlanJob } from '../../utils/plannerJob';

/** Rejects the question a newer one replaced, which nobody is waiting for any more. */
export class Superseded extends Error {}

let worker: Worker | null = null;
/** The worker would not start (no support, or the script refused): every question is answered on the page. */
let noWorker = typeof Worker === 'undefined';
let pending: { id: number; resolve: (plans: RoutePlanResult[]) => void; reject: (reason: unknown) => void } | null = null;
let lastId = 0;

function settle(id: number, outcome: { plans?: RoutePlanResult[]; error?: unknown }) {
  if (!pending || pending.id !== id) return;
  const { resolve, reject } = pending;
  pending = null;
  if (outcome.plans) resolve(outcome.plans);
  else reject(outcome.error);
}

function spawn(): Worker | null {
  try {
    const started = new Worker(new URL('./planner.worker.ts', import.meta.url), { type: 'module' });
    started.onmessage = (event: MessageEvent<{ id: number; plans?: RoutePlanResult[]; error?: string }>) => settle(event.data.id, event.data);
    started.onerror = (event) => {
      noWorker = true;
      worker = null;
      if (pending) settle(pending.id, { error: event.message || 'the planner worker failed' });
    };
    return started;
  } catch {
    noWorker = true;
    return null;
  }
}

/**
 * The plans for a question, worked out off the page's thread: "arrive by" held the page for
 * 5 to 10 seconds on a slow phone, with nothing on it to tap, not even to ask something else.
 * A newer question stops the one still being worked out (the worker is ended, and started
 * again for it) and the old one rejects with Superseded. Where there is no worker, or it
 * fails, the question is answered on the page, as before.
 */
export function askPlanner(job: PlanJob): Promise<RoutePlanResult[]> {
  if (pending) {
    worker?.terminate();
    worker = null;
    settle(pending.id, { error: new Superseded() });
  }
  if (!noWorker) worker ??= spawn();
  if (!worker) return Promise.resolve(answerJob(job));
  const id = ++lastId;
  const sent = worker;
  return new Promise<RoutePlanResult[]>((resolve, reject) => {
    pending = { id, resolve, reject };
    sent.postMessage({ id, job });
  }).catch((reason: unknown) => {
    if (reason instanceof Superseded) throw reason;
    return answerJob(job);
  });
}
