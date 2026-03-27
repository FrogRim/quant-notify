import {
  dispatchScheduledSessions,
  markMissedScheduledSessions,
  sendScheduledReminders,
  type WorkerDispatchedSessionsResult,
  type WorkerMissedSessionsResult,
  type WorkerRemindersResult
} from "./schedulerJobs";
import {
  runReportJobs,
  type WorkerReportNotificationsResult
} from "./reportJobs";
import { describeErrorForLog } from "../../lib/logging";

export type WorkerBatchResult = {
  dispatched: WorkerDispatchedSessionsResult;
  reminders: WorkerRemindersResult;
  missed: WorkerMissedSessionsResult;
  reportNotifications: WorkerReportNotificationsResult;
  ranAt: string;
};

export const parseWorkerBatchInterval = (raw = process.env.WORKER_BATCH_INTERVAL_MS) => {
  if (!raw) {
    return 30000;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 1000 ? 30000 : parsed;
};

export const parseWorkerBatchLimit = (raw = process.env.WORKER_BATCH_LIMIT) => {
  if (!raw) {
    return 20;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? 20 : parsed;
};

export const runWorkerBatchOnce = async (
  limit = parseWorkerBatchLimit()
): Promise<WorkerBatchResult> => {
  const [dispatched, reminders, missed, reportNotifications] = await Promise.all([
    dispatchScheduledSessions(limit),
    sendScheduledReminders(limit),
    markMissedScheduledSessions(limit),
    runReportJobs(limit)
  ]);

  return {
    dispatched,
    reminders,
    missed,
    reportNotifications,
    ranAt: new Date().toISOString()
  };
};

export const logWorkerBatchResult = (result: WorkerBatchResult) => {
  if (
    result.dispatched.count > 0 ||
    result.reminders.sent > 0 ||
    result.missed.marked > 0 ||
    result.reportNotifications.notified > 0
  ) {
    process.stdout.write(
      `worker-batch: dispatched=${result.dispatched.count}, reminders=${result.reminders.sent}, missed=${result.missed.marked}, reportNotifications=${result.reportNotifications.notified}\n`
    );
  }
};

export const startWorkerBatchLoop = ({
  intervalMs = parseWorkerBatchInterval(),
  limit = parseWorkerBatchLimit()
}: {
  intervalMs?: number;
  limit?: number;
} = {}) => {
  let inFlight = false;

  const run = async () => {
    if (inFlight) {
      return;
    }
    inFlight = true;
    try {
      const result = await runWorkerBatchOnce(limit);
      logWorkerBatchResult(result);
    } catch (error) {
      console.error("worker-batch failed", describeErrorForLog(error));
    } finally {
      inFlight = false;
    }
  };

  void run();
  const timer = setInterval(() => {
    void run();
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    }
  };
};
