import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/linguacall_test";
});

vi.mock("../services/sessionAccuracy", () => {
  return {
    buildSessionAccuracyPolicy: vi.fn(() => ({
      topicLockEnabled: false,
      explicitTopicSwitchRequired: false,
      correctionMode: "light_inline",
      maxAssistantSentences: 4,
      maxAssistantQuestionsPerTurn: 2,
      enforceTopicRetention: false,
      enforceIntentAlignment: false,
      enforceCorrectionRelevance: false,
      forbiddenDomainHints: [],
      allowedSubtopicHints: []
    })),
    validateCompletedTranscript: vi.fn(() => ({
      ok: true,
      flags: [],
      fallbackRecommended: false
    })),
    toAccuracyState: vi.fn(() => ({
      validationVersion: "accuracy-v1",
      driftDetected: false,
      intentMismatchDetected: false,
      correctionMismatchDetected: false,
      lastValidatedAt: "2026-03-23T00:00:00.000Z",
      flags: []
    }))
  };
});

import { store } from "../storage/inMemoryStore";

const sessionRow = {
  id: "session-1",
  public_id: "PUB_1",
  user_id: "user-1",
  status: "in_progress",
  contact_mode: "immediate",
  language: "en",
  exam: "opic",
  level: "IM2",
  topic: "daily routine",
  duration_target_minutes: 10,
  timezone: "Asia/Seoul",
  scheduled_for_at_utc: null,
  dispatch_deadline_at_utc: null,
  reminder_at_utc: null,
  reminder_sent: false,
  reminder_sent_at: null,
  prompt_version: null,
  call_id: "call-1",
  report_status: "pending",
  failure_reason: null,
  accuracy_policy: {
    topicLockEnabled: false,
    explicitTopicSwitchRequired: false,
    correctionMode: "light_inline",
    maxAssistantSentences: 4,
    maxAssistantQuestionsPerTurn: 2,
    enforceTopicRetention: false,
    enforceIntentAlignment: false,
    enforceCorrectionRelevance: false,
    forbiddenDomainHints: [],
    allowedSubtopicHints: []
  },
  accuracy_state: null,
  reserved_trial_call: false,
  reserved_minutes: 0,
  created_at: "2026-03-23T00:00:00.000Z",
  updated_at: "2026-03-23T00:00:00.000Z",
  answered_at: null,
  completed_at: null,
  ended_at: null
};

describe("completeWebVoiceCall", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("marks session complete before report generation finishes", async () => {
    const completedRow = {
      ...sessionRow,
      status: "completed",
      report_status: "pending",
      updated_at: "2026-03-23T00:05:00.000Z",
      answered_at: "2026-03-23T00:05:00.000Z",
      completed_at: "2026-03-23T00:05:00.000Z",
      ended_at: "2026-03-23T00:05:00.000Z"
    };
    const readyRow = {
      ...completedRow,
      report_status: "ready"
    };

    const query = vi.fn(async (sql: string) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.includes("SELECT * FROM sessions WHERE id = $1 AND user_id = $2 FOR UPDATE")) {
        return { rows: [sessionRow] };
      }
      if (sql.includes("SET status = 'completed'")) {
        return { rows: [completedRow] };
      }
      if (sql.includes("SET report_status = 'ready'")) {
        return { rows: [readyRow] };
      }
      return { rows: [] };
    });

    vi.spyOn(store as never, "getSession").mockResolvedValue({
      id: "session-1",
      publicId: "PUB_1",
      userId: "user-1",
      status: "in_progress",
      contactMode: "immediate",
      language: "en",
      exam: "opic",
      level: "IM2",
      topic: "daily routine",
      durationMinutes: 10,
      timezone: "Asia/Seoul",
      reminderSent: false,
      reportStatus: "pending",
      createdAt: "2026-03-23T00:00:00.000Z",
      updatedAt: "2026-03-23T00:00:00.000Z"
    } as never);
    vi.spyOn((store as { pool: { connect: () => Promise<unknown> } }).pool, "connect").mockResolvedValue({
      query,
      release: vi.fn()
    } as never);
    vi.spyOn(store as never, "commitScheduledAllowance").mockResolvedValue(undefined as never);
    vi.spyOn(store as never, "writeWebhookEvent").mockResolvedValue(undefined as never);
    const ensureReportReady = vi.spyOn(store as never, "ensureSessionReportReady").mockResolvedValue(undefined as never);

    const result = await store.completeWebVoiceCall("session-1", "local:user-1", {
      endReason: "completed"
    });

    expect(result.status).toBe("completed");
    expect(result.reportStatus).toBe("pending");
    expect(ensureReportReady).not.toHaveBeenCalled();
  });
});
