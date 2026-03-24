import { store } from "../../storage/inMemoryStore";

export type WorkerDispatchedSessionsResult = {
  count: number;
  dispatched: string[];
};

export type WorkerRemindersResult = {
  sent: number;
  sessionIds: string[];
};

export type WorkerMissedSessionsResult = {
  marked: number;
  sessionIds: string[];
};

export const dispatchScheduledSessions = async (
  limit: number
): Promise<WorkerDispatchedSessionsResult> => {
  const sessions = await store.dispatchDueScheduledSessions(limit);
  return {
    count: sessions.length,
    dispatched: sessions.map((session) => session.id)
  };
};

export const sendScheduledReminders = async (
  limit: number
): Promise<WorkerRemindersResult> => {
  return store.sendDueReminders(limit);
};

export const markMissedScheduledSessions = async (
  limit: number
): Promise<WorkerMissedSessionsResult> => {
  return store.markMissedScheduledSessions(limit);
};
