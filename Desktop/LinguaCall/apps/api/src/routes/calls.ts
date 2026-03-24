import { Request, Response, Router } from "express";
import { z } from "zod";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ApiResponse,
  CompleteWebVoiceCallPayload,
  JoinCallResponse,
  Session,
  StartCallResponse,
  WebVoiceRuntimeEventPayload
} from "@lingua/shared";
import { store, AppError } from "../storage/inMemoryStore";
import { requireAuthenticatedUser, AuthenticatedRequest } from "../middleware/auth";
import { learningSessionsRepository } from "../modules/learning-sessions/repository";
import {
  completeWebVoiceSession,
  joinWebVoiceSession,
  recordWebVoiceRuntimeEvent,
  startWebVoiceSession
} from "../services/webVoiceSessionService";

const router = Router();

const readEnv = (value?: string): string | undefined => {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : undefined;
};

const resolveTwilioBaseUrl = (req: Request): string | undefined => {
  return (
    readEnv(process.env.PUBLIC_BASE_URL) ||
    readEnv(process.env.API_BASE_URL) ||
    readEnv(process.env.APP_BASE_URL) ||
    (req.get("host")
      ? `${(req.header("x-forwarded-proto")?.split(",")[0] ?? req.protocol)}://${req.get("host")}`
      : undefined)
  );
};

const getTwilioRequestUrl = (req: Request): string => {
  const protocol = req.header("x-forwarded-proto")?.split(",")[0] ?? req.protocol;
  const host = req.header("x-forwarded-host")?.split(",")[0] ?? req.get("host") ?? "";
  const path = req.originalUrl || req.url || "";
  return `${protocol}://${host}${path}`;
};

const stringifyTwilioParam = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyTwilioParam(entry)).join("");
  }
  return "";
};

const computeTwilioSignature = (url: string, body: Record<string, unknown>, token: string): string => {
  const bodySuffix = Object.keys(body || {})
    .sort()
    .flatMap((key) => {
      const value = body[key];
      if (Array.isArray(value)) {
        if (value.length === 0) {
          return [`${key}`];
        }
        return value.map((entry) => `${key}${stringifyTwilioParam(entry)}`);
      }
      return [`${key}${stringifyTwilioParam(value)}`];
    })
    .join("");
  const base = `${url}${bodySuffix}`;
  return createHmac("sha1", token).update(base).digest("base64");
};

const equalSignature = (expected: string, actual: string): boolean => {
  if (expected.length !== actual.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
  } catch {
    return false;
  }
};

const verifyTwilioSignature = (req: Request, res: Response<ApiResponse<unknown>>, next: () => void) => {
  const token = process.env.TWILIO_WEBHOOK_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  if (!token) {
    next();
    return;
  }

  const signature = req.header("x-twilio-signature") || req.header("X-Twilio-Signature");
  if (!signature) {
    res.status(401).json({ ok: false, error: { code: "forbidden", message: "missing twilio signature" } });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const url = getTwilioRequestUrl(req);
  const expected = computeTwilioSignature(url, body ?? {}, token);
  if (!equalSignature(expected, signature)) {
    res.status(401).json({ ok: false, error: { code: "forbidden", message: "invalid twilio signature" } });
    return;
  }
  next();
};

const escapeXml = (value: string): string => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

const getMediaStreamUrl = (req: Request): string => {
  const configuredUrl = process.env.TWILIO_MEDIA_STREAM_URL?.trim();
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = req.header("x-forwarded-proto")?.split(",")[0] ?? req.protocol;
  const host = req.header("x-forwarded-host")?.split(",")[0] ?? req.get("host") ?? "localhost:4000";
  const wsProtocol = protocol === "https" ? "wss" : "ws";
  return `${wsProtocol}://${host}/media-stream`;
};

const toTwimlString = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
};

const buildTwiml = (streamUrl: string, session: Session, callSid: string): string => {
  const safeSessionId = escapeXml(session.id);
  const safeCallSid = escapeXml(toTwimlString(callSid));
  const safeCallId = escapeXml(toTwimlString(session.callId ?? ""));

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamUrl}">
      <Parameter name="session_id" value="${safeSessionId}"/>
      <Parameter name="provider_call_sid" value="${safeCallSid}"/>
      <Parameter name="call_id" value="${safeCallId}"/>
    </Stream>
  </Connect>
</Response>`;
};

const getTwimlLookupValue = (body: Record<string, unknown>, keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = body[key];
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value).trim();
    if (text) {
      return text;
    }
  }
  return undefined;
};

const handleTwilioTwiml = async (req: Request, res: Response<string>) => {
  const body = req.method === "GET" ? (req.query as Record<string, unknown>) : (req.body as Record<string, unknown>);
  const callSid = getTwimlLookupValue(body, ["CallSid", "callSid", "CallSID"]);
  const callId = getTwimlLookupValue(body, ["callId", "call_id", "CallId", "Call_ID", "session_call_id"]);
  const publicSessionId = getTwimlLookupValue(body, ["sessionId", "session_id", "sessionIdPublic", "public_id"]);
  const routeCallId = getTwimlLookupValue(
    { ...req.params } as Record<string, unknown>,
    ["callId", "sessionId"]
  );

  const lookup = {
    callId: callId ?? publicSessionId ?? routeCallId,
    providerCallSid: callSid
  };
  if (!lookup.callId && !lookup.providerCallSid) {
    res.status(422).type("text/plain").send("callId or CallSid is required");
    return;
  }

  try {
    const session = await learningSessionsRepository.getByTwilioLookup(lookup);
    if (!session) {
      res.status(404).type("text/plain").send("session_not_found");
      return;
    }

    const streamUrl = getMediaStreamUrl(req);
    const resolvedSid = lookup.providerCallSid ?? (session.callId ?? "");
    const xml = buildTwiml(streamUrl, session, resolvedSid);
    res.type("application/xml").status(200).send(xml);
  } catch {
    res.status(500).type("text/plain").send("failed_to_build_twiml");
  }
};

router.all("/twilio-twiml", handleTwilioTwiml);
router.all("/twilio-twiml/:callId", handleTwilioTwiml);

const InitiateCallSchema = z.object({
  sessionId: z.string().min(1),
  idempotencyKey: z.string().optional()
});

router.post("/initiate", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<StartCallResponse>>) => {
  const parsed = InitiateCallSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "sessionId is required" } });
    return;
  }

  const { sessionId, idempotencyKey: payloadIdempotencyKey } = parsed.data;
  const idempotencyKey = req.header("x-idempotency-key") || payloadIdempotencyKey || randomUUID();
  try {
    const data = await startWebVoiceSession(sessionId, req.clerkUserId, idempotencyKey);
    res.status(201).json({ ok: true, data });
  } catch (err) {
    if (err instanceof AppError && err.code === "INVALID_SESSION_STATE") {
      res.status(409).json({
        ok: false,
        error: { code: "conflict", message: "session is not in ready state for call start" }
      });
      return;
    }
    if (err instanceof AppError && err.code === "INSUFFICIENT_ALLOWANCE") {
      res.status(402).json({
        ok: false,
        error: { code: "insufficient_allowance", message: err.message }
      });
      return;
    }
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: "session_not_found" } });
      return;
    }
    if (err instanceof AppError && err.code === "USER_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: "session_not_found" } });
      return;
    }
    if (err instanceof AppError && err.code === "validation_error") {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: err.message } });
      return;
    }
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "unable_to_initiate_call" } });
  }
});

router.post("/:id/join", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<JoinCallResponse>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id is required" } });
    return;
  }

  try {
    const data = await joinWebVoiceSession(id, req.clerkUserId, String(req.header("x-idempotency-key") || randomUUID()));
    res.status(201).json({ ok: true, data });
  } catch (err) {
    if (err instanceof AppError && err.code === "INVALID_SESSION_STATE") {
      res.status(409).json({ ok: false, error: { code: "conflict", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "INSUFFICIENT_ALLOWANCE") {
      res.status(402).json({ ok: false, error: { code: "insufficient_allowance", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: "session_not_found" } });
      return;
    }
    if (err instanceof AppError && err.code === "validation_error") {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: err.message } });
      return;
    }
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "unable_to_join_call" } });
  }
});

router.post("/:id/runtime-event", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const { id } = req.params;
  const payload = req.body as Partial<WebVoiceRuntimeEventPayload>;
  if (!id || !payload.event) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id and event are required" } });
    return;
  }

  try {
    const data = await recordWebVoiceRuntimeEvent(id, req.clerkUserId, payload as WebVoiceRuntimeEventPayload);
    res.status(200).json({ ok: true, data });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: "session_not_found" } });
      return;
    }
    if (err instanceof AppError && (err.code === "validation_error" || err.code === "INVALID_SESSION_STATE")) {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: err.message } });
      return;
    }
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "failed_to_record_runtime_event" } });
  }
});

router.post("/:id/runtime-complete", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const { id } = req.params;
  const payload = req.body as Partial<CompleteWebVoiceCallPayload>;
  if (!id || !payload.endReason) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "session id and endReason are required" } });
    return;
  }

  try {
    const data = await completeWebVoiceSession(id, req.clerkUserId, payload as CompleteWebVoiceCallPayload);
    res.status(200).json({ ok: true, data });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: "session_not_found" } });
      return;
    }
    if (err instanceof AppError && err.code === "validation_error") {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: err.message } });
      return;
    }
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "failed_to_complete_web_voice_session" } });
  }
});

router.post("/twilio-status-callback", verifyTwilioSignature, async (req: Request, res: Response<ApiResponse<Session>>) => {
  const body = req.body as Record<string, unknown>;
  const callSid = String(body.callSid ?? body.CallSid ?? "").trim();
  const status = String(body.callStatus ?? body.CallStatus ?? body.status ?? body.Status ?? "").trim();
  const sequenceNumber = body.sequenceNumber ?? body.SequenceNumber;
  const sipResponseCode = body.sipResponseCode ?? body.SipResponseCode;
  const callDuration = body.callDuration ?? body.CallDuration;
  const errorCode = body.errorCode ?? body.ErrorCode;
  const answeredBy = (body.answeredBy ?? body.AnsweredBy) as string | undefined;

  if (!callSid || !status) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "callSid and status are required" } });
    return;
  }

  try {
    const session = await learningSessionsRepository.handleTwilioStatusCallback({
      callSid,
      status,
      sequenceNumber: sequenceNumber as string | number | null | undefined,
      sipResponseCode: sipResponseCode as string | number | null | undefined,
      callDuration: callDuration as string | number | null | undefined,
      errorCode: errorCode as string | number | null | undefined,
      answeredBy
    });
    res.status(200).json({ ok: true, data: session });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: err.message } });
      return;
    }
    if (err instanceof AppError && err.code === "validation_error") {
      res.status(422).json({ ok: false, error: { code: "validation_error", message: err.message } });
      return;
    }
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "failed_to_handle_status_callback" } });
  }
});

router.get("/:id", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "call id is required" } });
    return;
  }
  try {
    const session = await learningSessionsRepository.getByIdentifierForUser(req.clerkUserId, id);
    res.json({ ok: true, data: session });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: "call not found" } });
      return;
    }
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "failed_to_load_call" } });
  }
});

router.post("/:id/end", requireAuthenticatedUser, async (req: AuthenticatedRequest, res: Response<ApiResponse<Session>>) => {
  const { id } = req.params;
  if (!id) {
    res.status(422).json({ ok: false, error: { code: "validation_error", message: "call id is required" } });
    return;
  }
  try {
    const session = await store.endSessionCall(req.clerkUserId, id);
    res.json({ ok: true, data: session });
  } catch (err) {
    if (err instanceof AppError && err.code === "SESSION_NOT_FOUND") {
      res.status(404).json({ ok: false, error: { code: "not_found", message: "call not found" } });
      return;
    }
    if (err instanceof AppError && err.code === "INVALID_SESSION_STATE") {
      res.status(409).json({ ok: false, error: { code: "conflict", message: err.message } });
      return;
    }
    res.status(400).json({ ok: false, error: { code: "validation_error", message: "failed_to_end_call" } });
  }
});

export default router;

