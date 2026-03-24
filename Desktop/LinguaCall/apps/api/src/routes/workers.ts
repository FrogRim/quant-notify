import { NextFunction, Request, Response, Router } from "express";
import { ApiResponse, FailureReason } from "@lingua/shared";
import { store } from "../storage/inMemoryStore";
import { runWorkerBatchOnce } from "../modules/jobs/workerApp";
import {
  dispatchScheduledSessions,
  markMissedScheduledSessions,
  sendScheduledReminders
} from "../modules/jobs/schedulerJobs";
import { sendReportReadyNotifications } from "../modules/jobs/reportJobs";

type WorkerSessionDispatchResult = {
  dispatched: string[];
  count: number;
};

type WorkerReminderResult = {
  sent: number;
  sessionIds: string[];
};

type WorkerMissedResult = {
  marked: number;
  sessionIds: string[];
};

type WorkerReportNotifyResult = {
  notified: number;
  reportIds: string[];
};

type WorkerReportDeliveryState = {
  reportId: string;
  publicReportId: string;
  sessionId: string;
  reportStatus: string;
  kakaoStatus: string | null;
  errorCode: string | null;
  kakaoSentAt?: string;
  readyAt?: string;
  attemptCount: number;
  createdAt: string;
};

type WorkerReportDeliveryStatesResult = {
  items: WorkerReportDeliveryState[];
  count: number;
};

type WorkerBatchRunResult = {
  dispatched: WorkerSessionDispatchResult;
  reminders: WorkerReminderResult;
  missed: WorkerMissedResult;
  reportNotifications: WorkerReportNotifyResult;
  ranAt: string;
};

type ScheduledTerminalSource = "media_stream" | "app_hangup" | "provider_internal" | "system";

type ScheduledTerminalPayload = {
  sessionId: string;
  status: "no_answer" | "busy" | "provider_error" | "voicemail";
  failureReason?: FailureReason;
  platformFault?: boolean;
  source?: ScheduledTerminalSource;
  errorCode?: number | string;
};

const router = Router();

const WORKER_SHARED_SECRET = process.env.WORKER_SHARED_SECRET;

const requireWorkerToken = (req: Request, res: Response<ApiResponse<unknown>>, next: NextFunction) => {
  if (!WORKER_SHARED_SECRET) {
    if (process.env.NODE_ENV === "production") {
      res.status(401).json({
        ok: false,
        error: { code: "forbidden", message: "worker secret not configured" }
      });
      return;
    }
    next();
    return;
  }
  const token = req.header("x-worker-token");
  if (!token || token !== WORKER_SHARED_SECRET) {
    res.status(401).json({
      ok: false,
      error: { code: "forbidden", message: "invalid worker token" }
    });
    return;
  }
  next();
};

router.post("/scheduled-dispatch", requireWorkerToken, async (_req, res) => {
  try {
    const limit = Math.min(Math.max(Number(_req.query.limit ?? 1), 1), 20) || 1;
    const data: WorkerSessionDispatchResult = await dispatchScheduledSessions(limit);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: "validation_error", message: "failed_to_dispatch_due_sessions" } });
  }
});

const sendScheduledRemindersHandler = async (_req: Request, res: Response<ApiResponse<WorkerReminderResult>>) => {
  try {
    const limit = Math.min(Math.max(Number(_req.query.limit ?? 20), 1), 100) || 20;
    const data: WorkerReminderResult = await sendScheduledReminders(limit);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: "validation_error", message: "failed_to_send_due_reminders" } });
  }
};

router.post("/scheduled-reminders", requireWorkerToken, sendScheduledRemindersHandler);
router.post("/dispatch-reminder", requireWorkerToken, sendScheduledRemindersHandler);

const sendReportNotificationsHandler = async (
  _req: Request,
  res: Response<ApiResponse<WorkerReportNotifyResult>>
) => {
  try {
    const limit = Math.min(Math.max(Number(_req.query.limit ?? 20), 1), 200) || 20;
    const data: WorkerReportNotifyResult = await sendReportReadyNotifications(limit);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: "validation_error", message: "failed_to_send_report_notifications" } });
  }
};

router.post("/report-notify", requireWorkerToken, sendReportNotificationsHandler);
router.post("/notify/report-ready", requireWorkerToken, sendReportNotificationsHandler);

const runWorkerBatch = async (
  _req: Request,
  res: Response<ApiResponse<WorkerBatchRunResult>>
) => {
  try {
    const defaultLimit = 20;
    const parsedLimit = _req.query.limit === undefined ? defaultLimit : Number(_req.query.limit);
    const limit = Number.isFinite(parsedLimit)
      ? Math.min(Math.max(Math.max(Math.floor(parsedLimit), 1), 200), 200)
      : defaultLimit;
    const data: WorkerBatchRunResult = await runWorkerBatchOnce(limit);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: "validation_error", message: "failed_to_run_worker_batch" } });
  }
};

router.post("/run", requireWorkerToken, runWorkerBatch);
router.post("/run-all", requireWorkerToken, runWorkerBatch);

const reportDeliveryStatesHandler = async (
  _req: Request,
  res: Response<ApiResponse<WorkerReportDeliveryStatesResult>>
) => {
  try {
    const rawStatus = _req.query.status;
    const status = typeof rawStatus === "string" ? rawStatus.trim() : undefined;
    const parsedLimit = _req.query.limit === undefined ? 50 : Number(_req.query.limit);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(Math.floor(parsedLimit), 1), 200) : 50;

    const items = await store.getReportDeliveryStates({ status, limit });
    const data: WorkerReportDeliveryStatesResult = { items, count: items.length };
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: "validation_error", message: "failed_to_fetch_report_delivery_states" } });
  }
};

router.get("/report-delivery", requireWorkerToken, reportDeliveryStatesHandler);

const markMissedScheduledSessionsHandler = async (
  _req: Request,
  res: Response<ApiResponse<WorkerMissedResult>>
) => {
  try {
    const limit = Math.min(Math.max(Number(_req.query.limit ?? 20), 1), 200) || 20;
    const data: WorkerMissedResult = await markMissedScheduledSessions(limit);
    res.status(200).json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: { code: "validation_error", message: "failed_to_mark_missed_scheduled_sessions" } });
  }
};

router.post("/scheduled-missed", requireWorkerToken, markMissedScheduledSessionsHandler);

router.post("/scheduled-terminal", requireWorkerToken, async (req: Request, res: Response<ApiResponse<unknown>>) => {
  const payload = req.body as Partial<ScheduledTerminalPayload>;
  const allowedStatuses: Array<ScheduledTerminalPayload["status"]> = ["no_answer", "busy", "provider_error", "voicemail"];
  if (!payload.sessionId || !payload.status || !allowedStatuses.includes(payload.status)) {
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "sessionId and status(no_answer|busy|provider_error|voicemail) are required" } });
    return;
  }

  const terminalStatus = payload.status;
  const defaultFailureReason: Record<Exclude<ScheduledTerminalPayload["status"], "voicemail">, FailureReason | undefined> = {
    no_answer: "twilio_no_answer_timeout",
    busy: "twilio_sip_error",
    provider_error: "provider_error"
  };
  const normalizedErrorCode = (() => {
    const rawCode = payload.errorCode;
    if (rawCode === undefined || rawCode === null) {
      return undefined;
    }
    const parsed = Number.parseInt(String(rawCode), 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  })();
  const is5xxErrorCode = normalizedErrorCode !== undefined && normalizedErrorCode >= 500 && normalizedErrorCode <= 599;
  const isPlatformFaultSignal = payload.platformFault === true
    || payload.source === "media_stream"
    || payload.source === "provider_internal"
    || payload.source === "system"
    || is5xxErrorCode;
  const failureReason = payload.failureReason
    ?? (isPlatformFaultSignal && terminalStatus !== "no_answer" && terminalStatus !== "busy"
      ? "platform_fault"
      : terminalStatus === "voicemail"
        ? "platform_fault"
        : defaultFailureReason[terminalStatus]);

  try {
    const session = await store.markSessionTerminal(payload.sessionId, terminalStatus, failureReason);
    res.status(200).json({ ok: true, data: session });
  } catch (error) {
    res.status(404).json({ ok: false, error: { code: "not_found", message: "session_not_found" } });
  }
});

export default router;
