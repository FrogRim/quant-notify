import { store } from "../../storage/inMemoryStore";

export type WorkerReportNotificationsResult = {
  notified: number;
  reportIds: string[];
};

export type WorkerReportProcessingResult = {
  processed: number;
  readySessionIds: string[];
  failedSessionIds: string[];
};

export const processPendingReports = async (
  limit: number
): Promise<WorkerReportProcessingResult> => {
  return store.processPendingSessionReports(limit);
};

export const sendReportReadyNotifications = async (
  limit: number
): Promise<WorkerReportNotificationsResult> => {
  return store.sendReportReadyNotifications(limit);
};

export const runReportJobs = async (
  limit: number
): Promise<WorkerReportNotificationsResult> => {
  await processPendingReports(limit);
  return sendReportReadyNotifications(limit);
};
