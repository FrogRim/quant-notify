import { Response, Router } from "express";
import { z } from "zod";
import {
  ApiResponse,
  ApiError,
  Session,
  Report,
  SessionMessagesResponse,
  UpdateScheduledSessionPayload
} from "@lingua/shared";
import { store, AppError } from "../storage/inMemoryStore";
import { requireAuthenticatedUser, AuthenticatedRequest } from "../middleware/auth";
import { learningSessionsRepository } from "../modules/learning-sessions/repository";

const router = Router();

const withError = (res: Response<ApiResponse<unknown>>, message = "request_failed", code: ApiError["code"] = "validation_error") => {
  res.status(400).json({ ok: false, error: { code, message } });
};

const CreateSessionSchema = z.object({
  language: z.enum(["en", "de", "zh", "es"]),
  exam: z.enum(["opic", "goethe_b2", "hsk5", "dele_b1"]),
  level: z.string().min(1),
  topic: z.string().min(1),
  durationMinutes: z.number().int().min(1),
  contactMode: z.enum(["immediate", "scheduled_once"]),
  timezone: z.string().optional(),
  scheduledForAtUtc: z.string().optional()
}).refine(
  (data) => data.contactMode !== "scheduled_once" || !!data.scheduledForAtUtc,
  { message: "scheduledForAtUtc is required for scheduled_once", path: ["scheduledForAtUtc"] }
);

router.post("/", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const parsed = CreateSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: parsed.error.errors[0]?.message ?? "invalid_request" } });
    return;
  }
  const payload = parsed.data;

  try {
    const session = await learningSessionsRepository.create(req.clerkUserId, {
      language: payload.language,
      exam: payload.exam,
      level: payload.level,
      topic: payload.topic,
      durationMinutes: payload.durationMinutes,
      contactMode: payload.contactMode,
      timezone: payload.timezone,
      scheduledForAtUtc: payload.scheduledForAtUtc
    });
    res.status(201).json({ ok: true, data: session });
  } catch (err) {
    if (err instanceof AppError) {
      if (err.code === "SCHEDULED_CONFLICT") {
        res.status(409).json({
          ok: false,
          error: { code: "conflict", message: err.message, details: {} }
        });
        return;
      }
      if (err.code === "DURATION_SCOPE_ERROR") {
        res.status(422).json({
          ok: false,
          error: { code: "invalid_duration_for_plan", message: err.message }
        });
        return;
      }
      if (["SCHEDULED_TIME_REQUIRED", "INVALID_SCHEDULED_TIME", "SCHEDULED_TOO_SOON", "SCHEDULED_TOO_FAR", "DURATION_SCOPE_ERROR", "LANGUAGE_EXAM_SCOPE_ERROR"].includes(err.code)) {
        res.status(422).json({ ok: false, error: { code: "validation_error", message: err.message } });
        return;
      }
      if (err.code === "INSUFFICIENT_ALLOWANCE") {
        res.status(402).json({ ok: false, error: { code: "insufficient_allowance", message: err.message } });
        return;
      }
      if (err.code === "USER_NOT_FOUND") {
        res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
        return;
      }
    }
    withError(res, "failed_to_create_session");
  }
});

router.get("/", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session[]>>) => {
  const status = req.query.status as string | undefined;
  const contactMode = req.query.contactMode as string | undefined;
  const sessions = await learningSessionsRepository.list(req.clerkUserId);
  const filtered = sessions.filter((session) => {
    if (status && session.status !== status) {
      return false;
    }
    if (contactMode && session.contactMode !== contactMode) {
      return false;
    }
    return true;
  });
  res.json({ ok: true, data: filtered });
});

router.get("/:id/messages", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<SessionMessagesResponse>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id required" } });
    return;
  }

  const rawLimit = req.query.limit as string | undefined;
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    limit = Number(rawLimit);
    if (!Number.isInteger(limit) || limit <= 0) {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: "limit must be a positive integer" } });
      return;
    }
  }

  try {
    const messages = await learningSessionsRepository.getMessages(req.clerkUserId, id, limit);
    res.json({ ok: true, data: messages });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    withError(res, "failed_to_fetch_session_messages");
  }
});

router.post("/:id/report", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Report>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id required" } });
    return;
  }

  try {
    const report = await learningSessionsRepository.generateReport(req.clerkUserId, id);
    res.status(201).json({ ok: true, data: report });
  } catch (err) {
    if (err instanceof AppError && err.code === "REPORT_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "INVALID_SESSION_STATE") {
      res.status(409).json({ ok: false, error: { code: "conflict", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "conflict") {
      res.status(409).json({ ok: false, error: { code: "conflict", message: err.message } });
      return;
    }
    withError(res, "failed_to_generate_report");
  }
});

router.get("/:id/report", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Report>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id required" } });
    return;
  }

  try {
    const report = await learningSessionsRepository.getReport(req.clerkUserId, id);
    res.json({ ok: true, data: report });
  } catch (err) {
    if (err instanceof AppError && err.code === "REPORT_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    withError(res, "failed_to_fetch_report");
  }
});

router.get("/:id", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id required" } });
    return;
  }
  try {
    const session = await learningSessionsRepository.get(req.clerkUserId, id);
    res.json({ ok: true, data: session });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    withError(res, "session_not_found");
  }
});

router.patch("/:id", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const { id } = req.params;
  const payload = req.body as Partial<UpdateScheduledSessionPayload>;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id required" } });
    return;
  }
  if (!payload.scheduledForAtUtc && !payload.timezone) {
    withError(res, "scheduledForAtUtc or timezone is required");
    return;
  }
  if (payload.scheduledForAtUtc) {
    payload.scheduledForAtUtc = String(payload.scheduledForAtUtc);
  }

  try {
    const session = await learningSessionsRepository.updateScheduled(req.clerkUserId, id, payload);
    res.json({ ok: true, data: session });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "INVALID_SESSION_STATE") {
      res.status(409).json({ ok: false, error: { code: "conflict", message: err.message } });
      return;
    }
    if (
      err instanceof AppError &&
      [
        "SCHEDULED_TIME_REQUIRED",
        "INVALID_SCHEDULED_TIME",
        "SCHEDULED_TOO_SOON",
        "SCHEDULED_TOO_FAR"
      ].includes(err.code)
    ) {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: err.message } });
      return;
    }
    withError(res, "failed_to_update_session");
  }
});

router.post("/:id/cancel", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id required" } });
    return;
  }
  try {
    const session = await learningSessionsRepository.cancelScheduled(req.clerkUserId, id);
    res.json({ ok: true, data: session });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "INVALID_SESSION_STATE") {
      res.status(409).json({ ok: false, error: { code: "conflict", message: err.message } });
      return;
    }
    withError(res, "failed_to_cancel_session");
  }
});

export default router;


