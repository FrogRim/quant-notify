import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../middleware/auth", () => {
  return {
    requireAuthenticatedUser: (
      req: express.Request & { clerkUserId?: string; userId?: string },
      _res: express.Response,
      next: express.NextFunction
    ) => {
      req.clerkUserId = "supabase:user-1";
      req.userId = "user-1";
      next();
    }
  };
});

vi.mock("../services/webVoiceSessionService", () => {
  return {
    startWebVoiceSession: vi.fn(),
    joinWebVoiceSession: vi.fn(async () => ({ sessionId: "session-1" })),
    recordWebVoiceRuntimeEvent: vi.fn(async () => ({ id: "session-1" })),
    completeWebVoiceSession: vi.fn(async () => ({ id: "session-1" }))
  };
});

vi.mock("../modules/learning-sessions/repository", () => {
  return {
    learningSessionsRepository: {
      create: vi.fn(),
      list: vi.fn(),
      getMessages: vi.fn(),
      generateReport: vi.fn(async () => ({ id: "report-1" })),
      getReport: vi.fn(),
      get: vi.fn(),
      updateScheduled: vi.fn(),
      cancelScheduled: vi.fn(),
      getByIdentifierForUser: vi.fn(),
      getByTwilioLookup: vi.fn(),
      handleTwilioStatusCallback: vi.fn()
    }
  };
});

vi.mock("../storage/inMemoryStore", () => {
  class AppError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    AppError,
    store: {
      endSessionCall: vi.fn(async () => ({ id: "session-1" }))
    }
  };
});

import callsRouter from "../routes/calls";
import sessionsRouter from "../routes/sessions";

describe("AI-expensive route rate limits", () => {
  it("limits repeated web voice join attempts per authenticated user", async () => {
    const app = express();
    app.use(express.json());
    app.use("/calls", callsRouter);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      const response = await request(app).post("/calls/session-1/join").send({});
      expect(response.status).toBe(201);
    }

    const limited = await request(app).post("/calls/session-1/join").send({});
    expect(limited.status).toBe(429);
    expect(limited.body.error?.message).toBe("call join rate limit exceeded");
  });

  it("limits repeated report generation attempts per authenticated user", async () => {
    const app = express();
    app.use(express.json());
    app.use("/sessions", sessionsRouter);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await request(app).post("/sessions/session-1/report").send({});
      expect(response.status).toBe(201);
    }

    const limited = await request(app).post("/sessions/session-1/report").send({});
    expect(limited.status).toBe(429);
    expect(limited.body.error?.message).toBe("report generation rate limit exceeded");
  });
});
