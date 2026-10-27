import { answerJob, type PlanJob } from '../../utils/plannerJob';

// The planner, off the page's thread: "arrive by" held the page for seconds on a slow phone.
self.onmessage = (event: MessageEvent<{ id: number; job: PlanJob }>) => {
  const { id, job } = event.data;
  try {
    self.postMessage({ id, plans: answerJob(job) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
