import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => {
  return {
    dispatchDueScheduledSessions: vi.fn(),
    sendDueReminders: vi.fn(),
    markMissedScheduledSessions: vi.fn(),
    processPendingSessionReports: vi.fn(),
    sendReportReadyNotifications: vi.fn()
  };
});

vi.mock("../storage/inMemoryStore", () => {
  return {
    store: {
      dispatchDueScheduledSessions: mocked.dispatchDueScheduledSessions,
      sendDueReminders: mocked.sendDueReminders,
      markMissedScheduledSessions: mocked.markMissedScheduledSessions,
      processPendingSessionReports: mocked.processPendingSessionReports,
      sendReportReadyNotifications: mocked.sendReportReadyNotifications
    }
  };
});

import { runWorkerBatchOnce } from "../modules/jobs/workerApp";

describe("workerApp", () => {
  beforeEach(() => {
    mocked.dispatchDueScheduledSessions.mockReset();
    mocked.sendDueReminders.mockReset();
    mocked.markMissedScheduledSessions.mockReset();
    mocked.processPendingSessionReports.mockReset();
    mocked.sendReportReadyNotifications.mockReset();
  });

  it("runs scheduled jobs without starting the API server", async () => {
    mocked.dispatchDueScheduledSessions.mockResolvedValue([{ id: "session-1" }]);
    mocked.sendDueReminders.mockResolvedValue({ sent: 2, sessionIds: ["session-1", "session-2"] });
    mocked.markMissedScheduledSessions.mockResolvedValue({ marked: 1, sessionIds: ["session-3"] });
    mocked.processPendingSessionReports.mockResolvedValue({ processed: 1, readySessionIds: ["session-1"], failedSessionIds: [] });
    mocked.sendReportReadyNotifications.mockResolvedValue({ notified: 3, reportIds: ["report-1", "report-2", "report-3"] });

    const result = await runWorkerBatchOnce(10);

    expect(mocked.dispatchDueScheduledSessions).toHaveBeenCalledWith(10);
    expect(mocked.sendDueReminders).toHaveBeenCalledWith(10);
    expect(mocked.markMissedScheduledSessions).toHaveBeenCalledWith(10);
    expect(mocked.processPendingSessionReports).toHaveBeenCalledWith(10);
    expect(mocked.sendReportReadyNotifications).toHaveBeenCalledWith(10);
    expect(result.dispatched.count).toBe(1);
    expect(result.reminders.sent).toBe(2);
    expect(result.missed.marked).toBe(1);
    expect(result.reportNotifications.notified).toBe(3);
    expect(result.ranAt).toMatch(/T/);
  });
});
